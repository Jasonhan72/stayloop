-- Agents screen directly (user 2026-09-29, the same day as 20260929_screening_role_gate.sql:
--「经纪可以直接筛选，这个本来就是经纪的工作，客户默认委托了这个的」). A RECO agent whose
-- registration is live (verified or renewal_due — the same statuses as isRegistrationLive in
-- lib/agentProfile.ts) may create a screening without a client delegation; a confirmed delegation
-- stays optional and still records the screening under the client (validated by
-- guard_screening_delegation). Tenant-only accounts and agents whose registration is pending,
-- rejected or expired are still refused.
create or replace function public.guard_screening_role()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  h jsonb;
begin
  if not public.is_direct_client_write() then return new; end if;
  if new.delegation_id is not null then return new; end if;  -- validated by guard_screening_delegation
  h := public.my_hats();
  if coalesce((h ->> 'landlord')::boolean, false) then return new; end if;
  if (h ->> 'agent') in ('verified', 'renewal_due') then return new; end if;
  raise exception 'screening_requires_landlord_or_agent'
    using errcode = '42501',
          hint = 'Tenant screening is for landlords (activate at /landlord/become) and RECO agents whose registration is verified.';
end
$$;

revoke all on function public.guard_screening_role() from public, anon, authenticated;
