// V1.0 stage 5 · G16 (2026-10-16): the tier-1 REST API — seven endpoints over
// lib/api/v1Core.ts, the shared envelope in lib/api/v1Http.ts, the one
// rate-limit table in lib/api/v1Limits.ts and the OpenAPI 3.1 document in
// lib/api/openapi.ts (design/open-api-contract-2026-10.md). Routes are driven
// with `new Request(...)` straight into their handlers; the limiter and
// Supabase are mocked so nothing leaves the process.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  limitOk: true,
  limitCalls: [] as { key: string; limit: number; failOpen: boolean }[],
  rows: [] as Record<string, unknown>[],
  inserts: [] as unknown[],
}))

vi.mock('@/lib/rateLimit', () => ({
  underHourlyLimit: async (key: string, limit: number, failOpen: boolean) => { h.limitCalls.push({ key, limit, failOpen }); return h.limitOk },
}))

// Minimal supabase-js stand-in: the benchmark query chain + the telemetry insert.
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table: string) => {
      const filters: Record<string, unknown> = {}
      const q: Record<string, unknown> = {
        select: () => q,
        eq: (k: string, v: unknown) => { filters[k] = v; return q },
        in: (k: string, v: unknown) => { filters[k] = v; return q },
        order: () => q,
        limit: async () => ({
          data: table === 'rent_benchmarks'
            ? h.rows.filter((r) => Object.entries(filters).every(([k, v]) => k === 'area_key' ? (v as string[]).includes(String(r.area).toLowerCase()) : r[k] === v))
            : [],
          error: null,
        }),
        insert: async (v: unknown) => { h.inserts.push(v); return { error: null } },
      }
      return q
    },
  }),
}))

import { API_VERSION, RULES_AS_OF, BOUNDARY, ApiError } from '@/lib/api/v1Http'
import { V1_LIMITS, clientKeyFor, limitKeys } from '@/lib/api/v1Limits'
import { OPENAPI, OPENAPI_ENDPOINTS } from '@/lib/api/openapi'
import { coreRules, coreListingCompliance, coreLeaseTermsCheck, coreGuideline, coreN4EarliestTermination, corePersistentLatePayment, coreRentBenchmark } from '@/lib/api/v1Core'
import { PROVINCE_CODES } from '@/lib/provinces/detect'
import { ONTARIO_RULES } from '@/lib/ontario/rules'

const BASE = 'http://localhost/api/v1'
const J = { 'content-type': 'application/json' }
const get = (path: string, headers: Record<string, string> = {}) => new Request(`${BASE}${path}`, { method: 'GET', headers })
const post = (path: string, body: unknown, headers: Record<string, string> = {}) => new Request(`${BASE}${path}`, { method: 'POST', headers: { ...J, ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) })
const json = async (res: Response) => ({ status: res.status, headers: res.headers, body: await res.json() })

beforeEach(() => {
  h.limitOk = true
  h.limitCalls = []
  h.rows = []
  h.inserts = []
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://auth.example.test'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test'
})

const routes = {
  rules: () => import('@/app/api/v1/rules/route'),
  compliance: () => import('@/app/api/v1/listings/compliance/route'),
  lease: () => import('@/app/api/v1/lease/terms-check/route'),
  guideline: () => import('@/app/api/v1/guideline/route'),
  n4: () => import('@/app/api/v1/n4/earliest-termination/route'),
  late: () => import('@/app/api/v1/late-payment/persistent/route'),
  bench: () => import('@/app/api/v1/rent-benchmark/route'),
  openapi: () => import('@/app/api/v1/openapi.json/route'),
}

function expectEnvelope(r: { status: number; headers: Headers; body: Record<string, unknown> }) {
  expect(r.status).toBe(200)
  expect(r.headers.get('x-api-version')).toBe(API_VERSION)
  expect(r.headers.get('x-ratelimit-limit')).toBe(String(V1_LIMITS.perKeyPerHour))
  expect(r.headers.get('access-control-allow-origin')).toBe('*')
  expect(r.body.as_of).toBe(RULES_AS_OF)
  expect(r.body.boundary).toEqual(BOUNDARY)
}

function expectError(r: { status: number; headers: Headers; body: Record<string, unknown> }, status: number, code: string) {
  expect(r.status).toBe(status)
  expect(r.headers.get('x-api-version')).toBe(API_VERSION)
  expect(Object.keys(r.body).sort()).toEqual(status === 429 ? ['error', 'message', 'retry_after'] : ['error', 'message'])
  expect(r.body.error).toBe(code)
  expect(typeof r.body.message).toBe('string')
}

// ── Constants & envelope ─────────────────────────────────────────────────────

describe('contract constants', () => {
  it('API_VERSION / RULES_AS_OF / boundary wording', () => {
    expect(API_VERSION).toBe('2026-10-16')
    expect(RULES_AS_OF).toBe('2026-10-16')
    expect(BOUNDARY.zh).toContain('不是法律意见')
    expect(BOUNDARY.zh).toContain('不接受也不存储个人信息')
    expect(BOUNDARY.en).toMatch(/not legal advice/)
  })
  it('limit table: 300 per key, 5000 per endpoint, X-Client-Id ≤64', () => {
    expect(V1_LIMITS.perKeyPerHour).toBe(300)
    expect(V1_LIMITS.perEndpointPerHour).toBe(5000)
    expect(V1_LIMITS.clientIdMaxLen).toBe(64)
  })
  it('key: a well-formed X-Client-Id wins, otherwise the IP; oversized / odd ids fall back to IP', () => {
    expect(clientKeyFor(new Headers({ 'x-client-id': 'acme-bot', 'cf-connecting-ip': '1.2.3.4' }))).toBe('cid:acme-bot')
    expect(clientKeyFor(new Headers({ 'cf-connecting-ip': '1.2.3.4' }))).toBe('ip:1.2.3.4')
    expect(clientKeyFor(new Headers({ 'x-client-id': 'x'.repeat(65), 'x-forwarded-for': '9.9.9.9, 10.0.0.1' }))).toBe('ip:9.9.9.9')
    expect(clientKeyFor(new Headers({ 'x-client-id': 'has space', 'cf-connecting-ip': '1.1.1.1' }))).toBe('ip:1.1.1.1')
    expect(limitKeys('rules', 'ip:1.1.1.1')).toEqual({ perKey: 'v1:rules:ip:1.1.1.1', global: 'v1:rules:global' })
  })
  it('routes never hard-code the limit numbers', () => {
    const files: string[] = []
    const walk = (d: string) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (f === 'route.ts') files.push(p) } }
    walk('app/api/v1')
    for (const f of files.filter((p) => !p.includes('passport') && !p.includes('/screen/'))) {
      const src = readFileSync(f, 'utf8')
      expect(src, f).not.toMatch(/\b(120|300|5000|600)\b/)
      expect(src, f).not.toMatch(/underHourlyLimit\(/)
    }
    expect(files.length).toBeGreaterThanOrEqual(9)
  })
})

describe('envelope · OPTIONS · 405 · 429', () => {
  it('OPTIONS → 204 with CORS on every tier-1 route', async () => {
    for (const load of Object.values(routes)) {
      const mod = await load()
      const res = await mod.OPTIONS()
      expect(res.status).toBe(204)
      expect(res.headers.get('access-control-allow-origin')).toBe('*')
    }
  })
  it('wrong method → 405 method_not_allowed', async () => {
    const r1 = await json(await (await routes.rules()).POST(post('/rules', {})))
    expectError(r1, 405, 'method_not_allowed')
    const r2 = await json(await (await routes.compliance()).GET(get('/listings/compliance')))
    expectError(r2, 405, 'method_not_allowed')
  })
  it('limiter says no → 429 with Retry-After and retry_after', async () => {
    h.limitOk = false
    const r = await json(await (await routes.guideline()).GET(get('/guideline?effective=2027-01-01')))
    expectError(r, 429, 'rate_limited')
    expect(r.headers.get('retry-after')).toBe('3600')
    expect(r.body.retry_after).toBe(3600)
  })
  it('both buckets are consulted through the shared limiter, fail-open, keyed by X-Client-Id', async () => {
    await (await routes.rules()).GET(get('/rules', { 'x-client-id': 'acme' }))
    expect(h.limitCalls.map((c) => c.key).sort()).toEqual(['v1:rules:cid:acme', 'v1:rules:global'])
    expect(h.limitCalls.every((c) => c.failOpen)).toBe(true)
    expect(h.limitCalls.find((c) => c.key.endsWith(':global'))!.limit).toBe(V1_LIMITS.perEndpointPerHour)
  })
})

// ── /rules ───────────────────────────────────────────────────────────────────

describe('GET /rules', () => {
  it('default province is Ontario; rules mirror ONTARIO_RULES', async () => {
    const r = await json(await (await routes.rules()).GET(get('/rules')))
    expectEnvelope(r)
    expect(r.body.province).toBe('ON')
    const rules = r.body.rules as Record<string, unknown>[]
    expect(rules.length).toBe(ONTARIO_RULES.length)
    expect(rules[0]).toEqual({ id: ONTARIO_RULES[0].id, area: ONTARIO_RULES[0].area, statute: ONTARIO_RULES[0].statute, title: ONTARIO_RULES[0].title, summary: ONTARIO_RULES[0].summary, severity: ONTARIO_RULES[0].severity, since: ONTARIO_RULES[0].since })
  })
  it('every other province expands to > 0 rules with id <CODE>-<topic>, citation and source url', async () => {
    for (const code of PROVINCE_CODES.filter((c) => c !== 'ON')) {
      const r = await json(await (await routes.rules()).GET(get(`/rules?province=${code}`)))
      expectEnvelope(r)
      expect(r.body.province).toBe(code)
      const rules = r.body.rules as Record<string, unknown>[]
      expect(rules.length, code).toBeGreaterThanOrEqual(11)
      for (const x of rules) {
        expect(x.id).toBe(`${code}-${x.topic}`)
        expect(typeof x.statute).toBe('string')
        expect(String(x.source_url)).toMatch(/^https?:\/\//)
        expect((x.title as Record<string, string>).zh.length).toBeGreaterThan(0)
        expect((x.summary as Record<string, string>).en.length).toBeGreaterThan(0)
      }
      expect(rules.map((x) => x.topic)).toContain('deposit')
    }
  })
  it('unsupported province → 400 unsupported_province', async () => {
    const r = await json(await (await routes.rules()).GET(get('/rules?province=XX')))
    expectError(r, 400, 'unsupported_province')
    expect(() => coreRules({ province: 'Texas' })).toThrow(ApiError)
  })
})

// ── /listings/compliance ─────────────────────────────────────────────────────

describe('POST /listings/compliance', () => {
  it('Ontario: legacy shape kept (passed / findings[].rule / url / checked / boundary) plus rule_id / source_url / as_of / province', async () => {
    const r = await json(await (await routes.compliance()).POST(post('/listings/compliance', { monthly_rent: 2800, deposit: 3000, pets_allowed: 'no' })))
    expectEnvelope(r)
    expect(r.body.province).toBe('ON')
    expect(r.body.passed).toBe(false)
    expect(r.body.checked).toEqual(['RTA-106-deposit-cap', 'OREG516-17-key-deposit', 'RTA-14-no-pet-clause', 'RTA-134-no-fees'])
    const f = r.body.findings as Record<string, unknown>[]
    expect(f.map((x) => x.rule_id)).toEqual(['RTA-106-deposit-cap', 'RTA-14-no-pet-clause'])
    for (const x of f) {
      expect(x.rule).toBe(x.rule_id)
      expect(x.url).toBe(x.source_url)
      expect(x.source_url).toBe(`https://www.stayloop.ai/rules#${x.rule_id}`)
      expect(Object.keys(x.message as object).sort()).toEqual(['en', 'zh'])
    }
    expect(r.body.notes).toBeUndefined()
    // aggregate telemetry only — rule id + severity, no text
    expect(h.inserts).toEqual([[{ source: 'compliance_api', rule_id: 'RTA-106-deposit-cap', severity: 'block', metadata: {} }, { source: 'compliance_api', rule_id: 'RTA-14-no-pet-clause', severity: 'block', metadata: {} }]])
  })
  it('Quebec: any deposit is a block, the official source url is cited, notes states the scope', async () => {
    const r = await json(await (await routes.compliance()).POST(post('/listings/compliance', { province: 'QC', monthly_rent: 1500, deposit: 500 })))
    expectEnvelope(r)
    expect(r.body.province).toBe('QC')
    expect(r.body.passed).toBe(false)
    const f = r.body.findings as Record<string, unknown>[]
    expect(f[0].rule_id).toBe('QC-CCQ-1904-no-deposit')
    expect(f[0].source_url).toBe('https://www.legisquebec.gouv.qc.ca/en/document/cs/CCQ-1991')
    expect((r.body.checked as string[])).toContain('QC-CCQ-1904-no-deposit')
    expect((r.body.notes as Record<string, string>).zh).toContain('押金')
  })
  it('British Columbia: half-month cap applies; a clean listing passes', async () => {
    const bad = coreListingCompliance({ province: 'BC', monthly_rent: 2000, deposit: 1500 })
    expect(bad.passed).toBe(false)
    expect(bad.findings[0].rule_id).toBe('BC-deposit-cap')
    expect(bad.findings[0].source_url).toMatch(/^https:\/\//)
    const ok = coreListingCompliance({ province: 'BC', monthly_rent: 2000, deposit: 1000, description: 'Bright suite near the SkyTrain.' })
    expect(ok.passed).toBe(true)
    expect(ok.findings).toEqual([])
  })
  it('bad JSON → invalid_json; bad field → invalid_input naming the field; unknown province → unsupported_province', async () => {
    const mod = await routes.compliance()
    expectError(await json(await mod.POST(post('/listings/compliance', '{not json'))), 400, 'invalid_json')
    expectError(await json(await mod.POST(post('/listings/compliance', [1]))), 400, 'invalid_json')
    const bad = await json(await mod.POST(post('/listings/compliance', { monthly_rent: 'lots' })))
    expectError(bad, 400, 'invalid_input')
    expect(bad.body.message).toMatch(/^monthly_rent:/)
    const long = await json(await mod.POST(post('/listings/compliance', { description: 'x'.repeat(2001) })))
    expectError(long, 400, 'invalid_input')
    expect(long.body.message).toMatch(/^description: .*2000/)
    expectError(await json(await mod.POST(post('/listings/compliance', { pets_allowed: 'maybe' }))), 400, 'invalid_input')
    expectError(await json(await mod.POST(post('/listings/compliance', { province: 'US-NY', monthly_rent: 1 }))), 400, 'unsupported_province')
    expect(h.inserts).toEqual([])
  })
  it('an email / phone in the text is checked like any other text, never stored', async () => {
    const r = await json(await (await routes.compliance()).POST(post('/listings/compliance', { province: 'ON', monthly_rent: 2000, description: 'Call 416-555-0100 or mail me@example.com. No pets.' })))
    expectEnvelope(r)
    expect((r.body.findings as Record<string, unknown>[]).map((x) => x.rule_id)).toEqual(['RTA-14-no-pet-clause'])
    expect(JSON.stringify(h.inserts)).not.toMatch(/example\.com|416-555/)
  })
})

// ── /lease/terms-check ───────────────────────────────────────────────────────

describe('POST /lease/terms-check', () => {
  it('Ontario: TRREB form warns, pet ban in Schedule B blocks, dates must be ordered', async () => {
    const r = await json(await (await routes.lease()).POST(post('/lease/terms-check', { rent_amount: 2800, deposit_amount: 2800, form_type: 'trreb', schedule_b: 'No pets allowed.', start_date: '2027-01-01', end_date: '2026-12-31' })))
    expectEnvelope(r)
    const ids = (r.body.findings as Record<string, unknown>[]).map((x) => x.rule_id)
    expect(ids).toEqual(['OREG9-18-standard-lease', 'RTA-14-no-pet-clause', 'OREG9-18-standard-lease'])
    expect(r.body.passed).toBe(false)
    expect(r.body.checked).toContain('RTA-36-1-tenant-ac')
  })
  it('Quebec: deposit / key deposit / last-month rent are blocked, Ontario form is a warn, notes states three categories', async () => {
    const r = await json(await (await routes.lease()).POST(post('/lease/terms-check', { province: 'QC', rent_amount: 1500, deposit_amount: 750, form_type: 'ontario_standard', schedule_b: 'Key deposit $50. First and last month required.' })))
    expectEnvelope(r)
    const f = r.body.findings as Record<string, unknown>[]
    expect(f.map((x) => x.rule_id)).toEqual(['QC-CCQ-1904-no-deposit', 'QC-no-key-deposit', 'QC-CCQ-1904-advance-rent', 'QC-lease-form'])
    expect(f.map((x) => x.severity)).toEqual(['block', 'block', 'block', 'warn'])
    expect(r.body.passed).toBe(false)
    expect((r.body.notes as Record<string, string>).zh).toContain('三类')
    for (const x of f) expect(String(x.source_url)).toMatch(/^https:\/\//)
  })
  it('out of province with nothing wrong passes with empty findings', () => {
    const r = coreLeaseTermsCheck({ province: 'AB', rent_amount: 1800, deposit_amount: 1800, start_date: '2026-11-01', end_date: '2027-10-31' })
    expect(r.passed).toBe(true)
    expect(r.findings).toEqual([])
    expect(r.checked.length).toBeGreaterThan(0)
  })
  it('bad date → invalid_input', async () => {
    const r = await json(await (await routes.lease()).POST(post('/lease/terms-check', { start_date: '2026-02-30' })))
    expectError(r, 400, 'invalid_input')
    expect(r.body.message).toMatch(/^start_date:/)
  })
})

// ── /guideline ───────────────────────────────────────────────────────────────

describe('GET /guideline', () => {
  it('2027 → 1.9 %, N1 deadline 90 days before, cap 2.5', async () => {
    const r = await json(await (await routes.guideline()).GET(get('/guideline?effective=2027-01-01')))
    expectEnvelope(r)
    expect(r.body).toMatchObject({ province: 'ON', effective: '2027-01-01', year: 2027, pct: 1.9, published: true, cap: 2.5, n1_deadline: '2026-10-03', notice_days: 90 })
  })
  it('unpublished year → published:false with the latest figure', () => {
    const g = coreGuideline({ effective: '2031-06-01' })
    expect(g.published).toBe(false)
    expect(g.pct).toBe(1.9)
  })
  it('missing / malformed effective → invalid_input', async () => {
    const mod = await routes.guideline()
    const miss = await json(await mod.GET(get('/guideline')))
    expectError(miss, 400, 'invalid_input')
    expect(miss.body.message).toMatch(/^effective: is required/)
    const bad = await json(await mod.GET(get('/guideline?effective=01/01/2027')))
    expectError(bad, 400, 'invalid_input')
    expectError(await json(await mod.GET(get('/guideline?effective=2027-13-01'))), 400, 'invalid_input')
  })
})

// ── /n4/earliest-termination ─────────────────────────────────────────────────

describe('GET /n4/earliest-termination', () => {
  it('hand: +7; mail: +5 deemed +7; email like hand; method defaults to hand', async () => {
    const mod = await routes.n4()
    const hand = await json(await mod.GET(get('/n4/earliest-termination?served=2026-11-02')))
    expectEnvelope(hand)
    expect(hand.body).toMatchObject({ served: '2026-11-02', method: 'hand', deemed_served: '2026-11-02', earliest_termination: '2026-11-09', termination_days: 7, mail_days: 5 })
    const mail = await json(await mod.GET(get('/n4/earliest-termination?served=2026-11-02&method=mail')))
    expect(mail.body).toMatchObject({ method: 'mail', deemed_served: '2026-11-07', earliest_termination: '2026-11-14' })
    expect(coreN4EarliestTermination({ served: '2026-11-02', method: 'email' }).earliest_termination).toBe('2026-11-09')
  })
  it('bad method / missing served → invalid_input', async () => {
    const mod = await routes.n4()
    expectError(await json(await mod.GET(get('/n4/earliest-termination?served=2026-11-02&method=fax'))), 400, 'invalid_input')
    expectError(await json(await mod.GET(get('/n4/earliest-termination'))), 400, 'invalid_input')
  })
})

// ── /late-payment/persistent ─────────────────────────────────────────────────

describe('POST /late-payment/persistent', () => {
  const periods = [
    { due_date: '2026-04-01', paid_at: '2026-04-12' },
    { due_date: '2026-05-01', paid_at: '2026-05-02' },
    { due_date: '2026-06-01', paid_at: '2026-06-15T14:00:00Z' },
    { due_date: '2026-07-01', paid_at: '2026-07-01' },
    { due_date: '2026-08-01', paid_at: null },
  ]
  it('three late payments within six months → persistent, with the window and the definition', async () => {
    const r = await json(await (await routes.late()).POST(post('/late-payment/persistent', { periods, as_of: '2026-10-16' })))
    expectEnvelope(r)
    expect(r.body).toMatchObject({ province: 'ON', as_of_date: '2026-10-16', late: ['2026-04-01', '2026-06-01', '2026-08-01'], persistent: true, window: ['2026-04-01', '2026-08-01'], definition: { grace_days: 7, count: 3, window_months: 6 } })
  })
  it('two late payments → not persistent, window null', () => {
    const r = corePersistentLatePayment({ periods: periods.slice(0, 4), as_of: '2026-10-16' })
    expect(r.persistent).toBe(false)
    expect(r.window).toBeNull()
    expect(r.late).toEqual(['2026-04-01', '2026-06-01'])
  })
  it('validation: periods required, ≤120, each a { due_date, paid_at } with real dates', async () => {
    const mod = await routes.late()
    expectError(await json(await mod.POST(post('/late-payment/persistent', {}))), 400, 'invalid_input')
    const many = await json(await mod.POST(post('/late-payment/persistent', { periods: Array.from({ length: 121 }, () => ({ due_date: '2026-01-01', paid_at: null })) })))
    expectError(many, 400, 'invalid_input')
    expect(many.body.message).toMatch(/^periods: .*120/)
    const bad = await json(await mod.POST(post('/late-payment/persistent', { periods: [{ due_date: '2026-01-01', paid_at: null }, { due_date: 'Jan 1', paid_at: null }] })))
    expectError(bad, 400, 'invalid_input')
    expect(bad.body.message).toMatch(/^periods\[1\]\.due_date:/)
    expectError(await json(await mod.POST(post('/late-payment/persistent', { periods: ['2026-01-01'] }))), 400, 'invalid_input')
    expectError(await json(await mod.POST(post('/late-payment/persistent', { periods: [{ due_date: '2026-01-01' }], as_of: 'today' }))), 400, 'invalid_input')
  })
})

// ── /rent-benchmark ──────────────────────────────────────────────────────────

describe('GET /rent-benchmark', () => {
  const cmhc = (kind: string, area: string, bedrooms: number, avg: number, period = '2025-10') => ({ source: 'cmhc', kind, period, area, bedrooms, avg_rent: avg, prev_avg: avg - 50, quality: 'a' })
  it('condo in Liberty Village: condo sub-area first, purpose-built as alt, StatCan asking attached, attribution required', async () => {
    h.rows = [
      cmhc('condo', 'Toronto', 1, 2531),
      cmhc('purpose_built', 'Zone 1 - Toronto (Central)', 1, 2042),
      { source: 'statcan', kind: 'asking', period: '2026-04', area: 'Toronto CMA', bedrooms: 1, avg_rent: 2310, prev_avg: 2345, quality: null },
    ]
    const r = await json(await (await routes.bench()).GET(get('/rent-benchmark?province=ON&area=Liberty%20Village&bedrooms=1&type=condo')))
    expectEnvelope(r)
    expect(r.body).toMatchObject({ province: 'ON', area: 'Liberty Village', bedrooms: 1, type: 'condo' })
    const b = r.body.benchmark as Record<string, unknown>
    expect(b).toMatchObject({ source: 'cmhc', kind: 'condo', area: 'Toronto', period: '2025-10', avg: 2531, prev_avg: 2481, quality: 'a' })
    expect((b.label as Record<string, string>).en).toContain('CMHC')
    expect(r.body.alt).toMatchObject({ kind: 'purpose_built', avg: 2042 })
    expect(r.body.asking).toMatchObject({ period: '2026-04', avg: 2310 })
    const a = r.body.attribution as Record<string, string>
    expect(a.en).toMatch(/^Source: Canada Mortgage and Housing Corporation \(CMHC\), Rental Market Survey, October 2025/)
    expect(a.zh).toContain('CMHC')
  })
  it('defaults: bedrooms 1, type apartment, province ON', async () => {
    h.rows = [cmhc('purpose_built', 'Toronto CMA', 1, 1900)]
    const r = await json(await (await routes.bench()).GET(get('/rent-benchmark')))
    expectEnvelope(r)
    expect(r.body).toMatchObject({ province: 'ON', area: null, bedrooms: 1, type: 'apartment' })
    expect((r.body.benchmark as Record<string, unknown>).avg).toBe(1900)
  })
  it('nothing in the table → 404 not_available; another province → 404 not_available; unknown → 400', async () => {
    const mod = await routes.bench()
    expectError(await json(await mod.GET(get('/rent-benchmark?bedrooms=2'))), 404, 'not_available')
    expectError(await json(await mod.GET(get('/rent-benchmark?province=QC'))), 404, 'not_available')
    expectError(await json(await mod.GET(get('/rent-benchmark?province=ZZ'))), 400, 'unsupported_province')
    expectError(await json(await mod.GET(get('/rent-benchmark?type=castle'))), 400, 'invalid_input')
    expectError(await json(await mod.GET(get('/rent-benchmark?bedrooms=1.5'))), 400, 'invalid_input')
  })
  it('core: a null client falls back to the anon reader without throwing on an unreachable host', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    await expect(coreRentBenchmark(null, { bedrooms: 1 })).rejects.toMatchObject({ code: 'not_available', status: 404 })
  })
})

// ── OpenAPI document ─────────────────────────────────────────────────────────

describe('OpenAPI 3.1 document', () => {
  const PATHS = ['/rules', '/listings/compliance', '/lease/terms-check', '/guideline', '/n4/earliest-termination', '/late-payment/persistent', '/rent-benchmark']
  it('covers all seven endpoints, version = API_VERSION, server = /api/v1, bilingual summaries, examples and x-boundary', () => {
    expect(OPENAPI.openapi).toBe('3.1.0')
    expect(OPENAPI.info.version).toBe(API_VERSION)
    expect(OPENAPI.servers[0].url).toBe('https://www.stayloop.ai/api/v1')
    expect(Object.keys(OPENAPI.paths).sort()).toEqual([...PATHS].sort())
    for (const p of PATHS) {
      const ops = Object.values(OPENAPI.paths[p]).filter(Boolean)
      expect(ops.length, p).toBe(1)
      const o = ops[0]!
      expect(o.summary, p).toMatch(/[一-鿿]/)
      expect(o.summary, p).toMatch(/[A-Za-z]/)
      expect(o.description, p).toMatch(/[一-鿿]/)
      expect(o['x-boundary']).toEqual(BOUNDARY)
      const ok = (o.responses as Record<string, { content: Record<string, { example: unknown; schema: unknown }> }>)['200']
      expect(ok.content['application/json'].example, p).toBeTruthy()
      expect(ok.content['application/json'].schema, p).toBeTruthy()
      expect(o.responses).toHaveProperty('429')
    }
    expect(OPENAPI.paths['/rent-benchmark'].get!.responses).toHaveProperty('404')
    expect(OPENAPI.paths['/late-payment/persistent'].post!.requestBody).toBeTruthy()
    expect(OPENAPI.paths['/guideline'].get!.parameters![0]).toMatchObject({ name: 'effective', required: true })
  })
  it('OPENAPI_ENDPOINTS mirrors the paths with a curl example each', () => {
    expect(OPENAPI_ENDPOINTS.map((e) => e.path).sort()).toEqual([...PATHS].sort())
    for (const e of OPENAPI_ENDPOINTS) {
      expect(e.exampleCurl).toContain(`https://www.stayloop.ai/api/v1${e.path}`)
      expect(e.exampleCurl.startsWith(e.method === 'POST' ? 'curl -X POST' : 'curl ')).toBe(true)
      expect(e.summary.zh).toBeTruthy()
      expect(e.summary.en).toBeTruthy()
    }
  })
  it('the document is plain JSON (no functions / undefined) and matches what the route serves', async () => {
    const res = await (await routes.openapi()).GET()
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('public, max-age=3600')
    expect(res.headers.get('access-control-allow-origin')).toBe('*')
    expect(res.headers.get('x-api-version')).toBe(API_VERSION)
    const doc = await res.json()
    expect(doc).toEqual(JSON.parse(JSON.stringify(OPENAPI)))
    expect(doc.info.version).toBe(API_VERSION)
  })
  it('route-audit has an anonymous probe for each new endpoint', () => {
    const src = readFileSync('scripts/route-audit.mjs', 'utf8')
    for (const p of [...PATHS, '/openapi.json']) expect(src, p).toContain(`/api/v1${p}`)
  })
})
