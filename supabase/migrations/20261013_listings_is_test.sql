-- 2026-10-13: every listing still on the site is test data (the user's own
-- sample units + QA rows); the Realtor.ca imports were archived the same day.
-- `is_test` marks a listing as "测试房源 · 非实际房源": shown with a badge on
-- the browse page, the detail page, the AI chat cards and the apply page, and
-- left out of the public-stats count. Service role sets it; landlords may also
-- set it on their own rows (harmless).
alter table public.listings add column if not exists is_test boolean not null default false;

update public.listings set is_test = true
 where is_active = true and source <> 'realtor';

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
                  where is_active and not is_test and (verification_status = 'verified' or source = 'realtor')),
    'trreb_quarters', (select count(distinct period) from public.trreb_rent_stats)
  )
$$;
revoke all on function public.public_stats() from public, anon, authenticated;
grant execute on function public.public_stats() to service_role;
