-- AI usage metering (2026-08-23).
-- Applied to prod via Supabase MCP (ai_usage).
--
-- ai_usage: one row per model call made through lib/llmChat.ts (and the Qwen
-- OCR layer) — who, which screening, which slot, which model, tokens, the
-- USD cost computed from the catalogue price list at call time, latency.
-- Service role inserts; admins read (is_stayloop_admin()); users may read
-- their own rows (future "my usage" surface). Never exposed anonymously.
--
-- model_catalog gains admin-editable prices (USD per 1M tokens). Builtin
-- defaults come from lib/modelConfig.ts; admins correct them in /admin/models.

create table if not exists public.ai_usage (
  id                 uuid primary key default gen_random_uuid(),
  created_at         timestamptz not null default now(),
  user_id            uuid,
  screening_id       uuid,
  slot               text,                 -- turn | screening | classify | forensics | coherence | ocr | test | other
  source             text,                 -- route / module that made the call
  provider           text not null,        -- anthropic | openai-compat | dashscope-ocr
  model              text not null,
  input_tokens       integer not null default 0,
  output_tokens      integer not null default 0,
  cache_read_tokens  integer not null default 0,
  cache_write_tokens integer not null default 0,
  cost_usd           numeric(12,6),        -- null when the model has no price configured
  latency_ms         integer,
  ok                 boolean not null default true,
  error              text
);
create index if not exists ai_usage_created_idx on public.ai_usage (created_at desc);
create index if not exists ai_usage_user_idx on public.ai_usage (user_id, created_at desc);
create index if not exists ai_usage_screening_idx on public.ai_usage (screening_id);
alter table public.ai_usage enable row level security;
drop policy if exists "Admins read ai_usage" on public.ai_usage;
create policy "Admins read ai_usage" on public.ai_usage
  for select to authenticated using (public.is_stayloop_admin() or auth.uid() = user_id);
-- no insert/update/delete policies: service role only.

alter table public.model_catalog add column if not exists price_input_per_m       numeric(10,4);
alter table public.model_catalog add column if not exists price_output_per_m      numeric(10,4);
alter table public.model_catalog add column if not exists price_cache_read_per_m  numeric(10,4);
alter table public.model_catalog add column if not exists price_cache_write_per_m numeric(10,4);

-- Admin dashboard aggregate. SECURITY DEFINER, admin-gated inside.
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
      from ai_usage where created_at >= date_trunc('day', now())),
    'daily', (select coalesce(jsonb_agg(r order by r->>'day'), '[]'::jsonb) from (
        select jsonb_build_object('day', to_char(date_trunc('day', created_at), 'YYYY-MM-DD'), 'calls', count(*), 'cost_usd', coalesce(sum(cost_usd),0)) r
        from ai_usage where created_at >= since group by date_trunc('day', created_at)) d),
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
