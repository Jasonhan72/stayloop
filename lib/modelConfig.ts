// -----------------------------------------------------------------------------
// Admin-switchable AI model slots (2026-07-20)
//
// Single source of truth for which Claude model each AI surface uses. The
// value lives in public.app_config (key='models', jsonb) and is editable from
// /admin/models; RLS restricts reads/writes to is_stayloop_admin(), while the
// server reads via the service-role key (RLS bypass).
//
// Design constraints:
//   • getModels()/getModel() are SERVER-ONLY (edge-safe) — they use
//     SUPABASE_SERVICE_ROLE_KEY. Never call them from client components.
//   • ALLOWED_MODELS / DEFAULT_MODELS / MODEL_SLOTS / the capability helpers
//     are safe to import from client code — the admin UI shares this
//     whitelist for its dropdown and pre-write validation.
//   • The config layer must NEVER take an AI feature down: any failure
//     (missing table, bad row, network) falls back to the last cached value,
//     then to DEFAULT_MODELS. Non-whitelisted values in the DB are replaced
//     per-slot by the default (dirty-data guard).
//   • Per-isolate in-memory cache, 60s TTL — a saved change propagates to
//     every edge isolate within at most ~60 seconds.
// -----------------------------------------------------------------------------
import { createClient } from '@supabase/supabase-js'

export type ModelSlot = 'turn' | 'screening' | 'classify' | 'forensics'

export const MODEL_SLOTS: ModelSlot[] = ['turn', 'screening', 'classify', 'forensics']

// Must stay in sync with the seed row in
// supabase/migrations/20260720_app_config_models.sql.
export const DEFAULT_MODELS: Record<ModelSlot, string> = {
  turn: 'claude-sonnet-4-6',
  screening: 'claude-sonnet-4-6',
  classify: 'claude-sonnet-4-6',
  forensics: 'claude-haiku-4-5',
}

export interface AllowedModel {
  id: string
  label: string
  /** 适用说明（zh，管理后台下拉展示用） */
  note: string
}

// Whitelist shared by the admin UI dropdown and write validation. Adding a
// model here is the only step needed to make it selectable.
export const ALLOWED_MODELS: AllowedModel[] = [
  { id: 'claude-sonnet-5', label: 'Claude Sonnet 5', note: '最新旗舰推理 — 编码/代理任务接近 Opus 级' },
  { id: 'claude-opus-4-8', label: 'Claude Opus 4.8', note: '最强 Opus 级 — 最难的长程推理任务（成本最高）' },
  { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6', note: '稳定基线 — 当前对话/评分/分类槽位的默认模型' },
  { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', note: '轻量抽取 — 低成本低延迟，适合取证类结构化抽取' },
]

const ALLOWED_IDS = new Set(ALLOWED_MODELS.map((m) => m.id))

// ── Per-model API-surface capabilities ───────────────────────────────────────
// Newer models tightened the request surface; call sites must adapt or the
// request 400s and the feature silently degrades.

/**
 * claude-opus-4-7+ / claude-sonnet-5 / claude-fable-5 reject sampling params
 * (`temperature` returns 400). Call sites spread `temperature` conditionally.
 */
export function supportsTemperature(model: string): boolean {
  return !/^claude-(opus-4-[789]|sonnet-5|fable|mythos)/.test(model)
}

/**
 * Assistant-prefill (a trailing `{role:'assistant'}` message) returns 400 on
 * the 4.6+ generation; among the whitelist only Haiku 4.5 still accepts it.
 * The forensics extractors use prefill for JSON determinism and must drop it
 * (and stop re-prepending the prefilled "{") on models that reject it.
 */
export function supportsAssistantPrefill(model: string): boolean {
  return /^claude-haiku-4-5/.test(model)
}

// ── Server-side resolution with per-isolate cache ────────────────────────────

const CACHE_TTL_MS = 60_000
let cache: { value: Record<ModelSlot, string>; fetchedAt: number } | null = null

/** Whitelist-validate a raw jsonb value; non-conforming slots fall back to DEFAULT. */
function sanitize(raw: unknown): Record<ModelSlot, string> {
  const out: Record<ModelSlot, string> = { ...DEFAULT_MODELS }
  if (raw && typeof raw === 'object') {
    for (const slot of MODEL_SLOTS) {
      const v = (raw as Record<string, unknown>)[slot]
      if (typeof v === 'string' && ALLOWED_IDS.has(v)) out[slot] = v
    }
  }
  return out
}

/**
 * Resolve all model slots. Server-only (uses the service-role key).
 * Never throws — falls back to the cached value, then to DEFAULT_MODELS.
 */
export async function getModels(): Promise<Record<ModelSlot, string>> {
  const now = Date.now()
  if (cache && now - cache.fetchedAt < CACHE_TTL_MS) return cache.value
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) throw new Error('supabase env missing')
    const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
    const { data, error } = await sb
      .from('app_config')
      .select('value')
      .eq('key', 'models')
      .maybeSingle()
    if (error) throw error
    const value = sanitize(data?.value)
    cache = { value, fetchedAt: now }
    return value
  } catch {
    // Config-layer failure must not take AI features down: serve the stale
    // cache if we ever resolved successfully, otherwise the defaults.
    return cache ? cache.value : { ...DEFAULT_MODELS }
  }
}

/** Convenience: resolve one slot. Server-only; never throws. */
export async function getModel(slot: ModelSlot): Promise<string> {
  return (await getModels())[slot]
}
