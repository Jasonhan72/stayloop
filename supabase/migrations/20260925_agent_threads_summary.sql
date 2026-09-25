-- 2026-09-25 (V0.6) — the activity log lists conversations, not messages
-- (user: "不是记录每一条消息，是记录每一个对话"). Each thread carries what it
-- amounted to (the assistant's last reply, one line) and how many times the
-- user spoke; a decision taken inside a conversation carries its thread_id on
-- the audit event (copied from the card's metadata, where the orchestrator
-- puts it) so the log can fold approvals / rejections into the conversation.
alter table public.agent_threads add column if not exists summary text check (summary is null or char_length(summary) <= 240);
alter table public.agent_threads add column if not exists turn_count integer not null default 0;

-- Backfill from the stored messages (a handful of rows: threads shipped this morning).
update public.agent_threads t set
  summary = nullif(left(regexp_replace(coalesce((
      select m->>'text' from jsonb_array_elements(t.messages) with ordinality as e(m, ord)
      where m->>'role' = 'agent' and coalesce(m->>'text', '') <> ''
      order by ord desc limit 1), ''), '\s+', ' ', 'g'), 240), ''),
  turn_count = (select count(*) from jsonb_array_elements(t.messages) m where m->>'role' = 'user' and coalesce(m->>'text', '') <> '')
where t.message_count > 0;

-- decide_pending_action: same body as before, plus thread_id on the audit event.
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
  select * into v_act from public.agent_pending_actions where id = p_id;
  if not found then raise exception 'action not found'; end if;
  if v_act.user_id <> v_user then raise exception 'unauthorized'; end if;
  if v_act.status <> 'pending' then raise exception 'action is not pending'; end if;
  insert into public.approval_events (user_id, workflow_id, pending_action_id, action_type, status, approved_at, rejected_at, metadata)
  values (v_user, v_act.workflow_id, v_act.id, v_act.action_type, p_decision,
    case when p_decision = 'approved' then now() end, case when p_decision = 'rejected' then now() end,
    jsonb_build_object('data_scope', v_act.data_scope, 'recipient_label', v_act.recipient_label, 'note', p_note))
  returning * into v_appr;
  update public.agent_pending_actions set status = p_decision where id = v_act.id returning * into v_act;
  insert into public.agent_audit_events (actor_id, actor_type, action, target_type, target_id, metadata)
  values (v_user, 'user', case when p_decision = 'approved' then 'pending_action_approved' else 'pending_action_rejected' end,
    'agent_pending_action', v_act.id, jsonb_build_object('approval_event_id', v_appr.id, 'action_type', v_act.action_type, 'thread_id', v_act.metadata->'thread_id'));
  if p_decision = 'approved' then
    update public.task_memories set completed_steps = (select array(select distinct e from unnest(completed_steps || array[v_act.action_type]) e)), updated_at = now()
    where user_id = v_user and role = v_act.role and status = 'active';
  end if;
  return v_act;
end $function$;
revoke execute on function public.decide_pending_action(uuid, text, text) from anon;
