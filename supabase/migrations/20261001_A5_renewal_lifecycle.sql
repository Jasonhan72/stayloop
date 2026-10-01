-- 2026-10-01 sweep · A5 renewal & lifecycle.
--
-- 1. lifecycle_facts_landlord: the rail counted a renewal letter as sent the
--    moment it was approved. An approved card whose send never ran (the tab
--    closed inside the 60 s undo window) or failed is not a sent letter
--    (contract C8: executed_at is not null and execution_result->>'ok' is
--    true). The facts now carry executed_at and the result's ok / reason for
--    each card, and listing_id on each lease so the "re-list" step can open the
--    original listing instead of the new-listing wizard (whose duplicate check
--    rejects the same address).
--
-- 2. Invite-reminder cards (send_message with metadata.invite_id) are a
--    snapshot: "it has not been accepted yet". When the invite is accepted,
--    declined, revoked or deleted, every such card that has not executed is
--    expired (execution_result {ok:false, reason:'invite_closed'}), so an
--    approval days later can no longer email a stale or wrong message.

create or replace function public.lifecycle_facts_landlord()
returns jsonb language sql stable security invoker set search_path = public as $$
  with me as (select auth.uid() as uid),
  ll as (select id from landlords where id = (select uid from me) or auth_id = (select uid from me)),
  lst as (select id, address, unit, verification_status, is_active, source from listings where landlord_id in (select id from ll) limit 200),
  cards as (select action_type, status, metadata, executed_at,
                   case when execution_result is null then null
                        else jsonb_build_object('ok', execution_result -> 'ok', 'reason', execution_result -> 'reason') end as execution_result
              from agent_pending_actions
             where user_id = (select uid from me) and action_type in ('showing_request','listing_inquiry','send_renewal_letter','renewal_checkpoint')
             order by created_at desc limit 200),
  lse as (select id, status, start_date, end_date, unit_label, tenant_name, tenant_email, monthly_rent, application_id, listing_id, sent_at, signed_at, created_at
            from lease_documents where landlord_id in (select id from ll) limit 200),
  -- Households where this account is the landlord: created by it, tied to one of
  -- its leases, or where it is an active landlord / PM member.
  hh as (select id, current_lease_id, verified, status, end_date, address, unit, city, monthly_rent, created_by from households
          where created_by = (select uid from me) or current_lease_id in (select id from lse)
             or id in (select household_id from household_members where user_id = (select uid from me) and role in ('landlord','property_manager') and status = 'active')
          limit 200),
  apps as (select id, listing_id, status, decision_notified_at, screened_at, archived_at, created_at from applications where listing_id in (select id from lst) limit 300),
  rent as (select lease_id, due_date, status, amount from rent_payments
            where lease_id in (select id from lse) and status in ('due','late') limit 100),
  rent_month as (select lease_id, due_date, status, amount from rent_payments
            where lease_id in (select id from lse)
              and due_date >= date_trunc('month', current_date)::date
              and due_date < (date_trunc('month', current_date) + interval '1 month')::date limit 200),
  tix as (select household_id, status from maintenance_tickets where household_id in (select id from hh) limit 200),
  intents as (select household_id, lease_id, intent from renewal_intents where household_id in (select id from hh)
               order by created_at desc limit 100),
  scr as (select application_id, status from screenings where application_id in (select id from apps) limit 300)
  select jsonb_build_object(
    'listings', coalesce((select jsonb_agg(to_jsonb(x)) from lst x), '[]'::jsonb),
    'cards', coalesce((select jsonb_agg(to_jsonb(x)) from cards x), '[]'::jsonb),
    'leases', coalesce((select jsonb_agg(to_jsonb(x)) from lse x), '[]'::jsonb),
    'households', coalesce((select jsonb_agg(to_jsonb(x)) from hh x), '[]'::jsonb),
    'applications', coalesce((select jsonb_agg(to_jsonb(x)) from apps x), '[]'::jsonb),
    'rent', coalesce((select jsonb_agg(to_jsonb(x)) from rent x), '[]'::jsonb),
    'rent_month', coalesce((select jsonb_agg(to_jsonb(x)) from rent_month x), '[]'::jsonb),
    'tickets', coalesce((select jsonb_agg(to_jsonb(x)) from tix x), '[]'::jsonb),
    'intents', coalesce((select jsonb_agg(to_jsonb(x)) from intents x), '[]'::jsonb),
    'screenings', coalesce((select jsonb_agg(to_jsonb(x)) from scr x), '[]'::jsonb)
  )
$$;

revoke all on function public.lifecycle_facts_landlord() from public, anon;
grant execute on function public.lifecycle_facts_landlord() to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Invite closed → its reminder cards expire.
-- SECURITY DEFINER: the invite can be closed by the invitee (accept / decline
-- RPCs) or another member, none of whom can write the inviter's cards under
-- RLS. It only ever touches unexecuted send_message cards that name this
-- invite, owned by the inviter.
create or replace function public.expire_invite_reminder_cards()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_by uuid;
  v_state text;
begin
  if tg_op = 'DELETE' then
    v_id := old.id; v_by := old.invited_by; v_state := 'deleted';
  elsif new.accepted_at is not null and old.accepted_at is null then
    v_state := 'accepted';
  elsif new.declined_at is not null and old.declined_at is null then
    v_state := 'declined';
  elsif new.revoked_at is not null and old.revoked_at is null then
    v_state := 'revoked';
  else
    return null;
  end if;
  if tg_op <> 'DELETE' then
    v_id := new.id; v_by := new.invited_by;
  end if;
  update public.agent_pending_actions a
     set status = 'expired',
         execution_result = jsonb_build_object('ok', false, 'reason', 'invite_closed', 'invite_state', v_state, 'at', now())
   where a.user_id = v_by
     and a.action_type = 'send_message'
     and a.metadata ->> 'invite_id' = v_id::text
     and a.status in ('pending', 'approved')
     and a.executed_at is null;
  return null;
end $$;

revoke all on function public.expire_invite_reminder_cards() from public, anon, authenticated, service_role;

drop trigger if exists trg_expire_invite_reminder_cards on public.household_invites;
create trigger trg_expire_invite_reminder_cards
  after update of accepted_at, declined_at, revoked_at or delete on public.household_invites
  for each row execute function public.expire_invite_reminder_cards();

-- Cards already stale today (the invite was closed before this trigger existed).
update public.agent_pending_actions a
   set status = 'expired',
       execution_result = jsonb_build_object('ok', false, 'reason', 'invite_closed', 'at', now())
 where a.action_type = 'send_message'
   and a.metadata ->> 'invite_id' is not null
   and a.status in ('pending', 'approved')
   and a.executed_at is null
   and not exists (
     select 1 from public.household_invites i
      where i.id::text = a.metadata ->> 'invite_id'
        and i.accepted_at is null and i.declined_at is null and i.revoked_at is null
   );
