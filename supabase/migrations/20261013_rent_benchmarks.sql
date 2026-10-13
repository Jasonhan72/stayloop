-- 2026-10-13: the rent benchmark moves from TRREB's quarterly report (copyright
-- "all rights reserved", no reproduction licence found) to two openly licensed
-- sources: CMHC's Rental Market Survey (zone × bedroom averages, annual) and
-- Statistics Canada's Quarterly Rent Statistics (asking rents by unit type,
-- table 46-10-0092-01). Both licences permit reproduction and value-added use
-- with attribution. The TRREB cache table stays (not read) and its cron stops.
create table if not exists public.rent_benchmarks (
  id bigint generated always as identity primary key,
  source text not null check (source in ('cmhc', 'statcan')),
  kind text not null check (kind in ('purpose_built', 'condo', 'asking')),
  period text not null,            -- '2025-10' (CMHC October survey) / '2026-04' (StatCan quarter start month)
  area text not null,              -- as published: 'Zone 1 - Toronto (Central)', 'Toronto CMA', 'North York'…
  area_key text not null,          -- lower-case key used for lookups
  bedrooms smallint not null check (bedrooms between 0 and 3),  -- 0 studio, 3 = three or more
  avg_rent numeric not null,
  prev_avg numeric,                -- same period one year earlier, when published alongside
  quality text,                    -- CMHC a/b/c/d, StatCan status
  note text,
  loaded_at timestamptz not null default now(),
  unique (source, kind, period, area_key, bedrooms)
);
alter table public.rent_benchmarks enable row level security;
drop policy if exists rent_benchmarks_public_read on public.rent_benchmarks;
create policy rent_benchmarks_public_read on public.rent_benchmarks for select to anon, authenticated using (true);
revoke all on public.rent_benchmarks from anon, authenticated;
grant select on public.rent_benchmarks to anon, authenticated;
grant all on public.rent_benchmarks to service_role;
create index if not exists rent_benchmarks_lookup on public.rent_benchmarks (source, kind, area_key, bedrooms, period desc);

-- The TRREB report is no longer fetched.
do $$ begin
  if exists (select 1 from cron.job where jobname = 'trreb-rent-refresh') then perform cron.unschedule('trreb-rent-refresh'); end if;
end $$;

-- Public stats: the count of quarters now comes from the StatCan series.
create or replace function public.public_stats()
returns jsonb language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'screenings', (select count(*) from public.screenings),
    'ltb_orders', (select greatest(0, reltuples)::bigint from pg_class where oid = 'public.ltb_orders'::regclass),
    'ltb_orders_estimated', true,
    'listings', (select count(*) from public.listings where is_active and not is_test and (verification_status = 'verified' or source = 'realtor')),
    'benchmark_quarters', (select count(distinct period) from public.rent_benchmarks where source = 'statcan'),
    'trreb_quarters', (select count(distinct period) from public.rent_benchmarks where source = 'statcan')
  )
$$;
revoke all on function public.public_stats() from public, anon, authenticated;
grant execute on function public.public_stats() to service_role;
