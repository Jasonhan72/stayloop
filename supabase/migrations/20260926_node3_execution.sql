-- 节点 3 · 可执行 (2026-09-26): the services marketplace gets an SLA, a
-- required decline reason, quote versions, tiered credential-expiry
-- reminders and one admin-configurable rule (credential grace days).
--
--   • dispatch_policies.quote_hours — how long a contractor has to answer an
--     offer (24–72 h, default 48). createWorkOrder stamps
--     work_orders.quote_due_at from it; the daily sweep (proactive cron)
--     marks sla_overdue_at once, reminds the contractor and hands the
--     landlord a `work_order_overdue` card (approval = cancel + re-suggest).
--   • work_orders.quote_version — every accept / quote is a version (the
--     events table already keeps each one; the row keeps the count).
--   • work_orders.decline_code — declining needs a reason (enum + note in
--     cancel_reason).
--   • provider_credentials.reminders_sent — which expiry tiers (90/60/30/7,
--     0 = expired) have been mailed, so each tier goes out once.
--   • app_config 'marketplace' — { credential_grace_days } (0–14): how many
--     days after expiry paperwork-lag credentials (WSIB clearance, liability
--     insurance, business registration) still count toward coverage.
--     Statutory licences never get grace (lib/marketplace/trades.ts).

alter table public.dispatch_policies add column if not exists quote_hours integer not null default 48;
alter table public.dispatch_policies drop constraint if exists dispatch_policies_quote_hours_check;
alter table public.dispatch_policies add constraint dispatch_policies_quote_hours_check check (quote_hours between 24 and 72);

alter table public.work_orders add column if not exists quote_due_at timestamptz;
alter table public.work_orders add column if not exists sla_overdue_at timestamptz;
alter table public.work_orders add column if not exists quote_version integer not null default 0;
alter table public.work_orders add column if not exists decline_code text;
alter table public.work_orders drop constraint if exists work_orders_decline_code_check;
alter table public.work_orders add constraint work_orders_decline_code_check
  check (decline_code is null or decline_code in ('no_capacity', 'out_of_area', 'not_my_trade', 'scope_unclear', 'price', 'other'));

-- Backfill: existing rows get a due date from their landlord's policy (default 48 h)
-- and a version count from the event log.
update public.work_orders w
   set quote_due_at = w.created_at + make_interval(hours => coalesce(p.quote_hours, 48))
  from public.dispatch_policies p
 where p.landlord_auth_id = w.landlord_auth_id and w.quote_due_at is null;
update public.work_orders set quote_due_at = created_at + interval '48 hours' where quote_due_at is null;
update public.work_orders w
   set quote_version = sub.n
  from (select work_order_id, count(*)::int as n from public.work_order_events where event in ('accept', 'quote') group by work_order_id) sub
 where sub.work_order_id = w.id and w.quote_version = 0;

create index if not exists work_orders_sla_idx on public.work_orders (quote_due_at) where status = 'offered' and sla_overdue_at is null;

-- work_orders has COLUMN-level select for authenticated (token was taken back
-- 2026-09-23); a new column the client reads must be granted or every
-- WORK_ORDER_COLUMNS read becomes 42501 (three-role walkthrough 2026-09-26).
grant select (quote_due_at, sla_overdue_at, quote_version, decline_code) on public.work_orders to authenticated;

alter table public.provider_credentials add column if not exists reminders_sent integer[] not null default '{}';
create index if not exists provider_credentials_expiry_idx on public.provider_credentials (expires_at) where expires_at is not null;

-- The provider may not edit the reminder bookkeeping (it would silence their own reminders).
create or replace function public.guard_provider_credential_fields()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if public.is_direct_client_write() and not public.is_stayloop_admin() then
    if tg_op = 'INSERT' then
      new.verified_at := null; new.verified_by := null; new.reminders_sent := '{}';
    else
      new.provider_id := old.provider_id;
      -- Any change to what was verified un-verifies it; a new expiry date restarts the reminder ladder.
      if new.number is distinct from old.number or new.expires_at is distinct from old.expires_at or new.kind is distinct from old.kind or new.file_path is distinct from old.file_path then
        new.verified_at := null; new.verified_by := null;
        new.reminders_sent := case when new.expires_at is distinct from old.expires_at then '{}'::integer[] else old.reminders_sent end;
      else
        new.verified_at := old.verified_at; new.verified_by := old.verified_by; new.reminders_sent := old.reminders_sent;
      end if;
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
revoke execute on function public.guard_provider_credential_fields() from public, anon, authenticated, service_role;

insert into public.app_config (key, value)
values ('marketplace', jsonb_build_object('credential_grace_days', 0))
on conflict (key) do nothing;
