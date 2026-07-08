// Twilio layer: all outbound SMS flows through sendSms() — the single compliance gate.
// Quiet hours, opt-out, and consent are enforced HERE, not in callers.

const twilio = require('twilio');
const { DateTime } = require('luxon');
const { normalizePhone, phoneCandidates } = require('./phone');

let client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
/** Test seam only — swap the Twilio client for a fake. Never call in production code. */
function _setClientForTests(fake) { client = fake; }

// Message kinds that are transactional (allowed without marketing consent, no opt-out footer)
const TRANSACTIONAL = new Set([
  'on_the_way', 'quote', 'invoice', 'invoice_reminder', 'reschedule', 'missed_call_textback', 'manual_reply'
]);

function renderTemplate(body, vars) {
  return body.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
}

function inQuietHours(business) {
  const tz = business.timezone || 'America/New_York';
  const now = DateTime.now().setZone(tz);
  const q = business.quiet_hours || { start: '20:00', end: '08:00' };
  const [qsH, qsM] = q.start.split(':').map(Number);
  const [qeH, qeM] = q.end.split(':').map(Number);
  const mins = now.hour * 60 + now.minute;
  const qs = qsH * 60 + qsM, qe = qeH * 60 + qeM;
  return qs > qe ? (mins >= qs || mins < qe) : (mins >= qs && mins < qe);
}

/**
 * The single send gate.
 * @param {object} db - supabase service client
 * @param {object} business - businesses row
 * @param {object} clientRow - clients row (nullable for unknown callers e.g. missed-call textback)
 * @param {string} kind - messages.kind value
 * @param {string} body - already-rendered message body
 * @param {string} toNumber
 * @returns {Promise<{sent: boolean, reason?: string}>}
 */
async function sendSms(db, business, clientRow, kind, body, toNumber) {
  const baseKind = kind.replace(/_d\d+$/, '').replace(/_reminder_.*/, '_reminder');
  const isTransactional = TRANSACTIONAL.has(baseKind) || TRANSACTIONAL.has(kind);

  // Gate 0: destination must normalize to E.164 — dirty imports die here, not at Twilio
  const to = normalizePhone(toNumber);
  if (!to) {
    return { sent: false, reason: 'invalid_number' };
  }

  // Gate 1: opt-out is absolute
  if (clientRow && clientRow.sms_opted_out) {
    return { sent: false, reason: 'opted_out' };
  }
  // Gate 2: marketing-class messages require consent on file
  if (!isTransactional && clientRow && !clientRow.sms_consent) {
    return { sent: false, reason: 'no_consent' };
  }
  // Gate 3: quiet hours — marketing waits, transactional sends
  if (!isTransactional && inQuietHours(business)) {
    return { sent: false, reason: 'quiet_hours' };
  }
  // Gate 4: A2P must be approved before any sending
  if (business.a2p_status !== 'approved') {
    return { sent: false, reason: 'a2p_pending' };
  }

  const finalBody = isTransactional ? body : `${body}\nReply STOP to opt out.`;

  const msg = await client.messages.create({
    body: finalBody,
    from: business.twilio_number,
    to,
    ...(process.env.PUBLIC_URL ? { statusCallback: process.env.PUBLIC_URL.replace(/\/$/, '') + '/webhooks/twilio/status' } : {})
  });

  await db.from('messages').insert({
    business_id: business.id,
    client_id: clientRow ? clientRow.id : null,
    direction: 'outbound',
    to_number: to,
    from_number: business.twilio_number,
    body: finalBody,
    kind,
    twilio_sid: msg.sid,
    status: 'sent'
  });

  return { sent: true };
}

/**
 * Missed-call handler. Conditional call forwarding (*61*) delivers ONLY
 * unanswered calls to the business's Twilio number — their real number
 * stays public everywhere. This fires on the Twilio voice webhook.
 */
async function handleMissedCall(db, business, callerNumber, callSid, templates, appUrl) {
  const caller = normalizePhone(callerNumber) || callerNumber;

  const { data: mc } = await db.from('missed_calls').insert({
    business_id: business.id,
    caller_number: caller,
    twilio_call_sid: callSid
  }).select().single();

  // Anonymous/blocked caller ID — nothing to text back to
  if (!normalizePhone(callerNumber)) return mc;

  // Frequency cap: don't re-text the same number within 7 days
  const { data: recent } = await db.from('missed_calls')
    .select('id')
    .eq('business_id', business.id)
    .eq('caller_number', caller)
    .eq('text_back_sent', true)
    .neq('id', mc.id)
    .gte('created_at', new Date(Date.now() - 7 * 864e5).toISOString());
  if (recent && recent.length > 0) return mc;

  // Existing client lookup (candidate matching hits legacy un-normalized rows too)
  const { data: matches } = await db.from('clients')
    .select('*')
    .eq('business_id', business.id)
    .in('phone', phoneCandidates(caller))
    .limit(1);
  const existing = (matches && matches[0]) || null;

  const body = renderTemplate(templates.missed_call_textback, {
    business_name: business.name,
    quote_form_link: `${appUrl}/q/${business.id}?src=mc&mc=${mc.id}`
  });

  const result = await sendSms(db, business, existing, 'missed_call_textback', body, caller);
  if (result.sent) {
    await db.from('missed_calls').update({
      text_back_sent: true,
      text_back_at: new Date().toISOString()
    }).eq('id', mc.id);
  }
  return mc;
}

/**
 * Inbound SMS handler: STOP/START keywords, then log for the owner's inbox.
 */
async function handleInboundSms(db, business, fromNumber, body) {
  const normalized = body.trim().toUpperCase();
  const from = normalizePhone(fromNumber) || fromNumber;

  const { data: matches } = await db.from('clients')
    .select('*')
    .eq('business_id', business.id)
    .in('phone', phoneCandidates(from))
    .limit(1);
  const clientRow = (matches && matches[0]) || null;

  if (['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT'].includes(normalized)) {
    if (clientRow) {
      await db.from('clients').update({ sms_opted_out: true }).eq('id', clientRow.id);
      // Cancel every pending follow-up for this client
      await db.from('followup_steps')
        .update({ status: 'cancelled' })
        .eq('client_id', clientRow.id)
        .eq('status', 'pending');
    }
    return { optOut: true };
  }

  if (['START', 'UNSTOP', 'YES'].includes(normalized) && clientRow && clientRow.sms_opted_out) {
    await db.from('clients').update({ sms_opted_out: false }).eq('id', clientRow.id);
  }

  await db.from('messages').insert({
    business_id: business.id,
    client_id: clientRow ? clientRow.id : null,
    direction: 'inbound',
    to_number: business.twilio_number,
    from_number: from,
    body,
    kind: 'inbound',
    status: 'delivered'
  });

  return { optOut: false };
}

module.exports = { sendSms, renderTemplate, handleMissedCall, handleInboundSms, inQuietHours, _setClientForTests };
