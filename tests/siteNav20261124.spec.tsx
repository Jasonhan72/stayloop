// @vitest-environment jsdom
// V0.9 (2026-11-24, user, with a screenshot of the header row and one of the footer's 产品 column:
// 「检查一下所有的模块，现在 2 个地方的产品页面不一样，把头部菜单里的产品这个和 footer 的统一一下，有些不是这个里面的
// 可以单独出来。你研究一下再确定怎么优化和统一」).
// What was found: 「产品」 in the header was one link to /platform; 「产品」 in the footer was nine links
// mixing an overview, real modules, a free tool page, the price list and a page that is a demo
// throughout; /platform itself still listed online rent collection and "three endpoints".
// What it is now: one list of product modules (lib/nav/siteNav.ts). The footer's 产品 column shows
// it; the product page /platform presents each module in a block of its own; and there is a
// separate 资源 list for what is not a product. The header's 「产品」 is a link to that page — for a
// few hours it opened the list as a menu, until the user said (twice) that 房源 and 租客筛查 are
// already in the header row and must not appear on the product page, and that the menu's items
// belong inside the page: 「把这个产品单独为一个页面，这些菜单项放在产品页面里，你要重新设计一下产品页面的 UI」.
// That left the footer with no link to either. Asked whether the footer should keep the two in a
// column of their own, the user said 「单独放一栏」: a fifth group, 常用入口, never under 「产品」.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import React from 'react'
import { cleanup, render } from '@testing-library/react'
import { all, only, textOf } from './helpers/dom'

const read = (p: string) => readFileSync(p, 'utf8')

const state = vi.hoisted(() => ({ admin: null as string | null }))
vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => React.createElement('a', { href, ...rest }, children) }))
vi.mock('@/lib/useAdmin', () => ({ useAdmin: () => ({ role: state.admin }) }))
vi.mock('@/lib/useHomeHref', () => ({ useHomeHref: () => ({ href: '/', onProvider: false, signedIn: false }) }))
vi.mock('@/components/Logo', () => ({ default: () => React.createElement('span', null, 'stayloop') }))
vi.mock('@/components/Header', () => ({ default: () => React.createElement('header') }))
vi.mock('@/lib/supabase', () => ({ supabase: { from: () => { throw new Error('no data is read in this spec') } } }))
// the product page carries an ask bar (components/agent/AskBar) that reads who is signed in and navigates on submit
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {}, prefetch: () => {} }), usePathname: () => '/platform' }))
vi.mock('@/lib/useAuth', () => ({ useAuth: () => ({ loading: false, user: null, role: null }), roleStorageKey: (id: string) => `role:${id}`, roleFromPath: () => null }))
vi.mock('@/lib/useHats', () => ({ useHats: () => ({ loading: false, tenant: false, landlord: false, agent: null, provider: null, admin: false, refresh: async () => {} }) }))

import { I18nProvider } from '../lib/i18n'
import Footer from '../components/Footer'
import PlatformPage from '../app/platform/page'
import ImportIntro, { IMPORT_STEPS } from '../components/household/ImportIntro'
import { COMPANY_NAV, FOOTER_CELLS, FOOTER_GROUPS, PRODUCT_NAV, PRODUCT_PAGE_MODULES, RESOURCE_NAV, ROLE_NAV, SHORTCUT_NAV } from '../lib/nav/siteNav'

// the real dictionary, in Chinese: the provider paints its default and then follows the stored choice
beforeEach(() => { localStorage.setItem('stayloop_lang', 'zh') })
afterEach(() => { cleanup(); state.admin = null; localStorage.clear() })
const mount = (node: React.ReactElement) => render(<I18nProvider>{node}</I18nProvider>)
const group = (c: ParentNode, k: string) => all<HTMLAnchorElement>(only(c, `[data-testid="foot-group-${k}"]`), 'a').map((a) => [a.getAttribute('href'), textOf(a)])

describe('one list of product modules', () => {
  it('six of them, in the order a tenancy meets them, the product page first; every one has a page', () => {
    expect(PRODUCT_NAV.map((m) => [m.key, m.href])).toEqual([
      ['foot.platform', '/platform'],
      ['foot.passport', '/tenant/passport'],
      ['foot.leases', '/leases/import'],
      ['foot.services', '/services'],
      ['foot.findAgent', '/agents'],
      ['foot.stayloopApi', '/stayloop-api'],
    ])
    for (const m of [...PRODUCT_NAV, ...RESOURCE_NAV, ...ROLE_NAV, ...COMPANY_NAV]) expect(existsSync(`app${m.href}/page.tsx`), m.href).toBe(true)
    for (const m of PRODUCT_NAV) { expect(m.desc.zh.length, m.key).toBeGreaterThan(5); expect(m.desc.en, m.key).not.toMatch(/[一-鿿]/) }
  })
  it('what is not a product is not on it: the price list, the free tools, the rule book and the demo page are 资源', () => {
    expect(RESOURCE_NAV.map((m) => [m.key, m.href, m.tag ?? null])).toEqual([['foot.pricing', '/pricing', null], ['foot.tools', '/tools', null], ['foot.rules', '/rules', null], ['foot.disputes', '/disputes', 'demo']])
    const products = PRODUCT_NAV.map((m) => m.href)
    for (const r of RESOURCE_NAV) expect(products, r.href).not.toContain(r.href)
    // /disputes has no backend at all; it is the only link that carries the demo mark
    expect(read('app/disputes/page.tsx')).toContain('纯示范页')
    expect([...PRODUCT_NAV, ...ROLE_NAV, ...COMPANY_NAV].filter((m) => (m as { tag?: string }).tag)).toEqual([])
  })
  it('nothing here promises what Stayloop does not do', () => {
    const s = read('lib/nav/siteNav.ts').split('\n').filter((l) => !l.trim().startsWith('//')).join('\n')
    expect(s).not.toMatch(/收租|背调|助手|管家|上报|即将|免费|payments/)
  })
})

describe('the footer', () => {
  it('five columns: 产品 is the product list, word for word; 常用入口 and 资源 stand apart', () => {
    const { container: c } = mount(<Footer />)
    expect(all(c, 'footer h4').map(textOf)).toEqual(['产品', '常用入口', '为谁打造', '资源', '公司'])
    expect(group(c, 'product')).toEqual([
      ['/platform', '产品总览'], ['/tenant/passport', '租客护照'], ['/leases/import', '租约与租金记录'], ['/services', '维修与服务网络'], ['/agents', '找经纪 · 服务商'], ['/stayloop-api', 'Stayloop API'],
    ])
    expect(group(c, 'resources')).toEqual([['/pricing', '定价'], ['/tools', '租房小工具'], ['/rules', '安省租房规则'], ['/disputes', '争议解决']])
    // the demo page says so beside its link, and only there
    expect(all(c, '[data-testid="foot-demo-tag"]').map(textOf)).toEqual(['示范'])
    expect(only(c, '[data-testid="foot-demo-tag"]').previousElementSibling?.getAttribute('href')).toBe('/disputes')
  })
  it('为谁打造 is the four doors of the header’s 「我是」 menu, in the same order; 合作伙伴 is company', () => {
    const { container: c } = mount(<Footer />)
    expect(group(c, 'forWhom')).toEqual([['/tenant', '租客'], ['/landlord', '房东'], ['/agent', '经纪'], ['/services', '服务商']])
    const doors = (read('components/Header.tsx').match(/const PRODUCT_ITEMS[\s\S]*?\n\]/)?.[0] ?? '').match(/href: '[^']+'/g)?.map((h) => h.slice(7, -1))
    expect(doors).toEqual(ROLE_NAV.map((r) => r.href))
    expect(group(c, 'company')).toEqual([['/about', '关于'], ['/partners', '合作伙伴'], ['/contact', '联系'], ['/privacy', '隐私'], ['/terms', '使用条款'], ['/consumer-rights', '消费者权利']])
  })
  it('常用入口 is the header row’s two destinations, under the header’s own words, and nothing else', () => {
    // 2026-11-24, user, asked whether the footer should keep the two links in a column of their own: 「单独放一栏」
    const { container: c } = mount(<Footer />)
    expect(group(c, 'shortcuts')).toEqual([['/listings', '房源'], ['/screening', '租客筛查']])
    expect(SHORTCUT_NAV.map((m) => [m.key, m.href])).toEqual([['foot.listings', '/listings'], ['foot.screening', '/screening']])
    const dict = read('lib/i18n.tsx')
    for (const [foot, nav] of [['foot.listings', 'nav.listings'], ['foot.screening', 'nav.screening']]) {
      const words = (k: string) => dict.match(new RegExp(`'${k.replace('.', '\\.')}': (\\{[^}]+\\})`))?.[1]
      expect(words(foot), foot).toBeTruthy()
      expect(words(foot), foot).toBe(words(nav))
    }
    for (const m of SHORTCUT_NAV) expect(existsSync(`app${m.href}/page.tsx`), m.href).toBe(true)
  })
  it('below `lg` the two short groups share a cell, so the groups still sit two by two; from `lg` each is a column', () => {
    expect(FOOTER_CELLS.map((cell) => cell.map((g) => g.titleKey))).toEqual([['foot.product'], ['foot.shortcuts', 'foot.forWhom'], ['foot.resources'], ['foot.company']])
    expect(FOOTER_CELLS.flat()).toEqual(FOOTER_GROUPS)
    const { container: c } = mount(<Footer />)
    const pair = only(c, '[data-testid="foot-cell-pair"]')
    expect(all(pair, 'h4').map(textOf)).toEqual(['常用入口', '为谁打造'])
    expect(pair.className).toContain('lg:contents')
    const f = read('components/Footer.tsx')
    // the brand has a row of its own at `lg` (five columns and the brand do not fit 1024), and joins the row from `xl`
    expect(f).toContain('lg:grid-cols-[1.3fr_0.8fr_0.8fr_1.1fr_0.9fr]')
    expect(f).toContain('xl:grid-cols-[1.4fr_1.3fr_0.8fr_0.8fr_1.1fr_0.9fr]')
    expect(f).toContain('className="col-span-2 lg:col-span-5 xl:col-span-1"')
  })
  it('后台管理 shows for an administrator only; the version label is untouched', () => {
    state.admin = 'admin'
    const { container: c } = mount(<Footer />)
    expect(group(c, 'company').map((l) => l[0])).toContain('/admin')
    expect(read('components/Footer.tsx')).toContain('>V0.8<')
  })
  it('the footer keeps no list of its own', () => {
    const f = read('components/Footer.tsx')
    expect(f).toContain("import { FOOTER_CELLS, type FooterGroup } from '@/lib/nav/siteNav'")
    expect(f).not.toMatch(/href: '\//)
    expect(f).not.toMatch(/href="\//)
    expect(FOOTER_GROUPS.map((g) => g.titleKey)).toEqual(['foot.product', 'foot.shortcuts', 'foot.forWhom', 'foot.resources', 'foot.company'])
    expect(FOOTER_GROUPS[0].links).toBe(PRODUCT_NAV)
    expect(FOOTER_GROUPS[1].links).toBe(SHORTCUT_NAV)
  })
})

describe('the header', () => {
  const h = read('components/Header.tsx')
  it('the row is the same five — 我是 · 产品 · 房源 · 定价 · 租客筛查 — and 「产品」 is a link to the product page', () => {
    // 2026-11-24, later the same day: 「房源和租客筛查去掉，因为在 hero 的菜单里已经有了…把这个产品单独为一个页面，这些菜单项放在产品页面里」
    const nav = h.slice(h.indexOf('<nav className="hidden items-center gap-[26px] lg:flex">'), h.indexOf('</nav>'))
    const order = ['data-testid="nav-identity"', 'i18nKey="nav.platform" href="/platform"', 'i18nKey="nav.listings"', 'i18nKey="nav.pricing"', 'i18nKey="nav.screening"'].map((k) => nav.indexOf(k))
    expect(order.every((i) => i > -1)).toBe(true)
    expect([...order].sort((x, y) => x - y)).toEqual(order)
    expect((nav.match(/<NavLink /g) || []).length).toBe(4)
    // no menu hangs off it, and the header keeps no copy of the product list
    expect(h).not.toMatch(/ProductMenu|nav-products|PRODUCT_NAV|siteNav/)
  })
  it('房源 and 租客筛查 are the row’s own items and are on no 「产品」 list: not the page’s, not the footer’s 产品 column', () => {
    for (const list of [PRODUCT_NAV, PRODUCT_PAGE_MODULES, RESOURCE_NAV]) for (const m of list) expect(m.href, m.href).not.toMatch(/^\/(listings|screening)/)
    expect(PRODUCT_PAGE_MODULES.map((m) => m.href)).toEqual(['/tenant/passport', '/leases/import', '/services', '/agents', '/stayloop-api'])
    expect(PRODUCT_NAV.map((m) => m.href)).toEqual(['/platform', ...PRODUCT_PAGE_MODULES.map((m) => m.href)])
    for (const list of [ROLE_NAV, COMPANY_NAV]) for (const m of list) expect(m.href, m.href).not.toMatch(/^\/(listings|screening)/)
    // the footer links each once, and only in the column of their own
    const { container: c } = mount(<Footer />)
    expect(all<HTMLAnchorElement>(c, 'footer a').map((a) => a.getAttribute('href')).filter((x) => /^\/(listings|screening)/.test(x ?? ''))).toEqual(['/listings', '/screening'])
    expect(all<HTMLAnchorElement>(only(c, '[data-testid="foot-group-shortcuts"]'), 'a').length).toBe(2)
    expect(group(c, 'product').map((l) => l[0]).filter((x) => /^\/(listings|screening)/.test(x ?? ''))).toEqual([])
  })
})

describe('/platform is the product, on one page', () => {
  it('every module of the product page has a block of its own, in the list’s order, each with its door', () => {
    const { container: c } = mount(<PlatformPage />)
    expect(all<HTMLAnchorElement>(c, '[data-testid="platform-module"]').map((a) => a.getAttribute('href'))).toEqual(PRODUCT_PAGE_MODULES.map((m) => m.href))
    const cards = all(c, '[data-testid="platform-module-card"]')
    expect(cards.map((x) => textOf(only(x, 'h2')))).toEqual(['租客护照', '租约与租金记录', '维修与服务网络', '找经纪 · 服务商'])
    for (const card of cards) {
      expect(all(card, 'ul li').length, textOf(only(card, 'h2'))).toBe(3)
      expect(all(card, '[data-testid="platform-module-who"] span span').length).toBeGreaterThan(0)
    }
    // the API is the fifth module, presented as the second product
    expect(textOf(only(only(c, '[data-testid="platform-api"]'), 'h2'))).toBe('Stayloop API')
    expect(only<HTMLAnchorElement>(only(c, '[data-testid="platform-api"]'), '[data-testid="platform-module"]').getAttribute('href')).toBe('/stayloop-api')
  })
  it('the menu items sit at the top of the page as jump links to those blocks', () => {
    const { container: c } = mount(<PlatformPage />)
    const jump = all<HTMLAnchorElement>(c, '[data-testid="platform-jump"] a')
    expect(jump.map((a) => [a.getAttribute('href'), textOf(a)])).toEqual([['#passport', '租客护照'], ['#leases', '租约与租金记录'], ['#services', '维修与服务网络'], ['#directory', '找经纪 · 服务商'], ['#api', 'Stayloop API'], ['#lifecycle', '整条流程']])
    for (const a of jump) expect(c.querySelector(a.getAttribute('href')!), a.getAttribute('href')!).not.toBeNull()
  })
  it('房源 and 租客筛查 are in the header row and nowhere on this page — not as blocks, not as jump links, not inside the flow', () => {
    // user, 2026-11-24, said twice: 「房源和租客筛选已经在头部菜单里有了，不要再放进产品页面里了」
    const { container: c } = mount(<PlatformPage />)
    const own = all<HTMLAnchorElement>(c, 'a').filter((a) => !a.closest('footer'))
    const hrefs = own.map((a) => a.getAttribute('href') ?? '')
    for (const h of hrefs) expect(h, h).not.toMatch(/^\/(listings|screening)(\/|$)|^\/dashboard\/listings/)
    expect(own.map(textOf).filter((x) => /^(房源|租客筛查)/.test(x))).toEqual([])
    for (const block of [...all(c, '[data-testid="platform-module-card"]'), only(c, '#lifecycle')]) expect(textOf(block)).not.toMatch(/租客筛查|房源发布|在线申请|看房请求|对话找房/)
    const s = read('app/platform/page.tsx')
    expect(s).not.toMatch(/href: '\/(listings|screening|dashboard\/listings\/new|tenant\/agent)'/)
    // the stage that used to be about them now lists what else happens before a lease
    expect(all<HTMLAnchorElement>(only(c, '#lifecycle'), 'a').slice(0, 3).map((a) => a.getAttribute('href'))).toEqual(['/tenant/passport', '/agents', '/rules'])
  })
  it('the resources are a row of their own, the demo page marked', () => {
    const { container: c } = mount(<PlatformPage />)
    const res = only(c, '[data-testid="platform-resources"]')
    expect(all<HTMLAnchorElement>(res, 'a').map((a) => a.getAttribute('href'))).toEqual(RESOURCE_NAV.map((r) => r.href))
    expect(all<HTMLAnchorElement>(res, 'a').map(textOf)).toEqual(['定价', '租房小工具', '安省租房规则', '争议解决示范'])
  })
  it('each block says only what exists', () => {
    const s = read('app/platform/page.tsx')
    expect(s).not.toMatch(/在线收租|Online rent collection|\/tenant\/payments/)
    expect(s).not.toMatch(/三个端点|three endpoints/)
    expect(s).toContain('第三档 · 合作方发起筛查：Stayloop 完成《消费者报告法》注册前暂不开放')
    expect(s).toContain('第一档 · 七个端点和一个 MCP 端点')
    expect(s).toContain("href: '/agents' },")
    expect(s).toContain("href: '/providers' },")
    // the pilot is called a pilot, money never passes through, the order is not for sale
    expect(s).toContain("note: { zh: '试点 · 多伦多及周边', en: 'Pilot · Toronto and nearby' }")
    expect(s).toContain('Stayloop 不经手资金')
    expect(s).toContain('排序固定，不排名，也不收排名费')
    const code = s.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n')
    expect(code).not.toMatch(/助手|管家|背调|催收|上报|按时收租|验证一次|实时挂牌/)
  })
  it('it sits on the directory’s ground and uses its surfaces; English carries no Chinese in the module blocks', () => {
    const s = read('app/platform/page.tsx')
    expect(s).toContain('<div style={{ background: FIND_GROUND }} className="text-body">')
    expect(s).toContain('className={`${PANEL} flex scroll-mt-24 flex-col`}')
    localStorage.setItem('stayloop_lang', 'en')
    const { container: c } = mount(<PlatformPage />)
    return new Promise<void>((done) => setTimeout(() => {
      for (const card of all(c, '[data-testid="platform-module-card"]')) expect(card.textContent, card.textContent ?? '').not.toMatch(/[一-鿿]/)
      expect(only(c, '[data-testid="platform-api"]').textContent).not.toMatch(/[一-鿿]/)
      done()
    }, 0))
  })
})

describe('租约与租金记录 is on the list because its page says what it is to a visitor', () => {
  it('signed out, /leases/import is the module in three steps and a way in — not one line asking to sign in', () => {
    const page = read('app/leases/import/page.tsx')
    expect(page).toContain('<ImportIntro zh={zh} />')
    expect(page).not.toMatch(/请先登录后再导入|Please sign in first\./)
    const { container: c } = mount(<ImportIntro zh />)
    expect(textOf(only(c, '[data-testid="import-intro-title"]'))).toBe('已经在租了？把签好的租约带进来')
    expect(all(c, '[data-testid="import-intro-steps"] li').length).toBe(3)
    expect(IMPORT_STEPS.map((x) => x.title.zh)).toEqual(['上传租约，核对信息', '邀请对方加入', '每月记租金，需要时导出'])
    for (const x of IMPORT_STEPS) expect(c.textContent).toContain(x.body.zh)
    expect(only<HTMLAnchorElement>(c, '[data-testid="import-intro-signin"]').getAttribute('href')).toBe('/login?next=/leases/import')
  })
  it('it says only what exists: a confirm form, a record — no money through Stayloop, no tribunal form filed', () => {
    const { container: c } = mount(<ImportIntro zh />)
    const text = c.textContent ?? ''
    expect(text).toContain('只有你确认过的内容才会保存')
    expect(text).toContain('不是 LTB 表格，也不替你提交')
    expect(textOf(only(c, '[data-testid="import-intro-note"]'))).toBe('Stayloop 不经手资金：租金由你们自己收付，这里只是记录。')
    expect(IMPORT_STEPS.length).toBe(3)
    const src = read('components/household/ImportIntro.tsx').split('\n').filter((l) => !l.trim().startsWith('//')).join('\n')
    expect(src).not.toMatch(/收租|催收|上报|代收|助手|背调|supabase|fetch\(/)
    cleanup()
    expect(mount(<ImportIntro zh={false} />).container.textContent).not.toMatch(/[一-鿿]/)
  })
})
