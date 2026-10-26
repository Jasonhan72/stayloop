// Knowledge base · retrieval (SERVER-ONLY): embed the query, call kb_search() (hybrid vector + full-text,
// service role), return the passages. Never throws into the turn — a failed lookup is an empty list.
import { createClient } from '@supabase/supabase-js'
import { embedTexts, vectorLiteral } from '@/lib/llmEmbed'
import { kbEmbedText, kbQueryText } from './trigger'
import type { KbConfig } from './config'

export type KbHit = {
  chunk_id: string
  document_id: string
  source_key: string
  source_title: string
  authority_level: number
  title: string
  url: string
  section_ref: string | null
  heading_path: string[]
  body: string
  in_force: boolean
  consolidated_date: string | null
  meta: { anchor?: string } | null
  score: number
}

export type KbSearchResult = { hits: KbHit[]; ms: number; error?: string }

export async function kbSearch(message: string, cfg: KbConfig, opts: { province?: string | null; asOf?: string | null; userId?: string | null; signal?: AbortSignal } = {}): Promise<KbSearchResult> {
  const t0 = Date.now()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return { hits: [], ms: 0, error: 'no service role' }
  try {
    const [vec] = await embedTexts({ texts: [kbEmbedText(message)], task: 'query', model: cfg.embedModel, dims: cfg.dims, signal: opts.signal, meta: { userId: opts.userId ?? null, source: 'agent/turn-kb' } })
    const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
    const { data, error } = await sb.rpc('kb_search', {
      query_embedding: vectorLiteral(vec),
      query_text: kbQueryText(message),
      p_province: (opts.province || 'ON').toUpperCase(),
      p_k: cfg.topK,
      p_as_of: opts.asOf || null,
    })
    if (error) throw error
    const hits = ((data || []) as KbHit[]).map((h) => ({ ...h, url: h.meta?.anchor ? `${h.url}#${h.meta.anchor}` : h.url }))
    return { hits, ms: Date.now() - t0 }
  } catch (e) {
    console.warn('[kb] search failed', (e as Error)?.message)
    return { hits: [], ms: Date.now() - t0, error: (e as Error)?.message }
  }
}
