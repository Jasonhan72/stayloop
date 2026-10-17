// Open API tier 1 · HTTP envelope (stage 5 · 2026-10-16,
// design/open-api-contract-2026-10.md「通用」).
//
// Every /api/v1 tier-1 route is `handleV1(req, endpoint, fn)`: it applies the
// shared limiter (lib/api/v1Limits.ts), turns ApiError into the one error body
// `{ error, message, retry_after? }`, and stamps `x-api-version`,
// `X-RateLimit-Limit` and CORS on every response. Validators here are what the
// core functions (lib/api/v1Core.ts) and the MCP tools (G17) use, so a bad
// input is rejected the same way whichever door it comes through.
//
// Plain `Response` on purpose — no Next import, so the MCP route and the
// vitest guard can use the same helpers without a framework shim.
import { clientKeyFor, underV1Limits, type V1Endpoint } from '@/lib/api/v1Limits'

/** Date version of the API; `x-api-version` on every response, `info.version` in the OpenAPI document. */
export const API_VERSION = '2026-10-16'
/** Snapshot date of the rule tables the answers come from; `as_of` in every response body. */
export const RULES_AS_OF = '2026-10-16'

/** The fixed boundary sentence every tier-1 response carries (contract wording). */
export const BOUNDARY = {
  zh: '只做确定性规则与日期算术，不是法律意见；不选表、不建议是否发出任何通知；不接受也不存储个人信息。',
  en: 'Deterministic rules and date arithmetic only, not legal advice; it does not pick forms or advise whether to serve any notice; it accepts and stores no personal information.',
} as const

export type ApiErrorCode = 'invalid_json' | 'invalid_input' | 'unsupported_province' | 'not_available' | 'rate_limited' | 'method_not_allowed'

export class ApiError extends Error {
  code: ApiErrorCode
  status: number
  retryAfter?: number
  constructor(code: ApiErrorCode, message: string, status = 400, retryAfter?: number) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
    this.retryAfter = retryAfter
  }
}

export type ApiErrorBody = { error: ApiErrorCode; message: string; retry_after?: number }

export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type,x-client-id,x-api-key',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Max-Age': '86400',
} as const

/** Headers every tier-1 response carries. `limit` = the per-key hourly limit that applied. */
export function v1Headers(limit?: number, extra: Record<string, string> = {}): Record<string, string> {
  return {
    ...CORS_HEADERS,
    'x-api-version': API_VERSION,
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'no-store',
    ...(limit != null ? { 'X-RateLimit-Limit': String(limit) } : {}),
    ...extra,
  }
}

export function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...headers } })
}

/** The unified error response. Any non-ApiError becomes a 500 `not_available` without leaking its message. */
export function errorResponse(err: unknown, limit?: number): Response {
  const e = err instanceof ApiError ? err : new ApiError('not_available', 'The service could not answer this request.', 500)
  const body: ApiErrorBody = { error: e.code, message: e.message }
  const extra: Record<string, string> = {}
  if (e.retryAfter != null) {
    body.retry_after = e.retryAfter
    extra['Retry-After'] = String(e.retryAfter)
  }
  return jsonResponse(body, e.status, v1Headers(limit, extra))
}

/** `OPTIONS` → 204 with the CORS headers. */
export function optionsResponse(): Response {
  return new Response(null, { status: 204, headers: v1Headers() })
}

/** A handler for the methods a route does not serve (`export const POST = methodNotAllowed`). */
export function methodNotAllowed(req: Request): Response {
  return errorResponse(new ApiError('method_not_allowed', `${req.method} is not allowed on this endpoint.`, 405))
}

export type V1Context = { req: Request; url: URL; clientKey: string }

/**
 * Wrap a tier-1 endpoint: limiter → handler → envelope. `fn` returns the
 * response body (an object); `as_of` and `boundary` are added here so no
 * route can forget them. Throw ApiError for 4xx.
 */
export async function handleV1(req: Request, endpoint: V1Endpoint, fn: (ctx: V1Context) => Promise<Record<string, unknown>> | Record<string, unknown>): Promise<Response> {
  if (req.method === 'OPTIONS') return optionsResponse()
  const clientKey = clientKeyFor(req.headers)
  const lim = await underV1Limits(endpoint, clientKey)
  if (!lim.ok) return errorResponse(new ApiError('rate_limited', 'Too many requests for this client this hour.', 429, lim.retryAfter), lim.limit)
  try {
    const body = await fn({ req, url: new URL(req.url), clientKey })
    return jsonResponse({ ...body, as_of: RULES_AS_OF, boundary: BOUNDARY }, 200, v1Headers(lim.limit))
  } catch (err) {
    return errorResponse(err, lim.limit)
  }
}

// ── Input readers / validators ─────────────────────────────────────────────

/** Parse a JSON object body; anything else is `invalid_json`. */
export async function readJsonObject(req: Request): Promise<Record<string, unknown>> {
  let v: unknown
  try {
    v = await req.json()
  } catch {
    throw new ApiError('invalid_json', 'Request body must be a JSON object.')
  }
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new ApiError('invalid_json', 'Request body must be a JSON object.')
  return v as Record<string, unknown>
}

/** Query string → plain object (first value per key). */
export function queryObject(url: URL): Record<string, unknown> {
  const o: Record<string, unknown> = {}
  url.searchParams.forEach((v, k) => { if (!(k in o)) o[k] = v })
  return o
}

export const STRING_MAX = 2000
export const PERIODS_MAX = 120
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function invalid(field: string, why: string): ApiError {
  return new ApiError('invalid_input', `${field}: ${why}`)
}

const isEmpty = (v: unknown) => v == null || v === ''

/** Finite number within [min, max]; absent → null (or error when required). Strings are coerced ("2500"). */
export function vNumber(o: Record<string, unknown>, field: string, opt: { min?: number; max?: number; integer?: boolean; required?: boolean } = {}): number | null {
  const v = o[field]
  if (isEmpty(v)) {
    if (opt.required) throw invalid(field, 'is required')
    return null
  }
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN
  if (!Number.isFinite(n)) throw invalid(field, 'must be a number')
  if (opt.integer && !Number.isInteger(n)) throw invalid(field, 'must be an integer')
  if (opt.min != null && n < opt.min) throw invalid(field, `must be ≥ ${opt.min}`)
  if (opt.max != null && n > opt.max) throw invalid(field, `must be ≤ ${opt.max}`)
  return n
}

/** String at most `max` chars; absent → null (or error when required). */
export function vString(o: Record<string, unknown>, field: string, opt: { max?: number; required?: boolean } = {}): string | null {
  const v = o[field]
  if (isEmpty(v)) {
    if (opt.required) throw invalid(field, 'is required')
    return null
  }
  if (typeof v !== 'string') throw invalid(field, 'must be a string')
  const max = opt.max ?? STRING_MAX
  if (v.length > max) throw invalid(field, `must be at most ${max} characters`)
  return v
}

/** One of the allowed values; absent → `fallback` (null when none given, error when required). */
export function vEnum<T extends string>(o: Record<string, unknown>, field: string, allowed: readonly T[], opt: { required?: boolean; fallback?: T } = {}): T | null {
  const v = o[field]
  if (isEmpty(v)) {
    if (opt.required) throw invalid(field, 'is required')
    return opt.fallback ?? null
  }
  if (typeof v !== 'string' || !(allowed as readonly string[]).includes(v)) throw invalid(field, `must be one of ${allowed.join(' | ')}`)
  return v as T
}

/** Calendar date `YYYY-MM-DD` that really exists (2026-02-30 is rejected). */
export function vDate(o: Record<string, unknown>, field: string, opt: { required?: boolean } = {}): string | null {
  const v = o[field]
  if (isEmpty(v)) {
    if (opt.required) throw invalid(field, 'is required')
    return null
  }
  if (typeof v !== 'string' || !DATE_RE.test(v)) throw invalid(field, 'must be a date formatted YYYY-MM-DD')
  if (!isRealDate(v)) throw invalid(field, 'is not a calendar date')
  return v
}

/** A date (`YYYY-MM-DD`) or an ISO date-time; returned as given. */
export function vDateTime(o: Record<string, unknown>, field: string, opt: { required?: boolean } = {}): string | null {
  const v = o[field]
  if (isEmpty(v)) {
    if (opt.required) throw invalid(field, 'is required')
    return null
  }
  if (typeof v !== 'string' || v.length > 40) throw invalid(field, 'must be a date (YYYY-MM-DD) or ISO date-time')
  if (DATE_RE.test(v)) {
    if (!isRealDate(v)) throw invalid(field, 'is not a calendar date')
    return v
  }
  if (!/^\d{4}-\d{2}-\d{2}T/.test(v) || !Number.isFinite(new Date(v).getTime())) throw invalid(field, 'must be a date (YYYY-MM-DD) or ISO date-time')
  return v
}

export function isRealDate(s: string): boolean {
  if (!DATE_RE.test(s)) return false
  const d = new Date(`${s}T00:00:00Z`)
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === s
}

/** Array of at most `max` items; absent → error when required. */
export function vArray(o: Record<string, unknown>, field: string, opt: { max: number; required?: boolean; min?: number }): unknown[] {
  const v = o[field]
  if (isEmpty(v)) {
    if (opt.required) throw invalid(field, 'is required')
    return []
  }
  if (!Array.isArray(v)) throw invalid(field, 'must be an array')
  if (opt.min != null && v.length < opt.min) throw invalid(field, `must have at least ${opt.min} item(s)`)
  if (v.length > opt.max) throw invalid(field, `must have at most ${opt.max} items`)
  return v
}
