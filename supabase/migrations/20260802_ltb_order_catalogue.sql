-- LTB Order Catalogue — Ontario Open Data (data.ontario.ca/dataset/ltb-order-catalogue)
--
-- Published 2026-07-24 under the Open Government Licence – Ontario, which
-- permits commercial use with attribution. Currently covers final orders issued
-- 2026-01 → 2026-05 (40,844 orders); orders back to 2021 land in phases and new
-- months arrive 2–3 months after issuance. Orders under a confidentiality order
-- are excluded at source.
--
-- WHY WE INGEST INSTEAD OF QUERYING THEIR API
-- The catalogue is CKAN-backed with datastore_active = true, so a live endpoint
-- exists. Measured against it (2026-08-02) rather than assumed:
--   · `q` ANDs its words — `q=Florentina zzqqxx9988` returns 0 — but searches
--     EVERY column, which is the disqualifying part. `q=David Park` returns 39
--     rows whose first five are a tenant named DAVID HUTCHINSON living on PARK
--     ROAD, a landlord named David Atwell on West Park Avenue, and a landlord
--     literally named David Park. None is a tenant named David Park.
--   · `filters` matches a whole cell exactly, and 13,384 of the 40,844 orders
--     pack co-respondents into one cell ("A and B"), so exact match misses them.
--   · `datastore_search_sql` is blocked by the portal (HTML error page / 429).
-- So the endpoint cannot answer "was THIS PERSON a tenant on an order", which is
-- the only question screening asks. Matching has to happen here, on exploded,
-- normalized, role-tagged rows.
--
-- WHAT A ROW DOES AND DOES NOT PROVE
-- The catalogue carries no disposition field: Document Type is only
-- Order / ExParte Order / Review Order / Amended Order. A match therefore proves
-- an application was filed naming this person and an order issued. It does NOT
-- prove eviction, arrears, or liability — only the order PDF says that. Callers
-- must not phrase it more strongly than the data supports.

create table if not exists public.ltb_orders (
  id                bigserial primary key,
  file_number       text not null,
  document_id       text not null,
  order_date        date not null,
  -- {L1,L2} — L1 non-payment, L2 eviction, L4 breach, L10 former tenant owes,
  -- T1 illegal charges, T2 tenant rights, T6 maintenance.
  application_codes text[] not null default '{}',
  application_type  text not null,   -- L (landlord filed) | T (tenant filed) | C (co-op)
  document_type     text,
  -- Which side of the application this person sits on. Derived, not scored here:
  -- 'respondent' = an L application was brought against them;
  -- 'applicant'  = a T application they themselves brought.
  party_side        text not null,
  role              text not null,   -- tenant | former_tenant | sub_tenant | occupant | landlord | landlord_agent | coop_member
  person_name       text not null,   -- as printed on the order
  person_norm       text not null,   -- accent-stripped, punctuation-free, upper
  person_key        text not null,   -- person_norm tokens sorted — order-insensitive
  unit_address      text,
  address_postal    text,            -- A1A1A1, no space
  address_street_no text,
  address_norm      text,
  order_pdf_url     text,
  constraint ltb_orders_person_uniq unique (document_id, role, person_norm)
);

comment on table public.ltb_orders is
  'Ontario LTB Order Catalogue, exploded to one row per person per order per role. Contains information licensed under the Open Government Licence – Ontario. A row proves an order was issued naming this person; it does NOT prove eviction or arrears.';

create index if not exists ltb_orders_person_key_idx on public.ltb_orders (person_key);
create index if not exists ltb_orders_person_trgm_idx on public.ltb_orders using gin (person_norm gin_trgm_ops);
create index if not exists ltb_orders_postal_idx on public.ltb_orders (address_postal) where address_postal is not null;
create index if not exists ltb_orders_date_idx on public.ltb_orders (order_date desc);

-- Ingest bookkeeping, so a refresh can report what it actually loaded rather
-- than the report implying coverage the table does not have.
create table if not exists public.ltb_ingest_runs (
  id             bigserial primary key,
  started_at     timestamptz not null default now(),
  finished_at    timestamptz,
  resource_id    text,
  rows_ingested  integer,
  orders_seen    integer,
  coverage_from  date,
  coverage_to    date,
  status         text not null default 'running',
  error          text
);

alter table public.ltb_orders enable row level security;
alter table public.ltb_ingest_runs enable row level security;

-- Deliberately no policies on either table: the data is reachable only through
-- the SECURITY DEFINER function below (and the service-role ingest). A tenant
-- must not be able to enumerate the catalogue through PostgREST.

-- Coverage, so callers can state the real window instead of assuming.
create or replace function public.ltb_coverage()
returns table (coverage_from date, coverage_to date, order_count bigint, refreshed_at timestamptz)
language sql
security definer
set search_path = public
stable
as $$
  select min(order_date), max(order_date), count(distinct document_id),
         (select max(finished_at) from public.ltb_ingest_runs where status = 'ok')
  from public.ltb_orders
$$;

grant execute on function public.ltb_coverage() to authenticated, service_role;

-- Name lookup.
--
-- p_name        the applicant's full name, already normalized by the caller
--               (lib/ltb/normalize.ts) so ingest and query agree character for
--               character.
-- p_key         the same name with its tokens sorted, so "WANG SARAH" on an
--               order still matches "Sarah Wang" on an application.
-- p_postals     postal codes from the addresses the applicant declared.
-- p_street_keys "<street-number> <first-street-word>" keys from those addresses.
--
-- address_match is what separates a corroborated hit from a namesake. It is
-- returned, never applied: the caller decides what a corroborated hit is worth.
-- Matching rules, and why each exists:
--   exact / reordered   — person_norm, or its tokens sorted, so an order printed
--                         "WANG SARAH" still matches "Sarah Wang".
--   subset              — token containment, which is what actually makes this
--                         safe. Pure trigram similarity on short names is
--                         dominated by the shared GIVEN name: at 0.62 "DAVID
--                         PARK" pulled in DAVID PARKER (0.71) and DAVID PARRY
--                         (0.64) — different people, different surnames, printed
--                         on someone else's report. Containment still tolerates a
--                         missing or extra middle name and rejects a substituted
--                         surname outright.
--   fuzzy               — a narrow escape hatch for transliteration drift only,
--                         at >= 0.85, above every surname-substitution pair
--                         observed in the catalogue.
--
-- plpgsql rather than SQL purely so this can run: Supabase does not permit a
-- function-level SET of pg_trgm.similarity_threshold, but set_limit() is
-- callable. Raising the threshold to 0.85 makes `%` mean exactly what the fuzzy
-- branch means, so the trigram index returns a handful of rows instead of a
-- thousand the function then has to re-filter. Each of the other branches has
-- its own index (person_norm btree, person_key btree, gin on the token array).
-- Measured at 143,869 rows: 904ms before, 19.6ms after, identical results.
create or replace function public.search_ltb_orders(
  p_name        text,
  p_key         text,
  p_postals     text[] default '{}',
  p_street_keys text[] default '{}',
  p_limit       integer default 25
)
returns table (
  file_number       text,
  document_id       text,
  order_date        date,
  application_codes text[],
  application_type  text,
  document_type     text,
  party_side        text,
  role              text,
  person_name       text,
  unit_address      text,
  order_pdf_url     text,
  match_kind        text,     -- exact | reordered | subset | fuzzy
  similarity        real,
  address_match     boolean
)
language plpgsql
security definer
set search_path = public, extensions
stable
as $$
declare
  v_tokens text[] := string_to_array(p_name, ' ');
begin
  -- A full name is required; single tokens are far too ambiguous to search on.
  if length(coalesce(p_name, '')) < 5 or position(' ' in p_name) = 0 then
    return;
  end if;

  perform set_limit(0.85);

  return query
  select o.file_number, o.document_id, o.order_date, o.application_codes,
         o.application_type, o.document_type, o.party_side, o.role, o.person_name,
         o.unit_address, o.order_pdf_url,
         case when o.person_norm = p_name then 'exact'
              when o.person_key  = p_key  then 'reordered'
              when string_to_array(o.person_norm, ' ') @> v_tokens
                or string_to_array(o.person_norm, ' ') <@ v_tokens then 'subset'
              else 'fuzzy' end,
         similarity(o.person_norm, p_name),
         (
           (o.address_postal is not null and o.address_postal = any(p_postals))
           or (o.address_norm is not null and o.address_norm = any(p_street_keys))
         )
  from public.ltb_orders o
  where
        o.person_norm = p_name                                  -- btree
     or o.person_key  = p_key                                   -- btree
     or string_to_array(o.person_norm, ' ') @> v_tokens         -- gin
     or string_to_array(o.person_norm, ' ') <@ v_tokens         -- gin
     or o.person_norm % p_name                                  -- gin_trgm, now >= 0.85
  order by
    (o.address_postal is not null and o.address_postal = any(p_postals)) desc,
    similarity(o.person_norm, p_name) desc,
    o.order_date desc
  limit least(greatest(coalesce(p_limit, 25), 1), 100);
end;
$$;

-- Callable by a signed-in landlord running a screening; the function reads only
-- published open data and returns at most p_limit rows.
grant execute on function public.search_ltb_orders(text, text, text[], text[], integer) to authenticated, service_role;

-- Applied as a follow-up after verifying the deployed ACLs: PUBLIC holds
-- EXECUTE on new functions by default, so granting to `authenticated` above did
-- NOT stop `anon` from calling these — anyone holding the browser anon key
-- could look up a person's LTB history without signing in. Screening is a paid,
-- authenticated, audited action and the catalogue lookup must inherit that.
-- (Same default-grant trap as 20260728_lock_down_definer_rpcs.sql.)
revoke execute on function public.search_ltb_orders(text, text, text[], text[], integer) from public, anon;
revoke execute on function public.ltb_coverage() from public, anon;
grant execute on function public.search_ltb_orders(text, text, text[], text[], integer) to authenticated, service_role;
grant execute on function public.ltb_coverage() to authenticated, service_role;

-- RLS with zero policies already denies every row; the table grants should not
-- exist either, so a future migration toggling RLS cannot expose the catalogue.
revoke all on public.ltb_orders from public, anon, authenticated;
revoke all on public.ltb_ingest_runs from public, anon, authenticated;
grant all on public.ltb_orders to service_role;
grant all on public.ltb_ingest_runs to service_role;

-- ── Follow-ups applied after measuring against the loaded table ─────────────

-- Withdrawal tracking. The catalogue excludes orders placed under a
-- confidentiality order and reissues corrected ones, but the ingest only ever
-- ADDED rows — an order sealed after we first read it would sit here forever
-- and keep appearing on screening reports, i.e. we would be publishing
-- something Ontario has taken down. Each row now carries the run that last saw
-- it, and the ingest prunes whatever the source no longer lists.
alter table public.ltb_orders add column if not exists resource_id text;
alter table public.ltb_orders add column if not exists last_seen_run bigint;
create index if not exists ltb_orders_resource_run_idx on public.ltb_orders (resource_id, last_seen_run);

-- Index-served matching. At 143,869 rows a common name took 904ms: the trigram
-- prefilter ran at the default 0.3 threshold and handed 1,073 candidates to a
-- filter that recomputed similarity() and string_to_array() per row. That is
-- ~8s once the 2021 backfill brings this to ~1.2M rows. Each match branch now
-- has an index, and search_ltb_orders raises the trigram threshold to 0.85 via
-- set_limit() so `%` means what the fuzzy branch means instead of being a wide
-- prefilter. Measured after: 19.6ms, identical results.
-- (plpgsql rather than SQL only because Supabase forbids a function-level SET
-- of pg_trgm.similarity_threshold, while set_limit() is callable.)
create index if not exists ltb_orders_person_norm_idx on public.ltb_orders (person_norm);
create index if not exists ltb_orders_tokens_idx
  on public.ltb_orders using gin (string_to_array(person_norm, ' '));

-- The monthly refresh rewrites every row in one burst, so the default 20%
-- autovacuum threshold leaves the table bloated between runs.
alter table public.ltb_orders set (
  autovacuum_vacuum_scale_factor = 0.05,
  autovacuum_analyze_scale_factor = 0.05,
  autovacuum_vacuum_cost_delay = 0
);

-- This file is the consolidated form of five migrations applied to production
-- on 2026-08-02 (ltb_order_catalogue, ltb_search_token_containment,
-- ltb_lock_down_anon_access, ltb_index_served_search_and_withdrawals,
-- ltb_autovacuum_for_bulk_refresh). It carried the FIRST version of
-- search_ltb_orders long after the fourth had superseded it, so re-applying it —
-- on a fresh environment, or over production — would have silently replaced the
-- 19.6ms index-served function with the 904ms one. Anything changed here from
-- now on must be diffed against pg_get_functiondef() in production.
