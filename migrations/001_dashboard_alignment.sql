-- Migration 001: align schema with dashboard + portal (run ONLY if you already
-- ran a pre-v4 schema.sql; fresh installs get all of this from schema.sql).
alter table quotes   add column if not exists title text;
alter table quotes   add column if not exists line_items jsonb default '[]';
alter table quotes   add column if not exists approved_at timestamptz;
alter table invoices add column if not exists title text;
alter table invoices add column if not exists line_items jsonb default '[]';

-- Migration 002 additions (v5 dashboard):
alter table jobs add column if not exists photos jsonb default '[]';
alter table businesses add column if not exists service_catalog jsonb default '[]';
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

alter table quotes add column if not exists viewed_at timestamptz;

-- v7 additions
alter table leads add column if not exists phone text;
alter table leads add column if not exists email text;
alter table leads add column if not exists address text;
alter table leads add column if not exists notes text;
alter table leads add column if not exists archived_at timestamptz;
alter table clients add column if not exists archived_at timestamptz;
alter table invoices add column if not exists viewed_at timestamptz;
alter table quotes add column if not exists last_send_attempt_at timestamptz;
alter table quotes add column if not exists last_send_error text;
alter table invoices add column if not exists last_send_attempt_at timestamptz;
alter table invoices add column if not exists last_send_error text;
alter table payments add column if not exists stripe_event_id text;
create unique index if not exists idx_payments_stripe_event on payments(stripe_event_id) where stripe_event_id is not null;
alter table campaigns add column if not exists failed_count int default 0;
alter table campaigns add column if not exists skipped_count int default 0;

-- v9 additions
alter table businesses add column if not exists settings jsonb default '{}';
alter table clients add column if not exists referral_reward text;
alter table clients add column if not exists referral_reward_sent_at timestamptz;
create table if not exists time_blocks (
  id uuid primary key default uuid_generate_v4(),
  business_id uuid references businesses(id) on delete cascade not null,
  title text not null, reason text,
  starts_at timestamptz not null, ends_at timestamptz not null,
  created_at timestamptz default now());
create index if not exists idx_blocks_biz_time on time_blocks(business_id, starts_at);
alter table time_blocks enable row level security;
do $$ begin
  create policy time_blocks_owner on time_blocks for all using
    (business_id in (select id from businesses where owner_id = auth.uid()));
exception when duplicate_object then null; end $$;

alter table review_requests add column if not exists clicked_at timestamptz;
alter table review_requests add column if not exists reviewed_at timestamptz;
alter table review_requests add column if not exists destination text default 'google';
