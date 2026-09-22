// Model discovery for /admin/models (2026-09-21). The catalogue is a hand-
// written list (BUILTIN_MODELS + model_catalog rows) and goes stale the day
// a provider ships something new. Every provider we call also exposes a
// "list models" endpoint, so the back office can ask each configured
// provider what it serves today and diff that against the catalogue:
//   • NEW      — listed by the provider, not in the catalogue → one-click
//                prefill of the add-model form (the admin still sets vision /
//                slots / pricing and runs the connectivity test; nothing is
//                auto-enabled for users, because capability and price cannot
//                be discovered).
//   • RETIRED  — in the catalogue, no longer listed by the provider → shown
//                red so the admin disables it before users hit 404s.
// Pure helpers are exported for tests; only `discoverProvider` touches the
// network, and it only ever calls the provider host registered for that key.
import { PROVIDER_KEYS, type CatalogModel } from './modelConfig'

export type ListedModel = { id: string; created?: number | null; label?: string | null }

// Provider listing endpoint for a registered key env. Anthropic has its own
// shape; every OpenAI-compatible provider serves GET {base}/models.
export function providerModelsUrl(apiKeyEnv: string): string | null {
  const info = PROVIDER_KEYS[apiKeyEnv]
  if (!info) return null
  if (info.provider === 'anthropic') return 'https://api.anthropic.com/v1/models?limit=1000'
  if (!info.defaultBaseUrl) return null // custom gateways: host unknown until an admin adds a model
  return `${info.defaultBaseUrl.replace(/\/$/, '')}/models`
}

// Both shapes: Anthropic {data:[{id, display_name, created_at}]} and OpenAI
// {data:[{id, created, owned_by}]}. Gemini prefixes ids with "models/".
export function parseModelList(json: unknown): ListedModel[] {
  const arr = (json as { data?: unknown[] } | null)?.data
  if (!Array.isArray(arr)) return []
  const out: ListedModel[] = []
  for (const raw of arr) {
    const r = raw as { id?: unknown; created?: unknown; created_at?: unknown; display_name?: unknown }
    if (typeof r.id !== 'string' || !r.id.trim()) continue
    const id = r.id.replace(/^models\//, '')
    const created =
      typeof r.created === 'number' ? r.created : typeof r.created_at === 'string' ? Math.floor(Date.parse(r.created_at) / 1000) || null : null
    out.push({ id, created, label: typeof r.display_name === 'string' ? r.display_name : null })
  }
  return out
}

// Chat-capable candidates only. Providers list embeddings, TTS, speech,
// image, moderation, realtime and fine-tune snapshots under the same
// endpoint; none of those can take a Stayloop slot.
const NOT_CHAT = /embed|embedding|tts|whisper|speech|audio|transcri|realtime|moderation|image|imagen|dall-e|veo|sora|video|vision-only|rerank|ocr|search-preview|search-api|computer-use|batch|-instruct-?\d{4}|davinci|babbage|curie|ada\b|\blive\b|-live|lyria|banana|robotics|translate|codex|guard|asr|\bmt-|-mt\b/i
const DATED_SNAPSHOT = /(?:-|_)(?:20\d{2}-\d{2}-\d{2}|\d{8}|\d{4}(?:-\d{2})?)$/
export function isChatCandidate(id: string): boolean {
  if (!id || id.length > 96) return false
  if (NOT_CHAT.test(id)) return false
  // "gpt-5.4-2026-03-14" is a pinned snapshot of a model already listed
  // without the suffix; keep the alias, drop the snapshot.
  if (DATED_SNAPSHOT.test(id) && !/^gemini/.test(id)) return false
  return /gpt|claude|gemini|deepseek|kimi|moonshot|qwen|glm|o\d|llama|mistral|grok|sonnet|opus|haiku|flash|pro|chat|turbo|max|plus|mini|nano/i.test(id)
}

export type ProviderDiff = {
  env: string
  label: string
  ok: boolean
  error?: string
  listed: number
  fresh: ListedModel[]
  retired: string[]
}

// Diff one provider's listing against the catalogue rows that use that key.
export function diffProvider(env: string, listed: ListedModel[], catalog: CatalogModel[]): Pick<ProviderDiff, 'fresh' | 'retired'> {
  const mine = catalog.filter((m) => m.apiKeyEnv === env)
  const known = new Set(mine.map((m) => m.id.toLowerCase()))
  const listedIds = new Set(listed.map((l) => l.id.toLowerCase()))
  const fresh = listed
    .filter((l) => !known.has(l.id.toLowerCase()) && isChatCandidate(l.id))
    .sort((a, b) => (b.created ?? 0) - (a.created ?? 0) || a.id.localeCompare(b.id))
  // A catalogue id absent from a NON-EMPTY listing is retired; an empty or
  // failed listing says nothing. Aliases count as present: the catalogue
  // says `claude-haiku-4-5`, Anthropic lists `claude-haiku-4-5-20251001`.
  const listedArr = Array.from(listedIds)
  const present = (id: string) => listedIds.has(id) || listedArr.some((l) => l.startsWith(id + '-') || l.startsWith(id + '@'))
  const retired = listed.length ? mine.filter((m) => m.enabled && !present(m.id.toLowerCase())).map((m) => m.id) : []
  return { fresh, retired }
}

export async function discoverProvider(env: string, key: string, catalog: CatalogModel[]): Promise<ProviderDiff> {
  const info = PROVIDER_KEYS[env]
  const label = info?.label || env
  const url = providerModelsUrl(env)
  if (!url) return { env, label, ok: false, error: 'no listing endpoint for this key', listed: 0, fresh: [], retired: [] }
  const headers: Record<string, string> =
    info.provider === 'anthropic'
      ? { 'x-api-key': key, 'anthropic-version': '2023-06-01' }
      : { Authorization: `Bearer ${key}` }
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(10000) })
    if (!res.ok) return { env, label, ok: false, error: `HTTP ${res.status}`, listed: 0, fresh: [], retired: [] }
    const listed = parseModelList(await res.json())
    return { env, label, ok: true, listed: listed.length, ...diffProvider(env, listed, catalog) }
  } catch (e) {
    return { env, label, ok: false, error: String((e as Error)?.message || e).slice(0, 120), listed: 0, fresh: [], retired: [] }
  }
}

// ---------- One-click add: sensible defaults from provider + id ----------
// Capability cannot be discovered, but the family name says a lot. These
// defaults get the row into the catalogue ENABLED (so the connectivity test
// can run) but NOT user-selectable — the admin flips that after seeing the
// test pass. Pure; the page turns the result into a model_catalog row.
export type InferredDefaults = {
  label: string
  note: string
  vision: boolean
  costTier: '低' | '中' | '高'
  allowedSlots: string[]
  omitTemperature: boolean
  maxTokensParam: 'max_tokens' | 'max_completion_tokens'
  pdfInput: 'text' | 'file' | 'image_url'
}

export function inferDefaults(apiKeyEnv: string, id: string, providerLabel?: string | null): InferredDefaults {
  const info = PROVIDER_KEYS[apiKeyEnv]
  const provider = info?.provider || 'openai-compat'
  const l = id.toLowerCase()
  const isAnthropic = provider === 'anthropic'
  const isOpenAI = apiKeyEnv === 'OPENAI_API_KEY'
  const isGemini = apiKeyEnv === 'GEMINI_API_KEY'
  const isDashscope = apiKeyEnv === 'DASHSCOPE_API_KEY'
  const isMoonshot = apiKeyEnv === 'MOONSHOT_API_KEY'
  // Text-only families: DeepSeek and Zhipu chat models; Qwen text lines.
  const textOnly = apiKeyEnv === 'DEEPSEEK_API_KEY' || apiKeyEnv === 'ZHIPU_API_KEY' || /^(glm|deepseek)/.test(l) || /-text\b|qwen-mt/.test(l)
  const vision = !textOnly && (isAnthropic || isOpenAI || isGemini || isMoonshot || (isDashscope && /qwen|omni|vl/.test(l)))
  const costTier: InferredDefaults['costTier'] =
    /nano|lite|mini|flash|haiku|turbo|fast|air/.test(l) ? '低' : /pro|opus|max|ultra|astra/.test(l) ? '高' : '中'
  const reasoningParams = isOpenAI && /^(gpt-5|gpt-6|o\d)/.test(l)
  const pdfInput: InferredDefaults['pdfInput'] = !vision ? 'text' : isGemini ? 'image_url' : isOpenAI || (isDashscope && /qwen3\.[8-9]|qwen[4-9]/.test(l)) ? 'file' : 'text'
  const pretty = id
    .replace(/^models\//, '')
    .split(/[-_]/)
    .map((w) => (/^\d/.test(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ')
    .replace(/\bGpt\b/g, 'GPT').replace(/\bGlm\b/g, 'GLM').replace(/\bQwen\b/g, 'Qwen')
  return {
    label: pretty,
    note: `${providerLabel || info?.label || apiKeyEnv} · 由「发现新模型」加入，默认配置为推断值 — 请核对 vision / 槽位并补单价`,
    vision,
    costTier,
    allowedSlots: vision ? ['turn', 'screening', 'classify', 'forensics'] : ['turn'],
    omitTemperature: reasoningParams || isMoonshot,
    maxTokensParam: reasoningParams ? 'max_completion_tokens' : 'max_tokens',
    pdfInput,
  }
}
