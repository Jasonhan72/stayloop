-- Site test 2026-10-28 (C-D1): listings.photo_count defaulted to 12 since the v5 schema and not every
-- write path kept it in step with `images`; a public card showed「1 / 12」for a two-photo listing.
-- The images array is the truth: default 0, backfill, and the APIs now derive the count from images.
-- Applied to prod via Supabase MCP (listings_photo_count_truth).
alter table public.listings alter column photo_count set default 0;
update public.listings set photo_count = coalesce(jsonb_array_length(images), 0)
 where photo_count is distinct from coalesce(jsonb_array_length(images), 0);
