-- Full-site review 2026-09-14 (found while probing the apply flow as anon).
--
-- The public INSERT policy on applications rate-limited by counting
-- applications INSIDE its own WITH CHECK. Postgres refuses a policy that
-- queries its own table ("infinite recursion detected in policy for relation
-- applications", 42P17), so every anonymous application insert has failed —
-- together with the phantom `full_name` column this is why production holds
-- zero applications. The count now runs in a SECURITY DEFINER function.

create or replace function public.recent_application_count(p_listing uuid)
returns integer language sql stable security definer set search_path = public as $$
  select count(*)::integer from public.applications
   where listing_id = p_listing and created_at >= now() - interval '24 hours';
$$;
revoke execute on function public.recent_application_count(uuid) from public;
grant execute on function public.recent_application_count(uuid) to anon, authenticated, service_role;

drop policy if exists "Public can insert applications (constrained)" on public.applications;
create policy "Public can insert applications (constrained)" on public.applications
  for insert with check (
    exists (select 1 from public.listings l where l.id = applications.listing_id and coalesce(l.is_active, true) = true)
    and email is not null and email <> ''
    and phone is not null and phone <> ''
    and ai_score is null and ai_summary is null and ai_income_score is null and ai_employment_score is null
    and ai_rental_history_score is null and ai_ltb_score is null and ai_reference_score is null
    and status is distinct from 'scored'
    and public.recent_application_count(listing_id) < 30
    and consent_screening = true
  );
