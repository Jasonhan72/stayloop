-- 2026-10-02 — site-wide test, L7-anon D-01 (database side).
--
-- A Realtor.ca-imported listing (source = 'realtor') has no Stayloop landlord: its
-- landlord_id is whoever ran the import. An application or a showing request on it
-- would hand the applicant's documents / message to that account, not the listing's
-- broker. The listing page and /apply now refuse these listings; this trigger makes the
-- rule hold for direct API inserts too (anon and authenticated alike).

create or replace function public.guard_listing_accepts_requests()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.listing_id is null then return new; end if;
  if exists (select 1 from public.listings l where l.id = new.listing_id and l.source = 'realtor') then
    raise exception 'realtor_listing: this listing comes from Realtor.ca and cannot be applied to or requested on Stayloop — contact the listing broker or a verified agent'
      using errcode = 'P0001';
  end if;
  return new;
end $$;
-- Definer so the check sees the listing even when the caller cannot read it (an inactive
-- realtor row is invisible to anon). Trigger functions need no EXECUTE grant.
revoke all on function public.guard_listing_accepts_requests() from public, anon, authenticated, service_role;

drop trigger if exists trg_applications_not_realtor on public.applications;
create trigger trg_applications_not_realtor
  before insert on public.applications
  for each row execute function public.guard_listing_accepts_requests();

drop trigger if exists trg_intents_not_realtor on public.showing_intents;
create trigger trg_intents_not_realtor
  before insert on public.showing_intents
  for each row execute function public.guard_listing_accepts_requests();
