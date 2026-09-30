-- 找得到人 · review fixes (2026-09-30, adversarial review of 20260930_messaging_people.sql)
--
-- 1. listing_inquiry people/party came from caller-supplied p_listing / p_subject:
--    any landlord could turn any user id into a name. Both now read the stored
--    thread (by p_ref); no thread → not a party, nobody listed.
-- 2. Realtor.ca imports have no Stayloop landlord (listings.landlord_id is the
--    importer): the importer is never the "landlord" party of an application or
--    listing inquiry on such a listing, and is never listed as a person there.
-- 3. person_name: "Stayloop" is rejected after normalisation (NFKC, zero-width /
--    format characters removed, separators collapsed), so it cannot be faked.
-- 4. household_invites.invited_email is the inviter's business: no longer
--    column-readable by every member.
-- 5. A member who is a tenant cannot invite a second landlord / property manager
--    while an active one exists (an invitee is relayed messages).
-- 6. listing_sources(ids): Realtor flag for listings even when inactive (the
--    public RLS hides inactive rows, which made the client check fail open).

-- ── 3. person_name, normalised ─────────────────────────────────────────────
create or replace function public.person_name(p_user uuid)
returns text language sql stable security definer set search_path = public as $$
  select case
           when n is null or n ~ '@' or n ~ '\d{6,}'
             or lower(regexp_replace(normalize(n, NFKC), '[\s­​-‏ - ⁠-⁯﻿._\-·•|/\\]', '', 'g')) like '%stayloop%'
           then null
           else left(regexp_replace(n, '[​-‏⁠-⁯﻿]', '', 'g'), 60)
         end
    from (
      select nullif(trim(coalesce(
        nullif(trim(u.raw_user_meta_data ->> 'display_name'), ''),
        nullif(trim(u.raw_user_meta_data ->> 'full_name'), ''),
        nullif(trim(u.raw_user_meta_data ->> 'name'), ''),
        (select nullif(trim(la.full_name), '') from public.landlords la where la.auth_id = p_user limit 1),
        (select nullif(trim(t.full_name), '') from public.tenants t where t.auth_id = p_user limit 1)
      )), '') as n
      from auth.users u where u.id = p_user
    ) x
$$;
revoke all on function public.person_name(uuid) from public, anon, authenticated;
grant execute on function public.person_name(uuid) to service_role;

-- ── 1 + 2. party_for ───────────────────────────────────────────────────────
create or replace function public.party_for(p_kind text, p_ref uuid, p_listing uuid default null, p_subject uuid default null)
returns text language plpgsql stable security definer set search_path = public as $$
declare
  r text;
  uid uuid := auth.uid();
  em text := lower(coalesce(auth.jwt() ->> 'email', ''));
  th record;
begin
  if uid is null then return null; end if;
  if p_kind = 'tenancy' then
    select case when m.role in ('landlord', 'property_manager') then 'landlord' when m.role = 'agent' then 'agent' else 'tenant' end into r
      from public.household_members m where m.household_id = p_ref and m.user_id = uid and m.status = 'active' limit 1;
  elsif p_kind in ('work_order', 'dispute') then
    if exists (select 1 from public.work_orders w where w.id = p_ref and w.landlord_auth_id = uid) then r := 'landlord';
    elsif exists (select 1 from public.work_orders w join public.service_providers p on p.id = w.provider_id where w.id = p_ref and p.auth_id = uid) then r := 'provider';
    else
      select case when m.role in ('landlord', 'property_manager') then 'landlord' when m.role = 'agent' then 'agent' else 'tenant' end into r
        from public.work_orders w join public.household_members m on m.household_id = w.household_id and m.user_id = uid and m.status = 'active'
       where w.id = p_ref limit 1;
    end if;
  elsif p_kind = 'application' then
    if exists (
      select 1 from public.applications a join public.listings l on l.id = a.listing_id
       where a.id = p_ref and l.source is distinct from 'realtor'
         and (l.landlord_id = uid or l.landlord_id in (select id from public.landlords where auth_id = uid))
    ) then r := 'landlord';
    elsif em <> '' and exists (select 1 from public.applications a where a.id = p_ref and lower(a.email) = em) then r := 'tenant';
    end if;
  elsif p_kind = 'listing_inquiry' then
    -- The stored thread is the truth, never the caller's arguments.
    select x.listing_id, x.subject_user into th from public.threads x where x.kind = 'listing_inquiry' and x.ref_id = p_ref;
    if found then
      if th.subject_user = uid then r := 'tenant';
      elsif th.listing_id is not null and exists (
        select 1 from public.listings l where l.id = th.listing_id and l.source is distinct from 'realtor'
           and (l.landlord_id = uid or l.landlord_id in (select id from public.landlords where auth_id = uid))
      ) then r := 'landlord';
      end if;
    end if;
  elsif p_kind = 'agent_client' then
    if exists (select 1 from public.agent_clients c where c.id = p_ref and c.agent_auth_id = uid) then r := 'agent';
    else
      select c.client_role into r from public.agent_clients c
       where c.id = p_ref and ((em <> '' and lower(c.email) = em)
          or exists (select 1 from public.delegations d where d.client_id = c.id and d.principal_auth_id = uid and d.status = 'active' and d.expires_at > now()))
       limit 1;
    end if;
  elsif p_kind = 'support' then
    if p_ref = uid then r := 'member'; end if;
  end if;
  if r is null and public.is_stayloop_admin() then r := 'admin'; end if;
  return r;
end $$;
revoke execute on function public.party_for(text, uuid, uuid, uuid) from public, anon;
grant execute on function public.party_for(text, uuid, uuid, uuid) to authenticated, service_role;

-- ── 1 + 2. people_for ──────────────────────────────────────────────────────
create or replace function public.people_for(p_kind text, p_ref uuid, p_listing uuid default null, p_subject uuid default null)
returns table (user_id uuid, name text, role text, channel text, pending boolean, is_me boolean)
language plpgsql stable security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  em text := lower(coalesce(auth.jwt() ->> 'email', ''));
  hh uuid;
  th record;
begin
  if uid is null or public.party_for(p_kind, p_ref, p_listing, p_subject) is null then return; end if;
  if p_kind = 'tenancy' then
    return query
      select m.user_id, public.person_name(m.user_id),
             case when m.role in ('landlord', 'property_manager') then 'landlord' when m.role = 'agent' then 'agent' else 'tenant' end,
             'app'::text, false, m.user_id = uid
        from public.household_members m where m.household_id = p_ref and m.status = 'active';
    return query
      select null::uuid, null::text,
             case when i.invited_role in ('landlord', 'property_manager') then 'landlord' when i.invited_role = 'agent' then 'agent' else 'tenant' end,
             'email'::text, true, (em <> '' and lower(i.invited_email) = em)
        from public.household_invites i
       where i.household_id = p_ref and i.accepted_at is null and i.declined_at is null and i.revoked_at is null and i.expires_at > now();
  elsif p_kind in ('work_order', 'dispute') then
    select w.household_id into hh from public.work_orders w where w.id = p_ref;
    return query select w.landlord_auth_id, public.person_name(w.landlord_auth_id), 'landlord'::text, 'app'::text, false, w.landlord_auth_id = uid
      from public.work_orders w where w.id = p_ref;
    return query select p.auth_id, coalesce(nullif(trim(p.trade_name), ''), p.legal_name), 'provider'::text,
             case when p.auth_id is null then 'email' else 'app' end, false, coalesce(p.auth_id = uid, false)
      from public.work_orders w join public.service_providers p on p.id = w.provider_id where w.id = p_ref;
    return query select null::uuid, nullif(trim(w.external_name), ''), 'external'::text, 'email'::text, false, false
      from public.work_orders w where w.id = p_ref and w.provider_id is null and w.external_email is not null;
    return query select m.user_id, public.person_name(m.user_id), 'tenant'::text, 'app'::text, false, m.user_id = uid
      from public.household_members m where m.household_id = hh and m.status = 'active' and m.role = 'tenant';
  elsif p_kind = 'application' then
    return query select la.auth_id, public.person_name(la.auth_id), 'landlord'::text, 'app'::text, false, la.auth_id = uid
      from public.applications a join public.listings l on l.id = a.listing_id
      join public.landlords la on (la.id = l.landlord_id or la.auth_id = l.landlord_id)
     where a.id = p_ref and la.auth_id is not null and l.source is distinct from 'realtor' limit 1;
    return query select null::uuid, nullif(trim(coalesce(a.first_name, '') || ' ' || coalesce(a.last_name, '')), ''), 'tenant'::text, 'email'::text, false,
             (em <> '' and lower(a.email) = em)
      from public.applications a where a.id = p_ref and a.email is not null;
  elsif p_kind = 'listing_inquiry' then
    select x.listing_id, x.subject_user into th from public.threads x where x.kind = 'listing_inquiry' and x.ref_id = p_ref;
    if not found then return; end if;
    if th.subject_user is not null then
      return query select th.subject_user, public.person_name(th.subject_user), 'tenant'::text, 'app'::text, false, th.subject_user = uid;
    end if;
    return query select la.auth_id, public.person_name(la.auth_id), 'landlord'::text, 'app'::text, false, la.auth_id = uid
      from public.listings l join public.landlords la on (la.id = l.landlord_id or la.auth_id = l.landlord_id)
     where l.id = th.listing_id and la.auth_id is not null and l.source is distinct from 'realtor' limit 1;
  elsif p_kind = 'agent_client' then
    return query select c.agent_auth_id, coalesce((select nullif(trim(ap.legal_name), '') from public.agent_profiles ap where ap.auth_id = c.agent_auth_id), public.person_name(c.agent_auth_id)),
             'agent'::text, 'app'::text, false, c.agent_auth_id = uid
      from public.agent_clients c where c.id = p_ref;
    return query
      select d.principal_auth_id, coalesce(public.person_name(d.principal_auth_id), nullif(trim(c.name), '')), c.client_role, 'app'::text, false, d.principal_auth_id = uid
        from public.agent_clients c join public.delegations d on d.client_id = c.id and d.status = 'active' and d.expires_at > now() and d.principal_auth_id is not null
       where c.id = p_ref limit 1;
    if not found then
      return query select null::uuid, nullif(trim(c.name), ''), c.client_role, 'email'::text, false, (em <> '' and lower(c.email) = em)
        from public.agent_clients c where c.id = p_ref and c.email is not null;
    end if;
  elsif p_kind = 'support' then
    return query select p_ref, public.person_name(p_ref), 'member'::text, 'app'::text, false, p_ref = uid;
    return query select null::uuid, 'Stayloop'::text, 'admin'::text, 'app'::text, false, public.is_stayloop_admin() and p_ref <> uid;
  end if;
end $$;
revoke execute on function public.people_for(text, uuid, uuid, uuid) from public, anon;
grant execute on function public.people_for(text, uuid, uuid, uuid) to authenticated;

-- ── 4. invited_email: not readable by every member ─────────────────────────
revoke select (invited_email) on public.household_invites from authenticated;

-- ── 5. no second landlord invited by a tenant ──────────────────────────────
create or replace function public.guard_household_invite_role()
returns trigger language plpgsql security definer set search_path = public as $$
declare inviter_role text;
begin
  if new.invited_role in ('landlord', 'property_manager') then
    select m.role into inviter_role from public.household_members m
     where m.household_id = new.household_id and m.user_id = new.invited_by and m.status = 'active' limit 1;
    if inviter_role = 'tenant' and exists (
      select 1 from public.household_members m where m.household_id = new.household_id and m.status = 'active' and m.role in ('landlord', 'property_manager')
    ) then
      raise exception 'landlord_already_member';
    end if;
  end if;
  return new;
end $$;
revoke execute on function public.guard_household_invite_role() from public, anon, authenticated, service_role;
drop trigger if exists trg_guard_household_invite_role on public.household_invites;
create trigger trg_guard_household_invite_role before insert on public.household_invites
  for each row execute function public.guard_household_invite_role();

-- ── 6. listing_sources ─────────────────────────────────────────────────────
create or replace function public.listing_sources(p_ids uuid[])
returns table (id uuid, source text) language sql stable security definer set search_path = public as $$
  select l.id, l.source from public.listings l where l.id = any(p_ids) limit 200
$$;
revoke execute on function public.listing_sources(uuid[]) from public, anon;
grant execute on function public.listing_sources(uuid[]) to authenticated;
