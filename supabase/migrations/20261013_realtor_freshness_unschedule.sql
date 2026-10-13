-- 2026-10-13 · Unschedule the hourly Realtor.ca freshness sweep.
--
-- PropTx / TRREB refused Stayloop's IDX/VOW data request on 2026-10-13, and
-- MLS rules (PropTx MLS Rules, CREA DDF terms, REALTOR.ca terms of use) forbid
-- third-party platforms and AI from using MLS data. Stayloop therefore stops
-- READING Realtor.ca entirely: REALTOR_LIVE_READS in lib/listings/externalSources.ts
-- is false, /api/cron/realtor-freshness answers { disabled: true } before any
-- Realtor.ca request, and every Realtor.ca-imported listing has been archived
-- (done separately via service role). The pg_cron job 'realtor-freshness'
-- (20261003_realtor_freshness.sql, hourly at :35) has nothing left to do, so it
-- is removed here. Wrapped so the migration is a no-op if the job is already
-- absent (e.g. a fresh project or a previous manual unschedule).
--
-- The listings.realtor_check column, its guard trigger and the pure decision
-- module stay in place for the historical rows the admin card still summarises.

do $$
begin
  if exists (select 1 from cron.job where jobname = 'realtor-freshness') then
    perform cron.unschedule('realtor-freshness');
  end if;
end $$;
