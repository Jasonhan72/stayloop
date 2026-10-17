// V1.0 stage 5 · G17 (2026-10-16): the remote MCP endpoint `/api/mcp` —
// JSON-RPC 2.0 over stateless Streamable HTTP, seven tier-1 read-only tools
// that call the same core functions as /api/v1 (design/open-api-contract-2026-10.md「MCP」).
// The route is exercised with plain `new Request`; the benchmark tool with a
// stub client so no test touches the database.
import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'

vi.mock('@/lib/rateLimit', () => ({ underHourlyLimit: async () => true }))

import { POST, GET, DELETE, OPTIONS } from '@/app/api/mcp/route'
import { handleMcpMessage, handleMcpBody, SUPPORTED_PROTOCOL_VERSIONS, LATEST_PROTOCOL_VERSION, negotiateProtocolVersion } from '@/lib/mcp/jsonrpc'
import { MCP_TOOLS, callTool, type McpToolContext } from '@/lib/mcp/tools'
import { validateSchema } from '@/lib/mcp/validate'
import { API_VERSION } from '@/lib/api/v1Http'

const URL_ = 'https://www.stayloop.ai/api/mcp'
const post = (body: unknown, headers: Record<string, string> = {}) =>
  POST(new Request(URL_, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) }))
const rpc = (method: string, params?: unknown, id: string | number = 1) => ({ jsonrpc: '2.0', id, method, ...(params === undefined ? {} : { params }) })
const call = (name: string, args: unknown, id = 1) => rpc('tools/call', { name, arguments: args }, id)

const ctx: McpToolContext = { sb: null }

/** A fake supabase client: statcan query → one asking row; cmhc query → one row in the first requested area. */
function fakeBenchmarkClient(): McpToolContext['sb'] {
  return {
    from: () => {
      const q: Record<string, unknown> = {}
      const b: Record<string, unknown> = {}
      const chain = (k: string) => (...a: unknown[]) => { q[k] = a; return b }
      b.select = chain('select'); b.eq = (col: string, v: unknown) => { q[col] = v; return b }; b.in = chain('in'); b.order = chain('order')
      b.limit = async () => {
        if (q.source === 'statcan') return { data: [{ source: 'statcan', kind: 'asking', period: '2026-Q2', area: 'Toronto CMA', bedrooms: q.bedrooms, avg_rent: '2301', prev_avg: '2350', quality: null }], error: null }
        const areas = (q.in as unknown[] | undefined)?.[1] as string[] | undefined
        if (!areas?.length) return { data: [], error: null }
        return { data: [{ source: 'cmhc', kind: q.kind, period: '2025-10', area: areas[0], bedrooms: q.bedrooms, avg_rent: '1987.5', prev_avg: '1900', quality: 'a' }], error: null }
      }
      return b
    },
  }
}

describe('initialize / ping / protocol versions', () => {
  it('initialize returns the negotiated version, tools capability and serverInfo', async () => {
    const res = await post(rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0' } }))
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toMatch(/application\/json/)
    expect(res.headers.get('x-api-version')).toBe(API_VERSION)
    const j = await res.json()
    expect(j.jsonrpc).toBe('2.0')
    expect(j.id).toBe(1)
    expect(j.result.protocolVersion).toBe('2025-06-18')
    expect(j.result.capabilities).toEqual({ tools: {} })
    expect(j.result.serverInfo).toEqual({ name: 'stayloop', title: 'Stayloop · Ontario & Canada rental rules', version: API_VERSION })
    expect(j.result.instructions).toMatch(/不是法律意见/)
    expect(j.result.instructions).toMatch(/not legal advice/)
  })
  it('an unknown client version gets the newest supported one', () => {
    expect(negotiateProtocolVersion('2024-11-05')).toBe(LATEST_PROTOCOL_VERSION)
    expect(negotiateProtocolVersion(undefined)).toBe(LATEST_PROTOCOL_VERSION)
    expect(SUPPORTED_PROTOCOL_VERSIONS).toEqual(['2026-07-28', '2025-06-18', '2025-03-26'])
  })
  it('notifications/initialized → 202 with an empty body; ping → {}', async () => {
    const n = await post({ jsonrpc: '2.0', method: 'notifications/initialized' })
    expect(n.status).toBe(202)
    expect(await n.text()).toBe('')
    const p = await post(rpc('ping', undefined, 'p1'))
    expect(p.status).toBe(200)
    expect(await p.json()).toEqual({ jsonrpc: '2.0', id: 'p1', result: {} })
  })
  it('echoes MCP-Protocol-Version and ignores Mcp-Session-Id / an SSE-only Accept', async () => {
    const res = await post(rpc('ping'), { 'mcp-protocol-version': '2025-06-18', 'mcp-session-id': 'abc', accept: 'text/event-stream' })
    expect(res.status).toBe(200)
    expect(res.headers.get('mcp-protocol-version')).toBe('2025-06-18')
    expect(res.headers.get('content-type')).toMatch(/application\/json/)
  })
})

describe('tools/list — seven annotated read-only tools', () => {
  it('lists exactly the seven tools of the contract with title + annotations', async () => {
    const res = await post(rpc('tools/list'))
    const j = await res.json()
    const tools = j.result.tools as typeof MCP_TOOLS
    expect(tools.map((t) => t.name)).toEqual(['list_rules', 'check_listing_compliance', 'check_lease_terms', 'rent_increase_guideline', 'n4_earliest_termination', 'persistent_late_payment', 'rent_benchmark'])
    for (const t of tools) {
      expect(t.title.length, t.name).toBeGreaterThan(3)
      expect(t.annotations.readOnlyHint, t.name).toBe(true)
      expect(t.annotations.destructiveHint, t.name).toBe(false)
      expect(t.annotations.idempotentHint, t.name).toBe(true)
      expect(t.annotations.openWorldHint, t.name).toBe(false)
      expect(t.inputSchema.type).toBe('object')
      expect(t.inputSchema.additionalProperties).toBe(false)
      expect(t.description, t.name).toMatch(/not legal advice/)
      expect(t.description, t.name).toMatch(/不是法律意见/)
      expect(t.description, t.name).toMatch(/Source/)
    }
    expect(tools.find((t) => t.name === 'rent_benchmark')!.description).toMatch(/CMHC/)
    expect(tools.find((t) => t.name === 'rent_benchmark')!.description).toMatch(/attribution/)
  })
})

describe('tools/call — one good call and one bad call per tool', () => {
  it('list_rules', async () => {
    const r = await callTool('list_rules', { province: 'QC' }, ctx)
    expect(r.isError).toBeUndefined()
    expect(r.structuredContent!.province).toBe('QC')
    expect((r.structuredContent!.rules as unknown[]).length).toBeGreaterThan(5)
    expect(JSON.parse(r.content[0].text)).toEqual(r.structuredContent)
    const on = await callTool('list_rules', {}, ctx)
    expect(on.structuredContent!.province).toBe('ON')
    const bad = await callTool('list_rules', { province: 'XX' }, ctx)
    expect(bad.isError).toBe(true)
    expect(bad.content[0].text).toMatch(/province/)
  })
  it('check_listing_compliance', async () => {
    const r = await callTool('check_listing_compliance', { monthly_rent: 2500, deposit: 5000, pets_allowed: 'no', description: 'No pets. $50 application fee.' }, ctx)
    expect(r.isError).toBeUndefined()
    expect(r.structuredContent!.passed).toBe(false)
    const ids = (r.structuredContent!.findings as { rule_id: string }[]).map((f) => f.rule_id)
    expect(ids).toContain('RTA-106-deposit-cap')
    expect(ids).toContain('RTA-14-no-pet-clause')
    const bad = await callTool('check_listing_compliance', { monthly_rent: 'lots', extra_field: 1 }, ctx)
    expect(bad.isError).toBe(true)
    expect(bad.content[0].text).toMatch(/monthly_rent/)
    expect(bad.content[0].text).toMatch(/extra_field/)
  })
  it('check_lease_terms', async () => {
    const r = await callTool('check_lease_terms', { rent_amount: 2000, deposit_amount: 2000, form_type: 'trreb', start_date: '2026-11-01', end_date: '2027-10-31' }, ctx)
    expect(r.isError).toBeUndefined()
    expect((r.structuredContent!.findings as { rule_id: string }[]).map((f) => f.rule_id)).toContain('OREG9-18-standard-lease')
    const bad = await callTool('check_lease_terms', { start_date: 'next month' }, ctx)
    expect(bad.isError).toBe(true)
    expect(bad.content[0].text).toMatch(/start_date/)
  })
  it('rent_increase_guideline', async () => {
    const r = await callTool('rent_increase_guideline', { effective: '2027-01-01' }, ctx)
    expect(r.isError).toBeUndefined()
    expect(r.structuredContent).toMatchObject({ province: 'ON', year: 2027, pct: 1.9, published: true, cap: 2.5, n1_deadline: '2026-10-03', notice_days: 90 })
    const bad = await callTool('rent_increase_guideline', {}, ctx)
    expect(bad.isError).toBe(true)
    expect(bad.content[0].text).toMatch(/effective/)
    const notDate = await callTool('rent_increase_guideline', { effective: '2027-02-30' }, ctx)
    expect(notDate.isError).toBe(true)
  })
  it('n4_earliest_termination', async () => {
    const r = await callTool('n4_earliest_termination', { served: '2026-10-16', method: 'mail' }, ctx)
    expect(r.isError).toBeUndefined()
    expect(r.structuredContent).toMatchObject({ served: '2026-10-16', method: 'mail', deemed_served: '2026-10-21', termination_days: 7, mail_days: 5 })
    expect(r.structuredContent!.earliest_termination).toBe('2026-10-28')
    const bad = await callTool('n4_earliest_termination', { served: '2026-10-16', method: 'fax' }, ctx)
    expect(bad.isError).toBe(true)
    expect(bad.content[0].text).toMatch(/method/)
  })
  it('persistent_late_payment', async () => {
    const periods = ['2026-04-01', '2026-05-01', '2026-06-01', '2026-07-01'].map((d) => ({ due_date: d, paid_at: d.replace('-01', '-20') }))
    const r = await callTool('persistent_late_payment', { periods, as_of: '2026-10-16' }, ctx)
    expect(r.isError).toBeUndefined()
    expect(r.structuredContent!.persistent).toBe(true)
    expect((r.structuredContent!.late as string[]).length).toBe(4)
    expect(r.structuredContent!.definition).toEqual({ grace_days: 7, count: 3, window_months: 6 })
    const bad = await callTool('persistent_late_payment', { periods: [{ paid_at: '2026-05-05' }] }, ctx)
    expect(bad.isError).toBe(true)
    expect(bad.content[0].text).toMatch(/due_date/)
    const tooMany = await callTool('persistent_late_payment', { periods: Array.from({ length: 121 }, () => ({ due_date: '2026-01-01', paid_at: null })) }, ctx)
    expect(tooMany.isError).toBe(true)
  })
  it('rent_benchmark with a stub client, and a bad input', async () => {
    const r = await callTool('rent_benchmark', { area: 'Toronto', bedrooms: 1, type: 'apartment' }, { sb: fakeBenchmarkClient() })
    expect(r.isError).toBeUndefined()
    const sc = r.structuredContent as Record<string, unknown>
    expect(sc.province).toBe('ON')
    expect((sc.benchmark as { source: string }).source).toBe('cmhc')
    expect((sc.attribution as { en: string }).en).toMatch(/Canada Mortgage and Housing Corporation/)
    expect((sc.asking as { avg: number }).avg).toBe(2301)
    const bad = await callTool('rent_benchmark', { area: 'Toronto', bedrooms: 'two' }, { sb: fakeBenchmarkClient() })
    expect(bad.isError).toBe(true)
    expect(bad.content[0].text).toMatch(/bedrooms/)
    const qc = await callTool('rent_benchmark', { province: 'QC', bedrooms: 1 }, { sb: fakeBenchmarkClient() })
    expect(qc.isError).toBe(true)
  })
  it('over HTTP: a core ApiError is an isError result, not a protocol error', async () => {
    // 2027-02-30 passes the schema's date pattern; the core's calendar check throws ApiError('invalid_input').
    const res = await post(call('check_lease_terms', { rent_amount: 2000, start_date: '2027-02-30' }))
    expect(res.status).toBe(200)
    const j = await res.json()
    expect(j.error).toBeUndefined()
    expect(j.result.isError).toBe(true)
    expect(j.result.content[0].text).toMatch(/^invalid_input: start_date/)
    expect(j.result.structuredContent).toEqual({ error: 'invalid_input', message: expect.stringMatching(/start_date/) })
  })
  it('unknown tool → -32602; missing name → -32602', async () => {
    const j = await (await post(call('delete_everything', {}))).json()
    expect(j.error.code).toBe(-32602)
    const k = await (await post(rpc('tools/call', { arguments: {} }))).json()
    expect(k.error.code).toBe(-32602)
  })
})

describe('protocol errors and HTTP envelope', () => {
  it('unknown method → -32601 (HTTP 200)', async () => {
    const res = await post(rpc('resources/list'))
    expect(res.status).toBe(200)
    const j = await res.json()
    expect(j.error.code).toBe(-32601)
    expect(j.id).toBe(1)
  })
  it('bad JSON → -32700 (HTTP 400, id null)', async () => {
    const res = await post('{not json')
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } })
  })
  it('a non-request object → -32600', async () => {
    const res = await post({ hello: 'world' })
    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe(-32600)
  })
  it('GET and DELETE → 405 in the tier-1 error shape', async () => {
    for (const fn of [GET, DELETE]) {
      const res = await fn(new Request(URL_, { method: fn === GET ? 'GET' : 'DELETE' }))
      expect(res.status).toBe(405)
      expect(res.headers.get('allow')).toMatch(/POST/)
      const j = await res.json()
      expect(j.error).toBe('method_not_allowed')
      expect(typeof j.message).toBe('string')
    }
  })
  it('OPTIONS → 204 with CORS for the MCP headers', async () => {
    const res = await OPTIONS(new Request(URL_, { method: 'OPTIONS' }))
    expect(res.status).toBe(204)
    expect(res.headers.get('access-control-allow-origin')).toBe('*')
    expect(res.headers.get('access-control-allow-headers')).toMatch(/mcp-protocol-version/)
  })
  it('non-https Origin → 403; https Origin and no Origin pass', async () => {
    expect((await post(rpc('ping'), { origin: 'http://localhost:3000' })).status).toBe(403)
    expect((await post(rpc('ping'), { origin: 'null' })).status).toBe(403)
    expect((await post(rpc('ping'), { origin: 'https://claude.ai' })).status).toBe(200)
    expect((await post(rpc('ping'))).status).toBe(200)
  })
  it('a batch is answered in order as an array; an all-notification batch is 202', async () => {
    const res = await post([rpc('ping', undefined, 'a'), { jsonrpc: '2.0', method: 'notifications/initialized' }, rpc('tools/list', undefined, 'b'), rpc('nope', undefined, 'c')])
    expect(res.status).toBe(200)
    const arr = await res.json()
    expect(Array.isArray(arr)).toBe(true)
    expect(arr.map((r: { id: string }) => r.id)).toEqual(['a', 'b', 'c'])
    expect(arr[1].result.tools.length).toBe(7)
    expect(arr[2].error.code).toBe(-32601)
    const quiet = await post([{ jsonrpc: '2.0', method: 'notifications/initialized' }, { jsonrpc: '2.0', method: 'notifications/cancelled', params: {} }])
    expect(quiet.status).toBe(202)
    const empty = await handleMcpBody('[]', ctx)
    expect(empty.status).toBe(400)
  })
  it('handleMcpMessage is a pure function usable without HTTP', async () => {
    const r = await handleMcpMessage(rpc('ping', undefined, 9), ctx)
    expect(r).toEqual({ jsonrpc: '2.0', id: 9, result: {} })
    expect(await handleMcpMessage({ jsonrpc: '2.0', method: 'notifications/initialized' }, ctx)).toBeNull()
  })
})

describe('schema validator subset', () => {
  it('reports type, enum, additionalProperties, pattern, items and required', () => {
    const s = MCP_TOOLS.find((t) => t.name === 'persistent_late_payment')!.inputSchema
    expect(validateSchema({ periods: [{ due_date: '2026-01-01', paid_at: null }] }, s)).toEqual([])
    const errs = validateSchema({ periods: [{ due_date: 'Jan 1', paid_at: 5, x: 1 }], as_of: 3 }, s)
    expect(errs.join('\n')).toMatch(/periods\[0\]\.due_date must match/)
    expect(errs.join('\n')).toMatch(/periods\[0\]\.paid_at must be string \| null/)
    expect(errs.join('\n')).toMatch(/periods\[0\]\.x is not an accepted property/)
    expect(errs.join('\n')).toMatch(/as_of must be string/)
    expect(validateSchema({}, s)).toEqual(['$.periods is required'])
  })
})

describe('published artefacts', () => {
  it('public/.well-known/mcp/server.json parses and points at the endpoint', () => {
    const j = JSON.parse(readFileSync('public/.well-known/mcp/server.json', 'utf8'))
    expect(j.$schema).toMatch(/^https:\/\/static\.modelcontextprotocol\.io\/schemas\/.*server\.schema\.json$/)
    expect(j.name).toBe('ai.stayloop/rules')
    expect(j.name).toMatch(/^[a-zA-Z0-9.-]+\/[a-zA-Z0-9._-]+$/)
    expect(j.version).toBe(API_VERSION)
    expect(typeof j.description).toBe('string')
    expect(j.description.length).toBeLessThanOrEqual(100)
    expect(j.remotes).toEqual([{ type: 'streamable-http', url: 'https://www.stayloop.ai/api/mcp' }])
    expect(j.websiteUrl).toBe('https://www.stayloop.ai/stayloop-api')
  })
  it('the directory submission note has the Claude Code command, the Cursor snippet and the curl checks', () => {
    const md = readFileSync('design/mcp-directory-submission-2026-10.md', 'utf8')
    expect(md).toContain('claude mcp add --transport http stayloop https://www.stayloop.ai/api/mcp')
    expect(md).toContain('"url": "https://www.stayloop.ai/api/mcp"')
    expect(md).toContain('https://www.stayloop.ai/privacy')
    expect(md).toContain('https://www.stayloop.ai/stayloop-api/docs')
    expect(md).toContain('hello@stayloop.ai')
    expect(md).toContain('mcp-registry-auth')
    expect((md.match(/curl /g) || []).length).toBeGreaterThanOrEqual(3)
    for (const t of MCP_TOOLS) expect(md, t.name).toContain(t.name)
  })
  it('route-audit has the three MCP probes', () => {
    const js = readFileSync('scripts/route-audit.mjs', 'utf8')
    expect(js).toMatch(/mcp GET → 405/)
    expect(js).toMatch(/mcp initialize/)
    expect(js).toMatch(/mcp tools\/list/)
  })
})
