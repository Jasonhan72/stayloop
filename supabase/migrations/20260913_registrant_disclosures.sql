-- 2026-09-13 — multi-role accounts (design/multi-role-accounts-2026-09.md).
--
-- 1. registrant_disclosures: TRESA s.32 — a RECO registrant who leases in
--    or leases out real estate in their own interest must first give the
--    other party written notice of their registrant status and seek a
--    written acknowledgement. Stayloop records that the notice was made
--    from inside the flow (publish a listing / apply / intent) whenever the
--    account carries an agent profile.
create table if not exists public.registrant_disclosures (
  id              uuid primary key default gen_random_uuid(),
  auth_id         uuid not null references auth.users(id) on delete cascade,
  context         text not null check (context in ('listing_publish','application','showing_intent','lease')),
  listing_id      uuid references public.listings(id) on delete set null,
  counterparty    text,                      -- who was told (landlord / applicant name or "prospective tenants")
  legal_name      text not null,
  reco_number     text not null,
  brokerage_name  text not null,
  acknowledged    boolean not null default false,   -- registrant attests the other party acknowledged in writing
  note            text,
  disclosed_at    timestamptz not null default now()
);
create index if not exists registrant_disclosures_auth_idx on public.registrant_disclosures (auth_id, disclosed_at desc);
alter table public.registrant_disclosures enable row level security;
drop policy if exists registrant_disclosures_self on public.registrant_disclosures;
create policy registrant_disclosures_self on public.registrant_disclosures
  for all using (auth.uid() = auth_id or public.is_stayloop_admin()) with check (auth.uid() = auth_id);
grant select, insert on public.registrant_disclosures to authenticated;

-- 2. Nobody applies to, or requests a showing of, their own listing. The
--    same person can wear the landlord hat and the tenant hat, but not on
--    the same unit. Anonymous applications (no auth.uid()) are unaffected.
create or replace function public.guard_not_own_listing()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  v_owner uuid;
  v_uid uuid := auth.uid();
begin
  if v_uid is null or new.listing_id is null then return new; end if;
  select landlord_id into v_owner from public.listings where id = new.listing_id;
  if v_owner is not null and (v_owner = v_uid or v_owner in (select id from public.landlords where auth_id = v_uid)) then
    raise exception 'own_listing: you cannot apply to or request a showing of your own listing' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists trg_applications_not_own on public.applications;
create trigger trg_applications_not_own before insert on public.applications
  for each row execute function public.guard_not_own_listing();
drop trigger if exists trg_intents_not_own on public.showing_intents;
create trigger trg_intents_not_own before insert on public.showing_intents
  for each row execute function public.guard_not_own_listing();

-- 3. my_hats(): which hats this account holds. The client renders the role
--    switcher from this, never from localStorage.
create or replace function public.my_hats()
returns jsonb language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
    'tenant', true,
    'landlord', exists (select 1 from public.landlords l where l.auth_id = auth.uid() or l.id = auth.uid()),
    'agent', (select status from public.agent_profiles a where a.auth_id = auth.uid()),
    'admin', public.is_stayloop_admin()
  )
$$;
revoke all on function public.my_hats() from public;
grant execute on function public.my_hats() to authenticated;
