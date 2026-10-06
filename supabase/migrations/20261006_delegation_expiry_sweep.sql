-- 2026-10-06 (V0.7) — delegations past their end date become `expired`.
-- Every read already treated an `active` row with expires_at in the past as
-- dead (the RLS gate, my_matters, RepresentingStrip, the client table), but the
-- row itself stayed `active` and nothing recorded the moment it lapsed. A daily
-- pg_cron job now closes it: active / pending rows whose expires_at has passed
-- → expired, with one agent_audit_events row per party (actor_type 'system',
-- the same shape the API routes write for proposed / confirmed / revoked).

create or replace function public.delegation_expiry_sweep()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  n int := 0;
begin
  -- RETURNING gives the new row, so the previous status is read first.
  with due as (
    select id, status as previous_status from public.delegations
     where status in ('active', 'pending')
       and expires_at <= now()
       for update
  ), x as (
    update public.delegations d
       set status = 'expired', updated_at = now()
      from due
     where d.id = due.id
    returning d.id, d.principal_auth_id, d.delegate_auth_id, d.client_id, d.scope, d.allowed_actions, d.expires_at, due.previous_status as status
  ), ev as (
    insert into public.agent_audit_events (actor_id, actor_type, action, target_type, target_id, acting_role, delegation_id, metadata)
    select p.actor_id, 'system', 'delegation_expired', 'delegation', x.id, p.acting_role, x.id,
           jsonb_build_object('expires_at', x.expires_at, 'previous_status', x.status, 'scope', x.scope, 'allowed_actions', x.allowed_actions, 'client_id', x.client_id)
      from x
      cross join lateral (
        values (x.delegate_auth_id, 'agent'::text), (x.principal_auth_id, null::text)
      ) as p(actor_id, acting_role)
     where p.actor_id is not null
    returning 1
  ) select count(*) into n from x;
  return jsonb_build_object('expired', n);
end $$;
revoke all on function public.delegation_expiry_sweep() from public, anon, authenticated;
grant execute on function public.delegation_expiry_sweep() to service_role;

select cron.unschedule('delegation-expiry-sweep') where exists (select 1 from cron.job where jobname = 'delegation-expiry-sweep');
select cron.schedule('delegation-expiry-sweep', '15 13 * * *', $$select public.delegation_expiry_sweep()$$);
