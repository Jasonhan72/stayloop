-- ----------------------------------------------------------------------------
-- Stayloop — Listings table column hardening (V4)
-- ----------------------------------------------------------------------------
-- File: supabase/migrations/202605060001_listings_columns.sql
--
-- Reconciles the schema.sql shape with what the app code (and the
-- save_listing tool, /dashboard/portfolio publish flow, /listings/[slug]
-- public page) has been writing/reading. All columns are added with
-- IF NOT EXISTS so re-running this migration on a partially-migrated db
-- is safe.
--
-- Production may already have some of these columns from prior ad-hoc
-- migrations — in that case those statements are no-ops.
-- ----------------------------------------------------------------------------

ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS title         TEXT,
  ADD COLUMN IF NOT EXISTS description   TEXT,
  ADD COLUMN IF NOT EXISTS postal_code   TEXT,
  ADD COLUMN IF NOT EXISTS status        TEXT DEFAULT 'draft' CHECK (status IN ('draft','active','closed','archived'));

-- Backfill status to match the existing is_active boolean for any rows
-- inserted before this migration. We treat the boolean as the source of
-- truth and project it into status.
UPDATE listings
   SET status = CASE WHEN is_active THEN 'active' ELSE 'draft' END
 WHERE status IS NULL;

-- Index slug + status for the public listing page lookup. Slug is already
-- UNIQUE (per the original schema), but adding a status filter on top of
-- it keeps the public page query fast even as the row count grows.
CREATE INDEX IF NOT EXISTS listings_slug_status_idx ON listings (slug, status);

-- Allow public anon reads of ACTIVE listings only — the /listings/[slug]
-- page uses the public anon Supabase client. RLS was already enabled on
-- this table by the original schema; this policy adds the read window.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'listings'
      AND policyname = 'listings_public_select_active'
  ) THEN
    CREATE POLICY listings_public_select_active
      ON listings
      FOR SELECT
      USING (is_active = true);
  END IF;
END $$;

-- End of migration.
