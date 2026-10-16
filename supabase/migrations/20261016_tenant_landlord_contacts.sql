-- 2026-10-16 (V1.0 stage 2 · 乙 #11): a tenant whose landlord is not on Stayloop can still send a
-- letter or a repair request through the AI Agent. The tenant gives the landlord's email once (an
-- intake step or a line in the message); the execute route keeps it here and, when neither a verified
-- managed tenancy nor a signed lease names a landlord, emails that address — only ever an address the
-- tenant themselves supplied. One row per tenant. Owner-only RLS; anon has nothing; the server writes
-- with the service role.
create table if not exists public.tenant_landlord_contacts (
  id             uuid primary key default gen_random_uuid(),
  tenant_auth_id uuid not null references auth.users(id) on delete cascade,
  landlord_name  text check (landlord_name is null or char_length(landlord_name) <= 120),
  landlord_email text not null check (char_length(landlord_email) <= 254 and landlord_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  unit_label     text check (unit_label is null or char_length(unit_label) <= 200),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (tenant_auth_id)
);

alter table public.tenant_landlord_contacts enable row level security;
drop policy if exists tenant_landlord_contacts_own on public.tenant_landlord_contacts;
create policy tenant_landlord_contacts_own on public.tenant_landlord_contacts
  for all to authenticated using (tenant_auth_id = auth.uid()) with check (tenant_auth_id = auth.uid());

-- The project's default privileges hand every new table to the three API roles (migration lesson
-- 2026-09-16); take them back and grant only what the owner policy allows. `from public` first — a
-- revoke from anon alone is a no-op while PUBLIC still holds the grant (review 2026-09-25).
revoke all on public.tenant_landlord_contacts from public, anon, authenticated;
grant select, insert, update, delete on public.tenant_landlord_contacts to authenticated, service_role;
