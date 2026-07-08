# JobTap.app — Marketing Site Build Plan v1

Pricing page intentionally deferred — structure slots only, numbers TBD.

---

## Positioning — THE LANE (locked)

**One guy. One truck. One phone.** JobTap is for solo operators and one-truck
crews — the owner who answers his own phone and misses calls because he's
actually doing the work. Not teams, not dispatch, not "operations suites."
That vocabulary is banned from the site: no "manage your team," no "all-in-one
platform," no CRM-speak. If a sentence would fit on Jobber's homepage, cut it.

Master positioning line (use everywhere):
> JobTap helps solo service business owners stop losing jobs from missed calls —
> and turn every customer into a quote, invoice, review, and repeat job.

Voice line for the founder block:
> Built for the guy sealing the driveway, washing the house, cutting the lawn,
> or driving to the next job — not sitting behind a desk.

## Positioning (the part the reviewer's outline undersells)

The reviewer's hero is fine but generic. JobTap has two angles no competitor can copy:

**1. Built by a contractor, not a software company.**
"I run a paver sealing company in Jacksonville. I built JobTap because Jobber
didn't fit a one-truck operation. Every feature exists because I needed it on
a job site." — this is the founder story, and it's the whole brand. Jobber and
Housecall Pro cannot say this. Put it on the homepage, not buried in /about.

**2. The app works even when you never open it.**
Missed call → textback → quote form → follow-up year all fire automatically.
The competitor pitch is "manage your business." Ours is "the app that answers
your phone while you're on your knees sealing a driveway."

Hero (draft):
> **You just missed a call. That was a $1,800 driveway.**
> JobTap texts them back before they call the next guy — then turns them into
> a quote, a job, an invoice, a review, and a customer who comes back every year.
> [Start Free Trial] [See it catch a call — 90-sec demo]

---

## Site architecture

Domain: getjobtap.com (marketing, static, Vercel — same workflow as hydrosealpavers.com).
App stays on the engine (Railway) at app.getjobtap.com → /app. Login button links there.
The get- prefix is a positioning asset, not a compromise: every CTA reads as a
command — Get JobTap. Use it verbatim as the primary button label sitewide.

```
/                       Home
/how-it-works           The money loop, step by step
/features/missed-calls  Missed Call Recovery
/features/measure       Measure Tool (INTERACTIVE — see below)
/features/reviews       Review Automation + click tracking
/features/field         Field Workflow (jobs, nav, on-the-way, proof cards)
/features/repeat        Follow-up year + Customers Due + campaigns
/industries/paver-sealing        ← first and deepest
/industries/pressure-washing
/industries/lawn-care            ← launch with 3, expand only with real content
/partners               Trident seminars, YouTube affiliates, supply stores
/pricing                (deferred)
/login → app.jobtap.app
```

### SEO rule learned the hard way on HydroSeal
GSC dropped hydrosealpavers.com from 22 to 13 indexed pages because of thin
templated micro-pages. **Do not repeat that here.** Launch with 10-12 real pages,
each substantial. No programmatic industry-page factory until each page has
unique screenshots, workflows, and pricing language for that trade. Three
industries at launch (paver sealing, pressure washing, lawn care), each 800+
words of genuinely different content, beats ten clones.

Primary keyword targets per page (research before writing, but directionally):
- Home: "missed call text back service for contractors"
- /features/measure: "measure driveway square footage online / satellite"
- /industries/paver-sealing: "paver sealing business software", "CRM for paver sealing"
- /industries/pressure-washing: "pressure washing business app"

---

## The conversion weapon: embed the real Measure Tool

The measure tool already exists as self-contained browser code (Leaflet + Esri
tiles + shoelace math — no API keys, no login required). Extract it into a
public demo widget on /features/measure and the homepage:

> "Type your own address. Trace your own driveway. See the sq-ft price a
> paver sealing company would quote you — in 30 seconds, no signup."

Nobody else in this market lets a prospect *touch the product* on the marketing
site. This is the single highest-converting asset we can ship, and it's ~90%
already built. Gate the "Save measurement" action behind signup — the demo IS
the lead magnet.

Second interactive asset: a fake-phone widget showing the missed-call textback
firing in real time (animated, not live SMS). Missed call rings → declines →
text bubble appears. 15 seconds, autoplays on the homepage.

---

## Page outlines

### Home
1. Hero (above) + the fake-phone missed-call animation
2. The loop, horizontal: Missed call → Lead → Quote → Measure → Job → Invoice →
   Paid → Review → Repeat. Each node links to its feature page.
3. Founder block: photo on a job site, 3 sentences, "built for one-truck crews."
4. Three proof stats — REAL numbers from the HydroSeal live test
   (calls caught, review clicks, $ quoted through the app). See sequencing below.
5. Measure tool teaser (interactive)
6. Industries row → 3 industry pages
7. CTA band: trial + demo

### /how-it-works
The 20-step loop told as a story of one job ("Sarah's pool deck"), with real
app screenshots at every step. This doubles as onboarding doc for beta users.

### Feature pages — shared template
Problem (2 sentences, contractor language) → How JobTap does it (screenshots/
GIF) → What fires automatically vs what you tap → mini-FAQ → CTA.
- missed-calls: include the A2P/compliance explainer in plain English
  ("carriers require registration — we walk you through it") — turns our
  biggest onboarding friction into a trust signal.
- reviews: show the funnel numbers concept: sent → clicked → reviewed.
- field: Apple/Google Maps choice, on-the-way text, proof card gallery.

### /industries/paver-sealing (the flagship)
Written from lived experience — sq-ft pricing, travertine vs concrete pavers,
pool deck jobs, HOA neighborhoods, annual reseal cycle → the follow-up year is
literally built around this trade. Include the measure tool embedded again with
paver-specific copy. This page should be strong enough to rank AND to be the
link Trident hands out at seminars.

### /partners
Affiliate program (25% recurring), seminar co-marketing, supply-store promo
codes. Each partner gets a coded landing path (/p/trident etc.) so attribution
works from day one.

---

## What the site may claim (truth table)

ADVERTISE: missed-call textback, quote form, quote builder, measure tool,
approval portal, jobs + navigation preference, on-the-way texts, invoices,
manual + Stripe payment, review requests with click tracking, follow-up year,
Customers Due, campaigns with consent guardrails, referral tracking.

DO NOT ADVERTISE YET: self-serve signup, team accounts, push notifications,
Square, social posting, native mobile apps. Roadmap section may say "coming."

Every screenshot on the site must be the real app. No mockups — the app looks
good enough now, and mockup drift is how marketing sites start lying.

---

## Tech decision

Static site, Vercel, same GsCommand workflow as the HydroSeal properties.
Plain HTML/CSS (or Astro if we want components) — no React needed for a
marketing site, and page-speed is an SEO ranking factor we control at 100/100
by shipping almost no JS. Exceptions: the two interactive widgets (measure
demo, phone animation) are self-contained islands. Design system: same tokens
as the app (bg #1a2e1a, primary #2D6A22, money #7bc67b, 18px radius) so the
screenshot-to-site transition is seamless.

---

## Build sequence (and why the site comes AFTER the live test)

1. **Deploy + HydroSeal live loop first.** Every proof element above — the
   stats block, the screenshots with real data, the "I run my company on this"
   claim — is generated by the live test. A site built before it ships with
   lorem-ipsum numbers and gets rebuilt anyway.
2. Sprint 1 (1 session): Home + /features/measure with the embedded tool +
   /industries/paver-sealing. Three pages, launchable.
3. Sprint 2: /how-it-works (from the live-test screenshots), remaining feature
   pages, /partners.
4. Sprint 3: pricing (after we settle it), remaining industries, blog shell
   for SEO content.

Sequence total: 3 sessions of site work, starting the session after the live loop passes.
