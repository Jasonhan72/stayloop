-- 2026-09-22 · external walkthrough: the AI listing flow never asked the
-- fields tenants filter on. utilities_included / lease_term / pets_allowed
-- already existed; smoking is the one a landlord may lawfully set (unlike
-- "no pets", void under RTA s.14) and had no column.
alter table public.listings add column if not exists smoking_policy text
  check (smoking_policy is null or smoking_policy in ('no', 'yes', 'outdoor_only'));
comment on column public.listings.smoking_policy is 'no | yes | outdoor_only; null = not stated';
