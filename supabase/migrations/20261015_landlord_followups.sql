-- V1.0 阶段 1 · 甲 #3 — 筛查后第 3 / 14 天回访邮件（design/v1-scope-and-roadmap-2026-10.md）。
--
-- One row per (landlord, stage) once the e-mail has actually gone out; the
-- cron sweep (lib/landlord/followUp.ts runLandlordFollowUps, called from
-- /api/agent/proactive cron mode) reads it to stay idempotent. Service role
-- only: nothing in the app ever shows this table to a person, and the sweep
-- is the sole writer. Revokes are written `from public, anon, authenticated`
-- (CLAUDE.md 2026-09-25: a bare `revoke … from anon` is a no-op while the
-- ACL still carries PUBLIC).

create table if not exists public.landlord_followups (
  id               uuid primary key default gen_random_uuid(),
  landlord_auth_id uuid not null,
  screening_id     uuid,
  stage            text not null check (stage in ('d3', 'd14')),
  sent_at          timestamptz not null default now(),
  unique (landlord_auth_id, stage)
);

comment on table public.landlord_followups is
  'Post-screening follow-up e-mails (d3 / d14) already sent per landlord. Written only by the proactive cron with the service role.';

create index if not exists idx_landlord_followups_landlord on public.landlord_followups (landlord_auth_id);

alter table public.landlord_followups enable row level security;

-- No policies on purpose: with RLS on and no policy, the API roles get
-- nothing even if a grant were to reappear. Belt and braces below.
revoke all on table public.landlord_followups from public, anon, authenticated;
grant select, insert, update, delete on table public.landlord_followups to service_role;
