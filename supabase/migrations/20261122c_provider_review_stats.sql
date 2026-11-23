-- 2026-11-22 · A provider's rating reads the same for everyone.
--
-- The directory card and the landlord's provider page averaged `provider_reviews` in the browser.
-- That table's read policy checks "the provider is verified" through `service_providers`, whose own
-- RLS only lets an account see its own provider row — so in practice each account saw the reviews
-- it wrote itself (plus those of its own provider), and the same card showed "★ 4.5 (2)" to one
-- person and "no reviews yet" to the next. Found while building the provider page (/providers/<id>).
--
-- The fix is a definer view with one row per verified provider: how many reviews and the averages,
-- to one decimal. No comment, no reviewer, no work order — the individual reviews stay under the
-- table's own policy. Signed-in accounts only, like the directory itself; read-only.

create or replace view public.provider_review_stats with (security_invoker = false) as
select r.provider_id,
       count(*)::integer            as reviews,
       round(avg(r.overall), 1)     as overall,
       round(avg(r.on_time), 1)     as on_time,
       round(avg(r.communication), 1) as communication,
       round(avg(r.quality), 1)     as quality
  from public.provider_reviews r
  join public.service_providers p on p.id = r.provider_id
 where p.status = 'verified'
 group by r.provider_id;

-- New relations get ALL for the three API roles by default; a single-table definer view would be a
-- writable back door, and anonymous visitors read nothing about providers.
revoke all on public.provider_review_stats from public, anon, authenticated;
grant select on public.provider_review_stats to authenticated, service_role;

comment on view public.provider_review_stats is
  'Per verified provider: review count and average scores (1 decimal). Aggregates only — no comment, reviewer or work order. authenticated: select.';
