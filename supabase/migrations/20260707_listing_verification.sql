-- Listing verification flow:
--   · Stayloop-published listings start 'pending' and only appear publicly
--     after the Stayloop team verifies them (then they carry VERIFIED).
--   · Listings imported from Realtor.ca (MLS-backed) display immediately
--     without verification, but carry a "Realtor.ca 来源" badge.
alter table public.listings
  add column if not exists source text not null default 'stayloop'
    check (source in ('stayloop','realtor')),
  add column if not exists verification_status text not null default 'pending'
    check (verification_status in ('pending','verified','rejected')),
  add column if not exists verified_at timestamptz;

-- Backfill: MLS number or realtor.ca source URL → realtor-sourced.
update public.listings set source = 'realtor'
  where mls_number is not null or source_url ilike '%realtor.ca%';

-- Existing curated rows stay live: mark them verified.
update public.listings set verification_status = 'verified', verified_at = now()
  where is_active and verification_status = 'pending';
