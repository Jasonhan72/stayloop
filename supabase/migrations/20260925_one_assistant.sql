-- 2026-09-25 (V0.6) — one AI assistant per account (user decision: "一用户就只有一个
-- AI 助理，他能处理所有三个角色的事情，角色还是分开的").
--
-- Until now each hat had its own assistant: agent_configs carried a name and an
-- avatar per (user, role), the reflection profile (user_memories key
-- 'user_model') was written per role, and the menu showed three names for one
-- person. Now:
--   • assistant_profiles — one row per account: the assistant's name + avatar.
--     agent_configs rows stay (they hold the per-hat session config the
--     bootstrap RPC binds); their agent_name / avatar are no longer read.
--   • user_memories.role may be 'self' — the one reflection profile per account
--     lives there; the per-hat facts keep their hat as a tag.
create table if not exists public.assistant_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  name text check (name is null or char_length(name) between 1 and 40),
  avatar text check (avatar is null or char_length(avatar) <= 40),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.assistant_profiles enable row level security;
drop policy if exists assistant_profiles_self on public.assistant_profiles;
create policy assistant_profiles_self on public.assistant_profiles
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke all on public.assistant_profiles from anon, public;
grant select, insert, update, delete on public.assistant_profiles to authenticated;
grant all on public.assistant_profiles to service_role;
drop trigger if exists trg_assistant_profiles_touch on public.assistant_profiles;
create trigger trg_assistant_profiles_touch before update on public.assistant_profiles
  for each row execute function public.touch_updated_at();

-- Backfill: the name the person chose themselves (never a persona default),
-- from the hat they used most recently; the avatar from that row, else any.
insert into public.assistant_profiles (user_id, name, avatar)
select distinct on (c.user_id) c.user_id,
       case when c.agent_name in ('Luna', 'Logic', 'Brief', 'AI Agent') or c.agent_name is null or btrim(c.agent_name) = '' then null else btrim(c.agent_name) end,
       c.avatar
  from public.agent_configs c
  left join lateral (select max(t.updated_at) as last from public.agent_threads t where t.user_id = c.user_id and t.role = c.role) t on true
 order by c.user_id,
          (case when c.agent_name in ('Luna', 'Logic', 'Brief', 'AI Agent') or c.agent_name is null then 1 else 0 end),
          t.last desc nulls last,
          c.updated_at desc
on conflict (user_id) do nothing;
update public.assistant_profiles p
   set avatar = (select c.avatar from public.agent_configs c where c.user_id = p.user_id and c.avatar is not null order by c.updated_at desc limit 1)
 where p.avatar is null;

-- One reflection profile per account.
alter table public.user_memories drop constraint if exists user_memories_role_check;
alter table public.user_memories add constraint user_memories_role_check
  check (role = any (array['tenant'::text, 'landlord'::text, 'agent'::text, 'self'::text]));
-- The per-hat profiles are superseded; the next turn regenerates one for the whole person.
delete from public.user_memories where memory_type = 'system' and key = 'user_model' and role <> 'self';
