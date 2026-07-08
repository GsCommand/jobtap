-- ============================================================
-- JOBTAP ENGINE — SUPABASE SCHEMA v1
-- Run in Supabase SQL editor. Includes RLS on all tables.
-- Tax Drop data model (mileage, receipts, tax categories) baked in.
-- ============================================================

create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";  -- gen_random_bytes for public_token

-- ---------- BUSINESSES & USERS ----------
create table businesses (
  id uuid primary key default uuid_generate_v4(),
  owner_id uuid references auth.users(id) not null,
  name text not null,
  phone text,                          -- their REAL public number
  twilio_number text,                  -- JobTap-provisioned texting/forwarding number
  email text,
  logo_url text,
  service_area text,
  vertical text default 'exterior_cleaning',  -- vertical pack selector
  timezone text default 'America/New_York',
  business_hours jsonb default '{"start":"08:00","end":"18:00","days":[1,2,3,4,5,6]}',
  quiet_hours jsonb default '{"start":"20:00","end":"08:00"}',
  review_link_google text,
  review_link_facebook text,
  review_destination text default 'google',
  service_catalog jsonb default '[]',  -- [{name, rate, unit:'sqft'|'flat'}] quote-builder defaults
  stripe_customer_id text,             -- JobTap subscription billing
  stripe_account_id text,              -- Stripe Connect for client payments
  plan text default 'trial',           -- trial | solo | pro | founding
  plan_status text default 'trialing',
  trial_ends_at timestamptz default (now() + interval '14 days'),
  a2p_status text default 'pending',   -- pending | registered | approved
  settings jsonb default '{}',         -- nav prefs, photo prompts, card style, etc.
  created_at timestamptz default now()
);

-- ---------- CLIENTS & PROPERTIES ----------
create table clients (
  id uuid primary key default uuid_generate_v4(),
  business_id uuid references businesses(id) on delete cascade not null,
  first_name text not null,
  last_name text,
  phone text,
  email text,
  is_vip boolean default false,
  lifetime_value numeric default 0,
  job_count int default 0,
  tags text[] default '{}',
  notes text,
  -- TCPA compliance: consent tracked per client, always
  sms_consent boolean default false,
  sms_consent_source text,             -- 'quote_form' | 'verbal_onboard' | 'import_attested'
  sms_consent_at timestamptz,
  sms_opted_out boolean default false,
  source text default 'manual',        -- manual | csv_import | missed_call | referral | quote_form
  referred_by uuid references clients(id),
  referral_reward text,                -- e.g. '$50 off next seal'
  referral_reward_sent_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz default now()
);
create index idx_clients_business on clients(business_id);
create index idx_clients_phone on clients(business_id, phone);

create table properties (
  id uuid primary key default uuid_generate_v4(),
  client_id uuid references clients(id) on delete cascade not null,
  business_id uuid references businesses(id) on delete cascade not null,
  address text not null,
  lat numeric, lng numeric,
  notes text,
  saved_measurements jsonb default '[]',  -- [{label, area_sqft, type, measured_at}]
  created_at timestamptz default now()
);

-- ---------- LEADS & MISSED CALLS ----------
create table leads (
  id uuid primary key default uuid_generate_v4(),
  business_id uuid references businesses(id) on delete cascade not null,
  client_id uuid references clients(id),
  name text, phone text, email text, address text,
  service_requested text,
  message text,
  photos jsonb default '[]',
  status text default 'new',           -- new | contacted | quoted | booked | lost
  notes text,
  archived_at timestamptz,
  lost_reason text,
  source text default 'manual',        -- manual | missed_call | quote_form | referral | campaign
  created_at timestamptz default now()
);
create index idx_leads_business_status on leads(business_id, status);

create table missed_calls (
  id uuid primary key default uuid_generate_v4(),
  business_id uuid references businesses(id) on delete cascade not null,
  caller_number text not null,
  caller_name text,
  twilio_call_sid text,
  text_back_sent boolean default false,
  text_back_at timestamptz,
  lead_id uuid references leads(id),
  handled boolean default false,
  created_at timestamptz default now()
);
create index idx_missed_calls_business on missed_calls(business_id, created_at desc);

-- ---------- QUOTES ----------
create table quotes (
  id uuid primary key default uuid_generate_v4(),
  business_id uuid references businesses(id) on delete cascade not null,
  client_id uuid references clients(id) not null,
  property_id uuid references properties(id),
  lead_id uuid references leads(id),
  kind text default 'quote',           -- estimate | quote
  title text,                          -- short label shown to the client
  status text default 'draft',         -- draft | sent | viewed | approved | declined | expired
  line_items jsonb default '[]',       -- [{description, qty, amount}] — MVP path; quote_line_items for advanced
  subtotal numeric default 0,
  discount_type text,                  -- percent | fixed
  discount_value numeric default 0,
  tax_rate numeric default 0,
  total numeric default 0,
  deposit_type text,                   -- percent | fixed | none
  deposit_value numeric default 0,
  deposit_paid boolean default false,
  notes text,
  photos jsonb default '[]',
  options jsonb,                       -- Good/Better/Best: [{label, line_items, total}]
  expires_at timestamptz,
  sent_at timestamptz,
  viewed_at timestamptz,               -- first portal open
  last_send_attempt_at timestamptz,
  last_send_error text,                -- a2p_pending | no_consent | opted_out | invalid_number | quiet_hours
  accepted_at timestamptz,
  approved_at timestamptz,             -- set by the public portal Approve button
  signature_url text,
  public_token text unique default encode(gen_random_bytes(16),'hex'),  -- magic-link portal access
  followup_step int default 0,         -- 0=none sent, 1=day1, 2=day3, 3=day7
  followups_enabled boolean default true,
  created_at timestamptz default now()
);
create index idx_quotes_business_status on quotes(business_id, status);

create table quote_line_items (
  id uuid primary key default uuid_generate_v4(),
  quote_id uuid references quotes(id) on delete cascade not null,
  service_name text not null,
  pricing_mode text default 'flat',    -- flat | sqft
  quantity numeric default 1,
  sqft numeric,
  rate numeric not null,
  amount numeric not null,
  is_addon boolean default false,
  sort int default 0
);

-- Price book: owner's services with defaults, set once in Settings
create table services (
  id uuid primary key default uuid_generate_v4(),
  business_id uuid references businesses(id) on delete cascade not null,
  name text not null,
  pricing_mode text default 'flat',
  default_rate numeric,
  sqft_rate numeric,
  minimum numeric default 0,
  is_addon boolean default false,
  active boolean default true,
  sort int default 0
);

-- ---------- JOBS & FIELD LOOP ----------
create table jobs (
  id uuid primary key default uuid_generate_v4(),
  business_id uuid references businesses(id) on delete cascade not null,
  client_id uuid references clients(id) not null,
  property_id uuid references properties(id),
  quote_id uuid references quotes(id),
  title text,
  status text default 'scheduled',     -- scheduled | en_route | arrived | in_progress | completed(done) | invoiced | paid | cancelled | needs_reschedule
  scheduled_at timestamptz,
  duration_minutes int default 120,
  recurrence jsonb,                    -- {freq:'monthly'|'quarterly'|'annual', interval, until}
  parent_job_id uuid references jobs(id),
  en_route_at timestamptz,
  arrived_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  on_the_way_sent boolean default false,
  photos jsonb default '[]',            -- [{kind:'before'|'after', url}]
  total numeric default 0,
  notes text,
  created_at timestamptz default now()
);
create index idx_jobs_business_sched on jobs(business_id, scheduled_at);

create table job_photos (
  id uuid primary key default uuid_generate_v4(),
  job_id uuid references jobs(id) on delete cascade not null,
  business_id uuid references businesses(id) on delete cascade not null,
  kind text not null,                  -- before | after | proof_card
  url text not null,
  lat numeric, lng numeric,
  taken_at timestamptz default now()
);

-- ---------- INVOICES & PAYMENTS ----------
create table invoices (
  id uuid primary key default uuid_generate_v4(),
  business_id uuid references businesses(id) on delete cascade not null,
  client_id uuid references clients(id) not null,
  job_id uuid references jobs(id),
  title text,
  line_items jsonb default '[]',       -- [{description, qty, amount}]
  status text default 'draft',         -- draft | sent | partial | paid | void
  subtotal numeric default 0,
  tax numeric default 0,
  total numeric default 0,
  amount_paid numeric default 0,
  due_at timestamptz,
  sent_at timestamptz,
  viewed_at timestamptz,
  last_send_attempt_at timestamptz,
  last_send_error text,
  paid_at timestamptz,
  stripe_payment_link text,
  public_token text unique default encode(gen_random_bytes(16),'hex'),
  reminder_step int default 0,         -- 0 | 1(day3) | 2(day7) | 3(day14)
  reminders_enabled boolean default true,
  created_at timestamptz default now()
);
create index idx_invoices_business_status on invoices(business_id, status);

create table payments (
  id uuid primary key default uuid_generate_v4(),
  business_id uuid references businesses(id) on delete cascade not null,
  invoice_id uuid references invoices(id),
  quote_id uuid references quotes(id),          -- deposits
  amount numeric not null,
  method text default 'card',          -- card | ach | cash | check
  stripe_payment_intent text,
  stripe_event_id text,
  tip numeric default 0,
  created_at timestamptz default now()
);

-- ---------- MESSAGING (all SMS in/out, the compliance spine) ----------
create unique index if not exists idx_payments_stripe_event
on payments(stripe_event_id) where stripe_event_id is not null;

create table messages (
  id uuid primary key default uuid_generate_v4(),
  business_id uuid references businesses(id) on delete cascade not null,
  client_id uuid references clients(id),
  direction text not null,             -- outbound | inbound
  to_number text, from_number text,
  body text not null,
  kind text default 'manual',          -- missed_call_textback | on_the_way | quote | quote_followup |
                                       -- invoice | invoice_reminder | review_request | followup_step |
                                       -- campaign | care_plan | manual | inbound
  twilio_sid text,
  status text default 'queued',        -- queued | sent | delivered | failed
  created_at timestamptz default now()
);
create index idx_messages_business on messages(business_id, created_at desc);

create table message_templates (
  id uuid primary key default uuid_generate_v4(),
  business_id uuid references businesses(id) on delete cascade not null,
  key text not null,                   -- matches messages.kind + followup day keys (followup_d3, etc.)
  body text not null,
  active boolean default true,
  unique(business_id, key)
);

-- ---------- FOLLOW-UP ENGINE ----------
-- One row per scheduled touch. Payment trigger creates the year of steps.
create table time_blocks (
  id uuid primary key default uuid_generate_v4(),
  business_id uuid references businesses(id) on delete cascade not null,
  title text not null,
  reason text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  created_at timestamptz default now()
);
create index idx_blocks_biz_time on time_blocks(business_id, starts_at);

create table followup_steps (
  id uuid primary key default uuid_generate_v4(),
  business_id uuid references businesses(id) on delete cascade not null,
  client_id uuid references clients(id) on delete cascade not null,
  job_id uuid references jobs(id),
  step_key text not null,              -- d3_review | d30_checkin | d60_referral | d90_rebook |
                                       -- d180_seasonal | d270_touch | d365_annual
  due_at timestamptz not null,
  status text default 'pending',       -- pending | sent | skipped | cancelled
  sent_at timestamptz
);
create index idx_followups_due on followup_steps(status, due_at);

-- ---------- CARE PROGRAM ----------
create table care_plans (
  id uuid primary key default uuid_generate_v4(),
  business_id uuid references businesses(id) on delete cascade not null,
  name text not null,                  -- "Annual Re-Seal Plan"
  description text,
  services jsonb not null,             -- [{service, frequency:'quarterly'|'annual'}]
  billing_frequency text default 'monthly',  -- monthly | annual
  price numeric not null,
  active boolean default true
);

create table care_enrollments (
  id uuid primary key default uuid_generate_v4(),
  care_plan_id uuid references care_plans(id) not null,
  business_id uuid references businesses(id) on delete cascade not null,
  client_id uuid references clients(id) not null,
  status text default 'active',        -- active | paused | cancelled
  stripe_subscription_id text,
  next_visit_at timestamptz,
  started_at timestamptz default now()
);

-- ---------- REVIEWS ----------
create table review_requests (
  id uuid primary key default uuid_generate_v4(),
  business_id uuid references businesses(id) on delete cascade not null,
  client_id uuid references clients(id) not null,
  job_id uuid references jobs(id),
  status text default 'pending',       -- pending | sent | clicked | reviewed
  destination text default 'google',   -- google | facebook — where /r/:id redirects
  sent_at timestamptz,
  clicked_at timestamptz,
  reviewed_at timestamptz,
  created_at timestamptz default now()
);

-- ---------- CAMPAIGNS ----------
create table campaigns (
  id uuid primary key default uuid_generate_v4(),
  business_id uuid references businesses(id) on delete cascade not null,
  name text not null,
  kind text not null,                  -- seasonal | holiday | reactivation | customers_due | neighbor | rain_delay
  template_body text not null,
  discount_type text, discount_value numeric,
  audience jsonb default '{}',         -- segment filter
  scheduled_at timestamptz,
  status text default 'draft',         -- draft | scheduled | sending | sent
  sent_count int default 0,
  failed_count int default 0,
  skipped_count int default 0,
  created_at timestamptz default now()
);

-- ---------- TAX DROP (baked in from day one) ----------
create table mileage_events (
  id uuid primary key default uuid_generate_v4(),
  business_id uuid references businesses(id) on delete cascade not null,
  job_id uuid references jobs(id),
  date date not null default current_date,
  from_address text, to_address text,
  miles numeric not null,
  purpose text default 'job_travel',
  source text default 'auto_navigate', -- auto_navigate | manual
  created_at timestamptz default now()
);
create index idx_mileage_business_date on mileage_events(business_id, date);

create table receipts (
  id uuid primary key default uuid_generate_v4(),
  business_id uuid references businesses(id) on delete cascade not null,
  image_url text not null,
  vendor text,
  amount numeric,
  date date,
  tax_category text,                   -- supplies | fuel | equipment | insurance | advertising |
                                       -- vehicle | contract_labor | utilities | other  (Schedule C lines)
  ai_extracted boolean default false,
  notes text,
  created_at timestamptz default now()
);
create index idx_receipts_business_date on receipts(business_id, date);

-- Income is derivable from payments; tax_category on receipts covers expenses.
-- Tax Drop = SQL rollup of payments + receipts + mileage_events by year. No extra tables needed.

-- ---------- ROW LEVEL SECURITY ----------
alter table businesses enable row level security;
create policy biz_owner on businesses for all using (owner_id = auth.uid());

do $$
declare t text;
begin
  foreach t in array array['clients','properties','leads','missed_calls','quotes','quote_line_items',
    'services','jobs','job_photos','invoices','payments','messages','message_templates','time_blocks',
    'followup_steps','care_plans','care_enrollments','review_requests','campaigns',
    'mileage_events','receipts']
  loop
    execute format('alter table %I enable row level security', t);
    if t = 'quote_line_items' then
      execute 'create policy qli_owner on quote_line_items for all using (
        quote_id in (select id from quotes where business_id in
          (select id from businesses where owner_id = auth.uid())))';
    else
      execute format('create policy %I_owner on %I for all using (
        business_id in (select id from businesses where owner_id = auth.uid()))', t, t);
    end if;
  end loop;
end $$;

-- Server (service role key) bypasses RLS for the scheduler & webhooks — by design.

-- ---------- TRIGGER: payment marks invoice paid + fires the year of follow-ups ----------
create or replace function on_invoice_paid() returns trigger as $$
begin
  if new.status = 'paid' and old.status is distinct from 'paid' then
    -- VIP / lifetime value rollup
    update clients set
      job_count = job_count + 1,
      lifetime_value = lifetime_value + new.total,
      is_vip = (job_count + 1 >= 3) or is_vip
    where id = new.client_id;
    -- The year-round schedule: Day 3/30/60/90/180/270/365
    insert into followup_steps (business_id, client_id, job_id, step_key, due_at)
    values
      (new.business_id, new.client_id, new.job_id, 'd3_review',
        new.paid_at + make_interval(days => coalesce(
          (select (settings->>'review_delay_days')::int from businesses where id = new.business_id), 3))),
      (new.business_id, new.client_id, new.job_id, 'd30_checkin',  new.paid_at + interval '30 days'),
      (new.business_id, new.client_id, new.job_id, 'd60_referral', new.paid_at + interval '60 days'),
      (new.business_id, new.client_id, new.job_id, 'd90_rebook',   new.paid_at + interval '90 days'),
      (new.business_id, new.client_id, new.job_id, 'd180_seasonal',new.paid_at + interval '180 days'),
      (new.business_id, new.client_id, new.job_id, 'd270_touch',   new.paid_at + interval '270 days'),
      (new.business_id, new.client_id, new.job_id, 'd365_annual',  new.paid_at + interval '365 days');
  end if;
  return new;
end $$ language plpgsql;

create trigger trg_invoice_paid after update on invoices
for each row execute function on_invoice_paid();

-- ---------- STORAGE: job-photos bucket + policies ----------
-- Public bucket = public READ only; uploads still need explicit policies.
insert into storage.buckets (id, name, public) values ('job-photos','job-photos', true)
on conflict (id) do nothing;

do $mig$ begin
  create policy "job photo reads" on storage.objects for select to public using (bucket_id = 'job-photos');
exception when duplicate_object then null; end $mig$;
do $mig$ begin
  create policy "job photo uploads" on storage.objects for insert to authenticated with check (bucket_id = 'job-photos');
exception when duplicate_object then null; end $mig$;
do $mig$ begin
  create policy "job photo updates" on storage.objects for update to authenticated using (bucket_id = 'job-photos');
exception when duplicate_object then null; end $mig$;
do $mig$ begin
  create policy "job photo deletes" on storage.objects for delete to authenticated using (bucket_id = 'job-photos');
exception when duplicate_object then null; end $mig$;
