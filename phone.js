// Public quote-request form — the page behind {quote_form_link} in the
// missed-call textback, and the generic /q/:businessId link for ads/GBP.
//
// Server-rendered single file, zero build step, loads instantly on a phone
// in a driveway. Submitting IS the SMS consent event (explicit language on
// the button), which is what sets sms_consent_source = 'quote_form'.
//
// JobTap design system: bg #1a2e1a, card #fff, primary #2D6A22,
// dark card #243d24, money green #7bc67b, 18px card radius.

const express = require('express');

function esc(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function page(business, opts) {
  const name = esc(business.name);
  const mc = esc(opts.missedCallId || '');
  const src = esc(opts.src || '');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<meta name="robots" content="noindex">
<title>Get a Quote — ${name}</title>
<style>
  :root {
    --bg:#1a2e1a; --card:#ffffff; --primary:#2D6A22;
    --dark-card:#243d24; --money:#7bc67b; --radius:18px;
  }
  * { box-sizing:border-box; margin:0; padding:0; }
  body {
    background:var(--bg); min-height:100vh;
    font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
    display:flex; align-items:flex-start; justify-content:center; padding:20px 16px 40px;
  }
  .wrap { width:100%; max-width:440px; }
  .brand {
    color:#fff; text-align:center; margin:12px 0 20px;
    font-size:22px; font-weight:700; letter-spacing:.2px;
  }
  .brand small { display:block; color:var(--money); font-size:13px; font-weight:600; margin-top:6px; }
  .card {
    background:var(--card); border-radius:var(--radius);
    padding:22px 20px; box-shadow:0 8px 30px rgba(0,0,0,.35);
  }
  label { display:block; font-size:13px; font-weight:700; color:#1a2e1a; margin:14px 0 5px; }
  label:first-of-type { margin-top:0; }
  .req { color:#c0392b; }
  input, select, textarea {
    width:100%; border:1.5px solid #d7e2d7; border-radius:12px;
    padding:12px 13px; font-size:16px; color:#162816; background:#fbfdfb;
    outline:none; font-family:inherit;
  }
  input:focus, select:focus, textarea:focus { border-color:var(--primary); background:#fff; }
  textarea { resize:vertical; min-height:76px; }
  button {
    width:100%; margin-top:18px; background:var(--primary); color:#fff;
    border:0; border-radius:12px; padding:15px; font-size:17px; font-weight:700;
    cursor:pointer;
  }
  button:active { transform:scale(.99); }
  button:disabled { opacity:.6; }
  .consent { font-size:11.5px; color:#5b6b5b; line-height:1.45; margin-top:12px; }
  .error { display:none; background:#fdecea; color:#b03a2e; border-radius:10px;
    padding:10px 12px; font-size:13.5px; margin-top:12px; }
  .done { display:none; text-align:center; padding:26px 6px; }
  .done .check {
    width:64px; height:64px; border-radius:50%; background:var(--money);
    color:#143014; font-size:34px; line-height:64px; margin:0 auto 14px; font-weight:800;
  }
  .done h2 { color:#1a2e1a; font-size:20px; margin-bottom:8px; }
  .done p { color:#4a5a4a; font-size:14.5px; line-height:1.5; }
  .foot { text-align:center; color:rgba(255,255,255,.45); font-size:11px; margin-top:18px; }
</style>
</head>
<body>
<div class="wrap">
  <div class="brand">${name}<small>Fast, free quote — we reply by text</small></div>
  <div class="card">
    <form id="f" novalidate>
      <label>Name <span class="req">*</span></label>
      <input name="name" required autocomplete="name" placeholder="Your name">
      <label>Mobile number <span class="req">*</span></label>
      <input name="phone" required type="tel" inputmode="tel" autocomplete="tel" placeholder="(904) 555-1234">
      <label>Property address</label>
      <input name="address" autocomplete="street-address" placeholder="Street, city">
      <label>What do you need?</label>
      <select name="service">
        <option value="">Choose one…</option>
        <option>Paver sealing</option>
        <option>Travertine sealing</option>
        <option>Pool deck restoration</option>
        <option>Pressure washing</option>
        <option>Something else</option>
      </select>
      <label>Anything we should know?</label>
      <textarea name="message" placeholder="Approx. square footage, gate codes, timing…"></textarea>
      <div class="error" id="err"></div>
      <button type="submit" id="btn">Text Me My Quote</button>
      <p class="consent">By tapping the button you agree that ${name} may text you about
      your quote and service at the number provided. Msg &amp; data rates may apply.
      Reply STOP anytime to opt out.</p>
    </form>
    <div class="done" id="done">
      <div class="check">&#10003;</div>
      <h2>Got it — you're in the queue!</h2>
      <p>${name} has your request and will text you shortly.<br>
      Keep an eye on your messages.</p>
    </div>
  </div>
  <div class="foot">Powered by JobTap</div>
</div>
<script>
(function () {
  var f = document.getElementById('f'),
      btn = document.getElementById('btn'),
      err = document.getElementById('err');
  f.addEventListener('submit', function (e) {
    e.preventDefault();
    err.style.display = 'none';
    var d = new FormData(f);
    var payload = {
      business_id: ${JSON.stringify(business.id)},
      missed_call_id: ${JSON.stringify(opts.missedCallId || null)},
      src: ${JSON.stringify(src || null)},
      name: (d.get('name') || '').trim(),
      phone: (d.get('phone') || '').trim(),
      address: (d.get('address') || '').trim(),
      service: d.get('service') || '',
      message: (d.get('message') || '').trim()
    };
    if (!payload.name || !payload.phone) {
      err.textContent = 'Please add your name and mobile number.';
      err.style.display = 'block';
      return;
    }
    btn.disabled = true; btn.textContent = 'Sending…';
    fetch('/api/public/quote-request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        if (!res.ok) throw new Error(res.j.error || 'Something went wrong');
        f.style.display = 'none';
        document.getElementById('done').style.display = 'block';
      })
      .catch(function (ex) {
        err.textContent = ex.message === 'invalid phone'
          ? 'That phone number doesn\\'t look right — please check it.'
          : 'Couldn\\'t send just now — please try again.';
        err.style.display = 'block';
        btn.disabled = false; btn.textContent = 'Text Me My Quote';
      });
  });
})();
</script>
</body>
</html>`;
}

/**
 * Mounts GET /q/:businessId on the given app.
 * Query params: ?src=mc&mc=<missed_call_id> (set by the textback link).
 */
function mountQuoteForm(app, db) {
  const router = express.Router();

  router.get('/q/:businessId', async (req, res) => {
    const { data: business } = await db.from('businesses')
      .select('id, name').eq('id', req.params.businessId).maybeSingle();
    if (!business) return res.status(404).send('Not found');
    res.type('html').send(page(business, {
      missedCallId: req.query.mc || null,
      src: req.query.src || null
    }));
  });

  app.use(router);
}

module.exports = { mountQuoteForm };
