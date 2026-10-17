// POST /api/mcp — Stayloop's remote MCP server (Streamable HTTP, stateless,
// JSON responses only). Stage 5 · 2026-10-16, design/open-api-contract-2026-10.md「MCP」.
//
// Tier 1 only: no authentication, no session, no SSE. Each POST carries one
// JSON-RPC message (or a batch) and gets its reply in the same response;
// notifications get 202 with an empty body. Protocol handling lives in
// lib/mcp/jsonrpc.ts and the tool table in lib/mcp/tools.ts — this file is
// only the HTTP envelope: Origin check (DNS-rebinding guard), the shared
// tier-1 limiter keyed by X-Client-Id or IP, CORS, version headers.
//
// `Mcp-Session-Id` is ignored (stateless); `MCP-Protocol-Version` is echoed
// back; a missing or SSE-only `Accept` header is tolerated (we never stream,
// so there is nothing to negotiate). GET / DELETE → 405 in the tier-1 error
// shape.
import { createClient } from '@supabase/supabase-js'
import { ApiError, errorResponse, jsonResponse, v1Headers } from '@/lib/api/v1Http'
import { clientKeyFor, underV1Limits, V1_LIMITS } from '@/lib/api/v1Limits'
import { handleMcpBody } from '@/lib/mcp/jsonrpc'
import type { McpToolContext } from '@/lib/mcp/tools'
import type { BenchmarkClient } from '@/lib/api/v1Core'

export const runtime = 'edge'

const ALLOW_HEADERS = 'content-type,accept,x-client-id,mcp-protocol-version,mcp-session-id'
const MAX_BODY_BYTES = 256 * 1024

function mcpHeaders(req: Request, limit?: number): Record<string, string> {
  const extra: Record<string, string> = { 'Access-Control-Allow-Headers': ALLOW_HEADERS, 'Access-Control-Allow-Methods': 'POST,OPTIONS' }
  const pv = (req.headers.get('mcp-protocol-version') || '').trim()
  if (pv && /^[\x21-\x7e]{1,32}$/.test(pv)) extra['MCP-Protocol-Version'] = pv
  return v1Headers(limit, extra)
}

/** A read-only client for the benchmark table; null when the env is absent (tests, misconfigured preview) — the core then uses the anon REST reader. */
function benchmarkClient(): BenchmarkClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: { ...mcpHeaders(req), Allow: 'POST, OPTIONS' } })
}

function notAllowed(req: Request): Response {
  const res = errorResponse(new ApiError('method_not_allowed', `${req.method} is not allowed on the MCP endpoint; send JSON-RPC by POST.`, 405))
  const h = new Headers(res.headers)
  for (const [k, v] of Object.entries(mcpHeaders(req))) h.set(k, v)
  h.set('Allow', 'POST, OPTIONS')
  return new Response(res.body, { status: 405, headers: h })
}

export const GET = notAllowed
export const DELETE = notAllowed
export const PUT = notAllowed
export const PATCH = notAllowed

export async function POST(req: Request) {
  // Origin: browsers send it; a non-https origin means a local page is trying
  // to reach us through the user's network position (DNS rebinding) — refuse.
  const origin = req.headers.get('origin')
  if (origin != null && !/^https:\/\//i.test(origin.trim())) {
    return jsonResponse({ error: 'forbidden', message: 'Origin must be https.' }, 403, mcpHeaders(req))
  }

  const key = clientKeyFor(req.headers)
  const lim = await underV1Limits('mcp', key)
  if (!lim.ok) {
    const res = errorResponse(new ApiError('rate_limited', 'Too many MCP requests for this client this hour.', 429, lim.retryAfter), lim.limit)
    const h = new Headers(res.headers)
    for (const [k, v] of Object.entries(mcpHeaders(req, lim.limit))) h.set(k, v)
    return new Response(res.body, { status: 429, headers: h })
  }

  const text = await req.text()
  if (text.length > MAX_BODY_BYTES) {
    return jsonResponse({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid Request: body too large' } }, 413, mcpHeaders(req, lim.limit))
  }
  const ctx: McpToolContext = { sb: benchmarkClient() }
  const { status, body } = await handleMcpBody(text, ctx)
  const headers = mcpHeaders(req, V1_LIMITS.mcpPerIpPerHour)
  if (body === null) return new Response(null, { status, headers })
  return jsonResponse(body, status, headers)
}
