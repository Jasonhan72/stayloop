-- Trust API hardening: store HASHED partner keys (never plaintext) + add
-- per-key rate limiting. trust_api_keys has 0 rows (pre-launch), so this is
-- a non-breaking, additive migration.

-- ── 1. Hashed key storage ───────────────────────────────────────────────────
alter table public.trust_api_keys
  add column if not exists api_key_hash text,
  add column if not exists key_prefix   text;

create unique index if not exists trust_api_keys_hash_idx
  on public.trust_api_keys(api_key_hash);

-- Mint a partner key: returns the plaintext exactly ONCE; only the SHA-256
-- hash is persisted. Call via service role, hand the returned string to the
-- partner, and it can never be read back from the DB.
create or replace function public.create_trust_api_key(p_partner_name text)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_key text;
begin
  v_key := 'sk_trust_' || encode(gen_random_bytes(24), 'hex');
  insert into public.trust_api_keys (partner_name, api_key, api_key_hash, key_prefix, active)
  values (p_partner_name, null, encode(digest(v_key, 'sha256'), 'hex'), left(v_key, 16), true);
  return v_key;
end;
$$;

-- ── 2. Per-key fixed-window rate limiting (1-minute windows) ────────────────
create table if not exists public.trust_api_rate_limit (
  api_key_id   uuid        not null references public.trust_api_keys(id) on delete cascade,
  window_start timestamptz not null,
  count        int         not null default 0,
  primary key (api_key_id, window_start)
);

-- Atomic increment for the current minute window; returns the new count.
create or replace function public.bump_trust_api_rate(p_api_key_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window timestamptz := date_trunc('minute', now());
  v_count  int;
begin
  insert into public.trust_api_rate_limit (api_key_id, window_start, count)
  values (p_api_key_id, v_window, 1)
  on conflict (api_key_id, window_start)
  do update set count = trust_api_rate_limit.count + 1
  returning count into v_count;
  return v_count;
end;
$$;
