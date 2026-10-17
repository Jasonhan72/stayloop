-- V0.8 · 消费者索取档案 · 争议更正 · 身份警示 (2026-10-17, G19 data layer) — contract:
-- design/consumer-file-access-contract-2026-10.md; plan: design/consumer-file-access-plan-2026-10.md.
--
-- Consumer Reporting Act (R.S.O. 1990, c. C.33): s.12 (the applicant may ask for
-- their file, free, within 2 business days electronically), s.12.1–12.3 (identity
-- alert), s.13 (dispute → correct / supplement / delete / maintain, and notify
-- anyone who received the report in the last 60 days), s.11(3) (confirm the
-- landlord gave written notice before the report is supplied).
--
-- Five new tables. Everyone but the service role is locked out (the applicant has
-- no account — every applicant-side route is anonymous + token, written server
-- side), with two exceptions spelled out below:
--   consumer_requests      one row per "show me my file" request; the token is the
--                          credential (64 hex, 24 h) and only ever travels in the
--                          confirmation email.
--   consumer_disputes      one row per item the applicant says is wrong.
--   screening_corrections  APPEND-ONLY outcome log attached to a screening; anyone
--                          who can read the screening (its RLS) may read the
--                          corrections — the report / done pages show "N corrections".
--   consumer_alerts        identity alert the applicant asked to put on their file
--                          (6 years, s.12.2); every later disclosure carries it.
--   passport_share_views   APPEND-ONLY, one row per open of /p/<token> (s.12(3):
--                          "who looked at the file in the last 3 years"); the
--                          counter on passport_share_tokens stays as the cheap total.
-- screenings gains notice_confirmed_at / notice_confirmed_how (s.11(3)) — the
-- landlord ticks it on the screening page (direct client write allowed).

-- ── 0. helpers ────────────────────────────────────────────────────────────────
create or replace function public.consumer_requests_touch_updated_at()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end $$;
revoke execute on function public.consumer_requests_touch_updated_at() from public, anon, authenticated, service_role;

-- Append-only for every role, service role included (the correction log and the
-- view log are evidence; the database owner is the only one who could touch them).
create or replace function public.consumer_append_only()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  raise exception 'append_only';
end $$;
revoke execute on function public.consumer_append_only() from public, anon, authenticated, service_role;

-- ── 1. consumer_requests ──────────────────────────────────────────────────────
create table if not exists public.consumer_requests (
  id                      uuid primary key default gen_random_uuid(),
  email                   text not null check (email = lower(email) and char_length(email) between 3 and 200),
  token                   text not null unique check (token ~ '^[a-f0-9]{64}$'),
  token_expires_at        timestamptz not null default (now() + interval '24 hours'),
  email_verified_at       timestamptz,
  name                    text check (name is null or char_length(name) <= 200),
  date_of_birth           date,
  delivery                text not null default 'electronic' check (delivery in ('electronic', 'mail', 'phone')),
  mail_address            text check (mail_address is null or char_length(mail_address) <= 400),
  phone                   text check (phone is null or char_length(phone) <= 60),
  status                  text not null default 'pending_verification' check (status in ('pending_verification', 'matched', 'needs_review', 'fulfilled', 'closed')),
  matched_screening_ids   uuid[] not null default '{}',
  candidate_screening_ids uuid[] not null default '{}',
  due_at                  timestamptz,
  fulfilled_at            timestamptz,
  closed_at               timestamptz,
  admin_note              text check (admin_note is null or char_length(admin_note) <= 2000),
  handled_by              uuid,
  ip_hash                 text check (ip_hash is null or char_length(ip_hash) <= 64),
  lang                    text not null default 'zh' check (lang in ('zh', 'en')),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);
create index if not exists consumer_requests_email_idx on public.consumer_requests (email, created_at desc);
create index if not exists consumer_requests_status_idx on public.consumer_requests (status, due_at);
alter table public.consumer_requests enable row level security;
drop trigger if exists trg_consumer_requests_touch on public.consumer_requests;
create trigger trg_consumer_requests_touch before update on public.consumer_requests
  for each row execute function public.consumer_requests_touch_updated_at();
-- No policies on purpose: the applicant has no account; every read / write is the server's (token checked in the route).
revoke all on public.consumer_requests from public, anon, authenticated, service_role;
grant all on public.consumer_requests to service_role;

-- ── 2. consumer_disputes ──────────────────────────────────────────────────────
create table if not exists public.consumer_disputes (
  id              uuid primary key default gen_random_uuid(),
  request_id      uuid not null references public.consumer_requests(id) on delete cascade,
  -- set null, not cascade: a landlord deleting the screening (their PII clean-up path)
  -- must not erase the record that a dispute was filed and how it was resolved.
  screening_id    uuid references public.screenings(id) on delete set null,
  item_kind       text not null check (item_kind in ('fact', 'public_record', 'forensic_flag', 'credit', 'verification', 'other')),
  item_ref        text check (item_ref is null or char_length(item_ref) <= 200),
  item_label      text check (item_label is null or char_length(item_label) <= 300),
  statement       text not null check (char_length(statement) between 1 and 2000),
  evidence_path   text check (evidence_path is null or char_length(evidence_path) <= 400),
  status          text not null default 'open' check (status in ('open', 'corrected', 'supplemented', 'deleted', 'maintained')),
  resolution_note text check (resolution_note is null or char_length(resolution_note) <= 2000),
  resolved_by     uuid,
  resolved_at     timestamptz,
  notified_at     timestamptz,
  notified_to     jsonb not null default '[]'::jsonb,
  created_at      timestamptz not null default now()
);
create index if not exists consumer_disputes_request_idx on public.consumer_disputes (request_id, created_at desc);
create index if not exists consumer_disputes_status_idx on public.consumer_disputes (status, created_at);
create index if not exists consumer_disputes_screening_idx on public.consumer_disputes (screening_id);
alter table public.consumer_disputes enable row level security;
revoke all on public.consumer_disputes from public, anon, authenticated, service_role;
grant all on public.consumer_disputes to service_role;

-- ── 3. screening_corrections (append-only; readable by whoever can read the screening) ──
create table if not exists public.screening_corrections (
  id           uuid primary key default gen_random_uuid(),
  screening_id uuid not null references public.screenings(id) on delete cascade,
  dispute_id   uuid references public.consumer_disputes(id) on delete set null,
  item_kind    text check (item_kind is null or item_kind in ('fact', 'public_record', 'forensic_flag', 'credit', 'verification', 'other')),
  item_ref     text check (item_ref is null or char_length(item_ref) <= 200),
  item_label   text check (item_label is null or char_length(item_label) <= 300),
  action       text not null check (action in ('corrected', 'supplemented', 'deleted', 'maintained')),
  note         text check (note is null or char_length(note) <= 2000),
  created_by   uuid,
  created_at   timestamptz not null default now()
);
create index if not exists screening_corrections_screening_idx on public.screening_corrections (screening_id, created_at desc);
alter table public.screening_corrections enable row level security;
drop trigger if exists trg_screening_corrections_append_only on public.screening_corrections;
create trigger trg_screening_corrections_append_only before update or delete on public.screening_corrections
  for each row execute function public.consumer_append_only();
drop policy if exists screening_corrections_read_via_screening on public.screening_corrections;
create policy screening_corrections_read_via_screening on public.screening_corrections
  for select to authenticated
  using (exists (select 1 from public.screenings s where s.id = screening_id));
revoke all on public.screening_corrections from public, anon, authenticated, service_role;
grant select on public.screening_corrections to authenticated;
grant all on public.screening_corrections to service_role;

-- ── 4. consumer_alerts ────────────────────────────────────────────────────────
create table if not exists public.consumer_alerts (
  id         uuid primary key default gen_random_uuid(),
  email      text not null check (email = lower(email) and char_length(email) between 3 and 200),
  name       text check (name is null or char_length(name) <= 200),
  statement  text not null check (char_length(statement) between 1 and 500),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '6 years'),
  revoked_at timestamptz,
  request_id uuid references public.consumer_requests(id) on delete set null
);
create index if not exists consumer_alerts_email_live_idx on public.consumer_alerts (email, created_at desc) where revoked_at is null;
alter table public.consumer_alerts enable row level security;
revoke all on public.consumer_alerts from public, anon, authenticated, service_role;
grant all on public.consumer_alerts to service_role;

-- ── 5. passport_share_views (append-only, service role writes) ────────────────
create table if not exists public.passport_share_views (
  id         uuid primary key default gen_random_uuid(),
  token      text not null references public.passport_share_tokens(token) on delete cascade,
  viewed_at  timestamptz not null default now(),
  ip_hash    text check (ip_hash is null or char_length(ip_hash) <= 64),
  user_agent text check (user_agent is null or char_length(user_agent) <= 200)
);
create index if not exists passport_share_views_token_idx on public.passport_share_views (token, viewed_at desc);
alter table public.passport_share_views enable row level security;
drop trigger if exists trg_passport_share_views_append_only on public.passport_share_views;
create trigger trg_passport_share_views_append_only before update or delete on public.passport_share_views
  for each row execute function public.consumer_append_only();
revoke all on public.passport_share_views from public, anon, authenticated, service_role;
grant all on public.passport_share_views to service_role;

-- ── 6. screenings · s.11(3) notice confirmation ───────────────────────────────
alter table public.screenings add column if not exists notice_confirmed_at timestamptz;
alter table public.screenings add column if not exists notice_confirmed_how text;
alter table public.screenings drop constraint if exists screenings_notice_confirmed_how_chk;
alter table public.screenings add constraint screenings_notice_confirmed_how_chk
  check (notice_confirmed_how is null or notice_confirmed_how in ('application_consent', 'intake_consent', 'landlord_attested', 'partner_attested'));
