-- Review 2026-09-19 — data-layer fixes from the security and payments slices.

-- 1. Unlock ledger: "seen" is not "fulfilled". The webhook now stamps
--    fulfilled_at after the grant and re-runs fulfilment when a replayed
--    event finds a row without it.
alter table public.stripe_events add column if not exists fulfilled_at timestamptz;
update public.stripe_events set fulfilled_at = coalesce(fulfilled_at, received_at);

-- 2. households.verified means a COUNTERPARTY confirmed. The creator could
--    accept their own invite from a second address and verify alone; now the
--    flag needs an acceptor who is not the inviter and whose sign-in email is
--    the address the invite was sent to. Membership itself is unchanged
--    (people do sign in with a different email than the one invited).
create or replace function public.accept_household_invite(p_token text)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'auth'
as $function$
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

  select email into v_email from auth.users where id = v_uid;
  if v_inv.invited_role in ('landlord', 'property_manager') then
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

  select
    bool_or(role in ('landlord', 'property_manager')),
    bool_or(role = 'tenant')
  into v_has_landlord, v_has_tenant
  from public.household_members
  where household_id = v_inv.household_id and status = 'active';
  if coalesce(v_has_landlord, false) and coalesce(v_has_tenant, false)
     and v_uid is distinct from v_inv.invited_by
     and v_email is not null
     and lower(v_email) = lower(v_inv.invited_email) then
    update public.households set verified = true where id = v_inv.household_id and verified is distinct from true;
  end if;

  return v_inv.household_id;
end $function$;
revoke all on function public.accept_household_invite(text) from public, anon;
grant execute on function public.accept_household_invite(text) to authenticated, service_role;

-- 3. Dormant tables (0 rows) whose policies would bite the day the feature
--    ships.
--    a) anon could SELECT every screening case that has ANY share token —
--       the policy never compared a token. Shared reads must go through a
--       token-checking RPC when the feature is built.
drop policy if exists screening_cases_public_read_by_token on public.screening_cases;
--    b) a user could INSERT their own `subscription` row, and
--       get_entitlements prefers that table over landlords.plan.
drop policy if exists subscription_self on public.subscription;
create policy subscription_self_read on public.subscription for select using (account_id = auth.uid());
--    c) a brokerage owner could set registered = true — the only compliance
--       input to settle_referral_commission.
create or replace function public.guard_brokerage_fields()
returns trigger language plpgsql set search_path to 'public' as $function$
begin
  if not public.is_direct_client_write() then return new; end if;
  if tg_op = 'INSERT' then
    new.registered := false;
  else
    new.registered := old.registered;
    new.owner_id := old.owner_id;
  end if;
  return new;
end $function$;
drop trigger if exists trg_guard_brokerage on public.brokerages;
create trigger trg_guard_brokerage before insert or update on public.brokerages
  for each row execute function public.guard_brokerage_fields();
