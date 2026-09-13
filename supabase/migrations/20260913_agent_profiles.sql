-- 2026-09-13 — agent (real-estate registrant) verification.
-- design/roles-and-agent-verification-2026-09.md. Tenants and landlords
-- self-declare; an agent must submit their RECO registration and a Stayloop
-- admin verifies it BY HAND against the public register
-- (registrantsearch.reco.on.ca — its terms forbid commercial / automated use).
-- The row is the only server-side record of "who is an agent"; the
-- localStorage active-role stays a UI preference.
create table if not exists public.agent_profiles (
  auth_id         uuid primary key references auth.users(id) on delete cascade,
  legal_name      text not null,                       -- as registered with RECO
  trade_name      text,                                -- never shown publicly (O. Reg. 567/05 s.8)
  reco_number     text not null unique check (reco_number ~ '^[0-9]{7}$'),
  category        text not null check (category in ('salesperson','broker','broker_of_record')),
  brokerage_name  text not null,                       -- brokerage's registered name
  brokerage_id    uuid references public.brokerages(id) on delete set null,
  business_email  text,
  business_phone  text,
  crea_member     boolean not null default false,      -- REALTOR® only when true
  expires_at      date,                                -- RECO registration expiry as submitted / verified
  status          text not null default 'pending' check (status in ('pending','verified','rejected','renewal_due','expired')),
  verified_at     timestamptz,
  verified_by     uuid,
  review_note     text,                                -- admin-only: why rejected / what was checked
  attested_at     timestamptz,                         -- accepted display rules + Information Guide / representation-agreement duties
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists public.agent_verification_events (
  id            uuid primary key default gen_random_uuid(),
  agent_auth_id uuid not null references auth.users(id) on delete cascade,
  action        text not null,                         -- submitted | verified | rejected | renewal_due | expired | edited
  actor         uuid,
  note          text,
  at            timestamptz not null default now()
);
create index if not exists agent_verification_events_agent_idx on public.agent_verification_events (agent_auth_id, at desc);

alter table public.agent_profiles enable row level security;
alter table public.agent_verification_events enable row level security;

-- Own row: read + insert + update. Trust fields are guarded by the trigger
-- below (same pattern as listings' guard_listing_trust_fields).
drop policy if exists agent_profiles_self_read on public.agent_profiles;
create policy agent_profiles_self_read on public.agent_profiles
  for select using (auth.uid() = auth_id);
drop policy if exists agent_profiles_self_insert on public.agent_profiles;
create policy agent_profiles_self_insert on public.agent_profiles
  for insert with check (auth.uid() = auth_id);
drop policy if exists agent_profiles_self_update on public.agent_profiles;
create policy agent_profiles_self_update on public.agent_profiles
  for update using (auth.uid() = auth_id) with check (auth.uid() = auth_id);
-- Public directory: anyone may read VERIFIED agents (the "找经纪" picker).
drop policy if exists agent_profiles_public_verified on public.agent_profiles;
create policy agent_profiles_public_verified on public.agent_profiles
  for select using (status = 'verified');
-- Admins: everything.
drop policy if exists agent_profiles_admin_all on public.agent_profiles;
create policy agent_profiles_admin_all on public.agent_profiles
  for all using (public.is_stayloop_admin()) with check (public.is_stayloop_admin());

drop policy if exists agent_events_self_read on public.agent_verification_events;
create policy agent_events_self_read on public.agent_verification_events
  for select using (auth.uid() = agent_auth_id or public.is_stayloop_admin());
drop policy if exists agent_events_admin_write on public.agent_verification_events;
create policy agent_events_admin_write on public.agent_verification_events
  for insert with check (public.is_stayloop_admin() or auth.uid() = agent_auth_id);

grant select, insert, update on public.agent_profiles to authenticated;
grant select on public.agent_profiles to anon;
grant select, insert on public.agent_verification_events to authenticated;

-- Self-service edits never touch status / verified_* and, when a verified
-- agent changes the registration facts (name, number, brokerage, category,
-- expiry), the row drops back to 'pending' for re-verification.
create or replace function public.guard_agent_profile_fields()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if auth.role() = 'service_role' or public.is_stayloop_admin() then
    new.updated_at := now();
    return new;
  end if;
  new.status      := old.status;
  new.verified_at := old.verified_at;
  new.verified_by := old.verified_by;
  new.review_note := old.review_note;
  if (new.legal_name, new.reco_number, new.brokerage_name, new.category, coalesce(new.expires_at, date '1900-01-01'))
     is distinct from
     (old.legal_name, old.reco_number, old.brokerage_name, old.category, coalesce(old.expires_at, date '1900-01-01')) then
    new.status      := 'pending';
    new.verified_at := null;
    new.verified_by := null;
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists trg_guard_agent_profile on public.agent_profiles;
create trigger trg_guard_agent_profile
  before update on public.agent_profiles
  for each row execute function public.guard_agent_profile_fields();

-- New rows always start pending, whatever the client sends.
create or replace function public.agent_profile_insert_defaults()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if auth.role() <> 'service_role' and not public.is_stayloop_admin() then
    new.status := 'pending'; new.verified_at := null; new.verified_by := null; new.review_note := null;
  end if;
  return new;
end $$;
drop trigger if exists trg_agent_profile_insert on public.agent_profiles;
create trigger trg_agent_profile_insert
  before insert on public.agent_profiles
  for each row execute function public.agent_profile_insert_defaults();
