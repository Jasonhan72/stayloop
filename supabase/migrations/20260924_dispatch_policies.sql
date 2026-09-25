-- 2026-09-24 (V0.6) — services marketplace P2 (non-money): the landlord's
-- dispatch policy. lib/marketplace/dispatchPolicy.ts is the rule; the server
-- reads this row with the service role. Owner-only RLS; anon has nothing.
create table if not exists public.dispatch_policies (
  landlord_auth_id       uuid primary key references auth.users(id) on delete cascade,
  mode                   text not null default 'suggest' check (mode in ('suggest', 'auto_emergency', 'auto_all')),
  emergency_auto_approve boolean not null default false,
  emergency_cap          integer not null default 500 check (emergency_cap between 0 and 2000),
  preferred              jsonb not null default '{}'::jsonb check (jsonb_typeof(preferred) = 'object'),
  updated_at             timestamptz not null default now()
);
alter table public.dispatch_policies enable row level security;
drop policy if exists dispatch_policies_own on public.dispatch_policies;
create policy dispatch_policies_own on public.dispatch_policies
  for all to authenticated using (landlord_auth_id = auth.uid()) with check (landlord_auth_id = auth.uid());
revoke all on public.dispatch_policies from anon;
grant select, insert, update, delete on public.dispatch_policies to authenticated;
