-- 2026-10-11 · PropTx 8.13 / 8.05: the anon role can no longer read the listings table at all. Public
-- surfaces read through /api/listings/search and /api/listings/[slug] (service role, per-IP budgets,
-- card / detail fields only, seller display directives applied). Registered users keep the RLS read
-- ("Public can read verified listings" still applies to authenticated). Anonymous applicants and
-- showing requests still work: the triggers that read listings on their behalf are SECURITY DEFINER.
revoke select on public.listings from anon;
