-- Generic admin-editable app config (first use: AI model slots).
-- Applied to prod 2026-07-20 via Supabase MCP (app_config_models).
create table if not exists public.app_config (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
alter table public.app_config enable row level security;
-- Stayloop admins may read/write; everyone else denied. Service role bypasses RLS.
create policy "Admins read app_config" on public.app_config
  for select using (public.is_stayloop_admin());
create policy "Admins insert app_config" on public.app_config
  for insert with check (public.is_stayloop_admin());
create policy "Admins update app_config" on public.app_config
  for update using (public.is_stayloop_admin()) with check (public.is_stayloop_admin());

insert into public.app_config (key, value)
values ('models', '{"turn":"claude-sonnet-4-6","screening":"claude-sonnet-4-6","classify":"claude-sonnet-4-6","forensics":"claude-haiku-4-5"}'::jsonb)
on conflict (key) do nothing;
