-- D-A8: the terms-confirmation email must go out once per account per TERMS_VERSION even when two
-- requests race. The route claims (user_id, terms_version) with an INSERT before sending; the
-- primary key makes the second concurrent claim fail with 23505.
create table if not exists public.terms_confirm_claims (
  user_id uuid not null,
  terms_version text not null,
  claimed_at timestamptz not null default now(),
  primary key (user_id, terms_version)
);
alter table public.terms_confirm_claims enable row level security;
revoke all on public.terms_confirm_claims from public, anon, authenticated;
grant select, insert, delete on public.terms_confirm_claims to service_role;
