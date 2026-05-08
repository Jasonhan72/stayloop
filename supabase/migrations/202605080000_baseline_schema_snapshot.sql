-- ============================================================================
-- BASELINE SCHEMA SNAPSHOT — 2026-05-08
-- ============================================================================
-- Purpose: bring critical tables into version control that pre-date our
-- migration discipline. These were created via Supabase Dashboard during
-- early development; the architecture review (2026-05-08) flagged them as
-- "code-referenced but not migration-tracked" — a fresh-env reproducibility
-- risk.
--
-- This file uses CREATE TABLE IF NOT EXISTS + idempotent constraint adds so
-- it's a no-op on production (where tables already exist) but reproduces
-- the schema on a fresh Supabase project.
--
-- Source of truth: pulled from production via information_schema on
-- 2026-05-08 (Supabase project upbkcbicjjpznojkpqtg).
--
-- Tables included (the 8 critical ones from the review):
--   landlords, listings, screenings, applications,
--   conversations, messages, pending_actions, tool_executions
--
-- Tables NOT in this baseline (already migration-tracked or future-stub):
--   ca_corp_registry, employer_lookup_cache (have their own migrations)
--   agent_configs, agent_sessions, user_memories, task_memories,
--   agent_collaborations, approval_events, audit_events
--     (covered by 202605050001_v5_agent_foundation.sql)
--   anon_screening_log, tenancies, field_agents, showings, disputes,
--   dispute_messages, service_providers, service_bookings, lease_clauses,
--   partner_orgs, webhook_endpoints, webhook_events, screening_cases,
--   consent_records, lease_agreements, lease_signatures, user_facts
--     (future-feature stubs, schemas may evolve before first ship)
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── landlords ──────────────────────────────────────────────────────────────
-- Stayloop user profile. Despite the name, this row exists for ALL roles
-- (landlord / tenant / agent) — the `role` column distinguishes. `auth_id`
-- is the FK to auth.users. RLS scopes by auth.uid() = auth_id.
CREATE TABLE IF NOT EXISTS public.landlords (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  auth_id uuid,
  full_name text,
  email text NOT NULL,
  phone text,
  plan text DEFAULT 'free'::text,
  created_at timestamptz DEFAULT now(),
  stripe_customer_id text,
  stripe_subscription_id text,
  plan_status text,
  plan_current_period_end timestamptz,
  role text DEFAULT 'landlord'::text,
  company_name text,
  avatar_url text,
  CONSTRAINT landlords_pkey PRIMARY KEY (id),
  CONSTRAINT landlords_auth_id_key UNIQUE (auth_id),
  CONSTRAINT landlords_email_key UNIQUE (email),
  CONSTRAINT landlords_auth_id_fkey FOREIGN KEY (auth_id) REFERENCES auth.users(id) ON DELETE CASCADE
);
ALTER TABLE public.landlords ENABLE ROW LEVEL SECURITY;

-- ─── listings ───────────────────────────────────────────────────────────────
-- A rental property a landlord has on Stayloop. Public visibility gated by
-- is_active=true via RLS (set in migration 202605060001).
CREATE TABLE IF NOT EXISTS public.listings (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  landlord_id uuid,
  address text NOT NULL,
  unit text,
  city text DEFAULT 'Toronto'::text,
  province text DEFAULT 'ON'::text,
  monthly_rent integer NOT NULL,
  bedrooms integer,
  bathrooms numeric,
  available_date date,
  slug text NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  title text,
  description text,
  postal_code text,
  status text DEFAULT 'draft'::text,
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
  CONSTRAINT listings_pkey PRIMARY KEY (id),
  CONSTRAINT listings_slug_key UNIQUE (slug),
  CONSTRAINT listings_landlord_id_fkey FOREIGN KEY (landlord_id) REFERENCES public.landlords(id) ON DELETE CASCADE
);
ALTER TABLE public.listings ENABLE ROW LEVEL SECURITY;

-- ─── screenings ─────────────────────────────────────────────────────────────
-- One row per AI screening run. Holds 5-dimension v3 score breakdown,
-- forensics_detail JSONB, court records, deep-check result. The hot path
-- of /api/screen-score writes here.
CREATE TABLE IF NOT EXISTS public.screenings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  landlord_id uuid NOT NULL,
  tenant_name text,
  monthly_rent numeric,
  monthly_income numeric,
  notes text,
  pasted_text text,
  files jsonb DEFAULT '[]'::jsonb,
  -- Legacy 6-dim scores (pre-v3, kept for backward compat)
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
  status text DEFAULT 'pending'::text,
  error text,
  created_at timestamptz DEFAULT now(),
  scored_at timestamptz,
  court_records_detail jsonb,
  tier text DEFAULT 'free'::text,
  model_version text,
  -- v3 5-dim scores (current)
  ability_to_pay_score integer,
  credit_health_score integer,
  rental_history_score integer,
  verification_score integer,
  communication_score integer,
  evidence_coverage numeric,
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
  -- Pro-only deep employer verification
  deep_check_result jsonb,
  deep_check_status text,
  deep_check_at timestamptz,
  CONSTRAINT screenings_pkey PRIMARY KEY (id),
  CONSTRAINT screenings_landlord_id_fkey FOREIGN KEY (landlord_id) REFERENCES public.landlords(id) ON DELETE CASCADE
);
ALTER TABLE public.screenings ENABLE ROW LEVEL SECURITY;

-- ─── applications ───────────────────────────────────────────────────────────
-- Tenant-side public rental applications submitted via /apply/[slug].
-- Anon can INSERT (with consent flags); landlord owning the listing can SELECT.
CREATE TABLE IF NOT EXISTS public.applications (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  listing_id uuid,
  -- Applicant identity
  first_name text NOT NULL,
  last_name text NOT NULL,
  email text NOT NULL,
  phone text,
  date_of_birth date,
  current_address text,
  -- Employment
  employment_status text,
  employer_name text,
  job_title text,
  monthly_income integer,
  employment_start_date date,
  employer_phone text,
  employer_email text,
  -- Rental history
  prev_landlord_name text,
  prev_landlord_phone text,
  prev_address text,
  prev_rent integer,
  prev_move_in date,
  prev_move_out date,
  reason_for_leaving text,
  -- Household
  num_occupants integer DEFAULT 1,
  has_pets boolean DEFAULT false,
  pet_details text,
  is_smoker boolean DEFAULT false,
  move_in_date date,
  additional_notes text,
  -- Consent
  consent_screening boolean DEFAULT false,
  consent_credit_check boolean DEFAULT false,
  -- AI scoring
  ai_score integer,
  ai_summary text,
  ai_extracted_name text,
  ai_dimension_notes jsonb,
  ai_income_score integer,
  ai_employment_score integer,
  ai_rental_history_score integer,
  ai_ltb_score integer,
  ai_reference_score integer,
  doc_authenticity_score integer,
  payment_ability_score integer,
  court_records_score integer,
  stability_score integer,
  behavior_signals_score integer,
  info_consistency_score integer,
  -- Court / LTB
  ltb_records_found integer DEFAULT 0,
  ltb_records_json jsonb,
  court_search_status text,
  court_search_results jsonb,
  -- Lifecycle
  status text DEFAULT 'new'::text,
  created_at timestamptz DEFAULT now(),
  files jsonb DEFAULT '[]'::jsonb,
  notified_at timestamptz,
  CONSTRAINT applications_pkey PRIMARY KEY (id),
  CONSTRAINT applications_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON DELETE CASCADE
);
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;

-- ─── conversations ──────────────────────────────────────────────────────────
-- AI-Native chat session. One row per (user, agent_kind, screening) tuple.
-- Holds long-running context for /api/agent/chat.
CREATE TABLE IF NOT EXISTS public.conversations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  user_kind text NOT NULL DEFAULT 'landlord'::text,
  agent_kind text NOT NULL,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  last_message_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT conversations_pkey PRIMARY KEY (id),
  CONSTRAINT conversations_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

-- ─── messages ───────────────────────────────────────────────────────────────
-- Each chat turn. content is jsonb of structured blocks
-- (text, screening_card, action_proposal, tool_use, tool_result, etc.).
CREATE TABLE IF NOT EXISTS public.messages (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL,
  role text NOT NULL,
  content jsonb NOT NULL,
  tool_calls jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT messages_pkey PRIMARY KEY (id),
  CONSTRAINT messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS messages_conversation_id_created_at_idx
  ON public.messages (conversation_id, created_at);
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- ─── pending_actions ────────────────────────────────────────────────────────
-- AI-proposed mutations (send email, reject applicant, save listing) awaiting
-- explicit user approval. /api/agent/action transitions status to
-- approved/modified/rejected and executes the side effect.
CREATE TABLE IF NOT EXISTS public.pending_actions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL,
  action_kind text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending'::text,
  proposed_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  decided_by uuid,
  final_payload jsonb,
  CONSTRAINT pending_actions_pkey PRIMARY KEY (id),
  CONSTRAINT pending_actions_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE,
  CONSTRAINT pending_actions_decided_by_fkey FOREIGN KEY (decided_by) REFERENCES auth.users(id) ON DELETE SET NULL
);
ALTER TABLE public.pending_actions ENABLE ROW LEVEL SECURITY;

-- ─── tool_executions ────────────────────────────────────────────────────────
-- AUDIT TRAIL — every L1 tool invocation. Required for PIPEDA + Ontario
-- Human Rights compliance and AI-decision traceability. Insert-only via
-- service-role; users can SELECT their own rows for transparency.
CREATE TABLE IF NOT EXISTS public.tool_executions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  conversation_id uuid,
  message_id uuid,
  tool_name text NOT NULL,
  tool_version text,
  input jsonb,
  output jsonb,
  status text NOT NULL,
  error_message text,
  duration_ms integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tool_executions_pkey PRIMARY KEY (id),
  CONSTRAINT tool_executions_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE SET NULL,
  CONSTRAINT tool_executions_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.messages(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS tool_executions_conversation_id_idx ON public.tool_executions (conversation_id);
CREATE INDEX IF NOT EXISTS tool_executions_tool_name_created_at_idx ON public.tool_executions (tool_name, created_at DESC);
ALTER TABLE public.tool_executions ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- RLS POLICIES — minimum viable owner-scoped policies
-- ============================================================================
-- These mirror what's in production. Production may have additional
-- service-role policies that bypass these — those are not reproduced here
-- because they're configured per-environment via the Supabase dashboard.
--
-- Pattern: each user can read/write rows they own. "Own" means:
--   landlords: auth_id = auth.uid()
--   listings: landlord_id IN (SELECT id FROM landlords WHERE auth_id = auth.uid())
--   screenings: same as listings
--   applications: applicant has no auth, so anon insert + landlord-scoped read
--   conversations / messages / pending_actions / tool_executions: user_id = auth.uid()
-- ============================================================================

DO $$ BEGIN
  -- landlords: owner-scoped read/update; insert via claim_landlord RPC
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'landlords_owner_select') THEN
    CREATE POLICY landlords_owner_select ON public.landlords FOR SELECT USING (auth.uid() = auth_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'landlords_owner_update') THEN
    CREATE POLICY landlords_owner_update ON public.landlords FOR UPDATE USING (auth.uid() = auth_id);
  END IF;

  -- listings: public can SELECT active rows; landlord can do anything to own
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'listings_public_select_active') THEN
    CREATE POLICY listings_public_select_active ON public.listings FOR SELECT USING (is_active = true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'listings_owner_all') THEN
    CREATE POLICY listings_owner_all ON public.listings FOR ALL
      USING (landlord_id IN (SELECT id FROM public.landlords WHERE auth_id = auth.uid()))
      WITH CHECK (landlord_id IN (SELECT id FROM public.landlords WHERE auth_id = auth.uid()));
  END IF;

  -- screenings: only the landlord who created it
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'screenings_owner_all') THEN
    CREATE POLICY screenings_owner_all ON public.screenings FOR ALL
      USING (landlord_id IN (SELECT id FROM public.landlords WHERE auth_id = auth.uid()))
      WITH CHECK (landlord_id IN (SELECT id FROM public.landlords WHERE auth_id = auth.uid()));
  END IF;

  -- applications: anon can INSERT; landlord owning the listing can SELECT
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'applications_anon_insert') THEN
    CREATE POLICY applications_anon_insert ON public.applications FOR INSERT WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'applications_landlord_select') THEN
    CREATE POLICY applications_landlord_select ON public.applications FOR SELECT
      USING (listing_id IN (SELECT id FROM public.listings WHERE landlord_id IN (SELECT id FROM public.landlords WHERE auth_id = auth.uid())));
  END IF;

  -- conversations + messages + pending_actions + tool_executions: owner-scoped
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'conversations_owner_all') THEN
    CREATE POLICY conversations_owner_all ON public.conversations FOR ALL
      USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'messages_owner_all') THEN
    CREATE POLICY messages_owner_all ON public.messages FOR ALL
      USING (conversation_id IN (SELECT id FROM public.conversations WHERE user_id = auth.uid()))
      WITH CHECK (conversation_id IN (SELECT id FROM public.conversations WHERE user_id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'pending_actions_owner_all') THEN
    CREATE POLICY pending_actions_owner_all ON public.pending_actions FOR ALL
      USING (conversation_id IN (SELECT id FROM public.conversations WHERE user_id = auth.uid()))
      WITH CHECK (conversation_id IN (SELECT id FROM public.conversations WHERE user_id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'tool_executions_owner_select') THEN
    CREATE POLICY tool_executions_owner_select ON public.tool_executions FOR SELECT
      USING (conversation_id IN (SELECT id FROM public.conversations WHERE user_id = auth.uid()));
  END IF;
END $$;

-- ============================================================================
-- End of baseline. Future schema changes should be additive migrations
-- (ALTER TABLE ... ADD COLUMN IF NOT EXISTS, etc.) on top of this baseline,
-- never edits to this file.
-- ============================================================================
