-- 2026-09-24 (V0.6) — three-role test report SL-L-05: landlords had no way to
-- file away decided applications. Landlord-private (not in the applicant's
-- applicant_applications view); written through the existing landlord RLS policy.
alter table public.applications add column if not exists archived_at timestamptz;
