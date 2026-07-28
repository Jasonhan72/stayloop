-- Schema-drift backfill, found during the 2026-07-28 review.
--
-- `agent_rate_limits` + `bump_agent_rate_limit()` exist in production but were
-- never captured in a migration — they were applied straight to the database.
-- /api/agent/turn is fail-CLOSED on this RPC, so a fresh environment built from
-- supabase/migrations gets a working schema in which every authenticated agent
-- turn is rejected, with nothing in the repo to explain why.
--
-- Transcribed verbatim from the deployed definition (pg_get_functiondef), so
-- applying this against production is a no-op.

create table if not exists public.agent_rate_limits (
  user_id uuid not null,
  window_start timestamptz not null,
  count integer not null default 0,
  primary key (user_id, window_start)
);

alter table public.agent_rate_limits enable row level security;

-- No policies: the table is reached only through the SECURITY DEFINER function
-- below, never directly by a client.

create or replace function public.bump_agent_rate_limit(p_limit integer default 60)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_window timestamptz := date_trunc('hour', now());
  v_count int;
begin
  if auth.uid() is null then
    return false;
  end if;
  insert into public.agent_rate_limits (user_id, window_start, count)
  values (auth.uid(), v_window, 1)
  on conflict (user_id, window_start)
    do update set count = public.agent_rate_limits.count + 1
  returning count into v_count;
  -- Opportunistic cleanup of old buckets for this user.
  delete from public.agent_rate_limits
    where user_id = auth.uid() and window_start < v_window - interval '2 hours';
  return v_count <= p_limit;
end $function$;

-- Deliberately callable by authenticated clients: the turn route invokes it
-- with the caller's own JWT, and it counts against auth.uid() only.
grant execute on function public.bump_agent_rate_limit(integer) to authenticated, service_role;
