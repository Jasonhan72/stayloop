-- Anonymous (unauthenticated) agent-turn rate limiting, keyed by caller-supplied
-- opaque key (SHA-256 of client IP, computed server-side). Service-role only.
-- Applied to prod 2026-07-13 via Supabase MCP (anon_rate_limit).
create table if not exists public.anon_rate_limits (
  key text not null,
  window_start timestamptz not null,
  count int not null default 0,
  primary key (key, window_start)
);
alter table public.anon_rate_limits enable row level security;
-- No policies: only service_role (bypasses RLS) may touch it.

create or replace function public.bump_anon_rate_limit(p_key text, p_limit integer default 8)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_window timestamptz := date_trunc('hour', now());
  v_count int;
begin
  if p_key is null or length(p_key) < 16 then
    return false;
  end if;
  insert into public.anon_rate_limits (key, window_start, count)
  values (p_key, v_window, 1)
  on conflict (key, window_start)
    do update set count = public.anon_rate_limits.count + 1
  returning count into v_count;
  delete from public.anon_rate_limits
    where key = p_key and window_start < v_window - interval '2 hours';
  return v_count <= p_limit;
end $function$;

-- Service-role only: nobody else may execute.
revoke execute on function public.bump_anon_rate_limit(text, integer) from public, anon, authenticated;
grant execute on function public.bump_anon_rate_limit(text, integer) to service_role;
