// @vitest-environment jsdom
// V0.9 (2026-11-24, user, with a screenshot of the header row and one of the footer's 产品 column:
// 「检查一下所有的模块，现在 2 个地方的产品页面不一样，把头部菜单里的产品这个和 footer 的统一一下，有些不是这个里面的
// 可以单独出来。你研究一下再确定怎么优化和统一」).
// What was found: 「产品」 in the header was one link to /platform; 「产品」 in the footer was nine links
// mixing an overview, real modules, a free tool page, the price list and a page that is a demo
// throughout; /platform itself still listed online rent collection and "three endpoints".
// What it is now: one list of product modules (lib/nav/siteNav.ts) shown in three places — the
// header's 「产品」 menu, the footer's 产品 column, the index at the top of /platform — and a
// separate 资源 list for what is not a product.
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

import { I18nProvider } from '../lib/i18n'
import Footer from '../components/Footer'
import PlatformPage from '../app/platform/page'
import ImportIntro, { IMPORT_STEPS } from '../components/household/ImportIntro'
import { COMPANY_NAV, FOOTER_GROUPS, PRODUCT_NAV, RESOURCE_NAV, ROLE_NAV } from '../lib/nav/siteNav'

// the real dictionary, in Chinese: the provider paints its default and then follows the stored choice
beforeEach(() => { localStorage.setItem('stayloop_lang', 'zh') })
afterEach(() => { cleanup(); state.admin = null; localStorage.clear() })
const mount = (node: React.ReactElement) => render(<I18nProvider>{node}</I18nProvider>)
const group = (c: ParentNode, k: string) => all<HTMLAnchorElement>(only(c, `[data-testid="foot-group-${k}"]`), 'a').map((a) => [a.getAttribute('href'), textOf(a)])

describe('one list of product modules', () => {
  it('eight of them, in the order a tenancy meets them, the overview first; every one has a page', () => {
    expect(PRODUCT_NAV.map((m) => [m.key, m.href])).toEqual([
      ['foot.platform', '/platform'],
      ['nav.listings', '/listings'],
      ['foot.screening', '/screening'],
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
  it('four columns: 产品 is the product list, word for word; 资源 stands apart', () => {
    const { container: c } = mount(<Footer />)
    expect(all(c, 'footer h4').map(textOf)).toEqual(['产品', '为谁打造', '资源', '公司'])
    expect(group(c, 'product')).toEqual([
      ['/platform', '产品总览'], ['/listings', '房源'], ['/screening', '租客筛查'], ['/tenant/passport', '租客护照'], ['/leases/import', '租约与租金记录'], ['/services', '维修与服务网络'], ['/agents', '找经纪 · 服务商'], ['/stayloop-api', 'Stayloop API'],
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
  it('后台管理 shows for an administrator only; the version label is untouched', () => {
    state.admin = 'admin'
    const { container: c } = mount(<Footer />)
    expect(group(c, 'company').map((l) => l[0])).toContain('/admin')
    expect(read('components/Footer.tsx')).toContain('>V0.8<')
  })
  it('the footer keeps no list of its own', () => {
    const f = read('components/Footer.tsx')
    expect(f).toContain("import { FOOTER_GROUPS } from '@/lib/nav/siteNav'")
    expect(f).not.toMatch(/href: '\//)
    expect(FOOTER_GROUPS.map((g) => g.titleKey)).toEqual(['foot.product', 'foot.forWhom', 'foot.resources', 'foot.company'])
    expect(FOOTER_GROUPS[0].links).toBe(PRODUCT_NAV)
  })
})

describe('the header', () => {
  const h = read('components/Header.tsx')
  it('the row is the same five — 我是 · 产品 · 房源 · 定价 · 租客筛查 — and 「产品」 opens the product list', () => {
    const nav = h.slice(h.indexOf('<nav className="hidden items-center gap-[26px] lg:flex">'), h.indexOf('</nav>'))
    const order = ['data-testid="nav-identity"', '<ProductMenu', 'i18nKey="nav.listings"', 'i18nKey="nav.pricing"', 'i18nKey="nav.screening"'].map((k) => nav.indexOf(k))
    expect(order.every((i) => i > -1)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
    expect((nav.match(/<NavLink /g) || []).length).toBe(3)
  })
  it('the menu maps the same list, with one line under each name; its screening row goes where the row’s own item goes', () => {
    const menu = h.slice(h.indexOf('function ProductMenu('), h.indexOf('function NavLink('))
    expect(menu).toContain('{PRODUCT_NAV.map((item) => (')
    expect(menu).toContain("href={item.href === '/screening' ? screeningHref : item.href}")
    expect(menu).toContain('{t(item.key)}')
    expect(menu).toContain('{item.desc[lang]}')
    expect(menu).toContain('aria-expanded={open}')
    expect(menu).toContain('data-testid="nav-products-menu"')
    expect(menu).toContain("if (e.key === 'Escape') setOpen(false)")
    // closed on the server and on first paint
    expect(menu).toContain('const [open, setOpen] = useState(false)')
  })
  it('on a phone 「产品」 still goes to the overview, whose first section is the same list', () => {
    expect(h).toContain(`<Link href="/platform" onClick={() => setMenuOpen(false)} className="block px-4 py-3 text-[14px] text-[#222] transition hover:bg-[#F7F7F7]">{t('nav.platform')}</Link>`)
  })
})

describe('/platform is the overview of the same list', () => {
  it('an index of the seven modules besides itself, then the resources', () => {
    const { container: c } = mount(<PlatformPage />)
    const cards = all<HTMLAnchorElement>(c, '[data-testid="platform-module"]')
    expect(cards.map((a) => a.getAttribute('href'))).toEqual(PRODUCT_NAV.slice(1).map((m) => m.href))
    expect(textOf(cards[1])).toBe('租客筛查→材料取证、公开记录、四项评分')
    expect(all<HTMLAnchorElement>(c, '[data-testid="platform-resources"] a').map((a) => a.getAttribute('href'))).toEqual(RESOURCE_NAV.map((r) => r.href))
    expect(textOf(only(c, '[data-testid="platform-resources"]'))).toBe('另有：定价 · 租房小工具 · 安省租房规则 · 争议解决（示范）')
  })
  it('what no longer holds is gone: no online rent collection, no "three endpoints", no open /screen', () => {
    const s = read('app/platform/page.tsx')
    expect(s).not.toMatch(/在线收租|Online rent collection|\/tenant\/payments/)
    expect(s).not.toMatch(/三个端点|three endpoints/)
    expect(s).toContain('第三档 · 合作方发起筛查：Stayloop 完成《消费者报告法》注册前暂不开放')
    expect(s).toContain('第一档 · 七个端点和一个 MCP 端点')
    // the two directories it had never heard of
    expect(s).toContain("href: '/agents' },")
    expect(s).toContain("href: '/providers' },")
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
