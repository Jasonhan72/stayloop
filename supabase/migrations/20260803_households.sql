-- Households — imported (already-signed) leases become managed tenancies.
-- Design: design/household-import-plan.md
--
-- The container is NEW (`households`), not the legacy `tenancies` table: that
-- one (0 rows, zero code consumers) encodes a prior-landlord rating history —
-- a different concept — and stays untouched.
--
-- Every import ALSO creates a lease_documents row (status 'imported'): three
-- existing consumers key off that table — rent_payments.lease_id, the public
-- passport page's rent-punctuality (via tenant_email), and the proactive
-- renewal scanner — and this one row lights all of them up with zero dual
-- paths.
--
-- ID discipline: every user reference in the new tables is auth.users.id.
-- The landlords.id/auth_id dual-ID trap stays confined to the legacy tables.

-- ── Tables ──────────────────────────────────────────────────────────────────

create table if not exists public.households (
  id               uuid primary key default gen_random_uuid(),
  address          text not null,
  unit             text,
  city             text,
  monthly_rent     numeric,
  rent_due_day     int check (rent_due_day between 1 and 31),
  start_date       date,
  end_date         date,
  current_lease_id uuid references public.lease_documents(id),
  status           text not null default 'active' check (status in ('active','ended','disputed')),
  source           text not null default 'imported' check (source in ('imported','esign')),
  -- Self-asserted until the counterparty joins AND confirms; nothing public
  -- may ever key off an unverified household.
  verified         boolean not null default false,
  created_by       uuid not null,
  created_at       timestamptz not null default now()
);

create table if not exists public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id      uuid not null,
  role         text not null check (role in ('landlord','tenant','agent','property_manager')),
  status       text not null default 'active' check (status in ('active','left')),
  joined_at    timestamptz not null default now(),
  primary key (household_id, user_id)
);

create table if not exists public.household_invites (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households(id) on delete cascade,
  -- hex of 24 random bytes: 48 chars, satisfies the same shape rules as
  -- passport_share_tokens (>=32 chars, [A-Za-z0-9_-]).
  token         text not null unique default encode(gen_random_bytes(24), 'hex')
                check (char_length(token) >= 32 and token ~ '^[A-Za-z0-9_-]+$'),
  invited_email text not null,
  invited_role  text not null check (invited_role in ('landlord','tenant','agent','property_manager')),
  invited_by    uuid not null,
  expires_at    timestamptz not null default now() + interval '14 days',
  accepted_by   uuid,
  accepted_at   timestamptz,
  declined_at   timestamptz,
  revoked_at    timestamptz,
  created_at    timestamptz not null default now()
);

create table if not exists public.household_messages (
  id           bigserial primary key,
  household_id uuid not null references public.households(id) on delete cascade,
  sender_id    uuid not null,
  body         text not null check (char_length(body) between 1 and 4000),
  created_at   timestamptz not null default now()
);

create index if not exists household_members_user_idx on public.household_members (user_id) where status = 'active';
create index if not exists household_invites_household_idx on public.household_invites (household_id);
create index if not exists household_messages_household_idx on public.household_messages (household_id, id desc);

-- Maintenance joins the household world additively; listing_id stays for the
-- legacy listing-scoped path.
alter table public.maintenance_tickets add column if not exists household_id uuid references public.households(id) on delete cascade;
alter table public.maintenance_tickets add column if not exists opened_by uuid;
create index if not exists maintenance_tickets_household_idx on public.maintenance_tickets (household_id) where household_id is not null;

-- ── RLS ─────────────────────────────────────────────────────────────────────

alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.household_invites enable row level security;
alter table public.household_messages enable row level security;

-- Membership predicate used by every policy below.
create or replace function public.is_household_member(p_household uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.household_members m
    where m.household_id = p_household and m.user_id = auth.uid() and m.status = 'active'
  )
$$;
revoke execute on function public.is_household_member(uuid) from public, anon;
grant execute on function public.is_household_member(uuid) to authenticated, service_role;

create policy households_member_read on public.households
  for select using (public.is_household_member(id));
create policy households_creator_update on public.households
  for update using (created_by = auth.uid());

create policy household_members_read on public.household_members
  for select using (public.is_household_member(household_id));
-- Leave is the only direct write members get; joins go through the invite RPC.
create policy household_members_leave on public.household_members
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy household_invites_member_read on public.household_invites
  for select using (public.is_household_member(household_id));
create policy household_invites_member_write on public.household_invites
  for insert with check (invited_by = auth.uid() and public.is_household_member(household_id));
create policy household_invites_revoke on public.household_invites
  for update using (public.is_household_member(household_id));

create policy household_messages_read on public.household_messages
  for select using (public.is_household_member(household_id));
create policy household_messages_send on public.household_messages
  for insert with check (sender_id = auth.uid() and public.is_household_member(household_id));

-- Household members may read the imported lease row and its rent records —
-- the legacy leases_parties policy resolves tenants through the dead
-- `tenants` table, so without this the tenant who just joined could not see
-- their own lease.
create policy leases_household_members on public.lease_documents
  for select using (exists (
    select 1 from public.households h
    where h.current_lease_id = lease_documents.id and public.is_household_member(h.id)
  ));

alter table public.rent_payments enable row level security;
create policy rent_household_members on public.rent_payments
  for select using (exists (
    select 1 from public.households h
    where h.current_lease_id = rent_payments.lease_id and public.is_household_member(h.id)
  ));
create policy rent_household_members_insert on public.rent_payments
  for insert with check (exists (
    select 1 from public.households h
    where h.current_lease_id = rent_payments.lease_id and public.is_household_member(h.id)
  ));

create policy maint_household_members on public.maintenance_tickets
  for all using (household_id is not null and public.is_household_member(household_id))
  with check (household_id is not null and public.is_household_member(household_id));

-- ── RPCs ────────────────────────────────────────────────────────────────────
-- SECURITY DEFINER discipline (learned twice, 20260728 + LTB): Postgres
-- grants PUBLIC execute on new functions by default — revoke from public and
-- anon in the same migration, before anything ships.

-- Create the household + its imported lease row in one transaction. Definer,
-- because the creator may be a tenant or agent, and lease_documents' legacy
-- insert policy only admits landlords.
create or replace function public.create_household_import(
  p_address       text,
  p_unit          text,
  p_city          text,
  p_monthly_rent  numeric,
  p_rent_due_day  int,
  p_start_date    date,
  p_end_date      date,
  p_creator_role  text,
  p_tenant_name   text,
  p_tenant_email  text
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_household uuid;
  v_lease uuid;
  v_landlord_profile uuid;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if p_creator_role not in ('landlord','tenant','agent','property_manager') then
    raise exception 'invalid role';
  end if;
  if p_address is null or length(trim(p_address)) < 5 then
    raise exception 'address required';
  end if;

  insert into public.households (address, unit, city, monthly_rent, rent_due_day, start_date, end_date, created_by)
  values (trim(p_address), nullif(trim(coalesce(p_unit,'')),''), nullif(trim(coalesce(p_city,'')),''),
          p_monthly_rent, p_rent_due_day, p_start_date, p_end_date, v_uid)
  returning id into v_household;

  insert into public.household_members (household_id, user_id, role)
  values (v_household, v_uid, p_creator_role);

  -- When the creator IS the landlord, link their legacy profile id so the
  -- old leases_parties policy also matches for them.
  if p_creator_role = 'landlord' then
    select id into v_landlord_profile from public.landlords where auth_id = v_uid limit 1;
  end if;

  insert into public.lease_documents (status, monthly_rent, start_date, end_date,
                                      tenant_name, tenant_email, unit_label, form_type, landlord_id)
  values ('imported', p_monthly_rent, p_start_date, p_end_date,
          nullif(trim(coalesce(p_tenant_name,'')),''), nullif(lower(trim(coalesce(p_tenant_email,''))),''),
          nullif(trim(coalesce(p_unit,'')),''), 'imported', v_landlord_profile)
  returning id into v_lease;

  update public.households set current_lease_id = v_lease where id = v_household;
  return v_household;
end $$;
revoke execute on function public.create_household_import(text,text,text,numeric,int,date,date,text,text,text) from public, anon;
grant execute on function public.create_household_import(text,text,text,numeric,int,date,date,text,text,text) to authenticated;

-- Attach the uploaded lease file after the storage upload (which needs the
-- membership that create_household_import just established).
create or replace function public.attach_household_lease_file(p_household uuid, p_path text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_household_member(p_household) then raise exception 'not a member'; end if;
  if p_path !~ ('^' || p_household::text || '/') then raise exception 'path outside household'; end if;
  update public.lease_documents set pdf_path = p_path
  where id = (select current_lease_id from public.households where id = p_household);
end $$;
revoke execute on function public.attach_household_lease_file(uuid, text) from public, anon;
grant execute on function public.attach_household_lease_file(uuid, text) to authenticated;

-- What the /join/[token] landing page may see BEFORE login: enough to decide,
-- nothing sensitive (no rent, no lease file).
create or replace function public.peek_household_invite(p_token text)
returns table (address text, unit text, city text, invited_role text, inviter_name text, state text)
language plpgsql stable security definer set search_path = public
as $$
declare
  v record;
begin
  select i.*, h.address as h_address, h.unit as h_unit, h.city as h_city
    into v
  from public.household_invites i join public.households h on h.id = i.household_id
  where i.token = p_token;
  if not found then
    return query select null::text, null::text, null::text, null::text, null::text, 'not_found'::text; return;
  end if;
  return query select
    v.h_address, v.h_unit, v.h_city, v.invited_role,
    coalesce((select l.full_name from public.landlords l where l.auth_id = v.invited_by limit 1),
             (select split_part(u.email,'@',1) from auth.users u where u.id = v.invited_by)),
    case when v.revoked_at is not null then 'revoked'
         when v.accepted_at is not null then 'accepted'
         when v.declined_at is not null then 'declined'
         when v.expires_at < now() then 'expired'
         else 'pending' end;
end $$;
-- Deliberately callable by anon: the token IS the credential, same posture as
-- the passport share page.
revoke execute on function public.peek_household_invite(text) from public;
grant execute on function public.peek_household_invite(text) to anon, authenticated, service_role;

-- Accept: validates the token, ensures the joiner has a profile row with the
-- INVITED role (claim_landlord() would stamp everyone 'landlord' — an invited
-- tenant must land in the tenant workspace), adds membership, stamps the
-- invite.
create or replace function public.accept_household_invite(p_token text)
returns uuid
language plpgsql security definer set search_path = public, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_inv record;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  select * into v_inv from public.household_invites where token = p_token for update;
  if not found then raise exception 'invite not found'; end if;
  if v_inv.revoked_at is not null then raise exception 'invite revoked'; end if;
  if v_inv.expires_at < now() then raise exception 'invite expired'; end if;
  if v_inv.accepted_at is not null and v_inv.accepted_by <> v_uid then
    raise exception 'invite already used';
  end if;

  select email into v_email from auth.users where id = v_uid;
  if not exists (select 1 from public.landlords where auth_id = v_uid) then
    insert into public.landlords (auth_id, email, plan, role)
    values (v_uid, coalesce(v_email, 'guest_' || v_uid::text || '@stayloop.local'), 'free',
            case when v_inv.invited_role = 'property_manager' then 'landlord' else v_inv.invited_role end);
  end if;

  insert into public.household_members (household_id, user_id, role)
  values (v_inv.household_id, v_uid, v_inv.invited_role)
  on conflict (household_id, user_id) do update set status = 'active';

  update public.household_invites
     set accepted_by = v_uid, accepted_at = coalesce(accepted_at, now())
   where id = v_inv.id;

  return v_inv.household_id;
end $$;
revoke execute on function public.accept_household_invite(text) from public, anon;
grant execute on function public.accept_household_invite(text) to authenticated;

-- Decline — the PIPEDA posture: the invited party can refuse, which marks the
-- household disputed so the uploader cannot pretend an active managed tenancy.
create or replace function public.decline_household_invite(p_token text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_inv record;
begin
  select * into v_inv from public.household_invites where token = p_token for update;
  if not found then raise exception 'invite not found'; end if;
  if v_inv.accepted_at is not null then raise exception 'already accepted'; end if;
  update public.household_invites set declined_at = coalesce(declined_at, now()) where id = v_inv.id;
  update public.households set status = 'disputed' where id = v_inv.household_id and status = 'active';
end $$;
-- Anon may decline: the recipient should not need an account to say no.
revoke execute on function public.decline_household_invite(text) from public;
grant execute on function public.decline_household_invite(text) to anon, authenticated;

-- ── Storage ─────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('tenancy-files', 'tenancy-files', false)
on conflict (id) do nothing;

create policy tenancy_files_member_read on storage.objects
  for select using (
    bucket_id = 'tenancy-files'
    and public.is_household_member(((storage.foldername(name))[1])::uuid)
  );
create policy tenancy_files_member_write on storage.objects
  for insert with check (
    bucket_id = 'tenancy-files'
    and public.is_household_member(((storage.foldername(name))[1])::uuid)
  );

-- ── Applied as follow-up migration households_lease_imported_status ─────────
-- The E2E caught what the schema listing didn't show: lease_documents carries
-- CHECK constraints on status and form_type (the earlier probe batched two
-- statements and the MCP returned only the second result set — single-statement
-- probes from now on). Both now admit the imported shape.
-- alter table lease_documents ... check (form_type in ('ontario_standard','trreb','imported'))
-- alter table lease_documents ... check (status in ('draft','sent','signed_tenant','signed_both','active','ended','imported'))

-- ── Applied as follow-up migration households_rent_payments_repoint ─────────
-- rent_payments.lease_id pointed at lease_agreements (a THIRD legacy lease
-- table: 0 rows, zero consumers) and tenant_id at the dead `tenants` table.
-- Both empty, nothing writes them → lease_id now references
-- lease_documents(id) on delete cascade, tenant_id FK dropped (column stays,
-- carries auth.users.id).
