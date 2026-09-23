-- P2 of the lifecycle proposals (2026-09-23): the agent's own client book
-- and the move-in checklist shared on a household.

-- Agent client table (TRESA hygiene: representation agreement + Information
-- Guide dates are the two facts RECO expects before any leasing work).
create table if not exists public.agent_clients (
  id uuid primary key default gen_random_uuid(),
  agent_auth_id uuid not null,
  name text not null check (char_length(name) between 1 and 120),
  client_role text not null default 'tenant' check (client_role in ('tenant', 'landlord')),
  email text check (email is null or char_length(email) <= 200),
  phone text check (phone is null or char_length(phone) <= 40),
  budget text check (budget is null or char_length(budget) <= 80),
  area text check (area is null or char_length(area) <= 160),
  stage text not null default 'searching' check (stage in ('searching', 'showing', 'applied', 'leased', 'closed')),
  representation_agreement_at date,
  info_guide_given_at date,
  last_contact_at timestamptz,
  notes text check (notes is null or char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists agent_clients_agent_idx on public.agent_clients (agent_auth_id, updated_at desc);
alter table public.agent_clients enable row level security;
drop policy if exists agent_clients_own on public.agent_clients;
create policy agent_clients_own on public.agent_clients
  for all to authenticated using (agent_auth_id = auth.uid()) with check (agent_auth_id = auth.uid());
revoke all on public.agent_clients from anon, authenticated, service_role;
grant select, insert, update, delete on public.agent_clients to authenticated;
grant all on public.agent_clients to service_role;

-- Move-in checklist: one row per (household, item); either party may tick.
create table if not exists public.move_in_checklist (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  item_key text not null check (char_length(item_key) between 1 and 60),
  done boolean not null default false,
  done_by uuid,
  done_at timestamptz,
  note text check (note is null or char_length(note) <= 500),
  created_at timestamptz not null default now(),
  unique (household_id, item_key)
);
alter table public.move_in_checklist enable row level security;
drop policy if exists move_in_member_read on public.move_in_checklist;
create policy move_in_member_read on public.move_in_checklist
  for select to authenticated using (public.is_household_member(household_id));
drop policy if exists move_in_member_write on public.move_in_checklist;
create policy move_in_member_write on public.move_in_checklist
  for insert to authenticated with check (public.is_household_member(household_id) and (done_by is null or done_by = auth.uid()));
drop policy if exists move_in_member_update on public.move_in_checklist;
create policy move_in_member_update on public.move_in_checklist
  for update to authenticated using (public.is_household_member(household_id)) with check (public.is_household_member(household_id) and (done_by is null or done_by = auth.uid()));
revoke all on public.move_in_checklist from anon, authenticated, service_role;
grant select, insert, update on public.move_in_checklist to authenticated;
grant all on public.move_in_checklist to service_role;
