-- 2026-07-08 — daily proactive agent sweep via pg_cron + pg_net.
--
-- Calls POST https://www.stayloop.ai/api/agent/proactive in CRON MODE once a
-- day at 13:00 UTC (≈ 9am Toronto during EDT). Cron mode is gated by the
-- x-cron-secret header; the route runs the platform-wide sweep with the
-- service role (renewal-window proposals + month-end rent reminders).
--
-- SETUP REQUIRED (both sides must hold the SAME secret value):
--   1. Vault secret named 'cron_secret' in this Supabase project:
--        select vault.create_secret('<random-long-value>', 'cron_secret');
--      The schedule below reads it at run time via vault.decrypted_secrets,
--      so the cron.job command text stores only the SELECT expression — the
--      secret value itself never appears in the job definition.
--   2. Cloudflare Pages env var CRON_SECRET set to the same value (the route
--      disables the cron path entirely when CRON_SECRET is unset).

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Unschedule-if-exists guard so re-running this migration never double-books
-- the job. cron.unschedule errors on a missing job, hence the existence check.
do $do$
begin
  if exists (select 1 from cron.job where jobname = 'agent-proactive-daily') then
    perform cron.unschedule('agent-proactive-daily');
  end if;
end
$do$;

select cron.schedule(
  'agent-proactive-daily',
  '0 13 * * *',
  $job$
  select net.http_post(
    url     := 'https://www.stayloop.ai/api/agent/proactive',
    headers := jsonb_build_object(
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret'),
      'content-type', 'application/json'
    ),
    body    := '{}'::jsonb
  );
  $job$
);
