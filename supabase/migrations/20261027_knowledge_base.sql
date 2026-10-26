-- Knowledge base for the assistant (RAG) — 2026-10-27, design/rag-knowledge-base-plan-2026-10-27.md §3.
-- Applied to prod via Supabase MCP (knowledge_base). Three append-only tables (sources / document
-- versions / chunks) written only by scripts/kb/ingest.ts (service role) and read only through
-- kb_search() from the turn route (service role). No client access at all.
create extension if not exists vector with schema extensions;

create table if not exists public.knowledge_sources (
  id              uuid primary key default gen_random_uuid(),
  key             text not null unique,
  title           text not null,
  -- 1 statute · 2 regulation · 3 official guide / tribunal rules · 4 municipal · 5 secondary
  authority_level smallint not null check (authority_level between 1 and 5),
  province        text not null default 'ON',
  lang            text not null default 'en',
  url             text not null,
  licence         text,
  refresh_every   interval not null default interval '30 days',
  created_at      timestamptz not null default now()
);

create table if not exists public.knowledge_documents (
  id                uuid primary key default gen_random_uuid(),
  source_id         uuid not null references public.knowledge_sources(id) on delete cascade,
  version_hash      text not null,
  title             text not null,
  url               text not null,
  consolidated_date date,
  effective_from    date,
  effective_to      date,
  status            text not null default 'current' check (status in ('current','superseded')),
  superseded_by     uuid references public.knowledge_documents(id),
  fetched_at        timestamptz not null default now(),
  meta              jsonb not null default '{}'::jsonb,
  unique (source_id, version_hash)
);
create index if not exists knowledge_documents_source_status_idx on public.knowledge_documents (source_id, status);

create table if not exists public.knowledge_chunks (
  id           uuid primary key default gen_random_uuid(),
  document_id  uuid not null references public.knowledge_documents(id) on delete cascade,
  ord          integer not null,
  heading_path text[] not null default '{}',
  -- heading_path joined by the ingest (array_to_string is not immutable, so it cannot sit in the generated column)
  heading_text text not null default '',
  section_ref  text,
  text         text not null,
  tokens       integer not null default 0,
  in_force     boolean not null default true,
  embedding    extensions.halfvec(1024),
  tsv          tsvector generated always as (
                 to_tsvector('english'::regconfig, coalesce(section_ref, '') || ' ' || heading_text || ' ' || text)
               ) stored,
  meta         jsonb not null default '{}'::jsonb,
  unique (document_id, ord)
);
create index if not exists knowledge_chunks_embedding_idx on public.knowledge_chunks using hnsw (embedding extensions.halfvec_cosine_ops) with (m = 16, ef_construction = 64);
create index if not exists knowledge_chunks_tsv_idx on public.knowledge_chunks using gin (tsv);

alter table public.knowledge_sources enable row level security;
alter table public.knowledge_documents enable row level security;
alter table public.knowledge_chunks enable row level security;
revoke all on public.knowledge_sources from public, anon, authenticated;
revoke all on public.knowledge_documents from public, anon, authenticated;
revoke all on public.knowledge_chunks from public, anon, authenticated;
-- no policies: service role only (ingest script + turn route).

-- Hybrid retrieval: vector top-20 ∪ full-text top-20, fused by reciprocal rank (k = 60), a small
-- authority nudge (statute > regulation > guide), current versions only unless p_as_of names a date.
-- (The returned columns were extended with `meta` in 20261027_knowledge_base_meta.sql.)
create or replace function public.kb_search(
  query_embedding extensions.halfvec(1024),
  query_text text,
  p_province text default 'ON',
  p_k integer default 6,
  p_as_of date default null
) returns table (
  chunk_id uuid, document_id uuid, source_key text, source_title text, authority_level smallint,
  title text, url text, section_ref text, heading_path text[], body text, in_force boolean,
  consolidated_date date, score double precision
)
language sql stable security definer
set search_path = public, extensions
as $$
  with scope as (
    select c.id, c.document_id, c.section_ref, c.heading_path, c.text as body, c.in_force, c.embedding, c.tsv,
           d.title, d.url, d.consolidated_date, s.key as source_key, s.title as source_title, s.authority_level
    from public.knowledge_chunks c
    join public.knowledge_documents d on d.id = c.document_id
    join public.knowledge_sources s on s.id = d.source_id
    where s.province = p_province
      and ((p_as_of is null and d.status = 'current')
        or (p_as_of is not null
            and coalesce(d.effective_from, date '1900-01-01') <= p_as_of
            and (d.effective_to is null or d.effective_to > p_as_of)))
  ),
  vec as (
    select id, row_number() over (order by embedding <=> query_embedding) as r
    from scope where embedding is not null and query_embedding is not null
    order by embedding <=> query_embedding limit 20
  ),
  fts as (
    select id, row_number() over (order by ts_rank_cd(tsv, q) desc) as r
    from scope, websearch_to_tsquery('english', coalesce(query_text, '')) q
    where coalesce(query_text, '') <> '' and tsv @@ q
    order by ts_rank_cd(tsv, q) desc limit 20
  ),
  fused as (
    select coalesce(v.id, f.id) as id,
           coalesce(1.0 / (60 + v.r), 0) + coalesce(1.0 / (60 + f.r), 0) as rrf
    from vec v full outer join fts f on f.id = v.id
  )
  select sc.id, sc.document_id, sc.source_key, sc.source_title, sc.authority_level, sc.title, sc.url,
         sc.section_ref, sc.heading_path, sc.body, sc.in_force, sc.consolidated_date,
         (fu.rrf + case sc.authority_level when 1 then 0.004 when 2 then 0.003 when 3 then 0.002 else 0 end)::double precision as score
  from fused fu join scope sc on sc.id = fu.id
  order by score desc
  limit greatest(1, least(coalesce(p_k, 6), 12));
$$;
revoke execute on function public.kb_search(extensions.halfvec, text, text, integer, date) from public, anon, authenticated;
grant execute on function public.kb_search(extensions.halfvec, text, text, integer, date) to service_role;

-- Feature switch + retrieval settings (read by lib/kb/config.ts with a 60 s cache).
-- audience: 'test' = only allow_user_ids; 'all' = every signed-in user and the anonymous preview.
insert into public.app_config (key, value)
values ('kb', '{"enabled": true, "audience": "test", "allow_user_ids": [], "embed_model": "gemini-embedding-001", "dims": 1024, "top_k": 6, "max_chars": 6000}'::jsonb)
on conflict (key) do nothing;
