-- 2026-09-25 (V0.6) — "关于社区" prose for the listing detail page (StreetEasy
-- "About Murray Hill"): one short, model-written primer per (city, neighbourhood),
-- generated once by /api/listings/enrich from facts we hold (transit stops,
-- TRREB benchmark, listing sample) with no numbers / years / demographics,
-- labelled as AI-written on the page. Service role only.
create table if not exists public.neighborhood_profiles (
  city         text not null,
  name         text not null,
  zh           text not null,
  en           text not null,
  model        text,
  facts        jsonb,
  generated_at timestamptz not null default now(),
  primary key (city, name)
);
alter table public.neighborhood_profiles enable row level security;
revoke all on public.neighborhood_profiles from anon, authenticated, public;
