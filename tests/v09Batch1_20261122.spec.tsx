// @vitest-environment jsdom
// V0.9 第一批 (2026-11-22, after the optimization review of the same day — design/history/2026-11.md):
//  1. /admin shows four numbers counted over REAL accounts only (admin_north_star RPC);
//  2. "already renting" is a landlord's way in: lease here → record the rent → export the record,
//     pointed at from the homepage, the landlord page, the import wizard and the tenancy hub;
//  3. a screening an agent prepared says so at the top of the report, a confirmed delegation tells
//     the client what to do next, and the RPC counts the landlords agents brought in;
//  4. the homepage speaks to landlords first (HeroComposer default + panel order are guarded in
//     homeAsk20261001 / homeRoles20260927; the module list is checked here).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import React from 'react'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { all, textOf } from './helpers/dom'

const h = vi.hoisted(() => ({
  rpc: vi.fn(),
  session: { access_token: 'jwt-test' } as { access_token: string } | null,
  openHtml: vi.fn(),
}))
vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => React.createElement('a', { href, ...rest }, children) }))
vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: (...a: unknown[]) => h.rpc(...a),
    auth: { getSession: async () => ({ data: { session: h.session } }) },
  },
}))
vi.mock('@/lib/export/openHtml', () => ({ openHtmlFromPost: (...a: unknown[]) => h.openHtml(...a) }))

import { normalizeNorthStar, northStarTiles, screeningBreakdown, screeningsInternal } from '../lib/admin/northStar'
import NorthStarPanel from '../components/admin/NorthStarPanel'
import { attributionLead, attributionLine, isAgentAttribution, type AgentAttribution as Attribution } from '../lib/agent/attribution'
import AgentAttribution from '../components/screening/AgentAttribution'
import { alreadyRentingSteps, matterForHousehold } from '../lib/household/alreadyRenting'
import AlreadyRenting from '../components/household/AlreadyRenting'

const read = (p: string) => readFileSync(p, 'utf8')
const byId = (root: ParentNode, id: string) => all(root, `[data-testid="${id}"]`)
const flush = async () => { await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve() }) }

beforeEach(() => { h.rpc.mockReset(); h.openHtml.mockReset(); h.session = { access_token: 'jwt-test' } })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

// ───────────────────────────────────────────────────────────── 1. the four numbers

const RAW = {
  real_accounts: 10, real_accounts_30d: 0, screenings_real: 5, screenings_real_30d: 0, screeners_real: 2, screenings_anon: 46, screenings_total: 243,
  households_active_real: 0, households_active_total: 4, rent_recorded_real: 0, rent_confirmed_real: 0, landlords_via_agent: 0,
  signups_by_week: [{ week: '2026-11-09', n: 0 }, { week: '2026-11-16', n: 3 }, { week: 'not-a-date', n: 9 }],
}

describe('the four numbers over real accounts', () => {
  it('a refusal or a foreign payload is not a set of numbers', () => {
    expect(normalizeNorthStar({ error: 'forbidden' })).toBeNull()
    expect(normalizeNorthStar(null)).toBeNull()
    expect(normalizeNorthStar([])).toBeNull()
    expect(normalizeNorthStar({ real_users: 24 })).toBeNull() // the older strip's payload
  })

  it('the payload becomes four tiles and one line that says where the site-wide count comes from', () => {
    const s = normalizeNorthStar(RAW)!
    expect(s.screeningsReal).toBe(5)
    expect(s.signupsByWeek).toEqual([{ week: '2026-11-09', n: 0 }, { week: '2026-11-16', n: 3 }]) // a row that is not a week is dropped
    expect(screeningsInternal(s)).toBe(243 - 5 - 46)
    const tiles = northStarTiles(s, true)
    expect(tiles.map((t) => t.key)).toEqual(['screenings', 'tenancies', 'rent', 'viaAgent'])
    expect(tiles.map((t) => t.value)).toEqual([5, 0, 0, 0])
    expect(tiles[0].sub).toBe('近 30 天 0 份 · 2 个账号')
    expect(tiles[1].sub).toContain('全站 4 户')
    expect(screeningBreakdown(s, true)).toBe('全站 243 份筛查：真实账号 5 份，匿名试用 46 份，管理员、测试号与无主记录 192 份。')
    expect(screeningBreakdown(s, false)).toContain('5 by real accounts')
    // junk never becomes a negative or a fraction
    expect(normalizeNorthStar({ ...RAW, screenings_real: -3, rent_recorded_real: '2.9' })).toMatchObject({ screeningsReal: 0, rentRecordedReal: 2 })
  })

  it('the panel asks the RPC once it is enabled, and says so when the RPC refuses', async () => {
    h.rpc.mockResolvedValue({ data: RAW, error: null })
    const off = render(React.createElement(NorthStarPanel, { zh: true, enabled: false }))
    await flush()
    expect(h.rpc).not.toHaveBeenCalled()
    off.unmount()
    const on = render(React.createElement(NorthStarPanel, { zh: true, enabled: true }))
    await flush()
    expect(h.rpc).toHaveBeenCalledWith('admin_north_star')
    expect(textOf(byId(on.container, 'north-star-screenings')[0])).toContain('5')
    expect(textOf(byId(on.container, 'north-star-breakdown')[0])).toContain('全站 243 份筛查')
    expect(textOf(byId(on.container, 'north-star-accounts')[0])).toContain('真实账号共 10 个')
    expect(byId(on.container, 'north-star-weeks')[0].children.length).toBe(2)
    on.unmount()
    h.rpc.mockResolvedValue({ data: { error: 'forbidden' }, error: null })
    const refused = render(React.createElement(NorthStarPanel, { zh: true, enabled: true }))
    await flush()
    expect(byId(refused.container, 'north-star-error').length).toBe(1)
  })

  it('the migration: admin-gated, real = not anonymous / flagged / our domains / an admin, both functions locked down', () => {
    const sql = read('supabase/migrations/20261122_admin_north_star.sql')
    expect(sql).toContain("when not coalesce(public.is_stayloop_admin(), false) then jsonb_build_object('error', 'forbidden')")
    for (const rule of ['not coalesce(u.is_anonymous, false)', "raw_user_meta_data->>'test_account'", "raw_user_meta_data->>'muse_account'", "raw_user_meta_data->>'reviewer_account'", "not like '%@stayloop.ai'", "not like '%@stayloop-test.local'", 'from public.admin_users a where a.user_id = u.id']) expect(sql, rule).toContain(rule)
    expect(sql).toContain('revoke execute on function public.is_real_account(uuid) from public, anon, authenticated;')
    expect(sql).not.toMatch(/grant execute on function public\.is_real_account\(uuid\) to [^;]*authenticated/)
    expect(sql).toContain('revoke execute on function public.admin_north_star() from public, anon, authenticated;')
    expect(sql).toContain('grant execute on function public.admin_north_star() to authenticated, service_role;')
    // a landlord an agent brought in: a confirmed delegation, both ends real
    expect(sql).toContain('d.confirmed_at is not null')
    expect(sql).toContain('public.is_real_account(d.delegate_auth_id)')
  })

  it('/admin mounts the panel and no longer calls every account a real user', () => {
    const page = read('app/admin/page.tsx')
    expect(page).toContain('<NorthStarPanel zh={zh} enabled={!!role} />')
    expect(page).not.toContain("'真实注册'")
    expect(page).toContain("'注册账号（含测试号）'")
  })
})

// ───────────────────────────────────────────────────────────── 3. who prepared a screening

const AGENT: Attribution = { name: 'Mia Chen', category: 'salesperson', brokerage_name: 'Avion Realty Inc., Brokerage', reco_number: '1234567', slug: 'mia-chen', via: 'delegation' }

describe('a screening an agent prepared says so', () => {
  it('the line is the registered name, descriptor, brokerage and number — never without the brokerage', () => {
    const zh = attributionLine(AGENT, true)
    expect(zh.startsWith('Mia Chen，')).toBe(true)
    expect(zh).toContain(' · Avion Realty Inc., Brokerage · RECO 注册号 1234567')
    expect(attributionLine(AGENT, false)).toContain('RECO registration 1234567')
    expect(attributionLead(AGENT, true)).toBe('本报告由经纪受房东客户委托准备')
    expect(attributionLead({ ...AGENT, via: 'own' }, true)).toBe('本报告由经纪准备')
    expect(isAgentAttribution(AGENT)).toBe(true)
    expect(isAgentAttribution({ ...AGENT, name: ' ' })).toBe(false)
    expect(isAgentAttribution({ ...AGENT, via: 'other' })).toBe(false)
    expect(isAgentAttribution(null)).toBe(false)
  })

  it('the component shows the line when the server names an agent, and nothing otherwise', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: { headers: Record<string, string> }) => ({ ok: true, json: async () => ({ attribution: AGENT }) }))
    vi.stubGlobal('fetch', fetchMock)
    const a = render(React.createElement(AgentAttribution, { screeningId: '11111111-1111-4111-8111-111111111111', zh: true }))
    await flush()
    expect(String(fetchMock.mock.calls[0][0])).toBe('/api/agents/attribution?screening=11111111-1111-4111-8111-111111111111')
    expect(fetchMock.mock.calls[0][1]?.headers.Authorization).toBe('Bearer jwt-test')
    const box = byId(a.container, 'screening-agent-attribution')
    expect(box.length).toBe(1)
    expect(box[0].getAttribute('data-via')).toBe('delegation')
    expect(textOf(box[0])).toContain('Mia Chen')
    expect(all(box[0], 'a').map((x) => x.getAttribute('href'))).toEqual(['/agents/mia-chen', 'https://registrantsearch.reco.on.ca/'])
    a.unmount()
    // a landlord's own screening: the server answers null, and the page gains nothing
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ attribution: null }) })))
    const none = render(React.createElement(AgentAttribution, { screeningId: '11111111-1111-4111-8111-111111111111', zh: true }))
    await flush()
    expect(none.container.innerHTML).toBe('')
    none.unmount()
    // signed out: no request at all
    h.session = null
    const f2 = vi.fn()
    vi.stubGlobal('fetch', f2)
    render(React.createElement(AgentAttribution, { screeningId: '11111111-1111-4111-8111-111111111111', zh: true }))
    await flush()
    expect(f2).not.toHaveBeenCalled()
  })

  it('the route reads the screening as the caller, names an agent only on a delegation or an agent-only owner, and only while registered', () => {
    const route = read('app/api/agents/attribution/route.ts')
    // the screening through the caller's JWT (RLS decides who may know), the registration with the service role
    expect(route).toMatch(/const \{ data: row \} = await sb\.from\('screenings'\)\.select\('id, landlord_id, delegation_id'\)/)
    expect(route).toContain("if (!ud?.user || ud.user.is_anonymous) return NextResponse.json({ error: 'sign_in_required' }, { status: 401 })")
    expect(route).toContain('if (!holdsLandlordHat) agentId = scr.landlord_id')
    expect(route).toContain('!isRegistrationCurrent(prof)) return none()')
    // ids go into .eq(), never into an .or() filter string; nothing but the directory's fields is selected
    expect(route).not.toContain('.or(')
    expect(route).toContain(".select('legal_name, reco_number, category, brokerage_name, status, expires_at, public_profile, profile_slug')")
    for (const priv of ['business_email', 'business_phone', 'review_note']) expect(route, priv).not.toContain(priv)
  })

  it('the report page takes one import and one line; a confirmed delegation says what comes next', () => {
    const report = read('app/screening/[id]/report/page.tsx')
    expect(report.match(/import AgentAttribution from '@\/components\/screening\/AgentAttribution'/g)?.length).toBe(1)
    expect(report.match(/<AgentAttribution /g)?.length).toBe(1)
    expect(report).toContain('<AgentAttribution screeningId={id} zh={zh} />')
    const delegate = read('app/delegate/[token]/page.tsx')
    expect(delegate).toContain('data-testid="delegation-next"')
    expect(delegate).toContain('href="/leases/import"')
    expect(delegate).toContain('href="/landlord/become"')
  })
})

// ───────────────────────────────────────────────────────────── 2. already renting

describe('already renting: lease here → record the rent → export the record', () => {
  it('the steps say what is done and what is next', () => {
    const fresh = alreadyRentingSteps({ imported: true, recorded: 0, canReconcile: true }, true)
    expect(fresh.map((s) => [s.key, s.done])).toEqual([['lease', true], ['reconcile', false], ['export', false]])
    expect(fresh[0].body).toContain('已签的租约已导入')
    expect(fresh[1].body).toContain('文件只在浏览器里读，不上传')
    // the export is the record kept here, not a tribunal form
    expect(fresh[2].body).toContain('不是 LTB 表格，也不替你提交')
    const kept = alreadyRentingSteps({ imported: false, recorded: 3, canReconcile: true }, true)
    expect(kept[0].body).toContain('在 Stayloop 上签的')
    expect(kept[1].done).toBe(true)
    expect(kept[1].body).toContain('已记 3 期')
    expect(alreadyRentingSteps({ imported: true, recorded: 0, canReconcile: false }, true)[1].body).toContain('先在租约信息里补上月租金')
    expect(alreadyRentingSteps({ imported: true, recorded: 1, canReconcile: true }, false)[1].body).toContain('1 period recorded')
  })

  it('finds the tenancy’s matter among my_matters() rows', () => {
    const rows = [{ id: 'm1', household: null }, { id: 'm2', household: { id: 'h2' } }, null, { household: { id: 'h3' } }]
    expect(matterForHousehold(rows, 'h2')).toBe('m2')
    expect(matterForHousehold(rows, 'h3')).toBeNull() // a row without an id is not a matter
    expect(matterForHousehold(rows, 'nope')).toBeNull()
    expect(matterForHousehold({ error: 'x' }, 'h2')).toBeNull()
  })

  it('the box: reconcile opens the rent tab; export asks for the arrears order of this tenancy’s matter', async () => {
    const onGoRent = vi.fn()
    h.rpc.mockResolvedValue({ data: [{ id: 'matter-9', household: { id: 'hh-1' } }], error: null })
    h.openHtml.mockResolvedValue({ ok: true })
    const r = render(React.createElement(AlreadyRenting, { householdId: 'hh-1', zh: true, imported: true, recorded: 0, canReconcile: true, onGoRent }))
    expect(byId(r.container, 'already-renting').length).toBe(1)
    expect(byId(r.container, 'renting-step-reconcile')[0].getAttribute('data-done')).toBe('0')
    fireEvent.click(byId(r.container, 'renting-go-rent')[0])
    expect(onGoRent).toHaveBeenCalledTimes(1)
    await act(async () => { fireEvent.click(byId(r.container, 'renting-export')[0]) })
    await flush()
    expect(h.rpc).toHaveBeenCalledWith('my_matters')
    expect(h.openHtml).toHaveBeenCalledWith('/api/matters/export', { matter_id: 'matter-9', lang: 'zh', acting_role: 'landlord', kind: 'arrears' })
    expect(byId(r.container, 'renting-export-error').length).toBe(0)
  })

  it('no matter for the tenancy → an error line, and no export is attempted; no rent to build periods from → no reconcile link', async () => {
    h.rpc.mockResolvedValue({ data: [], error: null })
    const r = render(React.createElement(AlreadyRenting, { householdId: 'hh-1', zh: true, imported: true, recorded: 0, canReconcile: false, onGoRent: vi.fn() }))
    expect(byId(r.container, 'renting-go-rent').length).toBe(0)
    await act(async () => { fireEvent.click(byId(r.container, 'renting-export')[0]) })
    await flush()
    expect(h.openHtml).not.toHaveBeenCalled()
    expect(byId(r.container, 'renting-export-error').length).toBe(1)
  })

  it('the hub shows it to the landlord side of an active tenancy and anchors the reconcile box', () => {
    const hub = read('app/h/[id]/page.tsx')
    expect(hub).toContain("{(myRole === 'landlord' || myRole === 'property_manager') && household.status === 'active' && (")
    expect(hub).toContain("imported={household.source === 'imported'}")
    expect(hub).toContain('recorded={ledger.recordedRows.length}')
    expect(hub).toContain("setTab('rent')")
    expect(hub).toContain('<div id="hub-csv-reconcile" className="scroll-mt-24">')
    // above the tabs, so it is there whichever tab is open
    expect(hub.indexOf('<AlreadyRenting')).toBeLessThan(hub.indexOf('{TABS.map((t) => ('))
  })

  it('the ways in: the import wizard, the landlord page and the homepage’s landlord panel', () => {
    expect(read('app/leases/import/page.tsx')).toContain('data-testid="import-next-landlord"')
    const landing = read('app/landlord/page.tsx')
    expect(landing).toContain("lead: { zh: '房子已经租出去了？'")
    expect(landing).toContain("href: '/leases/import'")
    expect(landing).toContain('不经手租金，也不替你填写或提交 LTB 表格')
    expect(read('components/RoleLanding.tsx')).toContain('data-testid="role-alt-cta"')
    const home = read('components/home/HomeNext.tsx')
    const at = home.indexOf("{ h: { zh: '已经在租 · 导入租约'")
    expect(at).toBeGreaterThan(-1)
    // first of the landlord's three, ahead of screening
    expect(at).toBeLessThan(home.indexOf("{ h: { zh: '租客筛查', en: 'Tenant screening' }, s: { zh: '材料取证"))
  })
})
