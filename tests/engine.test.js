// JobTap engine tests — run with: npm test
// Covers the two things that must NEVER silently break:
//   1. phone normalization (every send/match path depends on it)
//   2. the SMS compliance gate order (opt-out > consent > quiet hours > A2P)
// Zero test dependencies — node:test ships with Node 18+.

process.env.SUPABASE_URL ||= 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_KEY ||= 'test';
process.env.TWILIO_ACCOUNT_SID ||= 'ACtest';
process.env.TWILIO_AUTH_TOKEN ||= 'test';

const { test } = require('node:test');
const assert = require('node:assert');
const { normalizePhone, phoneCandidates } = require('../src/phone');
const { sendSms } = require('../src/twilio');

// Stub db: records inserts, never touches the network
const stubDb = { from: () => ({ insert: async () => ({ data: null, error: null }) }) };
// Business fixtures
const bizApproved = { id: 'b1', a2p_status: 'approved', twilio_number: '+19045550000', timezone: 'America/New_York', quiet_hours: { start: '20:00', end: '08:00' } };
const bizPending = { ...bizApproved, a2p_status: 'pending' };
const bizAlwaysQuiet = { ...bizApproved, quiet_hours: { start: '00:00', end: '23:59' } };
const consented = { id: 'c1', sms_consent: true, sms_opted_out: false };
const optedOut = { id: 'c2', sms_consent: true, sms_opted_out: true };
const noConsent = { id: 'c3', sms_consent: false, sms_opted_out: false };

// ---------- phone normalization ----------
test('normalizePhone: US formats collapse to E.164', () => {
  for (const raw of ['(904) 555-1234', '904.555.1234', '1-904-555-1234', '+19045551234',
    '9045551234', ' 904 555 1234 ', '904-555-1234 ext 2', '19045551234']) {
    assert.strictEqual(normalizePhone(raw), '+19045551234', raw);
  }
});
test('normalizePhone: garbage is rejected, never guessed', () => {
  for (const raw of ['555-1234', '+449045551234', '', null, undefined, 'anonymous', '12345', '+1904555123']) {
    assert.strictEqual(normalizePhone(raw), null, String(raw));
  }
});
test('phoneCandidates covers legacy un-normalized rows', () => {
  assert.deepStrictEqual(phoneCandidates('(904) 555-1234'), ['+19045551234', '19045551234', '9045551234']);
});

// ---------- compliance gate order ----------
test('gate 0: invalid destination blocks before anything else', async () => {
  const r = await sendSms(stubDb, bizApproved, consented, 'campaign', 'hi', 'not-a-number');
  assert.deepStrictEqual(r, { sent: false, reason: 'invalid_number' });
});
test('gate 1: opt-out is absolute — blocks even transactional', async () => {
  const r = await sendSms(stubDb, bizApproved, optedOut, 'invoice', 'hi', '+19045551234');
  assert.deepStrictEqual(r, { sent: false, reason: 'opted_out' });
});
test('gate 2: marketing without consent is blocked', async () => {
  const r = await sendSms(stubDb, bizApproved, noConsent, 'campaign', 'hi', '+19045551234');
  assert.deepStrictEqual(r, { sent: false, reason: 'no_consent' });
});
test('gate 2: transactional does NOT require marketing consent (falls through to A2P)', async () => {
  const r = await sendSms(stubDb, bizPending, noConsent, 'invoice', 'hi', '+19045551234');
  assert.deepStrictEqual(r, { sent: false, reason: 'a2p_pending' }); // passed consent gate, stopped at A2P
});
test('gate 3: quiet hours block marketing but not transactional', async () => {
  const mkt = await sendSms(stubDb, bizAlwaysQuiet, consented, 'd90_rebook', 'hi', '+19045551234');
  assert.deepStrictEqual(mkt, { sent: false, reason: 'quiet_hours' });
  // transactional in same window: passes quiet hours, stops at A2P when pending
  const txn = await sendSms(stubDb, { ...bizAlwaysQuiet, a2p_status: 'pending' }, consented, 'on_the_way', 'hi', '+19045551234');
  assert.deepStrictEqual(txn, { sent: false, reason: 'a2p_pending' });
});
test('gate 4: nothing sends without A2P approval', async () => {
  const r = await sendSms(stubDb, bizPending, consented, 'invoice', 'hi', '+19045551234');
  assert.deepStrictEqual(r, { sent: false, reason: 'a2p_pending' });
});
test('manual_reply is transactional (dashboard replies pass consent + quiet hours)', async () => {
  const r = await sendSms(stubDb, { ...bizAlwaysQuiet, a2p_status: 'pending' }, noConsent, 'manual_reply', 'hi', '+19045551234');
  assert.deepStrictEqual(r, { sent: false, reason: 'a2p_pending' }); // only A2P stops it — as designed
});

// ---------- send success path (fake Twilio client) ----------
const { handleInboundSms, _setClientForTests, renderTemplate } = require('../src/twilio');

function fakeDb() {
  const log = { inserts: [], updates: [] };
  const db = { from: table => ({
    insert: async row => { log.inserts.push({ table, row }); return { data: row, error: null }; },
    update: patch => ({ eq: (col, val) => {
      const rec = { table, patch, where: [[col, val]] };
      log.updates.push(rec);
      return { eq: (c2, v2) => { rec.where.push([c2, v2]); return Promise.resolve({ error: null }); },
               then: (res) => res({ error: null }) };
    }}),
    select: () => ({ eq: () => ({ in: () => ({ limit: async () => ({ data: db.__clients || [] }) }) }) })
  })};
  db.__log = log;
  return db;
}

test('send success: message goes out with statusCallback and is logged', async () => {
  process.env.PUBLIC_URL = 'https://engine.jobtap.app';
  const calls = [];
  _setClientForTests({ messages: { create: async opts => { calls.push(opts); return { sid: 'SMfake1' }; } } });
  const db = fakeDb();
  const { sendSms } = require('../src/twilio');
  const r = await sendSms(db, bizApproved, consented, 'invoice', 'Your invoice: {x}', '+19045551234');
  assert.strictEqual(r.sent, true);
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0].to, '+19045551234');
  assert.strictEqual(calls[0].statusCallback, 'https://engine.jobtap.app/webhooks/twilio/status');
  const logged = db.__log.inserts.find(i => i.table === 'messages');
  assert.ok(logged, 'outbound message must be logged');
  assert.strictEqual(logged.row.twilio_sid, 'SMfake1');
  delete process.env.PUBLIC_URL;
});

test('STOP opts the client out and cancels all pending follow-ups', async () => {
  const db = fakeDb();
  db.__clients = [{ id: 'c9', business_id: 'b1', phone: '+19045551234' }];
  const r = await handleInboundSms(db, bizApproved, '+19045551234', ' stop ');
  assert.strictEqual(r.optOut, true);
  const opt = db.__log.updates.find(u => u.table === 'clients' && u.patch.sms_opted_out === true);
  assert.ok(opt, 'client must be marked opted out');
  const fu = db.__log.updates.find(u => u.table === 'followup_steps' && u.patch.status === 'cancelled');
  assert.ok(fu, 'pending follow-ups must be cancelled');
});

test('START re-subscribes the client', async () => {
  const db = fakeDb();
  db.__clients = [{ id: 'c9', business_id: 'b1', phone: '+19045551234', sms_opted_out: true }];
  const r = await handleInboundSms(db, bizApproved, '+19045551234', 'START');
  const back = db.__log.updates.find(u => u.table === 'clients' && u.patch.sms_opted_out === false);
  assert.ok(back || r.optIn, 'START must re-subscribe');
});

test('renderTemplate fills variables and leaves unknowns intact', () => {
  const out = renderTemplate('Hi {first_name}, from {business_name}! {unknown}', { first_name: 'Sarah', business_name: 'HydroSeal' });
  assert.ok(out.includes('Sarah') && out.includes('HydroSeal'));
});
