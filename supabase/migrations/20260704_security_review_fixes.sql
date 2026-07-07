-- 2026-07-04 — Full-site security review fixes (applied to prod same day).
--
-- 1) landlords: the "Public can read landlords" policy was USING(true) on
--    SELECT, exposing every landlord's email / phone / full_name /
--    stripe_customer_id / stripe_subscription_id to anyone holding the
--    public anon key. No anonymous flow reads landlords (verified: public
--    listing pages don't touch the table; notify-landlord uses the service
--    role). Replaced with an owner-scoped read: auth_id matches the session,
--    or id matches for rows keyed by authId (dual-ID invariant). Legacy rows
--    with NULL auth_id become readable after claim_landlord() (SECURITY
--    DEFINER) backfills auth_id on first login — the existing claim path.
DROP POLICY IF EXISTS "Public can read landlords" ON public.landlords;
DROP POLICY IF EXISTS "Landlords read own row" ON public.landlords;
CREATE POLICY "Landlords read own row" ON public.landlords
  FOR SELECT TO authenticated
  USING (auth.uid() = auth_id OR auth.uid() = id);

-- 2) settle_referral_commission: the 25% referral-commission engine is dead —
--    pricing moved to pure SaaS subscriptions (no commission cut, Stayloop is
--    not RECO-registered), zero code paths call it, and its 20260608 rewrite
--    references commission/invoice columns that don't match the schema. It
--    must not be invokable while it awaits removal.
REVOKE EXECUTE ON FUNCTION public.settle_referral_commission(uuid, numeric) FROM PUBLIC, anon, authenticated;

-- 3) trust_api_rate_limit: RLS had been enabled directly in prod but the
--    20260618 migration file lacked it — re-asserted here for repo parity.
--    No policies on purpose: default-deny for anon/authenticated; the
--    bump_trust_api_rate RPC and trust/verify route use the service role.
ALTER TABLE public.trust_api_rate_limit ENABLE ROW LEVEL SECURITY;
