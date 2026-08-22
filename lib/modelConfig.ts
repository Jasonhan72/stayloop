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

export type ModelProvider = 'anthropic' | 'openai-compat'

/** 费用档（UI 展示用） */
export type CostTier = '低' | '中' | '高'

export interface ModelDef {
  id: string
  label: string
  /** 适用说明（zh，管理后台下拉展示用） */
  note: string
  provider: ModelProvider
  /** OpenAI-compatible base URL（不带尾部斜杠）— 仅 openai-compat 用 */
  baseUrl?: string
  /** 服务端环境变量名，存放该 provider 的 API key（绝不下发客户端） */
  apiKeyEnv: string
  /** 是否支持图片输入（Vision）。不支持的模型收到图片附件时由调用方回退默认模型。 */
  vision: boolean
  costTier: CostTier
  /** 允许配置到哪些槽位。screening/forensics 涉及租客 PII 与视觉取证、classify 需要视觉，均锁 Anthropic。 */
  allowedSlots: ModelSlot[]
  /** openai-compat：该模型拒绝自定义 temperature（如 Kimi 思考型模型只允许 1）——请求时省略。 */
  omitTemperature?: boolean
  /** openai-compat：token 上限参数名。OpenAI GPT-5 系列拒绝 `max_tokens`（400 unsupported parameter），要用 `max_completion_tokens`；国产四家仍用 `max_tokens`。默认 max_tokens。 */
  maxTokensParam?: 'max_tokens' | 'max_completion_tokens'
}

/** @deprecated 用 ModelDef */
export type AllowedModel = ModelDef

const ALL_SLOTS: ModelSlot[] = [...MODEL_SLOTS]

// Whitelist shared by the admin UI dropdown and write validation. Adding a
// model here is the only step needed to make it selectable.
export const ALLOWED_MODELS: ModelDef[] = [
  // ── Anthropic（全槽位可用）──────────────────────────────────────────────
  { id: 'claude-sonnet-5', label: 'Claude Sonnet 5', note: '最新旗舰推理 — 编码/代理任务接近 Opus 级', provider: 'anthropic', apiKeyEnv: 'ANTHROPIC_API_KEY', vision: true, costTier: '高', allowedSlots: ALL_SLOTS },
  { id: 'claude-opus-4-8', label: 'Claude Opus 4.8', note: '最强 Opus 级 — 最难的长程推理任务（成本最高）', provider: 'anthropic', apiKeyEnv: 'ANTHROPIC_API_KEY', vision: true, costTier: '高', allowedSlots: ALL_SLOTS },
  { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6', note: '稳定基线 — 当前对话/评分/分类槽位的默认模型', provider: 'anthropic', apiKeyEnv: 'ANTHROPIC_API_KEY', vision: true, costTier: '中', allowedSlots: ALL_SLOTS },
  { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', note: '轻量抽取 — 低成本低延迟，适合取证类结构化抽取', provider: 'anthropic', apiKeyEnv: 'ANTHROPIC_API_KEY', vision: true, costTier: '低', allowedSlots: ALL_SLOTS },
  // ── 国产 · OpenAI 兼容（仅 turn 槽位；无视觉，图片轮次自动回退默认）────
  { id: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash', note: 'DeepSeek V4 轻量档 — 极低成本、快速响应（deepseek-chat 已被官方下线）', provider: 'openai-compat', baseUrl: 'https://api.deepseek.com', apiKeyEnv: 'DEEPSEEK_API_KEY', vision: false, costTier: '低', allowedSlots: ['turn'] },
  { id: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro', note: 'DeepSeek V4 强化档 — 更强推理，成本仍低于 Claude', provider: 'openai-compat', baseUrl: 'https://api.deepseek.com', apiKeyEnv: 'DEEPSEEK_API_KEY', vision: false, costTier: '低', allowedSlots: ['turn'] },
  { id: 'kimi-k3', label: 'Kimi K3', note: 'Moonshot Kimi 旗舰 — 思考型模型，响应稍慢（含推理阶段）', provider: 'openai-compat', baseUrl: 'https://api.moonshot.cn/v1', apiKeyEnv: 'MOONSHOT_API_KEY', vision: false, costTier: '低', allowedSlots: ['turn'], omitTemperature: true },
  { id: 'kimi-k2.6', label: 'Kimi K2.6', note: 'Moonshot Kimi K2.6 — 思考型模型，响应稍慢（含推理阶段）', provider: 'openai-compat', baseUrl: 'https://api.moonshot.cn/v1', apiKeyEnv: 'MOONSHOT_API_KEY', vision: false, costTier: '低', allowedSlots: ['turn'], omitTemperature: true },
  // ── OpenAI（turn 槽位；GPT-5 系列：max_completion_tokens、不接受自定义 temperature）──
  { id: 'gpt-5.4', label: 'GPT-5.4', note: 'OpenAI 旗舰 — 推理/代理能力强，成本中等', provider: 'openai-compat', baseUrl: 'https://api.openai.com/v1', apiKeyEnv: 'OPENAI_API_KEY', vision: false, costTier: '中', allowedSlots: ['turn'], omitTemperature: true, maxTokensParam: 'max_completion_tokens' },
  { id: 'gpt-5.4-mini', label: 'GPT-5.4 mini', note: 'OpenAI 轻量档 — 低成本、快速响应', provider: 'openai-compat', baseUrl: 'https://api.openai.com/v1', apiKeyEnv: 'OPENAI_API_KEY', vision: false, costTier: '低', allowedSlots: ['turn'], omitTemperature: true, maxTokensParam: 'max_completion_tokens' },
  // ── Google Gemini（turn 槽位；走 AI Studio 的 OpenAI 兼容端点；思考型模型靠 4000 token 预算留出推理余量）──
  { id: 'gemini-3.7-flash', label: 'Gemini 3.7 Flash', note: 'Google Gemini 轻量旗舰 — 低成本、快速，思考型', provider: 'openai-compat', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', apiKeyEnv: 'GEMINI_API_KEY', vision: false, costTier: '低', allowedSlots: ['turn'] },
  { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro (preview)', note: 'Google Gemini Pro 预览版 — 更强推理，成本中等', provider: 'openai-compat', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', apiKeyEnv: 'GEMINI_API_KEY', vision: false, costTier: '中', allowedSlots: ['turn'] },
  { id: 'qwen-plus', label: '通义千问 Plus', note: '阿里通义 Qwen-Plus — 低成本均衡对话', provider: 'openai-compat', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', apiKeyEnv: 'DASHSCOPE_API_KEY', vision: false, costTier: '低', allowedSlots: ['turn'] },
  { id: 'glm-4.6', label: '智谱 GLM-4.6', note: '智谱 GLM-4.6 — 低成本中文对话/代理', provider: 'openai-compat', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', apiKeyEnv: 'ZHIPU_API_KEY', vision: false, costTier: '低', allowedSlots: ['turn'] },
]

/** 按模型 id 查定义；未知 id 返回 undefined。 */
export function getModelDef(modelId: string): ModelDef | undefined {
  return ALLOWED_MODELS.find((m) => m.id === modelId)
}

/**
 * SERVER-ONLY：该模型的 API key 环境变量是否已配置（非空）。
 * 只返回布尔，key 值绝不外传。客户端 process.env 动态访问恒为 undefined，
 * 所以此函数只能在服务端调用（管理页通过 /api/admin/model-providers 拿布尔）。
 */
export function providerAvailable(def: ModelDef): boolean {
  return !!(process.env[def.apiKeyEnv] || '').trim()
}

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
// Negative cache: a FAILED lookup also writes the cache (old value or the
// defaults) under a short TTL, so an outage doesn't hammer Supabase on every
// request — but recovery is picked up within ~10s.
const NEG_CACHE_TTL_MS = 10_000
let cache: { value: Record<ModelSlot, string>; fetchedAt: number; ttl: number } | null = null
// Coalesce concurrent first lookups in one isolate into a single query.
let inFlight: Promise<Record<ModelSlot, string>> | null = null

/**
 * Whitelist-validate a raw jsonb value; non-conforming slots fall back to
 * DEFAULT. A slot value must (1) be a whitelisted model, (2) be allowed for
 * that slot (allowedSlots), and (3) have its provider API key configured on
 * this server — otherwise the default takes over. SERVER-ONLY (reads env).
 * Exported for unit tests (pure given process.env) — production callers go
 * through getModels()/getModel().
 */
export function sanitize(raw: unknown): Record<ModelSlot, string> {
  const out: Record<ModelSlot, string> = { ...DEFAULT_MODELS }
  if (raw && typeof raw === 'object') {
    for (const slot of MODEL_SLOTS) {
      const v = (raw as Record<string, unknown>)[slot]
      if (typeof v !== 'string') continue
      const def = getModelDef(v)
      if (def && def.allowedSlots.includes(slot) && providerAvailable(def)) out[slot] = v
    }
  }
  return out
}

/**
 * Resolve all model slots. Server-only (uses the service-role key).
 * Never throws — falls back to the cached value, then to DEFAULT_MODELS.
 */
export async function getModels(): Promise<Record<ModelSlot, string>> {
  if (cache && Date.now() - cache.fetchedAt < cache.ttl) return cache.value
  if (inFlight) return inFlight
  inFlight = (async () => {
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
      cache = { value, fetchedAt: Date.now(), ttl: CACHE_TTL_MS }
      return value
    } catch {
      // Config-layer failure must not take AI features down: serve the stale
      // cache if we ever resolved successfully, otherwise the defaults —
      // negative-cached under the short TTL so failures don't stampede.
      const value = cache ? cache.value : { ...DEFAULT_MODELS }
      cache = { value, fetchedAt: Date.now(), ttl: NEG_CACHE_TTL_MS }
      return value
    } finally {
      inFlight = null
    }
  })()
  return inFlight
}

/** Convenience: resolve one slot. Server-only; never throws. */
export async function getModel(slot: ModelSlot): Promise<string> {
  return (await getModels())[slot]
}
