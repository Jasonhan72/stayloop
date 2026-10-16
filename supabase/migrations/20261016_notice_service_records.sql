-- V1.0 阶段 3 · 甲 #5 — N 表工具箱的送达记录（design/v1-scope-and-roadmap-2026-10.md 3.1 / §6）。
--
-- One row each time a landlord records "I served the official <form> on
-- <date> by <method>" from /landlord/notices. The row keeps the values the
-- sheet was built from and the flags it showed at the time; it is a record
-- of what the landlord did, not a notice, and Stayloop never serves anything.
--
-- Append-only: the landlord may SELECT and INSERT their own rows; there is no
-- UPDATE or DELETE policy and no grant for either (a service record that can
-- be rewritten is worthless as a record). Revokes are written
-- `from public, anon, authenticated` (CLAUDE.md 2026-09-25: a bare
-- `revoke … from anon` is a no-op while the ACL still carries PUBLIC).

create table if not exists public.notice_service_records (
  id               uuid primary key default gen_random_uuid(),
  landlord_auth_id uuid not null default auth.uid(),
  lease_id         uuid references public.lease_documents (id) on delete set null,
  form             text not null check (form in ('N1', 'N4', 'N12', 'L1')),
  served_on        date not null,
  method           text not null check (method in ('hand', 'mailbox', 'mail', 'fax', 'email')),
  deemed_served_on date not null,
  -- The date the form is about: N1 effective date, N4 / N12 termination date, L1 filing date.
  key_date         date,
  "values"         jsonb not null default '{}'::jsonb,
  flags            jsonb not null default '[]'::jsonb,
  created_at       timestamptz not null default now()
);

comment on table public.notice_service_records is
  'Landlord-recorded service of an official LTB form (N1 / N4 / N12 / L1) prepared with the notice toolbox. Append-only: no update or delete for API roles.';

create index if not exists idx_notice_service_records_landlord on public.notice_service_records (landlord_auth_id, created_at desc);
create index if not exists idx_notice_service_records_lease on public.notice_service_records (lease_id);

alter table public.notice_service_records enable row level security;

drop policy if exists notice_service_records_own_select on public.notice_service_records;
create policy notice_service_records_own_select on public.notice_service_records
  for select to authenticated
  using (landlord_auth_id = auth.uid());

drop policy if exists notice_service_records_own_insert on public.notice_service_records;
create policy notice_service_records_own_insert on public.notice_service_records
  for insert to authenticated
  with check (landlord_auth_id = auth.uid());

revoke all on table public.notice_service_records from public, anon, authenticated;
grant select, insert on table public.notice_service_records to authenticated;
grant all on table public.notice_service_records to service_role;
