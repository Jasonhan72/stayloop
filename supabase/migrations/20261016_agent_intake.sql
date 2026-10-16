-- V1.0 · 阶段 2 · 丙 #13 / #15 / #16 (2026-10-16): the agent's intake link,
-- TRESA paperwork completeness, and lease-end reminders on the client table.
--
--   #15  agent_clients gains the dates RECO's rules actually turn on:
--        representation agreement EXPIRY (O. Reg. 567/05 s.13.4(1) requires one),
--        the Information Guide delivery record (when + how; Bulletin 2.1 — the
--        onus stays with the agent, Stayloop only records), multiple-representation
--        consent (s.22(1)), and the client's lease end date (#16: 90 / 30-day
--        follow-ups the agent sends themselves — CASL).
--   #13  agent_intake_links: a link the agent hands to an applicant for a landlord
--        client's unit — no listing needed. The applicant uploads their documents
--        and signs the O. Reg. 290/98-scoped authorisation on /intake/<token>;
--        the submission becomes a screening under the AGENT's authId (service
--        role writes it; the insert triggers let service role through). The
--        token is stored in clear like passport_share_tokens / delegations: the
--        row is the agent's own (RLS) and the public page reads via service role.
--        agent_intake_submissions is service-role only — it holds the applicant's
--        name, email and consent record; the agent sees the screening, not this row.
--   Bucket: anonymous upload into tenant-files/agent-intake/<link_id>/<kind>/…
--        only while the link is live (definer helper, same shape as
--        application_upload_allowed); read-back only for the agent who owns the
--        link (screen-score signs URLs with the agent's own client).

-- ── #15 / #16 · client table columns ──────────────────────────────────────────
alter table public.agent_clients add column if not exists representation_agreement_expires_at date;
alter table public.agent_clients add column if not exists info_guide_delivered_at timestamptz;
alter table public.agent_clients add column if not exists info_guide_delivery_note text;
alter table public.agent_clients add column if not exists multi_rep_consent_at date;
alter table public.agent_clients add column if not exists lease_end_date date;
alter table public.agent_clients drop constraint if exists agent_clients_info_guide_delivery_note_len;
alter table public.agent_clients add constraint agent_clients_info_guide_delivery_note_len
  check (info_guide_delivery_note is null or char_length(info_guide_delivery_note) <= 200);

-- ── #13 · intake links (the agent's own rows) ─────────────────────────────────
create table if not exists public.agent_intake_links (
  id            uuid primary key default gen_random_uuid(),
  agent_auth_id uuid not null references auth.users(id) on delete cascade,
  client_id     uuid references public.agent_clients(id) on delete set null,
  token         text not null unique check (token ~ '^[a-f0-9]{64}$'),
  label         text check (label is null or char_length(label) <= 120),
  expires_at    timestamptz not null default (now() + interval '14 days'),
  revoked_at    timestamptz,
  used_count    integer not null default 0,
  created_at    timestamptz not null default now()
);
create index if not exists agent_intake_links_agent_idx on public.agent_intake_links (agent_auth_id, created_at desc);
create index if not exists agent_intake_links_client_idx on public.agent_intake_links (client_id);
alter table public.agent_intake_links enable row level security;
drop policy if exists agent_intake_links_own_select on public.agent_intake_links;
create policy agent_intake_links_own_select on public.agent_intake_links
  for select to authenticated using (agent_auth_id = auth.uid());
drop policy if exists agent_intake_links_own_update on public.agent_intake_links;
create policy agent_intake_links_own_update on public.agent_intake_links
  for update to authenticated using (agent_auth_id = auth.uid()) with check (agent_auth_id = auth.uid());
-- Creation goes through POST /api/agent/intake-links (registration check + token minting
-- happen server side); the agent may only relabel or revoke from the browser.
revoke all on public.agent_intake_links from public, anon, authenticated, service_role;
grant select on public.agent_intake_links to authenticated;
grant update (label, revoked_at) on public.agent_intake_links to authenticated;
grant all on public.agent_intake_links to service_role;

-- ── #13 · submissions (service role only) ─────────────────────────────────────
create table if not exists public.agent_intake_submissions (
  id              uuid primary key default gen_random_uuid(),
  link_id         uuid not null references public.agent_intake_links(id) on delete cascade,
  applicant_name  text not null check (char_length(applicant_name) between 1 and 120),
  applicant_email text not null check (char_length(applicant_email) <= 200),
  move_in_date    date,
  consent_version text not null,
  consent_at      timestamptz not null default now(),
  consent_name    text not null check (char_length(consent_name) between 1 and 120),
  files           jsonb not null default '[]'::jsonb,
  screening_id    uuid references public.screenings(id) on delete set null,
  created_at      timestamptz not null default now()
);
create index if not exists agent_intake_submissions_link_idx on public.agent_intake_submissions (link_id, created_at desc);
alter table public.agent_intake_submissions enable row level security;
-- No policies on purpose: nothing but service role reads or writes this table.
revoke all on public.agent_intake_submissions from public, anon, authenticated, service_role;
grant all on public.agent_intake_submissions to service_role;

-- ── Bucket helpers + policies (tenant-files) ──────────────────────────────────
-- Path shape: agent-intake/<link_id>/<kind>/<file>. The first segment is a fixed word,
-- so application_upload_allowed (uuid first) and the screenings/<uid> policies never match.
create or replace function public.agent_intake_upload_allowed(p_name text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  v_parts text[] := storage.foldername(p_name);
begin
  if array_length(v_parts, 1) <> 3 then return false; end if;
  if v_parts[1] <> 'agent-intake' then return false; end if;
  if v_parts[2] !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return false; end if;
  if v_parts[3] !~ '^[a-z_]{1,32}$' then return false; end if;
  return exists (
    select 1 from public.agent_intake_links l
     where l.id = v_parts[2]::uuid
       and l.revoked_at is null
       and l.expires_at > now()
  );
end $$;
revoke execute on function public.agent_intake_upload_allowed(text) from public, anon, authenticated, service_role;
grant execute on function public.agent_intake_upload_allowed(text) to anon, authenticated, service_role;

create or replace function public.agent_intake_file_readable(p_name text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  v_parts text[] := storage.foldername(p_name);
  v_uid uuid := auth.uid();
begin
  if v_uid is null then return false; end if;
  if array_length(v_parts, 1) <> 3 or v_parts[1] <> 'agent-intake' then return false; end if;
  if v_parts[2] !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return false; end if;
  return exists (
    select 1 from public.agent_intake_links l
     where l.id = v_parts[2]::uuid
       and l.agent_auth_id = v_uid
  );
end $$;
revoke execute on function public.agent_intake_file_readable(text) from public, anon, authenticated, service_role;
grant execute on function public.agent_intake_file_readable(text) to authenticated, service_role;

drop policy if exists tenant_files_agent_intake_insert on storage.objects;
create policy tenant_files_agent_intake_insert on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'tenant-files' and public.agent_intake_upload_allowed(name));

drop policy if exists tenant_files_agent_intake_select on storage.objects;
create policy tenant_files_agent_intake_select on storage.objects
  for select to authenticated
  using (bucket_id = 'tenant-files' and public.agent_intake_file_readable(name));
