-- 2026-09-24 (V0.6) — RECO registration expiry sweep.
-- Until now an admin had to mark agents renewal_due / expired by hand.
-- Daily pg_cron job:
--   verified     and expires_at <= today + 30  -> renewal_due (still listed:
--                the registration is still valid, it just needs a re-check)
--   verified / renewal_due and expires_at < today -> expired (leaves the
--                directory and the agent-only surfaces lock again)
-- Each transition writes an agent_verification_events row (actor null =
-- system). The agent re-verifies by updating expires_at on /agent/verify,
-- which drops the row to pending (guard_agent_profile_fields).

create or replace function public.agent_registration_sweep()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  n_due int := 0;
  n_exp int := 0;
begin
  -- guard_agent_profile_fields lets service_role through; claim it for this
  -- transaction only so the trigger does not revert the status change.
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  perform set_config('request.jwt.claim.role', 'service_role', true);

  with x as (
    update public.agent_profiles
       set status = 'expired'
     where status in ('verified', 'renewal_due')
       and expires_at is not null and expires_at < current_date
    returning auth_id, expires_at
  ), ev as (
    insert into public.agent_verification_events (agent_auth_id, action, actor, note)
    select auth_id, 'expired', null, 'auto: RECO registration expiry ' || expires_at from x
    returning 1
  ) select count(*) into n_exp from ev;

  with x as (
    update public.agent_profiles
       set status = 'renewal_due'
     where status = 'verified'
       and expires_at is not null and expires_at <= current_date + 30
    returning auth_id, expires_at
  ), ev as (
    insert into public.agent_verification_events (agent_auth_id, action, actor, note)
    select auth_id, 'renewal_due', null, 'auto: RECO registration expires ' || expires_at from x
    returning 1
  ) select count(*) into n_due from ev;

  return jsonb_build_object('renewal_due', n_due, 'expired', n_exp);
end $$;
revoke all on function public.agent_registration_sweep() from public, anon, authenticated;
grant execute on function public.agent_registration_sweep() to service_role;

-- renewal_due agents are still registered: keep them in the directory.
create or replace view public.agent_directory
with (security_invoker = false) as
  select ap.auth_id, l.id as landlord_id, ap.legal_name, ap.reco_number, ap.category, ap.brokerage_name,
         ap.business_email, ap.business_phone, ap.crea_member, ap.verified_at, ap.status
    from public.agent_profiles ap
    left join public.landlords l on l.auth_id = ap.auth_id
   where ap.status in ('verified', 'renewal_due')
     and (ap.expires_at is null or ap.expires_at >= current_date);
grant select on public.agent_directory to anon, authenticated;

select cron.unschedule('agent-registration-sweep') where exists (select 1 from cron.job where jobname = 'agent-registration-sweep');
select cron.schedule('agent-registration-sweep', '20 13 * * *', $$select public.agent_registration_sweep()$$);
