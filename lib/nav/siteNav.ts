// One map of where things are, for every place that lists it (2026-11-24, user: 「把头部菜单里的产品这个和
// footer 的统一一下，有些不是这个里面的可以单独出来」).
//
// Until then 「产品」 meant two different things: in the header it was one link to /platform, a page
// describing a lifecycle product and an API; in the footer it was a column of nine links that mixed
// an overview, real modules, a free tool page, the price list and a page that is a demo from top to
// bottom. Neither was derived from the other, and /platform had fallen behind both.
//
// PRODUCT_NAV is the one list of product modules. A module is on it when it is something a person
// can use today and it has a public face — a page that says what it is to someone who is not signed
// in. Two places render it, and they show the same set:
//   · the footer's 「产品」 column;
//   · the product page /platform, which presents each module in a block of its own
//     (PRODUCT_PAGE_MODULES: the list without the page itself).
// The header's 「产品」 is a link to that page. For a few hours on 2026-11-24 it opened this list as
// a menu; the user had it put back: 「房源和租客筛查去掉，因为在 hero 的菜单里已经有了…把这个产品单独为一个
// 页面，这些菜单项放在产品页面里」, and again: 「房源和租客筛选已经在头部菜单里有了，不要再放进产品页面里了」.
// So the header row is 我是 · 产品 · 房源 · 定价 · 租客筛查, and 房源 and 租客筛查 are NOT on this list:
// they are the row's own items (and the phone tab bar's), on screen on every page, and they are
// not repeated under 「产品」 anywhere — not on the product page, not in the footer's 产品 column.
// The footer still links them, in a column of their own (SHORTCUT_NAV, 「常用入口」): asked whether the
// footer should keep the two links in a separate column, the user said 「单独放一栏」.
// What is not a product has its own list, RESOURCE_NAV (the price list, the free tools, the rule
// book, and the one page that is still only a demo, marked as such). The labels are i18n keys so
// the footer and the page cannot word them differently.
export type Words = { zh: string; en: string }
export type SiteLink = { key: string; href: string; desc?: Words; tag?: 'demo' }

/** The product modules, in the order a tenancy meets them. The first is the product page itself. */
export const PRODUCT_NAV: (SiteLink & { desc: Words })[] = [
  { key: 'foot.platform', href: '/platform', desc: { zh: '租前、租中、租后，一条流程看全', en: 'Before, during and after the lease, in one flow' } },
  { key: 'foot.passport', href: '/tenant/passport', desc: { zh: '一份申请包，每次申请带上', en: 'One applicant pack to bring to every application' } },
  // the landlord's main way in (「已经在租」); listed since /leases/import says what it is to a visitor (components/household/ImportIntro.tsx)
  { key: 'foot.leases', href: '/leases/import', desc: { zh: '导入已签的租约，每月记租金，需要时导出', en: 'Bring in a signed lease, record the rent each month, export when needed' } },
  { key: 'foot.services', href: '/services', desc: { zh: '报修工单，派给核验过的服务商或你自己的联系人', en: 'Repair tickets, dispatched to verified providers or your own contacts' } },
  { key: 'foot.findAgent', href: '/agents', desc: { zh: '核验过的经纪、物业管理服务和专业服务', en: 'Verified agents, property maintenance and professional services' } },
  { key: 'foot.stayloopApi', href: '/stayloop-api', desc: { zh: '规则、合规检查、租金基准，接进你的系统', en: 'Rules, compliance checks and rent benchmarks for your system' } },
]

/** What the product page presents, one block each: the list without the page itself. */
export const PRODUCT_PAGE_MODULES = PRODUCT_NAV.filter((m) => m.href !== '/platform')

/** The header row's own two destinations, kept in the footer in a column of their own — never under 「产品」.
 *  The same words as the header row (房源 · 租客筛查), in the same order. */
export const SHORTCUT_NAV: SiteLink[] = [
  { key: 'foot.listings', href: '/listings' },
  { key: 'foot.screening', href: '/screening' },
]

/** Not products: what things cost, what is free to use, the rules everything cites — and the page that is a demo throughout. */
export const RESOURCE_NAV: SiteLink[] = [
  { key: 'foot.pricing', href: '/pricing' },
  { key: 'foot.tools', href: '/tools' },
  { key: 'foot.rules', href: '/rules' },
  { key: 'foot.disputes', href: '/disputes', tag: 'demo' },
]

/** Who it is for: the four doors of the header's 「我是」 menu, in the same order (components/Header.tsx PRODUCT_ITEMS). */
export const ROLE_NAV: SiteLink[] = [
  { key: 'foot.tenants', href: '/tenant' },
  { key: 'foot.landlords', href: '/landlord' },
  { key: 'foot.agents', href: '/agent' },
  { key: 'foot.providers', href: '/services' },
]

/** The company, and the legal pages. `foot.admin` is shown to administrators only. */
export const COMPANY_NAV: SiteLink[] = [
  { key: 'foot.about', href: '/about' },
  { key: 'foot.partners', href: '/partners' },
  { key: 'foot.contact', href: '/contact' },
  { key: 'foot.privacy', href: '/privacy' },
  { key: 'foot.terms', href: '/terms' },
  { key: 'foot.consumerRights', href: '/consumer-rights' },
  { key: 'foot.admin', href: '/admin' },
]

export type FooterGroup = { titleKey: string; links: SiteLink[] }
const PRODUCT_GROUP: FooterGroup = { titleKey: 'foot.product', links: PRODUCT_NAV }
const SHORTCUT_GROUP: FooterGroup = { titleKey: 'foot.shortcuts', links: SHORTCUT_NAV }
const ROLE_GROUP: FooterGroup = { titleKey: 'foot.forWhom', links: ROLE_NAV }
const RESOURCE_GROUP: FooterGroup = { titleKey: 'foot.resources', links: RESOURCE_NAV }
const COMPANY_GROUP: FooterGroup = { titleKey: 'foot.company', links: COMPANY_NAV }

/** The footer's five columns, left to right on a wide screen. */
export const FOOTER_GROUPS: FooterGroup[] = [PRODUCT_GROUP, SHORTCUT_GROUP, ROLE_GROUP, RESOURCE_GROUP, COMPANY_GROUP]

/** The same five as the footer lays them out. Below `lg` the cells sit two by two, so the two with the
 *  longest labels (产品, 资源) are first and third: they share the grid's first column, which is sized to
 *  its widest link. The two short groups (常用入口 has two links, 为谁打造 four) share the second cell,
 *  one above the other — about as tall as 产品 beside them; from `lg` that cell dissolves and each is a column. */
export const FOOTER_CELLS: FooterGroup[][] = [[PRODUCT_GROUP], [SHORTCUT_GROUP, ROLE_GROUP], [RESOURCE_GROUP], [COMPANY_GROUP]]
