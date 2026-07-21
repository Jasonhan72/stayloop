-- P2: anon_rate_limits daily cleanup + app_config.updated_by integrity.
-- PENDING prod apply (Supabase MCP down 2026-07-21) — paste in Studio SQL editor.
create or replace function public.cleanup_anon_rate_limits() returns void
language sql security definer set search_path to 'public'
as $$ delete from public.anon_rate_limits where window_start < now() - interval '1 day'; $$;
revoke execute on function public.cleanup_anon_rate_limits() from public, anon, authenticated;
select cron.schedule('anon-rate-limit-cleanup', '30 13 * * *', $$select public.cleanup_anon_rate_limits()$$);

create or replace function public.app_config_set_updated_by() returns trigger
language plpgsql security definer set search_path to 'public'
as $$ begin new.updated_by := auth.uid(); new.updated_at := now(); return new; end; $$;
drop trigger if exists trg_app_config_updated_by on public.app_config;
create trigger trg_app_config_updated_by before insert or update on public.app_config
for each row execute function public.app_config_set_updated_by();
