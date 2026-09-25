-- 2026-09-25 (V0.6) — listing detail page content (StreetEasy comparison):
--   • transit / enriched_at: nearest subway / GO / streetcar stops from
--     OpenStreetMap, geocoded once and cached 30 days (app/api/listings/enrich).
--   • price_history: appended by trigger on every rent change (and seeded on
--     insert) so the page can show a real price record; nothing wrote the
--     column before this, so existing rows get their listing price as row 1.
alter table public.listings add column if not exists transit jsonb;
alter table public.listings add column if not exists enriched_at timestamptz;

create or replace function public.listings_price_history()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if new.price_history is null or jsonb_typeof(new.price_history) <> 'array' or jsonb_array_length(new.price_history) = 0 then
      new.price_history := jsonb_build_array(jsonb_build_object('date', current_date, 'price', new.monthly_rent, 'event', 'listed'));
    end if;
  elsif new.monthly_rent is distinct from old.monthly_rent then
    new.price_history := (case when jsonb_typeof(old.price_history) = 'array' then old.price_history else '[]'::jsonb end)
      || jsonb_build_object('date', current_date, 'price', new.monthly_rent, 'prev', old.monthly_rent, 'event', 'changed');
  end if;
  return new;
end $$;
revoke execute on function public.listings_price_history() from anon, authenticated;
drop trigger if exists listings_price_history on public.listings;
create trigger listings_price_history before insert or update on public.listings
  for each row execute function public.listings_price_history();

update public.listings
   set price_history = jsonb_build_array(jsonb_build_object('date', coalesce(published_at, created_at)::date, 'price', monthly_rent, 'event', 'listed'))
 where price_history is null or jsonb_typeof(price_history) <> 'array' or jsonb_array_length(price_history) = 0;
