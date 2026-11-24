// @vitest-environment jsdom
// V0.9 (2026-11-23) — 「申请加入」 with the AI Agent filling the form, as the person meets it:
// the box they hand their material to, the entrance page that routes on the answer, and the two
// forms opening with the suggestion laid into their empty fields for the person to check.
// The rules behind it are in tests/onboardAssist20261123.spec.ts.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import React from 'react'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { all, only, textOf } from './helpers/dom'
import { EMPTY_AGENT, EMPTY_BUSINESS, type OnboardSuggestion } from '../lib/onboard/assist'

const read = (p: string) => readFileSync(p, 'utf8')

const state = vi.hoisted(() => ({
  path: '/provider/onboard',
  lang: 'zh' as 'zh' | 'en',
  auth: { user: { id: 'u1', email: 'someone@example.org' } as null | { id: string; email: string }, loading: false },
  hats: { loading: false, tenant: true, landlord: false, agent: null as string | null, provider: null as string | null, admin: false },
  tables: {} as Record<string, unknown[]>,
  writes: [] as { table: string; op: string; row: unknown }[],
  pushed: [] as string[],
  // what the route would answer
  answer: null as null | { ok: true; result: unknown } | { ok: false; error: string; links?: unknown[] },
  asked: [] as { text: string; files: number; hint: string | null }[],
}))

vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => React.createElement('a', { href, ...rest }, children) }))
vi.mock('next/navigation', () => {
  const router = { replace: () => undefined, push: (h: string) => { state.pushed.push(h) } }
  return { usePathname: () => state.path, useRouter: () => router }
})
vi.mock('@/lib/i18n', () => ({ useT: () => ({ lang: state.lang, t: (_k: string, f: string) => f }), useI18n: () => ({ lang: state.lang, t: (_k: string, f: string) => f }) }))
vi.mock('@/lib/useAuth', () => ({ useAuth: () => state.auth }))
vi.mock('@/lib/useHats', () => ({ invalidateHats: () => undefined, useHats: () => state.hats }))
vi.mock('@/lib/marketplace/config', () => ({ useMarketplaceConfig: () => ({ graceDays: 0, quoteHoursDefault: 24 }) }))
vi.mock('@/components/Header', () => ({ default: () => React.createElement('header') }))
vi.mock('@/components/Footer', () => ({ default: () => React.createElement('footer') }))
vi.mock('@/components/WorkspaceShell', () => ({ default: ({ children }: { children: React.ReactNode }) => React.createElement('main', null, children) }))
vi.mock('@/components/AgentBadge', () => ({ AgentBadge: () => React.createElement('span') }))
vi.mock('@/components/agent/PublicProfileEditor', () => ({ default: () => React.createElement('div', { 'data-testid': 'profile-editor' }) }))
vi.mock('@/components/provider/ProviderShell', () => ({ default: ({ children }: { children: React.ReactNode }) => React.createElement('main', null, children) }))
vi.mock('@/components/provider/ProviderPhotoControl', () => ({ default: () => React.createElement('div', { 'data-testid': 'photo-control' }) }))
vi.mock('@/lib/supabase', () => {
  const from = (table: string) => {
    const rows = () => state.tables[table] ?? []
    const q: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'order']) q[m] = () => q
    q.maybeSingle = () => Promise.resolve({ data: rows()[0] ?? null, error: null })
    q.insert = (row: unknown) => {
      state.writes.push({ table, op: 'insert', row })
      // the application creates the record the credentials then hang off
      if (table === 'service_providers') state.tables.service_providers = [{ id: 'p-new', ...(row as object), status: 'pending', review_note: null, verified_at: null, photo_key: null }]
      return Promise.resolve({ error: null })
    }
    q.update = (row: unknown) => { state.writes.push({ table, op: 'update', row }); return { eq: () => Promise.resolve({ error: null }) } }
    q.then = (ok: (v: { data: unknown[]; error: null }) => unknown) => Promise.resolve({ data: rows(), error: null }).then(ok)
    return q
  }
  return { supabase: { from } }
})
// The browser's file work and the network call are replaced; the hand-off between pages is the real one.
vi.mock('@/lib/onboard/client', async (orig) => {
  const real = await orig<typeof import('../lib/onboard/client')>()
  return {
    ...real,
    prepareFiles: async (files: File[]) => ({ blobs: files.map(() => new Blob(['x'])), skipped: [] }),
    requestAssist: async (o: { text: string; blobs: Blob[]; hint: string | null }) => { state.asked.push({ text: o.text, files: o.blobs.length, hint: o.hint }); return state.answer ?? { ok: false, error: 'failed' } },
  }
})

import AssistComposer from '../components/onboard/AssistComposer'
import AssistReview from '../components/onboard/AssistReview'
import OnboardEntryPage from '../app/onboard/page'
import ProviderOnboardPage from '../app/provider/onboard/page'
import ProfessionalOnboardPage from '../app/provider/onboard/professional/page'
import AgentVerifyPage from '../app/agent/verify/page'
import { saveDraft, takeDraft, DRAFT_TTL_MS } from '../lib/onboard/client'

afterEach(() => {
  cleanup()
  sessionStorage.clear()
  state.path = '/provider/onboard'
  state.lang = 'zh'
  state.auth = { user: { id: 'u1', email: 'someone@example.org' }, loading: false }
  state.hats = { loading: false, tenant: true, landlord: false, agent: null, provider: null, admin: false }
  state.tables = {}
  state.writes = []
  state.pushed = []
  state.answer = null
  state.asked = []
  window.history.replaceState({}, '', '/')
})

const flush = async () => { await act(async () => { for (let i = 0; i < 12; i++) await Promise.resolve() }) }
const type = (el: Element, v: string) => act(() => { fireEvent.change(el, { target: { value: v } }) })
const click = async (el: Element) => { await act(async () => { fireEvent.click(el) }); await flush() }
const field = (c: ParentNode, label: string) => {
  const l = all<HTMLLabelElement>(c, 'label').find((x) => (x.textContent ?? '').startsWith(label))
  if (!l) throw new Error(`no field labelled ${label}`)
  return only<HTMLInputElement>(l, 'input, textarea, select')
}
const tagged = (c: ParentNode, label: string) => {
  const l = all<HTMLLabelElement>(c, 'label').find((x) => (x.textContent ?? '').startsWith(label))
  return !!l && all(l, '[data-testid="ai-tag"]').length === 1
}

const PLUMBER: OnboardSuggestion = {
  kind: 'repair',
  business: { ...EMPTY_BUSINESS, legal_name: 'Northgate Plumbing & Drain Inc.', trade_name: 'Northgate Plumbing', trades: ['plumbing', 'handyman'], service_cities: ['Toronto', 'Markham'], hourly_rate: 120, call_out_fee: 90, contact_name: 'Daniel Okafor', contact_email: 'service@northgate.example', contact_phone: '647-555-0182', languages: ['zh', 'en'], bio: 'We fix leaks.' },
  credentials: [{ kind: 'liability_insurance', number: 'CGL-88204417', holder_name: 'Northgate Plumbing & Drain Inc.', expires_at: '2027-03-31' }, { kind: 'sto_coq', number: '44719203', holder_name: 'Daniel Okafor', expires_at: null }, { kind: 'lso_paralegal', number: 'P01234', holder_name: null, expires_at: null }],
  agent: EMPTY_AGENT,
}
const AGENT: OnboardSuggestion = { kind: 'agent', business: EMPTY_BUSINESS, credentials: [], agent: { ...EMPTY_AGENT, legal_name: 'Jordan Lee', reco_number: '1234567', category: 'broker', brokerage_name: 'Example Realty Inc., Brokerage', business_phone: '416-555-0111' } }
const result = (suggestion: OnboardSuggestion, found = 9) => ({ ok: true as const, result: { suggestion, found, links: [], images: 0 } })

// ───────────────────────────────────────────────────────────── the box

describe('the box an applicant hands their material to', () => {
  it('signed in: one sentence and a file go to the AI Agent, and the answer comes back to the page', async () => {
    const got: unknown[] = []
    state.answer = result(PLUMBER)
    const { container: c } = render(<AssistComposer zh signedIn loginHref="/login?next=%2Fonboard" onResult={(r) => got.push(r)} />)
    expect(textOf(only(c, '[data-testid="assist-run"]'))).toBe('让 AI 助理填表')
    type(only(c, '[data-testid="assist-text"]'), '我是水管工，服务多伦多')
    await act(async () => { fireEvent.change(only(c, '[data-testid="assist-file-input"]'), { target: { files: [new File(['x'], 'card.jpg', { type: 'image/jpeg' })] } }) })
    expect(all(c, '[data-testid="assist-files"] li').map(textOf)).toEqual(['card.jpg×'])
    await click(only(c, '[data-testid="assist-run"]'))
    expect(state.asked).toEqual([{ text: '我是水管工，服务多伦多', files: 1, hint: null }])
    expect(got.length).toBe(1)
    // the box is cleared for the next piece of material
    expect(only<HTMLTextAreaElement>(c, '[data-testid="assist-text"]').value).toBe('')
    expect(all(c, '[data-testid="assist-files"]').length).toBe(0)
  })
  it('nothing given, or nothing found: it says so and hands nothing on', async () => {
    const got: unknown[] = []
    const { container: c } = render(<AssistComposer zh signedIn loginHref="/x" onResult={(r) => got.push(r)} />)
    await click(only(c, '[data-testid="assist-run"]'))
    expect(textOf(only(c, '[data-testid="assist-error"]'))).toBe('先写一句你是做什么的，或者加一张照片。')
    expect(state.asked.length).toBe(0)
    state.answer = result({ ...PLUMBER, kind: null }, 0)
    type(only(c, '[data-testid="assist-text"]'), '你好')
    await click(only(c, '[data-testid="assist-run"]'))
    expect(textOf(only(c, '[data-testid="assist-error"]'))).toContain('没读到能填进表里的内容')
    expect(got.length).toBe(0)
    // what they wrote is still there to add to
    expect(only<HTMLTextAreaElement>(c, '[data-testid="assist-text"]').value).toBe('你好')
    // nothing to fill in, but the kind is known (「我是地产经纪」): that is still worth handing on
    state.answer = result(AGENT, 0)
    await click(only(c, '[data-testid="assist-run"]'))
    expect(got.length).toBe(1)
  })
  it('a register link is answered with why, not with a failure', async () => {
    state.answer = { ok: false, error: 'link_unreadable', links: [{ url: 'https://registrantsearch.reco.on.ca/', ok: false, reason: 'register' }] }
    const { container: c } = render(<AssistComposer zh signedIn loginHref="/x" onResult={() => undefined} />)
    type(only(c, '[data-testid="assist-text"]'), 'https://registrantsearch.reco.on.ca/')
    await click(only(c, '[data-testid="assist-run"]'))
    expect(textOf(only(c, '[data-testid="assist-error"]'))).toBe('官方注册库的页面 AI 不读。写下你的注册名和编号就行，核验由工作人员人工完成。')
  })
  it('not signed in: the button is the way to sign in, and what was typed is kept for the way back', () => {
    const { container: c, unmount } = render(<AssistComposer zh signedIn={false} loginHref="/login?next=%2Fonboard" onResult={() => undefined} />)
    expect(all(c, '[data-testid="assist-run"]').length).toBe(0)
    const link = only<HTMLAnchorElement>(c, '[data-testid="assist-signin"]')
    expect(link.getAttribute('href')).toBe('/login?next=%2Fonboard')
    expect(textOf(link)).toBe('登录后让 AI 助理填表')
    type(only(c, '[data-testid="assist-text"]'), '我是水管工')
    unmount()
    const again = render(<AssistComposer zh signedIn loginHref="/x" onResult={() => undefined} />)
    expect(only<HTMLTextAreaElement>(again.container, '[data-testid="assist-text"]').value).toBe('我是水管工')
  })
  it('says where the material goes, in both languages; English carries no Chinese', () => {
    let r = render(<AssistComposer zh signedIn loginHref="/x" onResult={() => undefined} />)
    expect(textOf(only(r.container, '[data-testid="assist-disclosure"]'))).toBe('你写的文字、链接指向的网页和图片会发送给 AI 模型读取，只用来填这张申请表；图片不保存。官方注册库的页面 AI 不读，核验由 Stayloop 工作人员人工完成。')
    cleanup()
    r = render(<AssistComposer zh={false} variant="compact" hint="repair" signedIn loginHref="/x" onResult={() => undefined} />)
    expect(r.container.textContent).not.toMatch(/[一-鿿]/)
    expect(r.container.textContent).toContain('AI Agent')
    for (const f of ['components/onboard/AssistComposer.tsx', 'components/onboard/AssistReview.tsx', 'app/onboard/page.tsx']) expect(read(f), f).not.toMatch(/助手|管家|AI assistant|背调/)
  })
  it('the review strip: how many, which, what is still the person’s, and one way back', () => {
    let cleared = 0
    const { container: c } = render(<AssistReview zh filled={['法定名称', '工种', '资质 2 条']} missing={['服务城市', '勾选承诺']} onClear={() => { cleared++ }} />)
    expect(textOf(only(c, '[data-testid="assist-review-title"]'))).toBe('AI 助理填了 3 项，请逐项核对')
    expect(textOf(only(c, '[data-testid="assist-review-filled"]'))).toBe('法定名称、工种、资质 2 条')
    expect(textOf(only(c, '[data-testid="assist-review-missing"]'))).toBe('还需要你来：服务城市、勾选承诺')
    fireEvent.click(only(c, '[data-testid="assist-review-clear"]'))
    expect(cleared).toBe(1)
    cleanup()
    expect(render(<AssistReview zh filled={[]} missing={['x']} onClear={() => undefined} />).container.textContent).toBe('')
  })
})

// ───────────────────────────────────────────────────────────── from the entrance to the form

describe('the hand-off between the entrance and the form', () => {
  it('one account, one read, half an hour', () => {
    saveDraft('u1', { suggestion: PLUMBER, links: [] }, 1_000_000)
    expect(takeDraft('someone-else', 1_000_100)).toBeNull() // and it is gone: a foreign draft is not kept around
    expect(takeDraft('u1', 1_000_200)).toBeNull()
    saveDraft('u1', { suggestion: PLUMBER, links: [] }, 1_000_000)
    expect(takeDraft('u1', 1_000_000 + DRAFT_TTL_MS + 1)).toBeNull()
    saveDraft('u1', { suggestion: PLUMBER, links: [{ url: 'https://x.example/', ok: false, reason: 'empty' }] }, 1_000_000)
    const d = takeDraft('u1', 1_000_500)
    expect(d?.suggestion.business.legal_name).toBe('Northgate Plumbing & Drain Inc.')
    expect(d?.links).toEqual([{ url: 'https://x.example/', ok: false, reason: 'empty' }])
    expect(takeDraft('u1', 1_000_600)).toBeNull()
  })
  it('what is stored is read back through the same sanitizer', () => {
    sessionStorage.setItem('stayloop_onboard_draft', JSON.stringify({ v: 1, at: Date.now(), uid: 'u1', suggestion: { kind: 'repair', business: { legal_name: 'X', trades: ['wizardry'], website: 'javascript:alert(1)' }, attest: true } }))
    const d = takeDraft('u1')
    expect(d?.suggestion.business).toMatchObject({ legal_name: 'X', trades: [], website: null })
    expect(JSON.stringify(d)).not.toContain('attest')
  })
})

describe('/onboard — the entrance', () => {
  it('a plumber’s material opens the property-maintenance form with the suggestion waiting', async () => {
    state.answer = result(PLUMBER)
    const { container: c } = render(<OnboardEntryPage />)
    expect(textOf(only(c, '[data-testid="onboard-entry-title"]')).replace(/ /g, ' ')).toBe('把资料交给 AI 助理，申请表它来填')
    expect(all(c, '[data-testid="onboard-entry-steps"] li').length).toBe(3)
    type(only(c, '[data-testid="assist-text"]'), '我是水管工')
    await click(only(c, '[data-testid="assist-run"]'))
    expect(state.pushed).toEqual(['/provider/onboard'])
    expect(takeDraft('u1')?.suggestion.business.trade_name).toBe('Northgate Plumbing')
  })
  it('an agent’s goes to the registration form, a paralegal’s to the professional one', async () => {
    state.answer = result(AGENT)
    let r = render(<OnboardEntryPage />)
    type(only(r.container, '[data-testid="assist-text"]'), 'x y z')
    await click(only(r.container, '[data-testid="assist-run"]'))
    cleanup()
    state.answer = result({ ...PLUMBER, kind: 'professional', business: { ...PLUMBER.business, trades: ['paralegal'] } })
    r = render(<OnboardEntryPage />)
    type(only(r.container, '[data-testid="assist-text"]'), 'x y z')
    await click(only(r.container, '[data-testid="assist-run"]'))
    expect(state.pushed).toEqual(['/agent/verify', '/provider/onboard/professional'])
  })
  it('when the kind is not clear the person picks, and what was read goes with them', async () => {
    // a name and a phone number, and nothing that says what the business does
    state.answer = result({ ...PLUMBER, kind: null, business: { ...PLUMBER.business, trades: [] }, credentials: [] })
    const { container: c } = render(<OnboardEntryPage />)
    type(only(c, '[data-testid="assist-text"]'), 'x y z')
    await click(only(c, '[data-testid="assist-run"]'))
    expect(state.pushed).toEqual([])
    only(c, '[data-testid="onboard-entry-undecided"]')
    await click(only(c, '[data-testid="onboard-entry-pick-professional"]'))
    // the pick decides which form opens; the form takes the content, whatever kind it was called
    expect(state.pushed).toEqual(['/provider/onboard/professional'])
    expect(takeDraft('u1')?.suggestion.business).toMatchObject({ legal_name: 'Northgate Plumbing & Drain Inc.', contact_phone: '647-555-0182' })
  })
  it('the three forms are still one click away, and someone with a record is shown the way back to it', () => {
    state.hats = { ...state.hats, provider: 'verified', agent: 'verified' }
    const { container: c } = render(<OnboardEntryPage />)
    expect(all<HTMLAnchorElement>(c, '[data-testid^="onboard-entry-form-"]').map((a) => a.getAttribute('href'))).toEqual(['/agent/verify', '/provider/onboard', '/provider/onboard/professional'])
    expect(all<HTMLAnchorElement>(c, '[data-testid="onboard-entry-mine"] a').map((a) => a.getAttribute('href'))).toEqual(['/agent/verify', '/provider/onboard'])
  })
  it('signed out it is still a page: the box is there and the button leads to sign-in and back', () => {
    state.auth = { user: null, loading: false }
    const { container: c } = render(<OnboardEntryPage />)
    expect(only<HTMLAnchorElement>(c, '[data-testid="assist-signin"]').getAttribute('href')).toBe('/login?next=%2Fonboard')
    expect(read('app/onboard/page.tsx')).not.toMatch(/supabase|\.insert\(|\.update\(/)
  })
})

// ───────────────────────────────────────────────────────────── the forms

describe('the provider form opens with the suggestion laid into its empty fields', () => {
  const open = async () => {
    saveDraft('u1', { suggestion: PLUMBER, links: [] })
    const r = render(<ProviderOnboardPage />)
    await flush()
    return r
  }
  it('fields filled and marked, the count stated, what is still the person’s named', async () => {
    const { container: c } = await open()
    expect(field(c, '法定名称').value).toBe('Northgate Plumbing & Drain Inc.')
    expect(field(c, '电话').value).toBe('647-555-0182')
    expect(field(c, '时薪').value).toBe('120')
    expect(tagged(c, '法定名称')).toBe(true)
    // the account's own e-mail was there first, so the one on the card does not replace it
    expect(all<HTMLInputElement>(c, 'input[type="email"]').map((i) => i.value)).toEqual(['someone@example.org'])
    expect(all(c, '[data-testid="onboard-trades"] button[aria-pressed="true"]').map(textOf)).toEqual(['水管', '杂工 / 清洁'])
    expect(textOf(only(c, '[data-testid="assist-review-title"]'))).toBe('AI 助理填了 11 项，请逐项核对')
    expect(textOf(only(c, '[data-testid="assist-review-filled"]'))).toBe('法定名称、对外名称、联系人、电话、简介、工种、服务城市、服务语言、时薪、上门费、资质 2 条')
    expect(textOf(only(c, '[data-testid="assist-review-missing"]'))).toBe('还需要你来：勾选承诺')
    // a credential of the other kind of form is not offered here
    expect(all(c, '[data-testid="credential-draft"]').map((d) => only<HTMLSelectElement>(d, 'select').value)).toEqual(['liability_insurance', 'sto_coq'])
  })
  it('the attestation is never ticked for them, and nothing is submitted until they tick it', async () => {
    const { container: c } = await open()
    const box = only<HTMLInputElement>(c, '[data-testid="onboard-submit-card"] input[type="checkbox"]')
    expect(box.checked).toBe(false)
    await click(only(c, '[data-testid="onboard-submit-card"] button'))
    expect(state.writes).toEqual([])
    expect(textOf(only(c, '[role="alert"]'))).toContain('请勾选承诺')
  })
  it('a field they change is theirs: its mark goes and the count follows', async () => {
    const { container: c } = await open()
    type(field(c, '法定名称'), 'Northgate Plumbing and Drain Incorporated')
    expect(tagged(c, '法定名称')).toBe(false)
    expect(textOf(only(c, '[data-testid="assist-review-title"]'))).toBe('AI 助理填了 10 项，请逐项核对')
  })
  it('「清掉 AI 填的内容」 puts back what was there, and keeps what they changed', async () => {
    const { container: c } = await open()
    type(field(c, '电话'), '416-555-0000')
    await click(only(c, '[data-testid="assist-review-clear"]'))
    expect(field(c, '法定名称').value).toBe('')
    expect(field(c, '电话').value).toBe('416-555-0000')
    expect(all(c, '[data-testid="ai-tag"], [data-testid="assist-review"], [data-testid="credential-draft"]').length).toBe(0)
    expect(all(c, '[data-testid="onboard-trades"] button[aria-pressed="true"]').length).toBe(0)
  })
  it('one submit sends the application and then the credentials that were waiting', async () => {
    const { container: c } = await open()
    await click(only(c, '[data-testid="onboard-submit-card"] input[type="checkbox"]'))
    await click(only(c, '[data-testid="onboard-submit-card"] button'))
    expect(state.writes.map((w) => [w.table, w.op])).toEqual([['service_providers', 'insert'], ['provider_credentials', 'insert']])
    expect(state.writes[0].row).toMatchObject({ auth_id: 'u1', legal_name: 'Northgate Plumbing & Drain Inc.', trades: ['plumbing', 'handyman'], hourly_rate: 120, call_out_fee: 90 })
    expect(state.writes[1].row).toEqual([
      { provider_id: 'p-new', kind: 'liability_insurance', number: 'CGL-88204417', holder_name: 'Northgate Plumbing & Drain Inc.', expires_at: '2027-03-31' },
      { provider_id: 'p-new', kind: 'sto_coq', number: '44719203', holder_name: 'Daniel Okafor', expires_at: null },
    ])
    // submitted: the marks are gone, and the waiting list with them
    expect(all(c, '[data-testid="ai-tag"], [data-testid="assist-review"], [data-testid="credential-draft"]').length).toBe(0)
  })
  it('on the form itself the same box fills what is still empty, and says so when there is nothing to add', async () => {
    const r = render(<ProviderOnboardPage />)
    await flush()
    const c = r.container
    only(c, '[data-testid="onboard-assist"] [data-testid="assist-composer"][data-variant="compact"]')
    type(field(c, '法定名称'), 'My Own Name Ltd.')
    state.answer = result(PLUMBER)
    type(only(c, '[data-testid="assist-text"]'), '我是水管工')
    await click(only(c, '[data-testid="assist-run"]'))
    expect(state.asked[0].hint).toBe('repair')
    expect(field(c, '法定名称').value).toBe('My Own Name Ltd.')
    expect(tagged(c, '法定名称')).toBe(false)
    expect(field(c, '电话').value).toBe('647-555-0182')
    // the same material again finds nothing left to fill
    type(only(c, '[data-testid="assist-text"]'), '我是水管工')
    await click(only(c, '[data-testid="assist-run"]'))
    expect(textOf(only(c, '[data-testid="onboard-assist-note"]'))).toBe('AI 助理读了，但表里还空着的那几项，材料里没有提到。')
  })
  it('a record that exists keeps its own values, and read credentials wait for a click instead of a resubmit', async () => {
    state.tables = {
      service_providers: [{ id: 'p1', legal_name: 'Old Name Inc.', trade_name: null, business_number: null, service_cities: ['Toronto'], trades: ['plumbing'], pricing_mode: 'hourly', call_out_fee: null, hourly_rate: 95, contact_name: null, contact_email: 'a@example.org', contact_phone: null, website: null, status: 'verified', review_note: null, verified_at: '2026-11-01T00:00:00Z', attested_at: '2026-11-01T00:00:00Z', bio: null, languages: [], photo_key: null }],
      provider_credentials: [{ id: 'c1', kind: 'liability_insurance', number: 'cgl-88204417', holder_name: null, expires_at: '2026-12-31', verified_at: null }],
    }
    const { container: c } = await open()
    expect(field(c, '法定名称').value).toBe('Old Name Inc.')
    expect(field(c, '时薪').value).toBe('95')
    expect(field(c, '上门费').value).toBe('90')
    // the policy already on file is not offered again; the certificate is
    expect(all(c, '[data-testid="credential-draft"]').map((d) => only<HTMLSelectElement>(d, 'select').value)).toEqual(['sto_coq'])
    await click(only(c, '[data-testid="credential-draft-register"]'))
    expect(state.writes).toEqual([{ table: 'provider_credentials', op: 'insert', row: [{ provider_id: 'p1', kind: 'sto_coq', number: '44719203', holder_name: 'Daniel Okafor', expires_at: null }] }])
  })
  it('the professional form takes the same suggestion without rates, and offers its own licence kinds', async () => {
    state.path = '/provider/onboard/professional'
    saveDraft('u1', { suggestion: { ...PLUMBER, kind: 'professional', business: { ...PLUMBER.business, trades: ['paralegal'] } }, links: [] })
    const { container: c } = render(<ProfessionalOnboardPage />)
    await flush()
    expect(all(c, '[data-testid="onboard-pricing"]').length).toBe(0)
    expect(all(c, '[data-testid="onboard-trades"] button[aria-pressed="true"]').map(textOf)).toEqual(['持牌 Paralegal（LTB 代理）'])
    expect(textOf(only(c, '[data-testid="assist-review-filled"]'))).not.toMatch(/时薪|上门费|定价/)
    expect(all(c, '[data-testid="credential-draft"]').map((d) => only<HTMLSelectElement>(d, 'select').value)).toEqual(['liability_insurance', 'lso_paralegal'])
  })
})

describe('the agent’s registration form does the same, from the agent’s own card — never from the register', () => {
  it('a first application: the fields are filled and marked; the mark and the attestation stay theirs', async () => {
    saveDraft('u1', { suggestion: AGENT, links: [] })
    const { container: c } = render(<AgentVerifyPage />)
    await flush()
    expect(field(c, '法定姓名').value).toBe('Jordan Lee')
    expect(field(c, 'RECO 注册号').value).toBe('1234567')
    expect(field(c, '注册类别').value).toBe('broker')
    expect(field(c, '所属经纪公司').value).toBe('Example Realty Inc., Brokerage')
    expect(tagged(c, 'RECO 注册号')).toBe(true)
    expect(textOf(only(c, '[data-testid="assist-review-title"]'))).toBe('AI 助理填了 5 项，请逐项核对')
    expect(textOf(only(c, '[data-testid="assist-review-missing"]'))).toBe('还需要你来：勾选承诺')
    expect(all<HTMLInputElement>(c, 'input[type="checkbox"]').map((b) => b.checked)).toEqual([false, false])
    only(c, '[data-testid="agent-verify-assist"] [data-testid="assist-composer"]')
  })
  it('once the registration is live the box is not offered: those facts are verified', async () => {
    state.tables = { agent_profiles: [{ auth_id: 'u1', legal_name: 'Jordan Lee', trade_name: null, reco_number: '1234567', category: 'broker', brokerage_name: 'Example Realty Inc., Brokerage', business_email: null, business_phone: null, expires_at: null, crea_member: false, attested_at: '2026-11-01T00:00:00Z', status: 'verified', review_note: null }] }
    const { container: c } = render(<AgentVerifyPage />)
    await flush()
    expect(all(c, '[data-testid="agent-verify-assist"]').length).toBe(0)
    expect(field(c, '法定姓名').value).toBe('Jordan Lee')
  })
  it('the page still never reads the register itself', () => {
    const s = read('app/agent/verify/page.tsx')
    expect(s).not.toMatch(/fetch\(\s*RECO_REGISTER_URL|fetch\(['"`]https:\/\/registrantsearch/)
    expect(s).toContain("hint=\"agent\"")
  })
})
