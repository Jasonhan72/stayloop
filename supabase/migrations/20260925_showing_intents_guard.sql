-- 2026-09-25 (V0.6 review) — showing_intents had one FOR ALL policy
-- ("intents_parties", no WITH CHECK), so either party could UPDATE or DELETE a
-- row through the REST API: a tenant could mark their own request 'accepted'
-- (their tracker then says the landlord replied), and a landlord could rewrite
-- the tenant's message. Verified in prod with a rollback transaction as the
-- tenant test account (3 rows flipped to accepted).
--
-- Every legitimate write is either the tenant's INSERT (/api/showing-intent,
-- caller's RLS client) or the service role's status update after the landlord
-- approves the card (/api/agent/execute). Direct clients get INSERT + SELECT
-- only; admins keep full access.
create or replace function public.guard_showing_intent_writes()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if public.is_direct_client_write() and not public.is_stayloop_admin() then
    raise exception 'showing_intents are read-only for clients after submission' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
revoke execute on function public.guard_showing_intent_writes() from public, anon, authenticated;
drop trigger if exists trg_guard_showing_intent_writes on public.showing_intents;
create trigger trg_guard_showing_intent_writes
  before update or delete on public.showing_intents
  for each row execute function public.guard_showing_intent_writes();
