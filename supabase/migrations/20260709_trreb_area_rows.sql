-- Widen trreb_rent_stats for the full historical backfill: per-area rows
-- (municipalities + Toronto C/W/E districts) and townhouses alongside
-- apartments. Backfilled by scripts/trreb_backfill.py (2019 Q1 onward);
-- the weekly edge refresher keeps the 'All TRREB Areas' summary current.

alter table public.trreb_rent_stats
  add column if not exists area text not null default 'All TRREB Areas';
alter table public.trreb_rent_stats
  add column if not exists property_type text not null default 'apartment';

alter table public.trreb_rent_stats drop constraint trreb_rent_stats_pkey;
alter table public.trreb_rent_stats
  add primary key (period, area, property_type, bed_type);

create index if not exists trreb_rent_stats_lookup
  on public.trreb_rent_stats (area, property_type, bed_type, period desc);
