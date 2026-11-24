// @vitest-environment jsdom
// V0.9 (2026-11-24, user: 「所有产品页面里的模块，都要能在 AI 对话里调用，也能用 AI 对话完成服务。是不是在产品页，
// 要加上 AI 对话的功能？或者用已经有的 AI 主对话？你研究一下怎么连接合适」).
// Found the same day, asking the anonymous preview one question per module: the conversation sent a
// landlord with a signed lease to a button that does not exist, said Stayloop has no public API, and
// promised to record rent it cannot record. Decided: one conversation (the person's own AI Agent),
// joined to the product list by lib/agent/productModules.ts — what a person says to start each
// module (shown on the product page, sent into the main conversation) and what the assistant is told
// about it (in its system prompt). A module on the product list that the conversation does not
// know fails here.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import React from 'react'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { all, only, textOf } from './helpers/dom'

const read = (p: string) => readFileSync(p, 'utf8')

const nav = vi.hoisted(() => ({ pushed: [] as string[], auth: { loading: false, user: null as null | { id: string }, role: null as string | null }, hats: { loading: false, tenant: true, landlord: false, agent: null as string | null, provider: null as string | null, admin: false } }))
vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => React.createElement('a', { href, ...rest }, children) }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: (h: string) => { nav.pushed.push(h) }, prefetch: () => {} }), usePathname: () => '/platform' }))
vi.mock('@/lib/useAdmin', () => ({ useAdmin: () => ({ role: null }) }))
vi.mock('@/lib/useHomeHref', () => ({ useHomeHref: () => ({ href: '/', onProvider: false, signedIn: false }) }))
vi.mock('@/lib/useAuth', () => ({ useAuth: () => nav.auth, roleStorageKey: (id: string) => `role:${id}`, roleFromPath: () => null }))
vi.mock('@/lib/useHats', () => ({ useHats: () => ({ ...nav.hats, refresh: async () => {} }) }))
vi.mock('@/components/Logo', () => ({ default: () => React.createElement('span', null, 'stayloop') }))
vi.mock('@/components/Header', () => ({ default: () => React.createElement('header') }))
vi.mock('@/lib/supabase', () => ({ supabase: { from: () => { throw new Error('no data is read in this spec') } } }))

import { I18nProvider } from '../lib/i18n'
import PlatformPage from '../app/platform/page'
import AskBar from '../components/agent/AskBar'
import { MODULES_IN_CHAT, moduleInChat, modulesUnknownToChat, productModulesGuide } from '../lib/agent/productModules'
import { buildSystemPrompt } from '../lib/agent/prompts'
import { PATH_RE, splitPaths } from '../lib/agent/replyPaths'
import { ASK_MAX, ASSISTANT_ROLES, assistantPromptHref } from '../lib/homeDeepLink'
import { PRODUCT_PAGE_MODULES } from '../lib/nav/siteNav'
import { DEFAULT_ASK_ROLE } from '../components/home/HeroComposer'

const wf = { workflow_type: 'general', workflow_id: null, current_stage: 'start', completed_steps: [], status: 'active' } as never
beforeEach(() => { localStorage.setItem('stayloop_lang', 'zh') })
afterEach(() => { cleanup(); nav.pushed.length = 0; nav.auth = { loading: false, user: null, role: null }; nav.hats = { loading: false, tenant: true, landlord: false, agent: null, provider: null, admin: false }; localStorage.clear(); sessionStorage.clear() })
const mount = (node: React.ReactElement) => render(<I18nProvider>{node}</I18nProvider>)
/** the site paths a prompt line names (not the MCP address, which is a full URL) */
const pathsIn = (line: string) => [...line.replace(/https?:\/\/\S+/g, ' ').matchAll(/(?<![\w/.-])\/[a-z][a-z0-9/-]*/g)].map((m) => m[0])

describe('every module on the product list is known to the conversation', () => {
  it('the product list and the conversation’s list are the same modules, in the same order', () => {
    expect(modulesUnknownToChat()).toEqual([])
    expect(MODULES_IN_CHAT.map((m) => m.href)).toEqual(PRODUCT_PAGE_MODULES.map((m) => m.href))
  })
  it('each has something to say to start it, and a line for each hat', () => {
    for (const m of MODULES_IN_CHAT) {
      expect(m.asks.length, m.href).toBeGreaterThan(0)
      expect(m.asks.length, m.href).toBeLessThanOrEqual(2)
      for (const r of ASSISTANT_ROLES) {
        expect(m.guide[r].length, `${m.href} ${r}`).toBeGreaterThan(20)
        expect(['finishes', 'guides', 'outside'], `${m.href} ${r}`).toContain(m.reach[r])
      }
    }
  })
  it('an ask is a question with nobody’s facts in it, so it can be sent on arrival', () => {
    for (const m of MODULES_IN_CHAT) for (const a of m.asks) {
      for (const said of [a.ask.zh, a.ask.en]) {
        expect(said.length, said).toBeLessThanOrEqual(ASK_MAX)
        // no template slot (a 【…】 text is never auto-sent), no address, date, amount or name
        expect(said, said).not.toMatch(/【|】|\$|\d|@/)
      }
      expect(a.ask.en, a.ask.en).not.toMatch(/[一-鿿]/)
      expect(ASSISTANT_ROLES, a.ask.en).toContain(a.role)
    }
  })
  it('what the record says about today: a tenant’s repair, and the lease import, are finished in the conversation', () => {
    const finishes = MODULES_IN_CHAT.flatMap((m) => ASSISTANT_ROLES.filter((r) => m.reach[r] === 'finishes').map((r) => `${m.href} ${r}`))
    // 租约与租金记录: the lease import card and the rent record card (both 2026-11-24); an agent's conversation records no rent
    expect(finishes).toEqual(['/leases/import tenant', '/leases/import landlord', '/leases/import agent', '/services tenant'])
    // …and the approval cards are still as the prompt says: a landlord's and an agent's conversation propose none
    // (the lease import card is a form the person submits, like the listing draft card — not a proposed action)
    const p = read('lib/agent/prompts.ts')
    expect(p).toContain("landlord: '2. 房东身份下你【不产出任何 proposed_action】")
    expect(p).toContain("agent: '2. 经纪身份下你【不产出任何 proposed_action】")
    expect(moduleInChat('/stayloop-api')!.reach).toEqual({ tenant: 'outside', landlord: 'outside', agent: 'outside' })
  })
})

describe('the assistant is told about each module', () => {
  it('the section is in every hat’s system prompt, one line per module, before the directory guide', () => {
    for (const role of ASSISTANT_ROLES) {
      const p = buildSystemPrompt(role, '', [], wf)
      const g = productModulesGuide(role)
      expect(p).toContain(g)
      expect(g.split('\n').filter((l) => l.startsWith('- ')).length).toBe(PRODUCT_PAGE_MODULES.length)
      expect(p.indexOf('# 产品模块')).toBeGreaterThan(-1)
      expect(p.indexOf('# 产品模块')).toBeLessThan(p.indexOf('# 找经纪 / 找服务商'))
    }
  })
  it('the two modules it did not know: where a signed lease is brought in, and that there is an API', () => {
    const landlord = productModulesGuide('landlord')
    expect(landlord).toContain('租约与租金记录 → /leases/import')
    expect(landlord).toContain('页面入口只有 /leases/import')
    for (const role of ASSISTANT_ROLES) {
      const g = productModulesGuide(role)
      expect(g).toContain('Stayloop 有开放 API,问到时【不要说没有】')
      expect(g).toContain('https://www.stayloop.ai/api/mcp')
      expect(g).toContain('七个端点')
      expect(g).toContain('第三档(合作方发起筛查)暂不开放')
    }
    // the numbers are the API page's own
    const api = read('app/stayloop-api/page.tsx')
    expect(api).toContain('七个端点 + 一个 MCP 端点')
    expect(api).toContain('https://www.stayloop.ai/api/mcp')
  })
  it('it is told what it cannot do: record rent, import a lease, fill a pack, dispatch a job', () => {
    expect(productModulesGuide('landlord')).toContain('你不能替他导入,也不能替他把某一期记成已收')
    for (const role of ASSISTANT_ROLES) expect(productModulesGuide(role)).toContain('系统会在你的回复下面放一张导入卡')
    for (const role of ['landlord', 'tenant'] as const) expect(productModulesGuide(role)).toContain('系统会在你的回复下面放一张记租金的卡')
    expect(productModulesGuide('agent')).not.toContain('记租金的卡')
    // the cards are the person's to confirm: the assistant is told it cannot see or confirm them
    expect(productModulesGuide('landlord')).toContain('由用户本人在卡上确认,你看不到卡上的内容,也不能替他确认')
    expect(productModulesGuide('landlord')).toContain('你不能在对话里替他派单')
    expect(productModulesGuide('tenant')).toContain('你不能替他填、替他分享')
    expect(productModulesGuide('tenant')).toContain('你不能替他导入或替他记')
    for (const role of ASSISTANT_ROLES) {
      const g = productModulesGuide(role)
      expect(g).toContain('不要说「登录后我可以替你……」这类你做不到的话')
      // Stayloop handles no money, reports to no bureau, and the words the site does not use stay out
      expect(g).not.toMatch(/代收|收租|上报|背调|助手|管家|即将/)
    }
    expect(productModulesGuide('landlord')).toContain('Stayloop 不经手资金')
    expect(productModulesGuide('landlord')).toContain('不是 LTB 表格')
  })
  it('every path a line names is a page, and turns into a link in the chat', () => {
    for (const role of ASSISTANT_ROLES) {
      const named = new Set(productModulesGuide(role).split('\n').flatMap(pathsIn))
      expect(named.size).toBeGreaterThan(5)
      for (const path of named) {
        expect(existsSync(`app${path}/page.tsx`), path).toBe(true)
        expect(splitPaths(`去 ${path} 看`).some((x) => typeof x !== 'string' && x.href === path), path).toBe(true)
      }
    }
    // longer paths sit before their prefixes
    const src = PATH_RE.source
    expect(src.indexOf('\\/stayloop-api\\/docs')).toBeLessThan(src.indexOf('\\/stayloop-api|'))
    expect(splitPaths('文档在 /stayloop-api/docs。')).toEqual(['文档在 ', { href: '/stayloop-api/docs' }, '。'])
    // the MCP address is a URL, not a site path: it stays text
    expect(splitPaths('地址 https://www.stayloop.ai/api/mcp')).toEqual(['地址 https://www.stayloop.ai/api/mcp'])
  })
})

describe('the product page leads into the one conversation', () => {
  it('an ask bar under the headline: the typed sentence goes to that role’s AI Agent page, sent on arrival', () => {
    const { container: c } = mount(<PlatformPage />)
    const bar = only(only(c, '[data-testid="platform-ask"]'), '[data-testid="platform-ask-bar"]')
    expect(only<HTMLSelectElement>(bar, 'select').value).toBe(DEFAULT_ASK_ROLE)
    expect(all(bar, 'option').map(textOf)).toEqual(['租客', '房东', '经纪'])
    fireEvent.change(only(bar, 'input'), { target: { value: '  我有一份签好的租约  ' } })
    fireEvent.submit(bar)
    expect(nav.pushed).toEqual([assistantPromptHref(DEFAULT_ASK_ROLE, '我有一份签好的租约')])
    expect(nav.pushed[0]).toMatch(/^\/landlord\/agent\?prompt=.*&send=1$/)
  })
  it('the role can be changed, and an empty submit opens that role’s conversation', () => {
    const { container: c } = mount(<AskBar zh />)
    const bar = only(c, '[data-testid="ask-bar"]')
    fireEvent.change(only(bar, 'select'), { target: { value: 'tenant' } })
    fireEvent.submit(bar)
    expect(nav.pushed).toEqual(['/tenant/agent'])
    expect(sessionStorage.getItem('sl-home-ask-role')).toBe('tenant')
  })
  it('signed in, it asks as the hat the person wears — never as a hat they do not hold', () => {
    nav.auth = { loading: false, user: { id: 'u1' }, role: null }
    nav.hats = { loading: false, tenant: true, landlord: false, agent: null, provider: null, admin: false }
    const { container: c } = mount(<AskBar zh />)
    expect(only<HTMLSelectElement>(c, 'select').value).toBe('tenant')
  })
  it('under each module: the sentences that start it, each a link into the conversation as that role', () => {
    const { container: c } = mount(<PlatformPage />)
    const cards = all(c, '[data-testid="platform-module-card"]')
    const listed = PRODUCT_PAGE_MODULES.filter((m) => m.href !== '/stayloop-api')
    expect(cards.length).toBe(listed.length)
    cards.forEach((card, i) => {
      const m = moduleInChat(listed[i].href)!
      const links = all<HTMLAnchorElement>(only(card, '[data-testid="platform-module-asks"]'), '[data-testid="platform-module-ask"]')
      expect(links.map((a) => a.getAttribute('href'))).toEqual(m.asks.map((a) => assistantPromptHref(a.role, a.ask.zh)))
      expect(links.map((a) => a.getAttribute('data-role'))).toEqual(m.asks.map((a) => a.role))
      for (const [k, a] of links.entries()) expect(textOf(a)).toContain(`「${m.asks[k].ask.zh}」`)
    })
    // the API block: the MCP address other AI conversations use, and the sentence for ours
    const api = only(c, '[data-testid="platform-api"]')
    expect(textOf(only(api, '[data-testid="platform-api-mcp"]'))).toContain('https://www.stayloop.ai/api/mcp')
    expect(all<HTMLAnchorElement>(api, '[data-testid="platform-module-ask"]').map((a) => a.getAttribute('href'))).toEqual(moduleInChat('/stayloop-api')!.asks.map((a) => assistantPromptHref(a.role, a.ask.zh)))
  })
  it('no link on the page goes to a second conversation: every ask lands on a role’s AI Agent page', () => {
    const { container: c } = mount(<PlatformPage />)
    const asks = all<HTMLAnchorElement>(c, '[data-testid="platform-module-ask"]')
    expect(asks.length).toBe(MODULES_IN_CHAT.reduce((n, m) => n + m.asks.length, 0))
    for (const a of asks) expect(a.getAttribute('href') ?? '', a.getAttribute('href') ?? '').toMatch(/^\/(tenant|landlord|agent)\/agent\?prompt=[^&]+&send=1$/)
    const s = read('app/platform/page.tsx')
    expect(s).not.toMatch(/api\/agent\/turn|useAgentSession|AgentChat/)
    expect(read('components/agent/AskBar.tsx')).not.toMatch(/api\/agent\/turn|useAgentSession|AgentChat|fetch\(/)
  })
  it('in English the sentences are English', () => {
    localStorage.setItem('stayloop_lang', 'en')
    const { container: c } = mount(<PlatformPage />)
    const asks = all<HTMLAnchorElement>(c, '[data-testid="platform-module-ask"]')
    for (const a of asks) expect(textOf(a), textOf(a)).not.toMatch(/[一-鿿「」]/)
    expect(asks[0].getAttribute('href')).toBe(assistantPromptHref('tenant', MODULES_IN_CHAT[0].asks[0].ask.en))
    expect(only<HTMLInputElement>(only(c, '[data-testid="platform-ask-bar"]'), 'input').placeholder).toBe('Tell the AI Agent what you need')
  })
})
