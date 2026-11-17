// @vitest-environment jsdom
// 2026-11-17 · agent directory and profile redesign (design/agent-pages-redesign-2026-11-17.md), after
// looking at how Royal LePage, RE/MAX, Centris, Redfin, Zillow, HouseSigma and Realtor.ca lay theirs
// out: two-column cards with the photo on the left, the registered name / descriptor / brokerage / RECO
// number in plain sight, two actions per card, name search, a count and a stated order; one list for
// agents with and without a profile. The profile: a larger header with message + share, then about →
// services → listings → numbers → registration. No phone or email (decision kept), no ratings, no ranking.
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { all, only, textOf } from './helpers/dom'

const read = (p: string) => readFileSync(p, 'utf8')
const state = vi.hoisted(() => ({ lang: 'zh' as 'zh' | 'en', calls: [] as string[], payload: { items: [] as unknown[], basic: [] as unknown[] } }))

vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => React.createElement('a', { href, ...rest }, children) }))
vi.mock('@/lib/i18n', () => ({ useT: () => ({ lang: state.lang, t: (_k: string, f: string) => f }), useI18n: () => ({ lang: state.lang, t: (_k: string, f: string) => f }) }))
vi.mock('@/lib/useAuth', () => ({ useAuth: () => ({ user: null, loading: false, role: null }) }))
vi.mock('@/lib/useHats', () => ({ useHats: () => ({ loading: false, tenant: true, landlord: false, agent: null, provider: null, admin: false }) }))
vi.mock('@/lib/supabase', () => ({ supabase: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }) } }))
vi.mock('@/components/Header', () => ({ default: () => React.createElement('header') }))
vi.mock('@/components/Footer', () => ({ default: () => React.createElement('footer') }))

import AgentsDirectoryPage from '../app/agents/page'
import AgentAvatar from '../components/agent/AgentAvatar'
import { AgentBadge } from '../components/AgentBadge'
import { directoryEntries, matchesAgentQuery, type BasicAgent, type PublicAgent } from '../lib/agentPublic'

const pub = (o: Partial<PublicAgent> = {}): PublicAgent => ({
  slug: 'jane-doe', name: 'Jane Doe', category: 'salesperson' as PublicAgent['category'], brokerage_name: 'Maple Realty Inc., Brokerage', reco_number: '1234567',
  crea_member: true, status: 'verified' as PublicAgent['status'], verified_at: '2026-10-01T00:00:00Z', joined: '2026-09', languages: ['zh', 'en'], service_areas: ['North York', 'Markham', 'Scarborough', 'Vaughan', 'Richmond Hill'],
  focus: ['tenant_rep'], bio: null, photo_url: null, signals: null, ...o,
})
const bas = (o: Partial<BasicAgent> = {}): BasicAgent => ({
  name: 'Amy Chan', category: 'broker' as BasicAgent['category'], brokerage_name: 'Birch Realty Ltd.', reco_number: '7654321', crea_member: false, status: 'verified' as BasicAgent['status'], verified_at: '2026-11-01T00:00:00Z', ...o,
})

afterEach(() => { cleanup(); vi.unstubAllGlobals(); state.lang = 'zh'; state.calls = []; state.payload = { items: [], basic: [] } })

async function mount() {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => { state.calls.push(String(url)); return { ok: true, json: async () => state.payload } }))
  const r = render(<AgentsDirectoryPage />)
  await waitFor(() => expect(state.calls.length).toBeGreaterThan(0))
  await act(async () => { await Promise.resolve(); await Promise.resolve() })
  return r
}

describe('name search and the one-list order', () => {
  it('every word of the query must be in the name or the brokerage', () => {
    const a = { name: 'Jane Doe', brokerage_name: 'Maple Realty Inc., Brokerage' }
    expect(matchesAgentQuery(a, 'jane')).toBe(true)
    expect(matchesAgentQuery(a, 'MAPLE doe')).toBe(true)
    expect(matchesAgentQuery(a, 'jane birch')).toBe(false)
    expect(matchesAgentQuery(a, '  ')).toBe(true)
    expect(matchesAgentQuery(a, null)).toBe(true)
  })
  it('default: profiles first, then register-only, each in server order; name: A–Z across both, "[TEST]" ignored', () => {
    const items = [pub({ slug: 'z', name: 'Zoe Zhang' }), pub({ slug: 't', name: '[TEST] Bob Brown' })]
    const basic = [bas({ name: 'Amy Chan' })]
    expect(directoryEntries(items, basic).map((e) => `${e.kind}:${e.agent.name}`)).toEqual(['public:Zoe Zhang', 'public:[TEST] Bob Brown', 'basic:Amy Chan'])
    expect(directoryEntries(items, basic, 'name').map((e) => e.agent.name)).toEqual(['Amy Chan', '[TEST] Bob Brown', 'Zoe Zhang'])
  })
  it('the API applies q to both lists and still drops register-only entries under a language / focus / area filter', () => {
    const api = read('app/api/agents/route.ts')
    expect(api).toContain("const q = (u.searchParams.get('q') || '').slice(0, 60).trim() || null")
    expect(api).toContain('matchesDirectoryFilter(x, { language, focus, area }) && matchesAgentQuery(x, q)')
    expect(api).toContain('const basic = allBasic.filter((x) => matchesAgentQuery(x, q))')
    expect(api).toContain('filtered ? Promise.resolve([]) : listBasicAgents(admin)')
    // user text never goes into a PostgREST filter string: the match runs in code
    expect(api).not.toMatch(/\.or\(|\.ilike\(/)
    expect(api).toContain('listPublicAgents(admin)')
  })
})

describe('the directory page', () => {
  it('one grid, two columns; a published agent’s card shows the facts and two actions', async () => {
    state.payload = { items: [pub()], basic: [bas()] }
    const { container } = await mount()
    const grid = only(container, '[data-testid="agents-grid"]')
    expect(grid.className).toContain('lg:grid-cols-2')
    expect(all(grid, 'article').map((x) => x.getAttribute('data-testid'))).toEqual(['agent-card', 'agent-basic-card'])
    const card = only(container, '[data-testid="agent-card"]')
    expect(textOf(only(card, '[data-testid="agent-card-brokerage"]'))).toBe('Maple Realty Inc., Brokerage')
    expect(textOf(card)).toContain('地产销售代表 · REALTOR®')
    expect(textOf(card)).toContain('RECO 注册已核 · #1234567')
    expect(all(only(card, '[data-testid="agent-card-chips"]'), 'span').map(textOf)).toEqual(['普通话', '英语', '帮租客找房'])
    expect(textOf(only(card, '[data-testid="agent-card-areas"]'))).toBe('服务区域：North York · Markham · Scarborough +2')
    expect(only<HTMLAnchorElement>(card, '[data-testid="agent-card-view"]').getAttribute('href')).toBe('/agents/jane-doe')
    expect(only<HTMLAnchorElement>(card, '[data-testid="agent-card-message"]').getAttribute('href')).toBe('/agents/jane-doe#contact')
    // no phone, no email anywhere on the page
    expect(container.querySelector('a[href^="tel:"], a[href^="mailto:"]')).toBeNull()
  })
  it('a register-only agent has the same card shape, a 未开主页 tag, no profile link and no message button', async () => {
    state.payload = { items: [pub()], basic: [bas()] }
    const { container } = await mount()
    const card = only(container, '[data-testid="agent-basic-card"]')
    expect(textOf(only(card, '[data-testid="agent-no-profile-tag"]'))).toBe('未开主页')
    expect(textOf(card)).toContain('RECO 注册已核 · #7654321')
    expect(card.querySelector('[data-testid="agent-card-message"], [data-testid="agent-card-view"]')).toBeNull()
    expect(card.querySelector('a[href^="/agents/"]')).toBeNull()
    expect(only<HTMLAnchorElement>(card, '[data-testid="agent-basic-reco"]').getAttribute('href')).toBe('https://registrantsearch.reco.on.ca/')
  })
  it('says how many and how many can be messaged, states the order, and sorts by name on request', async () => {
    state.payload = { items: [pub({ name: 'Zoe Zhang', slug: 'zoe' })], basic: [bas({ name: 'Amy Chan' }), bas({ name: 'Bo Li', reco_number: '1112223' })] }
    const { container } = await mount()
    expect(textOf(only(container, '[data-testid="agents-count"]'))).toBe('共 3 位经纪，其中 1 位可以在站内联系')
    expect(textOf(only(container, '[data-testid="agents-order-note"]'))).toContain('没有推荐位，也不收排名费')
    const names = () => all(container, '[data-testid="agents-grid"] [data-testid="agent-card-name"]').map(textOf)
    expect(names()).toEqual(['Zoe Zhang', 'Amy Chan', 'Bo Li'])
    fireEvent.change(only<HTMLSelectElement>(container, '[data-testid="agents-sort"]'), { target: { value: 'name' } })
    expect(names()).toEqual(['Amy Chan', 'Bo Li', 'Zoe Zhang'])
  })
  it('the count line reads right at the edges', async () => {
    state.payload = { items: [pub()], basic: [] }
    let r = await mount()
    expect(textOf(only(r.container, '[data-testid="agents-count"]'))).toBe('共 1 位经纪，都可以在站内联系')
    cleanup(); state.calls = []
    state.payload = { items: [], basic: [bas()] }
    r = await mount()
    expect(textOf(only(r.container, '[data-testid="agents-count"]'))).toBe('共 1 位经纪，暂时都还不能在站内联系')
  })
  it('typing a name sends q to the API; no match says so', async () => {
    state.payload = { items: [], basic: [] }
    const { container } = await mount()
    fireEvent.change(only<HTMLInputElement>(container, '[data-testid="agents-q"]'), { target: { value: 'jane maple' } })
    await waitFor(() => expect(state.calls.some((u) => u.includes('q=jane+maple'))).toBe(true))
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    expect(textOf(only(container, '[data-testid="agents-empty"]'))).toContain('没有符合条件的经纪')
  })
  it('English shows no Chinese', async () => {
    state.lang = 'en'
    state.payload = { items: [pub()], basic: [bas()] }
    const { container } = await mount()
    expect(textOf(only(container, '[data-testid="agents-count"]'))).toBe('2 agents, 1 reachable on Stayloop')
    expect(container.textContent).not.toMatch(/[一-鿿]/)
  })
})

describe('avatar and badge variants', () => {
  it('square avatar for cards and the profile header; muted initials for a register-only entry', () => {
    const { container } = render(<><AgentAvatar name="Amy Chan" size={88} shape="square" muted /><AgentAvatar name="Bo Li" photoUrl="https://x.test/p.jpg" size={128} shape="square" /><AgentAvatar name="Cy Du" /></>)
    const [muted, photo, circle] = Array.from(container.children) as HTMLElement[]
    expect(muted.className).toContain('rounded-2xl')
    expect(muted.style.background).not.toContain('gradient')
    expect(photo.tagName).toBe('IMG')
    expect(photo.className).toContain('rounded-2xl')
    expect(circle.className).toContain('rounded-full')
  })
  it('the compact badge prints the number only when asked', () => {
    const a = { status: 'verified', reco_number: '1234567', brokerage_name: 'X', verified_at: '2026-10-01T00:00:00Z', category: 'salesperson', crea_member: false } as Parameters<typeof AgentBadge>[0]['agent']
    const { container } = render(<><AgentBadge agent={a} lang="zh" compact withNumber /><AgentBadge agent={a} lang="zh" compact /></>)
    const [withN, plain] = Array.from(container.children) as HTMLElement[]
    expect(textOf(withN)).toBe('✓ RECO 注册已核 · #1234567')
    expect(textOf(plain)).toBe('✓ RECO 注册已核')
  })
})

describe('the profile page', () => {
  const p = read('app/agents/[slug]/page.tsx')
  const at = (needle: string) => { const i = p.indexOf(needle); expect(i, needle).toBeGreaterThan(0); return i }
  it('header: 128px square photo, message + share; the long verification box is no longer in it', () => {
    expect(p).toContain('<AgentAvatar name={agent.name} size={128} photoUrl={agent.photo_url} shape="square" />')
    expect(p).toContain('data-testid="agent-profile-message"')
    expect(p).toContain('data-testid="agent-profile-share"')
    const head = p.slice(at('data-testid="agent-profile-head"'), at('data-testid="agent-profile-about"'))
    expect(head).toContain('<AgentBadge agent={agent} lang={L} compact withNumber />')
    expect(head).not.toContain('<AgentBadge agent={agent} lang={L} />')
  })
  it('section order: head → about → services → listings → numbers → registration, with the contact form in the side column', () => {
    const order = ['agent-profile-head', 'agent-profile-about', 'agent-profile-services', 'agent-profile-listings', 'agent-profile-activity', 'agent-profile-registration', 'agent-profile-contact'].map((t) => at(`data-testid="${t}"`))
    expect([...order].sort((a, b) => a - b)).toEqual(order)
    expect(p).toContain('id="contact"')
    expect(p).toContain("window.location.hash === '#contact'")
  })
  it('still no phone, email, rating or ranking; own profile gets 编辑主页 instead of 发消息', () => {
    expect(p).not.toMatch(/business_email|business_phone|mailto:|tel:/)
    expect(p).not.toMatch(/★|评分|rating/i)
    expect(p).toMatch(/\{!isMine && \(\s*<a href="#contact"/)
    expect(p).toContain("{zh ? '编辑主页' : 'Edit profile'}")
  })
  it('listings are photo cards in up to three columns', () => {
    expect(p).toContain('sm:grid-cols-2 xl:grid-cols-3')
    expect(p).toContain('aspect-[4/3] w-full object-cover')
  })
})
