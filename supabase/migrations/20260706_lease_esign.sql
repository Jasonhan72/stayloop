-- 2026-07-06 — Online lease signing on the Ontario Standard Form of Lease
-- (applied to prod same day).
--
-- Two form systems are planned: Ontario's standard lease (form 2229E
-- structure) now, RECO/TRREB agreement forms later — form_type keys them.
-- The signed document is retained PERMANENTLY: `terms` jsonb is the source
-- of truth, rendered on demand by components/lease/OntarioLeaseDoc; the
-- tenant's sign_token link stays valid forever as a read-only view after
-- signing, and either party can print/download a PDF backup anytime.
ALTER TABLE public.lease_documents ADD COLUMN IF NOT EXISTS form_type text NOT NULL DEFAULT 'ontario_standard'
  CHECK (form_type IN ('ontario_standard','trreb'));
ALTER TABLE public.lease_documents ADD COLUMN IF NOT EXISTS terms jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.lease_documents ADD COLUMN IF NOT EXISTS landlord_signature jsonb;
ALTER TABLE public.lease_documents ADD COLUMN IF NOT EXISTS tenant_signature jsonb;
ALTER TABLE public.lease_documents ADD COLUMN IF NOT EXISTS sign_token text;
ALTER TABLE public.lease_documents ADD COLUMN IF NOT EXISTS sent_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS lease_documents_sign_token_key
  ON public.lease_documents (sign_token) WHERE sign_token IS NOT NULL;
