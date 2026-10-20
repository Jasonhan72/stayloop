// Bank step hardening (2026-10-19, design/flinks-production-plan-2026-10-19.md part B):
// B1 Connect message origin · B2 DeleteCard + no plaintext loginId · B3 limits ·
// B4 90-day trim · B5 audit · B6 async read (page poll + sweep) · B7 plain error messages.
// The flow runs against an in-memory Supabase and a mocked Flinks API — no network.
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ limit: vi.fn(async (_k: string, _n: number, _f: boolean) => true) }))
vi.mock('@/lib/rateLimit', () => ({ underHourlyLimit: (k: string, n: number, f: boolean) => h.limit(k, n, f) }))

import {
  BANK_READ_TIMEOUT_MS, SWEEP_SKIP_RECENT_MS, VERIFY_DETAIL_RETENTION_DAYS,
  loginRef, minimizeSteps, pollBankRead, purgeVerificationDetails, startBankRead, sweepBankReads,
} from '@/lib/verify/bankFlow'
import { FlinksError, flinksAccountsDetailPoll, flinksAccountsDetailStart, flinksDeleteCard, type DetailResponse, type FlinksApi } from '@/lib/verify/providers/flinks'
import { bankErrorInfo, bankErrorMessage, normalizeBankErrorCode } from '@/lib/verify/bankErrors'
import { connectRedirectLoginId, isFlinksLoginId } from '@/lib/verify/bankMessage'
import { VERIFY_LIMITS, underVerifyLimits, verifyLimitKeys } from '@/lib/verify/limits'
import { toPublicView } from '@/lib/verify/store'
import type { VerificationRequestRow } from '@/lib/verify/types'

// ── in-memory Supabase ────────────────────────────────────────────────────────
type Row = Record<string, any>
type Filter = [op: 'eq' | 'neq' | 'is' | 'lt' | 'in', col: string, val: any]

function fakeDb() {
  const tables: Record<string, Row[]> = { verification_requests: [], verification_bank_reads: [], agent_audit_events: [], screenings: [] }
  const keyOf: Record<string, string> = { verification_bank_reads: 'login_id' }
  const match = (r: Row, fs: Filter[]) => fs.every(([op, c, v]) =>
    op === 'eq' ? r[c] === v : op === 'neq' ? r[c] !== v : op === 'is' ? (r[c] ?? null) === v : op === 'lt' ? r[c] < v : (v as any[]).includes(r[c]))
  function from(table: string) {
    const t = (tables[table] ||= [])
    let op: 'select' | 'update' | 'delete' = 'select'
    let patch: Row = {}
    const fs: Filter[] = []
    let order: { col: string; asc: boolean } | null = null
    let lim = Infinity
    const rows = () => {
      let out = t.filter((r) => match(r, fs))
      if (order) out = [...out].sort((a, b) => (a[order!.col] < b[order!.col] ? -1 : 1) * (order!.asc ? 1 : -1))
      return out.slice(0, lim)
    }
    const run = () => {
      if (op === 'update') { for (const r of t.filter((x) => match(x, fs))) Object.assign(r, structuredClone(patch)); return { data: null, error: null } }
      if (op === 'delete') { for (const r of t.filter((x) => match(x, fs))) t.splice(t.indexOf(r), 1); return { data: null, error: null } }
      return { data: structuredClone(rows()), error: null }
    }
    const q: any = {
      select: () => q,
      eq: (c: string, v: any) => (fs.push(['eq', c, v]), q),
      neq: (c: string, v: any) => (fs.push(['neq', c, v]), q),
      is: (c: string, v: any) => (fs.push(['is', c, v]), q),
      lt: (c: string, v: any) => (fs.push(['lt', c, v]), q),
      in: (c: string, v: any[]) => (fs.push(['in', c, v]), q),
      order: (col: string, o?: { ascending?: boolean }) => ((order = { col, asc: o?.ascending !== false }), q),
      limit: (n: number) => ((lim = n), q),
      maybeSingle: async () => ({ data: structuredClone(rows()[0] ?? null), error: null }),
      update: (p: Row) => ((op = 'update'), (patch = p), q),
      delete: () => ((op = 'delete'), q),
      insert: (r: Row | Row[]) => { for (const x of [r].flat()) t.push(structuredClone(x)); return Promise.resolve({ data: null, error: null }) },
      upsert: (r: Row) => {
        const k = keyOf[table]
        const ex = t.find((x) => x[k] === r[k])
        if (ex) Object.assign(ex, structuredClone(r)); else t.push(structuredClone(r))
        return Promise.resolve({ data: null, error: null })
      },
      then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(run()).then(res, rej),
    }
    return q
  }
  return { admin: { from } as any, tables }
}

const LOGIN = '5e3c1a52-7f7b-4e0f-9a51-1c2b3d4e5f60'
const LOGIN2 = '9a8b7c6d-1111-4222-8333-444455556666'
const TOKEN = 'a'.repeat(48)

function request(extra: Partial<VerificationRequestRow> = {}): VerificationRequestRow {
  return {
    id: '11111111-1111-4111-8111-111111111111', token: TOKEN, screening_id: '22222222-2222-4222-8222-222222222222',
    landlord_id: '33333333-3333-4333-8333-333333333333', landlord_name: '[TEST] Landlord', tenant_name: '[TEST] Tenant', tenant_email: 't@example.test',
    status: 'consented', consent: { version: 'v1', accepted_at: '2026-10-19T00:00:00.000Z', typed_name: '[TEST] Tenant' },
    steps: {}, expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(), created_at: '2026-10-19T00:00:00.000Z', updated_at: '2026-10-19T00:00:00.000Z',
    ...extra,
  }
}

const DETAIL: DetailResponse = {
  Institution: 'FlinksCapital',
  Accounts: [{
    Title: 'Chequing', AccountNumber: '1111000', Category: 'Operations', Type: 'Chequing', Currency: 'CAD', Holder: { Name: '[TEST] Tenant' },
    Balance: { Current: 2400, Available: 2400 },
    Transactions: [
      { Date: '2026-08-01', Description: 'PAYROLL ACME', Credit: 3200, Debit: null, Balance: 3000 },
      { Date: '2026-08-15', Description: 'PAYROLL ACME', Credit: 3200, Debit: null, Balance: 3100 },
      { Date: '2026-09-01', Description: 'PAYROLL ACME', Credit: 3200, Debit: null, Balance: 3200 },
    ],
  }],
}

function api(over: Partial<FlinksApi> = {}): FlinksApi & { [K in keyof FlinksApi]: ReturnType<typeof vi.fn> } {
  return {
    authorize: vi.fn(async () => 'req-1'),
    detailStart: vi.fn(async () => ({ ready: true as const, detail: DETAIL })),
    detailPoll: vi.fn(async () => ({ ready: true as const, detail: DETAIL })),
    deleteCard: vi.fn(async () => undefined),
    ...over,
  } as any
}

beforeEach(() => {
  process.env.FLINKS_AUTH_KEY = 'test-auth-key'
  process.env.FLINKS_API_SECRET = 'test-api-secret'
  h.limit.mockClear()
})
afterEach(() => {
  delete process.env.FLINKS_AUTH_KEY
  delete process.env.FLINKS_API_SECRET
  vi.unstubAllGlobals()
})

const actions = (db: ReturnType<typeof fakeDb>) => db.tables.agent_audit_events.map((a) => a.action)
const NO_RETRY = { retryInUseMs: 0 }

describe('B2 / B5 / B6 · reading a bank', () => {
  it('fast bank: verified, connection deleted at Flinks, loginId stored nowhere, audited', async () => {
    const db = fakeDb(); const row = request(); db.tables.verification_requests.push(row)
    const f = api()
    expect(await startBankRead(db.admin, f, row, LOGIN, NO_RETRY)).toEqual({ state: 'verified' })
    const bank = db.tables.verification_requests[0].steps.bank
    expect(bank.status).toBe('verified')
    expect(bank.result.accounts).toHaveLength(1)
    expect(bank.session_id ?? null).toBeNull()
    expect(bank.login_ref).toBe(await loginRef(LOGIN))
    expect(bank.login_ref).toMatch(/^[0-9a-f]{16}$/)
    expect(f.deleteCard).toHaveBeenCalledWith(LOGIN)
    expect(db.tables.verification_bank_reads).toHaveLength(0)
    expect(actions(db)).toEqual(['verify_bank_authorized', 'verify_bank_read', 'verify_bank_connection_deleted'])
    // The loginId appears in no stored row, audit metadata or screening snapshot.
    expect(JSON.stringify(db.tables)).not.toContain(LOGIN)
    expect(db.tables.agent_audit_events.every((a) => a.target_type === 'verification_request' && a.actor_type === 'system')).toBe(true)
  })

  it('slow bank (202): parked, then finished by the page poll', async () => {
    const db = fakeDb(); const row = request(); db.tables.verification_requests.push(row)
    const f = api({ detailStart: vi.fn(async () => ({ ready: false as const })) })
    expect(await startBankRead(db.admin, f, row, LOGIN, NO_RETRY)).toEqual({ state: 'reading' })
    expect(db.tables.verification_requests[0].steps.bank.status).toBe('submitted')
    expect(db.tables.verification_bank_reads).toMatchObject([{ login_id: LOGIN, phase: 'reading', flinks_request_id: 'req-1' }])
    expect(f.deleteCard).not.toHaveBeenCalled()
    // Only the service-role table holds the id while the read runs.
    expect(JSON.stringify(db.tables.verification_requests)).not.toContain(LOGIN)

    const fresh = db.tables.verification_requests[0] as VerificationRequestRow
    expect(await pollBankRead(db.admin, f, fresh, Date.now(), NO_RETRY)).toEqual({ state: 'verified' })
    expect(f.detailPoll).toHaveBeenCalledWith('req-1')
    expect(db.tables.verification_requests[0].steps.bank.status).toBe('verified')
    expect(db.tables.verification_bank_reads).toHaveLength(0)
  })

  it('a poll that is still 202 keeps reading; past the timeout it fails READ_TIMEOUT and deletes the connection', async () => {
    const db = fakeDb(); const row = request(); db.tables.verification_requests.push(row)
    const f = api({ detailStart: vi.fn(async () => ({ ready: false as const })), detailPoll: vi.fn(async () => ({ ready: false as const })) })
    await startBankRead(db.admin, f, row, LOGIN, NO_RETRY)
    const r = () => db.tables.verification_requests[0] as VerificationRequestRow
    expect(await pollBankRead(db.admin, f, r(), Date.now(), NO_RETRY)).toEqual({ state: 'reading' })
    expect(db.tables.verification_bank_reads[0].attempts).toBe(2)
    expect(await pollBankRead(db.admin, f, r(), Date.now() + BANK_READ_TIMEOUT_MS + 1000, NO_RETRY)).toEqual({ state: 'failed', code: 'READ_TIMEOUT' })
    expect(r().steps.bank).toMatchObject({ status: 'failed', error_code: 'READ_TIMEOUT' })
    expect(f.deleteCard).toHaveBeenCalledWith(LOGIN)
    expect(db.tables.verification_bank_reads).toHaveLength(0)
  })

  it('Flinks error codes land as error_code and reach the public view; the connection is still deleted', async () => {
    const db = fakeDb(); const row = request(); db.tables.verification_requests.push(row)
    const f = api({ authorize: vi.fn(async () => { throw new FlinksError('flinks authorize 401', 'INVALID_LOGIN', 401) }) })
    expect(await startBankRead(db.admin, f, row, LOGIN, NO_RETRY)).toEqual({ state: 'failed', code: 'INVALID_LOGIN' })
    const stored = db.tables.verification_requests[0] as VerificationRequestRow
    expect(stored.steps.bank).toMatchObject({ status: 'failed', error_code: 'INVALID_LOGIN' })
    expect(toPublicView(stored).steps.bank.error_code).toBe('INVALID_LOGIN')
    expect(f.deleteCard).toHaveBeenCalledWith(LOGIN)
    expect(actions(db)).toContain('verify_bank_failed')
    // An unknown code is stored as null (shown as the generic message).
    const db2 = fakeDb(); const row2 = request(); db2.tables.verification_requests.push(row2)
    await startBankRead(db2.admin, api({ authorize: vi.fn(async () => { throw new FlinksError('x', 'SOMETHING_NEW', 500) }) }), row2, LOGIN, NO_RETRY)
    expect(db2.tables.verification_requests[0].steps.bank.error_code).toBeNull()
  })

  it('no accounts read → failed NO_ACCOUNTS', async () => {
    const db = fakeDb(); const row = request(); db.tables.verification_requests.push(row)
    const f = api({ detailStart: vi.fn(async () => ({ ready: true as const, detail: { Accounts: [] } })) })
    expect(await startBankRead(db.admin, f, row, LOGIN, NO_RETRY)).toEqual({ state: 'failed', code: 'NO_ACCOUNTS' })
  })

  it('a reconnect supersedes the read still running and deletes its connection', async () => {
    const db = fakeDb(); const row = request(); db.tables.verification_requests.push(row)
    const slow = api({ detailStart: vi.fn(async () => ({ ready: false as const })) })
    await startBankRead(db.admin, slow, row, LOGIN, NO_RETRY)
    const f = api()
    await startBankRead(db.admin, f, db.tables.verification_requests[0] as VerificationRequestRow, LOGIN2, NO_RETRY)
    expect(f.deleteCard).toHaveBeenCalledWith(LOGIN)
    expect(f.deleteCard).toHaveBeenCalledWith(LOGIN2)
    expect(db.tables.verification_bank_reads).toHaveLength(0)
  })
})

describe('B2 · DeleteCard refused, retried by the sweep', () => {
  it('CARD_IN_USE keeps the id (phase delete); the sweep deletes it later', async () => {
    const db = fakeDb(); const row = request(); db.tables.verification_requests.push(row)
    const inUse = vi.fn(async () => { throw new FlinksError('flinks delete-card 400', 'CARD_IN_USE', 400) })
    await startBankRead(db.admin, api({ deleteCard: inUse }), row, LOGIN, { retryInUseMs: 1 })
    expect(inUse).toHaveBeenCalledTimes(2) // one short in-request retry
    expect(db.tables.verification_requests[0].steps.bank.status).toBe('verified')
    expect(db.tables.verification_bank_reads).toMatchObject([{ login_id: LOGIN, phase: 'delete', attempts: 1, last_error: 'CARD_IN_USE' }])
    expect(actions(db)).toContain('verify_bank_delete_deferred')

    const later = api()
    const rep = await sweepBankReads(db.admin, later)
    expect(rep.deleted).toBe(1)
    expect(later.deleteCard).toHaveBeenCalledWith(LOGIN)
    expect(db.tables.verification_bank_reads).toHaveLength(0)
  })
})

describe('B6 · the hourly sweep', () => {
  it('leaves a read the page is polling, advances an idle one, ends an orphan', async () => {
    const db = fakeDb(); const row = request(); db.tables.verification_requests.push(row)
    const now = Date.now()
    db.tables.verification_bank_reads.push(
      { login_id: LOGIN, verification_request_id: row.id, phase: 'reading', flinks_request_id: 'req-a', sandbox: true, attempts: 3, created_at: new Date(now - 5 * 60_000).toISOString(), last_attempt_at: new Date(now - 10_000).toISOString(), last_error: null },
    )
    const f = api()
    expect(await sweepBankReads(db.admin, f, now)).toMatchObject({ skipped: 1, finished: 0 })
    expect(f.detailPoll).not.toHaveBeenCalled()

    expect(await sweepBankReads(db.admin, f, now + SWEEP_SKIP_RECENT_MS + 1000)).toMatchObject({ finished: 1 })
    expect(db.tables.verification_requests[0].steps.bank.status).toBe('verified')

    // Request deleted (screening deleted): only the connection to end.
    db.tables.verification_bank_reads.push({ login_id: LOGIN2, verification_request_id: null, phase: 'reading', flinks_request_id: 'req-b', sandbox: true, attempts: 1, created_at: new Date(now - 3_600_000).toISOString(), last_attempt_at: null, last_error: null })
    const g = api()
    expect(await sweepBankReads(db.admin, g, now)).toMatchObject({ deleted: 1 })
    expect(g.deleteCard).toHaveBeenCalledWith(LOGIN2)
  })
})

describe('B4 · 90-day trim of request rows', () => {
  it('keeps statuses, drops results / ids / errors; recent rows and the screening snapshot are untouched', async () => {
    const db = fakeDb()
    const now = Date.parse('2027-02-01T00:00:00Z')
    const old = request({ id: 'old', updated_at: new Date(now - (VERIFY_DETAIL_RETENTION_DAYS + 1) * 86_400_000).toISOString() }) as any
    old.steps = {
      id: { status: 'verified', provider: 'veriff', session_id: 'veriff-sess', result: { decision: 'approved', first_name: 'A' }, sandbox: false, updated_at: 'x' },
      bank: { status: 'verified', provider: 'flinks', login_ref: 'abcd', result: { holder_names: ['A'] }, error: null, sandbox: false, updated_at: 'y' },
    }
    old.details_purged_at = null
    const recent = request({ id: 'recent', updated_at: new Date(now - 10 * 86_400_000).toISOString() }) as any
    recent.steps = { bank: { status: 'verified', provider: 'flinks', result: { holder_names: ['B'] }, updated_at: 'z' } }
    recent.details_purged_at = null
    db.tables.verification_requests.push(old, recent)
    db.tables.screenings.push({ id: old.screening_id, verification: { bank: { holder_names: ['A'] } } })

    expect(await purgeVerificationDetails(db.admin, now)).toBe(1)
    const [o, r] = db.tables.verification_requests
    expect(o.steps).toEqual({
      id: { status: 'verified', provider: 'veriff', sandbox: false, error_code: null, updated_at: 'x' },
      bank: { status: 'verified', provider: 'flinks', sandbox: false, error_code: null, updated_at: 'y' },
    })
    expect(o.details_purged_at).toBe(new Date(now).toISOString())
    expect(r.steps.bank.result).toBeTruthy()
    expect(db.tables.screenings[0].verification.bank.holder_names).toEqual(['A'])
    // Already trimmed rows are not picked again.
    expect(await purgeVerificationDetails(db.admin, now)).toBe(0)
  })
  it('minimizeSteps on nothing is empty', () => {
    expect(minimizeSteps(null)).toEqual({})
  })
})

describe('B7 · messages', () => {
  it('every Flinks code we map has both languages; unknown codes fall back to the generic line', () => {
    for (const c of ['INVALID_LOGIN', 'CARD_IN_USE', 'SESSION_EXPIRED', 'RETRY_LATER', 'DISABLED_LOGIN', 'NEW_ACCOUNT', 'NO_TRANSACTION', 'READ_TIMEOUT', 'NO_ACCOUNTS', 'UNAVAILABLE']) {
      const i = bankErrorInfo(c)
      expect(i.zh.length).toBeGreaterThan(6)
      expect(i.en.length).toBeGreaterThan(10)
      expect(i.zh).not.toMatch(/[A-Za-z]{4,}/) // no English inside the Chinese line
      expect(normalizeBankErrorCode(c)).toBe(c)
    }
    expect(bankErrorMessage('SOMETHING_NEW', 'zh')).toBe(bankErrorMessage(null, 'zh'))
    expect(normalizeBankErrorCode('SOMETHING_NEW')).toBeNull()
  })
})

describe('B1 · Connect messages', () => {
  const frame = 'https://toolbox-iframe.private.fin.ag/v2/?authorizeToken=x'
  it('only the Connect iframe origin, a REDIRECT step and a well-formed loginId count', () => {
    expect(connectRedirectLoginId('https://toolbox-iframe.private.fin.ag', frame, { step: 'REDIRECT', loginId: LOGIN })).toBe(LOGIN)
    expect(connectRedirectLoginId('https://evil.example', frame, { step: 'REDIRECT', loginId: LOGIN })).toBeNull()
    expect(connectRedirectLoginId('https://www.stayloop.ai', frame, { step: 'REDIRECT', loginId: LOGIN })).toBeNull()
    expect(connectRedirectLoginId('https://toolbox-iframe.private.fin.ag', frame, { step: 'APP_MOUNTED', loginId: LOGIN })).toBeNull()
    expect(connectRedirectLoginId('https://toolbox-iframe.private.fin.ag', frame, { step: 'REDIRECT', loginId: 'x"><script>' })).toBeNull()
    expect(connectRedirectLoginId('https://toolbox-iframe.private.fin.ag', null, { step: 'REDIRECT', loginId: LOGIN })).toBeNull()
    expect(connectRedirectLoginId('https://toolbox-iframe.private.fin.ag', 'not a url', { step: 'REDIRECT', loginId: LOGIN })).toBeNull()
    expect(isFlinksLoginId(LOGIN)).toBe(true)
    expect(isFlinksLoginId(123)).toBe(false)
  })
})

describe('B3 · limits', () => {
  it('three buckets per call (token, IP, site-wide), every key long enough, all fail-open', async () => {
    for (const r of ['start', 'bank', 'bank-poll'] as const) {
      const k = verifyLimitKeys(r, TOKEN, '1.2.3.4')
      for (const v of Object.values(k)) expect(v.length).toBeGreaterThanOrEqual(16)
    }
    const hdr = new Headers({ 'cf-connecting-ip': '203.0.113.9' })
    expect(await underVerifyLimits('bank', TOKEN, hdr)).toBe(true)
    expect(h.limit).toHaveBeenCalledTimes(3)
    expect(h.limit.mock.calls.map((c) => c[1])).toEqual([VERIFY_LIMITS.bank.perToken, VERIFY_LIMITS.bank.perIp, VERIFY_LIMITS.bank.global])
    expect(h.limit.mock.calls.every((c) => c[2] === true)).toBe(true)
    expect(h.limit.mock.calls[1][0]).toContain('203.0.113.9')
    h.limit.mockImplementationOnce(async () => false)
    expect(await underVerifyLimits('bank', TOKEN, hdr)).toBe(false)
  })
})

describe('Flinks transport', () => {
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
  it('202 is "not ready", 200 with accounts is ready, an error carries its FlinksCode', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(202, { HttpStatusCode: 202, FlinksCode: 'OPERATION_PENDING' })))
    expect(await flinksAccountsDetailStart('r')).toEqual({ ready: false })
    vi.stubGlobal('fetch', vi.fn(async () => json(200, DETAIL)))
    expect(await flinksAccountsDetailPoll('r')).toMatchObject({ ready: true })
    vi.stubGlobal('fetch', vi.fn(async () => json(401, { HttpStatusCode: 401, FlinksCode: 'SESSION_EXPIRED', Message: 'expired' })))
    await expect(flinksAccountsDetailPoll('r')).rejects.toMatchObject({ code: 'SESSION_EXPIRED', httpStatus: 401 })
  })
  it('DeleteCard: DELETE on the loginId; already gone is fine; CARD_IN_USE throws with its code', async () => {
    const f = vi.fn(async () => new Response(null, { status: 200 }))
    vi.stubGlobal('fetch', f)
    await flinksDeleteCard(LOGIN)
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toMatch(new RegExp(`/BankingServices/DeleteCard/${LOGIN}$`))
    expect(init.method).toBe('DELETE')
    vi.stubGlobal('fetch', vi.fn(async () => json(404, {})))
    await expect(flinksDeleteCard(LOGIN)).resolves.toBeUndefined()
    vi.stubGlobal('fetch', vi.fn(async () => json(400, { FlinksCode: 'CARD_IN_USE' })))
    await expect(flinksDeleteCard(LOGIN)).rejects.toMatchObject({ code: 'CARD_IN_USE' })
  })
})

describe('wiring', () => {
  const read = (p: string) => readFileSync(p, 'utf8')
  it('routes are limited and use the flow; the page checks the message origin and shows plain messages', () => {
    const bank = read('app/api/verify/[token]/bank/route.ts')
    expect(bank).toContain("underVerifyLimits('bank'")
    expect(bank).toContain('startBankRead(admin, flinksApi')
    expect(bank).not.toMatch(/session_id:\s*loginId/)
    expect(read('app/api/verify/[token]/bank/poll/route.ts')).toContain("underVerifyLimits('bank-poll'")
    expect(read('app/api/verify/[token]/start/route.ts')).toContain("underVerifyLimits('start'")
    const page = read('app/verify/[token]/page.tsx')
    expect(page).toContain('connectRedirectLoginId(e.origin, bankFrame, e.data)')
    expect(page).toContain("api('/bank/poll'")
    expect(page).not.toContain('银行数据读取失败：${')
    const cron = read('app/api/cron/verify-sweep/route.ts')
    expect(cron).toContain('secretMatches')
    expect(cron).toContain('purgeVerificationDetails')
  })
  it('the migration keeps verification_bank_reads service-role only, strips old loginIds and schedules the sweep', () => {
    const m = read('supabase/migrations/20261019_verify_bank_hardening.sql')
    expect(m).toMatch(/revoke all on public\.verification_bank_reads from public, anon, authenticated/)
    expect(m).toMatch(/steps #- '\{bank,session_id\}'/)
    expect(m).toMatch(/'verify-sweep',\s*'50 \* \* \* \*'/)
    expect(m).toContain("name = 'cron_secret'")
  })
})
