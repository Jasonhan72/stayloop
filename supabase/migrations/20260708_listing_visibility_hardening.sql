-- P0 security: the "only show verified-or-realtor listings publicly" rule was
-- enforced ONLY in app-layer query filters. The anon key ships in the client
-- bundle, so anyone could GET /rest/v1/listings?is_active=eq.true and read
-- pending/rejected listings the app hides. And the own-listings FOR ALL policy
-- let a landlord self-approve by PATCHing verification_status. Fix both in the DB.

-- 1) Public reads are gated to verified OR realtor-sourced. Landlords still see
--    their own pending listings via the separate own-listings policy (policies OR).
drop policy if exists "Public can read active listings" on public.listings;
create policy "Public can read verified listings" on public.listings
  for select using (
    is_active = true
    and (verification_status = 'verified' or source = 'realtor')
  );

-- 2) Protect the trust fields from landlord self-service. RLS WITH CHECK can't
--    compare against the OLD row, so a BEFORE UPDATE trigger reverts any change
--    to verification_status / source / verified_at unless the writer is a
--    Stayloop admin (the /admin/verify path passes is_stayloop_admin()).
create or replace function public.guard_listing_trust_fields()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  -- Admins (via /admin/verify) and the service role (backend / migrations)
  -- may change trust fields; landlord self-service cannot.
  if auth.role() = 'service_role' or public.is_stayloop_admin() then
    return new;
  end if;
  new.verification_status := old.verification_status;
  new.source := old.source;
  new.verified_at := old.verified_at;
  return new;
end $$;

drop trigger if exists trg_guard_listing_trust on public.listings;
create trigger trg_guard_listing_trust
  before update on public.listings
  for each row execute function public.guard_listing_trust_fields();
