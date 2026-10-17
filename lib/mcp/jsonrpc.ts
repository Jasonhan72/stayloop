// Remote MCP · JSON-RPC 2.0 layer (stage 5 · 2026-10-16).
//
// A deliberately small, dependency-free implementation of the MCP methods a
// stateless Streamable HTTP server needs: `initialize`,
// `notifications/initialized` (and any other notification → no response),
// `ping`, `tools/list`, `tools/call`. No sessions, no SSE, no server-initiated
// messages — every request is answered in the same HTTP response, which is
// exactly the shape of a Cloudflare Pages edge route. The official SDK was
// not used on purpose: its streamable transport brings ReadableStream
// plumbing and a lockfile churn we do not need for seven request/response
// tools (design/research/v1/open-api-2026-10.md D5).
//
// Everything here is pure (no Request / Response); app/api/mcp/route.ts does
// HTTP, this file does protocol, lib/mcp/tools.ts does the tools.
import { API_VERSION } from '@/lib/api/v1Http'
import { callTool, MCP_BOUNDARY, MCP_TOOLS, UnknownToolError, type McpToolContext } from './tools'

/** Newest first. `initialize` returns the client's version when it is listed, else the newest. */
export const SUPPORTED_PROTOCOL_VERSIONS = ['2026-07-28', '2025-06-18', '2025-03-26'] as const
export const LATEST_PROTOCOL_VERSION = SUPPORTED_PROTOCOL_VERSIONS[0]

export const SERVER_INFO = { name: 'stayloop', title: 'Stayloop · Ontario & Canada rental rules', version: API_VERSION } as const

export const SERVER_INSTRUCTIONS = [
  'Stayloop exposes deterministic Canadian residential-tenancy rules, date arithmetic and openly licensed rent benchmarks as read-only tools.',
  MCP_BOUNDARY.en,
  MCP_BOUNDARY.zh,
  'Pass terms, dates and amounts only — never names, addresses, contact details or identifiers. When you show a rent benchmark, display its `attribution` field verbatim.',
].join(' ')

export type JsonRpcId = string | number | null

export type JsonRpcRequest = { jsonrpc: '2.0'; id?: JsonRpcId; method: string; params?: unknown }
export type JsonRpcError = { code: number; message: string; data?: unknown }
export type JsonRpcResponse = { jsonrpc: '2.0'; id: JsonRpcId; result?: unknown; error?: JsonRpcError }

export const JSONRPC = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
} as const

export function rpcError(id: JsonRpcId, code: number, message: string, data?: unknown): JsonRpcResponse {
  return { jsonrpc: '2.0', id, error: data === undefined ? { code, message } : { code, message, data } }
}

export function rpcResult(id: JsonRpcId, result: unknown): JsonRpcResponse {
  return { jsonrpc: '2.0', id, result }
}

export function negotiateProtocolVersion(requested: unknown): string {
  return typeof requested === 'string' && (SUPPORTED_PROTOCOL_VERSIONS as readonly string[]).includes(requested) ? requested : LATEST_PROTOCOL_VERSION
}

/** Parse the HTTP body. `batch` = the body was a JSON array (the reply must be an array too). */
export function parseMcpBody(text: string): { ok: true; messages: unknown[]; batch: boolean } | { ok: false; response: JsonRpcResponse } {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { ok: false, response: rpcError(null, JSONRPC.PARSE_ERROR, 'Parse error') }
  }
  if (Array.isArray(parsed)) {
    if (parsed.length === 0) return { ok: false, response: rpcError(null, JSONRPC.INVALID_REQUEST, 'Invalid Request: empty batch') }
    return { ok: true, messages: parsed, batch: true }
  }
  return { ok: true, messages: [parsed], batch: false }
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}

function validId(v: unknown): v is JsonRpcId {
  return v === null || typeof v === 'string' || (typeof v === 'number' && Number.isFinite(v))
}

/**
 * Handle one JSON-RPC message. Returns `null` for notifications (and for
 * responses a client might send us, which we have no use for) — the HTTP
 * layer answers those with 202 and an empty body.
 */
export async function handleMcpMessage(msg: unknown, ctx: McpToolContext): Promise<JsonRpcResponse | null> {
  if (!isPlainObject(msg)) return rpcError(null, JSONRPC.INVALID_REQUEST, 'Invalid Request: expected a JSON-RPC object')
  // A response (result/error without method) from the client: nothing to do.
  if (!('method' in msg) && ('result' in msg || 'error' in msg)) return null
  const id = 'id' in msg ? msg.id : undefined
  if (msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
    return rpcError(validId(id) ? id : null, JSONRPC.INVALID_REQUEST, 'Invalid Request: jsonrpc must be "2.0" and method a string')
  }
  const method = msg.method
  const params = isPlainObject(msg.params) ? msg.params : {}
  const isNotification = id === undefined
  if (method.startsWith('notifications/')) return null
  if (!validId(id)) return rpcError(null, JSONRPC.INVALID_REQUEST, 'Invalid Request: id must be a string, number or null')
  if (isNotification) return null // a request without id is a notification: no reply by definition

  switch (method) {
    case 'initialize':
      return rpcResult(id, {
        protocolVersion: negotiateProtocolVersion(params.protocolVersion),
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
        instructions: SERVER_INSTRUCTIONS,
      })
    case 'ping':
      return rpcResult(id, {})
    case 'tools/list':
      return rpcResult(id, { tools: MCP_TOOLS })
    case 'tools/call': {
      const name = params.name
      if (typeof name !== 'string' || !name) return rpcError(id, JSONRPC.INVALID_PARAMS, 'Invalid params: name is required')
      const args = params.arguments
      if (args !== undefined && !isPlainObject(args)) return rpcError(id, JSONRPC.INVALID_PARAMS, 'Invalid params: arguments must be an object')
      try {
        return rpcResult(id, await callTool(name, args, ctx))
      } catch (err) {
        if (err instanceof UnknownToolError) return rpcError(id, JSONRPC.INVALID_PARAMS, `Unknown tool: ${err.tool}`)
        return rpcError(id, JSONRPC.INTERNAL_ERROR, 'Internal error')
      }
    }
    default:
      return rpcError(id, JSONRPC.METHOD_NOT_FOUND, `Method not found: ${method}`)
  }
}

/** Handle a whole body (single message or batch) in order. `responses` is empty when every message was a notification. */
export async function handleMcpBody(text: string, ctx: McpToolContext): Promise<{ status: number; body: JsonRpcResponse | JsonRpcResponse[] | null }> {
  const parsed = parseMcpBody(text)
  if (!parsed.ok) return { status: 400, body: parsed.response }
  const responses: JsonRpcResponse[] = []
  for (const m of parsed.messages) {
    const r = await handleMcpMessage(m, ctx)
    if (r) responses.push(r)
  }
  if (!responses.length) return { status: 202, body: null }
  if (parsed.batch) return { status: 200, body: responses }
  const only = responses[0]
  // A single malformed message is a 400 like the parse error; a well-formed
  // request that we cannot serve (unknown method / tool) is still a 200 reply.
  return { status: only.error && only.error.code === JSONRPC.INVALID_REQUEST ? 400 : 200, body: only }
}
