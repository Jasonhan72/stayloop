// -----------------------------------------------------------------------------
// AI model catalogue + slots + per-user preferences (2026-07-20, reworked 2026-08-21)
//
// Three layers, all resolved server-side with a per-isolate cache:
//
//   1. CATALOGUE — which models exist at all. Seeded from BUILTIN_MODELS (this
//      file) and extended/overridden by admins through public.model_catalog
//      (/admin/models → 「模型目录」). A DB row with the same id as a builtin
//      overrides it (so admins can disable or relabel builtins); unknown ids
//      are appended. If the table is unreachable the builtins alone serve.
//   2. SLOTS — which catalogue model each AI surface uses by default. Lives in
//      public.app_config (key='models'); edited from /admin/models.
//   3. USER PREFERENCES — a signed-in user may pick, per user-facing slot, a
//      catalogue model flagged user_selectable (/settings/models). Stored in
//      public.user_model_preferences; resolved by getModelForUser().
//
// Design constraints:
//   • getCatalog()/getModels()/getModel()/getModelForUser() are SERVER-ONLY
//     (edge-safe) — they use SUPABASE_SERVICE_ROLE_KEY. Never call them from
//     client components.
//   • BUILTIN_MODELS / DEFAULT_MODELS / MODEL_SLOTS / PROVIDER_KEYS / the
//     capability helpers / rowToModel / mergeCatalog are safe to import from
//     client code — the admin + settings UIs share them for validation.
//   • The config layer must NEVER take an AI feature down: any failure
//     (missing table, bad row, network) falls back to the last cached value,
//     then to the builtins + DEFAULT_MODELS. Non-conforming values are
//     replaced per-slot by the default (dirty-data guard).
//   • SECURITY: a catalogue row names the env var holding its API key and the
//     base URL the key is sent to. An admin-level compromise must not turn
//     this into a key-exfiltration channel, so rowToModel() enforces
//     PROVIDER_KEYS: the env name must be a known provider key AND the base
//     URL host must be on that provider's allow-list. The two CUSTOM_LLM
//     envs are the escape hatch for gateways like OpenRouter: any https host,
//     but only ever carrying their own dedicated key.
//   • Per-isolate in-memory cache, 60s TTL — a saved change propagates to
//     every edge isolate within at most ~60 seconds (user prefs: 30s).
// -----------------------------------------------------------------------------
import { createClient } from '@supabase/supabase-js'

export type ModelSlot = 'turn' | 'screening' | 'classify' | 'forensics'

export const MODEL_SLOTS: ModelSlot[] = ['turn', 'screening', 'classify', 'forensics']

/** Slots a signed-in user may override for themselves (/settings/models). classify/forensics are internal mechanics. */
export const USER_SLOTS: ModelSlot[] = ['turn', 'screening']

/**
 * 文档槽位：证件/流水/工资单/信用报告的图片与 PDF 页都会进模型，所以模型必须
 * 支持图片输入（vision=true）。2026-08-22 起不再限定 Anthropic（产品决定：
 * 开放给全部厂商），服务端与后台 UI 同时强制 vision；非 Anthropic 厂商只作
 * 「数据出境」提示。
 */
export const VISION_SLOTS: ModelSlot[] = ['screening', 'classify', 'forensics']
/** @deprecated 名称保留给旧导入；语义已变为 VISION_SLOTS（需要视觉，不再锁厂商）。 */
export const SENSITIVE_SLOTS: ModelSlot[] = VISION_SLOTS

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
  /**
   * openai-compat：PDF 怎么送进模型（2026-08-22 实测）：
   *   'file'      OpenAI、Qwen 3.8 Max —— `{type:'file', file_data}` 原生 PDF
   *   'image_url' Gemini —— `image_url` 携带 data:application/pdf
   *   'text'      其余 —— 服务端用 unpdf 抽文本后作为文字送入（扫描件不可读，会明示）
   * anthropic 忽略（原生 document 块）。默认 'text'。
   */
  pdfInput?: 'file' | 'image_url' | 'text'
}

/** A catalogue entry = ModelDef + admin switches. */
export interface CatalogModel extends ModelDef {
  /** 用户可在 /settings/models 自选（后台开关，默认开）。 */
  userSelectable: boolean
  /** 停用后：不可被槽位/用户选中，已选的回退默认。 */
  enabled: boolean
  /** 来自代码内置清单（可被后台覆盖，不可删除——删除行即恢复内置定义）。 */
  builtin: boolean
  sortOrder: number
}

/** @deprecated 用 ModelDef */
export type AllowedModel = ModelDef

const ALL_SLOTS: ModelSlot[] = [...MODEL_SLOTS]

// ── Provider key registry (the security allow-list) ──────────────────────────
//
// env → which provider type it belongs to and which hosts it may be sent to.
// hosts '*' = any https host (dedicated keys for custom gateways only).
export interface ProviderKeyInfo {
  label: string
  provider: ModelProvider
  hosts: string[] | '*'
  /** 建议 baseUrl（后台「添加模型」预填） */
  defaultBaseUrl?: string
}
export const PROVIDER_KEYS: Record<string, ProviderKeyInfo> = {
  ANTHROPIC_API_KEY: { label: 'Anthropic (Claude)', provider: 'anthropic', hosts: ['api.anthropic.com'] },
  OPENAI_API_KEY: { label: 'OpenAI', provider: 'openai-compat', hosts: ['api.openai.com'], defaultBaseUrl: 'https://api.openai.com/v1' },
  GEMINI_API_KEY: { label: 'Google Gemini (AI Studio)', provider: 'openai-compat', hosts: ['generativelanguage.googleapis.com'], defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai' },
  DEEPSEEK_API_KEY: { label: 'DeepSeek', provider: 'openai-compat', hosts: ['api.deepseek.com'], defaultBaseUrl: 'https://api.deepseek.com' },
  MOONSHOT_API_KEY: { label: 'Moonshot (Kimi)', provider: 'openai-compat', hosts: ['api.moonshot.cn', 'api.moonshot.ai'], defaultBaseUrl: 'https://api.moonshot.cn/v1' },
  DASHSCOPE_API_KEY: { label: '阿里云百炼 (Qwen)', provider: 'openai-compat', hosts: ['dashscope.aliyuncs.com', 'dashscope-intl.aliyuncs.com'], defaultBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
  ZHIPU_API_KEY: { label: '智谱 (GLM)', provider: 'openai-compat', hosts: ['open.bigmodel.cn'], defaultBaseUrl: 'https://open.bigmodel.cn/api/paas/v4' },
  OPENROUTER_API_KEY: { label: 'OpenRouter', provider: 'openai-compat', hosts: ['openrouter.ai'], defaultBaseUrl: 'https://openrouter.ai/api/v1' },
  CUSTOM_LLM_API_KEY_1: { label: '自定义网关 1（任意 OpenAI 兼容 https 端点）', provider: 'openai-compat', hosts: '*' },
  CUSTOM_LLM_API_KEY_2: { label: '自定义网关 2（任意 OpenAI 兼容 https 端点）', provider: 'openai-compat', hosts: '*' },
}
export const PROVIDER_KEY_ENVS = Object.keys(PROVIDER_KEYS)

/** baseUrl 是否允许搭配该 env（https + host 在白名单内）。纯函数，客户端可用。 */
export function baseUrlAllowedFor(apiKeyEnv: string, baseUrl: string | undefined): boolean {
  const info = PROVIDER_KEYS[apiKeyEnv]
  if (!info) return false
  if (info.provider === 'anthropic') return !baseUrl
  if (!baseUrl) return false
  let u: URL
  try { u = new URL(baseUrl) } catch { return false }
  if (u.protocol !== 'https:') return false
  if (u.username || u.password) return false
  if (info.hosts === '*') return true
  return info.hosts.includes(u.hostname.toLowerCase())
}

// ── Builtin catalogue (code-level seed + fallback) ───────────────────────────
export const BUILTIN_MODELS: ModelDef[] = [
  // 每家保持两档：「最新版」与「高性价比版」（2026-08-22 按各家 /models 实测在线清单核对）。
  // ── Anthropic（全槽位可用）──────────────────────────────────────────────
  { id: 'claude-opus-5', label: 'Claude Opus 5', note: '最新旗舰（Claude 5 代）— 最强推理，成本最高', provider: 'anthropic', apiKeyEnv: 'ANTHROPIC_API_KEY', vision: true, costTier: '高', allowedSlots: ALL_SLOTS },
  { id: 'claude-sonnet-5', label: 'Claude Sonnet 5', note: '最新均衡档（Claude 5 代）— 编码/代理任务接近 Opus 级', provider: 'anthropic', apiKeyEnv: 'ANTHROPIC_API_KEY', vision: true, costTier: '高', allowedSlots: ALL_SLOTS },
  { id: 'claude-opus-4-8', label: 'Claude Opus 4.8', note: '上一代旗舰 — 最难的长程推理任务（成本高）', provider: 'anthropic', apiKeyEnv: 'ANTHROPIC_API_KEY', vision: true, costTier: '高', allowedSlots: ALL_SLOTS },
  { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6', note: '稳定基线 — 当前对话/评分/分类槽位的默认模型', provider: 'anthropic', apiKeyEnv: 'ANTHROPIC_API_KEY', vision: true, costTier: '中', allowedSlots: ALL_SLOTS },
  { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', note: '高性价比 — 低成本低延迟，适合取证类结构化抽取', provider: 'anthropic', apiKeyEnv: 'ANTHROPIC_API_KEY', vision: true, costTier: '低', allowedSlots: ALL_SLOTS },
  // ── OpenAI（turn 槽位；GPT-5 系列：max_completion_tokens、不接受自定义 temperature）──
  { id: 'gpt-5.5', label: 'GPT-5.5', note: 'OpenAI 最新旗舰（2026-04）— 最强推理/代理，成本高；支持图片与 PDF', provider: 'openai-compat', baseUrl: 'https://api.openai.com/v1', apiKeyEnv: 'OPENAI_API_KEY', vision: true, costTier: '高', allowedSlots: ALL_SLOTS, omitTemperature: true, maxTokensParam: 'max_completion_tokens', pdfInput: 'file' },
  { id: 'gpt-5.4', label: 'GPT-5.4', note: 'OpenAI 旗舰 — 推理/代理能力强，成本中等；支持图片与 PDF', provider: 'openai-compat', baseUrl: 'https://api.openai.com/v1', apiKeyEnv: 'OPENAI_API_KEY', vision: true, costTier: '中', allowedSlots: ALL_SLOTS, omitTemperature: true, maxTokensParam: 'max_completion_tokens', pdfInput: 'file' },
  { id: 'gpt-5.4-mini', label: 'GPT-5.4 mini', note: 'OpenAI 高性价比档 — 低成本、快速响应；支持图片与 PDF', provider: 'openai-compat', baseUrl: 'https://api.openai.com/v1', apiKeyEnv: 'OPENAI_API_KEY', vision: true, costTier: '低', allowedSlots: ALL_SLOTS, omitTemperature: true, maxTokensParam: 'max_completion_tokens', pdfInput: 'file' },
  { id: 'gpt-5.4-nano', label: 'GPT-5.4 nano', note: 'OpenAI 最低价档 — 极低成本、最快，适合简单轮次；支持图片与 PDF', provider: 'openai-compat', baseUrl: 'https://api.openai.com/v1', apiKeyEnv: 'OPENAI_API_KEY', vision: true, costTier: '低', allowedSlots: ALL_SLOTS, omitTemperature: true, maxTokensParam: 'max_completion_tokens', pdfInput: 'file' },
  // ── Google Gemini（turn 槽位；走 AI Studio 的 OpenAI 兼容端点；思考型模型靠 4000 token 预算留出推理余量）──
  { id: 'gemini-3.7-flash', label: 'Gemini 3.7 Flash', note: 'Google 最新 Flash — 低成本、快速，思考型；支持图片与 PDF', provider: 'openai-compat', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', apiKeyEnv: 'GEMINI_API_KEY', vision: true, costTier: '低', allowedSlots: ALL_SLOTS, pdfInput: 'image_url' },
  { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro (preview)', note: 'Google Gemini Pro 预览版 — 更强推理，成本中等；支持图片与 PDF', provider: 'openai-compat', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', apiKeyEnv: 'GEMINI_API_KEY', vision: true, costTier: '中', allowedSlots: ALL_SLOTS, pdfInput: 'image_url' },
  { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite', note: 'Google 最低价档 — 极低成本、极快；支持图片与 PDF', provider: 'openai-compat', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', apiKeyEnv: 'GEMINI_API_KEY', vision: true, costTier: '低', allowedSlots: ALL_SLOTS, pdfInput: 'image_url' },
  // ── DeepSeek ──
  { id: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro', note: 'DeepSeek 最新强化档 — 更强推理，成本仍低于 Claude（纯文本，仅对话）', provider: 'openai-compat', baseUrl: 'https://api.deepseek.com', apiKeyEnv: 'DEEPSEEK_API_KEY', vision: false, costTier: '低', allowedSlots: ['turn'] },
  { id: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash', note: 'DeepSeek 高性价比档 — 极低成本、快速响应（纯文本，仅对话）', provider: 'openai-compat', baseUrl: 'https://api.deepseek.com', apiKeyEnv: 'DEEPSEEK_API_KEY', vision: false, costTier: '低', allowedSlots: ['turn'] },
  // ── Moonshot Kimi ──
  { id: 'kimi-k3', label: 'Kimi K3', note: 'Moonshot 最新旗舰 — 思考型模型，响应稍慢（含推理阶段）；支持图片，PDF 仅文本提取', provider: 'openai-compat', baseUrl: 'https://api.moonshot.cn/v1', apiKeyEnv: 'MOONSHOT_API_KEY', vision: true, costTier: '低', allowedSlots: ALL_SLOTS, omitTemperature: true, pdfInput: 'text' },
  { id: 'kimi-k2.6', label: 'Kimi K2.6', note: 'Moonshot 高性价比档 — 思考型模型，响应稍慢（含推理阶段）；支持图片，PDF 仅文本提取', provider: 'openai-compat', baseUrl: 'https://api.moonshot.cn/v1', apiKeyEnv: 'MOONSHOT_API_KEY', vision: true, costTier: '低', allowedSlots: ALL_SLOTS, omitTemperature: true, pdfInput: 'text' },
  // ── 阿里云百炼 Qwen ──
  { id: 'qwen3.8-max', label: '通义千问 3.8 Max', note: '阿里最新旗舰 — 最强推理，成本中等；支持图片与 PDF', provider: 'openai-compat', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', apiKeyEnv: 'DASHSCOPE_API_KEY', vision: true, costTier: '中', allowedSlots: ALL_SLOTS, pdfInput: 'file' },
  { id: 'qwen3.7-plus', label: '通义千问 3.7 Plus', note: '阿里均衡档 — 性能与成本平衡；支持图片，PDF 仅文本提取', provider: 'openai-compat', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', apiKeyEnv: 'DASHSCOPE_API_KEY', vision: true, costTier: '低', allowedSlots: ALL_SLOTS, pdfInput: 'text' },
  { id: 'qwen3.7-flash', label: '通义千问 3.7 Flash', note: '阿里高性价比档 — 低成本、快速；支持图片，PDF 仅文本提取', provider: 'openai-compat', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', apiKeyEnv: 'DASHSCOPE_API_KEY', vision: true, costTier: '低', allowedSlots: ALL_SLOTS, pdfInput: 'text' },
  // ── 智谱 GLM ──
  { id: 'glm-5.3', label: '智谱 GLM-5.3', note: '智谱最新旗舰 — 中文对话/代理，成本低（纯文本，仅对话）', provider: 'openai-compat', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', apiKeyEnv: 'ZHIPU_API_KEY', vision: false, costTier: '低', allowedSlots: ['turn'] },
  { id: 'glm-5-turbo', label: '智谱 GLM-5 Turbo', note: '智谱高性价比档 — 更快、更便宜（纯文本，仅对话）', provider: 'openai-compat', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', apiKeyEnv: 'ZHIPU_API_KEY', vision: false, costTier: '低', allowedSlots: ['turn'] },
]

/** @deprecated 用 BUILTIN_MODELS（或服务端 getCatalog()）。保留给旧导入。 */
export const ALLOWED_MODELS: ModelDef[] = BUILTIN_MODELS

/** Builtins lifted to CatalogModel (the no-DB fallback). */
export const BUILTIN_CATALOG: CatalogModel[] = BUILTIN_MODELS.map((m, i) => ({
  ...m, userSelectable: true, enabled: true, builtin: true, sortOrder: (i + 1) * 10,
}))

/** 按模型 id 查【内置】定义；未知 id 返回 undefined。服务端请用 findModel(id, await getCatalog())。 */
export function getModelDef(modelId: string): ModelDef | undefined {
  return BUILTIN_MODELS.find((m) => m.id === modelId)
}

/** 在目录中查模型（含停用行——调用方自行检查 enabled）。 */
export function findModel(modelId: string, catalog: CatalogModel[]): CatalogModel | undefined {
  return catalog.find((m) => m.id === modelId)
}

/**
 * SERVER-ONLY：该模型的 API key 环境变量是否已配置（非空）。
 * 只返回布尔，key 值绝不外传。客户端 process.env 动态访问恒为 undefined，
 * 所以此函数只能在服务端调用（管理页通过 /api/admin/model-providers 拿布尔）。
 */
export function providerAvailable(def: ModelDef): boolean {
  return providerEnvAvailable(def.apiKeyEnv)
}
export function providerEnvAvailable(apiKeyEnv: string): boolean {
  if (!PROVIDER_KEYS[apiKeyEnv]) return false
  return !!(process.env[apiKeyEnv] || '').trim()
}

// ── Catalogue rows (public.model_catalog) ────────────────────────────────────

export const MODEL_ID_RE = /^[a-z0-9][a-z0-9._:/-]{1,95}$/i

/** DB row shape (snake_case, as stored). */
export interface CatalogRow {
  id: string
  label: string
  note: string | null
  provider: string
  base_url: string | null
  api_key_env: string
  vision: boolean
  cost_tier: string
  allowed_slots: string[] | null
  omit_temperature: boolean | null
  max_tokens_param: string | null
  pdf_input?: string | null
  user_selectable: boolean | null
  enabled: boolean | null
  sort_order: number | null
  builtin?: boolean | null
}

/**
 * Validate + convert one DB row. Returns null for anything that would be
 * unsafe or unusable (unknown env, disallowed host, bad provider/tier/id).
 * Document (vision) slots are dropped for non-vision models regardless of what the row says.
 * Pure — shared by the server merge and the admin form's pre-write check.
 */
export function rowToModel(row: unknown): CatalogModel | null {
  if (!row || typeof row !== 'object') return null
  const r = row as Partial<CatalogRow>
  if (typeof r.id !== 'string' || !MODEL_ID_RE.test(r.id)) return null
  if (r.provider !== 'anthropic' && r.provider !== 'openai-compat') return null
  if (typeof r.api_key_env !== 'string' || !PROVIDER_KEYS[r.api_key_env]) return null
  if (PROVIDER_KEYS[r.api_key_env].provider !== r.provider) return null
  const baseUrl = typeof r.base_url === 'string' && r.base_url.trim() ? r.base_url.trim().replace(/\/+$/, '') : undefined
  if (!baseUrlAllowedFor(r.api_key_env, baseUrl)) return null
  const costTier: CostTier = r.cost_tier === '低' || r.cost_tier === '中' || r.cost_tier === '高' ? r.cost_tier : '中'
  const vision = r.provider === 'anthropic' ? r.vision !== false : r.vision === true
  let slots = (Array.isArray(r.allowed_slots) ? r.allowed_slots : []).filter((s): s is ModelSlot => (MODEL_SLOTS as string[]).includes(s))
  // Document slots feed images/PDF pages to the model — a text-only model cannot serve them.
  if (!vision) slots = slots.filter((s) => !VISION_SLOTS.includes(s))
  if (!slots.length) slots = vision ? [...MODEL_SLOTS] : ['turn']
  const label = typeof r.label === 'string' && r.label.trim() ? r.label.trim().slice(0, 80) : r.id
  return {
    id: r.id,
    label,
    note: typeof r.note === 'string' ? r.note.slice(0, 300) : '',
    provider: r.provider,
    baseUrl,
    apiKeyEnv: r.api_key_env,
    vision,
    costTier,
    allowedSlots: slots,
    omitTemperature: r.omit_temperature === true || undefined,
    maxTokensParam: r.max_tokens_param === 'max_completion_tokens' ? 'max_completion_tokens' : undefined,
    pdfInput: r.pdf_input === 'file' || r.pdf_input === 'image_url' ? r.pdf_input : (r.pdf_input === 'text' ? 'text' : undefined),
    userSelectable: r.user_selectable !== false,
    enabled: r.enabled !== false,
    builtin: !!BUILTIN_MODELS.find((m) => m.id === r.id),
    sortOrder: typeof r.sort_order === 'number' && Number.isFinite(r.sort_order) ? r.sort_order : 1000,
  }
}

/**
 * Builtins + DB rows → effective catalogue. DB rows override builtins by id
 * (that is how admins disable/relabel a builtin); invalid rows are skipped;
 * a builtin with no row keeps its code definition. Sorted by sortOrder then
 * by builtin order. Pure.
 */
export function mergeCatalog(rows: unknown[] | null | undefined): CatalogModel[] {
  const byId = new Map<string, CatalogModel>()
  for (const b of BUILTIN_CATALOG) byId.set(b.id, b)
  for (const raw of rows || []) {
    const m = rowToModel(raw)
    if (m) byId.set(m.id, m)
  }
  const order = new Map(BUILTIN_CATALOG.map((b, i) => [b.id, i]))
  return [...byId.values()].sort((a, b) => (a.sortOrder - b.sortOrder) || ((order.get(a.id) ?? 1e6) - (order.get(b.id) ?? 1e6)) || a.id.localeCompare(b.id))
}

// ── Per-model API-surface capabilities ───────────────────────────────────────
// Newer models tightened the request surface; call sites must adapt or the
// request 400s and the feature silently degrades.

/**
 * claude-opus-4-7+ / Claude 5 family (opus-5 / sonnet-5) / claude-fable-5 reject sampling params
 * (`temperature` returns 400). Call sites spread `temperature` conditionally.
 */
export function supportsTemperature(model: string): boolean {
  return !/^claude-(opus-4-[789]|opus-5|sonnet-5|haiku-5|fable|mythos)/.test(model)
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

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('supabase env missing')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

let catalogCache: { value: CatalogModel[]; fetchedAt: number; ttl: number } | null = null
let catalogInFlight: Promise<CatalogModel[]> | null = null

/**
 * Effective catalogue (all rows, including disabled — consumers filter).
 * Server-only; never throws; falls back to stale cache → builtins.
 */
export async function getCatalog(): Promise<CatalogModel[]> {
  if (catalogCache && Date.now() - catalogCache.fetchedAt < catalogCache.ttl) return catalogCache.value
  if (catalogInFlight) return catalogInFlight
  catalogInFlight = (async () => {
    try {
      const { data, error } = await serviceClient().from('model_catalog').select('*')
      if (error) throw error
      const value = mergeCatalog(data)
      catalogCache = { value, fetchedAt: Date.now(), ttl: CACHE_TTL_MS }
      return value
    } catch {
      const value = catalogCache ? catalogCache.value : BUILTIN_CATALOG
      catalogCache = { value, fetchedAt: Date.now(), ttl: NEG_CACHE_TTL_MS }
      return value
    } finally {
      catalogInFlight = null
    }
  })()
  return catalogInFlight
}

/** 服务端：按 id 查有效目录里的模型定义（含停用行）。 */
export async function getModelDefAsync(modelId: string): Promise<CatalogModel | undefined> {
  return findModel(modelId, await getCatalog())
}

let cache: { value: Record<ModelSlot, string>; fetchedAt: number; ttl: number } | null = null
// Coalesce concurrent first lookups in one isolate into a single query.
let inFlight: Promise<Record<ModelSlot, string>> | null = null

/** A model may serve a slot: in catalogue, enabled, slot-allowed, key configured. SERVER-ONLY (reads env). */
export function modelUsableForSlot(def: CatalogModel | undefined, slot: ModelSlot): def is CatalogModel {
  return !!def && def.enabled && def.allowedSlots.includes(slot) && providerAvailable(def)
}

/**
 * Whitelist-validate a raw jsonb value; non-conforming slots fall back to
 * DEFAULT. A slot value must (1) be a catalogue model, (2) be enabled and
 * allowed for that slot, and (3) have its provider API key configured on
 * this server — otherwise the default takes over. SERVER-ONLY (reads env).
 * Exported for unit tests (pure given process.env + catalog) — production
 * callers go through getModels()/getModel().
 */
export function sanitize(raw: unknown, catalog: CatalogModel[] = BUILTIN_CATALOG): Record<ModelSlot, string> {
  const out: Record<ModelSlot, string> = { ...DEFAULT_MODELS }
  if (raw && typeof raw === 'object') {
    for (const slot of MODEL_SLOTS) {
      const v = (raw as Record<string, unknown>)[slot]
      if (typeof v !== 'string') continue
      if (modelUsableForSlot(findModel(v, catalog), slot)) out[slot] = v
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
      const [catalog, res] = await Promise.all([
        getCatalog(),
        serviceClient().from('app_config').select('value').eq('key', 'models').maybeSingle(),
      ])
      if (res.error) throw res.error
      const value = sanitize(res.data?.value, catalog)
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

/** Convenience: resolve one slot (system default). Server-only; never throws. */
export async function getModel(slot: ModelSlot): Promise<string> {
  return (await getModels())[slot]
}

// ── Per-user preferences (public.user_model_preferences) ─────────────────────

const PREF_TTL_MS = 30_000
const PREF_CACHE_MAX = 2000
const prefCache = new Map<string, { value: Partial<Record<ModelSlot, string>>; fetchedAt: number }>()

/**
 * A user's pick is honoured only if it is STILL a legitimate choice right
 * now: catalogue model, enabled, user_selectable, allowed for the slot, key
 * configured, and the slot is user-overridable. Otherwise the system default.
 * Pure given env — exported for tests.
 */
export function pickUserModel(
  pref: string | undefined | null,
  slot: ModelSlot,
  catalog: CatalogModel[],
  fallback: string,
): string {
  if (!pref || !USER_SLOTS.includes(slot)) return fallback
  const def = findModel(pref, catalog)
  return modelUsableForSlot(def, slot) && def.userSelectable ? pref : fallback
}

async function getUserPrefs(userId: string): Promise<Partial<Record<ModelSlot, string>>> {
  const hit = prefCache.get(userId)
  if (hit && Date.now() - hit.fetchedAt < PREF_TTL_MS) return hit.value
  let value: Partial<Record<ModelSlot, string>> = {}
  try {
    const { data, error } = await serviceClient()
      .from('user_model_preferences')
      .select('slot, model_id')
      .eq('user_id', userId)
    if (error) throw error
    for (const row of data || []) {
      if ((MODEL_SLOTS as string[]).includes(row.slot) && typeof row.model_id === 'string') value[row.slot as ModelSlot] = row.model_id
    }
  } catch {
    value = hit ? hit.value : {}
  }
  if (prefCache.size >= PREF_CACHE_MAX) prefCache.clear()
  prefCache.set(userId, { value, fetchedAt: Date.now() })
  return value
}

/**
 * Resolve the model for ONE user on a slot: their preference when valid,
 * else the system default. userId null/undefined (anonymous) → default.
 * Server-only; never throws.
 */
export async function getModelForUser(slot: ModelSlot, userId: string | null | undefined): Promise<string> {
  const fallback = await getModel(slot)
  if (!userId || !USER_SLOTS.includes(slot)) return fallback
  const [prefs, catalog] = await Promise.all([getUserPrefs(userId), getCatalog()])
  return pickUserModel(prefs[slot], slot, catalog, fallback)
}

/** Test hook: drop every server cache. */
export function __resetModelConfigCaches(): void {
  cache = null
  catalogCache = null
  prefCache.clear()
}
