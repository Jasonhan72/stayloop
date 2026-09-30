-- listings.updated_at (2026-09-30): the AI rewrite card updates a listing only
-- if it has not changed since the card was drafted (optimistic concurrency):
-- an old card in a chat thread must not revert edits made in the editor since.
alter table public.listings add column if not exists updated_at timestamptz not null default now();
update public.listings set updated_at = coalesce(published_at, created_at, now()) where true;

create or replace function public.listings_touch_updated_at()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end $$;
revoke execute on function public.listings_touch_updated_at() from public, anon, authenticated, service_role;
drop trigger if exists trg_listings_touch_updated_at on public.listings;
create trigger trg_listings_touch_updated_at before update on public.listings
  for each row execute function public.listings_touch_updated_at();
