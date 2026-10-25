-- 例行任务 (第三批 ⑥ of design/assistant-messaging-benchmark-2026-10-24.md, 2026-10-25):
-- 「每周一帮我看一遍续约窗口」「每月 1 号前提醒租客交租」「每周五把这周的申请汇总给我」.
-- A routine is the person's own row: what kind of thing to do (a per-hat allow-list), on what
-- schedule, and when it next runs. The hourly cron (/api/cron/agent-routines) runs the due ones:
--   • kinds that reach OTHER people (rent_reminder_cards) only ever create the usual approval
--     cards — the executor still needs the landlord's click, the 60-second undo still applies;
--   • kinds that only report to the person themself (digests, reminders to self) run at once:
--     an assistant message in the hat's 主对话 plus a push.
-- Nothing here touches money or LTB forms. Rows are read / written by their owner (RLS) and
-- by the cron (service role); the kind and the schedule shape are checked in the database too.
create table if not exists public.agent_routines (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  role         text not null check (role in ('tenant','landlord','agent')),
  kind         text not null check (kind in (
                 'rent_reminder_cards', 'renewal_window_check', 'applications_digest', 'overdue_rent_check',
                 'rent_due_reminder', 'maintenance_followup',
                 'client_followup_digest')),
  title        text not null check (char_length(title) between 1 and 120),
  params       jsonb not null default '{}'::jsonb check (jsonb_typeof(params) = 'object'),
  -- { every: 'daily' | 'weekly' | 'monthly', weekday: 0-6 (weekly), day: 1-28 (monthly), hour: 0-23 } in America/Toronto
  schedule     jsonb not null check (
                 jsonb_typeof(schedule) = 'object'
                 and schedule->>'every' in ('daily','weekly','monthly')
                 and (schedule->>'hour')::int between 0 and 23
                 and (schedule->>'every' <> 'weekly' or (schedule->>'weekday')::int between 0 and 6)
                 and (schedule->>'every' <> 'monthly' or (schedule->>'day')::int between 1 and 28)),
  next_run_at  timestamptz not null,
  last_run_at  timestamptz,
  last_result  jsonb,
  enabled      boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists agent_routines_due_idx on public.agent_routines (enabled, next_run_at);
create index if not exists agent_routines_user_idx on public.agent_routines (user_id, role, created_at desc);
-- Per-hat allow-list, enforced where it cannot be bypassed.
alter table public.agent_routines drop constraint if exists agent_routines_kind_by_role;
alter table public.agent_routines add constraint agent_routines_kind_by_role check (
  (role = 'landlord' and kind in ('rent_reminder_cards','renewal_window_check','applications_digest','overdue_rent_check'))
  or (role = 'tenant' and kind in ('rent_due_reminder','maintenance_followup'))
  or (role = 'agent' and kind in ('client_followup_digest')));
drop trigger if exists trg_agent_routines_touch on public.agent_routines;
create trigger trg_agent_routines_touch before update on public.agent_routines for each row execute function public.touch_updated_at();

alter table public.agent_routines enable row level security;
drop policy if exists agent_routines_own on public.agent_routines;
create policy agent_routines_own on public.agent_routines
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke all on public.agent_routines from public, anon, authenticated, service_role;
grant select, insert, update, delete on public.agent_routines to authenticated;
grant all on public.agent_routines to service_role;
-- last_run_at / last_result are the cron's columns; the owner edits the rest.
revoke update on public.agent_routines from authenticated;
grant update (title, params, schedule, next_run_at, enabled) on public.agent_routines to authenticated;

-- Hourly sweep at :10 (the other crons sit at :00 / :05 / :50).
select cron.schedule(
  'agent-routines-sweep',
  '10 * * * *',
  $$ select net.http_post(
       url := 'https://www.stayloop.ai/api/cron/agent-routines',
       headers := jsonb_build_object('x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret'), 'content-type', 'application/json'),
       body := '{}'::jsonb,
       timeout_milliseconds := 120000) $$
);
