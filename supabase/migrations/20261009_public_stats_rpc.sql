-- Homepage "things you can verify" numbers in one round trip (2026-10-09).
-- /api/public/stats used to issue four PostgREST calls per uncached request, one of them an exact
-- count(*) over ltb_orders (176k rows) and another a `select period` capped by max_rows=1000 that only
-- happened to still contain every quarter. This function returns all four numbers at once:
--   ltb_orders  → planner estimate (pg_class.reltuples; the table only changes at the monthly ingest,
--                 which rewrites every row and so triggers autoanalyze — the estimate equals the exact
--                 count in practice and never scans the table)
--   screenings / visible listings → exact (small tables)
--   trreb_quarters → count(distinct period), not capped
-- SECURITY INVOKER; only service_role may execute (the route holds the service key). Never granted to
-- anon/authenticated: screenings has no public read policy.
create or replace function public.public_stats()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'screenings', (select count(*) from public.screenings),
    'ltb_orders', (select greatest(0, reltuples)::bigint from pg_class where oid = 'public.ltb_orders'::regclass),
    'ltb_orders_estimated', true,
    'listings', (select count(*) from public.listings
                  where is_active and (verification_status = 'verified' or source = 'realtor')),
    'trreb_quarters', (select count(distinct period) from public.trreb_rent_stats)
  )
$$;
revoke all on function public.public_stats() from public, anon, authenticated;
grant execute on function public.public_stats() to service_role;
