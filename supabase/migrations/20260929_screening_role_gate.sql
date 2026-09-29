-- 租客筛查只给房东或经纪用 (user 2026-09-29:「租客筛选功能需要房东或者经纪的角色才可以使用」).
--
-- The pages already route people this way (/screening/app sends an account without the
-- landlord hat to /landlord/become; the agent rail refuses to create a screening without a
-- live client delegation), but the table accepted a row from ANY signed-in account — the
-- policy "Landlords can insert own screenings" only checks auth.uid() = landlord_id — and the
-- scoring route then scored whatever row its caller could read.
--
-- This trigger is the rule for new rows written directly by a client: the caller must hold the
-- landlord hat (my_hats().landlord — a landlords row), or the row must carry a delegation, which
-- guard_screening_delegation validates (the caller is the delegate, the delegation is active,
-- unexpired and allows 'screen'). Service-role writers — /api/screening/from-application after
-- its ownership check, the partner API bound to a landlord — and admins pass
-- (is_direct_client_write() is false for them). Existing rows are left as they are.
create or replace function public.guard_screening_role()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if not public.is_direct_client_write() then return new; end if;
  if new.delegation_id is not null then return new; end if;  -- validated by guard_screening_delegation
  if coalesce((public.my_hats() ->> 'landlord')::boolean, false) then return new; end if;
  raise exception 'screening_requires_landlord_or_agent'
    using errcode = '42501',
          hint = 'Tenant screening is for landlords (activate at /landlord/become) or RECO agents acting under a client delegation.';
end
$$;

-- A trigger function is never called directly; the API roles do not need EXECUTE on it.
revoke all on function public.guard_screening_role() from public, anon, authenticated;

drop trigger if exists trg_guard_screening_role on public.screenings;
create trigger trg_guard_screening_role
  before insert on public.screenings
  for each row execute function public.guard_screening_role();
