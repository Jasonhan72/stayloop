// AI 助理的邮箱 · the switch (app_config key 'assistant_mail'), server-only, 60 s cache.
// Off when the row is missing or unreadable. audience 'test' = admins and accounts on our own
// domain (the test accounts) — decided from the email address and admin_users, never from
// user_metadata, which a person can write themselves. 'all' = every signed-in account.
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { DEFAULT_MAIL_DOMAIN, isMailDomain, type MailDomain } from './address'

export type MailConfig = { enabled: boolean; audience: 'test' | 'all'; domain: MailDomain }
export const MAIL_CONFIG_DEFAULTS: MailConfig = { enabled: false, audience: 'test', domain: DEFAULT_MAIL_DOMAIN }

/** Pure: a raw app_config value → a sane config. Exported for tests. */
export function parseMailConfig(raw: unknown): MailConfig {
  const v = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  return {
    enabled: v.enabled === true,
    audience: v.audience === 'all' ? 'all' : 'test',
    domain: isMailDomain(v.domain) ? v.domain : DEFAULT_MAIL_DOMAIN,
  }
}

/** Pure: may this account have a mailbox? */
export function mailAvailableFor(cfg: MailConfig, who: { email: string | null | undefined; isAdmin: boolean }): boolean {
  if (!cfg.enabled) return false
  if (cfg.audience === 'all') return true
  return who.isAdmin || /@stayloop\.ai$/i.test((who.email ?? '').trim())
}

let cache: { value: MailConfig; at: number } | null = null
const TTL_MS = 60_000

export async function loadMailConfig(admin?: SupabaseClient): Promise<MailConfig> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!admin && (!url || !key)) return MAIL_CONFIG_DEFAULTS
  try {
    const sb = admin ?? createClient(url as string, key as string, { auth: { persistSession: false, autoRefreshToken: false } })
    const { data, error } = await sb.from('app_config').select('value').eq('key', 'assistant_mail').maybeSingle()
    if (error) throw error
    const value = parseMailConfig((data as { value?: unknown } | null)?.value)
    cache = { value, at: Date.now() }
    return value
  } catch {
    cache = { value: cache?.value ?? MAIL_CONFIG_DEFAULTS, at: Date.now() }
    return cache.value
  }
}
