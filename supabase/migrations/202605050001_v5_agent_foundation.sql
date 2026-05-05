-- ----------------------------------------------------------------------------
-- Stayloop V5 — Agent Foundation Migration (DRAFT)
-- ----------------------------------------------------------------------------
-- File: supabase/migrations/202605050001_v5_agent_foundation.sql
--
-- Purpose
--   Lay down the additive table set the V5 personal-agent runtime needs.
--   Nothing in this file alters or drops V4 tables (landlords, listings,
--   applications, screenings, listings, ...). It is safe to apply on a
--   live V4 production database.
--
-- Scope (v1, foundation only — keep additive, do not over-engineer):
--   1. agent_configs           — per-user agent persona / role / system prompt
--   2. agent_sessions          — one row per ongoing agent workspace session
--   3. user_memories           — long-lived private memory (preferences, etc)
--   4. task_memories           — short-lived per-workflow scratch state
--   5. agent_collaborations    — when two agents (tenant ↔ landlord) cooperate
--   6. approval_events         — every approve/reject decision the user made
--   7. audit_events            — append-only log for trust + compliance review
--
-- Conventions
--   - All ids are uuid + uuid_generate_v4().
--   - All tables include created_at / updated_at where mutability matters.
--   - All tables that hold per-user data carry a user_id (auth.users.id) and
--     have RLS enabled with a "owner can read/write own rows" policy.
--   - Append-only tables (approval_events, audit_events) deliberately
--     omit UPDATE/DELETE policies so users can read history but not rewrite it.
--   - jsonb is used for flexible payloads (memory value, preview snapshots);
--     when a shape stabilizes we'll either lift it into columns or constrain
--     it with a CHECK constraint.
--
-- Future work intentionally NOT in this draft:
--   - Vector / embedding indexes for semantic memory recall
--   - Cross-user policies for collaboration handshakes
--   - Webhook / orchestrator triggers
--   - Retention / TTL jobs
-- ----------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── 1. agent_configs ───────────────────────────────────────────────────────
-- Per-user persona binding. One row per (user_id, role) tuple — a user can
-- be both tenant and landlord and have a config under each role.
CREATE TABLE IF NOT EXISTS agent_configs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role            TEXT NOT NULL CHECK (role IN ('tenant', 'landlord', 'agent_of_agents')),
  agent_name      TEXT NOT NULL,           -- e.g. 'Luna', 'Atlas'
  system_prompt   TEXT,                    -- nullable until LLM wiring lands
  preferences     JSONB DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, role)
);

-- ─── 2. agent_sessions ──────────────────────────────────────────────────────
-- Tracks the current workspace state. One active session per (user_id, role).
-- Older sessions stay in the table as history; an `is_active` flag identifies
-- the live one.
CREATE TABLE IF NOT EXISTS agent_sessions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role            TEXT NOT NULL CHECK (role IN ('tenant', 'landlord', 'agent_of_agents')),
  agent_config_id UUID REFERENCES agent_configs(id) ON DELETE SET NULL,
  status          TEXT NOT NULL CHECK (status IN ('active','understanding','working','waiting_approval','blocked')) DEFAULT 'active',
  status_message  TEXT,
  current_stage   TEXT,                    -- e.g. 'application_preparation'
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  last_active_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS agent_sessions_user_role_active_idx
  ON agent_sessions (user_id, role, is_active);

-- ─── 3. user_memories ───────────────────────────────────────────────────────
-- Persistent private memory. The "label/value" pair is what the V1 UI shows;
-- richer structured payloads sit in `metadata`.
CREATE TABLE IF NOT EXISTS user_memories (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category        TEXT NOT NULL CHECK (category IN ('preferences','household','language','priorities','constraints','context')),
  label           TEXT NOT NULL,
  value           JSONB NOT NULL,          -- string OR string[] OR object
  user_confirmed  BOOLEAN NOT NULL DEFAULT FALSE,
  metadata        JSONB DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS user_memories_user_idx ON user_memories (user_id);
CREATE INDEX IF NOT EXISTS user_memories_user_category_idx ON user_memories (user_id, category);

-- ─── 4. task_memories ───────────────────────────────────────────────────────
-- Short-lived scratch state scoped to a particular workflow run. Cleaned up
-- when the related task completes. Carries an optional session_id back-link.
CREATE TABLE IF NOT EXISTS task_memories (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id      UUID REFERENCES agent_sessions(id) ON DELETE CASCADE,
  task_key        TEXT NOT NULL,           -- e.g. 'application:listing-3305'
  payload         JSONB NOT NULL DEFAULT '{}'::jsonb,
  status          TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','done','abandoned')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, task_key)
);

-- ─── 5. agent_collaborations ────────────────────────────────────────────────
-- A collaboration row appears when two agents need to talk on behalf of
-- their users — e.g. tenant Luna ↔ landlord Atlas while negotiating viewing
-- times. Both user_ids are recorded so RLS can permit either side to read.
CREATE TABLE IF NOT EXISTS agent_collaborations (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  initiator_user_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  counterpart_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  topic               TEXT NOT NULL,         -- 'application_review','viewing_request', ...
  context             JSONB DEFAULT '{}'::jsonb,
  status              TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved','cancelled')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS agent_collaborations_participants_idx
  ON agent_collaborations (initiator_user_id, counterpart_user_id);

-- ─── 6. approval_events ─────────────────────────────────────────────────────
-- Append-only history of every approve/reject decision on a pending action.
CREATE TABLE IF NOT EXISTS approval_events (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action_id       TEXT NOT NULL,            -- mock-friendly until pending_actions table exists
  decision        TEXT NOT NULL CHECK (decision IN ('approve','reject')),
  sensitivity     TEXT CHECK (sensitivity IN ('low','medium','high')),
  reason          TEXT,                     -- optional user-supplied note
  metadata        JSONB DEFAULT '{}'::jsonb,
  recorded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS approval_events_user_recorded_idx
  ON approval_events (user_id, recorded_at DESC);

-- ─── 7. audit_events ────────────────────────────────────────────────────────
-- Broader trust log. Every meaningful state change the agent runtime makes
-- (memory write, session status change, collaboration handshake, etc).
CREATE TABLE IF NOT EXISTS audit_events (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  actor_user_id   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  subject_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type      TEXT NOT NULL,            -- e.g. 'agent.status_change','memory.write','approval.recorded'
  event_data      JSONB DEFAULT '{}'::jsonb,
  recorded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS audit_events_subject_recorded_idx
  ON audit_events (subject_user_id, recorded_at DESC);

-- ────────────────────────────────────────────────────────────────────────────
-- Row Level Security
-- ────────────────────────────────────────────────────────────────────────────
-- Pattern: every table is RLS-enabled and exposes a "user owns row" policy.
-- Append-only tables (approval_events, audit_events) get SELECT + INSERT only;
-- they do NOT permit UPDATE or DELETE so the trust log can't be rewritten.

ALTER TABLE agent_configs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_sessions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_memories        ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_memories        ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_collaborations ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_events      ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events         ENABLE ROW LEVEL SECURITY;

-- agent_configs: full CRUD by owner
CREATE POLICY agent_configs_owner_all
  ON agent_configs
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- agent_sessions: full CRUD by owner
CREATE POLICY agent_sessions_owner_all
  ON agent_sessions
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- user_memories: full CRUD by owner
CREATE POLICY user_memories_owner_all
  ON user_memories
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- task_memories: full CRUD by owner
CREATE POLICY task_memories_owner_all
  ON task_memories
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- agent_collaborations: either participant may read; only the initiator
-- may insert / update from the client. Cross-user collaboration writes will
-- happen via service-role on the server later.
CREATE POLICY agent_collaborations_participant_select
  ON agent_collaborations
  FOR SELECT
  USING (initiator_user_id = auth.uid() OR counterpart_user_id = auth.uid());

CREATE POLICY agent_collaborations_initiator_insert
  ON agent_collaborations
  FOR INSERT
  WITH CHECK (initiator_user_id = auth.uid());

CREATE POLICY agent_collaborations_initiator_update
  ON agent_collaborations
  FOR UPDATE
  USING (initiator_user_id = auth.uid())
  WITH CHECK (initiator_user_id = auth.uid());

-- approval_events: read + insert by owner (no update / delete — append-only)
CREATE POLICY approval_events_owner_select
  ON approval_events
  FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY approval_events_owner_insert
  ON approval_events
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- audit_events: subject can READ their own log. Inserts come from server-side
-- service-role contexts (orchestrator, API routes) — no client INSERT policy
-- on purpose, because audit rows must be authored by the system, not the user.
CREATE POLICY audit_events_subject_select
  ON audit_events
  FOR SELECT
  USING (subject_user_id = auth.uid());

-- ────────────────────────────────────────────────────────────────────────────
-- updated_at trigger helper (only for tables that should track mutation time)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION v5_set_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY[
      'agent_configs',
      'agent_sessions',
      'user_memories',
      'task_memories',
      'agent_collaborations'
    ])
  LOOP
    EXECUTE format($trg$
      DROP TRIGGER IF EXISTS %1$I_set_updated_at ON %1$I;
      CREATE TRIGGER %1$I_set_updated_at
        BEFORE UPDATE ON %1$I
        FOR EACH ROW EXECUTE FUNCTION v5_set_updated_at();
    $trg$, t);
  END LOOP;
END $$;

-- End of migration.
