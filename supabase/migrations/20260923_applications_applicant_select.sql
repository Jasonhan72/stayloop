-- Applicants can read their own applications (e2e 2026-09-23).
--
-- The tenant workspace showed "还没有租房申请" to an account that had applied,
-- because applications only had the landlord policy (by listing ownership)
-- and the anonymous INSERT policy — the applicant, once logged in with the
-- email they applied with, could not read the row back. The row is the
-- applicant's own PII, so the applicant may read it; nothing else changes
-- (no UPDATE/DELETE for applicants; landlords keep FOR ALL on their
-- listings' rows).
drop policy if exists "Applicants see own applications" on public.applications;
create policy "Applicants see own applications" on public.applications
  for select to authenticated
  using (lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));
