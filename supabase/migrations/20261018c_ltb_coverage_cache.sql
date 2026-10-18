-- Site test 2026-10-17 · E-D1: ltb_coverage() scanned all of ltb_orders with count(distinct) on every
-- screening (2.7 s); run in parallel with the name search it timed out now and then and the report
-- showed no coverage window. The numbers only change when an ingest finishes, so they are cached in a
-- materialized view refreshed by the ingest run that ends 'ok'.
create materialized view if not exists public.ltb_coverage_mv as
  select min(order_date) as coverage_from, max(order_date) as coverage_to, count(distinct document_id) as order_count
    from public.ltb_orders;
revoke all on public.ltb_coverage_mv from public, anon, authenticated;

create or replace function public.ltb_coverage()
returns table(coverage_from date, coverage_to date, order_count bigint, refreshed_at timestamptz)
language sql stable security definer set search_path = public as $$
  select m.coverage_from, m.coverage_to, m.order_count,
         (select max(finished_at) from public.ltb_ingest_runs where status = 'ok')
    from public.ltb_coverage_mv m
$$;
revoke execute on function public.ltb_coverage() from public, anon, authenticated;
grant execute on function public.ltb_coverage() to authenticated, service_role;

create or replace function public.refresh_ltb_coverage()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'ok' and (tg_op = 'INSERT' or old.status is distinct from 'ok') then
    refresh materialized view public.ltb_coverage_mv;
  end if;
  return null;
end $$;
revoke execute on function public.refresh_ltb_coverage() from public, anon, authenticated, service_role;
drop trigger if exists trg_refresh_ltb_coverage on public.ltb_ingest_runs;
create trigger trg_refresh_ltb_coverage
  after insert or update of status on public.ltb_ingest_runs
  for each row execute function public.refresh_ltb_coverage();
