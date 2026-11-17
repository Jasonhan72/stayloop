// @vitest-environment jsdom
// 2026-11-16 · 「找经纪和服务商」 — one section, three tabs (design/find-directory-2026-11-16.md).
// 经纪 /agents (public) · 维修服务 /providers (new, signed in) · 专业服务 /providers/professional.
// Every hat reaches it from the workspace rail (找人, under 消息), the avatar menu and the footer;
// the header row is unchanged. No new anonymous data: the repair directory asks for nothing until
// someone is signed in. Tenants can view and contact, never dispatch. Fixed order, no ranking.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import React from 'react'
import { act, cleanup, render } from '@testing-library/react'
import { all, only, textOf } from './helpers/dom'

const read = (p: string) => readFileSync(p, 'utf8')

const state = vi.hoisted(() => ({
  lang: 'zh' as 'zh' | 'en',
  auth: { user: null as null | { id: string }, loading: false, role: null as string | null },
  hats: { loading: false, tenant: true, landlord: false, agent: null as string | null, provider: null as string | null, admin: false },
  onProvider: false,
  tables: {} as Record<string, unknown[]>,
  asked: [] as string[],
}))

vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => React.createElement('a', { href, ...rest }, children) }))
vi.mock('@/lib/i18n', () => ({ useT: () => ({ lang: state.lang, t: (_k: string, f: string) => f }), useI18n: () => ({ lang: state.lang, t: (_k: string, f: string) => f }) }))
vi.mock('@/lib/useAuth', () => ({ useAuth: () => state.auth }))
vi.mock('@/lib/useHats', () => ({
  useHats: () => state.hats,
  activeHat: (h: { landlord: boolean; agent: string | null }, remembered: string | null) =>
    remembered === 'landlord' && h.landlord ? 'landlord' : remembered === 'agent' && h.agent ? 'agent' : 'tenant',
}))
vi.mock('@/lib/useHomeHref', () => ({ useHomeHref: () => ({ href: '/', onProvider: state.onProvider, signedIn: !!state.auth.user }) }))
vi.mock('@/lib/marketplace/config', () => ({ useMarketplaceConfig: () => ({ graceDays: 0, quoteHoursDefault: 24 }) }))
vi.mock('@/components/Header', () => ({ default: () => React.createElement('header') }))
vi.mock('@/components/Footer', () => ({ default: () => React.createElement('footer') }))
vi.mock('@/lib/supabase', () => {
  const from = (table: string) => {
    state.asked.push(table)
    const q: Record<string, unknown> = {}
    for (const m of ['select', 'limit', 'in', 'overlaps', 'eq', 'order']) q[m] = () => q
    q.then = (ok: (v: { data: unknown[]; error: null }) => unknown) => Promise.resolve({ data: state.tables[table] ?? [], error: null }).then(ok)
    return q
  }
  return { supabase: { from } }
})

import FindHeader, { FIND_HREF, FIND_TABS } from '../components/directory/FindHeader'
import RepairDirectoryPage from '../app/providers/page'
import { repairDirectory, type DirectoryCredential, type DirectoryProvider } from '../lib/marketplace/directory'
import { isRegistrationCurrent, toBasicAgent, type AgentProfileRow } from '../lib/agentPublic'
import { FIND_ITEM, RAIL_BY_ROLE } from '../components/workspace/rail'
import { isTestName } from '../components/listing/testAccounts'
import { buildSystemPrompt, directoryGuide } from '../lib/agent/prompts'
import { splitPaths } from '../lib/agent/replyPaths'

afterEach(() => {
  cleanup()
  state.lang = 'zh'
  state.auth = { user: null, loading: false, role: null }
  state.hats = { loading: false, tenant: true, landlord: false, agent: null, provider: null, admin: false }
  state.onProvider = false
  state.tables = {}
  state.asked = []
})

const TODAY = new Date('2026-11-16T12:00:00Z')
const prov = (o: Partial<DirectoryProvider> & { id: string }): DirectoryProvider => ({
  legal_name: o.id, trade_name: null, trades: ['handyman'], service_cities: ['Toronto'], pricing_mode: 'hourly', call_out_fee: null, hourly_rate: null,
  contact_email: null, contact_phone: null, website: null, verified_at: '2026-10-01T00:00:00Z', ...o,
})
const cred = (provider_id: string, kind: string, expires_at: string | null = '2027-06-30'): DirectoryCredential => ({ provider_id, kind, expires_at, verified_at: '2026-10-01T00:00:00Z' })
const HANDYMAN_OK = (id: string) => [cred(id, 'business_registration'), cred(id, 'liability_insurance')]

describe('one section, three tabs, three real addresses', () => {
  it('the tabs are 经纪 · 维修服务 · 专业服务 and the section lands on /agents', () => {
    expect(FIND_TABS.map((t) => [t.key, t.href, t.zh])).toEqual([
      ['agents', '/agents', '经纪'],
      ['repairs', '/providers', '维修服务'],
      ['professional', '/providers/professional', '专业服务'],
    ])
    expect(FIND_HREF).toBe('/agents')
    for (const t of FIND_TABS) expect(existsSync(`app${t.href}/page.tsx`), t.href).toBe(true)
  })
  it('each page mounts the shared header with its own tab on; the section has one h1', () => {
    expect(read('app/agents/page.tsx')).toContain('<FindHeader active="agents">')
    expect(read('app/providers/page.tsx')).toContain('<FindHeader active="repairs">')
    expect(read('app/providers/professional/page.tsx')).toContain('<FindHeader active="professional">')
    for (const p of ['app/agents/page.tsx', 'app/providers/page.tsx', 'app/providers/professional/page.tsx']) expect(read(p), p).not.toContain('<h1')
  })
  it('renders the title, the no-commission note and the tab bar; only the active tab is current', () => {
    const { container } = render(<FindHeader active="repairs"><p data-testid="kid">x</p></FindHeader>)
    expect(textOf(only(container, 'h1'))).toBe('找经纪和服务商')
    expect(textOf(only(container, '[data-testid="find-note"]'))).toContain('只做展示与转介，不抽成')
    const tabs = all<HTMLAnchorElement>(container, '[data-testid="find-tabs"] a')
    expect(tabs.map((a) => [a.getAttribute('href'), a.getAttribute('aria-current')])).toEqual([['/agents', null], ['/providers', 'page'], ['/providers/professional', null]])
    only(container, '[data-testid="kid"]')
  })
  it('English shows no Chinese', () => {
    state.lang = 'en'
    const { container } = render(<FindHeader active="agents" />)
    expect(container.textContent).not.toMatch(/[一-鿿]/)
  })
})

describe('entries: rail, avatar menu, footer, /services — the header row is unchanged', () => {
  it('every hat’s rail has 找人 right under 消息, with its own icon', () => {
    expect(FIND_ITEM).toMatchObject({ key: 'find', href: '/agents', group: 'inbox', label: { zh: '找人' }, desc: { zh: '找经纪、维修服务商和专业服务' } })
    for (const role of ['tenant', 'landlord', 'agent'] as const) {
      const items = RAIL_BY_ROLE[role]
      const i = items.findIndex((it) => it.key === 'msgs')
      expect(items[i + 1], role).toBe(FIND_ITEM)
      const icons = items.map((it) => (it.icon as { type: { name: string } }).type.name)
      expect(icons.filter((n) => n === 'FindIcon').length, role).toBe(1)
    }
    // The landlord's own 服务商 page stays: managing contacts and dispatch policy is not browsing.
    expect(RAIL_BY_ROLE.landlord.find((it) => it.key === 'providers')?.href).toBe('/landlord/providers')
  })
  it('the avatar menu has 找经纪 · 服务商 right after 消息', () => {
    const h = read('components/Header.tsx')
    const msg = h.indexOf('data-testid="menu-messages"')
    const find = h.indexOf('data-testid="menu-find"')
    const admin = h.indexOf("'后台管理'")
    expect(msg).toBeGreaterThan(0)
    expect(find).toBeGreaterThan(msg)
    expect(admin).toBeGreaterThan(find)
    expect(h.slice(find - 120, find)).toContain('href="/agents"')
    expect(h).toContain("'找经纪 · 服务商'")
  })
  it('no sixth item in the header row', () => {
    const items = read('components/Header.tsx').match(/const PRODUCT_ITEMS[\s\S]*?\n\]/)?.[0] ?? ''
    expect(items).not.toMatch(/\/agents'|\/providers'/)
  })
  it('the footer link keeps its address and says both; /services links the directory and tells the truth about it', () => {
    expect(read('components/Footer.tsx')).toContain("{ key: 'foot.findAgent', href: '/agents' }")
    expect(read('lib/i18n.tsx')).toContain("'foot.findAgent': { en: 'Find agents & providers', zh: '找经纪 · 服务商' }")
    const s = read('app/services/page.tsx')
    expect(s).toContain('href="/providers" className="sl-btn-secondary"')
    expect(s).toContain('服务商和联系方式要登录后才看得到；派单只有房东能做')
    expect(s).not.toContain('入驻信息只在房东派单时')
  })
  it('the tenant repairs page and the provider jobs page link the directory; the route audit probes the new page', () => {
    expect(read('app/tenant/maintenance/page.tsx')).toContain('data-testid="tenant-find-line"')
    expect(read('app/provider/jobs/page.tsx')).toContain('data-testid="provider-directory-link"')
    expect(read('scripts/route-audit.mjs')).toContain("'/providers'")
  })
})

describe('repairDirectory: who is listed and in what order', () => {
  it('leaves out providers with professional trades only, and shows only repair trades on the rest', () => {
    const rows = repairDirectory([
      prov({ id: 'law', trades: ['paralegal'] }),
      prov({ id: 'mix', trades: ['handyman', 'photographer_floorplan'] }),
    ], HANDYMAN_OK('mix'), [], {}, TODAY)
    expect(rows.map((r) => r.p.id)).toEqual(['mix'])
    expect(rows[0].trades).toEqual([{ t: 'handyman', ok: true }])
  })
  it('fixed order: every trade covered first, then earliest verified, then name', () => {
    const rows = repairDirectory([
      prov({ id: 'late-complete', verified_at: '2026-11-01T00:00:00Z' }),
      prov({ id: 'early-incomplete', verified_at: '2026-01-01T00:00:00Z' }),
      prov({ id: 'early-complete', verified_at: '2026-03-01T00:00:00Z' }),
      prov({ id: 'b-same-day', verified_at: '2026-03-01T00:00:00Z' }),
    ], [...HANDYMAN_OK('late-complete'), ...HANDYMAN_OK('early-complete'), ...HANDYMAN_OK('b-same-day')], [], {}, TODAY)
    expect(rows.map((r) => r.p.id)).toEqual(['b-same-day', 'early-complete', 'late-complete', 'early-incomplete'])
    expect(rows.map((r) => r.complete)).toEqual([true, true, true, false])
  })
  it('an expired credential uncovers the trade; filters by trade and city; averages reviews', () => {
    const list = [prov({ id: 'a', trades: ['plumbing', 'handyman'], service_cities: ['Toronto', 'Vaughan'] }), prov({ id: 'b', service_cities: ['Hamilton'] })]
    const creds = [...HANDYMAN_OK('a'), cred('a', 'sto_coq'), cred('a', 'wsib_clearance', '2026-01-01'), ...HANDYMAN_OK('b')]
    const reviews = [{ provider_id: 'a', overall: 5 }, { provider_id: 'a', overall: 4 }, { provider_id: null, overall: 1 }]
    const all_ = repairDirectory(list, creds, reviews, {}, TODAY)
    const a = all_.find((r) => r.p.id === 'a')!
    expect(a.trades).toEqual([{ t: 'plumbing', ok: false }, { t: 'handyman', ok: true }])
    expect([a.avg, a.reviews]).toEqual([4.5, 2])
    expect(all_.find((r) => r.p.id === 'b')).toMatchObject({ avg: null, reviews: 0 })
    expect(repairDirectory(list, creds, reviews, { trade: 'plumbing' }, TODAY).map((r) => r.p.id)).toEqual(['a'])
    expect(repairDirectory(list, creds, reviews, { city: 'Hamilton' }, TODAY).map((r) => r.p.id)).toEqual(['b'])
    expect(repairDirectory(list, creds, reviews, { trade: 'all', city: 'all' }, TODAY).length).toBe(2)
  })
})

describe('/providers — the repair directory page', () => {
  const seed = () => {
    state.tables = {
      provider_directory: [
        prov({ id: 'p1', legal_name: '[TEST] Maple Plumbing', trades: ['handyman'], contact_email: 'maple@example.org', contact_phone: '416-555-0100', website: 'javascript:alert(1)' }),
        prov({ id: 'p2', legal_name: 'Paralegal Only', trades: ['paralegal'] }),
      ],
      provider_credentials_public: HANDYMAN_OK('p1'),
      provider_reviews: [{ provider_id: 'p1', overall: 4 }],
    }
  }
  const mount = async () => {
    const r = render(<RepairDirectoryPage />)
    await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve() })
    return r
  }
  it('anonymous: trades and a sign-in prompt, and nothing is asked of the database', async () => {
    seed()
    const { container } = await mount()
    expect(textOf(only(container, '[data-testid="providers-signin"]'))).toContain('登录后可以看到服务商与联系方式')
    expect(only<HTMLAnchorElement>(container, '[data-testid="providers-signin"] a').getAttribute('href')).toBe('/login?next=/providers')
    expect(all(container, '[data-testid="providers-trades"] span').length).toBe(8)
    expect(all(container, '[data-testid="provider-card"]').length).toBe(0)
    expect(all(container, '[data-testid="providers-filters"]').length).toBe(0)
    expect(state.asked).toEqual([])
  })
  it('a signed-in tenant sees the cards, the 先报修 hint and no dispatch control', async () => {
    seed()
    state.auth = { user: { id: 'u1' }, loading: false, role: 'tenant' }
    const { container } = await mount()
    const card = only(container, '[data-testid="provider-card"]')
    expect(textOf(card)).toContain('[TEST] Maple Plumbing')
    only(card, '[data-testid="test-data-tag"]')
    expect(textOf(only(card, '[data-testid="provider-rating"]'))).toBe('★ 4 (1)')
    expect(textOf(only(card, '[data-testid="provider-credentials"]'))).toContain('到期 2027-06-30')
    expect(only<HTMLAnchorElement>(card, 'a[href^="mailto:"]').getAttribute('href')).toBe('mailto:maple@example.org')
    // a non-http(s) "website" never becomes a link
    expect(all(card, '[data-testid="provider-website"]').length).toBe(0)
    const hint = only(container, '[data-testid="providers-role-hint"]')
    expect(textOf(hint)).toContain('先报修')
    expect(only<HTMLAnchorElement>(hint, 'a').getAttribute('href')).toBe('/tenant/maintenance')
    expect(container.textContent).not.toMatch(/派给|指派|Dispatch to/)
    expect(textOf(only(container, '[data-testid="providers-order-note"]'))).toContain('排序固定')
    expect(state.asked).toEqual(['provider_directory', 'provider_credentials_public', 'provider_reviews'])
  })
  it('landlord and provider get their own line; an agent gets none', async () => {
    seed()
    state.auth = { user: { id: 'u1' }, loading: false, role: 'landlord' }
    state.hats = { ...state.hats, landlord: true }
    let r = await mount()
    expect(only<HTMLAnchorElement>(r.container, '[data-testid="providers-role-hint"] a').getAttribute('href')).toBe('/landlord/providers')
    cleanup()
    state.hats = { ...state.hats, landlord: false, provider: 'verified' }
    state.auth = { user: { id: 'u1' }, loading: false, role: null }
    r = await mount()
    expect(only<HTMLAnchorElement>(r.container, '[data-testid="providers-role-hint"] a').getAttribute('href')).toBe('/provider/onboard')
    cleanup()
    state.hats = { ...state.hats, provider: null, agent: 'verified' }
    state.auth = { user: { id: 'u1' }, loading: false, role: 'agent' }
    r = await mount()
    expect(all(r.container, '[data-testid="providers-role-hint"]').length).toBe(0)
  })
  it('an empty category says so plainly, with no sample rows', async () => {
    state.auth = { user: { id: 'u1' }, loading: false, role: 'tenant' }
    const { container } = await mount()
    expect(textOf(only(container, '[data-testid="providers-empty"]'))).toBe('这个类别暂时还没有入驻的服务商。')
    expect(all(container, '[data-testid="provider-card"]').length).toBe(0)
  })
  it('source: no service role, no native dialogs, no Ontario statutes in this section, English free of Chinese', async () => {
    const src = read('app/providers/page.tsx')
    expect(src).not.toMatch(/service_role|SUPABASE_SERVICE_ROLE_KEY|window\.confirm|alert\(/)
    for (const f of ['app/providers/page.tsx', 'components/directory/FindHeader.tsx']) expect(read(f), f).not.toMatch(/\b(RTA|LTB|OHRC|RECO|TRESA)\b/)
    expect(src).toContain('rel="noopener noreferrer nofollow"')
    seed()
    state.lang = 'en'
    state.auth = { user: { id: 'u1' }, loading: false, role: 'tenant' }
    const { container } = await mount()
    expect(container.textContent).not.toMatch(/[一-鿿]/)
  })
})

describe('经纪 tab: every verified live registration is listed; only published ones get a card that opens', () => {
  const row = (o: Partial<AgentProfileRow> = {}): AgentProfileRow => ({
    auth_id: 'secret-auth-id', legal_name: 'Jane Doe', reco_number: '1234567', category: 'salesperson' as AgentProfileRow['category'], brokerage_name: 'Example Realty Inc., Brokerage',
    crea_member: false, status: 'verified' as AgentProfileRow['status'], verified_at: '2026-10-01T00:00:00Z', expires_at: null, created_at: '2026-09-01T00:00:00Z',
    public_profile: false, profile_slug: 'jane-doe-1234', bio: 'private bio', languages: ['zh'], service_areas: ['North York'], focus: [], show_activity: false, photo_key: 'k', ...o,
  })
  it('the basic entry carries register fields only: no slug, auth id, bio, photo or contact', () => {
    expect(Object.keys(toBasicAgent(row())).sort()).toEqual(['brokerage_name', 'category', 'crea_member', 'name', 'reco_number', 'status', 'verified_at'])
    expect(JSON.stringify(toBasicAgent(row()))).not.toMatch(/secret-auth-id|jane-doe-1234|private bio/)
  })
  it('a registration counts only while verified and not past its expiry', () => {
    expect(isRegistrationCurrent(row(), TODAY)).toBe(true)
    expect(isRegistrationCurrent(row({ expires_at: '2026-11-15' }), TODAY)).toBe(false)
    expect(isRegistrationCurrent(row({ status: 'pending' as AgentProfileRow['status'] }), TODAY)).toBe(false)
  })
  it('the API leaves the basic list out while a filter is on, and the server never lists a published profile twice', () => {
    const api = read('app/api/agents/route.ts')
    expect(api).toContain('filtered ? Promise.resolve([]) : listBasicAgents(admin)')
    expect(api).toContain('NextResponse.json({ items, basic, total: items.length }')
    expect(read('lib/agentPublicServer.ts')).toContain('isRegistrationCurrent(r) && !isPublishable(r)).map(toBasicAgent)')
    const page = read('app/agents/page.tsx')
    expect(page).toContain('data-testid="agents-basic"')
    // basic cards are not links: there is no profile page to open
    expect(page).toMatch(/<div key=\{a\.reco_number\}[^>]*data-testid="agent-basic-card"/)
  })
  it('rows named "[TEST] …" are recognised for the 测试数据 chip', () => {
    expect(isTestName('[TEST] Maple Plumbing')).toBe(true)
    expect(isTestName(' [ test ] x')).toBe(true)
    expect(isTestName('Maple Plumbing [TEST]')).toBe(false)
    expect(isTestName(null)).toBe(false)
  })
})

describe('the AI Agent points to the directory when asked to find an agent or a provider', () => {
  const wf = { current_stage: 'x', completed_steps: [] } as unknown as Parameters<typeof buildSystemPrompt>[3]
  it('every hat’s system prompt carries the three entries and the no-naming rule', () => {
    for (const role of ['tenant', 'landlord', 'agent'] as const) {
      const p = buildSystemPrompt(role, '', [], wf)
      expect(p, role).toContain(directoryGuide(role))
      const g = directoryGuide(role)
      for (const path of ['/agents', '/providers', '/providers/professional']) expect(g, `${role} ${path}`).toContain(path)
      expect(g).toContain('不点名、不推荐某一家')
      expect(g).toContain('绝不编造名字、电话、评分或价格')
      expect(g).toContain('不抽成')
      // naming: AI 助理 only, no 背调 / 助手
      expect(g).not.toMatch(/助手|管家|背调/)
    }
  })
  it('tenant: a broken thing in the rental is a repair request first; landlord: dispatch stays on the ticket', () => {
    const t = directoryGuide('tenant')
    expect(t).toContain('维修由房东负责安排')
    expect(t).toContain('报修放在前面')
    const l = directoryGuide('landlord')
    expect(l).toContain('/landlord/maintenance')
    expect(l).toContain('派单只能在那里做')
    // the landlord and agent models still never propose a card
    for (const role of ['landlord', 'agent'] as const) expect(directoryGuide(role)).not.toMatch(/proposed_action|待审批卡/)
  })
  it('the three paths render as links; a longer path or a URL around them does not', () => {
    const hrefs = (s: string) => splitPaths(s).filter((x): x is { href: string } => typeof x !== 'string').map((x) => x.href)
    expect(hrefs('经纪在 /agents，维修在 /providers，专业服务在 /providers/professional。')).toEqual(['/agents', '/providers', '/providers/professional'])
    expect(hrefs('管理联系人去 /landlord/providers,派单在 /landlord/maintenance')).toEqual(['/landlord/providers', '/landlord/maintenance'])
    expect(hrefs('后台是 /admin/providers,接口是 /api/agents,主页是 /agents/jane-doe')).toEqual([])
    expect(hrefs('https://www.stayloop.ai/providers')).toEqual([])
    expect(hrefs('客户表 /agent/clients 与 /agents')).toEqual(['/agent/clients', '/agents'])
    expect(splitPaths('没有路径的一句话')).toEqual(['没有路径的一句话'])
    expect(splitPaths('去 /providers 看看')).toEqual(['去 ', { href: '/providers' }, ' 看看'])
    // no lookbehind in the source (older iOS Safari cannot parse it)
    expect(read('lib/agent/replyPaths.ts')).not.toMatch(/\(\?<[!=]/)
  })
})
