-- Full-site review 2026-09-14 (slice A security, slice B agent spine).
--
-- Row-owner policies on landlords / screenings / households are FOR ALL or
-- FOR UPDATE with no column restriction, and the paid / trust columns had no
-- guard trigger (unlike listings.verification_status and agent_profiles.status).
-- A free landlord could therefore PATCH landlords.plan='pro',
-- unlock_credits=999 or screenings.unlocked_at with the anon key + own JWT and
-- every paid gate (hasProAccess, enforceProGate, screen-score quota) would
-- honour it. Likewise a household creator could self-set verified=true, and a
-- landlord-side insert of a listing with source='realtor' went public at once
-- because guard_listing_trust_fields only fired BEFORE UPDATE.
--
-- Caller test: current_user rather than auth.role(). PostgREST switches to the
-- `authenticated` / `anon` database role for direct table writes, while the
-- SECURITY DEFINER RPCs that legitimately touch these columns
-- (consume_unlock_credit, claim_landlord, create_household_import, …) run as
-- their owner, and the service role runs as `service_role`. The guard
-- functions are therefore SECURITY INVOKER on purpose: a definer trigger
-- would always see its own owner as current_user and the test would be moot.

create or replace function public.is_direct_client_write()
returns boolean language sql stable as $$
  select current_user in ('authenticated', 'anon') and not public.is_stayloop_admin();
$$;

-- landlords: billing / entitlement columns are Stripe-webhook and RPC territory.
create or replace function public.guard_landlord_billing_fields()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if not public.is_direct_client_write() then return new; end if;
  if tg_op = 'INSERT' then
    new.plan := 'free';
    new.plan_status := null;
    new.plan_current_period_end := null;
    new.plan_cancel_at_period_end := false;
    new.stripe_customer_id := null;
    new.stripe_subscription_id := null;
    new.plan_card_brand := null;
    new.plan_card_last4 := null;
    new.unlock_credits := 0;
    return new;
  end if;
  new.plan := old.plan;
  new.plan_status := old.plan_status;
  new.plan_current_period_end := old.plan_current_period_end;
  new.plan_cancel_at_period_end := old.plan_cancel_at_period_end;
  new.stripe_customer_id := old.stripe_customer_id;
  new.stripe_subscription_id := old.stripe_subscription_id;
  new.plan_card_brand := old.plan_card_brand;
  new.plan_card_last4 := old.plan_card_last4;
  new.unlock_credits := old.unlock_credits;
  return new;
end $$;
drop trigger if exists trg_guard_landlord_billing on public.landlords;
create trigger trg_guard_landlord_billing
  before insert or update on public.landlords
  for each row execute function public.guard_landlord_billing_fields();

-- screenings: unlock stamps come from the Stripe webhook or consume_unlock_credit.
create or replace function public.guard_screening_unlock_fields()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if not public.is_direct_client_write() then return new; end if;
  if tg_op = 'INSERT' then
    new.unlocked_at := null;
    new.unlock_paid_by := null;
    return new;
  end if;
  new.unlocked_at := old.unlocked_at;
  new.unlock_paid_by := old.unlock_paid_by;
  return new;
end $$;
drop trigger if exists trg_guard_screening_unlock on public.screenings;
create trigger trg_guard_screening_unlock
  before insert or update on public.screenings
  for each row execute function public.guard_screening_unlock_fields();

-- households: `verified` is only ever set by the counterparty-confirmation
-- RPC; current_lease_id / created_by / source by the import + attach RPCs.
create or replace function public.guard_household_trust_fields()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if not public.is_direct_client_write() then return new; end if;
  if tg_op = 'INSERT' then
    new.verified := false;
    return new;
  end if;
  new.verified := old.verified;
  new.current_lease_id := old.current_lease_id;
  new.created_by := old.created_by;
  new.source := old.source;
  return new;
end $$;
drop trigger if exists trg_guard_household_trust on public.households;
create trigger trg_guard_household_trust
  before insert or update on public.households
  for each row execute function public.guard_household_trust_fields();

-- listings: the visibility invariant must hold on INSERT too. A landlord
-- (or the agent draft card) inserting source='realtor' / verification_status
-- ='verified' starts as a pending Stayloop listing; only admins and the
-- service-role import scripts may mark a row as Realtor-sourced.
create or replace function public.guard_listing_insert_trust_fields()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.role() = 'service_role' or public.is_stayloop_admin() then return new; end if;
  new.source := 'stayloop';
  new.verification_status := 'pending';
  new.verified_at := null;
  return new;
end $$;
drop trigger if exists trg_guard_listing_insert_trust on public.listings;
create trigger trg_guard_listing_insert_trust
  before insert on public.listings
  for each row execute function public.guard_listing_insert_trust_fields();

-- bump_trust_api_rate was never revoked from PUBLIC: anyone holding a partner
-- key id could burn that partner's per-minute budget with the anon key.
revoke execute on function public.bump_trust_api_rate(uuid) from public, anon, authenticated;
grant execute on function public.bump_trust_api_rate(uuid) to service_role;

-- household_invites.token is a bearer credential; members only need the
-- invite's status. decline_household_invite is anon-callable by design
-- (the invitee rejects from email without logging in), so the token must not
-- be readable by other members of the household. The hub page selects
-- explicit columns (app/h/[id]/page.tsx).
-- (A column-level revoke is a no-op while the table-level grant exists, so
-- drop the table grant and re-grant every column except token.)
revoke select on public.household_invites from anon, authenticated;
grant select (id, household_id, invited_email, invited_role, invited_by, expires_at,
              accepted_by, accepted_at, declined_at, revoked_at, created_at)
  on public.household_invites to authenticated;
