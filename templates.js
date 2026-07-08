#!/usr/bin/env node
// JobTap onboarding script — turns "manual SQL inserts in Supabase" into one command.
//
// Creates (or reuses) the owner auth user, creates the business row, seeds all
// default message templates into message_templates, and optionally imports a
// client CSV with phone normalization + attested consent.
//
// Usage:
//   node scripts/onboard.js \
//     --name "HydroSeal Pavers" \
//     --email owner@hydrosealpavers.com \
//     --password 'a-strong-password' \
//     --phone "(904) 555-0100" \
//     --timezone America/New_York \
//     --review-google "https://g.page/r/.../review" \
//     --csv ./clients.csv
//
//   # or attach to an existing auth user instead of creating one:
//   node scripts/onboard.js --name "..." --owner-id <uuid> [--csv ...]
//
// CSV columns (header row required, order free, extras ignored):
//   first_name, last_name, phone, email, address, notes, tags
// Tags may be pipe-separated: "vip|travertine".
//
// Consent on import: rows get sms_consent = true with source 'import_attested'.
// By running this with --csv you are attesting these are YOUR existing customers
// who gave you their number in the course of business (TCPA established
// business relationship). Do not import purchased lists. Ever.
//
// Requires env: SUPABASE_URL, SUPABASE_SERVICE_KEY

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const defaults = require('../src/templates');
const { normalizePhone } = require('../src/phone');

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

// ---------- tiny arg parser ----------
function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) { args[key] = true; }
      else { args[key] = next; i++; }
    }
  }
  return args;
}

// ---------- tiny CSV parser (handles quoted fields, commas, "" escapes) ----------
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  const src = text.replace(/^\uFEFF/, ''); // strip BOM
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some(f => f.trim() !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); if (row.some(f => f.trim() !== '')) rows.push(row); }
  return rows;
}

function die(msg) { console.error(`\n✗ ${msg}\n`); process.exit(1); }

async function main() {
  const args = parseArgs(process.argv);
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    die('SUPABASE_URL and SUPABASE_SERVICE_KEY must be set (see .env.example)');
  }
  if (!args.name) die('--name is required');

  // ---------- 1. Owner auth user ----------
  let ownerId = args['owner-id'] || null;
  if (!ownerId) {
    if (!args.email || !args.password) {
      die('provide --owner-id OR both --email and --password to create the owner');
    }
    const { data, error } = await db.auth.admin.createUser({
      email: args.email,
      password: String(args.password),
      email_confirm: true
    });
    if (error) {
      // If the user already exists, find and reuse them
      if (/already/i.test(error.message)) {
        const { data: list } = await db.auth.admin.listUsers({ perPage: 1000 });
        const existing = (list && list.users || []).find(u => u.email === args.email);
        if (!existing) die(`auth user exists but could not be located: ${error.message}`);
        ownerId = existing.id;
        console.log(`• Reusing existing auth user ${args.email} (${ownerId})`);
      } else {
        die(`could not create auth user: ${error.message}`);
      }
    } else {
      ownerId = data.user.id;
      console.log(`✓ Created owner auth user ${args.email} (${ownerId})`);
    }
  }

  // ---------- 2. Business row ----------
  const bizPhone = args.phone ? normalizePhone(args.phone) : null;
  if (args.phone && !bizPhone) die(`--phone did not normalize to a US number: ${args.phone}`);

  const { data: business, error: bizErr } = await db.from('businesses').insert({
    owner_id: ownerId,
    name: args.name,
    phone: bizPhone,
    email: args.email || null,
    timezone: args.timezone || 'America/New_York',
    vertical: args.vertical || 'exterior_cleaning',
    service_area: args['service-area'] || null,
    review_link_google: args['review-google'] || null,
    review_link_facebook: args['review-facebook'] || null,
    review_destination: args['review-facebook'] && !args['review-google'] ? 'facebook' : 'google',
    plan: args.plan || 'trial'
  }).select().single();
  if (bizErr) die(`business insert failed: ${bizErr.message}`);
  console.log(`✓ Created business "${business.name}" (${business.id})`);

  // ---------- 3. Seed message templates ----------
  const templateRows = Object.entries(defaults).map(([key, body]) => ({
    business_id: business.id, key, body, active: true
  }));
  const { error: tplErr } = await db.from('message_templates').insert(templateRows);
  if (tplErr) die(`template seeding failed: ${tplErr.message}`);
  console.log(`✓ Seeded ${templateRows.length} message templates`);

  // ---------- 4. Client CSV import ----------
  if (args.csv) {
    const csvPath = path.resolve(args.csv);
    if (!fs.existsSync(csvPath)) die(`CSV not found: ${csvPath}`);
    const rows = parseCsv(fs.readFileSync(csvPath, 'utf8'));
    if (rows.length < 2) die('CSV needs a header row and at least one data row');

    const header = rows[0].map(h => h.trim().toLowerCase().replace(/\s+/g, '_'));
    const col = name => header.indexOf(name);
    if (col('first_name') === -1 && col('name') === -1) {
      die(`CSV must have a first_name (or name) column. Found: ${header.join(', ')}`);
    }

    let imported = 0, skippedPhone = 0, skippedDupe = 0;
    const seen = new Set();
    const nowIso = new Date().toISOString();

    for (const r of rows.slice(1)) {
      const get = name => (col(name) >= 0 ? (r[col(name)] || '').trim() : '');
      let first = get('first_name'), last = get('last_name');
      if (!first && get('name')) {
        const parts = get('name').split(/\s+/);
        first = parts[0]; last = parts.slice(1).join(' ');
      }
      const phone = normalizePhone(get('phone'));
      if (!phone) { skippedPhone++; continue; }
      if (seen.has(phone)) { skippedDupe++; continue; }
      seen.add(phone);

      const tags = get('tags') ? get('tags').split('|').map(t => t.trim()).filter(Boolean) : [];

      const { data: clientRow, error: cErr } = await db.from('clients').insert({
        business_id: business.id,
        first_name: first || 'Client',
        last_name: last || null,
        phone,
        email: get('email') || null,
        notes: get('notes') || null,
        tags,
        sms_consent: true,
        sms_consent_source: 'import_attested',
        sms_consent_at: nowIso,
        source: 'csv_import'
      }).select().single();
      if (cErr) { console.warn(`  ! row skipped (${first} ${last}): ${cErr.message}`); continue; }

      if (get('address')) {
        await db.from('properties').insert({
          business_id: business.id, client_id: clientRow.id, address: get('address')
        });
      }
      imported++;
    }
    console.log(`✓ Imported ${imported} clients` +
      (skippedPhone ? ` (${skippedPhone} skipped: bad phone)` : '') +
      (skippedDupe ? ` (${skippedDupe} skipped: duplicate phone)` : ''));
  }

  // ---------- 5. Summary ----------
  const appUrl = process.env.APP_URL || 'https://jobtap.app';
  console.log('\n──────────────────────────────────────────');
  console.log('  ONBOARDING COMPLETE');
  console.log(`  Business ID:   ${business.id}`);
  console.log(`  Owner ID:      ${ownerId}`);
  console.log(`  Quote form:    ${appUrl}/q/${business.id}`);
  console.log('\n  Still manual (for now):');
  console.log('  1. Buy a Twilio number → set businesses.twilio_number');
  console.log('  2. Point its Voice + SMS webhooks at /webhooks/twilio/voice and /sms');
  console.log('  3. A2P 10DLC: register brand+campaign → set a2p_status = \'approved\'');
  console.log('     (the send gate blocks ALL texts until this is done)');
  console.log('  4. Stripe Connect onboarding → set businesses.stripe_account_id');
  console.log('──────────────────────────────────────────\n');
}

main().catch(e => die(e.message));
