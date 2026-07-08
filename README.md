# JobTap Engine — Phase 1

The server-side engine: everything valuable in JobTap runs here, whether or not the app is ever opened.

## What this contains
- **schema.sql** — complete Supabase schema: clients, leads, quotes, jobs, invoices, payments, messaging with TCPA consent tracking, follow-up steps, care plans, campaigns, and the Tax Drop tables (mileage_events, receipts). RLS on everything. A Postgres trigger fires the year-round follow-up schedule the moment an invoice is marked paid.
- **src/scheduler.js** — the engine. Four sweeps every 5 minutes: due follow-up steps (Day 3/30/60/90/180/270/365), quote chases (Day 1/3/7), unpaid invoice reminders (Day 3/7/14), care-plan visit auto-creation.
- **src/twilio.js** — the compliance gate. ALL outbound SMS flows through one function that enforces opt-out, consent, quiet hours, and A2P approval status. Missed-call handling via conditional call forwarding (*61* → Twilio number; the real number stays public). STOP/START keyword handling.
- **src/index.js** — Express server: Twilio voice + SMS webhooks, Stripe payment webhook (marks invoices paid → trigger fires the year), public quote-request endpoint (the missed-call recovery landing), on-the-way endpoint (sends the text AND logs Tax Drop mileage automatically), Tax Drop year-package endpoint.
- **src/templates.js** — every default message, editable per business.
- **src/auth.js** — internal API auth (Supabase user JWT with per-business ownership checks, or `x-api-key: INTERNAL_API_KEY` for server-to-server) + Twilio webhook signature validation.
- **src/phone.js** — E.164 (+1) normalization. Applied at every boundary: form submits, CSV import, missed calls, inbound SMS, and Gate 0 of the send gate. Legacy un-normalized rows are still matched via candidate lookup.
- **src/quoteForm.js** — the public quote-request landing page at `/q/:businessId` (the link inside the missed-call textback). Server-rendered, zero build step, JobTap design system, explicit SMS-consent language on the submit button.
- **scripts/onboard.js** — one-command onboarding: creates the owner auth user, the business row, seeds all 19 templates, and imports a client CSV with normalization + attested consent. No more manual SQL.

## Deploy (Railway + Supabase, ~30 minutes once accounts exist)
1. **Supabase**: new project → SQL editor → paste schema.sql → run.
2. **Railway**: new service from this repo. Set env vars from .env.example. Railway gives you the public URL.
3. **Twilio**: buy a local number per business. Set Voice webhook → `https://YOUR-RAILWAY-URL/webhooks/twilio/voice`, SMS webhook → `/webhooks/twilio/sms`.
4. **Conditional forwarding** on the business's real phone: dial `*61*<TwilioNumber>#` (GSM/AT&T/T-Mobile) or `*71<TwilioNumber>` (Verizon). Only unanswered calls forward. Test by letting a call ring out.
5. **Stripe**: create the platform account, enable Connect (Standard), set webhook → `/webhooks/stripe` for `checkout.session.completed`.
6. Health check: `GET /health`.

## DAY-ONE CLOCK STARTERS (calendar time, not build time — do these first)
- [ ] **A2P 10DLC**: register JobTap as ISV brand in Twilio Trust Hub, then a campaign per business. HydroSeal is business #1. Nothing texts until `businesses.a2p_status = 'approved'` — the code enforces this.
- [ ] Stripe account + Connect application
- [ ] Twilio account + first number
- [ ] Supabase project (reuse the JOBTAP2-era project or start clean — clean recommended, this schema differs)

## Security model (added this session)
- **Internal endpoints** (`/api/jobs/:id/on-the-way`, `/api/quotes/:id/send`, `/api/invoices/:id/send`, `/api/tax-drop/...`) require auth: the app sends the user's Supabase access token as `Authorization: Bearer <token>` (ownership of the business is verified), or a trusted server sends `x-api-key: <INTERNAL_API_KEY>`.
- **Twilio webhooks** validate `X-Twilio-Signature` against `PUBLIC_URL` — set it to the exact Railway public URL or every webhook 403s. `TWILIO_VALIDATE=false` disables it for local testing only.
- **Stripe webhook** was already signature-validated.
- **Public endpoints** (`/q/:id` page, `/api/public/quote-request`) are unauthenticated by design; the API validates the business exists, normalizes the phone, and rate-limits 10 submits / 10 min / IP.

## First live test = HydroSeal (Phase 3 of the master spec)
1. Onboard in one command:
   ```
   node scripts/onboard.js --name "HydroSeal Pavers" \
     --email you@hydrosealpavers.com --password '...' \
     --phone "904-XXX-XXXX" --review-google "https://g.page/r/.../review" \
     --csv ./hydroseal-clients.csv
   ```
   (CSV columns: first_name,last_name,phone,email,address,notes,tags — tags pipe-separated)
2. Buy the Twilio number, set `businesses.twilio_number`, point webhooks, set `a2p_status='approved'` once cleared.
3. Turn on conditional forwarding on the HydroSeal line.
4. Mark one real invoice paid → watch followup_steps populate → Day 3 review text fires on schedule.
5. Track for 60 days: missed calls caught, quote-form leads created, review count, rebook replies. That data IS the seminar pitch.

## Current state (v6)
IN: engine (webhooks, scheduler w/ 5 sweeps incl. campaigns, compliance gate), full web dashboard at /app
(19 screens: onboarding wizard w/ browser CSV import, quote builder, active job flow w/ photos + canvas
proof cards, campaigns, money, texts, settings), client portal (/p/quote, /p/invoice w/ viewed tracking),
public quote form (/q/:id), onboarding CLI, tests (npm test).

STILL OPEN:
- Twilio number provisioning via API (manual: buy number, set businesses.twilio_number, point webhooks)
- Stripe subscription billing for JobTap itself ($69/49 plans)
- Rate limiting is in-memory (fine for HydroSeal; Redis/Upstash before paid customers)
- Native mobile app (Phase 4 — the /app dashboard is mobile-first in the meantime)
- Tests: npm test (14 unit: gates, phone, STOP/START, send path) + npm run test:db (6 DB integration: schema, trigger, delay setting, Stripe dedup, migration idempotency). Route-level tests still open.
- NOTHING has touched live Twilio/Stripe/Supabase accounts yet

## First live test = HydroSeal (Phase 3 of the master spec)
1. Onboard in one command:
   ```
   node scripts/onboard.js --name "HydroSeal Pavers" \
     --email you@hydrosealpavers.com --password '...' \
     --phone "904-XXX-XXXX" --review-google "https://g.page/r/.../review" \
     --csv ./hydroseal-clients.csv
   ```
   (CSV columns: first_name,last_name,phone,email,address,notes,tags — tags pipe-separated)
2. Buy the Twilio number, set `businesses.twilio_number`, point webhooks, set `a2p_status='approved'` once cleared.
3. Turn on conditional forwarding on the HydroSeal line.
4. Mark one real invoice paid → watch followup_steps populate → Day 3 review text fires on schedule.
5. Track for 60 days: missed calls caught, quote-form leads created, review count, rebook replies. That data IS the seminar pitch.

## Still open from the Phase 1 punch list
- Twilio number provisioning via API (buying/assigning numbers is manual — step 2 above)
- Stripe subscription billing for JobTap itself ($69/49 plans — client payments work, charging customers doesn't exist yet)
- Automated test suite (gates are live-smoke-tested; no CI)
- Nothing has touched live Twilio/Stripe/Supabase accounts yet — expect payload surprises on first real traffic

