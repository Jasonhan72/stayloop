-- 2026-07-05 — AI-native vertical slice: real leases → proactive renewal
-- proposals → approved actions EXECUTE for real. (Applied to prod same day.)
--
-- lease_documents comes from 20260509_v5_schema.sql, which was never fully
-- applied to prod (prod carried the empty old-layer lease_agreements
-- instead). Re-asserted here with the execution-layer extensions so both
-- fresh environments and prod converge on the repo-canonical table.

CREATE TABLE IF NOT EXISTS public.lease_documents (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid REFERENCES public.applications(id) ON DELETE CASCADE,
  listing_id     uuid REFERENCES public.listings(id),
  tenant_id      uuid REFERENCES public.tenants(id),
  landlord_id    uuid REFERENCES public.landlords(id),
  status         text DEFAULT 'draft' CHECK (status IN ('draft','sent','signed_tenant','signed_both','active','ended')),
  pdf_path       text,
  monthly_rent   numeric(10,2),
  start_date     date,
  end_date       date,
  signed_at      timestamptz,
  created_at     timestamptz DEFAULT now(),
  -- Landlord-entered existing tenancies: tenant contact lives on the lease
  -- (the tenant may not be a Stayloop user yet); unit label is independent
  -- of listings.
  tenant_name    text,
  tenant_email   text,
  unit_label     text
);
CREATE INDEX IF NOT EXISTS lease_documents_landlord_end_idx
  ON public.lease_documents (landlord_id, end_date);

ALTER TABLE public.lease_documents ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid='public.lease_documents'::regclass AND polname='leases_parties') THEN
    CREATE POLICY leases_parties ON public.lease_documents
      FOR ALL USING (
        tenant_id IN (SELECT id FROM public.tenants WHERE auth_id = auth.uid())
        OR landlord_id IN (SELECT id FROM public.landlords WHERE auth_id = auth.uid())
      );
  END IF;
END $$;

-- agent_pending_actions: the execution layer stamps what actually happened.
-- executed_at doubles as the idempotency claim (conditional update).
ALTER TABLE public.agent_pending_actions ADD COLUMN IF NOT EXISTS executed_at timestamptz;
ALTER TABLE public.agent_pending_actions ADD COLUMN IF NOT EXISTS execution_result jsonb;
