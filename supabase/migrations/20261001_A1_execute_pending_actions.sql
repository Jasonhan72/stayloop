-- 2026-10-01 · sweep A1 (execute) — approving a card and running it are two
-- steps with two clocks (contract C1).
--
--   • agent_pending_actions.decided_at: when the card was approved / rejected.
--     The execute route refuses an approval that never ran for 7 days
--     ('stale_approval') — a renewal letter approved in a tab that was closed
--     a week ago is not sent today.
--   • decide_pending_action: a pending card past expires_at becomes 'expired'
--     (execution_result {ok:false, reason:'expired'}) and is returned instead of
--     being approved — no exception, the client reads the status.
--   • decide_pending_action no longer appends the action type to
--     task_memories.completed_steps: "已完成" fed to the next system prompt must
--     be what actually ran. /api/agent/execute appends after a successful run.
--   • One-time cleanup: cards that can never run (no executor for their type),
--     approvals that never ran for over a week, rent reminders past their due
--     date, and completed_steps entries for action types that were approved
--     but never executed.

alter table public.agent_pending_actions add column if not exists decided_at timestamptz;

-- Backfill from the approval ledger (the latest decision per card).
update public.agent_pending_actions a
   set decided_at = e.at
  from (
    select distinct on (pending_action_id) pending_action_id, coalesce(approved_at, rejected_at, created_at) as at
      from public.approval_events
     where pending_action_id is not null
     order by pending_action_id, created_at desc
  ) e
 where a.id = e.pending_action_id
   and a.decided_at is null
   and a.status in ('approved', 'rejected');

create or replace function public.decide_pending_action(p_id uuid, p_decision text, p_note text default null::text)
 returns agent_pending_actions
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_user uuid := auth.uid(); v_act public.agent_pending_actions; v_appr public.approval_events;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if p_decision not in ('approved','rejected') then raise exception 'invalid decision %', p_decision; end if;
  select * into v_act from public.agent_pending_actions where id = p_id for update;
  if not found then raise exception 'action not found'; end if;
  if v_act.user_id <> v_user then raise exception 'unauthorized'; end if;
  if v_act.status <> 'pending' then raise exception 'action is not pending'; end if;
  -- Past its expiry the card can no longer be decided: it expires and says so.
  if v_act.expires_at is not null and v_act.expires_at < now() then
    update public.agent_pending_actions
       set status = 'expired',
           execution_result = jsonb_build_object('ok', false, 'reason', 'expired', 'at', now())
     where id = v_act.id
     returning * into v_act;
    return v_act;
  end if;
  insert into public.approval_events (user_id, workflow_id, pending_action_id, action_type, status, approved_at, rejected_at, metadata)
  values (v_user, v_act.workflow_id, v_act.id, v_act.action_type, p_decision,
    case when p_decision = 'approved' then now() end, case when p_decision = 'rejected' then now() end,
    jsonb_build_object('data_scope', v_act.data_scope, 'recipient_label', v_act.recipient_label, 'note', p_note))
  returning * into v_appr;
  update public.agent_pending_actions set status = p_decision, decided_at = now() where id = v_act.id returning * into v_act;
  insert into public.agent_audit_events (actor_id, actor_type, action, target_type, target_id, metadata)
  values (v_user, 'user', case when p_decision = 'approved' then 'pending_action_approved' else 'pending_action_rejected' end,
    'agent_pending_action', v_act.id, jsonb_build_object('approval_event_id', v_appr.id, 'action_type', v_act.action_type, 'thread_id', v_act.metadata->'thread_id'));
  return v_act;
end $function$;

revoke all on function public.decide_pending_action(uuid, text, text) from public, anon;
grant execute on function public.decide_pending_action(uuid, text, text) to authenticated, service_role;

-- ── One-time cleanup ─────────────────────────────────────────────────────────
-- Cards whose type has no executor: approving them never did anything.
update public.agent_pending_actions
   set status = 'expired',
       execution_result = coalesce(execution_result, '{}'::jsonb) || jsonb_build_object('ok', false, 'reason', 'no_executor_for_type', 'at', now())
 where status in ('pending', 'approved')
   and executed_at is null
   and action_type not in ('send_renewal_letter', 'send_message', 'maintenance_request', 'rent_reminder',
                           'renewal_checkpoint', 'relist_prompt', 'dispatch_work_order', 'approve_quote',
                           'accept_completion', 'work_order_overdue', 'showing_request', 'listing_inquiry',
                           'send_decision', 'send_lease');

-- Approvals that never ran (tab closed in the undo window, a failed send) for over a week.
update public.agent_pending_actions
   set status = 'expired',
       execution_result = coalesce(execution_result, '{}'::jsonb) || jsonb_build_object('ok', false, 'reason', 'stale_approval', 'at', now())
 where status = 'approved'
   and executed_at is null
   and coalesce(decided_at, created_at) < now() - interval '7 days';

-- "Rent is due soon" for a date already past.
update public.agent_pending_actions
   set status = 'expired',
       execution_result = coalesce(execution_result, '{}'::jsonb) || jsonb_build_object('ok', false, 'reason', 'past_due_date', 'at', now())
 where action_type = 'rent_reminder'
   and status in ('pending', 'approved')
   and executed_at is null
   and coalesce(metadata->>'due_date', '') ~ '^\d{4}-\d{2}-\d{2}$'
   and (metadata->>'due_date')::date < (now() at time zone 'America/Toronto')::date;

-- completed_steps: drop action types this user's cards proposed but never ran
-- successfully (decide_pending_action appended them on approval). Workflow
-- stage keys are never touched.
with cleaned as (
  select t.id,
         coalesce(array(
           select u.e
             from unnest(t.completed_steps) with ordinality as u(e, ord)
            where u.e in ('intake', 'preference_collection', 'passport_readiness', 'shortlist_and_apply', 'sign_and_move_in',
                          'review_inbox', 'application_review', 'screening', 'decision', 'lease', 'settlement',
                          'task_inbox', 'fieldwork')
               or not exists (select 1 from public.agent_pending_actions a
                               where a.user_id = t.user_id and a.role = t.role and a.action_type = u.e)
               or exists (select 1 from public.agent_pending_actions a
                           where a.user_id = t.user_id and a.role = t.role and a.action_type = u.e
                             and a.executed_at is not null and a.execution_result->>'ok' = 'true')
            order by u.ord
         ), '{}'::text[]) as keep
    from public.task_memories t
)
update public.task_memories t
   set completed_steps = c.keep,
       updated_at = now()
  from cleaned c
 where c.id = t.id
   and c.keep is distinct from t.completed_steps;
