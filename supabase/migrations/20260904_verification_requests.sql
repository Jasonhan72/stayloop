-- 2026-09-04 — applicant-authorised verification (design/verification-flow-plan.md).
--
-- One row per invitation. The token is the credential for the public
-- /verify/<token> page (same posture as household invites / passport share).
-- Landlords read their own rows; every write happens server-side with the
-- service role, so the public page never touches this table directly.
CREATE TABLE IF NOT EXISTS public.verification_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL UNIQUE,
  screening_id uuid NOT NULL,
  landlord_id uuid NOT NULL,              -- auth.users.id of the inviting landlord
  landlord_name text,
  tenant_name text,
  tenant_email text,
  status text NOT NULL DEFAULT 'pending', -- pending | consented | complete | expired | declined
  consent jsonb,                          -- { version, accepted_at, typed_name, ua, ip_hash }
  steps jsonb NOT NULL DEFAULT '{}'::jsonb, -- { id|bank|credit: { status, provider, session_id, result, sandbox, updated_at } }
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS verification_requests_screening_idx ON public.verification_requests (screening_id);
CREATE INDEX IF NOT EXISTS verification_requests_landlord_idx ON public.verification_requests (landlord_id);

ALTER TABLE public.verification_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Landlords read own verification requests" ON public.verification_requests;
CREATE POLICY "Landlords read own verification requests" ON public.verification_requests
  FOR SELECT TO authenticated
  USING (landlord_id = auth.uid());

-- Snapshot of the completed verification, denormalised onto the screening so
-- scoring and the report read one column (and keep working if a request row
-- is later purged).
ALTER TABLE public.screenings ADD COLUMN IF NOT EXISTS verification jsonb;
