# JobTap v13 — Deploy & Live-Loop Runbook

Everything below happens outside the codebase. No more versions until step 6 produces failures.

---

## Step 0 — Push to GitHub (5 min)
Push v13 to GsCommand/JobTap-app (or a new jobtap-engine repo).
→ CI runs automatically: 14 unit tests + 6 DB integration tests on Postgres 16.
→ Green checkmark on the commit = "DB test run for real," permanently, on every push.
(For the record: the suite has already passed 4x in the build container — v10, v11, v13.
CI makes it visible and permanent.)

## Step 1 — Supabase project (20 min)
1. Create project (or reuse gtctohhnxrobjrswihq if clean).
2. SQL editor → paste ALL of schema.sql → run. (Proven clean on fresh Postgres.)
   - Fresh project: schema.sql only. Existing project with old tables:
     migrations/001_dashboard_alignment.sql instead (proven to run twice safely).
3. Confirm Storage → job-photos bucket exists (schema creates it + policies).
4. Collect: Project URL, anon key, service_role key.

## Step 2 — Railway deploy (20 min)
Deploy the repo. Set env vars (every one required):
```
SUPABASE_URL=            https://<ref>.supabase.co
SUPABASE_ANON_KEY=       (anon)         ← powers /app dashboard
SUPABASE_SERVICE_KEY=    (service_role) ← server only
TWILIO_ACCOUNT_SID=      AC...
TWILIO_AUTH_TOKEN=       ...
STRIPE_SECRET_KEY=       sk_test_...    ← TEST MODE for the loop
STRIPE_WEBHOOK_SECRET=   whsec_...      (from step 4)
PUBLIC_URL=              https://<railway-url>   ← EXACT public URL.
                         Wrong = every Twilio webhook 403s. Most likely failure point.
APP_URL=                 https://<railway-url>
INTERNAL_API_KEY=        (long random string)
RUN_SCHEDULER=true
```
Smoke: GET /health → {"ok":true}. GET /app → login screen.

## Step 3 — Twilio (30 min + A2P wait)
1. Buy a local 904 number.
2. Voice webhook  → POST {PUBLIC_URL}/webhooks/twilio/voice
   SMS webhook    → POST {PUBLIC_URL}/webhooks/twilio/sms
   (Status callbacks are set per-message by the engine automatically.)
3. A2P 10DLC: register brand + campaign NOW — this is the long pole.
   Until approved, the engine correctly blocks ALL outbound SMS
   (dashboard shows the red "Texting is OFF" banner; sends report "a2p_pending").
   The loop can be walked in the dashboard before approval; texts fire after.

## Step 4 — Stripe test mode (15 min)
1. Webhook endpoint: {PUBLIC_URL}/webhooks/stripe → event: checkout.session.completed.
2. Copy whsec_ into Railway → redeploy.
3. Stripe Connect for HydroSeal can wait — manual mark-paid covers the loop.

## Step 5 — Onboard HydroSeal (15 min)
```
node scripts/onboard.js \
  --name "HydroSeal Pavers" \
  --email <you>@hydrosealpavers.com --password '<strong>' \
  --phone "904-XXX-XXXX" --timezone America/New_York \
  --review-google "https://g.page/r/<id>/review"
```
Then in Supabase or via SQL: set businesses.twilio_number = the new number,
and a2p_status = 'approved' once Twilio clears it.
Then in /app → Setup wizard: services & pricing ($1.50 paver / $1.60 travertine
seeded), nav preference, quiet hours. Settings → Social & Reviews.

## Step 6 — THE LOOP (one fake customer, real system)
Use a second phone as "Sarah." Check each line. Anything that fails goes in
the triage table below — fix nothing mid-run.

```
[ ]  1. From Sarah's phone: submit /q/<business-id>
[ ]  2. Lead appears in /app → Leads (source: quote form, consent recorded)
[ ]  3. Convert lead → client + property created, no duplicates
[ ]  4. Quote builder → 📐 Measure → trace the real driveway → sq ft fills
[ ]  5. Save & text quote  (pre-A2P: expect honest "NOT sent — a2p_pending", quote stays draft)
[ ]  6. Sarah opens /p/quote link → 👀 viewed shows in dashboard, viewed_at set
[ ]  7. Sarah taps Approve → status approved, followups_enabled off
[ ]  8. Home shows "quote APPROVED — needs scheduling" → Schedule job
[ ]  9. Job detail → Navigate honors nav preference (Apple/Google/both)
[ ] 10. On the way → text + status en_route + on_the_way_sent matches reality
[ ] 11. Arrived → Start → photos (before/after, compressed) → proof card generates
[ ] 12. Mark complete → Create & text invoice
[ ] 13. Sarah opens /p/invoice → viewed_at set, reminder sequence STILL pending
[ ] 14. Mark paid (cash) → payment row created, trigger fires
[ ] 15. Review modal appears → Send now → auto d3_review flips to skipped
[ ] 16. Sarah taps the /r/ link → status CLICKED, redirects to Google review page
[ ] 17. Mark reviewed → ⭐ REVIEWED with timestamp
[ ] 18. Client detail → follow-up year exists (30/60/90/180/270/365 pending)
```
PASS = all 18 without opening the Supabase table editor once.

## Step 7 — Triage → v14
| # | What broke | Severity (Blocker / Rough / Later) | Notes |
|---|-----------|-----------------------------------|-------|
|   |           |                                   |       |

v14 = blockers only. Rough-but-usable and polish wait for the beta pass
(modals, onboarding polish, A2P setup screen, badges, docs — already listed).

## Known first-contact risks (watch for these specifically)
- PUBLIC_URL mismatch → Twilio 403s (check Railway logs for "twilio signature rejected")
- Twilio webhook payload field-name surprises on the voice leg
- Supabase RLS blocking a dashboard query the anon key makes (check browser console)
- Nominatim geocode miss on the address → measure tool falls back to manual pan (works, note it)
- iPhone Safari quirks in the measure tool touch handling
