-- 2026-10-29 · site test 2026-10-28 D-X1.
-- 「跳过 · 先用默认名」 used to write nothing server-side, so on any other device such an account
-- (tenant hat only, no assistant_profiles row) looked brand-new and the homepage sent it back to
-- /onboarding/name every time. From today the skip button writes a nameless profile row; this
-- backfills the same marker for every account that has already used the chat (an agent_configs
-- row) or has memories, so none of them is asked again. Insert-only; existing rows untouched.
insert into public.assistant_profiles (user_id)
select distinct c.user_id from public.agent_configs c
where exists (select 1 from auth.users u where u.id = c.user_id)
on conflict (user_id) do nothing;

insert into public.assistant_profiles (user_id)
select distinct m.user_id from public.user_memories m
where exists (select 1 from auth.users u where u.id = m.user_id)
on conflict (user_id) do nothing;
