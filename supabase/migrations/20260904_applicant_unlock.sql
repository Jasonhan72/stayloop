-- 2026-09-04 — per-applicant unlock (P0-1 of the competitor review).
--
-- Free landlords already get 5 screenings/month; what Pro gates is the deep
-- cross-check (and, as they launch, ID / bank / credit direct verification).
-- Competitors sell that per applicant ($17–$45) and let the tenant pay. This
-- adds the same door without touching the Pro subscription:
--   · screenings.unlocked_at   — this one screening has Pro-level checks
--   · landlords.unlock_credits — prepaid unlocks not yet attached to a screening
--   · stripe_events            — delivery ledger, because crediting is an
--                                INCREMENT and Stripe retries until 2xx
--                                (the webhook's own comment demanded this
--                                before any non-idempotent handler shipped)
ALTER TABLE public.screenings ADD COLUMN IF NOT EXISTS unlocked_at timestamptz;
ALTER TABLE public.screenings ADD COLUMN IF NOT EXISTS unlock_paid_by text; -- 'landlord' | 'tenant'
ALTER TABLE public.landlords  ADD COLUMN IF NOT EXISTS unlock_credits integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.stripe_events (
  id text PRIMARY KEY,
  type text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.stripe_events ENABLE ROW LEVEL SECURITY;
-- No policies: service role only.

-- Atomically spend one prepaid credit on a screening the caller owns.
-- Returns true when the screening is (now) unlocked, false when there was
-- nothing to spend. SECURITY DEFINER so the row update bypasses the
-- landlord's own RLS on screenings (which only allows reads on legacy rows).
CREATE OR REPLACE FUNCTION public.consume_unlock_credit(p_screening_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_landlord_id uuid;
  v_already timestamptz;
  v_rows integer;
BEGIN
  IF v_user IS NULL THEN RETURN false; END IF;

  SELECT s.landlord_id, s.unlocked_at INTO v_landlord_id, v_already
    FROM public.screenings s WHERE s.id = p_screening_id;
  IF v_landlord_id IS NULL THEN RETURN false; END IF;
  IF v_already IS NOT NULL THEN RETURN true; END IF;

  -- Ownership: screenings.landlord_id may hold authId or profileId.
  IF NOT EXISTS (
    SELECT 1 FROM public.landlords l
     WHERE (l.auth_id = v_user OR l.id = v_user)
       AND (l.id = v_landlord_id OR l.auth_id = v_landlord_id)
  ) AND v_landlord_id <> v_user THEN
    RETURN false;
  END IF;

  UPDATE public.landlords l
     SET unlock_credits = unlock_credits - 1
   WHERE (l.auth_id = v_user OR l.id = v_user)
     AND l.unlock_credits > 0;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN RETURN false; END IF;

  UPDATE public.screenings
     SET unlocked_at = now(), unlock_paid_by = 'landlord'
   WHERE id = p_screening_id;
  RETURN true;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.consume_unlock_credit(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consume_unlock_credit(uuid) TO authenticated, service_role;
