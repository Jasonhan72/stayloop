// -----------------------------------------------------------------------------
// AI usage metering (SERVER-ONLY) — 2026-08-23
//
// Every model call made through lib/llmChat.ts (and the Qwen OCR layer) ends
// with recordUsage(): who / which screening / which slot / which model /
// tokens / USD cost (from the catalogue price list at call time) / latency.
// Rows land in public.ai_usage via the service-role client; /admin/usage
// reads the admin_ai_usage_stats() aggregate.
//
// Never throws, never blocks the product: a metering failure is logged and
// swallowed. Cost is null when the model has no price configured — the
// dashboard counts those so admins know what to fill in.
// -----------------------------------------------------------------------------
import { createClient } from '@supabase/supabase-js'
import type { ModelDef } from './modelConfig'

export interface ModelPricing {
  /** USD per 1M input tokens (cache miss) */
  input: number
  /** USD per 1M output tokens */
  output: number
  /** USD per 1M cached input tokens read (defaults: 10 % of input) */
  cacheRead?: number
  /** USD per 1M cache-write tokens (Anthropic: 125 % of input; others: = input) */
  cacheWrite?: number
}

export interface UsageTokens {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
}

export interface LlmUsageMeta {
  userId?: string | null
  screeningId?: string | null
  /** turn | screening | coherence | classify | forensics | ocr | test | other */
  slot?: string
  /** route / module name, e.g. 'screen-score', 'agent/turn' */
  source?: string
}

/** USD cost for a call; null when no price is configured. Pure — tested. */
export function computeCostUsd(pricing: ModelPricing | undefined | null, u: UsageTokens): number | null {
  if (!pricing || !(pricing.input >= 0) || !(pricing.output >= 0)) return null
  const cacheRead = pricing.cacheRead ?? pricing.input * 0.1
  const cacheWrite = pricing.cacheWrite ?? pricing.input
  const cost = (u.input * pricing.input + u.output * pricing.output + u.cacheRead * cacheRead + u.cacheWrite * cacheWrite) / 1_000_000
  return Math.round(cost * 1_000_000) / 1_000_000
}

/**
 * Normalise a provider usage object. Anthropic: input_tokens excludes cached
 * tokens (cache_read_input_tokens / cache_creation_input_tokens are separate).
 * OpenAI-compatible: prompt_tokens INCLUDES cached tokens
 * (prompt_tokens_details.cached_tokens) — subtract so the split is consistent.
 * Pure — tested.
 */
export function normalizeUsage(provider: 'anthropic' | 'openai-compat' | string, raw: unknown): UsageTokens {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.round(v) : 0)
  if (provider === 'anthropic') {
    return { input: n(r.input_tokens), output: n(r.output_tokens), cacheRead: n(r.cache_read_input_tokens), cacheWrite: n(r.cache_creation_input_tokens) }
  }
  const details = (r.prompt_tokens_details && typeof r.prompt_tokens_details === 'object' ? r.prompt_tokens_details : {}) as Record<string, unknown>
  const cached = n(details.cached_tokens) || n(r.prompt_cache_hit_tokens) // DeepSeek uses prompt_cache_hit_tokens
  const prompt = n(r.prompt_tokens)
  return { input: Math.max(0, prompt - cached), output: n(r.completion_tokens), cacheRead: cached, cacheWrite: 0 }
}

export interface UsageRecord {
  model: ModelDef | { id: string; provider: string; pricing?: ModelPricing }
  usage: UsageTokens
  latencyMs: number
  ok: boolean
  error?: string | null
  meta?: LlmUsageMeta
}

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

/** Insert one ai_usage row. Never throws; returns the cost it recorded (or null). */
export async function recordUsage(rec: UsageRecord): Promise<number | null> {
  const cost = computeCostUsd((rec.model as { pricing?: ModelPricing }).pricing, rec.usage)
  try {
    const sb = serviceClient()
    if (!sb) return cost
    const { error } = await sb.from('ai_usage').insert({
      user_id: rec.meta?.userId || null,
      screening_id: rec.meta?.screeningId || null,
      slot: rec.meta?.slot || null,
      source: rec.meta?.source || null,
      provider: rec.model.provider,
      model: rec.model.id,
      input_tokens: rec.usage.input,
      output_tokens: rec.usage.output,
      cache_read_tokens: rec.usage.cacheRead,
      cache_write_tokens: rec.usage.cacheWrite,
      cost_usd: cost,
      latency_ms: Math.max(0, Math.round(rec.latencyMs)),
      ok: rec.ok,
      error: rec.error ? String(rec.error).slice(0, 300) : null,
    })
    if (error) console.warn('[ai-usage] insert failed:', error.message)
  } catch (e) {
    console.warn('[ai-usage] record failed:', (e as Error)?.message)
  }
  return cost
}
