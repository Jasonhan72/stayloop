-- V1.0 · 阶段 4 · 乙 #7 申请包 (2026-10-16, G13 data layer) — contract:
-- design/applicant-pack-contract-2026-10.md.
--
-- The applicant's own pack: what they typed about themselves, where they lived
-- before, and the documents they uploaded. Every item is the applicant's own or
-- authorised by them; Stayloop looks nothing up about anyone here, keeps no SIN,
-- asks no protected ground. Three tables, all keyed on the signed-in account:
--   applicant_profiles        one row per account (auth_id is the primary key);
--                             the owner reads / writes it directly through RLS.
--   applicant_profile_history previous addresses the applicant typed (position 0
--                             = most recent). Tenancies both sides confirmed on
--                             Stayloop are NOT rows here — lib/profile/history.ts
--                             computes them from households / rent_payments with the
--                             same test as the public /p/<token> card.
--   applicant_profile_files   the document index. The owner may SELECT and DELETE
--                             rows; INSERT is the server's only (POST /api/profile/files
--                             computes the SHA-256 and writes with the service role),
--                             so a row never names bytes the server did not store.
-- Bucket tenant-files, path profile/<auth_id>/<kind>/<sha8>-<safe-name>: the first
-- segment is a fixed word, so application_upload_allowed (uuid first) and the
-- agent-intake / screenings prefixes never match. A definer helper gives the owner
-- SELECT (signed URLs for preview); there is no client INSERT policy on purpose.

-- ── 0. updated_at touch (simple version of listings_touch_updated_at) ──────────
create or replace function public.applicant_profile_touch_updated_at()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end $$;
revoke execute on function public.applicant_profile_touch_updated_at() from public, anon, authenticated, service_role;

-- ── 1. applicant_profiles ──────────────────────────────────────────────────────
create table if not exists public.applicant_profiles (
  auth_id               uuid primary key references auth.users(id) on delete cascade,
  first_name            text,
  last_name             text,
  phone                 text,
  current_address       text,
  date_of_birth         date,
  employment_status     text,
  employer_name         text,
  job_title             text,
  employment_start_date date,
  monthly_income        integer,
  employer_phone        text,
  employer_email        text,
  num_occupants         integer not null default 1,
  has_pets              boolean not null default false,
  pet_details           text,
  is_smoker             boolean not null default false,
  additional_notes      text,
  consent_version       text,
  consent_at            timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint applicant_profiles_first_name_len       check (first_name is null or char_length(first_name) <= 200),
  constraint applicant_profiles_last_name_len        check (last_name is null or char_length(last_name) <= 200),
  constraint applicant_profiles_phone_len            check (phone is null or char_length(phone) <= 200),
  constraint applicant_profiles_current_address_len  check (current_address is null or char_length(current_address) <= 200),
  constraint applicant_profiles_employment_status_len check (employment_status is null or char_length(employment_status) <= 200),
  constraint applicant_profiles_employer_name_len    check (employer_name is null or char_length(employer_name) <= 200),
  constraint applicant_profiles_job_title_len        check (job_title is null or char_length(job_title) <= 200),
  constraint applicant_profiles_employer_phone_len   check (employer_phone is null or char_length(employer_phone) <= 200),
  constraint applicant_profiles_employer_email_len   check (employer_email is null or char_length(employer_email) <= 200),
  constraint applicant_profiles_pet_details_len      check (pet_details is null or char_length(pet_details) <= 200),
  constraint applicant_profiles_additional_notes_len check (additional_notes is null or char_length(additional_notes) <= 2000),
  constraint applicant_profiles_consent_version_len  check (consent_version is null or char_length(consent_version) <= 200),
  constraint applicant_profiles_monthly_income_range check (monthly_income is null or (monthly_income >= 0 and monthly_income <= 10000000)),
  constraint applicant_profiles_num_occupants_range  check (num_occupants between 1 and 50)
);
alter table public.applicant_profiles enable row level security;

drop trigger if exists trg_applicant_profiles_touch on public.applicant_profiles;
create trigger trg_applicant_profiles_touch before update on public.applicant_profiles
  for each row execute function public.applicant_profile_touch_updated_at();

drop policy if exists applicant_profiles_own_select on public.applicant_profiles;
create policy applicant_profiles_own_select on public.applicant_profiles
  for select to authenticated using (auth_id = auth.uid());
drop policy if exists applicant_profiles_own_insert on public.applicant_profiles;
create policy applicant_profiles_own_insert on public.applicant_profiles
  for insert to authenticated with check (auth_id = auth.uid());
drop policy if exists applicant_profiles_own_update on public.applicant_profiles;
create policy applicant_profiles_own_update on public.applicant_profiles
  for update to authenticated using (auth_id = auth.uid()) with check (auth_id = auth.uid());
drop policy if exists applicant_profiles_own_delete on public.applicant_profiles;
create policy applicant_profiles_own_delete on public.applicant_profiles
  for delete to authenticated using (auth_id = auth.uid());

revoke all on public.applicant_profiles from public, anon, authenticated, service_role;
grant select, insert, update, delete on public.applicant_profiles to authenticated;
grant all on public.applicant_profiles to service_role;

-- ── 2. applicant_profile_history ───────────────────────────────────────────────
create table if not exists public.applicant_profile_history (
  id                  uuid primary key default gen_random_uuid(),
  auth_id             uuid not null references auth.users(id) on delete cascade,
  position            integer not null default 0,
  prev_address        text,
  prev_landlord_name  text,
  prev_landlord_phone text,
  prev_landlord_email text,
  prev_rent           integer,
  prev_move_in        date,
  prev_move_out       date,
  reason_for_leaving  text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint applicant_profile_history_position_range       check (position between 0 and 50),
  constraint applicant_profile_history_prev_address_len     check (prev_address is null or char_length(prev_address) <= 200),
  constraint applicant_profile_history_landlord_name_len    check (prev_landlord_name is null or char_length(prev_landlord_name) <= 200),
  constraint applicant_profile_history_landlord_phone_len   check (prev_landlord_phone is null or char_length(prev_landlord_phone) <= 200),
  constraint applicant_profile_history_landlord_email_len   check (prev_landlord_email is null or char_length(prev_landlord_email) <= 200),
  constraint applicant_profile_history_reason_len           check (reason_for_leaving is null or char_length(reason_for_leaving) <= 2000),
  constraint applicant_profile_history_prev_rent_range      check (prev_rent is null or (prev_rent >= 0 and prev_rent <= 1000000))
);
create index if not exists applicant_profile_history_owner_idx on public.applicant_profile_history (auth_id, position);
alter table public.applicant_profile_history enable row level security;

drop trigger if exists trg_applicant_profile_history_touch on public.applicant_profile_history;
create trigger trg_applicant_profile_history_touch before update on public.applicant_profile_history
  for each row execute function public.applicant_profile_touch_updated_at();

drop policy if exists applicant_profile_history_own_select on public.applicant_profile_history;
create policy applicant_profile_history_own_select on public.applicant_profile_history
  for select to authenticated using (auth_id = auth.uid());
drop policy if exists applicant_profile_history_own_insert on public.applicant_profile_history;
create policy applicant_profile_history_own_insert on public.applicant_profile_history
  for insert to authenticated with check (auth_id = auth.uid());
drop policy if exists applicant_profile_history_own_update on public.applicant_profile_history;
create policy applicant_profile_history_own_update on public.applicant_profile_history
  for update to authenticated using (auth_id = auth.uid()) with check (auth_id = auth.uid());
drop policy if exists applicant_profile_history_own_delete on public.applicant_profile_history;
create policy applicant_profile_history_own_delete on public.applicant_profile_history
  for delete to authenticated using (auth_id = auth.uid());

revoke all on public.applicant_profile_history from public, anon, authenticated, service_role;
grant select, insert, update, delete on public.applicant_profile_history to authenticated;
grant all on public.applicant_profile_history to service_role;

-- ── 3. applicant_profile_files (owner: select / delete; insert: server only) ───
create table if not exists public.applicant_profile_files (
  id          uuid primary key default gen_random_uuid(),
  auth_id     uuid not null references auth.users(id) on delete cascade,
  kind        text not null check (kind in ('id','paystub','bank_statement','employment_letter','credit_report','reference','other')),
  path        text not null unique,
  name        text,
  size        integer,
  mime        text,
  sha256      text,
  as_of       date,
  uploaded_at timestamptz not null default now(),
  constraint applicant_profile_files_path_len   check (char_length(path) <= 400),
  constraint applicant_profile_files_name_len   check (name is null or char_length(name) <= 160),
  constraint applicant_profile_files_mime_len   check (mime is null or char_length(mime) <= 80),
  constraint applicant_profile_files_sha256_fmt check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  constraint applicant_profile_files_size_range check (size is null or (size >= 0 and size <= 26214400))
);
create index if not exists applicant_profile_files_owner_idx on public.applicant_profile_files (auth_id, kind, uploaded_at desc);
alter table public.applicant_profile_files enable row level security;

drop policy if exists applicant_profile_files_own_select on public.applicant_profile_files;
create policy applicant_profile_files_own_select on public.applicant_profile_files
  for select to authenticated using (auth_id = auth.uid());
drop policy if exists applicant_profile_files_own_delete on public.applicant_profile_files;
create policy applicant_profile_files_own_delete on public.applicant_profile_files
  for delete to authenticated using (auth_id = auth.uid());
-- No INSERT / UPDATE policy on purpose: rows are written by POST /api/profile/files
-- (service role) after the server has stored the bytes and computed their hash.

revoke all on public.applicant_profile_files from public, anon, authenticated, service_role;
grant select, delete on public.applicant_profile_files to authenticated;
grant all on public.applicant_profile_files to service_role;

-- ── 4. Bucket helper + policy (tenant-files · profile/<auth_id>/<kind>/<file>) ──
create or replace function public.profile_file_readable(p_name text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  v_parts text[] := storage.foldername(p_name);
  v_uid uuid := auth.uid();
begin
  if v_uid is null then return false; end if;
  if array_length(v_parts, 1) <> 3 then return false; end if;
  if v_parts[1] <> 'profile' then return false; end if;
  if v_parts[2] <> v_uid::text then return false; end if;
  if v_parts[3] !~ '^[a-z_]{1,32}$' then return false; end if;
  return true;
end $$;
revoke execute on function public.profile_file_readable(text) from public, anon, authenticated, service_role;
grant execute on function public.profile_file_readable(text) to authenticated, service_role;

drop policy if exists tenant_files_profile_select on storage.objects;
create policy tenant_files_profile_select on storage.objects
  for select to authenticated
  using (bucket_id = 'tenant-files' and public.profile_file_readable(name));
-- No insert policy for this prefix: uploads go through the route (service role),
-- deletes too (the route removes the object, then the row).
