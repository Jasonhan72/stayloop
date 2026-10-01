-- 2026-10-01 · services marketplace sweep (group A3).
--
-- 1. maintenance_tickets.entry_permission — what the tenant said about entry
--    ("anytime" on 24 h notice / "call first" / "I must be present"). It used
--    to live only as a description line, so a dispatch from the suggestion
--    card or an auto-dispatch carried no permission and the RTA s.27 notice
--    told a tenant who must be present that the contractor would enter while
--    they were out. createWorkOrder now reads it (default 'call_first').
--
-- 2. A dispatch suggestion card only makes sense while the ticket waits for
--    someone. When the ticket leaves 'new' (the landlord handles it, finishes
--    or cancels it, or a work order is created) the pending card is expired —
--    approving a stale card used to email a contractor about a finished job
--    and reopen the ticket. createWorkOrder also refuses done / cancelled.
--
-- 3. One-time cleanup of cards that can no longer be acted on: dispatch cards
--    with no candidate (approval could only fail), dispatch cards whose ticket
--    already left 'new', and "overdue · reassign?" cards whose offer has
--    already been answered.

alter table public.maintenance_tickets add column if not exists entry_permission text;

-- 4. maintenance_tickets.emergency (review 2026-10-01) — whether the problem is
--    an emergency (RTA s.20 / s.26: no heat, water, gas, flooding, locks…),
--    recorded when the ticket is filed (repair modal, hub panel, AI request).
--    The dispatch, auto-dispatch, emergency quote pre-approval and the entry
--    notice used to read priority = 'high' instead, so "urgent · 24 h" on a
--    dripping tap told the tenant no 24-hour notice was needed. null = filed
--    before this column: the server judges it from the ticket's words.
alter table public.maintenance_tickets add column if not exists emergency boolean;
alter table public.maintenance_tickets drop constraint if exists maintenance_tickets_entry_permission_check;
alter table public.maintenance_tickets add constraint maintenance_tickets_entry_permission_check
  check (entry_permission is null or entry_permission in ('anytime', 'call_first', 'tenant_present'));

create or replace function public.expire_dispatch_cards_on_ticket_status()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.agent_pending_actions
     set status = 'expired',
         execution_result = jsonb_build_object('ok', false, 'reason', case when new.status in ('done', 'cancelled') then 'ticket_closed' else 'ticket_status_changed' end, 'ticket_status', new.status)
   where status = 'pending'
     and action_type = 'dispatch_work_order'
     and metadata->>'ticket_id' = new.id::text;
  return new;
end $$;
revoke all on function public.expire_dispatch_cards_on_ticket_status() from public, anon, authenticated, service_role;

drop trigger if exists trg_expire_dispatch_cards_on_ticket_status on public.maintenance_tickets;
create trigger trg_expire_dispatch_cards_on_ticket_status
  after update of status on public.maintenance_tickets
  for each row
  when (new.status is distinct from old.status and new.status is distinct from 'new')
  execute function public.expire_dispatch_cards_on_ticket_status();

-- ── one-time cleanup ───────────────────────────────────────────────────────
update public.agent_pending_actions a
   set status = 'expired',
       execution_result = jsonb_build_object('ok', false, 'reason', 'no_candidate')
 where a.status = 'pending'
   and a.action_type = 'dispatch_work_order'
   and coalesce(a.metadata->>'provider_id', '') = ''
   and coalesce(a.metadata->>'external_email', '') = '';

update public.agent_pending_actions a
   set status = 'expired',
       execution_result = jsonb_build_object('ok', false, 'reason', case when t.status in ('done', 'cancelled') then 'ticket_closed' else 'ticket_status_changed' end, 'ticket_status', t.status)
  from public.maintenance_tickets t
 where a.status = 'pending'
   and a.action_type = 'dispatch_work_order'
   and t.id::text = a.metadata->>'ticket_id'
   and t.status is distinct from 'new';

update public.agent_pending_actions a
   set status = 'expired',
       execution_result = jsonb_build_object('ok', false, 'reason', 'work_order_already_answered', 'status', w.status)
  from public.work_orders w
 where a.status = 'pending'
   and a.action_type = 'work_order_overdue'
   and w.id::text = a.metadata->>'work_order_id'
   and w.status <> 'offered';
