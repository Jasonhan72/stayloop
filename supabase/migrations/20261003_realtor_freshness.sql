-- Realtor.ca-imported listings had no way to go offline once the listing was
-- leased or withdrawn on Realtor.ca (CDN photos outlive the listing, so photo
-- checks can't tell). /api/cron/realtor-freshness reads each listing's
-- Realtor.ca page on a rotation and records the result here; two consecutive
-- "no longer exists" readings take the listing offline.
alter table public.listings
  add column if not exists realtor_check jsonb;

-- Server-owned: a direct client write (the importing landlord account owns
-- these rows) can't forge or clear it.
create or replace function public.guard_listing_realtor_check()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if public.is_direct_client_write() then
    if tg_op = 'INSERT' then
      new.realtor_check := null;
    else
      new.realtor_check := old.realtor_check;
    end if;
  end if;
  return new;
end $$;

revoke all on function public.guard_listing_realtor_check() from public, anon, authenticated, service_role;

drop trigger if exists trg_guard_listing_realtor_check on public.listings;
create trigger trg_guard_listing_realtor_check
  before insert or update on public.listings
  for each row execute function public.guard_listing_realtor_check();

-- Writing the check result is not an edit of the listing (keeps the AI
-- revision card's updated_at conflict check quiet).
create or replace function public.listings_touch_updated_at()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  -- Server-owned and cache columns: writing them is not an edit of the listing.
  cache_cols constant text[] := array[
    'updated_at', 'lat', 'lng', 'transit', 'enriched_at', 'price_history',
    'verification_status', 'verified_at', 'match_score', 'badge', 'luna_note',
    'pin_x', 'pin_y', 'thumb_a', 'thumb_b', 'trust_tier', 'realtor_check'
  ];
begin
  if (to_jsonb(new) - cache_cols) is distinct from (to_jsonb(old) - cache_cols) then
    new.updated_at := clock_timestamp();
  else
    new.updated_at := old.updated_at;
  end if;
  return new;
end $function$;

-- Hourly rotation: each run checks the 20 least recently checked rows, so
-- every active Realtor.ca listing is read several times a day.
do $do$
begin
  perform cron.unschedule('realtor-freshness') where exists (select 1 from cron.job where jobname = 'realtor-freshness');
end
$do$;

select cron.schedule(
  'realtor-freshness',
  '35 * * * *',
  $job$
  select net.http_post(
    url     := 'https://www.stayloop.ai/api/cron/realtor-freshness',
    headers := jsonb_build_object(
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret'),
      'content-type', 'application/json'
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 170000
  );
  $job$
);
