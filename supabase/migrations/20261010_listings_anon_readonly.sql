-- Public listings are read-only for the anonymous role (2026-10-10, TRREB-readiness audit).
-- The role carried the migration-era default grant (ALL) on public.listings; RLS blocked the
-- writes, but a table-level write grant is one policy mistake away from being exercised.
-- SELECT stays (the browse page and listing detail read it directly). The MLS feed itself will
-- land in a separate table with no anon grant at all, served through a rate-limited route.
revoke insert, update, delete, truncate, references, trigger on public.listings from anon;
