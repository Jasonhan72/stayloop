-- 2026-10-31 system health check (Supabase advisors).
--
-- 1) settle_referral_commission: the referral-commission engine is frozen
--    (decision 2026-09-13; /api/stripe/connect/settle answers 410 unless
--    STAYLOOP_COMMISSION_ENGINE=enabled). 20260704_security_review_fixes
--    revoked EXECUTE from authenticated, but 20260708_fix_settle_referral_commission
--    re-created the function and granted it back, so any signed-in account could
--    again call the SECURITY DEFINER RPC directly via /rest/v1/rpc and write
--    commission rows for any referral. Revoke from every API role; service_role
--    keeps it. When the engine is unfrozen, grant authenticated back in the
--    same migration that flips the flag.
revoke execute on function public.settle_referral_commission(uuid, numeric) from public, anon, authenticated;

-- 2) Exact duplicate indexes (advisor duplicate_index). Keep the idx_* ones
--    that the migrations create; the *_idx twins were created ad hoc in prod.
drop index if exists public.maintenance_tickets_listing_id_idx;
drop index if exists public.screenings_landlord_id_idx;
drop index if exists public.showing_intents_listing_id_idx;
