# getjobtap.com — Marketing Site (Sprint 1)

Static HTML/CSS/vanilla JS. No build step, no framework.

## Pages in this sprint
- `index.html` — Home
- `features/measure.html` — interactive measure-tool demo
- `industries/paver-sealing.html` — flagship industry page
- `pricing.html` — coming-soon shell
- `assets/style.css` — shared stylesheet (design tokens match `public/app.html`)

## Deploy to Vercel
1. Push this repo (or just the `site/` contents) to the connected Git provider.
2. In the Vercel project settings, set **Root Directory** to `site`.
3. Framework preset: **Other** (no build command, no output directory override needed — it's static HTML at the root of `site/`).
4. Deploy. No environment variables are required for this sprint (the measure tool calls Nominatim and Esri's public tile service directly from the browser, no keys needed).

Local preview without Vercel:
```
cd site
python3 -m http.server 8080
# visit http://localhost:8080
```

## Placeholders awaiting live-test / real assets

Search the codebase for these markers before the next content pass:

### `<!-- LIVE-TEST STAT -->` (3 total, all in `index.html`)
Three proof-stat tiles in the "What's actually happening out there" section:
calls caught & texted back, review links clicked, dollars quoted through the
app. Currently render as `—` with an "Awaiting live-test data" tag. Fill in
with real numbers from the HydroSeal live test per `jobtap-site-plan.md`.

### `<!-- SCREENSHOT: ... -->` (4 total)
- `index.html` — founder photo on a job site (in the founder block)
- `index.html` — measure tool tracing a driveway on satellite view (teaser section)
- `features/measure.html` — measure tool inside the quote builder, sq-ft filled in
- `industries/paver-sealing.html` — same measurement-flowing-into-a-quote shot

All are styled placeholder frames (`.shot-frame` / `.founder-photo`), not
mockups. Swap the frame contents for real screenshots once the live test has
shipped — no mockup UI has been invented anywhere on the site.

## What's intentionally not built yet (see `jobtap-site-plan.md` build sequence)
- `/how-it-works`, remaining `/features/*` pages, `/partners` — Sprint 2
- Pricing numbers, remaining industries (`pressure-washing`, `lawn-care`), blog shell — Sprint 3
- The industries row on the homepage links only to `paver-sealing.html`; pressure
  washing and lawn care are shown as non-linked "Coming" cards, per the plan's
  warning against thin templated industry pages.

## Notes on the interactive islands
- **Phone animation** (`index.html`): pure CSS/JS, ~15s loop, autoplays. No
  external dependencies. Falls back to a static one-line caption with
  `<html class="no-js">` when JavaScript is off.
- **Measure tool** (`features/measure.html`, re-embedded in
  `industries/paver-sealing.html`): Leaflet + Esri World Imagery tiles +
  Nominatim geocoding, extracted from the `vMeasure` function in
  `public/app.html`. Same shoelace area formula, same tile source, no API
  keys. Falls back to a static explanatory message when JavaScript is off.
  Leaflet is the one render-affecting external script on the site, and it
  only loads on pages that use the tool.

## Verified before finishing
- All four pages checked at 380px and 1280px viewport widths
- Zero banned phrases (`manage your team`, `all-in-one platform`, `operations
  suite`, `dispatch`, `CRM`, `enterprise`, `field service management`) —
  grepped clean
- Truth-table check — no mention of self-serve signup, team accounts, push
  notifications, Square, social posting, or native mobile apps
- No invented statistics or prices beyond what the plan explicitly specified
  ($1,800 hero line, $1.50/sq ft example rate — both given in the build brief)
- No-JS fallback verified for both interactive islands
- `industries/paver-sealing.html` body copy is 894 words
