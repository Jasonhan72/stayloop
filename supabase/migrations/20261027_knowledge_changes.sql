-- Knowledge base · change queue (design/rag-knowledge-base-plan-2026-10-27.md §7.3, 2026-10-27).
-- Applied to prod via Supabase MCP (knowledge_changes).
-- One row per detected source change (the ingest found a new version and superseded the old one):
-- which sections were added / removed / changed, which rules in lib/ontario/rules.ts cite them, and
-- the human review state. The rules table itself is never edited by a machine; while a change is
-- pending, the affected rules carry a「待核对」notice (assistant prompt + /rules page).
create table if not exists public.knowledge_changes (
  id                uuid primary key default gen_random_uuid(),
  source_key        text not null,
  source_title      text not null,
  old_document_id   uuid references public.knowledge_documents(id) on delete set null,
  new_document_id   uuid references public.knowledge_documents(id) on delete set null,
  old_date          date,
  new_date          date,
  detected_at       timestamptz not null default now(),
  sections_added    text[] not null default '{}',
  sections_removed  text[] not null default '{}',
  sections_changed  text[] not null default '{}',
  affected_rule_ids text[] not null default '{}',
  status            text not null default 'pending' check (status in ('pending','reviewed','no_impact','rule_updated')),
  note              text,
  reviewed_by       uuid,
  reviewed_at       timestamptz,
  meta              jsonb not null default '{}'::jsonb
);
create index if not exists knowledge_changes_status_idx on public.knowledge_changes (status, detected_at desc);

alter table public.knowledge_changes enable row level security;
revoke all on public.knowledge_changes from public, anon, authenticated;
-- admins read the queue and set the review state; the ingest (service role) inserts.
grant select on public.knowledge_changes to authenticated;
grant update (status, note, reviewed_by, reviewed_at) on public.knowledge_changes to authenticated;
drop policy if exists "Admins read knowledge_changes" on public.knowledge_changes;
create policy "Admins read knowledge_changes" on public.knowledge_changes
  for select to authenticated using (public.is_stayloop_admin());
drop policy if exists "Admins review knowledge_changes" on public.knowledge_changes;
create policy "Admins review knowledge_changes" on public.knowledge_changes
  for update to authenticated using (public.is_stayloop_admin()) with check (public.is_stayloop_admin());

-- The public /rules page and the assistant show「待核对」on rules whose statute changed and nobody has
-- reviewed yet. Only the rule id, source and dates leave the table (public law, no person data).
create or replace function public.kb_pending_rule_notices()
returns table (rule_id text, source_key text, source_title text, new_date date, detected_at timestamptz)
language sql stable security definer
set search_path = public
as $$
  select distinct on (r.rule_id, c.source_key) r.rule_id, c.source_key, c.source_title, c.new_date, c.detected_at
  from public.knowledge_changes c, unnest(c.affected_rule_ids) as r(rule_id)
  where c.status = 'pending'
  order by r.rule_id, c.source_key, c.detected_at desc;
$$;
revoke execute on function public.kb_pending_rule_notices() from public;
grant execute on function public.kb_pending_rule_notices() to anon, authenticated, service_role;

-- Source freshness for the admin page: current version per source + whether fetched_at is past refresh_every.
create or replace function public.kb_source_status()
returns table (key text, title text, authority_level smallint, url text, refresh_every interval, document_id uuid,
               consolidated_date date, fetched_at timestamptz, version_hash text, chunks bigint, stale boolean)
language sql stable security definer
set search_path = public
as $$
  select s.key, s.title, s.authority_level, s.url, s.refresh_every, d.id, d.consolidated_date, d.fetched_at, d.version_hash,
         (select count(*) from public.knowledge_chunks c where c.document_id = d.id) as chunks,
         (d.fetched_at is null or d.fetched_at < now() - s.refresh_every - interval '2 days') as stale
  from public.knowledge_sources s
  left join public.knowledge_documents d on d.source_id = s.id and d.status = 'current'
  order by s.authority_level, s.key;
$$;
revoke execute on function public.kb_source_status() from public, anon;
grant execute on function public.kb_source_status() to authenticated, service_role;
-- authenticated may call it only through the admin API route, which checks is_stayloop_admin() first;
-- the function itself exposes nothing but source names, dates and counts.
