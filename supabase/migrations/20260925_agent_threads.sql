-- 2026-09-25 (V0.6) — conversation threads for the assistant (web "+ 新会话",
-- activity rows that reopen the conversation they came from) and the chosen
-- avatar. Messages were localStorage-only per role until now.
create table if not exists public.agent_threads (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  role            text not null check (role in ('tenant','landlord','agent')),
  title           text check (title is null or char_length(title) <= 120),
  messages        jsonb not null default '[]'::jsonb check (jsonb_typeof(messages) = 'array'),
  message_count   integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  last_message_at timestamptz
);
create index if not exists agent_threads_user_role_updated_idx on public.agent_threads (user_id, role, updated_at desc);
alter table public.agent_threads enable row level security;
drop policy if exists agent_threads_self on public.agent_threads;
create policy agent_threads_self on public.agent_threads
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke all on public.agent_threads from anon;
grant select, insert, update, delete on public.agent_threads to authenticated;

alter table public.agent_configs add column if not exists avatar text check (avatar is null or char_length(avatar) <= 40);
