-- =============================================================
-- Stayloop V5.3 — Agent Core (the site-wide spine)
-- Implements handbook §03 / §05A / §07 and the
-- /tenant/agent execution spec §8–§15.
--
-- COEXISTENCE NOTE
-- The live database already ships an AI-native agent layer
-- (conversations · messages · user_facts · tool_executions ·
-- pending_actions · audit_events). To avoid colliding with that
-- system, this spine's approval + audit tables are namespaced
-- `agent_pending_actions` / `agent_audit_events`. The other five
-- tables are new and do not exist yet. Everything here is purely
-- additive (create ... if not exists) and RLS-scoped to auth.uid().
-- Reconciling this spine with the existing AI-native tables is a
-- deliberate follow-up — see the handoff notes.
-- =============================================================

-- ---- 1. agent_configs --------------------------------------
create table if not exists public.agent_configs (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  agent_name       text not null default 'Luna',
  role             text not null check (role in ('tenant','landlord','agent')),
  tone             text not null default 'clear_supportive',
  model_tier       text not null default 'standard',
  automation_level text not null default 'approval_required',
  memory_enabled   boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (user_id, role)
);
create index if not exists agent_configs_user_role_idx
  on public.agent_configs(user_id, role);

-- ---- 2. user_memories --------------------------------------
-- Structured per-(role,key) preference store. Complements the
-- existing free-text `user_facts` table (which the AI chat uses).
create table if not exists public.user_memories (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        text not null check (role in ('tenant','landlord','agent')),
  memory_type text not null check (memory_type in ('preference','profile','constraint','semantic','system')),
  key         text not null,
  label       text,
  value       jsonb not null default '{}'::jsonb,
  confidence  numeric not null default 1.0 check (confidence >= 0 and confidence <= 1),
  source      text not null default 'user',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, role, memory_type, key)
);
create index if not exists user_memories_user_role_idx
  on public.user_memories(user_id, role);
create index if not exists user_memories_key_idx
  on public.user_memories(key);

-- ---- 3. task_memories --------------------------------------
create table if not exists public.task_memories (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  role            text not null default 'tenant' check (role in ('tenant','landlord','agent')),
  workflow_type   text not null default 'tenant_rental',
  workflow_id     uuid,
  current_stage   text not null default 'intake',
  completed_steps text[] not null default '{}',
  pending_actions jsonb not null default '[]'::jsonb,
  status          text not null default 'active' check (status in ('active','paused','completed','archived')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists task_memories_user_status_idx
  on public.task_memories(user_id, status);

-- ---- 4. agent_sessions -------------------------------------
create table if not exists public.agent_sessions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  agent_config_id uuid not null references public.agent_configs(id) on delete cascade,
  role            text not null check (role in ('tenant','landlord','agent')),
  status          text not null default 'active' check (status in ('active','ended','error')),
  started_at      timestamptz not null default now(),
  ended_at        timestamptz,
  model_used      text,
  token_usage     jsonb not null default '{}'::jsonb
);
create index if not exists agent_sessions_user_started_idx
  on public.agent_sessions(user_id, started_at desc);

-- ---- 5. agent_pending_actions ------------------------------
-- Workflow approval cards (handbook §03). Namespaced to avoid the
-- existing conversation-scoped `pending_actions` table.
create table if not exists public.agent_pending_actions (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  workflow_id       uuid,
  role              text not null check (role in ('tenant','landlord','agent')),
  action_type       text not null,
  title             text not null,
  summary           text,
  recipient_label   text,
  data_scope        text[] not null default '{}',
  excluded_data     text[] not null default '{}',
  risk_level        text not null default 'medium' check (risk_level in ('low','medium','high')),
  status            text not null default 'pending' check (status in ('pending','approved','rejected','expired')),
  requires_approval boolean not null default true,
  metadata          jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  expires_at        timestamptz
);
create index if not exists agent_pending_actions_user_status_idx
  on public.agent_pending_actions(user_id, status, created_at desc);

-- ---- 6. approval_events ------------------------------------
create table if not exists public.approval_events (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  workflow_id       uuid,
  pending_action_id uuid references public.agent_pending_actions(id) on delete set null,
  action_type       text not null,
  status            text not null check (status in ('approved','rejected','modified')),
  approved_at       timestamptz,
  rejected_at       timestamptz,
  metadata          jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now()
);
create index if not exists approval_events_user_created_idx
  on public.approval_events(user_id, created_at desc);

-- ---- 7. agent_audit_events ---------------------------------
-- Spine audit trail. Namespaced to avoid the existing
-- `audit_events` (actor_role / resource_type / resource_id) table.
create table if not exists public.agent_audit_events (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid,
  actor_type  text not null default 'user' check (actor_type in ('user','system','agent')),
  action      text not null,
  target_type text,
  target_id   uuid,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists agent_audit_events_actor_created_idx
  on public.agent_audit_events(actor_id, created_at desc);
create index if not exists agent_audit_events_target_idx
  on public.agent_audit_events(target_type, target_id);

-- =============================================================
-- Row-level security — every table scoped to auth.uid()
-- =============================================================
alter table public.agent_configs          enable row level security;
alter table public.user_memories          enable row level security;
alter table public.task_memories          enable row level security;
alter table public.agent_sessions         enable row level security;
alter table public.agent_pending_actions  enable row level security;
alter table public.approval_events        enable row level security;
alter table public.agent_audit_events     enable row level security;

drop policy if exists "agent_configs_self" on public.agent_configs;
create policy "agent_configs_self" on public.agent_configs
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "user_memories_self" on public.user_memories;
create policy "user_memories_self" on public.user_memories
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "task_memories_self" on public.task_memories;
create policy "task_memories_self" on public.task_memories
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "agent_sessions_self" on public.agent_sessions;
create policy "agent_sessions_self" on public.agent_sessions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "agent_pending_actions_self" on public.agent_pending_actions;
create policy "agent_pending_actions_self" on public.agent_pending_actions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "approval_events_select_self" on public.approval_events;
create policy "approval_events_select_self" on public.approval_events
  for select using (user_id = auth.uid());
drop policy if exists "approval_events_insert_self" on public.approval_events;
create policy "approval_events_insert_self" on public.approval_events
  for insert with check (user_id = auth.uid());

drop policy if exists "agent_audit_events_select_self" on public.agent_audit_events;
create policy "agent_audit_events_select_self" on public.agent_audit_events
  for select using (actor_id = auth.uid());
drop policy if exists "agent_audit_events_insert_self" on public.agent_audit_events;
create policy "agent_audit_events_insert_self" on public.agent_audit_events
  for insert with check (actor_id = auth.uid() or actor_type in ('system','agent'));

-- =============================================================
-- bootstrap_agent_session(p_role) — atomic session loader
-- Execution spec §11: get-or-create config, get-or-create active
-- task_memory, open a session, write the session-started audit.
-- =============================================================
create or replace function public.bootstrap_agent_session(p_role text)
returns public.agent_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user   uuid := auth.uid();
  v_config public.agent_configs;
  v_task   public.task_memories;
  v_sess   public.agent_sessions;
  v_name   text;
  v_wf     text;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  if p_role not in ('tenant','landlord','agent') then
    raise exception 'invalid role %', p_role;
  end if;

  v_name := case p_role when 'tenant' then 'Luna'
                        when 'landlord' then 'Logic'
                        else 'Brief' end;
  v_wf := case p_role when 'tenant' then 'tenant_rental'
                      when 'landlord' then 'landlord_screening'
                      else 'agent_fieldwork' end;

  insert into public.agent_configs (user_id, role, agent_name)
  values (v_user, p_role, v_name)
  on conflict (user_id, role) do update set updated_at = now()
  returning * into v_config;

  select * into v_task
  from public.task_memories
  where user_id = v_user and role = p_role and status = 'active'
  order by created_at desc limit 1;

  if not found then
    insert into public.task_memories (user_id, role, workflow_type, current_stage, completed_steps)
    values (
      v_user, p_role, v_wf,
      case p_role when 'tenant' then 'passport_readiness'
                  when 'landlord' then 'review_inbox'
                  else 'task_inbox' end,
      case p_role when 'tenant' then array['intake','preference_collection']
                  else array['intake'] end
    )
    returning * into v_task;
  end if;

  insert into public.agent_sessions (user_id, agent_config_id, role)
  values (v_user, v_config.id, p_role)
  returning * into v_sess;

  insert into public.agent_audit_events (actor_id, actor_type, action, target_type, target_id, metadata)
  values (
    v_user, 'user',
    p_role || '_agent_session_started',
    'agent_session', v_sess.id,
    jsonb_build_object('role', p_role, 'agent_name', v_config.agent_name, 'workflow_type', v_task.workflow_type)
  );

  return v_sess;
end $$;

grant execute on function public.bootstrap_agent_session(text) to authenticated;

-- =============================================================
-- decide_pending_action(p_id, p_decision, p_note) — approve / reject
-- Execution spec §12: validate ownership + status, dual-write
-- approval_event + agent_audit_event, flip status, nudge task_memory.
-- =============================================================
create or replace function public.decide_pending_action(
  p_id uuid, p_decision text, p_note text default null
)
returns public.agent_pending_actions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_act  public.agent_pending_actions;
  v_appr public.approval_events;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if p_decision not in ('approved','rejected') then
    raise exception 'invalid decision %', p_decision;
  end if;

  select * into v_act from public.agent_pending_actions where id = p_id;
  if not found then raise exception 'action not found'; end if;
  if v_act.user_id <> v_user then raise exception 'unauthorized'; end if;
  if v_act.status <> 'pending' then raise exception 'action is not pending'; end if;

  insert into public.approval_events
    (user_id, workflow_id, pending_action_id, action_type, status, approved_at, rejected_at, metadata)
  values (
    v_user, v_act.workflow_id, v_act.id, v_act.action_type, p_decision,
    case when p_decision = 'approved' then now() end,
    case when p_decision = 'rejected' then now() end,
    jsonb_build_object('data_scope', v_act.data_scope, 'recipient_label', v_act.recipient_label, 'note', p_note)
  )
  returning * into v_appr;

  update public.agent_pending_actions set status = p_decision where id = v_act.id
  returning * into v_act;

  insert into public.agent_audit_events (actor_id, actor_type, action, target_type, target_id, metadata)
  values (
    v_user, 'user',
    case when p_decision = 'approved' then 'pending_action_approved' else 'pending_action_rejected' end,
    'agent_pending_action', v_act.id,
    jsonb_build_object('approval_event_id', v_appr.id, 'action_type', v_act.action_type)
  );

  if p_decision = 'approved' then
    update public.task_memories
    set completed_steps = (
          select array(select distinct e from unnest(completed_steps || array[v_act.action_type]) e)
        ),
        updated_at = now()
    where user_id = v_user and role = v_act.role and status = 'active';
  end if;

  return v_act;
end $$;

grant execute on function public.decide_pending_action(uuid, text, text) to authenticated;

-- =============================================================
-- seed_demo_agent_data(p_role) — idempotent demo content
-- =============================================================
create or replace function public.seed_demo_agent_data(p_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then return; end if;
  if p_role <> 'tenant' then return; end if;

  if not exists (select 1 from public.user_memories where user_id = v_user and role = 'tenant') then
    insert into public.user_memories (user_id, role, memory_type, key, label, value, confidence, source) values
      (v_user,'tenant','preference','budget','预算',
        '{"min":2100,"max":2400,"currency":"CAD","cadence":"monthly"}'::jsonb,0.9,'onboarding'),
      (v_user,'tenant','preference','preferred_areas','区域',
        '{"areas":["Downtown","Midtown","North York"]}'::jsonb,0.8,'chat'),
      (v_user,'tenant','constraint','move_in_date','入住',
        '{"target":"2026-09-01","flexible":true}'::jsonb,0.7,'user'),
      (v_user,'tenant','preference','transit','通勤',
        '{"requires_transit":true,"max_walk_minutes":12}'::jsonb,0.85,'chat'),
      (v_user,'tenant','preference','home_type','户型',
        '{"beds":1,"in_unit_laundry":true,"quiet":true}'::jsonb,0.8,'chat');
  end if;

  if not exists (
    select 1 from public.agent_pending_actions
    where user_id = v_user and role = 'tenant' and status = 'pending'
  ) then
    insert into public.agent_pending_actions
      (user_id, role, action_type, title, summary, recipient_label,
       data_scope, excluded_data, risk_level, metadata)
    values (
      v_user,'tenant','share_passport_summary',
      '批准分享你的 Passport 摘要',
      'Luna 为 123 King St W 的房东准备了一份租赁 Passport 摘要 —— 只在你点头后才会发送。',
      '123 King St W 的房东',
      array['就业状态','收入区间','租赁就绪分','推荐人状态'],
      array['原始证件','完整银行流水','私人备注'],
      'medium',
      jsonb_build_object('property_id','demo_property_123_king','prepared_by','Luna')
    );
  end if;
end $$;

grant execute on function public.seed_demo_agent_data(text) to authenticated;
