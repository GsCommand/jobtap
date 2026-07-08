// THE ENGINE. Runs every 5 minutes (Railway cron or setInterval in index.js).
// Four sweeps: follow-up steps, quote follow-ups, unpaid invoice reminders, care-plan visits.
// This file is why JobTap works even if the app is never opened.

const { createClient } = require('@supabase/supabase-js');
const { sendSms, renderTemplate } = require('./twilio');
const defaults = require('./templates');

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const APP_URL = process.env.APP_URL || 'https://jobtap.app';

async function getTemplate(businessId, key) {
  const { data } = await db.from('message_templates')
    .select('body').eq('business_id', businessId).eq('key', key).eq('active', true).maybeSingle();
  return data ? data.body : (defaults[key] || null);
}

function vars(business, clientRow, extra = {}) {
  return {
    first_name: clientRow.first_name,
    business_name: business.name,
    business_phone: business.phone,
    review_link: ((business.settings && business.settings.review_default) || business.review_destination) === 'facebook'
      ? (business.review_link_facebook || business.review_link_google)
      : (business.review_link_google || business.review_link_facebook),
    ...extra
  };
}

// ---- Sweep 1: year-round follow-up steps ----
async function sweepFollowups() {
  const { data: due } = await db.from('followup_steps')
    .select('*, clients(*), businesses(*)')
    .eq('status', 'pending')
    .lte('due_at', new Date().toISOString())
    .limit(200);

  for (const step of due || []) {
    const business = step.businesses, clientRow = step.clients;
    const tpl = await getTemplate(business.id, step.step_key);
    if (!tpl || !clientRow.phone) {
      await db.from('followup_steps').update({ status: 'skipped' }).eq('id', step.id);
      continue;
    }
    const v = vars(business, clientRow);
    let reviewReq = null;
    if (step.step_key === 'd3_review' && process.env.PUBLIC_URL) {
      // Pre-create the request so its id becomes the click-tracking token
      const dest = (business.settings && business.settings.review_default) || business.review_destination || 'google';
      const { data: rr } = await db.from('review_requests').insert({
        business_id: business.id, client_id: clientRow.id, job_id: step.job_id, status: 'pending', destination: dest
      }).select().single();
      if (rr) { reviewReq = rr; v.review_link = `${process.env.PUBLIC_URL.replace(/\/$/, '')}/r/${rr.id}`; }
    }
    const body = renderTemplate(tpl, v);
    const result = await sendSms(db, business, clientRow, `followup_${step.step_key}`, body, clientRow.phone);
    if (result.sent) {
      await db.from('followup_steps').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', step.id);
      if (step.step_key === 'd3_review') {
        if (reviewReq) {
          await db.from('review_requests').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', reviewReq.id);
        } else {
          await db.from('review_requests').insert({
            business_id: business.id, client_id: clientRow.id, job_id: step.job_id,
            status: 'sent', sent_at: new Date().toISOString()
          });
        }
      }
    } else if (['opted_out', 'no_consent'].includes(result.reason)) {
      await db.from('followup_steps').update({ status: 'cancelled' }).eq('id', step.id);
    }
    // quiet_hours / a2p_pending: leave pending, retried next sweep
  }
}

// ---- Sweep 2: quote follow-ups (Day 1 / 3 / 7 after send) ----
const QUOTE_STEPS = [
  { step: 1, afterDays: 1, key: 'quote_followup_d1' },
  { step: 2, afterDays: 3, key: 'quote_followup_d3' },
  { step: 3, afterDays: 7, key: 'quote_followup_d7' }
];

async function sweepQuoteFollowups() {
  const { data: quotes } = await db.from('quotes')
    .select('*, clients(*), businesses(*)')
    .eq('status', 'sent')
    .eq('followups_enabled', true)
    .lt('followup_step', 3)
    .limit(200);

  for (const q of quotes || []) {
    const next = QUOTE_STEPS.find(s => s.step === q.followup_step + 1);
    const dueAt = new Date(new Date(q.sent_at).getTime() + next.afterDays * 864e5);
    if (dueAt > new Date()) continue;

    const business = q.businesses, clientRow = q.clients;
    const tpl = await getTemplate(business.id, next.key);
    const body = renderTemplate(tpl, vars(business, clientRow, {
      quote_link: `${APP_URL}/p/quote/${q.public_token}`
    }));
    const result = await sendSms(db, business, clientRow, next.key, body, clientRow.phone);
    if (result.sent || ['opted_out', 'no_consent'].includes(result.reason)) {
      await db.from('quotes').update({ followup_step: next.step }).eq('id', q.id);
    }
  }
}

// ---- Sweep 3: unpaid invoice reminders (Day 3 / 7 / 14 after send) ----
const INVOICE_STEPS = [
  { step: 1, afterDays: 3, key: 'invoice_reminder_d3' },
  { step: 2, afterDays: 7, key: 'invoice_reminder_d7' },
  { step: 3, afterDays: 14, key: 'invoice_reminder_d14' }
];

async function sweepInvoiceReminders() {
  const { data: invoices } = await db.from('invoices')
    .select('*, clients(*), businesses(*)')
    .in('status', ['sent', 'partial'])
    .eq('reminders_enabled', true)
    .lt('reminder_step', 3)
    .limit(200);

  for (const inv of invoices || []) {
    const next = INVOICE_STEPS.find(s => s.step === inv.reminder_step + 1);
    const dueAt = new Date(new Date(inv.sent_at).getTime() + next.afterDays * 864e5);
    if (dueAt > new Date()) continue;

    const business = inv.businesses, clientRow = inv.clients;
    const tpl = await getTemplate(business.id, next.key);
    const body = renderTemplate(tpl, vars(business, clientRow, {
      amount: `$${Number(inv.total - inv.amount_paid).toFixed(2)}`,
      pay_link: `${APP_URL}/p/invoice/${inv.public_token}`
    }));
    const result = await sendSms(db, business, clientRow, next.key, body, clientRow.phone);
    if (result.sent || ['opted_out'].includes(result.reason)) {
      await db.from('invoices').update({ reminder_step: next.step }).eq('id', inv.id);
    }
  }
}

// ---- Sweep 4: care-plan visits due within 7 days → auto-create the job ----
// ---------- 5. Campaigns: send scheduled blasts to consented clients ----------
async function sweepCampaigns() {
  const BATCH = 50; // throttle: max sends per campaign per sweep — resumes next sweep
  const { data: due } = await db.from('campaigns')
    .select('*, businesses(*)')
    .in('status', ['scheduled', 'sending'])
    .lte('scheduled_at', new Date().toISOString())
    .limit(10);

  for (const c of due || []) {
    if (c.status === 'scheduled') await db.from('campaigns').update({ status: 'sending' }).eq('id', c.id);

    // Audience: consented, not opted out, not archived
    let query = db.from('clients').select('*')
      .eq('business_id', c.business_id)
      .eq('sms_consent', true)
      .eq('sms_opted_out', false)
      .is('archived_at', null)
      .limit(2000);
    if (c.audience && c.audience.vip_only) query = query.eq('is_vip', true);
    const { data: clients } = await query;

    // Resumable: skip anyone already messaged for this campaign
    const kind = 'campaign_' + c.kind;
    const { data: already } = await db.from('messages')
      .select('client_id')
      .eq('business_id', c.business_id)
      .eq('kind', kind)
      .gte('created_at', c.created_at);
    const doneIds = new Set((already || []).map(m => m.client_id));
    const remaining = (clients || []).filter(cl => !doneIds.has(cl.id));

    let sent = 0, failed = 0, skipped = 0, a2pBlocked = false;
    for (const cl of remaining.slice(0, BATCH)) {
      const body = renderTemplate(c.template_body, {
        first_name: cl.first_name, business_name: c.businesses.name
      });
      const r = await sendSms(db, c.businesses, cl, kind, body, cl.phone);
      if (r.sent) sent++;
      else if (r.reason === 'a2p_pending') { a2pBlocked = true; break; }
      else if (r.reason === 'quiet_hours') { skipped++; break; } // whole business is quiet; resume next sweep
      else if (r.reason === 'invalid_number') failed++;
      else skipped++;
    }

    const finished = !a2pBlocked && remaining.length <= BATCH &&
      !remaining.slice(0, BATCH).some((_, idx) => false); // finished when this batch covered everyone left
    await db.from('campaigns').update({
      status: (remaining.length - sent - failed - skipped) <= 0 && !a2pBlocked ? 'sent' : 'sending',
      sent_count: (c.sent_count || 0) + sent,
      failed_count: (c.failed_count || 0) + failed,
      skipped_count: (c.skipped_count || 0) + skipped
    }).eq('id', c.id);
  }
}

async function sweepCareVisits() {
  const horizon = new Date(Date.now() + 7 * 864e5).toISOString();
  const { data: enrollments } = await db.from('care_enrollments')
    .select('*, care_plans(*), clients(*)')
    .eq('status', 'active')
    .lte('next_visit_at', horizon)
    .limit(100);

  for (const e of enrollments || []) {
    // Dupe guard: if a job already exists for this client at this exact visit time,
    // a previous (possibly crashed) sweep already created it — just advance the date.
    const { data: dupe } = await db.from('jobs')
      .select('id')
      .eq('business_id', e.business_id)
      .eq('client_id', e.client_id)
      .eq('scheduled_at', e.next_visit_at)
      .limit(1);
    if (!dupe || dupe.length === 0) {
      await db.from('jobs').insert({
        business_id: e.business_id,
        client_id: e.client_id,
        title: `${e.care_plans.name} — plan visit`,
        status: 'scheduled',
        scheduled_at: e.next_visit_at
      });
    }
    // Advance next visit by plan cadence (first service's frequency drives it)
    const freq = (e.care_plans.services[0] || {}).frequency || 'annual';
    const months = { monthly: 1, quarterly: 3, semiannual: 6, annual: 12 }[freq] || 12;
    const nextDate = new Date(e.next_visit_at);
    nextDate.setMonth(nextDate.getMonth() + months);
    await db.from('care_enrollments').update({ next_visit_at: nextDate.toISOString() }).eq('id', e.id);
  }
}

async function runAll() {
  const started = Date.now();
  try { await sweepFollowups(); } catch (e) { console.error('followups:', e.message); }
  try { await sweepQuoteFollowups(); } catch (e) { console.error('quote_followups:', e.message); }
  try { await sweepInvoiceReminders(); } catch (e) { console.error('invoice_reminders:', e.message); }
  try { await sweepCareVisits(); } catch (e) { console.error('care_visits:', e.message); }
  try { await sweepCampaigns(); } catch (e) { console.error('campaigns:', e.message); }
  console.log(`[scheduler] sweep complete in ${Date.now() - started}ms`);
}

module.exports = { runAll };

if (require.main === module) runAll().then(() => process.exit(0));
