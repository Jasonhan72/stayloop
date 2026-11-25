// @vitest-environment jsdom
// V0.9 (2026-11-24, user: 「接着做找人」 — the third product module finished in the AI conversation).
// Asked for an agent, a tradesperson or a professional, the assistant used to give three directory
// paths and nothing else, because it cannot see who is in the directory. That half is unchanged: it
// still names, counts and recommends nobody. What is new is the directory card under its reply — the
// directory's own rows, read in the browser under the person's own session, in the directory's fixed
// order, on the directory's own cards, narrowed by what the person said — and writing to someone
// from the card. The system lists; the model does not.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import React from 'react'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { all, only, textOf } from './helpers/dom'

const read = (p: string) => readFileSync(p, 'utf8')

const db = vi.hoisted(() => ({
  user: { id: 'u-landlord' } as null | { id: string },
  agents: { items: [] as unknown[], basic: [] as unknown[] },
  repairs: { providers: [] as unknown[], creds: [] as unknown[], reviews: [] as unknown[] },
  professional: { providers: [] as unknown[], creds: [] as unknown[] },
  calls: [] as [string, unknown?][],
  fail: false,
}))
vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => React.createElement('a', { href, ...rest }, children) }))
vi.mock('@/lib/useAuth', () => ({ useAuth: () => ({ loading: false, user: db.user, role: null }) }))
vi.mock('@/lib/supabase', () => ({ supabase: { auth: { getSession: async () => ({ data: { session: null } }) }, from: () => { throw new Error('the card reads through lib/marketplace/directoryClient') } } }))
vi.mock('@/lib/marketplace/config', () => ({ useMarketplaceConfig: () => ({ graceDays: 0, quoteHoursDefault: 24 }) }))
vi.mock('@/lib/marketplace/directoryClient', () => ({
  loadAgentDirectory: async (f: unknown) => { db.calls.push(['agents', f]); if (db.fail) throw new Error('boom'); return db.agents },
  loadRepairDirectory: async () => { db.calls.push(['repairs']); if (db.fail) throw new Error('boom'); return db.repairs },
  loadProfessionalDirectory: async () => { db.calls.push(['professional']); if (db.fail) throw new Error('boom'); return db.professional },
}))

import { I18nProvider } from '../lib/i18n'
import DirectoryChatCard, { DIRECTORY_CHAT_PAGE } from '../components/agent/DirectoryChatCard'
import AgentCard from '../components/directory/AgentCard'
import { directoryAsk, directoryTurnNote, type DirectoryOffer } from '../lib/agent/directoryIntent'
import { directoryGuide } from '../lib/agent/prompts'
import { productModulesGuide, MODULES_IN_CHAT } from '../lib/agent/productModules'
import { professionalCardData, professionalList, repairCardData } from '../lib/marketplace/directoryCards'
import { repairDirectory, type DirectoryCredential, type DirectoryProvider } from '../lib/marketplace/directory'
import type { PublicAgent } from '../lib/agentPublic'

const agent = (slug: string, name: string, over: Partial<PublicAgent> = {}): PublicAgent => ({
  slug, name, category: 'salesperson' as PublicAgent['category'], brokerage_name: `${name} Realty Inc., Brokerage`, reco_number: '4388001', crea_member: false,
  status: 'verified' as PublicAgent['status'], verified_at: '2026-10-01', joined: '2026-10-01', languages: ['zh', 'en'], service_areas: ['North York'], focus: ['tenant_rep'], bio: null, photo_url: null, signals: null, ...over,
})
const provider = (id: string, name: string, trades: string[], over: Partial<DirectoryProvider> = {}): DirectoryProvider => ({
  id, legal_name: `${name} Ltd.`, trade_name: name, trades, service_cities: ['Toronto'], pricing_mode: 'hourly', call_out_fee: 80, hourly_rate: 95,
  contact_email: `${id}@example.org`, contact_phone: '416-555-0100', verified_at: '2026-10-01', languages: ['en'], photo_key: null, ...over,
})
const covered = (id: string, kinds: string[]): DirectoryCredential[] => kinds.map((kind) => ({ provider_id: id, kind, verified_at: '2026-10-01', expires_at: '2027-12-31' } as DirectoryCredential))
const PLUMB = ['sto_coq', 'liability_insurance', 'wsib_clearance']

beforeEach(() => {
  localStorage.setItem('stayloop_lang', 'zh')
  db.user = { id: 'u-landlord' }; db.calls.length = 0; db.fail = false
  db.agents = { items: [agent('amy-chen', 'Amy Chen'), agent('ben-li', '[TEST] Ben Li')], basic: [{ name: 'Carl Wu', category: 'salesperson', brokerage_name: 'X Realty', reco_number: '1', crea_member: false, status: 'verified', verified_at: '2026-09-01' }] }
  db.repairs = {
    providers: [provider('p-late', 'Late Plumbing', ['plumbing'], { verified_at: '2026-11-01' }), provider('p-elec', 'Spark Electric', ['electrical']), provider('p-early', '[TEST] Maple Plumbing', ['plumbing', 'handyman'], { verified_at: '2026-09-01', service_cities: ['Toronto', 'Mississauga'] }), provider('p-uncovered', 'No Papers Plumbing', ['plumbing'], { verified_at: '2026-08-01' })],
    creds: [...covered('p-late', PLUMB), ...covered('p-early', [...PLUMB, 'business_registration'])],
    reviews: [{ provider_id: 'p-early', overall: 4.5, reviews: 2 }],
  }
  db.professional = { providers: [provider('pro-para', '[TEST] Northside Paralegal', ['paralegal']), provider('pro-law', 'Lee Law', ['lawyer'])], creds: covered('pro-para', ['lso_paralegal']) }
})
afterEach(() => { cleanup(); localStorage.clear() })

const offer = (o: Partial<DirectoryOffer>): DirectoryOffer => ({ id: 'offer-1', kind: 'repairs', trade: null, language: null, city: null, ...o })
const mount = (o: Partial<DirectoryOffer>, role: 'tenant' | 'landlord' | 'agent' = 'landlord') => render(<I18nProvider><DirectoryChatCard offer={offer(o)} role={role} /></I18nProvider>)
const card = (c: ParentNode) => only<HTMLElement>(c, '[data-testid="directory-chat-card"]')
const ready = async (c: ParentNode) => { await waitFor(() => expect(card(c).dataset.state).toBe('ready')) }
const names = (c: ParentNode) => all(c, '[data-testid="provider-card-name"], [data-testid="agent-card-name"]').map(textOf)

describe('what counts as asking for someone: the person’s own words, read deterministically', () => {
  const cases: [string, 'tenant' | 'landlord' | 'agent', unknown][] = [
    ['帮我找一位会说中文的租赁经纪', 'tenant', { kind: 'agents', trade: null, language: 'zh', city: null }],
    ['我想找一位租赁经纪', 'tenant', { kind: 'agents', trade: null, language: null, city: null }],
    ['我想找一位经纪，最好会说粤语，在北约克', 'landlord', { kind: 'agents', trade: null, language: 'yue', city: 'North York' }],
    ['哪里能找到水管工？', 'landlord', { kind: 'repairs', trade: 'plumbing', language: null, city: null }],
    ['有没有靠谱的电工，Mississauga 的', 'landlord', { kind: 'repairs', trade: 'electrical', language: null, city: 'Mississauga' }],
    ['租客报修说暖气不热，帮我找个师傅上门', 'landlord', { kind: 'repairs', trade: 'heating_cooling', language: null, city: null }],
    ['帮我找个师傅', 'landlord', { kind: 'repairs', trade: null, language: null, city: null }],
    ['替客户找个电工', 'agent', { kind: 'repairs', trade: 'electrical', language: null, city: null }],
    ['我想找个 Paralegal', 'landlord', { kind: 'professional', trade: 'paralegal', language: null, city: null }],
    ['哪里能买租客险，推荐个保险经纪', 'tenant', { kind: 'professional', trade: 'insurance_broker', language: null, city: null }],
    ['需要一位律师，多伦多的', 'landlord', { kind: 'professional', trade: 'lawyer', language: null, city: 'Toronto' }],
    ['有没有拍房源的摄影师', 'agent', { kind: 'professional', trade: 'photographer_floorplan', language: null, city: null }],
    ['I am looking for a leasing agent who speaks Mandarin in North York', 'tenant', { kind: 'agents', trade: null, language: 'zh', city: 'North York' }],
    ['Where can I find a plumber?', 'landlord', { kind: 'repairs', trade: 'plumbing', language: null, city: null }],
    ['Can you recommend a paralegal?', 'landlord', { kind: 'professional', trade: 'paralegal', language: null, city: null }],
  ]
  it('an agent, a tradesperson or a professional — with the trade, the language and the city they named', () => {
    for (const [said, role, want] of cases) expect(directoryAsk(said, role), said).toEqual(want)
  })
  it('the sentences the product page sends for this module open the card', () => {
    const m = MODULES_IN_CHAT.find((x) => x.href === '/agents')!
    for (const a of m.asks) for (const said of [a.ask.zh, a.ask.en]) expect(directoryAsk(said, a.role), said).not.toBeNull()
  })
  it('a tenant asking for a tradesperson gets the repair request, not the directory: the landlord arranges and pays', () => {
    for (const said of ['帮我找个水管工', '厨房水槽漏水，帮我找个水管工', 'Where can I find a plumber?']) expect(directoryAsk(said, 'tenant'), said).toBeNull()
    // a tenant may still look for an agent, insurance or a paralegal
    expect(directoryAsk('帮我找个水管工', 'landlord')?.kind).toBe('repairs')
  })
  it('not: joining the directory, dispatching a ticket, an agent looking for an agent, a question that only mentions one, anything else', () => {
    const not: [string, 'tenant' | 'landlord' | 'agent'][] = [
      ['我是水管工，想加入目录', 'landlord'], ['怎么让我出现在经纪目录里', 'agent'], ['我想申请成为服务商', 'landlord'],
      ['租客报修了，怎么派给师傅？', 'landlord'], ['给这张工单找个水管工派过去', 'landlord'],
      ['帮我找个经纪', 'agent'],
      ['我找房的时候经纪让我先付押金，合法吗', 'tenant'], ['经纪费一般是多少', 'landlord'], ['租约里需要写经纪公司吗', 'landlord'],
      ['帮我找市中心 $2,500 以内的一居室', 'tenant'], ['帮我导入租约', 'landlord'], ['10 月的租金收到了', 'landlord'], ['', 'tenant'],
    ]
    for (const [said, role] of not) expect(directoryAsk(said, role), said).toBeNull()
    expect(directoryAsk(null, 'landlord')).toBeNull()
  })
})

describe('the turn: the system lists, the model does not', () => {
  const route = read('app/api/agent/turn/route.ts')
  it('offered from the message, for a signed-in caller, one card a turn — and nothing about the directory goes into the prompt', () => {
    expect(route).toContain('const directoryOffer = !anonymous && !!turnUserId && !leaseImportOffer && !rentRecordOffer ? directoryAsk(message, role) : null')
    expect(route).toContain("(directoryOffer ? directoryTurnNote(directoryOffer.kind) : '') +")
    expect(route).toContain('directory: directoryOffer ? { id: crypto.randomUUID(), ...directoryOffer } : undefined,')
    expect(route).not.toMatch(/parsed\??\.directory\b/)
    expect(read('lib/agent/prompts.ts')).not.toContain('"directory"')
    // the route reads no directory row: the rows are read in the browser, under the person's own session
    expect(route).not.toMatch(/provider_directory|provider_review_stats|provider_credentials_public|listPublicAgents|loadAgentDirectory|loadRepairDirectory|loadProfessionalDirectory/)
    expect(read('lib/agent/orchestrator.ts')).toContain("directory: !anonymous && turn.directory && typeof turn.directory.id === 'string' && ['agents', 'repairs', 'professional'].includes(turn.directory.kind) ? turn.directory : undefined,")
  })
  it('the model is told a card will be there, and that it still names, counts and recommends nobody', () => {
    for (const kind of ['agents', 'repairs', 'professional'] as const) {
      const note = directoryTurnNote(kind)
      expect(note).toContain('你【看不到】卡上是谁')
      expect(note).toContain('【不要】点名,不要推荐某一位,不要说「有很多」「有 N 位」')
      expect(note).toContain('【不要】编造名字、电话、评分、价格或资质')
      expect(note).toContain('不是 Stayloop 的背书')
      expect(note).toContain('不抽成')
      expect(note).not.toMatch(/助手|管家|背调|排名靠前|优先推荐/)
    }
    // a landlord with a ticket is reminded where dispatch happens; a paralegal is not called a lawyer
    expect(directoryTurnNote('repairs')).toContain('派单要在 /landlord/maintenance 那张工单上点「指派」')
    expect(directoryTurnNote('professional')).toContain('不要译成「法律顾问」或「律师」')
    expect(directoryTurnNote('agents')).not.toContain('/landlord/maintenance')
  })
  it('the standing guide says the same: a card may be there, and nobody is named either way', () => {
    for (const role of ['tenant', 'landlord', 'agent'] as const) {
      const g = directoryGuide(role)
      expect(g).toContain('系统还会在你的回复下面放一张目录卡')
      expect(g).toContain('不管有没有卡,你都【看不到】目录里有谁:不点名、不推荐某一家、不说「有很多」或「有 N 家」,绝不编造名字、电话、评分或价格')
      expect(productModulesGuide(role)).toContain('你看不到卡上是谁:不点名、不推荐、不说有几位')
    }
    // a visitor: these cards are for signed-in conversations only
    const anon = route.match(/const ANON_PROMPT_ADDENDUM = `([\s\S]*?)`\n/)?.[1] ?? ''
    expect(anon).toContain('目录卡)只在登录后的对话里出现')
  })
  it('the chat shows the card under the reply, in a live session only', () => {
    const chat = read('components/agent/AgentChat.tsx')
    expect(chat).toContain("{m.role === 'agent' && m.directory && live && (")
    expect(chat).toContain('<DirectoryChatCard offer={m.directory as DirectoryOffer} role={role} />')
    expect(read('lib/agent/useAgentSession.ts')).toContain('directory = turn.directory')
    // the card calls no model and asks the assistant nothing
    expect(read('components/agent/DirectoryChatCard.tsx')).not.toMatch(/api\/agent\/turn|llmChat|useAgentSession|fetch\(/)
  })
})

describe('the same directory: the reads, the order and the cards are the tabs’ own', () => {
  it('the reads are the tabs’ reads — the same views and columns; ratings from the stats view; never the service role', () => {
    const client = read('lib/marketplace/directoryClient.ts')
    const repair = read('app/providers/page.tsx')
    const pro = read('app/providers/professional/page.tsx')
    const sel = (s: string, anchor: string) => s.slice(s.indexOf(anchor)).match(/\.select\('([^']+)'\)/)?.[1]
    expect(sel(client, 'export async function loadRepairDirectory')).toBe(sel(repair, "from('provider_directory')"))
    expect(sel(client, 'export async function loadProfessionalDirectory')).toBe(sel(pro, "from('provider_directory')"))
    for (const s of ["from('provider_credentials_public').select('provider_id, kind, expires_at, verified_at')", "from('provider_review_stats').select('provider_id, overall, reviews')"]) { expect(client, s).toContain(s); expect(repair, s).toContain(s) }
    expect(client).toContain(".overlaps('trades', [...PROFESSIONAL_TRADES])")
    expect(client).toContain('fetch(`/api/agents?${qs.toString()}`, { cache: \'no-store\' })')
    expect(read('app/agents/page.tsx')).toContain('fetch(`/api/agents?${qs.toString()}`, { cache: \'no-store\' })')
    // each account sees only its own rows in the review table, so the card must not read it
    expect(client).not.toMatch(/from\('provider_reviews'\)|from\('service_providers'\)|service_role|SERVICE_ROLE|createClient\(/)
  })
  it('the order is the directory’s fixed order, and the card wording is the tabs’ wording', () => {
    const rows = repairDirectory(db.repairs.providers as DirectoryProvider[], db.repairs.creds as DirectoryCredential[], db.repairs.reviews as never, { trade: 'plumbing', city: 'all' })
    // every credential in place first, then by when they were verified — not by rating, not by name
    expect(rows.map((r) => r.p.id)).toEqual(['p-early', 'p-late', 'p-uncovered'])
    const c = repairCardData(rows[0], true)
    expect([c.badge, c.rating, c.detail, c.email, c.phone, c.professional]).toEqual([{ ok: true, label: '资质已核 · 2026-09-01' }, '★ 4.5 (2)', '$95/h · 上门费 $80', 'p-early@example.org', '416-555-0100', false])
    expect(c.chips).toEqual([{ key: 'plumbing', label: '水管', ok: true }, { key: 'handyman', label: '杂工 / 清洁', ok: true }])
    expect(repairCardData(rows[1], true).rating).toBe('还没有评价')
    const repair = read('app/providers/page.tsx')
    for (const s of ["`${zh ? '资质已核' : 'Verified'}${p.verified_at ? ` · ${p.verified_at.slice(0, 10)}` : ''}`", "avg != null ? `★ ${avg} (${n})` : (zh ? '还没有评价' : 'No reviews yet')"]) { expect(repair, s).toContain(s); expect(read('lib/marketplace/directoryCards.ts'), s).toContain(s) }
    // professionals: by licence category in the tab's order, each once; the badge is about the licence
    const list = professionalList(db.professional.providers as DirectoryProvider[], null)
    expect(list.map((x) => [x.p.id, x.t])).toEqual([['pro-para', 'paralegal'], ['pro-law', 'lawyer']])
    expect(professionalList(db.professional.providers as DirectoryProvider[], 'lawyer').map((x) => x.p.id)).toEqual(['pro-law'])
    const para = professionalCardData(list[0].p, list[0].t, db.professional.creds as DirectoryCredential[], true)
    expect([para.badge, para.rating, para.professional]).toEqual([{ ok: true, label: '牌照已核' }, undefined, true])
    expect(professionalCardData(list[1].p, list[1].t, db.professional.creds as DirectoryCredential[], true).badge).toEqual({ ok: false, label: '牌照待核或已过期' })
    const pro = read('app/providers/professional/page.tsx')
    for (const s of ["cov.ok ? (zh ? '牌照已核' : 'Licence verified') : (zh ? '牌照待核或已过期' : 'Licence pending or expired')"]) { expect(pro, s).toContain(s); expect(read('lib/marketplace/directoryCards.ts'), s).toContain(s) }
  })
  it('the agent’s card is one component for the directory and the conversation: brokerage on its own line, no phone, no e-mail', () => {
    const src = read('components/directory/AgentCard.tsx')
    expect(src).toContain('<div className="break-words text-[14px] font-semibold leading-snug text-ink" data-testid="agent-card-brokerage">{a.brokerage_name}</div>')
    expect(src).not.toMatch(/mailto:|tel:|contact_email|contact_phone/)
    expect(read('app/agents/page.tsx')).toContain("import AgentCard from '@/components/directory/AgentCard'")
    const a = render(<AgentCard agent={agent('amy-chen', 'Amy Chen')} zh />)
    expect(only<HTMLAnchorElement>(a.container, '[data-testid="agent-card-message"]').getAttribute('href')).toBe('/agents/amy-chen#contact')
    cleanup()
    let opened = 0
    const b = render(<AgentCard agent={agent('amy-chen', 'Amy Chen')} zh onMessage={() => { opened++ }} messageOpen={false} />)
    const btn = only<HTMLButtonElement>(b.container, 'button[data-testid="agent-card-message"]')
    expect(btn.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(btn)
    expect(opened).toBe(1)
    expect(textOf(only(b.container, '[data-testid="agent-card-brokerage"]'))).toBe('Amy Chen Realty Inc., Brokerage')
  })
  it('the message forms are the directory’s own: the agent’s page and the conversation share one, with its disclosure', () => {
    const form = read('components/directory/AgentContact.tsx')
    expect(form).toContain('fetch(`/api/agents/${encodeURIComponent(slug)}/contact`')
    expect(form).toContain('body: JSON.stringify({ role, area, budget, message })')
    expect(form).toContain('发送后，这位经纪会收到你的显示名和登录邮箱，并把你记进 TA 的客户表')
    expect(read('app/agents/[slug]/page.tsx')).toContain('<AgentContact slug={slug} agentName={agent.name} zh={zh} />')
    expect(read('app/agents/[slug]/page.tsx')).not.toContain('function ContactForm(')
    const chat = read('components/agent/DirectoryChatCard.tsx')
    expect(chat).toContain("<AgentContact slug={r.agent.slug} agentName={r.agent.name} zh={zh} initialRole={role === 'landlord' ? 'landlord' : 'tenant'} />")
    expect(chat).toContain('<ProviderContact providerId={r.card!.id} providerName={r.card!.name} zh={zh} as={role} professional={r.card!.professional} />')
  })
})

describe('the card', () => {
  it('a tradesperson: the providers for the trade named, in the directory’s order, on the directory’s card — with the address and number', async () => {
    const { container: c } = mount({ kind: 'repairs', trade: 'plumbing' })
    await ready(c)
    expect(db.calls).toEqual([['repairs']])
    expect(names(c)).toEqual(['[TEST] Maple Plumbing', 'Late Plumbing', 'No Papers Plumbing'])
    expect(all(c, '[data-testid="provider-card"]').length).toBe(3)
    const first = all(c, '[data-testid="directory-chat-entry"]')[0]
    expect(textOf(only(first, '[data-testid="provider-card-badge"]'))).toBe('资质已核 · 2026-09-01')
    expect(all<HTMLAnchorElement>(first, '[data-testid="provider-card-contact"] a').map((a) => a.getAttribute('href'))).toEqual(['mailto:p-early@example.org', 'tel:4165550100'])
    expect(textOf(first)).toContain('测试数据')
    expect(textOf(only(c, '[data-testid="directory-chat-count"]'))).toBe('目录里符合的有 3 家，先列 3 家。顺序是目录固定的顺序，不是推荐，也不收排名费。')
    expect(textOf(only(c, '[data-testid="directory-chat-note"]'))).toContain('不是 Stayloop 的推荐或担保')
    expect(only<HTMLAnchorElement>(c, '[data-testid="directory-chat-all"]').getAttribute('href')).toBe('/providers?trade=plumbing')
    expect(textOf(card(c))).toContain('试点 · 多伦多及周边')
  })
  it('what the person said is shown as conditions they can drop; dropping one widens the list', async () => {
    const { container: c } = mount({ kind: 'repairs', trade: 'plumbing', city: 'Mississauga' })
    await ready(c)
    expect(all(c, '[data-testid="directory-chat-filters"] button').map(textOf)).toEqual(['工种：水管×', '城市：Mississauga×'])
    expect(names(c)).toEqual(['[TEST] Maple Plumbing'])
    fireEvent.click(only(c, '[data-testid="directory-chat-filter-city"]'))
    expect(names(c)).toEqual(['[TEST] Maple Plumbing', 'Late Plumbing', 'No Papers Plumbing'])
    fireEvent.click(only(c, '[data-testid="directory-chat-filter-trade"]'))
    // every repair provider now: the electrician too — and still three at a time
    expect(textOf(only(c, '[data-testid="directory-chat-count"]'))).toContain('目录里符合的有 4 家，先列 3 家')
    expect(c.querySelector('[data-testid="directory-chat-filters"]')).toBeNull()
    // the provider lists were read once; filtering happens here, as on the tab
    expect(db.calls).toEqual([['repairs']])
  })
  it('more than three: three first, then 「再看几位」 — the same order continued', async () => {
    const { container: c } = mount({ kind: 'repairs' })
    await ready(c)
    expect(DIRECTORY_CHAT_PAGE).toBe(3)
    expect(names(c).length).toBe(3)
    expect(textOf(only(c, '[data-testid="directory-chat-more"]'))).toBe('再看 1 家（还有 1 家）')
    fireEvent.click(only(c, '[data-testid="directory-chat-more"]'))
    expect(names(c)).toEqual(['[TEST] Maple Plumbing', 'Late Plumbing', 'No Papers Plumbing', 'Spark Electric'])
    expect(c.querySelector('[data-testid="directory-chat-more"]')).toBeNull()
  })
  it('an agent: filtered where the directory filters (its API), only agents who can be reached, each on the directory’s card', async () => {
    const { container: c } = mount({ kind: 'agents', language: 'zh', city: 'North York' }, 'tenant')
    await ready(c)
    expect(db.calls).toEqual([['agents', { language: 'zh', area: 'North York' }]])
    expect(names(c)).toEqual(['Amy Chen', '[TEST] Ben Li'])
    expect(all(c, '[data-testid="agent-card-brokerage"]').map(textOf)).toEqual(['Amy Chen Realty Inc., Brokerage', '[TEST] Ben Li Realty Inc., Brokerage'])
    expect(all(c, 'a[href^="mailto:"], a[href^="tel:"]')).toEqual([])
    expect(all(c, '[data-testid="directory-chat-filters"] button').map(textOf)).toEqual(['语言：普通话×', '区域：North York×'])
    expect(textOf(only(c, '[data-testid="directory-chat-basic"]'))).toContain('另有 1 位经纪只列了注册信息')
    expect(textOf(only(c, '[data-testid="directory-chat-note"]'))).toContain('不是 Stayloop 的推荐或背书')
    expect(only<HTMLAnchorElement>(c, '[data-testid="directory-chat-all"]').getAttribute('href')).toBe('/agents')
    // dropping the language asks the directory again, without it
    fireEvent.click(only(c, '[data-testid="directory-chat-filter-language"]'))
    await waitFor(() => expect(db.calls.length).toBe(2))
    expect(db.calls[1]).toEqual(['agents', { language: null, area: 'North York' }])
  })
  it('a professional: by licence, with the licence badge; no rating; not legal advice', async () => {
    const { container: c } = mount({ kind: 'professional', trade: 'paralegal' }, 'tenant')
    await ready(c)
    expect(db.calls).toEqual([['professional']])
    expect(names(c)).toEqual(['[TEST] Northside Paralegal'])
    expect(textOf(only(c, '[data-testid="professional-provider"] [data-testid="provider-card-badge"]'))).toBe('牌照已核')
    expect(c.querySelector('[data-testid="provider-rating"]')).toBeNull()
    expect(textOf(only(c, '[data-testid="directory-chat-note"]'))).toContain('这不是法律意见，也不是保险建议')
    expect(only<HTMLAnchorElement>(c, '[data-testid="directory-chat-all"]').getAttribute('href')).toBe('/providers/professional?trade=paralegal')
  })
  it('发消息 opens the directory’s own form beside the card — the person writes it; nothing is drafted or sent', async () => {
    const fetched: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (u: string) => { fetched.push(String(u)); return { ok: true, json: async () => ({}) } }))
    const a = mount({ kind: 'repairs', trade: 'plumbing' })
    await ready(a.container)
    const entry = all(a.container, '[data-testid="directory-chat-entry"]')[0]
    expect(a.container.querySelector('[data-testid="directory-chat-write"]')).toBeNull()
    fireEvent.click(only(entry, 'button[data-testid="provider-card-message"]'))
    expect(textOf(only(entry, '[data-testid="directory-chat-write"]'))).toContain('给 [TEST] Maple Plumbing 发消息')
    expect(only<HTMLTextAreaElement>(entry, '[data-testid="provider-contact-input"]').value).toBe('')
    expect(only<HTMLButtonElement>(entry, '[data-testid="provider-contact-send"]').disabled).toBe(true)
    fireEvent.click(only(entry, 'button[data-testid="provider-card-message"]'))
    expect(a.container.querySelector('[data-testid="directory-chat-write"]')).toBeNull()
    cleanup()
    // an agent, from a landlord's conversation: the form starts on 「我有房要出租」
    const b = mount({ kind: 'agents' }, 'landlord')
    await ready(b.container)
    fireEvent.click(all<HTMLButtonElement>(b.container, 'button[data-testid="agent-card-message"]')[0])
    const form = only(b.container, '[data-testid="agent-contact-form"]')
    expect(all(form, 'button').slice(0, 2).map((x) => [textOf(x), /font-semibold/.test(x.className)])).toEqual([['我想租房', false], ['我有房要出租', true]])
    expect(textOf(form)).toContain('这位经纪会收到你的显示名和登录邮箱')
    expect(fetched.filter((u) => u.includes('/contact'))).toEqual([])
    vi.unstubAllGlobals()
  })
  it('nobody matches: says so, and how to widen; a failed read is not 「nobody」', async () => {
    const a = mount({ kind: 'repairs', trade: 'pest' })
    await ready(a.container)
    expect(textOf(only(a.container, '[data-testid="directory-chat-empty"]'))).toContain('目录里暂时没有符合这些条件的')
    cleanup()
    db.fail = true
    const b = mount({ kind: 'repairs', trade: 'plumbing' })
    await waitFor(() => expect(card(b.container).dataset.state).toBe('failed'))
    expect(textOf(only(b.container, '[data-testid="directory-chat-failed"]'))).toContain('目录暂时读不出来，所以这里没有列出任何人')
    expect(b.container.querySelector('[data-testid="directory-chat-empty"]')).toBeNull()
    db.fail = false
    fireEvent.click(only(b.container, '[data-testid="directory-chat-failed"] button'))
    await ready(b.container)
    expect(names(b.container).length).toBe(3)
  })
  it('nobody signed in: no card, and nothing is read', () => {
    db.user = null
    const { container: c } = mount({ kind: 'repairs', trade: 'plumbing' })
    expect(c.querySelector('[data-testid="directory-chat-card"]')).toBeNull()
    expect(db.calls).toEqual([])
  })
  it('in English the card is English', async () => {
    localStorage.setItem('stayloop_lang', 'en')
    const { container: c } = mount({ kind: 'repairs', trade: 'plumbing' })
    await ready(c)
    await waitFor(() => expect(textOf(only(c, '[data-testid="directory-chat-count"]'))).toContain('in the directory match'))
    expect(textOf(card(c))).not.toMatch(/[一-鿿]/)
    expect(textOf(only(c, '[data-testid="directory-chat-filter-trade"]'))).toBe('Trade: Plumbing×')
  })
})
