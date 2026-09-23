-- Lifecycle review fixes (code review 2026-09-23).
--
-- 1. The applicant self-read policy exposed every column of applications
--    (ai_score, ai_summary, dimension scores) to the applicant's JWT; the UI
--    only selected safe columns. Replace the policy with a definer view that
--    filters by the login email and carries no screening columns. This also
--    stops a multi-hat landlord from seeing received applications on the
--    tenant pages (the view is email-filtered, the landlord policy is not).
-- 2. An invited-but-not-yet-joined tenant could not see the household, so the
--    "accept the invitation" step never rendered. my_pending_invites() returns
--    the address of invites addressed to the login email (token excluded).
-- 3. renewal_intents: only a tenant member may record an intent.

drop policy if exists "Applicants see own applications" on public.applications;
create or replace view public.applicant_applications with (security_invoker = false) as
  select a.id, a.listing_id, a.first_name, a.last_name, a.email, a.status, a.created_at, a.move_in_date,
         a.viewed_at, a.screened_at, a.decision_notified_at, a.notified_at
  from public.applications a
  where a.email is not null and lower(a.email) = lower(coalesce(auth.jwt() ->> 'email', ''));
revoke all on public.applicant_applications from anon, public;
grant select on public.applicant_applications to authenticated, service_role;

create or replace function public.my_pending_invites()
returns table (household_id uuid, address text, unit text, city text, invited_role text, expires_at timestamptz, start_date date, end_date date, current_lease_id uuid)
language sql stable security definer set search_path = public as $$
  select h.id, h.address, h.unit, h.city, i.invited_role, i.expires_at, h.start_date, h.end_date, h.current_lease_id
  from public.household_invites i join public.households h on h.id = i.household_id
  where lower(i.invited_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    and i.accepted_at is null and i.declined_at is null and i.revoked_at is null and i.expires_at > now()
$$;
revoke all on function public.my_pending_invites() from public, anon;
grant execute on function public.my_pending_invites() to authenticated;

drop policy if exists renewal_intents_tenant_insert on public.renewal_intents;
create policy renewal_intents_tenant_insert on public.renewal_intents
  for insert to authenticated with check (
    tenant_user_id = auth.uid() and exists (
      select 1 from public.household_members m where m.household_id = renewal_intents.household_id and m.user_id = auth.uid() and m.role = 'tenant' and m.status = 'active'
    )
  );
