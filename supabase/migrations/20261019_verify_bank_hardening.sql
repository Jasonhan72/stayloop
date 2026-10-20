-- 2026-10-19 — bank step hardening (design/flinks-production-plan-2026-10-19.md, B2 / B4 / B6).
--
-- verification_bank_reads: the only place a Flinks loginId is kept, and only until Flinks has
-- deleted the connection. phase 'reading' = GetAccountsDetail answered 202 and the read
-- continues (page poll / hourly sweep); phase 'delete' = summary stored, DeleteCard still
-- owed (CARD_IN_USE right after Authorize is normal). Service role only.
create table if not exists public.verification_bank_reads (
  login_id                text primary key,
  verification_request_id uuid references public.verification_requests(id) on delete set null,
  phase                   text not null check (phase in ('reading', 'delete')),
  flinks_request_id       text,
  sandbox                 boolean not null default false,
  attempts                integer not null default 0,
  created_at              timestamptz not null default now(),
  last_attempt_at         timestamptz,
  last_error              text
);
create index if not exists verification_bank_reads_request_idx on public.verification_bank_reads (verification_request_id);

alter table public.verification_bank_reads enable row level security;
revoke all on public.verification_bank_reads from public, anon, authenticated;
grant all on public.verification_bank_reads to service_role;

-- B4: request rows keep statuses only after 90 days (lib/verify/bankFlow.ts purgeVerificationDetails).
alter table public.verification_requests add column if not exists details_purged_at timestamptz;

-- B2: the loginId used to sit in steps.bank.session_id, which the landlord can read.
update public.verification_requests
   set steps = steps #- '{bank,session_id}'
 where steps -> 'bank' ? 'session_id';

-- Hourly sweep: parked reads, deferred DeleteCards, the 90-day trim.
select cron.unschedule('verify-sweep') where exists (select 1 from cron.job where jobname = 'verify-sweep');
select cron.schedule(
  'verify-sweep',
  '50 * * * *',
  $$ select net.http_post(
       url := 'https://www.stayloop.ai/api/cron/verify-sweep',
       headers := jsonb_build_object('x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret'), 'content-type', 'application/json'),
       body := '{}'::jsonb,
       timeout_milliseconds := 120000) $$
);
