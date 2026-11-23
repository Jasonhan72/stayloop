// @vitest-environment jsdom
// V0.9 (2026-11-23, user, looking at /provider/onboard: 「这个页面是否也要区分维修和专业服务？」).
// It should: the directory has two tabs, but the form greeted a lawyer with 「加入 Stayloop 精选维修网络」,
// twelve trades in one list, an hourly rate and a call-out fee. The form now asks first which kind
// of provider is joining; the kind picks the heading, the trades, whether rates are asked for, the
// credential kinds and the wording. It is a view of the form, not a stored column: a record that
// lists trades of both kinds keeps all of them whichever form is showing.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import React from 'react'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { all, only, textOf } from './helpers/dom'

const read = (p: string) => readFileSync(p, 'utf8')

const state = vi.hoisted(() => ({
  lang: 'zh' as 'zh' | 'en',
  auth: { user: { id: 'u1', email: 'someone@example.org' } as null | { id: string; email: string }, loading: false },
  tables: {} as Record<string, unknown[]>,
  writes: [] as { table: string; op: string; row: Record<string, unknown> }[],
}))

vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => React.createElement('a', { href, ...rest }, children) }))
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
import { ONBOARD_COPY, PROFESSIONAL_REMOVE_CONFIRM, attestText, credentialKindsFor, isOnboardKind, onboardHref, onboardKindOf, selectedOfKind, selectedOfOtherKind, tradesOfKind } from '../lib/marketplace/onboardKind'

afterEach(() => {
  cleanup()
  state.lang = 'zh'
  state.auth = { user: { id: 'u1', email: 'someone@example.org' }, loading: false }
  state.tables = {}
  state.writes = []
  window.history.replaceState({}, '', '/')
})

const flush = async () => { await act(async () => { for (let i = 0; i < 8; i++) await Promise.resolve() }) }
const mount = async () => { const r = render(<ProviderOnboardPage />); await flush(); return r }
const record = (o: Record<string, unknown> = {}) => ({
  id: '55555555-5555-4555-8555-555555555555', legal_name: 'Avery Legal Services', trade_name: null, business_number: null, service_cities: ['Toronto'], trades: ['paralegal'],
  pricing_mode: 'hourly', call_out_fee: null, hourly_rate: null, contact_name: null, contact_email: 'a@example.org', contact_phone: null, website: null, status: 'verified', review_note: null,
  verified_at: '2026-11-01T00:00:00Z', attested_at: '2026-11-01T00:00:00Z', bio: null, languages: [], photo_key: null, ...o,
})
const chips = (c: ParentNode) => all(c, '[data-testid="onboard-trades"] button').map(textOf)
const pressed = (c: ParentNode) => all(c, '[data-testid="onboard-trades"] button[aria-pressed="true"]').map(textOf)
const kindOn = (c: ParentNode) => only(c, '[data-testid="onboard-kind"] [aria-checked="true"]').getAttribute('data-testid')

// ───────────────────────────────────────────────────────────── the rule

describe('which kind of provider is joining (lib/marketplace/onboardKind.ts)', () => {
  it('eight repair trades and four professional ones, in the catalogue’s order', () => {
    expect(tradesOfKind('repair')).toEqual(['plumbing', 'electrical', 'heating_cooling', 'appliance', 'pest', 'structural', 'locks_safety', 'handyman'])
    expect(tradesOfKind('professional')).toEqual(['photographer_floorplan', 'insurance_broker', 'paralegal', 'lawyer'])
  })
  it('the form opens where the record is: an explicit ?type= first, then the trades, then repairs', () => {
    expect(onboardKindOf(null)).toBe('repair')
    expect(onboardKindOf([])).toBe('repair')
    expect(onboardKindOf(['paralegal'])).toBe('professional')
    expect(onboardKindOf(['lawyer', 'insurance_broker'])).toBe('professional')
    expect(onboardKindOf(['handyman'])).toBe('repair')
    expect(onboardKindOf(['handyman', 'photographer_floorplan'])).toBe('repair') // a record of both kinds opens on the one that is dispatched
    expect(onboardKindOf([], 'professional')).toBe('professional')
    expect(onboardKindOf(['handyman'], 'professional')).toBe('professional')
    expect(onboardKindOf(['paralegal'], 'repair')).toBe('repair')
    for (const junk of ['', 'pro', 'PROFESSIONAL', 'admin', '<script>']) expect(onboardKindOf(['paralegal'], junk), junk).toBe('professional')
    expect(isOnboardKind('professional')).toBe(true)
    expect(isOnboardKind('agent')).toBe(false)
    expect(onboardHref('professional')).toBe('/provider/onboard?type=professional')
    expect(onboardHref('repair')).toBe('/provider/onboard')
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
    // nothing picked yet: the form's own kind
    expect(attestText([], 'professional', true)).toContain('所列牌照')
    expect(attestText([], 'repair', true)).toContain('接受工单')
    for (const t of [repair, pro, both]) { expect(t.startsWith('我确认以上信息属实；')).toBe(true); expect(t.endsWith('资质变更或到期后 7 天内更新。')).toBe(true) }
    expect(attestText(['plumbing', 'lawyer'], 'repair', false)).not.toMatch(/[一-鿿]/)
  })
  it('the professional wording never promises dispatch and names what Stayloop is not; English carries no Chinese', () => {
    const p = ONBOARD_COPY.professional
    expect(p.title.zh).toBe('加入 Stayloop 专业服务目录')
    expect(ONBOARD_COPY.repair.title.zh).toBe('加入 Stayloop 精选维修网络')
    const zh = Object.values(p).map((v) => v.zh).join(' ')
    expect(zh).not.toMatch(/维修|工单|上门|承包商/)
    expect(zh.replace(/不派单/g, '')).not.toContain('派单')
    expect(p.intro.zh).toContain('不派单、不收佣金')
    expect(p.footer.zh).toContain('不给法律意见、不卖保险')
    expect(PROFESSIONAL_REMOVE_CONFIRM.zh).not.toContain('派单')
    for (const k of ['repair', 'professional'] as const) for (const v of Object.values(ONBOARD_COPY[k])) expect(v.en, v.en).not.toMatch(/[一-鿿]/)
    expect(PROFESSIONAL_REMOVE_CONFIRM.en).not.toMatch(/[一-鿿]/)
  })
})

// ───────────────────────────────────────────────────────────── the form

describe('/provider/onboard asks which kind first', () => {
  it('a newcomer starts on 上门维修: the eight repair trades and the rates', async () => {
    const { container: c } = await mount()
    expect(kindOn(c)).toBe('onboard-kind-repair')
    expect(all(c, '[data-testid="onboard-kind"] [role="radio"]').length).toBe(2)
    expect(textOf(only(c, '[data-testid="onboard-title"]'))).toBe('加入 Stayloop 精选维修网络')
    expect(chips(c)).toEqual(['水管', '电气', '供暖 / 空调', '电器维修', '虫害', '门窗 / 结构', '门锁 / 安全', '杂工 / 清洁'])
    only(c, '[data-testid="onboard-pricing"]')
    expect(c.textContent).toContain('接单邮箱')
    expect(c.textContent).toContain('上门费 $')
    expect(textOf(only(c, '[data-testid="onboard-attest"]'))).toContain('接受工单')
  })

  it('choosing 专业服务: its own heading, four services, no rates, and words that fit', async () => {
    const { container: c } = await mount()
    act(() => { only<HTMLButtonElement>(c, '[data-testid="onboard-kind-professional"]').click() })
    expect(kindOn(c)).toBe('onboard-kind-professional')
    expect(textOf(only(c, '[data-testid="onboard-title"]'))).toBe('加入 Stayloop 专业服务目录')
    expect(textOf(only(c, '[data-testid="onboard-intro"]'))).toContain('不派单、不收佣金')
    expect(chips(c)).toEqual(['房源摄影 / 户型图采集', '保险经纪（租客险 / 房东险）', '持牌 Paralegal（LTB 代理）', '律师'])
    expect(all(c, '[data-testid="onboard-pricing"]').length).toBe(0)
    expect(c.textContent).not.toMatch(/时薪 \$|上门费 \$|接单邮箱|精选维修网络/)
    expect(c.textContent).toContain('联系邮箱')
    expect(c.textContent).toContain('对外显示的名称（事务所 / 工作室）')
    expect(c.textContent).toContain('先选类别。')
    expect(textOf(only(c, '[data-testid="onboard-attest"]'))).toContain('所列牌照')
    expect(textOf(only(c, '[data-testid="onboard-footer"]'))).toContain('不是律师事务所')
    expect(only<HTMLTextAreaElement>(c, '[data-testid="onboard-bio"]').placeholder).toContain('不要写收费承诺')
  })

  it('the 专业服务 tab’s link opens the professional form directly', async () => {
    window.history.replaceState({}, '', '/provider/onboard?type=professional')
    const { container: c } = await mount()
    expect(kindOn(c)).toBe('onboard-kind-professional')
    expect(chips(c).length).toBe(4)
    const page = read('app/providers/professional/page.tsx')
    expect(page).toContain("<a href={onboardHref('professional')} className=\"underline\">")
    expect(page).toContain('data-testid="professional-join"')
  })

  it('a signed-out visitor is sent to sign in and comes back to the same form', async () => {
    window.history.replaceState({}, '', '/provider/onboard?type=professional')
    state.auth = { user: null, loading: false }
    const { container: c } = await mount()
    expect(only<HTMLAnchorElement>(c, 'a').getAttribute('href')).toBe(`/login?next=${encodeURIComponent('/provider/onboard?type=professional')}`)
  })

  it('a paralegal’s record opens on the professional form: licence kinds first, and no link to jobs it will never get', async () => {
    state.tables = { service_providers: [record()], provider_credentials: [{ id: 'c1', kind: 'lso_paralegal', number: 'P0001', holder_name: null, expires_at: '2027-12-31', verified_at: '2026-11-01T00:00:00Z' }] }
    const { container: c } = await mount()
    expect(kindOn(c)).toBe('onboard-kind-professional')
    expect(pressed(c)).toEqual(['持牌 Paralegal（LTB 代理）'])
    expect(all(c, '[data-testid="onboard-jobs-link"]').length).toBe(0)
    only(c, '[data-testid="onboard-view-page"]')
    expect(textOf(only(c, '[data-testid="onboard-cred-title"]'))).toBe('牌照与资质')
    const kinds = all<HTMLOptionElement>(c, 'select option').map((o) => o.value)
    expect(kinds).toEqual(['lso_paralegal', 'lso_lawyer', 'ribo_licence', 'liability_insurance', 'business_registration'])
    expect(c.textContent).toContain('过期后目录里会显示「牌照待核或已过期」')
    expect(c.textContent).not.toContain('派单会跳过你')
  })

  it('a repair record keeps its link to jobs and the trade credentials', async () => {
    state.tables = { service_providers: [record({ legal_name: 'Maple Plumbing Inc.', trades: ['plumbing'] })], provider_credentials: [] }
    const { container: c } = await mount()
    expect(kindOn(c)).toBe('onboard-kind-repair')
    only(c, '[data-testid="onboard-jobs-link"]')
    expect(textOf(only(c, '[data-testid="onboard-cred-title"]'))).toBe('资质')
    // the first select on the form is the pricing mode; the credential kinds are the last one
    const selects = all<HTMLSelectElement>(c, 'select')
    expect(Array.from(selects[selects.length - 1].options).map((o) => o.value)).toEqual(['sto_coq', 'esa_contractor', 'tssa_gas', 'wsib_clearance', 'liability_insurance', 'business_registration', 'mecp_exterminator'])
  })

  it('a record of both kinds: each form shows its own trades, says the other is there, and saving drops neither', async () => {
    state.tables = { service_providers: [record({ legal_name: 'Handy & Photo Ltd.', trades: ['handyman', 'photographer_floorplan'] })], provider_credentials: [] }
    const { container: c } = await mount()
    expect(kindOn(c)).toBe('onboard-kind-repair')
    expect(pressed(c)).toEqual(['杂工 / 清洁'])
    const note = only(c, '[data-testid="onboard-other-kind"]')
    expect(textOf(note)).toContain('你的资料里还有「专业服务」的项目：房源摄影 / 户型图采集')
    act(() => { only<HTMLButtonElement>(note, 'button').click() })
    expect(kindOn(c)).toBe('onboard-kind-professional')
    expect(pressed(c)).toEqual(['房源摄影 / 户型图采集'])
    expect(textOf(only(c, '[data-testid="onboard-other-kind"]'))).toContain('你的资料里还有「上门维修」的项目：杂工 / 清洁')
    // both sentences of the attestation, since both kinds are on the record
    expect(textOf(only(c, '[data-testid="onboard-attest"]'))).toMatch(/接受工单[\s\S]*所列牌照/)
    // add a service on this form and save: the repair trade is still in what is written
    const lawyer = all<HTMLButtonElement>(c, '[data-testid="onboard-trades"] button').find((b) => textOf(b) === '律师')!
    act(() => { lawyer.click() })
    const save = all<HTMLButtonElement>(c, 'button').find((b) => textOf(b).startsWith('更新'))!
    await act(async () => { fireEvent.click(save) })
    await flush()
    const w = state.writes.find((x) => x.table === 'service_providers' && x.op === 'update')!
    expect(w.row.trades).toEqual(['handyman', 'photographer_floorplan', 'lawyer'])
    // the rates on the record are carried, not blanked, by a save from the form that hides them
    expect(w.row.pricing_mode).toBe('hourly')
  })

  it('English: no Chinese on either form', async () => {
    state.lang = 'en'
    const { container: c } = await mount()
    expect(c.textContent).not.toMatch(/[一-鿿]/)
    act(() => { only<HTMLButtonElement>(c, '[data-testid="onboard-kind-professional"]').click() })
    expect(textOf(only(c, '[data-testid="onboard-title"]'))).toBe('Join the Stayloop professional services directory')
    expect(c.textContent).not.toMatch(/[一-鿿]/)
  })

  it('source: the kind is never written, first paint does not read the address, and the repair removal question is unchanged', () => {
    const page = read('app/provider/onboard/page.tsx')
    const payload = page.slice(page.indexOf('const payload = {'), page.indexOf('const { error } = row && row !=='))
    expect(payload).not.toMatch(/kind|type:/)
    // the kind starts as a constant and is set from the address only after the record is read (no hydration mismatch)
    expect(page).toContain("const [kind, setKind] = useState<OnboardKind>('repair')")
    expect(page.match(/window\.location\.search/g)?.length).toBe(2)
    expect(page.slice(0, page.indexOf('const load = useCallback')).includes('window.location')).toBe(false)
    expect(page).toContain("'删除这条资质？已核验的记录也会一起删除；如果它是该工种唯一有效的一条，派单会立刻跳过你。续期请用「续期」。'")
    expect(page).toContain('kind === \'professional\' ? PROFESSIONAL_REMOVE_CONFIRM[L] :')
    expect(page).not.toMatch(/window\.confirm\(|\balert\(/)
  })
})
