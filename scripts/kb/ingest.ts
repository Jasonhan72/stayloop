#!/usr/bin/env -S npx tsx
// Knowledge base · ingest (2026-10-27, design/rag-knowledge-base-plan-2026-10-27.md §3 / §7).
//   ./node_modules/.bin/tsx scripts/kb/ingest.ts [--only=key] [--dry-run] [--no-embed] [--force]
// For every source in scripts/kb/sources.ts: fetch → chunk (lib/kb/chunk.ts) → hash the chunk texts →
// if that version is already stored, only touch fetched_at; else embed (lib/llmEmbed.ts, metered as
// slot 'embed') → insert the document + chunks → mark the source's previous current version superseded.
// Versions are never deleted (point-in-time answers). Credentials: process env, else .env.local.
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { chunkElaws, chunkHtmlGuide, type Chunk } from '../../lib/kb/chunk'
import { embedTexts } from '../../lib/llmEmbed'
import { KB_SOURCES, type KbSource } from './sources'

const args = new Set(process.argv.slice(2))
const only = [...args].find((a) => a.startsWith('--only='))?.slice(7)
const dryRun = args.has('--dry-run')
const noEmbed = args.has('--no-embed')
const force = args.has('--force')

function loadEnv() {
  try {
    for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '').trim()
    }
  } catch { /* CI: env comes from the runner */ }
}
loadEnv()
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing'); process.exit(2) }
const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

const UA = 'StayloopKB/0.1 (+https://www.stayloop.ai; knowledge base refresh)'
async function get(u: string): Promise<string> {
  for (let i = 0; i < 2; i++) {
    try {
      const r = await fetch(u, { headers: { 'user-agent': UA, accept: 'text/html,application/json' }, signal: AbortSignal.timeout(60000) })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return await r.text()
    } catch (e) { if (i === 1) throw e }
  }
  throw new Error('unreachable')
}
const sha = (s: string) => createHash('sha256').update(s).digest('hex')
const MONTHS: Record<string, number> = { january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12 }
function parseLongDate(s: string | null | undefined): string | null {
  const m = (s || '').match(/([A-Z][a-z]+)\s+(\d{1,2}),\s*(\d{4})/)
  if (!m || !MONTHS[m[1].toLowerCase()]) return null
  return `${m[3]}-${String(MONTHS[m[1].toLowerCase()]).padStart(2, '0')}-${String(m[2]).padStart(2, '0')}`
}

type Fetched = { chunks: Chunk[]; title: string; consolidatedDate: string | null; meta: Record<string, unknown> }

async function fetchSource(src: KbSource): Promise<Fetched> {
  if (src.kind === 'elaws') {
    const [type, alias] = src.alias!.split('/')
    const raw = await get(`https://www.ontario.ca/laws/api/v2/legislation/en/doc-search/${type}/${alias}`)
    const d = JSON.parse(raw) as { content: string; title?: string; comments?: { consolidationPeriod?: string; comment?: string; ynote?: string }; updatedAt?: string }
    const chunks = chunkElaws(d.content)
    return {
      chunks, title: src.title,
      consolidatedDate: parseLongDate(d.comments?.consolidationPeriod) || (d.updatedAt ? d.updatedAt.slice(0, 10) : null),
      meta: { lastAmendment: (d.comments?.comment || '').replace(/<[^>]+>/g, '').trim().slice(0, 200), ynote: d.comments?.ynote || null, elawsTitle: d.title || null },
    }
  }
  const html = await get(src.url)
  const chunks = chunkHtmlGuide(html, src.title)
  const updated = html.match(/"UpdatedDate":"(\d{4}-\d{2}-\d{2})"/)?.[1] || parseLongDate(html.match(/Updated:\s*([A-Z][a-z]+\s+\d{1,2},\s*\d{4})/)?.[1]) || null
  const revised = html.match(/Revised[_ ]([A-Z][a-z]+)[_ ]?(\d{1,2})?[_ ,]*(\d{4})/)
  const consolidatedDate = updated || (revised && MONTHS[revised[1].toLowerCase()] ? `${revised[3]}-${String(MONTHS[revised[1].toLowerCase()]).padStart(2, '0')}-${String(revised[2] || 1).padStart(2, '0')}` : null)
  return { chunks, title: src.title, consolidatedDate, meta: {} }
}

async function ensureSource(src: KbSource): Promise<string> {
  const row = { key: src.key, title: src.title, authority_level: src.authority, province: 'ON', lang: 'en', url: src.url, licence: src.licence, refresh_every: `${src.refreshDays} days` }
  const { data, error } = await sb.from('knowledge_sources').upsert(row, { onConflict: 'key' }).select('id').single()
  if (error) throw error
  return data.id as string
}

async function ingest(src: KbSource): Promise<string> {
  const f = await fetchSource(src)
  if (!f.chunks.length) return `${src.key}: no chunks (page structure changed?)`
  const versionHash = sha(f.chunks.map((c) => `${c.sectionRef || ''}|${c.headingPath.join('›')}|${c.text}`).join('\n\x1e'))
  const tokens = f.chunks.reduce((a, c) => a + c.tokens, 0)
  if (dryRun) return `${src.key}: ${f.chunks.length} chunks · ~${tokens} tokens · date ${f.consolidatedDate ?? '—'} · ${versionHash.slice(0, 10)} (dry run)`
  const sourceId = await ensureSource(src)
  const { data: existing } = await sb.from('knowledge_documents').select('id,status').eq('source_id', sourceId).eq('version_hash', versionHash).maybeSingle()
  if (existing && !force) {
    await sb.from('knowledge_documents').update({ fetched_at: new Date().toISOString() }).eq('id', existing.id)
    return `${src.key}: unchanged (${f.chunks.length} chunks, version ${versionHash.slice(0, 10)}, ${existing.status})`
  }
  let vectors: number[][] | null = null
  if (!noEmbed) {
    vectors = []
    const inputs = f.chunks.map((c) => `${f.title} › ${c.headingPath.join(' › ')}${c.sectionRef ? ` · s. ${c.sectionRef}` : ''}\n${c.text}`)
    for (let i = 0; i < inputs.length; i += 100) {
      vectors.push(...(await embedTexts({ texts: inputs.slice(i, i + 100), task: 'document', meta: { source: 'kb/ingest' } })))
    }
  }
  const today = new Date().toISOString().slice(0, 10)
  const { data: doc, error: de } = await sb.from('knowledge_documents').insert({
    source_id: sourceId, version_hash: force && existing ? `${versionHash}-${Date.now().toString(36)}` : versionHash, title: f.title, url: src.url,
    consolidated_date: f.consolidatedDate, effective_from: f.consolidatedDate || today, status: 'current', meta: { ...f.meta, chunks: f.chunks.length, tokens, embed_model: noEmbed ? null : 'gemini-embedding-001' },
  }).select('id').single()
  if (de) throw de
  const rows = f.chunks.map((c, i) => ({
    document_id: doc.id, ord: c.ord, heading_path: c.headingPath, heading_text: c.headingPath.join(' › '), section_ref: c.sectionRef, text: c.text, tokens: c.tokens, in_force: c.inForce,
    embedding: vectors ? `[${vectors[i].map((x) => x.toFixed(6)).join(',')}]` : null, meta: c.anchor ? { anchor: c.anchor } : {},
  }))
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await sb.from('knowledge_chunks').insert(rows.slice(i, i + 200))
    if (error) throw error
  }
  // previous current versions of this source → superseded (never deleted)
  const { error: se } = await sb.from('knowledge_documents').update({ status: 'superseded', superseded_by: doc.id, effective_to: f.consolidatedDate || today }).eq('source_id', sourceId).eq('status', 'current').neq('id', doc.id)
  if (se) throw se
  return `${src.key}: NEW version ${versionHash.slice(0, 10)} · ${f.chunks.length} chunks · ~${tokens} tokens · date ${f.consolidatedDate ?? '—'}${noEmbed ? ' · no embeddings' : ''}`
}

async function main() {
  const list = KB_SOURCES.filter((s) => !only || s.key === only)
  let failed = 0
  for (const src of list) {
    try { console.log(await ingest(src)) } catch (e) { failed++; console.log(`${src.key}: FAILED — ${(e as Error).message}`) }
  }
  console.log(`\n${list.length} sources, ${failed} failed`)
  process.exit(failed ? 1 : 0)
}
main()
