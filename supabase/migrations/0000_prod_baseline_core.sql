-- =============================================================================
-- 0000 — PROD BASELINE (core revenue + screening layer)
--
-- Snapshot of the production schema (project upbkcbicjjpznojkpqtg) taken
-- 2026-07-05. These objects predate the repo's migration discipline and
-- existed ONLY in prod — meaning a fresh environment built from
-- supabase/migrations/ could neither log a landlord in (claim_landlord),
-- list a property, nor run a screening, and the RLS the Dual-ID invariant
-- depends on was unreviewable from the repo.
--
-- Written to be safe in BOTH directions:
--   • fresh environment → creates everything
--   • prod → no-op (IF NOT EXISTS everywhere; policies guarded via DO blocks)
--
-- NOT included here: ca_corp_registry (large data table backing
-- search_corp_registry / lookup_corp_by_bn — schema documented by those
-- function signatures; seed separately), storage buckets (tenant-files).
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ── landlords ────────────────────────────────────────────────────────────────
-- Dual-ID invariant: id (profileId) ≠ auth.users.id (authId). Legacy rows may
-- have auth_id NULL until claim_landlord() links them on first login.
CREATE TABLE IF NOT EXISTS public.landlords (
  id uuid NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
  auth_id uuid,
  full_name text,
  email text NOT NULL,
  phone text,
  plan text DEFAULT 'free',
  created_at timestamptz DEFAULT now(),
  stripe_customer_id text,
  stripe_subscription_id text,
  plan_status text,
  plan_current_period_end timestamptz,
  role text DEFAULT 'landlord',
  company_name text,
  avatar_url text
);
CREATE UNIQUE INDEX IF NOT EXISTS landlords_auth_id_key ON public.landlords (auth_id);
CREATE UNIQUE INDEX IF NOT EXISTS landlords_email_key ON public.landlords (email);
CREATE UNIQUE INDEX IF NOT EXISTS landlords_stripe_customer_id_key ON public.landlords (stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS landlords_stripe_subscription_id_idx ON public.landlords (stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL;

-- ── listings ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.listings (
  id uuid NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
  landlord_id uuid,
  address text NOT NULL,
  unit text,
  city text DEFAULT 'Toronto',
  province text DEFAULT 'ON',
  monthly_rent integer NOT NULL,
  bedrooms integer,
  bathrooms numeric(2,1),
  available_date date,
  slug text NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  title text,
  description text,
  postal_code text,
  status text DEFAULT 'draft',
  images jsonb DEFAULT '[]'::jsonb,
  amenities jsonb DEFAULT '[]'::jsonb,
  utilities_included jsonb DEFAULT '[]'::jsonb,
  sqft integer,
  parking text,
  pet_policy text,
  broker_name text,
  broker_phone text,
  brokerage text,
  year_built integer,
  mls_number text,
  source_url text,
  price_history jsonb DEFAULT '[]'::jsonb,
  published_at timestamptz,
  neighborhood text,
  has_den boolean DEFAULT false,
  trust_tier smallint DEFAULT 2,
  pin_x numeric(5,2),
  pin_y numeric(5,2),
  thumb_a text,
  thumb_b text,
  luna_note text,
  badge text,
  photo_count integer DEFAULT 12,
  match_score smallint,
  lat numeric(9,6),
  lng numeric(9,6)
);
CREATE UNIQUE INDEX IF NOT EXISTS listings_slug_key ON public.listings (slug);
CREATE INDEX IF NOT EXISTS listings_landlord_id_idx ON public.listings (landlord_id, created_at DESC);
CREATE INDEX IF NOT EXISTS listings_slug_status_idx ON public.listings (slug, status);

-- ── applications (applications → listings → landlords FK chain is intact) ──
CREATE TABLE IF NOT EXISTS public.applications (
  id uuid NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
  listing_id uuid REFERENCES public.listings(id),
  first_name text NOT NULL,
  last_name text NOT NULL,
  email text NOT NULL,
  phone text,
  date_of_birth date,
  current_address text,
  employment_status text,
  employer_name text,
  job_title text,
  monthly_income integer,
  employment_start_date date,
  employer_phone text,
  employer_email text,
  prev_landlord_name text,
  prev_landlord_phone text,
  prev_address text,
  prev_rent integer,
  prev_move_in date,
  prev_move_out date,
  reason_for_leaving text,
  num_occupants integer DEFAULT 1,
  has_pets boolean DEFAULT false,
  pet_details text,
  is_smoker boolean DEFAULT false,
  move_in_date date,
  additional_notes text,
  consent_screening boolean DEFAULT false,
  consent_credit_check boolean DEFAULT false,
  ai_score integer,
  ai_summary text,
  ai_income_score integer,
  ai_employment_score integer,
  ai_rental_history_score integer,
  ai_ltb_score integer,
  ai_reference_score integer,
  ltb_records_found integer DEFAULT 0,
  ltb_records_json jsonb,
  status text DEFAULT 'new',
  created_at timestamptz DEFAULT now(),
  files jsonb DEFAULT '[]'::jsonb,
  ai_extracted_name text,
  ai_dimension_notes jsonb,
  doc_authenticity_score integer,
  payment_ability_score integer,
  court_records_score integer,
  stability_score integer,
  behavior_signals_score integer,
  info_consistency_score integer,
  court_search_status text,
  court_search_results jsonb,
  notified_at timestamptz
);
CREATE INDEX IF NOT EXISTS applications_listing_created_idx ON public.applications (listing_id, created_at DESC);

-- ── screenings ──────────────────────────────────────────────────────────────
-- NOTE: landlord_id stores authId on new rows, profileId on legacy rows; the
-- screenings → landlords FK was deliberately DROPPED (PostgREST embeds fail).
CREATE TABLE IF NOT EXISTS public.screenings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  landlord_id uuid NOT NULL,
  tenant_name text,
  monthly_rent numeric,
  monthly_income numeric,
  notes text,
  pasted_text text,
  files jsonb DEFAULT '[]'::jsonb,
  ai_score integer,
  ai_summary text,
  ai_extracted_name text,
  ai_dimension_notes jsonb,
  doc_authenticity_score integer,
  payment_ability_score integer,
  court_records_score integer,
  stability_score integer,
  behavior_signals_score integer,
  info_consistency_score integer,
  status text DEFAULT 'pending',
  error text,
  created_at timestamptz DEFAULT now(),
  scored_at timestamptz,
  court_records_detail jsonb,
  tier text DEFAULT 'free',
  model_version text,
  ability_to_pay_score integer,
  credit_health_score integer,
  rental_history_score integer,
  verification_score integer,
  communication_score integer,
  evidence_coverage numeric(3,2),
  v3_tier text,
  tier_reason text,
  hard_gates_triggered text[],
  red_flags text[],
  red_flag_penalty integer,
  action_items jsonb,
  compliance_audit jsonb,
  sub_coverage jsonb,
  bank_min_balance numeric,
  identity_match_score integer,
  forensics_detail jsonb,
  forensics_penalty integer,
  deep_check_result jsonb,
  deep_check_status text,
  deep_check_at timestamptz,
  updated_at timestamptz DEFAULT now(),
  scores_v3 jsonb,
  income_rent_ratio numeric,
  gate_cap integer,
  ai_summary_zh text,
  ai_summary_en text,
  court_summary_zh text,
  court_summary_en text,
  progress jsonb
);
CREATE INDEX IF NOT EXISTS idx_screenings_landlord ON public.screenings (landlord_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_screenings_status ON public.screenings (status);
CREATE INDEX IF NOT EXISTS idx_screenings_deep_check_status ON public.screenings (deep_check_status) WHERE deep_check_status IS NOT NULL;

-- ── employer_lookup_cache (deep-check corporate registry cache) ─────────────
CREATE TABLE IF NOT EXISTS public.employer_lookup_cache (
  normalized_name text NOT NULL PRIMARY KEY,
  display_name text,
  result jsonb,
  fetched_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS employer_lookup_cache_fetched_at_idx ON public.employer_lookup_cache (fetched_at DESC);

-- ── audit_events (Trust API + legacy audit sink) ────────────────────────────
CREATE TABLE IF NOT EXISTS public.audit_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  actor_id uuid,
  actor_email text,
  actor_role text,
  action text NOT NULL,
  resource_type text NOT NULL,
  resource_id uuid,
  metadata jsonb DEFAULT '{}'::jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_action ON public.audit_events (action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON public.audit_events (actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_resource ON public.audit_events (resource_type, resource_id);

-- ── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.landlords ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.screenings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;

-- Policies guarded so this file is idempotent on prod (CREATE POLICY has no
-- IF NOT EXISTS). Prod policy names/expressions verified 2026-07-05.
DO $$
BEGIN
  -- landlords (post-2026-07-04 shape: no public read)
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid='public.landlords'::regclass AND polname='Landlords see own profile') THEN
    CREATE POLICY "Landlords see own profile" ON public.landlords FOR ALL USING (auth.uid() = auth_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid='public.landlords'::regclass AND polname='Landlords read own row') THEN
    CREATE POLICY "Landlords read own row" ON public.landlords FOR SELECT TO authenticated USING (auth.uid() = auth_id OR auth.uid() = id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid='public.landlords'::regclass AND polname='Users can claim landlord by email') THEN
    CREATE POLICY "Users can claim landlord by email" ON public.landlords FOR UPDATE TO authenticated
      USING (auth_id IS NULL AND email = (auth.jwt() ->> 'email'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid='public.landlords'::regclass AND polname='Users can create own landlord row') THEN
    CREATE POLICY "Users can create own landlord row" ON public.landlords FOR INSERT WITH CHECK (auth.uid() = auth_id);
  END IF;

  -- listings
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid='public.listings'::regclass AND polname='Public can read active listings') THEN
    CREATE POLICY "Public can read active listings" ON public.listings FOR SELECT USING (is_active = true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid='public.listings'::regclass AND polname='Landlords see own listings') THEN
    CREATE POLICY "Landlords see own listings" ON public.listings FOR ALL
      USING (landlord_id IN (SELECT id FROM public.landlords WHERE auth_id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid='public.listings'::regclass AND polname='Landlords can insert own listings') THEN
    CREATE POLICY "Landlords can insert own listings" ON public.listings FOR INSERT
      WITH CHECK (landlord_id IN (SELECT id FROM public.landlords WHERE auth_id = auth.uid()));
  END IF;

  -- applications
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid='public.applications'::regclass AND polname='Landlords see own applications') THEN
    CREATE POLICY "Landlords see own applications" ON public.applications FOR ALL
      USING (listing_id IN (SELECT l.id FROM public.listings l JOIN public.landlords la ON l.landlord_id = la.id WHERE la.auth_id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid='public.applications'::regclass AND polname='Public can insert applications (constrained)') THEN
    CREATE POLICY "Public can insert applications (constrained)" ON public.applications FOR INSERT
      WITH CHECK (
        EXISTS (SELECT 1 FROM public.listings l WHERE l.id = applications.listing_id AND COALESCE(l.is_active, true) = true)
        AND email IS NOT NULL AND email <> '' AND phone IS NOT NULL AND phone <> ''
        AND ai_score IS NULL AND ai_summary IS NULL AND ai_income_score IS NULL
        AND ai_employment_score IS NULL AND ai_rental_history_score IS NULL
        AND ai_ltb_score IS NULL AND ai_reference_score IS NULL
        AND status IS DISTINCT FROM 'scored'
        AND (SELECT count(*) FROM public.applications a WHERE a.listing_id = applications.listing_id AND a.created_at >= now() - interval '24 hours') < 30
        AND consent_screening = true
      );
  END IF;

  -- screenings — BOTH policy generations coexist on purpose: authId-keyed
  -- rows match auth.uid() = landlord_id; profileId-keyed legacy rows match
  -- via the landlords lookup. Together they implement the Dual-ID invariant.
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid='public.screenings'::regclass AND polname='Landlords can view own screenings') THEN
    CREATE POLICY "Landlords can view own screenings" ON public.screenings FOR SELECT USING (auth.uid() = landlord_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid='public.screenings'::regclass AND polname='Landlords can insert own screenings') THEN
    CREATE POLICY "Landlords can insert own screenings" ON public.screenings FOR INSERT WITH CHECK (auth.uid() = landlord_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid='public.screenings'::regclass AND polname='Landlords can update own screenings') THEN
    CREATE POLICY "Landlords can update own screenings" ON public.screenings FOR UPDATE USING (auth.uid() = landlord_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid='public.screenings'::regclass AND polname='screenings_owner_select') THEN
    CREATE POLICY screenings_owner_select ON public.screenings FOR SELECT
      USING (landlord_id IN (SELECT id FROM public.landlords WHERE auth_id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid='public.screenings'::regclass AND polname='screenings_owner_insert') THEN
    CREATE POLICY screenings_owner_insert ON public.screenings FOR INSERT
      WITH CHECK (landlord_id IN (SELECT id FROM public.landlords WHERE auth_id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid='public.screenings'::regclass AND polname='screenings_owner_update') THEN
    CREATE POLICY screenings_owner_update ON public.screenings FOR UPDATE
      USING (landlord_id IN (SELECT id FROM public.landlords WHERE auth_id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid='public.screenings'::regclass AND polname='screenings_owner_delete') THEN
    CREATE POLICY screenings_owner_delete ON public.screenings FOR DELETE
      USING (landlord_id IN (SELECT id FROM public.landlords WHERE auth_id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid='public.screenings'::regclass AND polname='Service role full access') THEN
    CREATE POLICY "Service role full access" ON public.screenings FOR ALL USING (auth.role() = 'service_role');
  END IF;

  -- audit_events
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid='public.audit_events'::regclass AND polname='audit_actor_read') THEN
    CREATE POLICY audit_actor_read ON public.audit_events FOR SELECT
      USING (actor_id IN (SELECT id FROM public.landlords WHERE auth_id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid='public.audit_events'::regclass AND polname='audit_events_self_insert') THEN
    CREATE POLICY audit_events_self_insert ON public.audit_events FOR INSERT
      WITH CHECK (actor_id IS NULL OR actor_id IN (SELECT id FROM public.landlords WHERE auth_id = auth.uid()));
  END IF;
END $$;

-- ── claim_landlord — the entire landlord auth path ──────────────────────────
CREATE OR REPLACE FUNCTION public.claim_landlord()
 RETURNS landlords
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_user_id uuid;
  v_email text;
  v_row public.landlords;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = v_user_id;
  IF v_email IS NULL OR v_email = '' THEN
    v_email := 'guest_' || v_user_id::text || '@stayloop.local';
  END IF;

  -- Already linked — return existing (preserves any admin-assigned role)
  SELECT * INTO v_row FROM public.landlords WHERE auth_id = v_user_id LIMIT 1;
  IF FOUND THEN
    RETURN v_row;
  END IF;

  -- Claim by matching email — DO NOT touch role on claim (preserves
  -- admin-assigned roles on pre-seeded rows)
  UPDATE public.landlords
     SET auth_id = v_user_id
   WHERE email = v_email AND auth_id IS NULL
   RETURNING * INTO v_row;
  IF FOUND THEN
    RETURN v_row;
  END IF;

  -- Otherwise create a fresh row with the safe default role.
  INSERT INTO public.landlords (auth_id, email, plan, role)
  VALUES (v_user_id, v_email, 'free', 'landlord')
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$function$;
