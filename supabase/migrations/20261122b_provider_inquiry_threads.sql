-- V0.9 (2026-11-22): a conversation between a person and a service provider, opened from the
-- 「找经纪和服务商」 directory (维修服务 / 专业服务). Until now those two tabs only showed an e-mail
-- address and a phone number; the agent tab had 「发消息」. The new kind is `provider_inquiry`:
--   · one thread per (provider, person): ref_id = uuidv5(provider id, person id), written by the server
--     (app/api/providers/[id]/contact) — never opened by a client RPC, so open_thread is unchanged;
--   · the thread stores provider_id and subject_user; who is a party is read from the STORED thread,
--     never from the caller's arguments (the same rule as listing_inquiry);
--   · the person is 'member' (any hat may write to a provider), the provider's account is 'provider';
--     anyone else is no party. The sender kind of a message is set from this by the insert trigger.
-- party_for() and people_for() below are the live definitions with one branch added to each
-- (generated from pg_get_functiondef, not retyped); their ACLs are untouched by CREATE OR REPLACE
-- (authenticated + service_role, no anon / PUBLIC).

alter table public.threads add column if not exists provider_id uuid references public.service_providers(id) on delete set null;
create index if not exists threads_provider_id_idx on public.threads (provider_id) where provider_id is not null;

alter table public.threads drop constraint if exists threads_kind_check;
alter table public.threads add constraint threads_kind_check
  check (kind = any (array['work_order'::text, 'application'::text, 'tenancy'::text, 'dispute'::text, 'listing_inquiry'::text, 'agent_client'::text, 'support'::text, 'provider_inquiry'::text]));

CREATE OR REPLACE FUNCTION public.party_for(p_kind text, p_ref uuid, p_listing uuid DEFAULT NULL::uuid, p_subject uuid DEFAULT NULL::uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  elsif p_kind = 'provider_inquiry' then
    -- The stored thread is the truth, never the caller's arguments (as for listing_inquiry).
    select x.provider_id, x.subject_user into th from public.threads x where x.kind = 'provider_inquiry' and x.ref_id = p_ref;
    if found then
      if th.subject_user = uid then r := 'member';
      elsif th.provider_id is not null and exists (
        select 1 from public.service_providers p where p.id = th.provider_id and p.auth_id = uid
      ) then r := 'provider';
      end if;
    end if;
  elsif p_kind = 'support' then
    if p_ref = uid then r := 'member'; end if;
  end if;
  if r is null and public.is_stayloop_admin() then r := 'admin'; end if;
  return r;
end $function$;

CREATE OR REPLACE FUNCTION public.people_for(p_kind text, p_ref uuid, p_listing uuid DEFAULT NULL::uuid, p_subject uuid DEFAULT NULL::uuid)
 RETURNS TABLE(user_id uuid, name text, role text, channel text, pending boolean, is_me boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  elsif p_kind = 'provider_inquiry' then
    select x.provider_id, x.subject_user into th from public.threads x where x.kind = 'provider_inquiry' and x.ref_id = p_ref;
    if not found then return; end if;
    if th.subject_user is not null then
      return query select th.subject_user, public.person_name(th.subject_user), 'member'::text, 'app'::text, false, th.subject_user = uid;
    end if;
    return query select p.auth_id, coalesce(nullif(trim(p.trade_name), ''), p.legal_name), 'provider'::text,
             case when p.auth_id is null then 'email' else 'app' end, false, coalesce(p.auth_id = uid, false)
      from public.service_providers p where p.id = th.provider_id;
  elsif p_kind = 'support' then
    return query select p_ref, public.person_name(p_ref), 'member'::text, 'app'::text, false, p_ref = uid;
    return query select null::uuid, 'Stayloop'::text, 'admin'::text, 'app'::text, false, public.is_stayloop_admin() and p_ref <> uid;
  end if;
end $function$;
