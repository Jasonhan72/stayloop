-- 消息系统 · 找得到人 (2026-09-30 · user: "现在很难找到对象去发消息")
--
-- The conversations stay one-per-matter (append-only, hash-chained); what
-- changes is that PEOPLE are named everywhere, never by address:
--   person_name(uid)        — display name from the account (settings 显示名 /
--                             full_name / name, then landlords / tenants rows);
--                             sanitised (no '@', no long digit runs, not "Stayloop").
--                             Internal: no API role may call it directly.
--   people_for(kind, ref, …) — who is in a matter, as the caller may see it:
--                             user_id (accounts only), name, role, channel
--                             (app / email), pending (invited, not joined),
--                             is_me. Returns nothing unless the caller is a party.
--   thread_people(thread)   — the same for an existing thread.
--   my_sender_label(thread) — the name stamped into sender_label at send time
--                             (a snapshot; NOT part of the v1 hash canonical form,
--                             so no existing fingerprint changes).
--   my_threads / my_message_targets — gain the counterparts' names and roles.
--   find_listing_thread(listing) — the prospect's own inquiry thread, if any.
-- Fixes found by the audit:
--   · party_for returned 'admin' before any real relationship, so an admin who
--     is also a landlord was recorded as "Stayloop" in their own tenancy. The
--     admin shortcut now comes last.
--   · agent_client: a delegation counts only while unexpired.
--   · work_orders.external_email (the landlord's own contractor contact) was
--     column-readable by tenants and providers; revoked. The landlord reads
--     their own contacts through my_external_contacts().

-- ── person_name ───────────────────────────────────────────────────────────
create or replace function public.person_name(p_user uuid)
returns text language sql stable security definer set search_path = public as $$
  select case when n is null or n ~ '@' or n ~ '\d{6,}' or n ~* 'stayloop' then null else left(n, 60) end
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

-- Batched, for the server (relay email labels, participants).
create or replace function public.person_names(p_users uuid[])
returns table (user_id uuid, name text) language sql stable security definer set search_path = public as $$
  select u, public.person_name(u) from unnest(p_users) as u
$$;
revoke all on function public.person_names(uuid[]) from public, anon, authenticated;
grant execute on function public.person_names(uuid[]) to service_role;

-- ── party_for: real relationships first, the admin shortcut last ───────────
create or replace function public.party_for(p_kind text, p_ref uuid, p_listing uuid default null, p_subject uuid default null)
returns text language plpgsql stable security definer set search_path = public as $$
declare
  r text;
  uid uuid := auth.uid();
  em text := lower(coalesce(auth.jwt() ->> 'email', ''));
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
       where a.id = p_ref and (l.landlord_id = uid or l.landlord_id in (select id from public.landlords where auth_id = uid))
    ) then r := 'landlord';
    elsif em <> '' and exists (select 1 from public.applications a where a.id = p_ref and lower(a.email) = em) then r := 'tenant';
    end if;
  elsif p_kind = 'listing_inquiry' then
    if p_subject = uid then r := 'tenant';
    elsif p_listing is not null and exists (
      select 1 from public.listings l where l.id = p_listing and (l.landlord_id = uid or l.landlord_id in (select id from public.landlords where auth_id = uid))
    ) then r := 'landlord';
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

-- ── people_for / thread_people ────────────────────────────────────────────
create or replace function public.people_for(p_kind text, p_ref uuid, p_listing uuid default null, p_subject uuid default null)
returns table (user_id uuid, name text, role text, channel text, pending boolean, is_me boolean)
language plpgsql stable security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  em text := lower(coalesce(auth.jwt() ->> 'email', ''));
  hh uuid;
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
     where a.id = p_ref and la.auth_id is not null limit 1;
    return query select null::uuid, nullif(trim(coalesce(a.first_name, '') || ' ' || coalesce(a.last_name, '')), ''), 'tenant'::text, 'email'::text, false,
             (em <> '' and lower(a.email) = em)
      from public.applications a where a.id = p_ref and a.email is not null;
  elsif p_kind = 'listing_inquiry' then
    if p_subject is not null then
      return query select p_subject, public.person_name(p_subject), 'tenant'::text, 'app'::text, false, p_subject = uid;
    end if;
    return query select la.auth_id, public.person_name(la.auth_id), 'landlord'::text, 'app'::text, false, la.auth_id = uid
      from public.listings l join public.landlords la on (la.id = l.landlord_id or la.auth_id = l.landlord_id)
     where l.id = p_listing and la.auth_id is not null limit 1;
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

create or replace function public.thread_people(p_thread uuid)
returns table (user_id uuid, name text, role text, channel text, pending boolean, is_me boolean)
language sql stable security definer set search_path = public as $$
  select p.* from public.threads t, lateral public.people_for(t.kind, t.ref_id, t.listing_id, t.subject_user) p where t.id = p_thread
$$;
revoke execute on function public.thread_people(uuid) from public, anon;
grant execute on function public.thread_people(uuid) to authenticated;

-- ── the sender's name, stamped at send time ────────────────────────────────
create or replace function public.my_sender_label(p_thread uuid)
returns text language plpgsql stable security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  party text := public.thread_party(p_thread);
  n text;
begin
  if uid is null or party is null then return null; end if;
  if party = 'admin' then return 'Stayloop'; end if;
  if party = 'provider' then
    select coalesce(nullif(trim(p.trade_name), ''), p.legal_name) into n from public.service_providers p where p.auth_id = uid limit 1;
  elsif party = 'agent' then
    select nullif(trim(ap.legal_name), '') into n from public.agent_profiles ap where ap.auth_id = uid limit 1;
  end if;
  return left(coalesce(n, public.person_name(uid)), 120);
end $$;
revoke execute on function public.my_sender_label(uuid) from public, anon;
grant execute on function public.my_sender_label(uuid) to authenticated;

create or replace function public.thread_messages_before_insert()
returns trigger language plpgsql security invoker set search_path = public as $$
declare
  party text;
  a jsonb;
  reg record;
  fixed jsonb := '[]'::jsonb;
begin
  if not public.is_direct_client_write() then return new; end if;
  new.created_at := now();
  new.sender_id := auth.uid();
  new.channel := 'app';
  party := public.thread_party(new.thread_id);
  if party is null then raise exception 'not_a_party'; end if;
  new.sender_kind := party;
  new.meta := '{}'::jsonb;
  -- A display-name snapshot (not in the hash canonical form); never client-supplied.
  new.sender_label := public.my_sender_label(new.thread_id);
  if new.kind not in ('message', 'retraction') then raise exception 'kind_not_allowed'; end if;
  if new.acting_role is not null and new.acting_role not in ('tenant', 'landlord', 'agent', 'provider', 'admin') then new.acting_role := null; end if;
  if new.kind = 'retraction' then
    if new.ref_message_id is null then raise exception 'retraction_needs_ref'; end if;
    if not exists (select 1 from public.thread_messages m where m.id = new.ref_message_id and m.thread_id = new.thread_id and m.sender_id = auth.uid() and m.kind = 'message') then raise exception 'retraction_not_yours'; end if;
    if exists (select 1 from public.thread_messages m where m.kind = 'retraction' and m.ref_message_id = new.ref_message_id) then raise exception 'already_retracted'; end if;
    new.attachments := '[]'::jsonb;
  else
    new.ref_message_id := null;
  end if;
  if jsonb_array_length(new.attachments) > 6 then raise exception 'too_many_attachments'; end if;
  for a in select * from jsonb_array_elements(new.attachments) loop
    select * into reg from public.thread_attachments r where r.path = a ->> 'path' and r.thread_id = new.thread_id;
    if not found then raise exception 'attachment_not_registered'; end if;
    fixed := fixed || jsonb_build_object('path', reg.path, 'name', reg.name, 'mime', reg.mime, 'size', reg.size, 'sha256', reg.sha256);
  end loop;
  new.attachments := fixed;
  return new;
end $$;
revoke execute on function public.thread_messages_before_insert() from public, anon, authenticated, service_role;

-- ── my_threads with counterparts ──────────────────────────────────────────
drop function if exists public.my_unread_messages();
drop function if exists public.my_threads();
create function public.my_threads()
returns table (
  id uuid, kind text, ref_id uuid, household_id uuid, listing_id uuid, matter_id uuid, title text,
  party text, last_id bigint, last_at timestamptz, last_body text, last_kind text, last_sender_kind text,
  last_sender_id uuid, last_sender_label text, last_channel text, unread integer, awaiting_reply boolean, message_count integer,
  counterpart_names text[], counterpart_roles text[]
) language sql stable security invoker set search_path = public as $$
  with t as (
    select th.*, public.thread_party(th.id) as party from public.threads th
  ), last as (
    select distinct on (m.thread_id) m.thread_id, m.id, m.created_at, m.body, m.kind, m.sender_kind, m.sender_id, m.sender_label, m.channel
      from public.thread_messages m join t on t.id = m.thread_id
     where m.kind <> 'retraction'
     order by m.thread_id, m.id desc
  ), counts as (
    select m.thread_id,
           count(*) filter (where m.kind <> 'retraction')::int as n,
           count(*) filter (where m.kind in ('message', 'formal_copy') and m.sender_id is distinct from auth.uid()
                             and m.id > coalesce(r.last_opened_id, 0))::int as unread
      from public.thread_messages m join t on t.id = m.thread_id
      left join public.message_reads r on r.thread_id = m.thread_id and r.user_id = auth.uid()
     group by m.thread_id
  )
  select t.id, t.kind, t.ref_id, t.household_id, t.listing_id, t.matter_id, t.title, t.party,
         l.id, l.created_at, left(l.body, 240), l.kind, l.sender_kind, l.sender_id, l.sender_label, l.channel,
         coalesce(c.unread, 0),
         (l.kind = 'message' and l.sender_id is distinct from auth.uid()),
         coalesce(c.n, 0),
         coalesce(pp.names, '{}'), coalesce(pp.roles, '{}')
    from t join last l on l.thread_id = t.id left join counts c on c.thread_id = t.id
    left join lateral (
      select array_agg(coalesce(p.name, '') order by p.role) as names, array_agg(p.role order by p.role) as roles
        from public.people_for(t.kind, t.ref_id, t.listing_id, t.subject_user) p where not p.is_me
    ) pp on true
   where t.party is not null
   order by l.id desc
   limit 300
$$;
revoke execute on function public.my_threads() from public, anon;
grant execute on function public.my_threads() to authenticated, service_role;

create function public.my_unread_messages()
returns integer language sql stable security invoker set search_path = public as $$
  select coalesce(sum(unread), 0)::int from public.my_threads()
$$;
revoke execute on function public.my_unread_messages() from public, anon;
grant execute on function public.my_unread_messages() to authenticated, service_role;

-- ── my_message_targets with the people in each matter ─────────────────────
drop function if exists public.my_message_targets();
create function public.my_message_targets()
returns table (kind text, ref_id uuid, title text, subtitle text, party text, thread_id uuid, at timestamptz,
               listing_id uuid, subject_user uuid, status text, people_names text[], people_roles text[], reachable boolean)
language plpgsql stable security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  em text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if uid is null then return; end if;
  return query
  with raw as (
    -- tenancies
    select 'tenancy'::text as kind, h.id as ref_id, (h.address || coalesce(' #' || h.unit, ''))::text as title, null::text as subtitle,
           h.created_at as at, null::uuid as listing_id, null::uuid as subject_user, h.status::text as status
      from public.household_members m join public.households h on h.id = m.household_id
     where m.user_id = uid and m.status = 'active'
    union all
    -- work orders (open, or closed within 60 days)
    select 'work_order', w.id, coalesce(tk.title, 'Work order')::text, (h.address || coalesce(' #' || h.unit, ''))::text,
           greatest(w.created_at, w.updated_at), null, null, w.status::text
      from public.work_orders w
      join public.maintenance_tickets tk on tk.id = w.ticket_id
      left join public.households h on h.id = w.household_id
      left join public.service_providers p on p.id = w.provider_id
     where (w.landlord_auth_id = uid or p.auth_id = uid
            or exists (select 1 from public.household_members hm where hm.household_id = w.household_id and hm.user_id = uid and hm.status = 'active' and hm.role = 'tenant'))
       and (w.status not in ('closed', 'cancelled', 'declined') or w.updated_at > now() - interval '60 days')
    union all
    -- applications received (not archived) or sent (by login email)
    select 'application', a.id, (l.address || coalesce(' #' || l.unit, ''))::text, null::text, a.created_at, l.id, null, a.status::text
      from public.applications a join public.listings l on l.id = a.listing_id
     where ((l.landlord_id = uid or l.landlord_id in (select la.id from public.landlords la where la.auth_id = uid)) and a.archived_at is null)
        or (em <> '' and lower(a.email) = em)
    union all
    -- listing inquiries that exist (opened from the listing page)
    select 'listing_inquiry', x.ref_id, coalesce(x.title, 'Listing')::text, null::text, x.created_at, x.listing_id, x.subject_user, null::text
      from public.threads x
     where x.kind = 'listing_inquiry' and (x.subject_user = uid or exists (
       select 1 from public.listings l where l.id = x.listing_id and (l.landlord_id = uid or l.landlord_id in (select la.id from public.landlords la where la.auth_id = uid))))
    union all
    -- agent ↔ client: the agent's own book; a client sees the agent only once the
    -- engagement is real (an active delegation, or a conversation that already has messages)
    select 'agent_client', c.id, null::text, null::text, c.created_at, null, null, c.stage::text
      from public.agent_clients c
     where c.agent_auth_id = uid
        or exists (select 1 from public.delegations d where d.client_id = c.id and d.principal_auth_id = uid and d.status = 'active' and d.expires_at > now())
        or (em <> '' and lower(c.email) = em and exists (
              select 1 from public.threads x join public.thread_messages tm on tm.thread_id = x.id where x.kind = 'agent_client' and x.ref_id = c.id))
    union all
    select 'support', uid, 'Stayloop'::text, null::text, now(), null, null, null::text
  ), ranked as (
    select r.*, row_number() over (partition by r.kind order by r.at desc) as rn from raw r
  )
  select r.kind, r.ref_id, r.title, r.subtitle, r.party,
         (select x.id from public.threads x where x.kind = r.kind and x.ref_id = r.ref_id),
         r.at, r.listing_id, r.subject_user, r.status,
         coalesce(pp.names, '{}'), coalesce(pp.roles, '{}'), coalesce(pp.n, 0) > 0
    from (select k.*, public.party_for(k.kind, k.ref_id, k.listing_id, k.subject_user) as party from ranked k where k.rn <= 60) r
    left join lateral (
      select array_agg(coalesce(p.name, '') order by p.role) as names, array_agg(p.role order by p.role) as roles, count(*) as n
        from public.people_for(r.kind, r.ref_id, r.listing_id, r.subject_user) p where not p.is_me
    ) pp on true
   where r.party is not null
   order by r.at desc;
end $$;
revoke execute on function public.my_message_targets() from public, anon;
grant execute on function public.my_message_targets() to authenticated, service_role;

-- ── the prospect's own inquiry thread on a listing ─────────────────────────
create or replace function public.find_listing_thread(p_listing uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select x.id from public.threads x
   where x.kind = 'listing_inquiry' and x.listing_id = p_listing and x.subject_user = auth.uid() and auth.uid() is not null
   limit 1
$$;
revoke execute on function public.find_listing_thread(uuid) from public, anon;
grant execute on function public.find_listing_thread(uuid) to authenticated;

-- ── a contractor's personal email is the landlord's alone ─────────────────
revoke select (external_email) on public.work_orders from authenticated;
create or replace function public.my_external_contacts()
returns table (email text, name text, last_at timestamptz, jobs integer)
language sql stable security definer set search_path = public as $$
  select lower(w.external_email), max(nullif(trim(w.external_name), '')), max(w.created_at), count(*)::int
    from public.work_orders w
   where w.landlord_auth_id = auth.uid() and w.external_email is not null
   group by lower(w.external_email)
   order by max(w.created_at) desc
$$;
revoke execute on function public.my_external_contacts() from public, anon;
grant execute on function public.my_external_contacts() to authenticated;
