-- 2026-10-11 · PropTx readiness (Art. 8.14 / 8.15.02 / 8.17): per-listing display directives a feed will
-- carry, plus the feed stamp. Stayloop-published and Realtor.ca rows keep the defaults (shown everywhere).
--   display_internet  false → never shown on any public surface (seller opted out of internet display)
--   display_address   false → address withheld on public surfaces (neighbourhood + city only)
--   display_avm       false → no automated value / "vs benchmark" figures beside the listing
--   feed_source       which licensed feed the row came from (null = Stayloop / Realtor.ca import)
--   feed_updated_at   last refresh from that feed; the public search hides feed rows older than 24 h
alter table public.listings
  add column if not exists display_internet boolean not null default true,
  add column if not exists display_address  boolean not null default true,
  add column if not exists display_avm      boolean not null default true,
  add column if not exists feed_source      text,
  add column if not exists feed_updated_at  timestamptz;
comment on column public.listings.display_internet is 'Seller directive (MLS feed): false = withhold the listing from internet display (PropTx 8.14)';
comment on column public.listings.display_address  is 'Seller directive (MLS feed): false = withhold the address from internet display (PropTx 8.14)';
comment on column public.listings.display_avm      is 'Seller directive (MLS feed): false = no automated value estimate beside the listing (PropTx 8.15.02)';
comment on column public.listings.feed_updated_at  is 'Last refresh from the licensed feed; public search hides feed rows older than 24 h (PropTx 8.17)';
create index if not exists listings_public_search_idx on public.listings (is_active, display_internet, created_at desc);
-- Clients never set feed directives: the trust-field guard already reverts source / verification writes from
-- non-admins; extend the same protection to these columns.
create or replace function public.guard_listing_feed_fields() returns trigger
language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  if public.is_direct_client_write() then
    if tg_op = 'INSERT' then
      new.display_internet := true; new.display_address := true; new.display_avm := true;
      new.feed_source := null; new.feed_updated_at := null;
    else
      new.display_internet := old.display_internet; new.display_address := old.display_address; new.display_avm := old.display_avm;
      new.feed_source := old.feed_source; new.feed_updated_at := old.feed_updated_at;
    end if;
  end if;
  return new;
end $$;
revoke all on function public.guard_listing_feed_fields() from public, anon, authenticated, service_role;
drop trigger if exists listings_guard_feed_fields on public.listings;
create trigger listings_guard_feed_fields before insert or update on public.listings
  for each row execute function public.guard_listing_feed_fields();
