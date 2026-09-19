// Durable per-key hourly limiter for routes that send mail or spend model /
// scraping credit (review 2026-09-19). Reuses the hourly-bucket RPC that
// already backs the anonymous agent quota (`bump_anon_rate_limit`,
// service-role only, migration 20260713) — the key just has to be ≥16 chars,
// so callers pass `<route>:<user id or fixed name>`.
//
// `failOpen` decides what a limiter outage means: mail relays fail CLOSED
// (no limiter, no send); cost guards fail OPEN (a DB blip must not take the
// product down).
import { createClient } from '@supabase/supabase-js'

export async function underHourlyLimit(key: string, limit: number, failOpen: boolean): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) return failOpen
  const padded = key.length >= 16 ? key : key.padEnd(16, '-')
  try {
    const svc = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
    const { data, error } = await svc.rpc('bump_anon_rate_limit', { p_key: padded, p_limit: limit })
    if (error) return failOpen
    return data === true
  } catch {
    return failOpen
  }
}
