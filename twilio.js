// JobTap Engine — Express server.
// Webhooks: Twilio voice (missed calls), Twilio SMS (inbound/STOP), Stripe (payments/subs).
// Public endpoints: quote-request form (missed-call recovery landing), quote/invoice portal data.
// Internal: on-the-way trigger (logs mileage for Tax Drop as a side effect).

const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const Stripe = require('stripe');
const { handleMissedCall, handleInboundSms, sendSms, renderTemplate } = require('./twilio');
const defaults = require('./templates');
const { runAll } = require('./scheduler');
const { requireAuth, assertBusinessAccess, twilioSignature } = require('./auth');
const { normalizePhone } = require('./phone');
const { mountQuoteForm } = require('./quoteForm');

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const APP_URL = process.env.APP_URL || 'https://jobtap.app';

const app = express();
app.use('/webhooks/stripe', express.raw({ type: 'application/json' }));
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

async function businessByTwilioNumber(num) {
  const { data } = await db.from('businesses').select('*').eq('twilio_number', num).maybeSingle();
  return data;
}

// ---------- TWILIO: VOICE (conditional-forwarded missed calls land here) ----------
app.post('/webhooks/twilio/voice', twilioSignature, async (req, res) => {
  const business = await businessByTwilioNumber(req.body.To);
  if (business) {
    handleMissedCall(db, business, req.body.From, req.body.CallSid, defaults, APP_URL)
      .catch(e => console.error('missed_call:', e.message));
  }
  // Play a brief voicemail prompt so the caller isn't dropped cold
  res.type('text/xml').send(
    `<Response><Say voice="Polly.Matthew">Hi, you have reached ${business ? business.name : 'us'}. ` +
    `We are on a job right now, but we are texting you as we speak and will call you right back. ` +
    `You can also leave a message after the tone.</Say><Record maxLength="120" playBeep="true"/></Response>`
  );
});

// ---------- TWILIO: INBOUND SMS (STOP handling + owner inbox) ----------
app.post('/webhooks/twilio/sms', twilioSignature, async (req, res) => {
  const business = await businessByTwilioNumber(req.body.To);
  if (business) {
    await handleInboundSms(db, business, req.body.From, req.body.Body || '');
  }
  res.type('text/xml').send('<Response/>');
});

// ---------- PUBLIC: quote-request form submit (missed-call recovery landing) ----------
// Light in-memory rate limit: 10 submits / 10 min / IP. Public endpoint, no auth by design.
const quoteHits = new Map();
function quoteRateLimited(ip) {
  const now = Date.now();
  const hits = (quoteHits.get(ip) || []).filter(t => now - t < 10 * 60 * 1000);
  hits.push(now);
  quoteHits.set(ip, hits);
  if (quoteHits.size > 5000) quoteHits.clear(); // crude memory cap
  return hits.length > 10;
}

app.post('/api/public/quote-request', async (req, res) => {
  const { business_id, name, address, service, message, missed_call_id } = req.body;
  const phone = normalizePhone(req.body.phone);
  if (!business_id) return res.status(400).json({ error: 'missing fields' });
  if (!phone) return res.status(400).json({ error: 'invalid phone' });
  if (quoteRateLimited(req.ip)) return res.status(429).json({ error: 'too many requests' });

  // Verify the business exists before creating anything against its id
  const { data: biz } = await db.from('businesses').select('id').eq('id', business_id).maybeSingle();
  if (!biz) return res.status(404).json({ error: 'unknown business' });

  // Consent: the form includes explicit SMS-consent language; submitting = consent
  let { data: clientRow } = await db.from('clients')
    .select('*').eq('business_id', business_id).eq('phone', phone).maybeSingle();
  if (!clientRow) {
    const parts = (name || '').split(' ');
    ({ data: clientRow } = await db.from('clients').insert({
      business_id,
      first_name: parts[0] || 'New',
      last_name: parts.slice(1).join(' ') || null,
      phone,
      sms_consent: true,
      sms_consent_source: 'quote_form',
      sms_consent_at: new Date().toISOString(),
      source: missed_call_id ? 'missed_call' : 'quote_form'
    }).select().single());
  }

  const { data: lead } = await db.from('leads').insert({
    business_id, client_id: clientRow.id,
    name, phone, address,
    service_requested: service, message,
    source: missed_call_id ? 'missed_call' : 'quote_form'
  }).select().single();

  if (missed_call_id) {
    await db.from('missed_calls').update({ lead_id: lead.id }).eq('id', missed_call_id);
  }
  if (address) {
    await db.from('properties').insert({ client_id: clientRow.id, business_id, address });
  }
  res.json({ ok: true, lead_id: lead.id });
});

// Small helper: route errors carrying .status become clean JSON responses
function fail(res, e) {
  const status = e.status || 500;
  if (status === 500) console.error('route:', e.message);
  return res.status(status).json({ error: status === 500 ? 'internal error' : e.message });
}

// ---------- INTERNAL: on-the-way (fires text + logs mileage for Tax Drop) ----------
// Called by the app/dashboard when the owner taps Navigate.
app.post('/api/jobs/:id/on-the-way', requireAuth, async (req, res) => {
  try {
  const { eta_minutes, from_address, miles } = req.body;
  const { data: job } = await db.from('jobs')
    .select('*, clients(*), businesses(*), properties(*)').eq('id', req.params.id).single();
  if (!job) return res.status(404).json({ error: 'job not found' });
  await assertBusinessAccess(req, job.businesses);

  const business = job.businesses, clientRow = job.clients;
  const tplRow = await db.from('message_templates')
    .select('body').eq('business_id', business.id).eq('key', 'on_the_way').maybeSingle();
  const tpl = (tplRow.data && tplRow.data.body) || defaults.on_the_way;
  const body = renderTemplate(tpl, {
    first_name: clientRow.first_name,
    business_name: business.name,
    eta: eta_minutes ? `${eta_minutes} minutes` : 'shortly'
  });
  const result = await sendSms(db, business, clientRow, 'on_the_way', body, clientRow.phone);

  await db.from('jobs').update({
    status: 'en_route',
    en_route_at: new Date().toISOString(),
    on_the_way_sent: result.sent
  }).eq('id', job.id);

  // TAX DROP side effect: navigation = an IRS-compliant mileage entry, zero extra taps
  if (miles) {
    await db.from('mileage_events').insert({
      business_id: business.id,
      job_id: job.id,
      from_address: from_address || null,
      to_address: job.properties ? job.properties.address : null,
      miles: Number(miles),
      source: 'auto_navigate'
    });
  }
  res.json({ ok: true, text_sent: result.sent });
  } catch (e) { return fail(res, e); }
});

// ---------- INTERNAL: send a quote / invoice ----------
app.post('/api/quotes/:id/send', requireAuth, async (req, res) => {
  try {
  const { data: q } = await db.from('quotes')
    .select('*, clients(*), businesses(*)').eq('id', req.params.id).single();
  if (!q) return res.status(404).json({ error: 'not found' });
  await assertBusinessAccess(req, q.businesses);
  const body = renderTemplate(defaults.quote, {
    first_name: q.clients.first_name,
    business_name: q.businesses.name,
    quote_link: `${APP_URL}/p/quote/${q.public_token}`
  });
  const result = await sendSms(db, q.businesses, q.clients, 'quote', body, q.clients.phone);
  const now = new Date().toISOString();
  await db.from('quotes').update(result.sent
    ? { status: 'sent', sent_at: now, last_send_attempt_at: now, last_send_error: null }
    : { last_send_attempt_at: now, last_send_error: result.reason || 'unknown' }).eq('id', q.id);
  res.json({ ok: true, text_sent: result.sent, reason: result.reason || null, status: result.sent ? 'sent' : 'draft' });
  } catch (e) { return fail(res, e); }
});

app.post('/api/invoices/:id/send', requireAuth, async (req, res) => {
  try {
  const { data: inv } = await db.from('invoices')
    .select('*, clients(*), businesses(*)').eq('id', req.params.id).single();
  if (!inv) return res.status(404).json({ error: 'not found' });
  await assertBusinessAccess(req, inv.businesses);

  // Create a Stripe payment link on the connected account
  let payLink = inv.stripe_payment_link;
  if (!payLink && inv.businesses.stripe_account_id) {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: { name: `Invoice — ${inv.businesses.name}` },
          unit_amount: Math.round(Number(inv.total) * 100)
        },
        quantity: 1
      }],
      payment_intent_data: {
        application_fee_amount: Math.round(Number(inv.total) * 100 * 0.004), // JobTap margin
        metadata: { invoice_id: inv.id }
      },
      metadata: { invoice_id: inv.id },
      success_url: `${APP_URL}/p/invoice/${inv.public_token}?paid=1`,
      cancel_url: `${APP_URL}/p/invoice/${inv.public_token}`
    }, { stripeAccount: inv.businesses.stripe_account_id });
    payLink = session.url;
    await db.from('invoices').update({ stripe_payment_link: payLink }).eq('id', inv.id);
  }

  const body = renderTemplate(defaults.invoice, {
    first_name: inv.clients.first_name,
    business_name: inv.businesses.name,
    amount: `$${Number(inv.total).toFixed(2)}`,
    pay_link: payLink || `${APP_URL}/p/invoice/${inv.public_token}`
  });
  const result = await sendSms(db, inv.businesses, inv.clients, 'invoice', body, inv.clients.phone);
  const now = new Date().toISOString();
  await db.from('invoices').update(result.sent
    ? { status: 'sent', sent_at: now, last_send_attempt_at: now, last_send_error: null }
    : { last_send_attempt_at: now, last_send_error: result.reason || 'unknown' }).eq('id', inv.id);
  res.json({ ok: true, text_sent: result.sent, reason: result.reason || null, status: result.sent ? 'sent' : 'draft', pay_link: payLink });
  } catch (e) { return fail(res, e); }
});

// ---------- STRIPE WEBHOOK (payment received → mark paid → trigger fires the year) ----------
app.post('/webhooks/stripe', async (req, res) => {
  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    return res.status(400).send(`Webhook error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const invoiceId = session.metadata && session.metadata.invoice_id;
    if (invoiceId) {
      const { data: seen } = await db.from('payments').select('id').eq('stripe_event_id', event.id).maybeSingle();
      const { data: inv } = await db.from('invoices').select('*').eq('id', invoiceId).single();
      if (inv && !seen) {
        await db.from('payments').insert({
          stripe_event_id: event.id,
          business_id: inv.business_id,
          invoice_id: inv.id,
          amount: session.amount_total / 100,
          method: 'card',
          stripe_payment_intent: session.payment_intent
        });
        // This update fires the on_invoice_paid trigger → the year of follow-ups
        await db.from('invoices').update({
          status: 'paid',
          amount_paid: session.amount_total / 100,
          paid_at: new Date().toISOString()
        }).eq('id', inv.id);
      }
    }
  }
  res.json({ received: true });
});

// ---------- TAX DROP: the one-tap year package (data endpoint) ----------
app.get('/api/tax-drop/:businessId/:year', requireAuth, async (req, res) => {
  try {
  const { businessId, year } = req.params;
  await assertBusinessAccess(req, businessId);
  const start = `${year}-01-01`, end = `${year}-12-31`;

  const [{ data: pays }, { data: recs }, { data: miles }] = await Promise.all([
    db.from('payments').select('amount, tip, method, created_at')
      .eq('business_id', businessId).gte('created_at', start).lte('created_at', `${end}T23:59:59`),
    db.from('receipts').select('vendor, amount, date, tax_category')
      .eq('business_id', businessId).gte('date', start).lte('date', end),
    db.from('mileage_events').select('date, miles, from_address, to_address')
      .eq('business_id', businessId).gte('date', start).lte('date', end)
  ]);

  const income = (pays || []).reduce((s, p) => s + Number(p.amount) + Number(p.tip || 0), 0);
  const expensesByCategory = {};
  for (const r of recs || []) {
    const cat = r.tax_category || 'other';
    expensesByCategory[cat] = (expensesByCategory[cat] || 0) + Number(r.amount || 0);
  }
  const totalMiles = (miles || []).reduce((s, m) => s + Number(m.miles), 0);
  const totalExpenses = Object.values(expensesByCategory).reduce((s, v) => s + v, 0);

  res.json({
    year: Number(year),
    gross_income: Math.round(income * 100) / 100,
    expenses_by_schedule_c_category: expensesByCategory,
    total_expenses: Math.round(totalExpenses * 100) / 100,
    total_business_miles: Math.round(totalMiles * 10) / 10,
    mileage_log: miles,
    receipt_count: (recs || []).length,
    note: 'Generated by JobTap Tax Drop. Hand this to your tax professional. Not tax advice.'
  });
  } catch (e) { return fail(res, e); }
});

// ---------- PUBLIC: quote-request landing page (/q/:businessId) ----------
mountQuoteForm(app, db);

// ---------- PUBLIC: client portal (/p/quote/:token, /p/invoice/:token) ----------
const { mountPortal } = require('./portal');
mountPortal(app, db);

// ---------- INTERNAL: manual mark-paid (cash / check / Zelle / card reader) ----------
// Setting status='paid' + paid_at fires the DB trigger → year of follow-ups.
app.post('/api/invoices/:id/mark-paid', requireAuth, async (req, res) => {
  try {
    const { data: inv } = await db.from('invoices')
      .select('*, businesses(id,owner_id)').eq('id', req.params.id).single();
    if (!inv) return res.status(404).json({ error: 'not found' });
    await assertBusinessAccess(req, inv.businesses);
    if (inv.status === 'paid') return res.json({ ok: true, already: true });

    const method = ['cash', 'check', 'card', 'ach', 'zelle', 'venmo', 'other'].includes(req.body.method)
      ? req.body.method : 'cash';
    const balance = Number(inv.total) - Number(inv.amount_paid || 0);
    const amount = Number(req.body.amount) > 0 ? Math.min(Number(req.body.amount), balance) : balance;
    const paidInFull = (Number(inv.amount_paid || 0) + amount) >= Number(inv.total) - 0.005;

    await db.from('payments').insert({
      business_id: inv.business_id, invoice_id: inv.id, amount, method
    });
    await db.from('invoices').update({
      amount_paid: Number(inv.amount_paid || 0) + amount,
      status: paidInFull ? 'paid' : 'partial',
      paid_at: paidInFull ? new Date().toISOString() : null
    }).eq('id', inv.id);

    res.json({ ok: true, status: paidInFull ? 'paid' : 'partial', followups_started: paidInFull });
  } catch (e) { return fail(res, e); }
});

// ---------- INTERNAL: manual SMS reply from the dashboard Texts screen ----------
app.post('/api/messages/send', requireAuth, async (req, res) => {
  try {
    const { to, client_id, body } = req.body;
    if (!to || !body) return res.status(400).json({ error: 'missing to/body' });
    // Resolve the caller's business (user JWT path) or accept business_id (api key path)
    let business;
    if (req.auth.type === 'user') {
      const { data } = await db.from('businesses').select('*').eq('owner_id', req.auth.userId).limit(1).maybeSingle();
      business = data;
    } else {
      const { data } = await db.from('businesses').select('*').eq('id', req.body.business_id).maybeSingle();
      business = data;
    }
    if (!business) return res.status(404).json({ error: 'business not found' });

    let clientRow = null;
    if (client_id) {
      const { data } = await db.from('clients').select('*').eq('id', client_id).eq('business_id', business.id).maybeSingle();
      clientRow = data;
    }
    // Owner-typed replies to an active thread are conversational/transactional
    const result = await sendSms(db, business, clientRow, 'manual_reply', body, to);
    res.json({ ok: true, text_sent: result.sent, reason: result.reason });
  } catch (e) { return fail(res, e); }
});

// ---------- TWILIO: delivery status callbacks (sent → delivered/failed/undelivered) ----------
app.post('/webhooks/twilio/status', twilioSignature, async (req, res) => {
  const { MessageSid, MessageStatus } = req.body || {};
  if (MessageSid && MessageStatus) {
    await db.from('messages').update({ status: MessageStatus }).eq('twilio_sid', MessageSid);
  }
  res.sendStatus(204);
});

// ---------- PUBLIC: review click-tracking redirect ----------
// The texted review link is /r/<review_request_id>; first click stamps clicked_at,
// then 302s to the business's real Google/Facebook review page.
app.get('/r/:id', async (req, res) => {
  const { data: rr } = await db.from('review_requests')
    .select('*, businesses(review_link_google, review_link_facebook, review_destination, settings)')
    .eq('id', req.params.id).maybeSingle();
  if (!rr) return res.status(404).send('Not found');
  const b = rr.businesses;
  const dest = rr.destination || (b.settings && b.settings.review_default) || b.review_destination || 'google';
  const link = dest === 'facebook'
    ? (b.review_link_facebook || b.review_link_google)
    : (b.review_link_google || b.review_link_facebook);
  if (!rr.clicked_at) {
    await db.from('review_requests').update({
      status: rr.status === 'reviewed' ? 'reviewed' : 'clicked',
      clicked_at: new Date().toISOString()
    }).eq('id', rr.id);
  }
  if (!link) return res.status(404).send('Review link not configured');
  res.redirect(302, link);
});

// ---------- DASHBOARD: single-file SPA at /app ----------
const fs = require('fs');
const path = require('path');
let dashboardHtml = null;
app.get('/app', (_req, res) => {
  if (!dashboardHtml) {
    dashboardHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.html'), 'utf8')
      .replace('__SUPABASE_URL__', process.env.SUPABASE_URL || '')
      .replace('__SUPABASE_ANON_KEY__', process.env.SUPABASE_ANON_KEY || '');
  }
  res.type('html').send(dashboardHtml);
});

app.get('/health', (_req, res) => res.json({ ok: true, service: 'jobtap-engine' }));

// Scheduler: in-process every 5 minutes (or run src/scheduler.js as a Railway cron instead)
if (process.env.RUN_SCHEDULER !== 'false') {
  setInterval(() => runAll().catch(e => console.error(e)), 5 * 60 * 1000);
  runAll().catch(e => console.error(e));
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`JobTap engine listening on :${PORT}`));
