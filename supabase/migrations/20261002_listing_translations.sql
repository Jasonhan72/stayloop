-- 2026-10-02 (V0.7) — the listing detail page shows one language at a time
-- (user: "不要中文和英文混杂"). Stored text that has only the other language
-- (Realtor.ca remarks in English, Chinese-only free text) is translated once by
-- /api/listings/enrich and cached here, keyed by a hash of the source strings
-- (lib/listingLang.ts collectTranslatables · srcHash). A separate table on
-- purpose: the listings triggers treat any column change as a landlord edit
-- (updated_at, re-review), and a translation is not one.
--
-- strings: { "<source string>": "<translation>" }. src_hash is the srcHash the
-- strings were made for; while a translation is running or after it failed the
-- route writes a 'pending:<hash>' / 'failed:<hash>' marker (created_at says
-- when) so concurrent views do not each pay for a model call.
--
-- Service role only: RLS on with no policies, nothing granted to the API roles.
create table if not exists public.listing_translations (
  listing_id uuid not null references public.listings(id) on delete cascade,
  lang       text not null check (lang in ('zh', 'en')),
  src_hash   text not null,
  strings    jsonb not null default '{}'::jsonb,
  model      text,
  created_at timestamptz not null default now(),
  primary key (listing_id, lang)
);

alter table public.listing_translations enable row level security;

revoke all on table public.listing_translations from public, anon, authenticated;
grant all on table public.listing_translations to service_role;
