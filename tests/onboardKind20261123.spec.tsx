// @vitest-environment jsdom
// V0.9 (2026-11-23). Two kinds of provider, two onboarding pages:
//   物业管理服务 → /provider/onboard            专业服务 → /provider/onboard/professional
// The user, looking at the one form: 「这个页面是否也要区分维修和专业服务？」 — it greeted a lawyer with
// 「加入 Stayloop 精选维修网络」, twelve trades in one list, an hourly rate and a call-out fee. It was
// split by a switch on the page first; then: 「上门维修可以改为物业管理服务，可以单独页面，和专业服务需要分开」.
// The kind is the page's address, not a stored column: one account has one provider record, a
// record may list trades of both kinds, and neither page ever drops what the other entered.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import React from 'react'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { all, only, textOf } from './helpers/dom'

const read = (p: string) => readFileSync(p, 'utf8')

const state = vi.hoisted(() => ({
  path: '/provider/onboard',
  lang: 'zh' as 'zh' | 'en',
  auth: { user: { id: 'u1', email: 'someone@example.org' } as null | { id: string; email: string }, loading: false },
  tables: {} as Record<string, unknown[]>,
  writes: [] as { table: string; op: string; row: Record<string, unknown> }[],
  replaced: [] as string[],
}))

vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => React.createElement('a', { href, ...rest }, children) }))
vi.mock('next/navigation', () => {
  const router = { replace: (h: string) => { state.replaced.push(h) }, push: () => undefined }
  return { usePathname: () => state.path, useRouter: () => router }
})
vi.mock('@/lib/i18n', () => ({ useT: () => ({ lang: state.lang, t: (_k: string, f: string) => f }) }))
vi.mock('@/lib/useAuth', () => ({ useAuth: () => state.auth }))
vi.mock('@/lib/useHats', () => ({ invalidateHats: () => undefined, useHats: () => ({ loading: false }) }))
vi.mock('@/lib/marketplace/config', () => ({ useMarketplaceConfig: () => ({ graceDays: 0, quoteHoursDefault: 24 }) }))
vi.mock('@/components/provider/ProviderShell', () => ({ default: ({ children }: { children: React.ReactNode }) => React.createElement('main', null, children) }))
vi.mock('@/components/provider/ProviderPhotoControl', () => ({ default: () => React.createElement('div', { 'data-testid': 'photo-control' }) }))
vi.mock('@/lib/supabase', () => {
  const from = (table: string) => {
    const rows = () => state.tables[table] ?? []
    const q: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'order']) q[m] = () => q
    q.maybeSingle = () => Promise.resolve({ data: rows()[0] ?? null, error: null })
    q.insert = (row: Record<string, unknown>) => { state.writes.push({ table, op: 'insert', row }); return Promise.resolve({ error: null }) }
    q.update = (row: Record<string, unknown>) => { state.writes.push({ table, op: 'update', row }); return { eq: () => Promise.resolve({ error: null }) } }
    q.then = (ok: (v: { data: unknown[]; error: null }) => unknown) => Promise.resolve({ data: rows(), error: null }).then(ok)
    return q
  }
  return { supabase: { from } }
})

import ProviderOnboardPage from '../app/provider/onboard/page'
import ProfessionalOnboardPage from '../app/provider/onboard/professional/page'
import { ONBOARD_COPY, PROFESSIONAL_REMOVE_CONFIRM, attestText, credentialKindsFor, isOnboardKind, isProfessionalOnly, onboardHref, onboardKindOf, onboardKindOfPath, otherFormHref, selectedOfKind, selectedOfOtherKind, tradesOfKind } from '../lib/marketplace/onboardKind'

afterEach(() => {
  cleanup()
  state.path = '/provider/onboard'
  state.lang = 'zh'
  state.auth = { user: { id: 'u1', email: 'someone@example.org' }, loading: false }
  state.tables = {}
  state.writes = []
  state.replaced = []
  window.history.replaceState({}, '', '/')
})

const PRO = '/provider/onboard/professional'
const flush = async () => { await act(async () => { for (let i = 0; i < 8; i++) await Promise.resolve() }) }
const mount = async (path = '/provider/onboard', search = '') => {
  state.path = path
  window.history.replaceState({}, '', path + search)
  const r = render(path === PRO ? <ProfessionalOnboardPage /> : <ProviderOnboardPage />)
  await flush()
  return r
}
const record = (o: Record<string, unknown> = {}) => ({
  id: '55555555-5555-4555-8555-555555555555', legal_name: 'Avery Legal Services', trade_name: null, business_number: null, service_cities: ['Toronto'], trades: ['paralegal'],
  pricing_mode: 'hourly', call_out_fee: null, hourly_rate: null, contact_name: null, contact_email: 'a@example.org', contact_phone: null, website: null, status: 'verified', review_note: null,
  verified_at: '2026-11-01T00:00:00Z', attested_at: '2026-11-01T00:00:00Z', bio: null, languages: [], photo_key: null, ...o,
})
const chips = (c: ParentNode) => all(c, '[data-testid="onboard-trades"] button').map(textOf)
const pressed = (c: ParentNode) => all(c, '[data-testid="onboard-trades"] button[aria-pressed="true"]').map(textOf)

// ───────────────────────────────────────────────────────────── the rule

describe('two kinds of provider (lib/marketplace/onboardKind.ts)', () => {
  it('eight property-maintenance trades and four professional services, in the catalogue’s order', () => {
    expect(tradesOfKind('repair')).toEqual(['plumbing', 'electrical', 'heating_cooling', 'appliance', 'pest', 'structural', 'locks_safety', 'handyman'])
    expect(tradesOfKind('professional')).toEqual(['photographer_floorplan', 'insurance_broker', 'paralegal', 'lawyer'])
  })
  it('each kind has a page of its own, and the address says which form it is', () => {
    expect(onboardHref('repair')).toBe('/provider/onboard')
    expect(onboardHref('professional')).toBe(PRO)
    expect(onboardKindOfPath('/provider/onboard')).toBe('repair')
    expect(onboardKindOfPath(PRO)).toBe('professional')
    expect(onboardKindOfPath(PRO + '/')).toBe('professional')
    for (const other of [null, '', '/providers/professional', '/provider/jobs', '/x/professional']) expect(onboardKindOfPath(other), String(other)).toBe('repair')
    // the way across: going back to 物业管理服务 says so, or a professional-only record would bounce
    expect(otherFormHref('repair')).toBe(PRO)
    expect(otherFormHref('professional')).toBe('/provider/onboard?type=repair')
  })
  it('where a visitor to /provider/onboard belongs: an explicit ?type= first, then the record, then 物业管理服务', () => {
    expect(onboardKindOf(null)).toBe('repair')
    expect(onboardKindOf([])).toBe('repair')
    expect(onboardKindOf(['paralegal'])).toBe('professional')
    expect(onboardKindOf(['handyman'])).toBe('repair')
    expect(onboardKindOf(['handyman', 'photographer_floorplan'])).toBe('repair')
    expect(onboardKindOf([], 'professional')).toBe('professional')
    expect(onboardKindOf(['paralegal'], 'repair')).toBe('repair')
    for (const junk of ['', 'pro', 'PROFESSIONAL', 'admin', '<script>']) expect(onboardKindOf(['paralegal'], junk), junk).toBe('professional')
    expect(isOnboardKind('professional')).toBe(true)
    expect(isOnboardKind('agent')).toBe(false)
  })
  it('professional-only means professional services and nothing that is dispatched', () => {
    expect(isProfessionalOnly(['paralegal'])).toBe(true)
    expect(isProfessionalOnly(['lawyer', 'insurance_broker'])).toBe(true)
    expect(isProfessionalOnly(['handyman', 'photographer_floorplan'])).toBe(false)
    expect(isProfessionalOnly(['plumbing'])).toBe(false)
    // a record with no trades yet is a newcomer, not a professional
    for (const none of [[], null, undefined]) expect(isProfessionalOnly(none)).toBe(false)
  })
  it('each kind is offered only the credentials its trades can need; a professional’s licence comes first', () => {
    expect(credentialKindsFor('repair')).toEqual(['sto_coq', 'esa_contractor', 'tssa_gas', 'wsib_clearance', 'liability_insurance', 'business_registration', 'mecp_exterminator'])
    expect(credentialKindsFor('professional')).toEqual(['lso_paralegal', 'lso_lawyer', 'ribo_licence', 'liability_insurance', 'business_registration'])
  })
  it('the trades picked are split by kind without losing any', () => {
    const mixed = ['handyman', 'photographer_floorplan', 'plumbing']
    expect(selectedOfKind(mixed, 'repair')).toEqual(['handyman', 'plumbing'])
    expect(selectedOfKind(mixed, 'professional')).toEqual(['photographer_floorplan'])
    expect(selectedOfOtherKind(mixed, 'repair')).toEqual(['photographer_floorplan'])
    expect(selectedOfOtherKind(mixed, 'professional')).toEqual(['handyman', 'plumbing'])
  })
  it('the attestation covers the kinds of trade actually selected', () => {
    const repair = attestText(['plumbing'], 'repair', true)
    expect(repair).toContain('接受工单即与房东直接订立服务合同')
    expect(repair).not.toContain('牌照')
    const pro = attestText(['lawyer'], 'professional', true)
    expect(pro).toContain('所列牌照由我本人或本所执业人员持有并处于有效状态')
    expect(pro).not.toMatch(/工单|账单/)
    const both = attestText(['plumbing', 'lawyer'], 'professional', true)
    expect(both).toContain('接受工单')
    expect(both).toContain('所列牌照')
    expect(attestText([], 'professional', true)).toContain('所列牌照')
    expect(attestText([], 'repair', true)).toContain('接受工单')
    for (const t of [repair, pro, both]) { expect(t.startsWith('我确认以上信息属实；')).toBe(true); expect(t.endsWith('资质变更或到期后 7 天内更新。')).toBe(true) }
    expect(attestText(['plumbing', 'lawyer'], 'repair', false)).not.toMatch(/[一-鿿]/)
  })
  it('the first kind is called 物业管理服务, not 上门维修; the professional wording never promises dispatch', () => {
    expect(ONBOARD_COPY.repair.choice.zh).toBe('物业管理服务')
    expect(ONBOARD_COPY.repair.title.zh).toBe('加入 Stayloop 物业管理服务网络')
    expect(ONBOARD_COPY.professional.choice.zh).toBe('专业服务')
    expect(ONBOARD_COPY.professional.title.zh).toBe('加入 Stayloop 专业服务目录')
    for (const k of ['repair', 'professional'] as const) expect(Object.values(ONBOARD_COPY[k]).map((v) => v.zh).join(' '), k).not.toContain('上门维修')
    const p = ONBOARD_COPY.professional
    const zh = Object.entries(p).filter(([key]) => key !== 'otherForm').map(([, v]) => v.zh).join(' ')
    expect(zh).not.toMatch(/维修|工单|上门|承包商/)
    expect(zh.replace(/不派单/g, '')).not.toContain('派单')
    expect(p.intro.zh).toContain('不派单、不收佣金')
    expect(p.footer.zh).toContain('不给法律意见、不卖保险')
    expect(PROFESSIONAL_REMOVE_CONFIRM.zh).not.toContain('派单')
    for (const k of ['repair', 'professional'] as const) for (const v of Object.values(ONBOARD_COPY[k])) expect(v.en, v.en).not.toMatch(/[一-鿿]/)
    expect(PROFESSIONAL_REMOVE_CONFIRM.en).not.toMatch(/[一-鿿]/)
  })
})

// ───────────────────────────────────────────────────────────── the two pages

describe('/provider/onboard — 物业管理服务', () => {
  it('a newcomer gets the eight trades and the rates, and one line pointing at the other page — no switch', async () => {
    const { container: c } = await mount()
    expect(textOf(only(c, '[data-testid="onboard-eyebrow"]'))).toBe('服务商入驻 · 物业管理服务')
    expect(textOf(only(c, '[data-testid="onboard-title"]'))).toBe('加入 Stayloop 物业管理服务网络')
    expect(all(c, '[data-testid="onboard-kind"], [role="radio"]').length).toBe(0)
    expect(chips(c)).toEqual(['水管', '电气', '供暖 / 空调', '电器维修', '虫害', '门窗 / 结构', '门锁 / 安全', '杂工 / 清洁'])
    only(c, '[data-testid="onboard-pricing"]')
    expect(c.textContent).toContain('接单邮箱')
    expect(c.textContent).toContain('上门费 $')
    expect(c.textContent).not.toContain('上门维修')
    const across = only(c, '[data-testid="onboard-other-form"]')
    expect(textOf(across)).toContain('你提供的是持牌专业服务或房源摄影？')
    expect(only<HTMLAnchorElement>(across, 'a').getAttribute('href')).toBe(PRO)
    expect(textOf(only(across, 'a'))).toBe('去「专业服务」入驻 →')
    expect(state.replaced).toEqual([])
  })
  it('a repair record: its trades, the credentials of the trades, the link to jobs', async () => {
    state.tables = { service_providers: [record({ legal_name: 'Maple Plumbing Inc.', trades: ['plumbing'] })], provider_credentials: [] }
    const { container: c } = await mount()
    expect(pressed(c)).toEqual(['水管'])
    only(c, '[data-testid="onboard-jobs-link"]')
    expect(textOf(only(c, '[data-testid="onboard-cred-title"]'))).toBe('资质')
    const selects = all<HTMLSelectElement>(c, 'select')
    expect(Array.from(selects[selects.length - 1].options).map((o) => o.value)).toEqual(['sto_coq', 'esa_contractor', 'tssa_gas', 'wsib_clearance', 'liability_insurance', 'business_registration', 'mecp_exterminator'])
    expect(state.replaced).toEqual([])
  })
  it('someone who belongs on the other page is sent there: a professional-only record, or the link the 专业服务 tab carried for a day', async () => {
    state.tables = { service_providers: [record()], provider_credentials: [] }
    let r = await mount()
    expect(state.replaced).toEqual([PRO])
    expect(all(r.container, '[data-testid="onboard-title"]').length).toBe(0) // nothing of the wrong form is shown meanwhile
    cleanup(); state.replaced = []; state.tables = {}
    r = await mount('/provider/onboard', '?type=professional')
    expect(state.replaced).toEqual([PRO])
    cleanup(); state.replaced = []
    // …signed out too, so the sign-in happens on the right page
    state.auth = { user: null, loading: false }
    r = await mount('/provider/onboard', '?type=professional')
    expect(state.replaced).toEqual([PRO])
  })
  it('…unless they came to add a trade: ?type=repair keeps a professional-only record here, with a note of what is on the other page', async () => {
    state.tables = { service_providers: [record()], provider_credentials: [] }
    const { container: c } = await mount('/provider/onboard', '?type=repair')
    expect(state.replaced).toEqual([])
    expect(textOf(only(c, '[data-testid="onboard-title"]'))).toBe('加入 Stayloop 物业管理服务网络')
    expect(pressed(c)).toEqual([])
    const note = only(c, '[data-testid="onboard-other-kind"]')
    expect(textOf(note)).toContain('你的资料里还有「专业服务」的项目：持牌 Paralegal（LTB 代理）')
    expect(only<HTMLAnchorElement>(note, 'a').getAttribute('href')).toBe(PRO)
  })
  it('a signed-out visitor is sent to sign in and comes back to this page', async () => {
    state.auth = { user: null, loading: false }
    const { container: c } = await mount()
    expect(only<HTMLAnchorElement>(c, 'a').getAttribute('href')).toBe(`/login?next=${encodeURIComponent('/provider/onboard')}`)
  })
})

describe('/provider/onboard/professional — 专业服务', () => {
  it('its own heading, four services, no rates, and words that fit', async () => {
    const { container: c } = await mount(PRO)
    expect(textOf(only(c, '[data-testid="onboard-eyebrow"]'))).toBe('服务商入驻 · 专业服务')
    expect(textOf(only(c, '[data-testid="onboard-title"]'))).toBe('加入 Stayloop 专业服务目录')
    expect(textOf(only(c, '[data-testid="onboard-intro"]'))).toContain('不派单、不收佣金')
    expect(chips(c)).toEqual(['房源摄影 / 户型图采集', '保险经纪（租客险 / 房东险）', '持牌 Paralegal（LTB 代理）', '律师'])
    expect(all(c, '[data-testid="onboard-pricing"]').length).toBe(0)
    expect(c.textContent).not.toMatch(/时薪 \$|上门费 \$|接单邮箱|精选维修网络|物业管理服务网络/)
    expect(c.textContent).toContain('联系邮箱')
    expect(c.textContent).toContain('对外显示的名称（事务所 / 工作室）')
    expect(c.textContent).toContain('先选类别。')
    expect(textOf(only(c, '[data-testid="onboard-attest"]'))).toContain('所列牌照')
    expect(textOf(only(c, '[data-testid="onboard-footer"]'))).toContain('不是律师事务所')
    expect(only<HTMLTextAreaElement>(c, '[data-testid="onboard-bio"]').placeholder).toContain('不要写收费承诺')
    const across = only(c, '[data-testid="onboard-other-form"]')
    expect(only<HTMLAnchorElement>(across, 'a').getAttribute('href')).toBe('/provider/onboard?type=repair')
    expect(textOf(only(across, 'a'))).toBe('去「物业管理服务」入驻 →')
    expect(state.replaced).toEqual([])
  })
  it('a paralegal’s record: licence kinds first, and no link to jobs it will never get', async () => {
    state.tables = { service_providers: [record()], provider_credentials: [{ id: 'c1', kind: 'lso_paralegal', number: 'P0001', holder_name: null, expires_at: '2027-12-31', verified_at: '2026-11-01T00:00:00Z' }] }
    const { container: c } = await mount(PRO)
    expect(pressed(c)).toEqual(['持牌 Paralegal（LTB 代理）'])
    expect(all(c, '[data-testid="onboard-jobs-link"]').length).toBe(0)
    only(c, '[data-testid="onboard-view-page"]')
    expect(textOf(only(c, '[data-testid="onboard-cred-title"]'))).toBe('牌照与资质')
    expect(all<HTMLOptionElement>(c, 'select option').map((o) => o.value)).toEqual(['lso_paralegal', 'lso_lawyer', 'ribo_licence', 'liability_insurance', 'business_registration'])
    expect(c.textContent).toContain('过期后目录里会显示「牌照待核或已过期」')
    expect(c.textContent).not.toContain('派单会跳过你')
  })
  it('a signed-out visitor comes back to this page after signing in', async () => {
    state.auth = { user: null, loading: false }
    const { container: c } = await mount(PRO)
    expect(only<HTMLAnchorElement>(c, 'a').getAttribute('href')).toBe(`/login?next=${encodeURIComponent(PRO)}`)
  })
  it('the 专业服务 tab links here; the page is the same component under its own address and title', () => {
    const tab = read('app/providers/professional/page.tsx')
    expect(tab).toContain("<a href={onboardHref('professional')} className=\"underline\">")
    expect(tab).toContain('data-testid="professional-join"')
    expect(read('app/provider/onboard/professional/page.tsx').trim().endsWith("export { default } from '../page'")).toBe(true)
    expect(read('app/provider/onboard/professional/layout.tsx')).toContain("title: '专业服务入驻 · Stayloop'")
    expect(read('app/provider/onboard/layout.tsx')).toContain("title: '物业管理服务入驻 · Stayloop'")
    expect(existsSync('app/provider/onboard/professional/page.tsx')).toBe(true)
  })
})

describe('a record of both kinds: each page edits its own half and drops neither', () => {
  const both = () => { state.tables = { service_providers: [record({ legal_name: 'Handy & Photo Ltd.', trades: ['handyman', 'photographer_floorplan'], hourly_rate: 80 })], provider_credentials: [] } }
  it('the 物业管理服务 page shows the repair trade and says the professional one is on the other page', async () => {
    both()
    const { container: c } = await mount()
    expect(state.replaced).toEqual([])
    expect(pressed(c)).toEqual(['杂工 / 清洁'])
    expect(textOf(only(c, '[data-testid="onboard-other-kind"]'))).toContain('你的资料里还有「专业服务」的项目：房源摄影 / 户型图采集')
    expect(textOf(only(c, '[data-testid="onboard-attest"]'))).toMatch(/接受工单[\s\S]*所列牌照/)
  })
  it('saving from the 专业服务 page keeps the repair trade and the rates it does not show', async () => {
    both()
    const { container: c } = await mount(PRO)
    expect(pressed(c)).toEqual(['房源摄影 / 户型图采集'])
    const note = only(c, '[data-testid="onboard-other-kind"]')
    expect(textOf(note)).toContain('你的资料里还有「物业管理服务」的项目：杂工 / 清洁')
    expect(only<HTMLAnchorElement>(note, 'a').getAttribute('href')).toBe('/provider/onboard?type=repair')
    const lawyer = all<HTMLButtonElement>(c, '[data-testid="onboard-trades"] button').find((b) => textOf(b) === '律师')!
    act(() => { lawyer.click() })
    const save = all<HTMLButtonElement>(c, 'button').find((b) => textOf(b).startsWith('更新'))!
    await act(async () => { fireEvent.click(save) })
    await flush()
    const w = state.writes.find((x) => x.table === 'service_providers' && x.op === 'update')!
    expect(w.row.trades).toEqual(['handyman', 'photographer_floorplan', 'lawyer'])
    expect(w.row.pricing_mode).toBe('hourly')
    expect(w.row.hourly_rate).toBe(80)
  })
})

describe('both pages: English, and what the source keeps', () => {
  it('English shows no Chinese on either page', async () => {
    state.lang = 'en'
    let r = await mount()
    expect(textOf(only(r.container, '[data-testid="onboard-title"]'))).toBe('Join the Stayloop property maintenance network')
    expect(r.container.textContent).not.toMatch(/[一-鿿]/)
    cleanup()
    r = await mount(PRO)
    expect(textOf(only(r.container, '[data-testid="onboard-title"]'))).toBe('Join the Stayloop professional services directory')
    expect(r.container.textContent).not.toMatch(/[一-鿿]/)
  })
  it('the kind comes from the address (so the server paints the same form) and is never written; the repair removal question is unchanged', () => {
    const page = read('app/provider/onboard/page.tsx')
    expect(page).toContain('const kind: OnboardKind = onboardKindOfPath(usePathname())')
    expect(page).not.toMatch(/setKind\(|chooseKind|role="radiogroup"/)
    const payload = page.slice(page.indexOf('const payload = {'), page.indexOf('const { error } = row && row !=='))
    expect(payload).not.toMatch(/kind|type:/)
    // the address bar is read only inside load(), after mount
    expect(page.slice(0, page.indexOf('const load = useCallback')).includes('window.location')).toBe(false)
    expect(page).toContain("'删除这条资质？已核验的记录也会一起删除；如果它是该工种唯一有效的一条，派单会立刻跳过你。续期请用「续期」。'")
    expect(page).toContain("kind === 'professional' ? PROFESSIONAL_REMOVE_CONFIRM[L] :")
    expect(page).not.toMatch(/window\.confirm\(|\balert\(/)
  })
})
