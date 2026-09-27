-- 节点 5 · 租赁事务主记录与经纪委托 (2026-09-27)
--
-- 1. rental_matters — ONE id that follows a tenancy from application to
--    move-out. Nothing moves into a new table; rental_matter_links pins the
--    existing rows (listing / application / screening / lease / household /
--    work_order) to a matter. ensure_matter() derives the matter from the
--    chain the rows already carry (application → listing/landlord; lease →
--    application; household → lease; work order → household) and is the only
--    writer. my_matters() gives each party their matters as a score-free
--    summary; matter_party() is the one predicate.
-- 2. delegations — the client's written say-so that a RECO-registered agent
--    may act for them: principal (landlord or tenant) → delegate (agent),
--    scope, allowed actions, term, basis version; pending until the principal
--    confirms through an emailed link while signed in with that email;
--    revocable by either side at once. Rows are written only by the server;
--    the confirm token is never readable by the delegate.
-- 3. screenings.delegation_id — an agent's screening for a client carries the
--    delegation; the principal can read it; the agent keeps access only while
--    the delegation is active (RESTRICTIVE policy).
-- 4. threads.matter_id and agent_audit_events.rental_matter_id — pages,
--    notifications, exports and audits carry the matter.

-- ── 1. Matters ─────────────────────────────────────────────────────────────
create table if not exists public.rental_matters (
  id               uuid primary key default gen_random_uuid(),
  landlord_auth_id uuid not null,
  tenant_auth_id   uuid,
  tenant_email     text check (tenant_email is null or char_length(tenant_email) <= 200),
  listing_id       uuid references public.listings(id) on delete set null,
  address          text check (address is null or char_length(address) <= 300),
  unit             text check (unit is null or char_length(unit) <= 40),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists rental_matters_landlord_idx on public.rental_matters (landlord_auth_id, updated_at desc);
create index if not exists rental_matters_tenant_idx on public.rental_matters (tenant_auth_id) where tenant_auth_id is not null;
create index if not exists rental_matters_tenant_email_idx on public.rental_matters (lower(tenant_email)) where tenant_email is not null;

create table if not exists public.rental_matter_links (
  matter_id  uuid not null references public.rental_matters(id) on delete cascade,
  kind       text not null check (kind in ('listing', 'application', 'screening', 'lease', 'household', 'work_order')),
  ref_id     uuid not null,
  created_at timestamptz not null default now(),
  primary key (kind, ref_id)
);
create index if not exists rental_matter_links_matter_idx on public.rental_matter_links (matter_id);

-- ── 2. Delegations ─────────────────────────────────────────────────────────
create table if not exists public.delegations (
  id                uuid primary key default gen_random_uuid(),
  principal_auth_id uuid,
  principal_email   text not null check (char_length(principal_email) between 3 and 200),
  principal_name    text check (principal_name is null or char_length(principal_name) <= 120),
  delegate_auth_id  uuid not null,
  client_id         uuid references public.agent_clients(id) on delete set null,
  scope             text[] not null check (array_length(scope, 1) >= 1 and scope <@ array['listing', 'search', 'matter']::text[]),
  allowed_actions   text[] not null check (array_length(allowed_actions, 1) >= 1 and allowed_actions <@ array['screen', 'message', 'view_documents', 'draft_lease']::text[]),
  starts_at         timestamptz not null default now(),
  expires_at        timestamptz not null,
  basis_version     text not null default 'TRESA-2024-representation-v1' check (char_length(basis_version) <= 60),
  status            text not null default 'pending' check (status in ('pending', 'active', 'revoked', 'expired')),
  confirm_token     text unique check (confirm_token is null or char_length(confirm_token) >= 32),
  confirmed_at      timestamptz,
  revoked_at        timestamptz,
  revoked_by        uuid,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists delegations_delegate_idx on public.delegations (delegate_auth_id, status);
create index if not exists delegations_principal_idx on public.delegations (principal_auth_id) where principal_auth_id is not null;
create index if not exists delegations_principal_email_idx on public.delegations (lower(principal_email));

-- ── 4. Threads and audit rows carry the matter (before matter_summary(), a SQL function validated at definition) ──
alter table public.threads add column if not exists matter_id uuid references public.rental_matters(id) on delete set null;
create index if not exists threads_matter_idx on public.threads (matter_id) where matter_id is not null;
alter table public.agent_audit_events add column if not exists rental_matter_id uuid;
create index if not exists agent_audit_events_matter_row_idx on public.agent_audit_events (rental_matter_id) where rental_matter_id is not null;

-- ── Predicates ─────────────────────────────────────────────────────────────
create or replace function public.landlord_auth_of(p uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select coalesce((select l.auth_id from public.landlords l where l.id = p), p)
$$;
revoke execute on function public.landlord_auth_of(uuid) from public, anon, authenticated;

/** The caller's role in a matter: landlord · tenant · agent (live delegation from either party) · admin · null. */
create or replace function public.matter_party(p_matter uuid)
returns text language plpgsql stable security definer set search_path = public as $$
declare m record; uid uuid := auth.uid(); em text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if uid is null then return null; end if;
  select * into m from public.rental_matters where id = p_matter;
  if not found then return null; end if;
  if public.is_stayloop_admin() then return 'admin'; end if;
  if m.landlord_auth_id = uid then return 'landlord'; end if;
  if m.tenant_auth_id = uid or (em <> '' and lower(m.tenant_email) = em) then return 'tenant'; end if;
  if exists (
    select 1 from public.delegations d
     where d.delegate_auth_id = uid and d.status = 'active' and d.expires_at > now()
       and (d.principal_auth_id = m.landlord_auth_id or (m.tenant_auth_id is not null and d.principal_auth_id = m.tenant_auth_id) or (m.tenant_email is not null and lower(d.principal_email) = lower(m.tenant_email)))
  ) then return 'agent'; end if;
  return null;
end $$;
revoke execute on function public.matter_party(uuid) from public, anon;
grant execute on function public.matter_party(uuid) to authenticated, service_role;

/** Derive (or find) the matter of a row from the chain it already carries. Server-only writer. */
create or replace function public.ensure_matter(p_kind text, p_ref uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare mid uuid; ll uuid; te text; lid uuid; addr text; un text; hh uuid; app uuid; lease uuid; tenant uuid;
begin
  select matter_id into mid from public.rental_matter_links where kind = p_kind and ref_id = p_ref;
  if mid is not null then return mid; end if;
  if p_kind = 'application' then
    select public.landlord_auth_of(l.landlord_id), a.email, l.id, l.address, l.unit into ll, te, lid, addr, un
      from public.applications a join public.listings l on l.id = a.listing_id where a.id = p_ref;
    if ll is null then return null; end if;
    insert into public.rental_matters (landlord_auth_id, tenant_email, listing_id, address, unit) values (ll, te, lid, addr, un) returning id into mid;
    insert into public.rental_matter_links (matter_id, kind, ref_id) values (mid, 'application', p_ref) on conflict do nothing;
    insert into public.rental_matter_links (matter_id, kind, ref_id) select mid, 'screening', s.id from public.screenings s where s.application_id = p_ref on conflict do nothing;
    return mid;
  elsif p_kind = 'screening' then
    select application_id into app from public.screenings where id = p_ref;
    if app is null then return null; end if;
    mid := public.ensure_matter('application', app);
    if mid is null then return null; end if;
    insert into public.rental_matter_links (matter_id, kind, ref_id) values (mid, 'screening', p_ref) on conflict do nothing;
    return mid;
  elsif p_kind = 'lease' then
    select d.application_id, public.landlord_auth_of(d.landlord_id), d.tenant_email, d.unit_label into app, ll, te, addr from public.lease_documents d where d.id = p_ref;
    if not found then return null; end if;
    if app is not null then mid := public.ensure_matter('application', app); end if;
    if mid is null then
      if ll is null then return null; end if;
      insert into public.rental_matters (landlord_auth_id, tenant_email, address) values (ll, te, addr) returning id into mid;
    end if;
    insert into public.rental_matter_links (matter_id, kind, ref_id) values (mid, 'lease', p_ref) on conflict do nothing;
    update public.rental_matters set tenant_email = coalesce(tenant_email, te), address = coalesce(address, addr), updated_at = now() where id = mid;
    return mid;
  elsif p_kind = 'household' then
    select h.current_lease_id, h.address, h.unit into lease, addr, un from public.households h where h.id = p_ref;
    if not found then return null; end if;
    if lease is not null then mid := public.ensure_matter('lease', lease); end if;
    if mid is null then
      select m.user_id into ll from public.household_members m where m.household_id = p_ref and m.status = 'active' and m.role in ('landlord', 'property_manager') order by (m.role = 'landlord') desc limit 1;
      if ll is null then select created_by into ll from public.households where id = p_ref; end if;
      if ll is null then return null; end if;
      insert into public.rental_matters (landlord_auth_id, address, unit) values (ll, addr, un) returning id into mid;
    end if;
    insert into public.rental_matter_links (matter_id, kind, ref_id) values (mid, 'household', p_ref) on conflict do nothing;
    select m.user_id into tenant from public.household_members m where m.household_id = p_ref and m.status = 'active' and m.role = 'tenant' limit 1;
    update public.rental_matters set tenant_auth_id = coalesce(tenant_auth_id, tenant), address = coalesce(address, addr), unit = coalesce(unit, un), updated_at = now() where id = mid;
    return mid;
  elsif p_kind = 'work_order' then
    select household_id into hh from public.work_orders where id = p_ref;
    if hh is null then return null; end if;
    mid := public.ensure_matter('household', hh);
    if mid is null then return null; end if;
    insert into public.rental_matter_links (matter_id, kind, ref_id) values (mid, 'work_order', p_ref) on conflict do nothing;
    return mid;
  elsif p_kind = 'listing' then
    return (select matter_id from public.rental_matter_links where kind = 'listing' and ref_id = p_ref);
  end if;
  return null;
end $$;
revoke execute on function public.ensure_matter(text, uuid) from public, anon, authenticated;
grant execute on function public.ensure_matter(text, uuid) to service_role;

/** Score-free summary of one matter (called by my_matters; server may call it too). */
create or replace function public.matter_summary(p_matter uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', m.id, 'address', m.address, 'unit', m.unit, 'landlord_auth_id', m.landlord_auth_id, 'tenant_auth_id', m.tenant_auth_id, 'tenant_email', m.tenant_email, 'listing_id', m.listing_id, 'created_at', m.created_at,
    'application', (select jsonb_build_object('id', a.id, 'status', a.status, 'created_at', a.created_at, 'decision_notified_at', a.decision_notified_at)
                      from public.rental_matter_links l join public.applications a on a.id = l.ref_id where l.matter_id = m.id and l.kind = 'application' order by a.created_at desc limit 1),
    'screening', (select jsonb_build_object('id', s.id, 'status', s.status)
                    from public.rental_matter_links l join public.screenings s on s.id = l.ref_id where l.matter_id = m.id and l.kind = 'screening' order by s.created_at desc limit 1),
    'lease', (select jsonb_build_object('id', d.id, 'status', d.status, 'start_date', d.start_date, 'end_date', d.end_date, 'sent_at', d.sent_at, 'signed_at', d.signed_at)
                from public.rental_matter_links l join public.lease_documents d on d.id = l.ref_id where l.matter_id = m.id and l.kind = 'lease' order by d.created_at desc limit 1),
    'household', (select jsonb_build_object('id', h.id, 'verified', h.verified, 'status', h.status)
                    from public.rental_matter_links l join public.households h on h.id = l.ref_id where l.matter_id = m.id and l.kind = 'household' order by h.created_at desc limit 1),
    'work_orders', (select jsonb_build_object('open', count(*) filter (where w.status in ('offered', 'quoted', 'scheduled', 'in_progress', 'completed', 'rework', 'disputed')), 'total', count(*))
                      from public.rental_matter_links l join public.work_orders w on w.id = l.ref_id where l.matter_id = m.id and l.kind = 'work_order'),
    'threads', (select count(*) from public.threads t where t.matter_id = m.id),
    'delegation', (select jsonb_build_object('id', d.id, 'delegate_name', p.legal_name, 'scope', d.scope, 'expires_at', d.expires_at)
                     from public.delegations d left join public.agent_profiles p on p.auth_id = d.delegate_auth_id
                    where d.status = 'active' and d.expires_at > now()
                      and (d.principal_auth_id = m.landlord_auth_id or (m.tenant_auth_id is not null and d.principal_auth_id = m.tenant_auth_id) or (m.tenant_email is not null and lower(d.principal_email) = lower(m.tenant_email)))
                    order by d.created_at desc limit 1)
  ) from public.rental_matters m where m.id = p_matter
$$;
revoke execute on function public.matter_summary(uuid) from public, anon, authenticated;
grant execute on function public.matter_summary(uuid) to service_role;

/** The caller's matters (materialising any the chain implies), newest first. */
create or replace function public.my_matters()
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); em text := lower(coalesce(auth.jwt() ->> 'email', '')); r record;
begin
  if uid is null then return '[]'::jsonb; end if;
  for r in select a.id from public.applications a join public.listings l on l.id = a.listing_id
            where l.landlord_id = uid or l.landlord_id in (select id from public.landlords where auth_id = uid) or (em <> '' and lower(a.email) = em)
  loop perform public.ensure_matter('application', r.id); end loop;
  for r in select d.id from public.lease_documents d
            where d.landlord_id = uid or d.landlord_id in (select id from public.landlords where auth_id = uid) or (em <> '' and lower(d.tenant_email) = em)
  loop perform public.ensure_matter('lease', r.id); end loop;
  for r in select h.id from public.households h join public.household_members mm on mm.household_id = h.id and mm.user_id = uid and mm.status = 'active'
  loop perform public.ensure_matter('household', r.id); end loop;
  return coalesce((
    select jsonb_agg(public.matter_summary(m.id) order by m.updated_at desc)
      from public.rental_matters m
     where m.landlord_auth_id = uid or m.tenant_auth_id = uid or (em <> '' and lower(m.tenant_email) = em)
        or exists (select 1 from public.delegations d where d.delegate_auth_id = uid and d.status = 'active' and d.expires_at > now()
                     and (d.principal_auth_id = m.landlord_auth_id or (m.tenant_auth_id is not null and d.principal_auth_id = m.tenant_auth_id) or (m.tenant_email is not null and lower(d.principal_email) = lower(m.tenant_email))))
  ), '[]'::jsonb);
end $$;
revoke execute on function public.my_matters() from public, anon;
grant execute on function public.my_matters() to authenticated, service_role;

-- ── 3. Screenings under a delegation ──────────────────────────────────────
alter table public.screenings add column if not exists delegation_id uuid references public.delegations(id) on delete set null;
create index if not exists screenings_delegation_idx on public.screenings (delegation_id) where delegation_id is not null;

create or replace function public.guard_screening_delegation()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if not public.is_direct_client_write() then return new; end if;
  if tg_op = 'UPDATE' then new.delegation_id := old.delegation_id; return new; end if;
  if new.delegation_id is not null and not exists (
    select 1 from public.delegations d where d.id = new.delegation_id and d.delegate_auth_id = auth.uid() and d.status = 'active' and d.expires_at > now() and 'screen' = any (d.allowed_actions)
  ) then raise exception 'delegation_invalid'; end if;
  return new;
end $$;
revoke execute on function public.guard_screening_delegation() from public, anon, authenticated, service_role;
drop trigger if exists trg_guard_screening_delegation on public.screenings;
create trigger trg_guard_screening_delegation before insert or update on public.screenings
  for each row execute function public.guard_screening_delegation();

-- The principal reads screenings run for them; the agent keeps access only while the delegation is live.
drop policy if exists screenings_delegation_principal_read on public.screenings;
create policy screenings_delegation_principal_read on public.screenings for select to authenticated
  using (delegation_id is not null and exists (
    select 1 from public.delegations d where d.id = screenings.delegation_id
       and (d.principal_auth_id = auth.uid() or lower(d.principal_email) = lower(coalesce(auth.jwt() ->> 'email', '')))
  ));
drop policy if exists screenings_delegation_gate on public.screenings;
create policy screenings_delegation_gate on public.screenings as restrictive for select to authenticated
  using (
    delegation_id is null
    or public.is_stayloop_admin()
    or exists (
      select 1 from public.delegations d where d.id = screenings.delegation_id
         and ((d.delegate_auth_id = auth.uid() and d.status = 'active' and d.expires_at > now())
              or d.principal_auth_id = auth.uid() or lower(d.principal_email) = lower(coalesce(auth.jwt() ->> 'email', '')))
    )
  );

-- ── RLS ────────────────────────────────────────────────────────────────────
alter table public.rental_matters enable row level security;
alter table public.rental_matter_links enable row level security;
alter table public.delegations enable row level security;
drop policy if exists rental_matters_party_read on public.rental_matters;
create policy rental_matters_party_read on public.rental_matters for select to authenticated using (public.matter_party(id) is not null);
drop policy if exists rental_matter_links_party_read on public.rental_matter_links;
create policy rental_matter_links_party_read on public.rental_matter_links for select to authenticated using (public.matter_party(matter_id) is not null);
drop policy if exists delegations_party_read on public.delegations;
create policy delegations_party_read on public.delegations for select to authenticated
  using (delegate_auth_id = auth.uid() or principal_auth_id = auth.uid() or lower(principal_email) = lower(coalesce(auth.jwt() ->> 'email', '')) or public.is_stayloop_admin());

-- ── Grants (default privileges hand ALL to the API roles) ─────────────────
revoke all on public.rental_matters, public.rental_matter_links, public.delegations from anon, authenticated, service_role;
grant select on public.rental_matters, public.rental_matter_links to authenticated;
-- The confirm token is the principal's credential: never readable by the delegate (column-level grant).
grant select (id, principal_auth_id, principal_email, principal_name, delegate_auth_id, client_id, scope, allowed_actions, starts_at, expires_at, basis_version, status, confirmed_at, revoked_at, revoked_by, created_at, updated_at) on public.delegations to authenticated;
grant all on public.rental_matters, public.rental_matter_links, public.delegations to service_role;
grant select (delegation_id) on public.screenings to authenticated;

-- ── Backfill ───────────────────────────────────────────────────────────────
select public.ensure_matter('application', a.id) from public.applications a;
select public.ensure_matter('lease', d.id) from public.lease_documents d;
select public.ensure_matter('household', h.id) from public.households h;
select public.ensure_matter('work_order', w.id) from public.work_orders w;
update public.threads t
   set matter_id = l.matter_id
  from public.rental_matter_links l
 where t.matter_id is null
   and l.kind = case t.kind when 'tenancy' then 'household' when 'dispute' then 'work_order' else t.kind end
   and l.ref_id = t.ref_id;
