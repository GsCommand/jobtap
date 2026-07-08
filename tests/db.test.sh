#!/usr/bin/env bash
# JobTap DB integration tests — runs the REAL schema.sql + migration against local Postgres.
# Usage: npm run test:db   (requires a local postgres; skips politely if absent)
# What "npm test" can't prove, this does: the SQL actually runs, the paid-invoice
# trigger fires, the review-delay setting is honored, Stripe dedup is enforced
# at the database level, and the migration is safe to run twice.
set -e
cd "$(dirname "$0")/.."

if ! command -v psql >/dev/null 2>&1; then
  echo "SKIP: psql not found — install postgresql to run DB tests"; exit 0
fi
PSQL="psql"
if ! psql -qc 'select 1' >/dev/null 2>&1; then
  if id postgres >/dev/null 2>&1; then
    SU=1
    # try to start a stopped local cluster (dev containers)
    su postgres -c "psql -qc 'select 1'" >/dev/null 2>&1 || \
      (service postgresql start >/dev/null 2>&1 || pg_ctlcluster $(ls /etc/postgresql 2>/dev/null | head -1) main start >/dev/null 2>&1; sleep 2)
    su postgres -c "psql -qc 'select 1'" >/dev/null 2>&1 || { echo "SKIP: postgres not reachable"; exit 0; }
  else
    echo "SKIP: cannot connect to postgres"; exit 0
  fi
fi
run(){ if [ "$SU" = 1 ]; then su postgres -c "psql $1"; else eval "psql $1"; fi }

run "-qc 'drop database if exists jobtap_test;'"
run "-qc 'create database jobtap_test;'"
run "-qc \"do \\\$\\\$ begin create role authenticated; exception when duplicate_object then null; end \\\$\\\$;\"" || true
run "-qc \"do \\\$\\\$ begin create role anon; exception when duplicate_object then null; end \\\$\\\$;\"" || true

# Supabase-managed surfaces, stubbed
run "-q jobtap_test" << 'EOF'
create schema if not exists auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text);
create or replace function auth.uid() returns uuid language sql as $$ select '00000000-0000-0000-0000-000000000000'::uuid $$;
create schema if not exists storage;
create table storage.buckets (id text primary key, name text, public boolean);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid);
alter table storage.objects enable row level security;
EOF

echo "TEST 1: fresh schema install"
run "-v ON_ERROR_STOP=1 -q jobtap_test -f $(pwd)/schema.sql" >/dev/null
echo "  ok"

echo "TEST 2: migration runs clean twice (idempotency)"
run "-v ON_ERROR_STOP=1 -q jobtap_test -f $(pwd)/migrations/001_dashboard_alignment.sql" >/dev/null 2>&1
run "-v ON_ERROR_STOP=1 -q jobtap_test -f $(pwd)/migrations/001_dashboard_alignment.sql" >/dev/null 2>&1
echo "  ok"

echo "TEST 3-6: functional assertions"
run "-v ON_ERROR_STOP=1 -qt jobtap_test" << 'EOF'
insert into auth.users (id) values ('00000000-0000-0000-0000-000000000001');
insert into businesses (id, owner_id, name, settings) values
  ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','Test Biz','{"review_delay_days":1}');
insert into clients (id, business_id, first_name, phone) values
  ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Sarah','+19045551234');
insert into invoices (id, business_id, client_id, total, status) values
  ('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',1500,'sent');

-- TEST 3: paid trigger creates the follow-up year
update invoices set status='paid', paid_at=now() where id='30000000-0000-0000-0000-000000000001';
do $$ begin
  if (select count(*) from followup_steps where client_id='20000000-0000-0000-0000-000000000001') <> 7
    then raise exception 'TEST 3 FAIL: expected 7 follow-up steps'; end if;
  raise notice 'TEST 3 ok: paid trigger created 7 steps';
end $$;

-- TEST 4: review_delay_days setting honored (1 day, not 3)
do $$ begin
  if not exists (select 1 from followup_steps where step_key='d3_review'
    and client_id='20000000-0000-0000-0000-000000000001'
    and due_at between now() + interval '20 hours' and now() + interval '28 hours')
    then raise exception 'TEST 4 FAIL: d3_review not honoring review_delay_days=1'; end if;
  raise notice 'TEST 4 ok: review delay setting honored';
end $$;

-- TEST 5: Stripe event dedup enforced at DB level
insert into payments (business_id, invoice_id, amount, method, stripe_event_id) values
  ('10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001',1500,'card','evt_test_1');
do $$ begin
  begin
    insert into payments (business_id, invoice_id, amount, method, stripe_event_id) values
      ('10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001',1500,'card','evt_test_1');
    raise exception 'TEST 5 FAIL: duplicate stripe_event_id was allowed';
  exception when unique_violation then
    raise notice 'TEST 5 ok: duplicate Stripe event blocked by unique index';
  end;
end $$;

-- TEST 6: time_blocks exists with RLS
do $$ begin
  if not exists (select 1 from pg_tables where tablename='time_blocks' and rowsecurity)
    then raise exception 'TEST 6 FAIL: time_blocks missing or RLS off'; end if;
  raise notice 'TEST 6 ok: time_blocks present with RLS';
end $$;
EOF

run "-qc 'drop database jobtap_test;'"
echo "ALL DB TESTS PASSED"
