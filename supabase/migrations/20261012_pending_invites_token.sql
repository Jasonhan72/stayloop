-- 2026-10-12: a tenant invited to a managed tenancy could only accept from the email link — the app knew
-- about the invite (my_pending_invites) but not its token, so the rail said "accept the invitation in the
-- email". The invitee IS the token's intended holder (the function already filters by the caller's own JWT
-- email), so returning it to them is safe; the rail / today card now link straight to /join/<token>.
drop function if exists public.my_pending_invites();
create function public.my_pending_invites()
returns table(household_id uuid, address text, unit text, city text, invited_role text, expires_at timestamptz, start_date date, end_date date, current_lease_id uuid, token text)
language sql stable security definer set search_path = public as $$
  select h.id, h.address, h.unit, h.city, i.invited_role, i.expires_at, h.start_date, h.end_date, h.current_lease_id, i.token
  from public.household_invites i join public.households h on h.id = i.household_id
  where lower(i.invited_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    and i.accepted_at is null and i.declined_at is null and i.revoked_at is null and i.expires_at > now()
$$;
revoke all on function public.my_pending_invites() from public, anon;
grant execute on function public.my_pending_invites() to authenticated, service_role;
