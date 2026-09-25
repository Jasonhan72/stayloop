-- 2026-09-25 (V0.6 walk-through) — applicant_applications was a plain view
-- (security_invoker=false) on which authenticated still held INSERT / UPDATE /
-- DELETE from the default privileges: a tenant could set their own
-- application to status='approved' through it, bypassing the applications
-- table RLS (probed in a rolled-back transaction). Writes revoked. The view
-- also carries a listing snapshot (slug / address / unit / active) so the
-- tenant's tracker can name a listing the public RLS no longer shows them
-- (an inactive one rendered as "—").
create or replace view public.applicant_applications as
 select a.id, a.listing_id, a.first_name, a.last_name, a.email, a.status, a.created_at, a.move_in_date, a.viewed_at, a.screened_at, a.decision_notified_at, a.notified_at,
        l.slug as listing_slug, l.address as listing_address, l.unit as listing_unit, l.is_active as listing_active
   from public.applications a
   left join public.listings l on l.id = a.listing_id
  where a.email is not null and lower(a.email) = lower(coalesce(auth.jwt() ->> 'email', ''));
revoke insert, update, delete, truncate, references, trigger on public.applicant_applications from authenticated, anon, public;
grant select on public.applicant_applications to authenticated;
