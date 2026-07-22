-- =============================================================
-- Passport off-platform share tokens (2026-07-22)
--
-- A tenant generates an opaque token → public read-only snapshot
-- page /p/{token}. The token row is owned by the tenant (RLS:
-- tenant_user_id = auth.uid() for select/insert/update). The
-- public page reads via the SERVER service-role key (RLS bypass)
-- — deliberately NO anon policy, so the anon key can never
-- enumerate or read tokens directly.
--
-- Applied to prod 2026-07-22 via Supabase MCP.
-- =============================================================

create table if not exists public.passport_share_tokens (
  token           text primary key check (length(token) >= 32 and token ~ '^[A-Za-z0-9_-]+$'),
  tenant_user_id  uuid not null references auth.users(id) on delete cascade,
  created_at      timestamptz not null default now(),
  expires_at      timestamptz not null default (now() + interval '30 days'),
  revoked_at      timestamptz,
  view_count      int not null default 0
);

create index if not exists passport_share_tokens_tenant_idx
  on public.passport_share_tokens(tenant_user_id);

alter table public.passport_share_tokens enable row level security;

-- Tenant manages their own tokens from the browser (anon key + JWT).
create policy "Tenant reads own share tokens" on public.passport_share_tokens
  for select using (tenant_user_id = auth.uid());
create policy "Tenant creates own share tokens" on public.passport_share_tokens
  for insert with check (tenant_user_id = auth.uid());
create policy "Tenant updates own share tokens" on public.passport_share_tokens
  for update using (tenant_user_id = auth.uid())
  with check (tenant_user_id = auth.uid());
-- No delete policy (revoke = set revoked_at); no anon/public policy on purpose.
