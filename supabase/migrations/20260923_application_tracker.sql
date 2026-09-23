-- Tenant-side application tracker (lifecycle proposal P1, 2026-09-23).
--
-- Two timestamps the applicant is allowed to see: when the landlord first
-- opened the application, and when a screening was started from it. Neither
-- carries anything about the screening itself. Plus: a tenant may read a lease
-- addressed to their login email even before they hold a tenants row or join
-- the household — otherwise "租约待签" can never show on their tracker.
alter table public.applications add column if not exists viewed_at timestamptz;
alter table public.applications add column if not exists screened_at timestamptz;

drop policy if exists leases_tenant_email_read on public.lease_documents;
create policy leases_tenant_email_read on public.lease_documents
  for select to authenticated
  using (tenant_email is not null and lower(tenant_email) = lower(coalesce(auth.jwt() ->> 'email', '')));

-- Renewal intent (proposal §3.3 · 租客意向回流). The tenant answers the
-- 30-day touchpoint on their own hub (/h/<id>?intent=…); both sides read the
-- row through household membership. Insert only — a change of mind is a new
-- row, the newest wins.
create table if not exists public.renewal_intents (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  lease_id uuid references public.lease_documents(id) on delete set null,
  tenant_user_id uuid not null,
  intent text not null check (intent in ('renew', 'leave', 'negotiate')),
  note text check (note is null or char_length(note) <= 1000),
  created_at timestamptz not null default now()
);
create index if not exists renewal_intents_household_idx on public.renewal_intents (household_id, created_at desc);
alter table public.renewal_intents enable row level security;
drop policy if exists renewal_intents_member_read on public.renewal_intents;
create policy renewal_intents_member_read on public.renewal_intents
  for select to authenticated using (public.is_household_member(household_id));
drop policy if exists renewal_intents_tenant_insert on public.renewal_intents;
create policy renewal_intents_tenant_insert on public.renewal_intents
  for insert to authenticated with check (tenant_user_id = auth.uid() and public.is_household_member(household_id));
revoke all on public.renewal_intents from anon, authenticated, service_role;
grant select, insert on public.renewal_intents to authenticated;
grant all on public.renewal_intents to service_role;
