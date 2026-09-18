-- Review 2026-09-17 (post-migration, slice G) — database-side fixes.
--
-- 1. households.verified was unreachable: the 20260914 guard freezes the
--    column for client writes and no RPC ever set it. The counterparty
--    accepting an invite IS the confirmation: once the household has a
--    member on each side (landlord/property_manager and tenant), mark it.
-- 2. A verified listing kept its badge through any content edit; material
--    changes now send it back to 'pending' for /admin/verify.
-- 3. household_invites: authenticated held UPDATE on every column (token,
--    invited_role, accepted_by…) behind a member-only policy; only
--    revoked_at is a legitimate client write (the app sends the rest via the
--    service role).
-- 4. rent_parties still joined the legacy lease_agreements table; rewritten
--    against lease_documents.

create or replace function public.accept_household_invite(p_token text)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'auth'
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_inv record;
  v_has_landlord boolean;
  v_has_tenant boolean;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  select * into v_inv from public.household_invites where token = p_token for update;
  if not found then raise exception 'invite not found'; end if;
  if v_inv.revoked_at is not null then raise exception 'invite revoked'; end if;
  if v_inv.expires_at < now() then raise exception 'invite expired'; end if;
  if v_inv.accepted_at is not null and v_inv.accepted_by <> v_uid then
    raise exception 'invite already used';
  end if;

  if v_inv.invited_role in ('landlord', 'property_manager') then
    select email into v_email from auth.users where id = v_uid;
    if not exists (select 1 from public.landlords where auth_id = v_uid) then
      insert into public.landlords (auth_id, email, plan, role)
      values (v_uid, coalesce(v_email, 'guest_' || v_uid::text || '@stayloop.local'), 'free', 'landlord')
      on conflict do nothing;
    end if;
  end if;

  insert into public.household_members (household_id, user_id, role)
  values (v_inv.household_id, v_uid, v_inv.invited_role)
  on conflict (household_id, user_id) do update set status = 'active';

  update public.household_invites
     set accepted_by = v_uid, accepted_at = coalesce(accepted_at, now())
   where id = v_inv.id;

  -- Counterparty confirmation: both sides are now active members.
  select
    bool_or(role in ('landlord', 'property_manager')),
    bool_or(role = 'tenant')
  into v_has_landlord, v_has_tenant
  from public.household_members
  where household_id = v_inv.household_id and status = 'active';
  if coalesce(v_has_landlord, false) and coalesce(v_has_tenant, false) then
    update public.households set verified = true where id = v_inv.household_id and verified is distinct from true;
  end if;

  return v_inv.household_id;
end $$;

create or replace function public.guard_listing_trust_fields()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  -- Admins (via /admin/verify) and the service role (backend / migrations)
  -- may change trust fields; landlord self-service cannot.
  if auth.role() = 'service_role' or public.is_stayloop_admin() then
    return new;
  end if;
  new.source := old.source;
  -- A verified listing that changes what was verified goes back to the
  -- queue instead of carrying the badge onto a different property.
  if old.verification_status = 'verified' and (
       new.address is distinct from old.address
    or new.unit is distinct from old.unit
    or new.city is distinct from old.city
    or new.postal_code is distinct from old.postal_code
    or new.monthly_rent is distinct from old.monthly_rent
    or new.bedrooms is distinct from old.bedrooms
    or new.property_type is distinct from old.property_type
  ) then
    new.verification_status := 'pending';
    new.verified_at := null;
  else
    new.verification_status := old.verification_status;
    new.verified_at := old.verified_at;
  end if;
  return new;
end $$;

revoke update on table public.household_invites from authenticated;
grant update (revoked_at) on table public.household_invites to authenticated;

drop policy if exists rent_parties on public.rent_payments;
create policy rent_parties on public.rent_payments
  for select to authenticated
  using (
    tenant_id in (select tenants.id from public.tenants where tenants.auth_id = auth.uid())
    or lease_id in (
      select ld.id from public.lease_documents ld
      where ld.landlord_id in (select l.id from public.landlords l where l.auth_id = auth.uid())
    )
  );
