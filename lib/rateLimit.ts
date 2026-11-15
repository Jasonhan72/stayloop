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

/** The caller's IP as Cloudflare reports it (first hop of x-forwarded-for elsewhere). */
export function requestIp(headers: Headers): string {
  return (headers.get('cf-connecting-ip') || (headers.get('x-forwarded-for') || '').split(',')[0] || '').trim() || 'unknown'
}

/**
 * The limiter bucket for an IP: an IPv6 address counts as its /64 — one subscriber owns
 * the whole block and can rotate through it for free — an IPv4 address as itself.
 */
export function ipBucket(ip: string): string {
  const v = (ip || '').trim().toLowerCase()
  if (!v) return 'unknown'
  if (!v.includes(':')) return v
  if (v.includes('.')) return v.slice(v.lastIndexOf(':') + 1) // ::ffff:1.2.3.4
  const [head, tail] = v.split('::') as [string, string | undefined]
  const h = head ? head.split(':') : []
  const t = tail ? tail.split(':') : []
  const groups = tail === undefined ? h : [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill('0'), ...t]
  return groups.slice(0, 4).map((g) => g.replace(/^0+(?=.)/, '')).join(':') + '::/64'
}

/**
 * The gate for an endpoint that sends mail (code review 2026-11-15, S2-13): the caller's
 * own bucket AND one site-wide bucket, both fail-CLOSED — no limiter, no send. A caller
 * who rotates addresses still runs into the site-wide ceiling.
 */
export async function underMailLimits(route: string, caller: string, perCallerPerHour: number, siteWidePerHour: number): Promise<boolean> {
  const [mine, all] = await Promise.all([
    underHourlyLimit(`${route}:${caller}`, perCallerPerHour, false),
    underHourlyLimit(`${route}:site-wide`, siteWidePerHour, false),
  ])
  return mine && all
}

/**
 * The gate for a public read that costs database or model time (code review 2026-11-15,
 * S3-11): the caller's own bucket AND one site-wide bucket, both fail-OPEN — a limiter
 * outage must not take the listings pages down. The site-wide bucket is the ceiling for a
 * caller who rotates addresses; set it far above honest traffic.
 */
export async function underCostLimits(route: string, caller: string, perCallerPerHour: number, siteWidePerHour: number): Promise<boolean> {
  const [mine, all] = await Promise.all([
    underHourlyLimit(`${route}:${caller}`, perCallerPerHour, true),
    underHourlyLimit(`${route}:site-wide`, siteWidePerHour, true),
  ])
  return mine && all
}
