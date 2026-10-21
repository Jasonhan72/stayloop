// @vitest-environment jsdom
// V1.0 stage 5 · G18 (2026-10-16): the open API's documentation, marketing page,
// Terms clauses and pricing page (design/open-api-contract-2026-10.md「文档与条款」,
// design/research/v1/open-api-2026-10.md D4-6).
//
// - lib/legal/terms.ts: API_CLAUSES (seven clauses) and TERMS_VERSION 2026-10-16
//   (every account re-accepts once).
// - /terms renders the seven clauses as its own numbered section.
// - /stayloop-api/docs renders tier 1 from OPENAPI_ENDPOINTS and the MCP tools
//   from MCP_TOOLS; limit numbers come from lib/api/v1Limits, never typed by hand.
// - /stayloop-api: seven endpoints + one MCP endpoint, free, keyless; no prices,
//   no live-listing claims, no MLS.
// - /pricing: the landlord Business tier has no feature list; an API section
//   lists tier 1 (free, keyless → docs) and an institutional tier (contact us);
//   the agent paid tiers stay "coming soon".
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import React from 'react'
import { act, cleanup, render } from '@testing-library/react'
import { all, only, textOf } from './helpers/dom'
import { API_CLAUSES, LISTING_DATA_CLAUSES, TERMS_VERSION } from '../lib/legal/terms'

vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => React.createElement('a', { href, ...rest }, children) }))
vi.mock('@/components/Header', () => ({ default: () => React.createElement('header') }))
vi.mock('@/components/Footer', () => ({ default: () => React.createElement('footer') }))
vi.mock('@/lib/i18n', () => ({ useT: () => ({ lang: 'zh', t: (_k: string, fb?: string) => fb ?? '' }) }))

const read = (p: string) => readFileSync(p, 'utf8')
const code = (p: string) => read(p).split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')

afterEach(cleanup)

describe('API_CLAUSES — the seven D4-6 clauses', () => {
  it('seven bilingual clauses, in D4-6 order', () => {
    expect(API_CLAUSES).toHaveLength(7)
    for (const c of API_CLAUSES) {
      expect(c.zh.length).toBeGreaterThan(20)
      expect(c.en.length).toBeGreaterThan(20)
    }
    const zh = API_CLAUSES.map((c) => c.zh)
    expect(zh[0]).toMatch(/^许可范围/)
    expect(zh[1]).toMatch(/^署名/)
    expect(zh[2]).toMatch(/^个人信息/)
    expect(zh[3]).toMatch(/^禁止/)
    expect(zh[4]).toMatch(/^筛查/)
    expect(zh[5]).toMatch(/^可用性/)
    expect(zh[6]).toMatch(/^责任/)
  })
  it('says what the research asked for: no model training, attribution, registration, 90 days, Ontario law', () => {
    const all = API_CLAUSES.map((c) => `${c.zh}\n${c.en}`).join('\n')
    expect(all).toContain('不得用于训练模型')
    expect(all).toContain('attribution')
    expect(all).toContain('注册')
    expect(all).toContain('90 天')
    expect(all).toMatch(/train models/)
    expect(all).toMatch(/90 days/)
    expect(all).toMatch(/Consumer Reporting Act/)
    expect(all).toMatch(/安省法律|laws of Ontario/)
    expect(all).toMatch(/人权法典|Human Rights Code/)
    expect(all).toMatch(/不得持久化|may not be persisted/)
    expect(all).toMatch(/停用|disable/)
    // plain language: no 文言 filler, and the CMHC / StatCan sources are named for the attribution clause
    expect(all).not.toMatch(/诸事|托付|定夺|凡.*均/)
    expect(API_CLAUSES[1].zh).toMatch(/CMHC/)
    expect(API_CLAUSES[1].zh).toMatch(/统计局/)
  })
  it('the version is 2026-10-16 and the listing-data clauses are untouched', () => {
    expect(TERMS_VERSION).toBe('2026-10-16')
    expect(LISTING_DATA_CLAUSES).toHaveLength(8)
  })
})

describe('/terms renders the API usage rules', () => {
  it('has a numbered section after the existing ones, listing all seven clauses from API_CLAUSES', async () => {
    const { default: TermsPage } = await import('../app/terms/page')
    let r!: ReturnType<typeof render>
    await act(async () => { r = render(React.createElement(TermsPage)) })
    const list = only(r.container, '[data-testid="terms-api-rules"]')
    const items = all(list, 'li')
    expect(items).toHaveLength(7)
    items.forEach((li, i) => expect(textOf(li)).toBe(API_CLAUSES[i].zh))
    const heads = all(r.container, 'h2').map(textOf)
    expect(heads).toContain('7 · API 使用规则')
    expect(heads.indexOf('7 · API 使用规则')).toBe(heads.length - 1)
    expect(textOf(r.container)).toContain(`${TERMS_VERSION} 版`)
    r.unmount()
  })
  it('the consent gate keeps reading TERMS_VERSION from the module (a bump re-asks every account) and still lists the listing-data rules', () => {
    const gate = read('components/legal/TermsConsentGate.tsx')
    expect(gate).toContain('TERMS_VERSION')
    expect(gate).not.toMatch(/'2026-10-1\d'/)
    expect(gate).toContain('LISTING_DATA_CLAUSES.map')
    expect(gate).toContain('hasAcceptedCurrentTerms(auth.user)')
  })
})

describe('/stayloop-api/docs renders from the API objects', () => {
  const src = read('app/stayloop-api/docs/page.tsx')
  it('imports OPENAPI_ENDPOINTS, MCP_TOOLS, API_VERSION and the limits table', () => {
    expect(src).toContain("import { OPENAPI_ENDPOINTS } from '@/lib/api/openapi'")
    expect(src).toContain("import { MCP_TOOLS } from '@/lib/mcp/tools'")
    expect(src).toContain("from '@/lib/api/v1Http'")
    expect(src).toContain("import { V1_LIMITS } from '@/lib/api/v1Limits'")
    expect(src).toMatch(/ENDPOINTS\.map\(/)
    expect(src).toMatch(/TOOLS\.map\(/)
    expect(src).toContain('e.exampleCurl')
    expect(src).toContain('e.summary.zh')
  })
  it('conventions: date version header, one error body, limits from the table, as_of / boundary / attribution, openapi.json', () => {
    expect(src).toContain('x-api-version')
    expect(src).toContain('{ error, message, retry_after? }')
    expect(src).toContain('X-Client-Id')
    expect(src).toContain('V1_LIMITS.perKeyPerHour')
    expect(src).toContain('V1_LIMITS.perEndpointPerHour')
    expect(src).toContain('V1_LIMITS.mcpPerIpPerHour')
    expect(src).toContain('as_of')
    expect(src).toContain('boundary')
    expect(src).toContain('attribution')
    expect(src).toContain('/openapi.json')
    // no hand-typed hourly limit anywhere in the source (the stage-1 page said "120/h")
    const body = code('app/stayloop-api/docs/page.tsx')
    expect(body).not.toMatch(/\d+ ?\/ ?(h|小时|分钟|min)\b/)
    expect(body).not.toMatch(/每小时 \d/)
    expect(body).not.toMatch(/\d+ requests (an|per) hour/)
    // the limit values themselves never appear as literals (Tailwind tokens like amber-300 are not numbers in prose)
    expect(body).not.toMatch(/(?<![-\w#.])(120|300|5000|600)(?![\w-])/)
  })
  it('MCP section: the endpoint, Streamable HTTP, no auth, and the three ways to connect', () => {
    expect(src).toContain('https://www.stayloop.ai/api/mcp')
    expect(src).toContain('Streamable HTTP')
    expect(src).toContain('claude mcp add --transport http stayloop https://www.stayloop.ai/api/mcp')
    expect(src).toContain('"mcpServers"')
    expect(src).toMatch(/添加自定义连接器|Add custom connector/)
    expect(src).toMatch(/"method":"initialize"/)
    expect(src).toContain('data-testid="mcp-tools"')
    expect(src).not.toMatch(/筹备中|in preparation/)
  })
  it('tier 2 and tier 3 keep their wording; the AI-client note gains the boundary sentence', () => {
    expect(src).toContain('POST /passport/verify')
    expect(src).toContain('POST /screen')
    expect(src).toContain('"error": "partner_screening_closed"')
    expect(src).toContain('同意基础：申请人勾选范围即 PIPEDA 原则 4.3 的知情同意')
    expect(src).toContain('暂不接受调用（503）。向合作方提供关于申请人的筛查报告，正是《消费者报告法》要求注册才能做的事')
    expect(src).toContain('以上工具与端点只做确定性规则与日期算术，不是法律意见。')
    expect(src).toContain('不允许：留存响应、为响应建索引、把响应用于训练模型')
  })
})

describe('/stayloop-api marketing page', () => {
  const src = code('app/stayloop-api/page.tsx')
  it('tier 1 is seven endpoints + one MCP endpoint, free and keyless; five facts', () => {
    expect(src).toContain('七个端点 + 一个 MCP 端点')
    expect(src).toContain('Seven endpoints + one MCP endpoint')
    expect(src).toContain('免费 · 无需密钥')
    expect(src).toContain('data-testid="tier1-facts"')
    for (const t of ["zh: '规则'", "zh: '合规检查'", "zh: '日期算术'", "zh: '租金基准'", "zh: 'MCP'"]) expect(src).toContain(t)
    expect(src).toContain('CMHC')
    expect(src).toContain('统计局')
    expect(src).toContain('/stayloop-api/docs#mcp')
  })
  it('no prices, no live-listing claims, no MLS, no hand-typed limits, no "in preparation"', () => {
    expect(src).not.toMatch(/实时挂牌|MLS|TRREB/)
    expect(src).not.toMatch(/\$ ?\d|CA\$|\/ ?月|per month|价格|pricing tier/)
    expect(src).not.toMatch(/\d+ ?\/ ?(h|小时|分钟|min)\b|每 IP 120|120\/h/)
    expect(src).not.toMatch(/筹备中|in preparation/)
  })
})

describe('/pricing', () => {
  const src = read('app/pricing/page.tsx')
  const landlord = src.slice(src.indexOf("key: 'landlord'"), src.indexOf("key: 'agent'"))
  const business = landlord.slice(landlord.indexOf("name: { zh: '团队', en: 'Business' }"))
  it('the landlord Business tier has no feature list, says the list is to be decided, and the CTA is contact us', () => {
    expect(business).not.toMatch(/features:/)
    expect(business).toContain('功能清单待定，等有真实团队需求再定')
    expect(business).toContain("cta: { zh: '联系我们', en: 'Contact us' }")
    expect(business).toContain("href: '/contact'")
    expect(src).toContain('data-testid="tier-note"')
    expect(landlord).not.toMatch(/多成员协作|Portfolio dashboard|优先支持/)
  })
  it('the API section lists tier 1 (free, keyless → docs) and an institutional tier (contact us)', () => {
    expect(src).toContain('data-testid="pricing-api"')
    expect(src).toContain('data-testid="pricing-api-tier1"')
    expect(src).toContain('data-testid="pricing-api-institutional"')
    const api = src.slice(src.indexOf('data-testid="pricing-api"'), src.indexOf('{/* Compliance explainer'))
    expect(api).toContain('免费 · 无需密钥')
    expect(api).toContain('href="/stayloop-api/docs"')
    expect(api).toContain('href="/contact"')
    expect(api).toContain('七个端点 + 一个 MCP 端点')
    expect(api).toContain('CMHC')
    expect(api).not.toMatch(/\$\d/)
    expect(api).not.toMatch(/三个端点|Three endpoints/)
  })
  it('the agent paid tiers are still coming soon', () => {
    const agent = src.slice(src.indexOf("key: 'agent'"))
    expect(agent).toContain("price: { zh: '$29', en: '$29' }")
    expect(agent).toContain("price: { zh: '$59', en: '$59' }")
    expect((agent.match(/cta: \{ zh: '即将推出', en: 'Coming soon' \}/g) || []).length).toBe(2)
  })
  it('the pricing page renders the Business note instead of a list', async () => {
    const { default: PricingPage } = await import('../app/pricing/page')
    let r!: ReturnType<typeof render>
    await act(async () => { r = render(React.createElement(PricingPage)) })
    const notes = all(r.container, '[data-testid="tier-note"]')
    expect(notes).toHaveLength(1)
    expect(textOf(notes[0])).toContain('功能清单待定')
    expect(all(r.container, '[data-testid="pricing-api-tier1"]')).toHaveLength(1)
    r.unmount()
  })
})
