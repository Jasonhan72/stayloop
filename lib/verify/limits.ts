// Hourly limits on the public /api/verify/<token>/* routes (B3, 2026-10-19). Every call
// to /start or /bank spends provider calls Stayloop pays for (Flinks, Veriff), and the
// token is the only credential, so each route counts per token, per IP and site-wide.
// Cost guards fail OPEN (CLAUDE.md 工程规则): a limiter outage must not block applicants.
import { underHourlyLimit } from '@/lib/rateLimit'

export type VerifyRoute = 'start' | 'bank' | 'bank-poll'

export const VERIFY_LIMITS: Record<VerifyRoute, { perToken: number; perIp: number; global: number }> = {
  // Opening a provider session: a few retries per step is plenty.
  start: { perToken: 12, perIp: 30, global: 600 },
  // Exchanging a loginId: one per successful Connect, a handful of retries.
  bank: { perToken: 6, perIp: 15, global: 300 },
  // The page polls every 5 s for about 10 minutes (120 calls); a reopened page polls again.
  'bank-poll': { perToken: 150, perIp: 300, global: 6000 },
}

export function clientIp(headers: Headers): string {
  return headers.get('cf-connecting-ip') || (headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'anon'
}

/** The three bucket keys for one call (each ≥16 chars, as the limiter requires). */
export function verifyLimitKeys(route: VerifyRoute, token: string, ip: string): { token: string; ip: string; global: string } {
  return {
    token: `verify-${route}:t:${token.slice(0, 32)}`,
    ip: `verify-${route}:ip:${ip}`,
    global: `verify-${route}:global`,
  }
}

export async function underVerifyLimits(route: VerifyRoute, token: string, headers: Headers): Promise<boolean> {
  const k = verifyLimitKeys(route, token, clientIp(headers))
  const l = VERIFY_LIMITS[route]
  const [a, b, c] = await Promise.all([
    underHourlyLimit(k.token, l.perToken, true),
    underHourlyLimit(k.ip, l.perIp, true),
    underHourlyLimit(k.global, l.global, true),
  ])
  return a && b && c
}
