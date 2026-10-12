-- 2026-10-12: weekly model auto-discovery (lib/models/autoDiscover.ts via POST /api/cron/model-discover).
-- Mondays 13:40 UTC, after the TRREB refresh; the cron secret comes from Vault like the other jobs.
select cron.unschedule('model-discover-weekly') where exists (select 1 from cron.job where jobname = 'model-discover-weekly');
select cron.schedule(
  'model-discover-weekly',
  '40 13 * * 1',
  $$ select net.http_post(
       url := 'https://www.stayloop.ai/api/cron/model-discover',
       headers := jsonb_build_object('x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret'), 'content-type', 'application/json'),
       body := '{}'::jsonb,
       timeout_milliseconds := 300000) $$
);
