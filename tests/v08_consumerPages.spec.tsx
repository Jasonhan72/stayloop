// @vitest-environment jsdom
// V0.8 · 消费者索取档案 — applicant-side pages (G20, 2026-10-17).
// design/consumer-file-access-plan-2026-10.md · design/consumer-file-access-contract-2026-10.md
//
// 1. /my-file/[token] renders its five states from the GET contract (mocked fetch):
//    invalid link (no fetch for a malformed token / 404), pending_verification (form),
//    needs_review, fulfilled (pack + items + alert card), matched + mail (queued).
// 2. The dispute form posts to …/dispute with the item it was opened on, and the
//    new dispute shows in "my disputes".
// 3. /my-file never says whether an email exists.
// 4. The screening pages (report / done / notice) only GAINED things.
// 5. Middleware, /consumer-rights wording, route-audit probes.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import React from 'react'
import { act, cleanup, fireEvent, render, type RenderResult } from '@testing-library/react'
import { all, only, textOf } from './helpers/dom'

const nav = vi.hoisted(() => ({ params: { token: '' } as Record<string, string> }))
vi.mock('next/navigation', () => ({ useParams: () => nav.params, useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), useSearchParams: () => new URLSearchParams() }))
vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => React.createElement('a', { href, ...rest }, children) }))
vi.mock('@/components/Header', () => ({ default: () => React.createElement('header', { 'data-testid': 'site-header' }) }))
vi.mock('@/components/Footer', () => ({ default: () => React.createElement('footer') }))
vi.mock('@/lib/supabase', () => ({ supabase: { auth: { getSession: async () => ({ data: { session: null } }) }, from: vi.fn() }, getSupabaseBrowser: () => ({ auth: {} }) }))

import MyFileTokenPage from '../app/my-file/[token]/page'
import MyFilePage from '../app/my-file/page'

const read = (p: string) => readFileSync(p, 'utf8')
const byId = (r: RenderResult, id: string) => all(r.container, `[data-testid="${id}"]`)
const buttonsNamed = (n: Element, label: string) => all<HTMLButtonElement>(n, 'button').filter((b) => textOf(b) === label)

afterEach(cleanup)

const TOKEN = 'a'.repeat(64)
const SID = 'd1a7f9c0-2222-4333-8444-955555555555'
const BASE = `/api/consumer/request/${TOKEN}`

type Call = { url: string; method: string; body: unknown }
const calls: Call[] = []
let views: Record<string, unknown> = {}

function jsonRes(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) }
}
function installFetch(getView: () => unknown, pack?: { html: string; json: unknown }) {
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const method = (init?.method || 'GET').toUpperCase()
    let body: unknown = null
    if (typeof init?.body === 'string') { try { body = JSON.parse(init.body) } catch { body = init.body } }
    calls.push({ url, method, body })
    if (url === '/api/consumer/request' && method === 'POST') return jsonRes(200, { ok: true })
    if (url === BASE && method === 'GET') { const v = getView(); return v ? jsonRes(200, v) : jsonRes(404, { error: 'invalid_token' }) }
    if (url === `${BASE}/pack?format=html`) return jsonRes(200, pack?.html ?? '<html></html>')
    if (url === `${BASE}/pack?format=json`) return jsonRes(200, pack?.json ?? { screenings: [] })
    if (url === `${BASE}/dispute` && method === 'POST') return jsonRes(200, { id: 'dsp-1' })
    if (url === `${BASE}/alert` && method === 'POST') return jsonRes(200, { alert: { statement: (body as { statement: string }).statement, created_at: '2026-10-17T00:00:00Z', expires_at: '2032-10-17T00:00:00Z' } })
    if (url === `${BASE}/alert` && method === 'DELETE') return jsonRes(200, { ok: true })
    if (url === `${BASE}/verify` && method === 'POST') return jsonRes(200, { ...(getView() as object), status: 'needs_review', name: (body as { name: string }).name })
    return jsonRes(404, { error: 'not_found' })
  }))
}

async function renderToken(token: string) {
  nav.params = { token }
  let r!: RenderResult
  await act(async () => { r = render(<MyFileTokenPage />) })
  await act(async () => { await Promise.resolve() })
  await act(async () => { await Promise.resolve() })
  return r
}

const base = { email_masked: 'm***@example.com', delivery: 'electronic', due_at: '2026-10-21T17:00:00Z', matched: [] as unknown[], disputes: [] as unknown[], alert: null }
const PACK_JSON = {
  generated_at: '2026-10-17T00:00:00Z',
  screenings: [{
    screening_id: SID, created_at: '2026-10-01T00:00:00Z', landlord_name: 'Sarah Wang', property: 'Unit 1207 · 100 King St W',
    items: [
      { kind: 'public_record', ref: 'portal:CV-26-0001', label: '安省法院门户 · 同名命中 · CV-26-0001', detail: '被告 · 2026', unverified: true },
      { kind: 'fact', ref: 'names:0', label: '姓名 · Mia Chen', detail: null, unverified: false },
    ],
    sources: ['applicant documents'], documents: [{ kind: 'pay_stub', name: 'stub.pdf' }], corrections: [],
  }],
}

describe('/my-file/[token] — five states', () => {
  beforeEach(() => { calls.length = 0; views = {} })
  afterEach(() => { vi.unstubAllGlobals() })

  it('malformed token → "link invalid" without any fetch', async () => {
    installFetch(() => null)
    const r = await renderToken('not-a-token')
    expect(byId(r, 'my-file-invalid')).toHaveLength(1)
    expect(textOf(r.container)).toContain('链接无效')
    expect(textOf(r.container)).toContain('重新发送')
    expect(calls).toHaveLength(0)
  })

  it('404 invalid_token → the same invalid card', async () => {
    installFetch(() => null)
    const r = await renderToken(TOKEN)
    expect(calls[0]).toMatchObject({ url: BASE, method: 'GET' })
    expect(byId(r, 'my-file-invalid')).toHaveLength(1)
  })

  it('pending_verification → the name / DOB / delivery form, which posts to …/verify', async () => {
    installFetch(() => ({ ...base, status: 'pending_verification' }))
    const r = await renderToken(TOKEN)
    const form = byId(r, 'my-file-verify')
    expect(form).toHaveLength(1)
    const text = textOf(r.container)
    expect(text).toContain('只用于与档案比对')
    expect(text).toContain('m***@example.com')
    const name = only(r.container, '#cf-name')
    act(() => { fireEvent.change(name, { target: { value: 'Mia Chen' } }) })
    await act(async () => { fireEvent.submit(form[0]) })
    const post = calls.find((c) => c.url === `${BASE}/verify`)
    expect(post?.method).toBe('POST')
    expect(post?.body).toMatchObject({ name: 'Mia Chen', delivery: 'electronic' })
    // the mocked verify answers needs_review → the page moves on
    expect(byId(r, 'my-file-needs-review')).toHaveLength(1)
  })

  it('needs_review → handed to a person, 2 business days, by this email', async () => {
    installFetch(() => ({ ...base, status: 'needs_review' }))
    const r = await renderToken(TOKEN)
    expect(byId(r, 'my-file-needs-review')).toHaveLength(1)
    const text = textOf(r.container)
    expect(text).toContain('专人')
    expect(text).toContain('2 个工作日')
    expect(text).toContain('m***@example.com')
  })

  it('fulfilled → pack iframe + print / JSON + items + my disputes + identity alert card', async () => {
    installFetch(() => ({ ...base, status: 'fulfilled', name: 'Mia Chen', matched: [{ screening_id: SID, created_at: '2026-10-01', landlord_name: 'Sarah Wang', property: 'Unit 1207' }] }), { html: '<html><body>PACK</body></html>', json: PACK_JSON })
    const r = await renderToken(TOKEN)
    expect(byId(r, 'my-file-matched')).toHaveLength(1)
    expect(calls.map((c) => c.url)).toEqual(expect.arrayContaining([`${BASE}/pack?format=html`, `${BASE}/pack?format=json`]))
    const frame = byId(r, 'pack-frame')
    expect(frame).toHaveLength(1)
    expect(frame[0].getAttribute('srcdoc')).toContain('PACK')
    expect(frame[0].getAttribute('sandbox')).toBe('')
    expect(byId(r, 'pack-print')).toHaveLength(1)
    expect(byId(r, 'pack-json')).toHaveLength(1)
    expect(byId(r, 'pack-item')).toHaveLength(2)
    expect(byId(r, 'my-disputes')).toHaveLength(1)
    expect(byId(r, 'identity-alert')).toHaveLength(1)
    expect(byId(r, 'my-file-queued')).toHaveLength(0)
    const text = textOf(r.container)
    expect(text).toContain('未佐证')
    expect(text).toContain('这条不对')
    expect(text).not.toMatch(/\d+\s*\/\s*100/) // no score on the applicant's own page
  })

  it('matched + mail → queued notice with the due date, pack still readable', async () => {
    installFetch(() => ({ ...base, status: 'matched', delivery: 'mail' }), { html: '<html></html>', json: PACK_JSON })
    const r = await renderToken(TOKEN)
    expect(byId(r, 'my-file-queued')).toHaveLength(1)
    expect(textOf(byId(r, 'my-file-queued')[0])).toContain('已排队')
    expect(byId(r, 'disclosure-pack')).toHaveLength(1)
  })

  it('closed → closed card with a way to send again', async () => {
    installFetch(() => ({ ...base, status: 'closed' }))
    const r = await renderToken(TOKEN)
    expect(byId(r, 'my-file-closed')).toHaveLength(1)
  })
})

describe('/my-file/[token] — dispute and identity alert', () => {
  beforeEach(() => { calls.length = 0 })
  afterEach(() => { vi.unstubAllGlobals() })

  it('"这条不对" opens an inline form that posts the item to …/dispute, then lists it', async () => {
    installFetch(() => ({ ...base, status: 'fulfilled', matched: [{ screening_id: SID, created_at: '2026-10-01' }] }), { html: '<html></html>', json: PACK_JSON })
    const r = await renderToken(TOKEN)
    const open = byId(r, 'dispute-open')
    expect(open).toHaveLength(2)
    act(() => { fireEvent.click(open[0]) })
    const form = byId(r, 'dispute-form')
    expect(form).toHaveLength(1)
    const ta = only(r.container, '[id="dispute-portal:CV-26-0001"]')
    act(() => { fireEvent.change(ta, { target: { value: '这条法庭记录里的人不是我，我从没住过那个地址。' } }) })
    await act(async () => { fireEvent.click(byId(r, 'dispute-submit')[0]) })
    const post = calls.find((c) => c.url === `${BASE}/dispute`)
    expect(post?.method).toBe('POST')
    expect(post?.body).toEqual({
      screening_id: SID,
      item_kind: 'public_record',
      item_ref: 'portal:CV-26-0001',
      item_label: '安省法院门户 · 同名命中 · CV-26-0001',
      statement: '这条法庭记录里的人不是我，我从没住过那个地址。',
    })
    expect(byId(r, 'dispute-form')).toHaveLength(0)
    const list = textOf(byId(r, 'my-disputes')[0])
    expect(list).toContain('正在核实')
    expect(list).toContain('CV-26-0001')
    expect(textOf(r.container)).toContain('已提出争议')
  })

  it('identity alert: set posts …/alert, withdraw asks in-page (no window.confirm) then DELETEs', async () => {
    installFetch(() => ({ ...base, status: 'fulfilled', matched: [{ screening_id: SID, created_at: '2026-10-01' }] }), { html: '<html></html>', json: PACK_JSON })
    const r = await renderToken(TOKEN)
    const ta = only(r.container, '#cf-alert')
    act(() => { fireEvent.change(ta, { target: { value: '我的证件曾遗失，请先电话核实。' } }) })
    const setBtn = buttonsNamed(byId(r, 'identity-alert')[0], '设置警示')[0]
    await act(async () => { fireEvent.click(setBtn) })
    expect(calls.find((c) => c.url === `${BASE}/alert` && c.method === 'POST')?.body).toEqual({ statement: '我的证件曾遗失，请先电话核实。' })
    expect(byId(r, 'identity-alert-current')).toHaveLength(1)
    const withdraw = buttonsNamed(byId(r, 'identity-alert')[0], '撤销')[0]
    act(() => { fireEvent.click(withdraw) })
    expect(byId(r, 'identity-alert-revoke-confirm')).toHaveLength(1)
    const yes = buttonsNamed(byId(r, 'identity-alert-revoke-confirm')[0], '确认撤销')[0]
    await act(async () => { fireEvent.click(yes) })
    expect(calls.some((c) => c.url === `${BASE}/alert` && c.method === 'DELETE')).toBe(true)
    expect(byId(r, 'identity-alert-current')).toHaveLength(0)
    for (const f of ['components/consumer/MyFileToken.tsx', 'components/consumer/AlertCard.tsx', 'components/consumer/PackView.tsx']) {
      expect(read(f), f).not.toMatch(/window\.(confirm|alert)\(/)
    }
  })
})

describe('/my-file — the request form never reveals whether an email exists', () => {
  beforeEach(() => { calls.length = 0 })
  afterEach(() => { vi.unstubAllGlobals() })

  it('posts to /api/consumer/request and shows the fixed sentence', async () => {
    installFetch(() => null)
    let r!: RenderResult
    await act(async () => { r = render(<MyFilePage />) })
    const text0 = textOf(r.container)
    expect(text0).toContain('我的筛查档案')
    expect(text0).toContain('申请时的邮箱')
    expect(text0).toContain('2 个工作日')
    const input = only(r.container, '#my-file-email')
    act(() => { fireEvent.change(input, { target: { value: 'Nobody@Example.com' } }) })
    await act(async () => { fireEvent.submit(byId(r, 'my-file-form')[0]) })
    const post = calls.find((c) => c.url === '/api/consumer/request')
    expect(post?.method).toBe('POST')
    expect(post?.body).toMatchObject({ email: 'nobody@example.com' })
    expect(byId(r, 'my-file-sent')).toHaveLength(1)
    const text = textOf(r.container)
    expect(text).toContain('如果这个邮箱申请过房源，你会收到一封邮件')
    expect(text).not.toMatch(/没有找到|未找到|不存在|not found|no file/i)
    expect(all(r.container, 'a').filter((n) => n.getAttribute('href') === '/consumer-rights').length).toBeGreaterThan(0)
  })
})

describe('screening pages only gained things', () => {
  it('report: alert banner + corrections above the verdict, the rights link after NextStepCard, old anchors intact', () => {
    const s = read('app/screening/[id]/report/page.tsx')
    expect(s).toContain("import CorrectionsNotice from '@/components/screening/CorrectionsNotice'")
    expect(s).toContain("import ConsumerAlertBanner from '@/components/screening/ConsumerAlertBanner'")
    const mount = s.indexOf('<ConsumerAlertBanner screeningId={id}')
    const corr = s.indexOf('<CorrectionsNotice screeningId={id}')
    const verdict = s.indexOf('{/* VERDICT CARD */}')
    expect(mount).toBeGreaterThan(0)
    expect(corr).toBeGreaterThan(mount)
    expect(verdict).toBeGreaterThan(corr)
    const next = s.indexOf('<NextStepCard')
    const link = s.indexOf('data-testid="consumer-rights-link"')
    expect(next).toBeGreaterThan(verdict)
    expect(link).toBeGreaterThan(next)
    expect(s).toContain('href="/consumer-rights"')
    for (const anchor of ['{/* HARD GATES & RED FLAGS', 'generateScreeningReport(r,', '<VerifiedFactsSection', 'nextStepsFor({ tier: r.v3_tier']) expect(s, anchor).toContain(anchor)
  })
  it('done: both components above the Score Card, NextStepCard still under it', () => {
    const s = read('app/screening/[id]/done/page.tsx')
    expect(s).toContain("import CorrectionsNotice from '@/components/screening/CorrectionsNotice'")
    expect(s).toContain("import ConsumerAlertBanner from '@/components/screening/ConsumerAlertBanner'")
    const mount = s.indexOf('<ConsumerAlertBanner screeningId={id}')
    const corr = s.indexOf('<CorrectionsNotice screeningId={id}')
    const score = s.indexOf('{/* Score Card */}')
    const next = s.indexOf('<NextStepCard steps={nextSteps}')
    expect(mount).toBeGreaterThan(0)
    expect(corr).toBeGreaterThan(mount)
    expect(score).toBeGreaterThan(corr)
    expect(next).toBeGreaterThan(score)
    expect(s).toContain('<ScoreRing score={score}')
  })
  it('notice: the original "your rights" paragraph stays, one sentence links /consumer-rights', () => {
    const s = read('app/screening/[id]/notice/page.tsx')
    expect(s).toContain('你可以向我们索取本次决定所依据的信息摘要')
    expect(s).toContain('10(7)')
    expect(s).toContain('href="/consumer-rights"')
    expect(s).toContain('www.stayloop.ai/my-file')
  })
  it('the two screening components are additive readers: RLS select / JWT GET, render null when empty', () => {
    const c = read('components/screening/CorrectionsNotice.tsx')
    expect(c).toContain(".from('screening_corrections')")
    expect(c).toContain('if (rows.length === 0) return null')
    expect(c).toContain('本档案有')
    const a = read('components/screening/ConsumerAlertBanner.tsx')
    expect(a).toContain('/api/consumer/alert?screening=')
    expect(a).toContain('Authorization: `Bearer ${token}`')
    expect(a).toContain('if (!alert) return null')
    expect(a).toContain('申请人在档案上设置了身份警示')
  })
  it('privacy §3 links both pages', () => {
    const s = read('app/privacy/page.tsx')
    expect(s).toContain('href="/consumer-rights"')
    expect(s).toContain('href="/my-file"')
  })
})

describe('middleware, /consumer-rights, route-audit', () => {
  it('middleware sends no-referrer on /my-file/<token>', () => {
    const s = read('middleware.ts')
    expect(s).toMatch(/const TOKEN_PAGE_PREFIXES = \[[^\]]*'\/my-file\/'/)
  })
  it('/consumer-rights names s.12 / s.13 / s.12.1 / s.9(3)(b), is free, and never disclaims agency status', () => {
    const s = read('app/consumer-rights/page.tsx')
    for (const cite of ['s.12', 's.13', 's.12.1', 's.9(3)(b)']) expect(s, cite).toContain(cite)
    expect(s).toContain('免费')
    expect(s).toContain('privacy@stayloop.ai')
    expect(s).toContain('href="/my-file"')
    expect(s).toContain('7 年')
    expect(s).toContain('12 个月')
    expect(s).not.toContain('不是消费者报告机构')
    expect(s).not.toContain('不是《消费者报告法》')
    expect(s).not.toMatch(/not a consumer reporting agency/i)
  })
  it('pages use the site container and no window.confirm / alert', () => {
    for (const f of ['app/my-file/page.tsx', 'app/my-file/[token]/page.tsx', 'app/consumer-rights/page.tsx']) {
      const s = read(f)
      for (const cls of ['max-w-[1320px]', 'px-6', 'sm:px-8', 'lg:px-12']) expect(s, `${f} ${cls}`).toContain(cls)
      expect(s, f).not.toMatch(/window\.(confirm|alert)\(/)
    }
  })
  it('route-audit carries the four probes', () => {
    const s = read('scripts/route-audit.mjs')
    expect(s).toMatch(/PUBLIC = \[[^\]]*'\/my-file'[^\]]*\]/)
    expect(s).toMatch(/PUBLIC = \[[^\]]*'\/consumer-rights'[^\]]*\]/)
    expect(s).toContain('/my-file/not-a-token')
    expect(s).toContain("bodyIncludes: '链接无效'")
    expect(s).toContain('/api/consumer/request`')
    expect(s).toContain('status: [200, 400, 429]')
  })
})
