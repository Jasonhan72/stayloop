-- Admin dashboard aggregate. SECURITY DEFINER, admin-gated inside.
-- 2026-10-18 (M-D1): 'today' and the daily series cut days on America/Toronto, not UTC.
create or replace function public.admin_ai_usage_stats(p_days integer default 30)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  since timestamptz := now() - make_interval(days => greatest(1, least(p_days, 365)));
  out jsonb;
begin
  if not public.is_stayloop_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'since', since,
    'totals', (select jsonb_build_object(
        'calls', count(*), 'cost_usd', coalesce(sum(cost_usd),0),
        'input_tokens', coalesce(sum(input_tokens),0), 'output_tokens', coalesce(sum(output_tokens),0),
        'unpriced_calls', count(*) filter (where cost_usd is null),
        'errors', count(*) filter (where not ok))
      from ai_usage where created_at >= since),
    'today', (select jsonb_build_object('calls', count(*), 'cost_usd', coalesce(sum(cost_usd),0))
      from ai_usage where created_at >= (date_trunc('day', now() at time zone 'America/Toronto') at time zone 'America/Toronto')),
    'daily', (select coalesce(jsonb_agg(r order by r->>'day'), '[]'::jsonb) from (
        select jsonb_build_object('day', to_char(date_trunc('day', created_at at time zone 'America/Toronto'), 'YYYY-MM-DD'), 'calls', count(*), 'cost_usd', coalesce(sum(cost_usd),0)) r
        from ai_usage where created_at >= since group by date_trunc('day', created_at at time zone 'America/Toronto')) d),
    'by_model', (select coalesce(jsonb_agg(r order by (r->>'cost_usd')::numeric desc), '[]'::jsonb) from (
        select jsonb_build_object('model', model, 'provider', provider, 'calls', count(*), 'cost_usd', coalesce(sum(cost_usd),0),
          'input_tokens', coalesce(sum(input_tokens),0), 'output_tokens', coalesce(sum(output_tokens),0),
          'cache_read_tokens', coalesce(sum(cache_read_tokens),0), 'unpriced', count(*) filter (where cost_usd is null), 'avg_latency_ms', round(avg(latency_ms))) r
        from ai_usage where created_at >= since group by model, provider) m),
    'by_slot', (select coalesce(jsonb_agg(r order by (r->>'cost_usd')::numeric desc), '[]'::jsonb) from (
        select jsonb_build_object('slot', coalesce(slot,'other'), 'calls', count(*), 'cost_usd', coalesce(sum(cost_usd),0)) r
        from ai_usage where created_at >= since group by coalesce(slot,'other')) s),
    'per_screening', (select jsonb_build_object(
        'screenings', count(*), 'avg_cost_usd', coalesce(avg(c),0), 'p50_cost_usd', coalesce(percentile_cont(0.5) within group (order by c),0),
        'max_cost_usd', coalesce(max(c),0))
      from (select screening_id, sum(cost_usd) c from ai_usage where created_at >= since and screening_id is not null group by screening_id) x),
    'top_users', (select coalesce(jsonb_agg(r), '[]'::jsonb) from (
        select jsonb_build_object('user_id', user_id, 'calls', count(*), 'cost_usd', coalesce(sum(cost_usd),0)) r
        from ai_usage where created_at >= since and user_id is not null group by user_id order by sum(cost_usd) desc nulls last limit 10) u)
  ) into out;
  return out;
end $$;
revoke all on function public.admin_ai_usage_stats(integer) from public, anon;
grant execute on function public.admin_ai_usage_stats(integer) to authenticated, service_role;
