-- kb_search(): the full-text half ORs the query terms (websearch_to_tsquery ANDs them, so a 6-word topic
-- query matched almost nothing and the hybrid was vector-only in practice — eval 2026-10-27, 71 % hit@5).
-- Applied to prod via Supabase MCP (knowledge_base_fts_or). Same signature and return shape as
-- 20261027_knowledge_base_meta.sql; only the `q` and `fts` CTEs differ.
create or replace function public.kb_search(
  query_embedding extensions.halfvec(1024),
  query_text text,
  p_province text default 'ON',
  p_k integer default 6,
  p_as_of date default null
) returns table (
  chunk_id uuid, document_id uuid, source_key text, source_title text, authority_level smallint,
  title text, url text, section_ref text, heading_path text[], body text, in_force boolean,
  consolidated_date date, meta jsonb, score double precision
)
language sql stable security definer
set search_path = public, extensions
as $$
  with scope as (
    select c.id, c.document_id, c.section_ref, c.heading_path, c.text as body, c.in_force, c.embedding, c.tsv, c.meta,
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
  q as (
    -- 'rent' & 'increas' & 'guidelin'  →  'rent' | 'increas' | 'guidelin'
    select case when coalesce(query_text, '') = '' or plainto_tsquery('english', query_text)::text = ''
                then null
                else replace(plainto_tsquery('english', query_text)::text, ' & ', ' | ')::tsquery end as tq
  ),
  vec as (
    select id, row_number() over (order by embedding <=> query_embedding) as r
    from scope where embedding is not null and query_embedding is not null
    order by embedding <=> query_embedding limit 20
  ),
  fts as (
    select sc.id, row_number() over (order by ts_rank_cd(sc.tsv, q.tq, 32) desc) as r
    from scope sc, q
    where q.tq is not null and sc.tsv @@ q.tq
    order by ts_rank_cd(sc.tsv, q.tq, 32) desc limit 20
  ),
  fused as (
    select coalesce(v.id, f.id) as id,
           coalesce(1.0 / (60 + v.r), 0) + coalesce(1.0 / (60 + f.r), 0) as rrf
    from vec v full outer join fts f on f.id = v.id
  )
  select sc.id, sc.document_id, sc.source_key, sc.source_title, sc.authority_level, sc.title, sc.url,
         sc.section_ref, sc.heading_path, sc.body, sc.in_force, sc.consolidated_date, sc.meta,
         (fu.rrf + case sc.authority_level when 1 then 0.004 when 2 then 0.003 when 3 then 0.002 else 0 end)::double precision as score
  from fused fu join scope sc on sc.id = fu.id
  order by score desc
  limit greatest(1, least(coalesce(p_k, 6), 12));
$$;
revoke execute on function public.kb_search(extensions.halfvec, text, text, integer, date) from public, anon, authenticated;
grant execute on function public.kb_search(extensions.halfvec, text, text, integer, date) to service_role;
