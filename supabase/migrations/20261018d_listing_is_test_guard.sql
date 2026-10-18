-- Site test 2026-10-17 · C-S3-5 / C-S3-7 / T6-D11: is_test was a client-writable column.
-- A landlord could clear the 「测试房源」 mark on their own listing, and a quick-published "[TEST] …"
-- address landed with is_test=false. For direct client writes: a "[TEST]" address or title marks the
-- listing as a test on insert and on update; otherwise the column keeps its old value (admins and
-- service-role writes are not direct client writes and can still set it either way).
create or replace function public.guard_listing_feed_fields()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare
  tagged boolean := coalesce(new.address, '') ilike '[TEST]%' or coalesce(new.title, '') ilike '[TEST]%';
begin
  if public.is_direct_client_write() then
    if tg_op = 'INSERT' then
      new.display_internet := true; new.display_address := true; new.display_avm := true;
      new.feed_source := null; new.feed_updated_at := null;
      new.is_test := tagged;
    else
      new.display_internet := old.display_internet; new.display_address := old.display_address; new.display_avm := old.display_avm;
      new.feed_source := old.feed_source; new.feed_updated_at := old.feed_updated_at;
      new.is_test := coalesce(old.is_test, false) or tagged;
    end if;
  end if;
  return new;
end $$;
revoke execute on function public.guard_listing_feed_fields() from public, anon, authenticated, service_role;

-- Rows written before the guard: a "[TEST]" address or title is a test listing.
update public.listings set is_test = true
 where coalesce(is_test, false) = false and (coalesce(address, '') ilike '[TEST]%' or coalesce(title, '') ilike '[TEST]%');
