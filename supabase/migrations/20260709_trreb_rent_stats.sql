-- Cache for TRREB quarterly Rental Market Report averages (leased condo
-- apartment rents by bedroom type, TRREB-wide). Written only by the
-- service-role refresher (/api/agent/trreb-refresh); public read powers the
-- market card's official benchmark line.

create table if not exists public.trreb_rent_stats (
  period text not null,                -- e.g. '2026 Q1'
  bed_type int not null,               -- 0 = bachelor, 1, 2, 3 = 3+
  avg_rent numeric not null,
  prev_avg_rent numeric,
  leased int,
  source_url text,
  fetched_at timestamptz not null default now(),
  primary key (period, bed_type)
);

alter table public.trreb_rent_stats enable row level security;

create policy trreb_rent_stats_public_read
  on public.trreb_rent_stats for select using (true);

-- Weekly refresh, Mondays 13:10 UTC (reports are quarterly; weekly polling
-- picks a new quarter up promptly without hammering trreb.ca).
do $do$
begin
  if exists (select 1 from cron.job where jobname = 'trreb-rent-refresh') then
    perform cron.unschedule('trreb-rent-refresh');
  end if;
end
$do$;

select cron.schedule(
  'trreb-rent-refresh',
  '10 13 * * 1',
  $job$
  select net.http_post(
    url     := 'https://www.stayloop.ai/api/agent/trreb-refresh',
    headers := jsonb_build_object(
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret'),
      'content-type', 'application/json'
    ),
    body    := '{}'::jsonb
  );
  $job$
);
