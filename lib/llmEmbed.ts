// -----------------------------------------------------------------------------
// Text embeddings (SERVER-ONLY) — 2026-10-27, knowledge base (design/rag-knowledge-base-plan-2026-10-27.md).
//
// One entry point, embedTexts(), for the ingest script (documents) and the turn route (queries).
// The model is a setting (app_config.kb.embed_model), not a chat-slot: embeddings are not in the
// chat catalogue. Three providers, all already keyed in .env.local:
//   • gemini-embedding-001       Google native batchEmbedContents (task type + outputDimensionality)
//   • text-embedding-3-large/small OpenAI /v1/embeddings (dimensions)
//   • jina-embeddings-v3          Jina /v1/embeddings (task + dimensions)
// Every call is metered to ai_usage with slot 'embed' (tokens from the provider when it reports
// them, else ~chars/4). A missing key throws LlmKeyMissingError like llmChat does.
// Picked 2026-10-27 on one bilingual probe (zh question vs en statute line, cosine): Gemini 0.72,
// Jina 0.63, OpenAI 3-large 0.55 — Gemini is the default; the golden-set eval is the real test.
// -----------------------------------------------------------------------------
import { recordUsage } from './llmUsage'

export class LlmKeyMissingError extends Error {
  constructor(env: string) { super(`${env} is not configured`); this.name = 'LlmKeyMissingError' }
}

export type EmbedTask = 'query' | 'document'

export type EmbedModel = {
  id: string
  provider: 'gemini' | 'openai' | 'jina'
  apiKeyEnv: string
  /** USD per 1M input tokens (official list price; cost only, never gates a call). */
  pricePerM: number
  maxBatch: number
}

export const EMBED_MODELS: Record<string, EmbedModel> = {
  'gemini-embedding-001': { id: 'gemini-embedding-001', provider: 'gemini', apiKeyEnv: 'GEMINI_API_KEY', pricePerM: 0.15, maxBatch: 100 },
  'text-embedding-3-large': { id: 'text-embedding-3-large', provider: 'openai', apiKeyEnv: 'OPENAI_API_KEY', pricePerM: 0.13, maxBatch: 256 },
  'text-embedding-3-small': { id: 'text-embedding-3-small', provider: 'openai', apiKeyEnv: 'OPENAI_API_KEY', pricePerM: 0.02, maxBatch: 256 },
  'jina-embeddings-v3': { id: 'jina-embeddings-v3', provider: 'jina', apiKeyEnv: 'JINA_API_KEY', pricePerM: 0.02, maxBatch: 256 },
}
export const DEFAULT_EMBED_MODEL = 'gemini-embedding-001'
export const EMBED_DIMS = 1024

export function embedModelDef(id: string | null | undefined): EmbedModel {
  return EMBED_MODELS[id || ''] || EMBED_MODELS[DEFAULT_EMBED_MODEL]
}

export type EmbedParams = {
  texts: string[]
  task: EmbedTask
  model?: string
  dims?: number
  signal?: AbortSignal
  meta?: { userId?: string | null; source?: string }
}

/** Embed up to maxBatch texts per request (callers batch beyond that). Returns one vector per input, in order. */
export async function embedTexts(p: EmbedParams): Promise<number[][]> {
  const def = embedModelDef(p.model)
  const dims = p.dims || EMBED_DIMS
  const apiKey = (process.env[def.apiKeyEnv] || '').trim()
  if (!apiKey) throw new LlmKeyMissingError(def.apiKeyEnv)
  if (!p.texts.length) return []
  const t0 = Date.now()
  const approx = p.texts.reduce((a, t) => a + Math.ceil(t.length / 4), 0)
  const record = (tokens: number, ok: boolean, error?: string) =>
    recordUsage({
      model: { id: def.id, provider: def.provider, pricing: { input: def.pricePerM, output: 0 } },
      usage: { input: tokens, output: 0, cacheRead: 0, cacheWrite: 0 },
      latencyMs: Date.now() - t0, ok, error: error || null,
      meta: { userId: p.meta?.userId ?? null, slot: 'embed', source: p.meta?.source || 'kb' },
    })
  try {
    const out: number[][] = []
    for (let i = 0; i < p.texts.length; i += def.maxBatch) {
      const batch = p.texts.slice(i, i + def.maxBatch)
      const r = def.provider === 'gemini' ? await geminiEmbed(def, apiKey, batch, p.task, dims, p.signal) : await openaiCompatEmbed(def, apiKey, batch, p.task, dims, p.signal)
      out.push(...r.vectors)
      await record(r.tokens ?? batch.reduce((a, t) => a + Math.ceil(t.length / 4), 0), true)
    }
    for (const v of out) if (v.length !== dims) throw new Error(`embedding dims ${v.length} ≠ ${dims} (${def.id})`)
    return out
  } catch (e) {
    await record(approx, false, (e as Error)?.message)
    throw e
  }
}

async function geminiEmbed(def: EmbedModel, apiKey: string, texts: string[], task: EmbedTask, dims: number, signal?: AbortSignal): Promise<{ vectors: number[][]; tokens?: number }> {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${def.id}:batchEmbedContents`, {
    method: 'POST', signal,
    headers: { 'x-goog-api-key': apiKey, 'content-type': 'application/json' },
    body: JSON.stringify({
      requests: texts.map((text) => ({ model: `models/${def.id}`, content: { parts: [{ text }] }, taskType: task === 'query' ? 'RETRIEVAL_QUERY' : 'RETRIEVAL_DOCUMENT', outputDimensionality: dims })),
    }),
  })
  if (!res.ok) throw new Error(`gemini embeddings ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const data = (await res.json()) as { embeddings?: { values: number[] }[] }
  const vectors = (data.embeddings || []).map((e) => e.values)
  if (vectors.length !== texts.length) throw new Error(`gemini embeddings returned ${vectors.length} of ${texts.length}`)
  return { vectors }
}

async function openaiCompatEmbed(def: EmbedModel, apiKey: string, texts: string[], task: EmbedTask, dims: number, signal?: AbortSignal): Promise<{ vectors: number[][]; tokens?: number }> {
  const url = def.provider === 'jina' ? 'https://api.jina.ai/v1/embeddings' : 'https://api.openai.com/v1/embeddings'
  const body: Record<string, unknown> = { model: def.id, input: texts, dimensions: dims }
  if (def.provider === 'jina') body.task = task === 'query' ? 'retrieval.query' : 'retrieval.passage'
  const res = await fetch(url, { method: 'POST', signal, headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' }, body: JSON.stringify(body) })
  if (!res.ok) throw new Error(`${def.provider} embeddings ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const data = (await res.json()) as { data?: { index: number; embedding: number[] }[]; usage?: { total_tokens?: number; prompt_tokens?: number } }
  const vectors = (data.data || []).sort((a, b) => a.index - b.index).map((d) => d.embedding)
  if (vectors.length !== texts.length) throw new Error(`${def.provider} embeddings returned ${vectors.length} of ${texts.length}`)
  return { vectors, tokens: data.usage?.prompt_tokens ?? data.usage?.total_tokens }
}

/** pgvector text literal for an RPC parameter: "[0.1,0.2,…]". */
export function vectorLiteral(v: number[]): string {
  return `[${v.map((x) => (Number.isFinite(x) ? x.toFixed(6) : '0')).join(',')}]`
}
