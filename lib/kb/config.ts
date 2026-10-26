// Knowledge base · feature switch + retrieval settings (app_config key 'kb'), server-only, 60 s cache.
// Defaults keep the feature OFF when the row is missing or unreadable: retrieval never breaks a turn.
import { createClient } from '@supabase/supabase-js'
import { DEFAULT_EMBED_MODEL, EMBED_DIMS } from '@/lib/llmEmbed'

export type KbConfig = {
  enabled: boolean
  audience: 'test' | 'all'
  allowUserIds: string[]
  embedModel: string
  dims: number
  topK: number
  maxChars: number
}

export const KB_DEFAULTS: KbConfig = { enabled: false, audience: 'test', allowUserIds: [], embedModel: DEFAULT_EMBED_MODEL, dims: EMBED_DIMS, topK: 6, maxChars: 6000 }

/** Pure: a raw app_config value → a sane config (dirty values fall back per field). Exported for tests. */
export function parseKbConfig(raw: unknown): KbConfig {
  const v = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const num = (x: unknown, d: number, lo: number, hi: number) => (typeof x === 'number' && Number.isFinite(x) ? Math.min(hi, Math.max(lo, Math.round(x))) : d)
  return {
    enabled: v.enabled === true,
    audience: v.audience === 'all' ? 'all' : 'test',
    allowUserIds: Array.isArray(v.allow_user_ids) ? v.allow_user_ids.filter((x): x is string => typeof x === 'string' && /^[0-9a-f-]{36}$/i.test(x)) : [],
    embedModel: typeof v.embed_model === 'string' && v.embed_model ? v.embed_model : DEFAULT_EMBED_MODEL,
    dims: num(v.dims, EMBED_DIMS, 256, 3072),
    topK: num(v.top_k, 6, 1, 12),
    maxChars: num(v.max_chars, 6000, 1000, 12000),
  }
}

/** Pure: who gets retrieval. 'test' → listed ids only; 'all' → every signed-in user and the anonymous preview. */
export function kbEnabledFor(cfg: KbConfig, who: { userId: string | null; anonymous: boolean }): boolean {
  if (!cfg.enabled) return false
  if (cfg.audience === 'all') return true
  return !who.anonymous && !!who.userId && cfg.allowUserIds.includes(who.userId)
}

let cache: { value: KbConfig; at: number } | null = null
const TTL_MS = 60_000

export async function loadKbConfig(): Promise<KbConfig> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return KB_DEFAULTS
  try {
    const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
    const { data, error } = await sb.from('app_config').select('value').eq('key', 'kb').maybeSingle()
    if (error) throw error
    const value = parseKbConfig(data?.value)
    cache = { value, at: Date.now() }
    return value
  } catch {
    cache = { value: cache?.value ?? KB_DEFAULTS, at: Date.now() }
    return cache.value
  }
}
