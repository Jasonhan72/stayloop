-- 专业服务类目 + 入住 / 退租照片 (2026-10-27; design/ai-rebuild-report-review-2026-10-25.md 第二批 6 / 7).
--
--   provider_credentials.kind   three licence kinds join the list: LSO paralegal (P1), LSO lawyer (L1),
--                               RIBO insurance broker. The trades that need them (paralegal / lawyer /
--                               insurance_broker, plus photographer_floorplan) are directory-only in
--                               lib/marketplace/trades.ts — no ticket category maps to them, so the
--                               dispatcher never offers them a work order.
--   condition_photos            one row per move-in / move-out photo of a household: hashed (SHA-256)
--                               on the member's device, stored in the tenancy-files bucket under the
--                               household folder, recorded with the server time. Members SELECT and
--                               INSERT (as themselves); nobody updates or deletes — the move-out
--                               comparison and the evidence pack read the same append-only record.
alter table public.provider_credentials drop constraint if exists provider_credentials_kind_check;
alter table public.provider_credentials add constraint provider_credentials_kind_check
  check (kind in ('sto_coq','esa_contractor','tssa_gas','wsib_clearance','liability_insurance','business_registration','mecp_exterminator','lso_paralegal','lso_lawyer','ribo_licence'));

create table if not exists public.condition_photos (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households(id) on delete cascade,
  phase         text not null check (phase in ('move_in','move_out')),
  item_key      text not null check (char_length(item_key) between 1 and 60),
  path          text not null check (char_length(path) <= 300),
  sha256        text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  bytes         integer not null check (bytes > 0),
  content_type  text check (content_type is null or char_length(content_type) <= 80),
  note          text check (note is null or char_length(note) <= 300),
  taken_by      uuid not null references auth.users(id),
  created_at    timestamptz not null default now()
);
create index if not exists condition_photos_household_idx on public.condition_photos (household_id, phase, item_key, created_at);
alter table public.condition_photos enable row level security;
drop policy if exists condition_photos_member_read on public.condition_photos;
create policy condition_photos_member_read on public.condition_photos
  for select to authenticated using (public.is_household_member(household_id));
drop policy if exists condition_photos_member_insert on public.condition_photos;
create policy condition_photos_member_insert on public.condition_photos
  for insert to authenticated with check (public.is_household_member(household_id) and taken_by = auth.uid());
-- Append-only: no UPDATE / DELETE policy and no such privilege for the API roles.
revoke all on public.condition_photos from public, anon, authenticated, service_role;
grant select, insert on public.condition_photos to authenticated;
grant all on public.condition_photos to service_role;
