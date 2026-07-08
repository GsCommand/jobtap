// Public client portal — /p/quote/:token and /p/invoice/:token.
// These are the pages every quote/invoice text links to. Token = public_token
// (unguessable uuid), no login. Same zero-build server-rendered pattern as /q/.

const express = require('express');

const esc = s => String(s || '').replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[c]));
const money = n => `$${Number(n || 0).toFixed(2)}`;

const SHELL_CSS = `
  :root{--bg:#1a2e1a;--card:#fff;--primary:#2D6A22;--dark:#243d24;--money:#7bc67b;--r:18px}
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:var(--bg);min-height:100vh;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
    display:flex;justify-content:center;padding:20px 16px 40px}
  .wrap{width:100%;max-width:480px}
  .brand{color:#fff;text-align:center;margin:10px 0 18px;font-size:21px;font-weight:700}
  .brand small{display:block;color:var(--money);font-size:13px;font-weight:600;margin-top:5px}
  .card{background:var(--card);border-radius:var(--r);padding:22px 20px;box-shadow:0 8px 30px rgba(0,0,0,.35)}
  h2{color:#1a2e1a;font-size:18px;margin-bottom:4px}
  .sub{color:#5b6b5b;font-size:13px;margin-bottom:14px}
  table{width:100%;border-collapse:collapse;margin:10px 0}
  td{padding:9px 2px;font-size:14.5px;color:#22301f;border-bottom:1px solid #edf2ed}
  td:last-child{text-align:right;font-weight:600}
  .total td{border:0;font-size:17px;font-weight:800;padding-top:14px}
  .total td:last-child{color:var(--primary)}
  .status{display:inline-block;padding:4px 12px;border-radius:99px;font-size:12px;font-weight:700;margin-bottom:12px}
  .st-open{background:#eef7ee;color:var(--primary)}
  .st-done{background:var(--money);color:#143014}
  button,.btn{display:block;width:100%;text-align:center;text-decoration:none;margin-top:16px;background:var(--primary);
    color:#fff;border:0;border-radius:12px;padding:15px;font-size:17px;font-weight:700;cursor:pointer}
  .note{font-size:12px;color:#5b6b5b;margin-top:12px;line-height:1.5;text-align:center}
  .err{background:#fdecea;color:#b03a2e;border-radius:10px;padding:10px 12px;font-size:13.5px;margin-top:12px;display:none}
  .foot{text-align:center;color:rgba(255,255,255,.45);font-size:11px;margin-top:18px}
`;

function shell(business, title, inner) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>${esc(title)} — ${esc(business.name)}</title><style>${SHELL_CSS}</style></head>
<body><div class="wrap"><div class="brand">${esc(business.name)}${business.phone ? `<small>${esc(business.phone)}</small>` : ''}</div>
<div class="card">${inner}</div><div class="foot">Powered by JobTap</div></div></body></html>`;
}

function lineItemsTable(items, total) {
  const rows = (items || []).map(li =>
    `<tr><td>${esc(li.description || li.name || 'Service')}${li.qty > 1 ? ` × ${li.qty}` : ''}</td><td>${money(li.amount ?? li.total ?? li.price)}</td></tr>`
  ).join('');
  return `<table>${rows}<tr class="total"><td>Total</td><td>${money(total)}</td></tr></table>`;
}

function mountPortal(app, db) {
  const r = express.Router();

  // ---------- QUOTE: view + approve ----------
  r.get('/p/quote/:token', async (req, res) => {
    const { data: q } = await db.from('quotes')
      .select('*, businesses(id,name,phone), clients(first_name)')
      .eq('public_token', req.params.token).maybeSingle();
    if (!q) return res.status(404).send('Not found');
    const b = q.businesses;
    const approved = ['approved', 'accepted', 'won'].includes(q.status);
    // First open stamps viewed_at ONLY. Never touch status: the follow-up sweep
    // filters on status='sent', and a 'viewed' status would silently kill the
    // chase sequence at the exact moment the customer showed interest.
    if (!q.viewed_at) {
      await db.from('quotes').update({ viewed_at: new Date().toISOString() }).eq('id', q.id);
    }

    const inner = `
      <span class="status ${approved ? 'st-done' : 'st-open'}">${approved ? 'APPROVED' : 'QUOTE'}</span>
      <h2>Quote for ${esc(q.clients ? q.clients.first_name : 'you')}</h2>
      <div class="sub">${q.title ? esc(q.title) : 'Prepared by ' + esc(b.name)}</div>
      ${lineItemsTable(q.line_items, q.total)}
      ${q.notes ? `<div class="sub" style="margin-top:8px">${esc(q.notes)}</div>` : ''}
      ${approved
        ? `<div class="note">You approved this quote. ${esc(b.name)} will be in touch to schedule.</div>`
        : `<button id="ok">Approve This Quote</button>
           <div class="err" id="err"></div>
           <div class="note">Questions? Just reply to the text — it goes straight to ${esc(b.name)}.</div>
           <script>
           document.getElementById('ok').onclick=function(){var btn=this;btn.disabled=true;btn.textContent='Approving…';
             fetch('/api/public/quotes/${esc(q.public_token)}/approve',{method:'POST'})
             .then(function(x){if(!x.ok)throw 0;location.reload()})
             .catch(function(){var e=document.getElementById('err');e.textContent='Could not approve just now — please try again.';
               e.style.display='block';btn.disabled=false;btn.textContent='Approve This Quote'})};
           </script>`}`;
    res.type('html').send(shell(b, 'Your Quote', inner));
  });

  r.post('/api/public/quotes/:token/approve', async (req, res) => {
    const { data: q } = await db.from('quotes')
      .select('id,status,business_id,client_id').eq('public_token', req.params.token).maybeSingle();
    if (!q) return res.status(404).json({ error: 'not found' });
    if (!['approved', 'accepted', 'won'].includes(q.status)) {
      await db.from('quotes').update({
        status: 'approved',
        approved_at: new Date().toISOString(),
        followups_enabled: false      // stop the chase sequence the moment they say yes
      }).eq('id', q.id);
    }
    res.json({ ok: true });
  });

  // ---------- INVOICE: view + pay ----------
  r.get('/p/invoice/:token', async (req, res) => {
    const { data: inv } = await db.from('invoices')
      .select('*, businesses(id,name,phone), clients(first_name)')
      .eq('public_token', req.params.token).maybeSingle();
    if (!inv) return res.status(404).send('Not found');
    const b = inv.businesses;
    if (!inv.viewed_at) {
      await db.from('invoices').update({ viewed_at: new Date().toISOString() }).eq('id', inv.id);
    }
    const paid = inv.status === 'paid' || req.query.paid === '1';
    const balance = Number(inv.total) - Number(inv.amount_paid || 0);

    const inner = `
      <span class="status ${paid ? 'st-done' : 'st-open'}">${paid ? 'PAID — THANK YOU' : 'INVOICE'}</span>
      <h2>Invoice from ${esc(b.name)}</h2>
      <div class="sub">For ${esc(inv.clients ? inv.clients.first_name : 'you')}${inv.title ? ' — ' + esc(inv.title) : ''}</div>
      ${lineItemsTable(inv.line_items, inv.total)}
      ${paid
        ? `<div class="note">Payment received in full. We appreciate your business!</div>`
        : inv.stripe_payment_link
          ? `<a class="btn" href="${esc(inv.stripe_payment_link)}">Pay ${money(balance)} Securely</a>
             <div class="note">Card payments processed securely by Stripe.</div>`
          : `<div class="note">Balance due: <b>${money(balance)}</b>. ${esc(b.name)} accepts payment in person${b.phone ? ' — or call ' + esc(b.phone) : ''}.</div>`}`;
    res.type('html').send(shell(b, 'Your Invoice', inner));
  });

  app.use(r);
}

module.exports = { mountPortal };
