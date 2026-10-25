-- 主对话 (第三批 ⑦ of design/assistant-messaging-benchmark-2026-10-24.md, 2026-10-25): one pinned,
-- undeletable conversation per user × hat. The daily scans attach their cards to it
-- (metadata.thread_id), hand-overs from other conversations land in it, and the assistant page
-- opens it when no conversation is remembered. Every other conversation is a 话题 (topic).
-- Applied to prod 2026-10-25 via Supabase MCP as 'agent_threads_main'.
alter table public.agent_threads add column if not exists is_main boolean not null default false;
create unique index if not exists agent_threads_main_uniq on public.agent_threads (user_id, role) where is_main;

-- The main conversation cannot be deleted from the browser (the list offers rename only; this is the backstop).
create or replace function public.guard_main_thread_delete()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if old.is_main and public.is_direct_client_write() then
    raise exception 'main_thread_undeletable' using errcode = '23514';
  end if;
  return old;
end $$;
revoke execute on function public.guard_main_thread_delete() from public, anon, authenticated, service_role;
drop trigger if exists trg_guard_main_thread_delete on public.agent_threads;
create trigger trg_guard_main_thread_delete
  before delete on public.agent_threads
  for each row execute function public.guard_main_thread_delete();
