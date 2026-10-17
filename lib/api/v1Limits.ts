// Open API tier 1 · rate-limit table (stage 5 · 2026-10-16,
// design/open-api-contract-2026-10.md「通用」).
//
// One table, read by every /api/v1 route and by the MCP endpoint — routes never
// carry a limit literal of their own. Keys are `X-Client-Id` (optional,
// self-declared, ≤64 chars, no registration) or the caller's IP; both go
// through lib/rateLimit.ts underHourlyLimit, fail-OPEN (this is a cost guard,
// not a mail relay). Pure module: no Next, no Supabase import of its own.
import { underHourlyLimit } from '@/lib/rateLimit'

export const V1_LIMITS = {
  /** Requests per key (client id or IP) per hour, every tier-1 endpoint. */
  perKeyPerHour: 300,
  /** Requests per endpoint, site-wide, per hour. */
  perEndpointPerHour: 5000,
  /** MCP endpoint: per IP per hour (G17 reads this; the table is the one place it lives). */
  mcpPerIpPerHour: 600,
  /** `X-Client-Id` is truncated / rejected past this length. */
  clientIdMaxLen: 64,
} as const

export type V1Endpoint =
  | 'rules'
  | 'listings_compliance'
  | 'lease_terms_check'
  | 'guideline'
  | 'n4_earliest_termination'
  | 'late_payment_persistent'
  | 'rent_benchmark'
  | 'mcp'

const CLIENT_ID_RE = /^[A-Za-z0-9._:@-]{1,64}$/

/** The limiter key for a request: a well-formed `X-Client-Id` wins, else the IP. */
export function clientKeyFor(headers: Headers): string {
  const cid = (headers.get('x-client-id') || '').trim()
  if (cid && cid.length <= V1_LIMITS.clientIdMaxLen && CLIENT_ID_RE.test(cid)) return `cid:${cid}`
  const ip = (headers.get('cf-connecting-ip') || headers.get('x-forwarded-for') || 'unknown').split(',')[0].trim()
  return `ip:${ip || 'unknown'}`
}

/** The two bucket names an endpoint consumes (per key + site-wide). */
export function limitKeys(endpoint: V1Endpoint, clientKey: string): { perKey: string; global: string } {
  return { perKey: `v1:${endpoint}:${clientKey}`, global: `v1:${endpoint}:global` }
}

export type V1LimitResult = { ok: boolean; limit: number; retryAfter: number }

/** Both buckets must be under their hourly limits. Fail-open on limiter outage. */
export async function underV1Limits(endpoint: V1Endpoint, clientKey: string): Promise<V1LimitResult> {
  const keys = limitKeys(endpoint, clientKey)
  const perKeyLimit = endpoint === 'mcp' ? V1_LIMITS.mcpPerIpPerHour : V1_LIMITS.perKeyPerHour
  const [perKey, global] = await Promise.all([
    underHourlyLimit(keys.perKey, perKeyLimit, true),
    underHourlyLimit(keys.global, V1_LIMITS.perEndpointPerHour, true),
  ])
  return { ok: perKey && global, limit: perKeyLimit, retryAfter: 3600 }
}
