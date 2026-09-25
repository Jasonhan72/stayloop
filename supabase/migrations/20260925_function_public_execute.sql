-- 2026-09-25 (V0.6 review) — the 2026-09-22 "revoke anon" migration was a no-op
-- for seven RPCs and ten trigger functions: their ACLs still carried the PUBLIC
-- execute grant ("=X/postgres"), and `revoke execute ... from anon` only removes
-- an explicit anon entry — anon kept EXECUTE through PUBLIC. Verified in prod:
-- has_function_privilege('anon', 'decide_pending_action(uuid,text,text)', 'execute')
-- was true; anon could run seed_demo_agent_data() (no-op on a null uid) and query
-- the federal corp registry through search_corp_registry / lookup_corp_by_bn.
--
-- Rule from here on: to lock a function away from the API roles, revoke from
-- PUBLIC as well, then grant the intended callers explicitly.
do $$
declare f record;
begin
  -- RPCs that need a signed-in caller (or the service role)
  for f in
    select p.oid::regprocedure::text as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind = 'f'
       and p.proname in ('seed_demo_agent_data', 'decide_pending_action', 'bootstrap_agent_session', 'claim_tenant',
                         'lookup_corp_by_bn', 'search_corp_registry', 'get_entitlements')
  loop
    execute format('revoke execute on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated, service_role', f.sig);
  end loop;

  -- Trigger / event-trigger functions are fired by Postgres, never called through
  -- PostgREST; firing does not check EXECUTE (probed in a rollback transaction:
  -- listings_price_history and guard_listing_trust_fields still ran for an
  -- authenticated update after the revoke).
  for f in
    select p.oid::regprocedure::text as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind = 'f'
       and p.prorettype in ('trigger'::regtype, 'event_trigger'::regtype)
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
  end loop;
end $$;

-- Today's trigger function had no fixed search_path (linter 0011).
alter function public.listings_price_history() set search_path = public, pg_temp;
