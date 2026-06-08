-- 20260608_security_fixes.sql
-- Code review fixes: RLS gaps, auth checks, missing columns, trust_api_keys, FK indexes.
-- Applied to prod Supabase (upbkcbicjjpznojkpqtg) on 2026-06-08.

-- ============================================================
-- 1. trust_api_keys table (partner auth for /api/trust/verify)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.trust_api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_name text NOT NULL,
  api_key text NOT NULL UNIQUE,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.trust_api_keys ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 2. settle_referral_commission — drop + recreate with auth check
-- ============================================================
DROP FUNCTION IF EXISTS public.settle_referral_commission(uuid, numeric);

CREATE FUNCTION public.settle_referral_commission(ref_id uuid, gross numeric)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r  record;
  fee numeric;
  inv_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT * INTO r FROM referral WHERE id = ref_id;
  IF r IS NULL THEN
    RAISE EXCEPTION 'referral not found';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM brokerages
    WHERE id = r.from_brokerage_id AND owner_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'not authorized: you do not own the referring brokerage';
  END IF;

  IF r.status <> 'closed' THEN
    RAISE EXCEPTION 'referral must be in closed status to settle';
  END IF;

  fee := ROUND(gross * 0.25, 2);

  INSERT INTO commission (referral_id, gross_amount, platform_fee, net_amount, payer_brokerage_id)
  VALUES (ref_id, gross, fee, gross - fee, r.from_brokerage_id)
  RETURNING id INTO inv_id;

  INSERT INTO invoice (commission_id, amount, status)
  VALUES (inv_id, fee, 'pending');

  UPDATE referral SET status = 'settled' WHERE id = ref_id;

  RETURN jsonb_build_object(
    'commission_id', inv_id,
    'gross', gross,
    'platform_fee', fee,
    'net', gross - fee
  );
END;
$$;

-- ============================================================
-- 3. commission — replace payer-only policy with payer+payee
-- ============================================================
DROP POLICY IF EXISTS commission_party ON public.commission;
CREATE POLICY commission_read ON public.commission
  FOR SELECT USING (
    payer_brokerage_id IN (
      SELECT id FROM brokerages WHERE owner_id = auth.uid()
    )
    OR
    referral_id IN (
      SELECT r.id FROM referral r
      JOIN brokerages b ON b.id = r.to_brokerage_id
      WHERE b.owner_id = auth.uid()
    )
  );

-- ============================================================
-- 4. agent_audit_events — tighten INSERT to force actor_id = auth.uid()
-- ============================================================
DROP POLICY IF EXISTS agent_audit_events_insert_self ON public.agent_audit_events;
CREATE POLICY agent_audit_events_insert_self ON public.agent_audit_events
  FOR INSERT WITH CHECK (actor_id = auth.uid());

-- ============================================================
-- 5. rent_payments — add missing created_at
-- ============================================================
ALTER TABLE public.rent_payments ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

-- ============================================================
-- 6. referral — add missing FK to tenants + listings
-- ============================================================
DO $$ BEGIN
  ALTER TABLE public.referral ADD CONSTRAINT referral_tenant_id_fk FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.referral ADD CONSTRAINT referral_listing_id_fk FOREIGN KEY (listing_id) REFERENCES public.listings(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- 7. FK indexes (only tables that exist in prod)
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_showing_intents_tenant_id ON public.showing_intents(tenant_id);
CREATE INDEX IF NOT EXISTS idx_showing_intents_listing_id ON public.showing_intents(listing_id);
CREATE INDEX IF NOT EXISTS idx_rent_payments_lease_id ON public.rent_payments(lease_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_tickets_listing_id ON public.maintenance_tickets(listing_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_tickets_tenant_id ON public.maintenance_tickets(tenant_id);
CREATE INDEX IF NOT EXISTS idx_referral_tenant_id ON public.referral(tenant_id);
CREATE INDEX IF NOT EXISTS idx_referral_listing_id ON public.referral(listing_id);
