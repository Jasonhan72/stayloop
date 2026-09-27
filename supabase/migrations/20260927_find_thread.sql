-- 节点 4 follow-up (2026-09-27): viewing must not create threads. The panel on
-- every work-order card called open_thread on mount, so a tenant scrolling the
-- maintenance tab minted one empty thread per old work order and the inbox
-- filled with "no messages yet" rows. find_thread is the read-only lookup
-- (party-checked); open_thread is now called only when the first message is
-- about to be written.
create or replace function public.find_thread(p_kind text, p_ref uuid)
returns uuid language plpgsql stable security definer set search_path = public as $$
declare tid uuid;
begin
  if auth.uid() is null then return null; end if;
  select id into tid from public.threads where kind = p_kind and ref_id = p_ref;
  if tid is null then return null; end if;
  if public.thread_party(tid) is null then return null; end if;
  return tid;
end $$;
revoke execute on function public.find_thread(text, uuid) from public, anon;
grant execute on function public.find_thread(text, uuid) to authenticated, service_role;

-- Threads minted by viewing (no message ever written) are noise; remove them.
delete from public.threads t where not exists (select 1 from public.thread_messages m where m.thread_id = t.id);
