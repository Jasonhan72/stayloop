-- 2026-10-12 · "测试期全免费" → 永久免费档 + Pro 试用 (user decision, see CLAUDE.md「免费模型」).
--   landlords.pro_trial_until  Pro entitlement without a subscription until this instant (null = none).
--   New landlord rows: 30 days from creation + 1 prepaid deep check (unlock_credits), whatever path created
--   the row (claim_landlord RPC, admin, client insert) — a BEFORE INSERT trigger that runs AFTER the billing
--   guard (name sorts later), so a direct client insert cannot set its own longer trial or more credits.
--   Existing rows: every account registered before the switch keeps Pro until 2026-11-14 (user decision) and
--   gets the one deep-check credit if it has none.
alter table public.landlords add column if not exists pro_trial_until timestamptz;
comment on column public.landlords.pro_trial_until is 'Pro entitlement without a subscription until this instant (new accounts: 30 days; accounts from the test month: 2026-11-14). Only the server / admin writes it.';

create or replace function public.guard_landlord_billing_fields() returns trigger
language plpgsql set search_path = public as $$
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
    new.pro_trial_until := null;
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
  new.pro_trial_until := old.pro_trial_until;
  return new;
end $$;

create or replace function public.landlord_trial_defaults() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.pro_trial_until is null and coalesce(new.plan, 'free') = 'free' then
    new.pro_trial_until := now() + interval '30 days';
  end if;
  if coalesce(new.unlock_credits, 0) < 1 and coalesce(new.plan, 'free') = 'free' then
    new.unlock_credits := 1;
  end if;
  return new;
end $$;
revoke all on function public.landlord_trial_defaults() from public, anon, authenticated, service_role;
drop trigger if exists trg_zz_landlord_trial_defaults on public.landlords;
create trigger trg_zz_landlord_trial_defaults before insert on public.landlords
  for each row execute function public.landlord_trial_defaults();

-- Accounts from the test month: Pro until 2026-11-14 (America/Toronto end of day) + the one credit.
update public.landlords
   set pro_trial_until = '2026-11-14T23:59:59-04:00'::timestamptz
 where created_at < '2026-10-15T00:00:00-04:00'::timestamptz and pro_trial_until is null;
update public.landlords
   set unlock_credits = 1
 where coalesce(plan, 'free') = 'free' and coalesce(unlock_credits, 0) < 1;
