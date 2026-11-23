// @vitest-environment jsdom
// V0.9 (2026-11-22, user: 「要把维修服务，专业服务这个和经纪的页面一样，同时也要可以点击进去看主页」).
//  A. the two provider tabs use one card, laid out like the agent card: avatar, name, badge, trades,
//     cities, 看主页 / 发消息. The credential list and the website are on the page only; the e-mail
//     address and the phone number are on the card too (moved off it at first, then the user:
//     「卡片上也要」);
//  B. every provider has a page, /providers/<id>, modelled on the agent's page, with the contact panel;
//  C. an anonymous visitor still reads nothing about any provider, on the page as in the directory;
//  D. a rating reads the same for everyone (view provider_review_stats) — the review table showed
//     each account only the reviews it had written.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import React from 'react'
import { act, cleanup, render } from '@testing-library/react'
import { all, only, textOf } from './helpers/dom'

const read = (p: string) => readFileSync(p, 'utf8')
const ID = '55555555-5555-4555-8555-555555555555'

const state = vi.hoisted(() => ({
  id: '55555555-5555-4555-8555-555555555555',
  lang: 'zh' as 'zh' | 'en',
  auth: { user: null as null | { id: string }, loading: false, role: null as string | null },
  hats: { loading: false, tenant: true, landlord: false, agent: null as string | null, provider: null as string | null, admin: false },
  tables: {} as Record<string, unknown[]>,
  asked: [] as string[],
}))

vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => React.createElement('a', { href, ...rest }, children) }))
vi.mock('next/navigation', () => ({ useParams: () => ({ id: state.id }) }))
vi.mock('@/lib/i18n', () => ({ useT: () => ({ lang: state.lang, t: (_k: string, f: string) => f }), useI18n: () => ({ lang: state.lang, t: (_k: string, f: string) => f }) }))
vi.mock('@/lib/useAuth', () => ({ useAuth: () => state.auth }))
vi.mock('@/lib/useHats', () => ({
  useHats: () => state.hats,
  activeHat: (h: { landlord: boolean; agent: string | null }, remembered: string | null) =>
    remembered === 'landlord' && h.landlord ? 'landlord' : remembered === 'agent' && h.agent ? 'agent' : 'tenant',
}))
vi.mock('@/lib/marketplace/config', () => ({ useMarketplaceConfig: () => ({ graceDays: 0, quoteHoursDefault: 24 }) }))
vi.mock('@/components/Header', () => ({ default: () => React.createElement('header') }))
vi.mock('@/components/Footer', () => ({ default: () => React.createElement('footer') }))
vi.mock('@/lib/supabase', () => {
  const from = (table: string) => {
    state.asked.push(table)
    const rows = () => state.tables[table] ?? []
    const q: Record<string, unknown> = {}
    for (const m of ['select', 'limit', 'in', 'overlaps', 'eq', 'order']) q[m] = () => q
    q.maybeSingle = () => Promise.resolve({ data: rows()[0] ?? null, error: null })
    q.then = (ok: (v: { data: unknown[]; error: null }) => unknown) => Promise.resolve({ data: rows(), error: null }).then(ok)
    return q
  }
  return { supabase: { from, auth: { getSession: async () => ({ data: { session: null } }) } } }
})

import ProviderProfilePage from '../app/providers/[id]/page'
import ProfessionalDirectoryPage from '../app/providers/professional/page'
import ProviderCard, { CITIES_ON_CARD } from '../components/directory/ProviderCard'
import ProviderAvatar from '../components/directory/ProviderAvatar'
import { credentialRows, isProviderId, priceLine, providerDisplayName, providerHref, ratingFor, tradeCoverage, type DirectoryCredential, type DirectoryProvider } from '../lib/marketplace/directory'

afterEach(() => {
  cleanup()
  state.id = ID
  state.lang = 'zh'
  state.auth = { user: null, loading: false, role: null }
  state.hats = { loading: false, tenant: true, landlord: false, agent: null, provider: null, admin: false }
  state.tables = {}
  state.asked = []
})

const TODAY = new Date('2026-11-22T12:00:00Z')
const prov = (o: Partial<DirectoryProvider> = {}): DirectoryProvider => ({
  id: ID, legal_name: '[TEST] Northline Home Services Inc.', trade_name: '[TEST] Northline Home Services', trades: ['plumbing', 'handyman'], service_cities: ['Toronto', 'North York'],
  pricing_mode: 'hourly', call_out_fee: 75, hourly_rate: 110, contact_email: 'hello@northline.example.org', contact_phone: '416-555-0100', website: 'javascript:alert(1)',
  verified_at: '2026-10-01T00:00:00Z', ...o,
})
const cred = (kind: string, expires_at: string | null = '2027-06-30', verified_at: string | null = '2026-10-01T00:00:00Z'): DirectoryCredential => ({ provider_id: ID, kind, expires_at, verified_at })
const PLUMBER_OK = [cred('sto_coq', null), cred('liability_insurance'), cred('wsib_clearance', '2027-01-15'), cred('business_registration', null)]
const flush = async () => { await act(async () => { for (let i = 0; i < 6; i++) await Promise.resolve() }) }
const mount = async (el: React.ReactElement) => { const r = render(el); await flush(); return r }

// ───────────────────────────────────────────────────────────── the pure pieces

describe('what a card and a page are built from (lib/marketplace/directory.ts)', () => {
  it('a rating is the weighted average: one stats row per provider, or single reviews', () => {
    expect(ratingFor('a', [{ provider_id: 'a', overall: 4.5, reviews: 2, on_time: 4, communication: 5, quality: 4 }, { provider_id: 'b', overall: 1, reviews: 9 }]))
      .toEqual({ avg: 4.5, n: 2, onTime: 4, communication: 5, quality: 4 })
    // single reviews, as the older callers pass them
    expect(ratingFor('a', [{ provider_id: 'a', overall: 5 }, { provider_id: 'a', overall: 4 }])).toMatchObject({ avg: 4.5, n: 2, onTime: null })
    expect(ratingFor('a', [])).toEqual({ avg: null, n: 0, onTime: null, communication: null, quality: null })
    // PostgREST may hand a numeric back as a string
    expect(ratingFor('a', [{ provider_id: 'a', overall: '4.0' as unknown as number, reviews: '3' as unknown as number }])).toMatchObject({ avg: 4, n: 3 })
  })
  it('the price line repeats what the provider entered and nothing else', () => {
    expect(priceLine({ pricing_mode: 'hourly', hourly_rate: 110, call_out_fee: 75 }, true)).toBe('$110/h · 上门费 $75')
    expect(priceLine({ pricing_mode: 'hourly', hourly_rate: null, call_out_fee: null }, true)).toBe('按工时')
    expect(priceLine({ pricing_mode: 'fixed', hourly_rate: 110, call_out_fee: 75 }, true)).toBe('固定报价')
    expect(priceLine({ pricing_mode: 'hourly', hourly_rate: 90, call_out_fee: 60 }, false)).toBe('$90/h · call-out $60')
  })
  it('credential rows: verified ones only, the latest expiry per kind, and whether it has passed', () => {
    const rows = credentialRows(ID, [cred('liability_insurance', '2026-03-01'), cred('liability_insurance', '2027-06-30'), cred('wsib_clearance', '2026-11-01'), cred('sto_coq', null), cred('esa_contractor', '2028-01-01', null), { ...cred('tssa_gas'), provider_id: 'someone-else' }], TODAY)
    expect(rows).toEqual([
      { kind: 'liability_insurance', expires: '2027-06-30', expired: false },
      { kind: 'wsib_clearance', expires: '2026-11-01', expired: true },
      { kind: 'sto_coq', expires: null, expired: false },
    ])
  })
  it('every listed trade with its coverage — repairs and professional alike; unknown trades are dropped', () => {
    expect(tradeCoverage({ id: ID, trades: ['plumbing', 'paralegal', 'made_up'] }, PLUMBER_OK, TODAY)).toEqual([
      { t: 'plumbing', ok: true, professional: false },
      { t: 'paralegal', ok: false, professional: true },
    ])
  })
  it('the address is /providers/<uuid>; anything else never reaches the database', () => {
    expect(providerHref(ID)).toBe(`/providers/${ID}`)
    expect(isProviderId(ID)).toBe(true)
    for (const bad of ['professional', '', null, undefined, '123', `${ID}/x`, `${ID},id.neq.x`, '55555555-5555-4555-8555-55555555555g']) expect(isProviderId(bad), String(bad)).toBe(false)
    expect(providerDisplayName({ legal_name: 'Legal Inc.', trade_name: null })).toBe('Legal Inc.')
    expect(providerDisplayName({ legal_name: 'Legal Inc.', trade_name: ' Trade ' })).toBe('Trade')
  })
})

// ───────────────────────────────────────────────────────────── A. the card

describe('one card for both provider tabs, laid out like the agent card', () => {
  const base = { id: ID, name: '[TEST] Northline Home Services', zh: true, badge: { ok: true, label: '资质已核 · 2026-10-01' }, chips: [{ key: 'plumbing', label: '水管', ok: true }, { key: 'electrical', label: '电气', ok: false }], cities: ['Toronto', 'North York', 'Markham', 'Vaughan', 'Ajax', 'Whitby'] }
  it('the name, 看主页 and 发消息 all open the provider’s page; the initial skips the [TEST] tag', () => {
    const { container: c } = render(<ProviderCard {...base} legalName="[TEST] Northline Home Services Inc." rating="★ 4.5 (2)" detail="$110/h · 上门费 $75" email="hello@northline.example.org" phone="(416) 555-0100" />)
    const card = only(c, 'article[data-testid="provider-card"]')
    expect(only<HTMLAnchorElement>(card, '[data-testid="provider-card-name"]').getAttribute('href')).toBe(`/providers/${ID}`)
    expect(only<HTMLAnchorElement>(card, '[data-testid="provider-card-view"]').getAttribute('href')).toBe(`/providers/${ID}`)
    expect(textOf(only(card, '[data-testid="provider-card-view"]'))).toBe('看主页')
    expect(only<HTMLAnchorElement>(card, '[data-testid="provider-card-message"]').getAttribute('href')).toBe(`/providers/${ID}#contact`)
    expect(textOf(only(card, '[data-testid="provider-card-message"]'))).toBe('发消息')
    expect(textOf(only(card, '[data-testid="provider-avatar"]'))).toBe('N')
    only(card, '[data-testid="test-data-tag"]')
    expect(textOf(only(card, '[data-testid="provider-card-legal"]'))).toBe('注册名：[TEST] Northline Home Services Inc.')
    expect(textOf(only(card, '[data-testid="provider-rating"]'))).toBe('★ 4.5 (2)')
    expect(textOf(only(card, '[data-testid="provider-card-badge"]'))).toBe('资质已核 · 2026-10-01')
    expect(all(card, '[data-testid="provider-card-chips"] span').map(textOf)).toEqual(['水管', '电气 · 资质待补'])
    expect(textOf(only(card, '[data-testid="provider-card-cities"]'))).toBe(`服务城市：Toronto · North York · Markham · Vaughan +${base.cities.length - CITIES_ON_CARD}`)
    expect(textOf(only(card, '[data-testid="provider-card-detail"]'))).toBe('$110/h · 上门费 $75')
    // the provider's own address and number, one tap away from the card
    const contact = only(card, '[data-testid="provider-card-contact"]')
    expect(only<HTMLAnchorElement>(contact, 'a[href^="mailto:"]').getAttribute('href')).toBe('mailto:hello@northline.example.org')
    const tel = only<HTMLAnchorElement>(contact, 'a[href^="tel:"]')
    expect(tel.getAttribute('href')).toBe('tel:4165550100')
    expect(textOf(tel)).toBe('(416) 555-0100')
  })
  it('no registered-name line when it is the same name, no rating line where reviews do not apply, and the testid can be the professional one', () => {
    const { container: c } = render(<ProviderCard {...base} legalName="[TEST] Northline Home Services" testid="professional-provider" badge={{ ok: false, label: '牌照待核或已过期' }} />)
    const card = only(c, '[data-testid="professional-provider"]')
    // …and no contact row when the provider left neither an address nor a number
    expect(all(card, '[data-testid="provider-card-legal"], [data-testid="provider-rating"], [data-testid="provider-card-detail"], [data-testid="provider-card-contact"]').length).toBe(0)
    expect(only(card, '[data-testid="provider-card-badge"]').className).toContain('bg-amber-50')
  })
  it('the card carries no website link and no credential list, and the avatar is the provider colour', () => {
    const src = read('components/directory/ProviderCard.tsx')
    expect(src).not.toMatch(/externalHref|target="_blank"|CREDENTIAL_LABEL/)
    const { container: c } = render(<ProviderAvatar name="Maple Plumbing" size={88} />)
    const a = only(c, '[data-testid="provider-avatar"]')
    expect(textOf(a)).toBe('M')
    expect(a.getAttribute('style')).toContain('rgb(194, 65, 12)') // #C2410C
    expect(a.className).toContain('rounded-2xl')
  })
  it('both tabs render it, in the agent directory’s two-column grid', () => {
    const repair = read('app/providers/page.tsx')
    expect(repair).toContain('<div className="mt-4 grid gap-4 lg:grid-cols-2" data-testid="providers-grid">')
    expect(repair).toContain('<ProviderCard')
    expect(repair).toContain('data-testid="providers-count"')
    const pro = read('app/providers/professional/page.tsx')
    expect(pro).toContain('<ProviderCard')
    expect(pro).toContain('testid="professional-provider"')
    // both lists read the address and the number for the card; the website is read on the page only
    for (const s of [repair, pro]) {
      expect(s).toContain('email={p.contact_email}')
      expect(s).toContain('phone={p.contact_phone}')
      expect(s).toContain('contact_email, contact_phone, verified_at')
      expect(s).not.toMatch(/contact_phone, website|externalHref|mailto:/)
    }
  })
})

describe('/providers/professional renders the same card, grouped by licence', () => {
  it('anonymous: a sign-in prompt and nothing asked', async () => {
    const { container: c } = await mount(<ProfessionalDirectoryPage />)
    expect(textOf(only(c, '[data-testid="professional-signin"]'))).toContain('登录后可以看到服务商与联系方式')
    expect(state.asked).toEqual([])
  })
  it('a verified paralegal gets a card that opens their page', async () => {
    state.auth = { user: { id: 'u1' }, loading: false, role: 'tenant' }
    state.tables = {
      provider_directory: [prov({ legal_name: 'Avery Legal Services', trade_name: null, trades: ['paralegal'], service_cities: ['Toronto'] })],
      provider_credentials_public: [cred('lso_paralegal', '2027-03-31')],
    }
    const { container: c } = await mount(<ProfessionalDirectoryPage />)
    const card = only(only(c, '[data-testid="professional-group-paralegal"]'), '[data-testid="professional-provider"]')
    expect(textOf(only(card, '[data-testid="provider-card-name"]'))).toBe('Avery Legal Services')
    expect(textOf(only(card, '[data-testid="provider-card-badge"]'))).toBe('牌照已核')
    expect(textOf(only(card, '[data-testid="provider-card-detail"]'))).toContain('到期 2027-03-31')
    expect(only<HTMLAnchorElement>(card, '[data-testid="provider-card-message"]').getAttribute('href')).toBe(`/providers/${ID}#contact`)
    expect(only<HTMLAnchorElement>(card, '[data-testid="provider-card-contact"] a[href^="mailto:"]').getAttribute('href')).toBe('mailto:hello@northline.example.org')
    expect(all(card, '[data-testid="provider-rating"]').length).toBe(0)
    // the other three categories say they are empty
    expect(all(c, '[data-testid="professional-empty"]').length).toBe(3)
  })
})

// ───────────────────────────────────────────────────────────── B / C. the page

describe('/providers/<id> — the provider’s page', () => {
  const seed = (o: Partial<DirectoryProvider> = {}, creds: DirectoryCredential[] = PLUMBER_OK) => {
    state.tables = {
      provider_directory: [prov(o)],
      provider_credentials_public: creds,
      provider_review_stats: [{ provider_id: ID, overall: 4.5, reviews: 2, on_time: 4, communication: 5, quality: 4 }],
      service_providers: [],
    }
  }

  it('anonymous: a sign-in prompt that comes back here, and nothing about the provider is read', async () => {
    seed()
    const { container: c } = await mount(<ProviderProfilePage />)
    const box = only(c, '[data-testid="provider-profile-signin"]')
    expect(textOf(box)).toContain('登录后查看这家服务商')
    expect(only<HTMLAnchorElement>(box, 'a').getAttribute('href')).toBe(`/login?next=${encodeURIComponent(`/providers/${ID}`)}`)
    expect(all(c, '[data-testid="provider-profile-head"], [data-testid="provider-profile-contact"]').length).toBe(0)
    expect(c.textContent).not.toContain('Northline')
    expect(state.asked).toEqual([])
  })

  it('an address that is not an id is "not found" without a query, signed in or not', async () => {
    state.id = 'not-an-id,id.neq.x'
    state.auth = { user: { id: 'u1' }, loading: false, role: 'tenant' }
    seed()
    const { container: c } = await mount(<ProviderProfilePage />)
    expect(textOf(only(c, '[data-testid="provider-profile-missing"]'))).toContain('没有找到这家服务商的主页')
    expect(state.asked).toEqual([])
  })

  it('signed in: head, services, credentials, rating and the contact panel — laid out like the agent’s page', async () => {
    seed()
    state.auth = { user: { id: 'u1' }, loading: false, role: 'tenant' }
    const { container: c } = await mount(<ProviderProfilePage />)
    expect(state.asked).toEqual(['provider_directory', 'provider_credentials_public', 'provider_review_stats', 'service_providers'])
    const crumb = only(c, '[data-testid="provider-profile-crumb"]')
    expect(only<HTMLAnchorElement>(crumb, 'a').getAttribute('href')).toBe('/providers')
    const head = only(c, '[data-testid="provider-profile-head"]')
    expect(textOf(only(head, 'h1'))).toBe('[TEST] Northline Home Services')
    only(head, '[data-testid="test-data-tag"]')
    expect(textOf(only(head, '[data-testid="provider-profile-descriptor"]'))).toBe('水管 · 杂工 / 清洁')
    expect(textOf(only(head, '[data-testid="provider-profile-legal"]'))).toBe('注册名：[TEST] Northline Home Services Inc.')
    expect(textOf(only(head, '[data-testid="provider-profile-badge"]'))).toBe('资质已核')
    expect(textOf(head)).toContain('核于 2026-10-01')
    expect(textOf(only(head, '[data-testid="provider-profile-rating-line"]'))).toBe('★ 4.5 (2)')
    expect(only<HTMLAnchorElement>(head, '[data-testid="provider-profile-message"]').getAttribute('href')).toBe('#contact')
    only(head, '[data-testid="provider-profile-share"]')
    expect(all(head, '[data-testid="provider-profile-edit"]').length).toBe(0)

    expect(textOf(only(c, '[data-testid="provider-profile-price"]'))).toContain('$110/h · 上门费 $75')
    const creds = only(c, '[data-testid="provider-profile-credentials"]')
    expect(all(creds, 'li').length).toBe(4)
    expect(textOf(creds)).toContain('到期 2027-06-30')
    const reviews = only(c, '[data-testid="provider-profile-reviews"]')
    expect(textOf(reviews)).toContain('总体 · 2 条')
    expect(textOf(reviews)).toMatch(/准时[\s\S]*沟通[\s\S]*质量/)

    const panel = only(c, '#contact[data-testid="provider-profile-contact"]')
    expect(textOf(only(panel, 'h2'))).toBe('联系 [TEST] Northline Home Services')
    only(panel, '[data-testid="provider-contact-form"]')
    const details = only(panel, '[data-testid="provider-profile-details"]')
    expect(only<HTMLAnchorElement>(details, 'a[href^="mailto:"]').getAttribute('href')).toBe('mailto:hello@northline.example.org')
    expect(only<HTMLAnchorElement>(details, 'a[href^="tel:"]').getAttribute('href')).toBe('tel:4165550100')
    // a non-http(s) "website" never becomes a link
    expect(all(c, '[data-testid="provider-website"]').length).toBe(0)
    expect(textOf(only(c, '[data-testid="provider-profile-note"]'))).toContain('不抽成、不经手资金')
  })

  it('a real website is a nofollow link; an uncovered trade is said plainly', async () => {
    seed({ website: 'northline.example.org' }, [cred('business_registration', null), cred('liability_insurance')])
    state.auth = { user: { id: 'u1' }, loading: false, role: 'landlord' }
    const { container: c } = await mount(<ProviderProfilePage />)
    const site = only<HTMLAnchorElement>(c, '[data-testid="provider-website"]')
    expect(site.getAttribute('href')).toBe('https://northline.example.org/')
    expect(site.getAttribute('rel')).toBe('noopener noreferrer nofollow')
    // plumbing needs the trade certificate and the clearance; handyman is covered
    expect(textOf(only(c, '[data-testid="provider-profile-badge"]'))).toBe('部分资质待补')
    expect(textOf(only(c, '[data-testid="provider-profile-services"]'))).toContain('水管 · 资质待补')
  })

  it('the provider on their own page gets 编辑资料 and no form', async () => {
    seed()
    state.tables.service_providers = [{ id: ID }]
    state.auth = { user: { id: 'owner' }, loading: false, role: null }
    const { container: c } = await mount(<ProviderProfilePage />)
    expect(only<HTMLAnchorElement>(c, '[data-testid="provider-profile-edit"]').getAttribute('href')).toBe('/provider/onboard')
    expect(all(c, '[data-testid="provider-profile-message"], [data-testid="provider-contact-form"]').length).toBe(0)
    expect(only<HTMLAnchorElement>(only(c, '[data-testid="provider-profile-own"]'), 'a').getAttribute('href')).toBe('/provider/onboard')
  })

  it('not in the directory: "not found"; the owner is told it is waiting for verification', async () => {
    state.auth = { user: { id: 'u1' }, loading: false, role: 'tenant' }
    let r = await mount(<ProviderProfilePage />)
    let miss = only(r.container, '[data-testid="provider-profile-missing"]')
    expect(textOf(miss)).toContain('可能还没有通过核验')
    expect(only<HTMLAnchorElement>(miss, 'a').getAttribute('href')).toBe('/providers')
    cleanup()
    state.tables = { service_providers: [{ id: ID }] }
    r = await mount(<ProviderProfilePage />)
    miss = only(r.container, '[data-testid="provider-profile-missing"]')
    expect(textOf(miss)).toContain('你的资料还没有通过核验')
    expect(only<HTMLAnchorElement>(miss, 'a').getAttribute('href')).toBe('/provider/onboard')
  })

  it('a licensed professional: back to 专业服务, no price, no reviews, and the note says no legal advice', async () => {
    seed({ legal_name: 'Avery Legal Services', trade_name: null, trades: ['paralegal'] }, [cred('lso_paralegal', '2027-03-31')])
    state.tables.provider_review_stats = []
    state.auth = { user: { id: 'u1' }, loading: false, role: 'landlord' }
    state.hats = { ...state.hats, landlord: true }
    const { container: c } = await mount(<ProviderProfilePage />)
    expect(only<HTMLAnchorElement>(only(c, '[data-testid="provider-profile-crumb"]'), 'a').getAttribute('href')).toBe('/providers/professional')
    expect(all(c, '[data-testid="provider-profile-price"], [data-testid="provider-profile-reviews"], [data-testid="provider-profile-rating-line"], [data-testid="provider-profile-legal"]').length).toBe(0)
    expect(textOf(only(c, '[data-testid="provider-profile-badge"]'))).toBe('资质已核')
    expect(only<HTMLTextAreaElement>(c, '[data-testid="provider-contact-input"]').placeholder).toContain('先不要写证件号码')
    expect(textOf(only(c, '[data-testid="provider-profile-note"]'))).toContain('也不给法律意见、不卖保险')
  })

  it('English shows no Chinese', async () => {
    seed({ legal_name: 'Northline Home Services Inc.', trade_name: 'Northline Home Services' })
    state.lang = 'en'
    state.auth = { user: { id: 'u1' }, loading: false, role: 'tenant' }
    const { container: c } = await mount(<ProviderProfilePage />)
    only(c, '[data-testid="provider-profile-head"]')
    expect(c.textContent).not.toMatch(/[一-鿿]/)
    expect(only<HTMLTextAreaElement>(c, '[data-testid="provider-contact-input"]').placeholder).not.toMatch(/[一-鿿]/)
  })

  it('source: browser client only, no native dialogs, a generic non-indexed title, and it sits beside the professional tab', () => {
    const page = read('app/providers/[id]/page.tsx')
    expect(page).not.toMatch(/service_role|SUPABASE_SERVICE_ROLE_KEY|window\.confirm|alert\(/)
    // an account that is not signed in, or an address that is not an id, never queries
    expect(page).toContain('if (auth.loading || !auth.user || !valid) return')
    const layout = read('app/providers/[id]/layout.tsx')
    expect(layout).toContain("robots: { index: false, follow: false }")
    expect(layout).toContain("title: '服务商主页 · Stayloop'")
    // the static tab keeps its own address next to the dynamic one
    expect(existsSync('app/providers/professional/page.tsx')).toBe(true)
    // the landlord's own provider page links to it too
    expect(read('app/landlord/providers/page.tsx')).toContain('<Link href={providerHref(p.id)}')
  })
})

// ───────────────────────────────────────────────────────────── D. one rating for everyone

describe('a provider’s rating reads the same for everyone', () => {
  it('the view: aggregates of verified providers only, definer, read-only, signed-in accounts only', () => {
    const sql = read('supabase/migrations/20261122c_provider_review_stats.sql')
    expect(sql).toContain('create or replace view public.provider_review_stats with (security_invoker = false) as')
    expect(sql).toContain("where p.status = 'verified'")
    expect(sql).toContain('group by r.provider_id')
    expect(sql).toContain('revoke all on public.provider_review_stats from public, anon, authenticated;')
    expect(sql).toContain('grant select on public.provider_review_stats to authenticated, service_role;')
    // no individual review leaves the table through it
    const select = sql.slice(sql.indexOf('create or replace view'), sql.indexOf('from public.provider_reviews r'))
    expect(select).not.toMatch(/comment|by_user|by_kind|work_order_id|\bnps\b/)
    expect(sql).not.toMatch(/to anon|to public/)
  })
  it('the three pages that show a rating read the view, not the review table', () => {
    for (const f of ['app/providers/page.tsx', 'app/providers/[id]/page.tsx', 'app/landlord/providers/page.tsx']) {
      const s = read(f)
      expect(s, f).toContain("from('provider_review_stats')")
      expect(s, f).not.toContain("from('provider_reviews')")
    }
  })
})
