// One map of where things are, for every place that lists it (2026-11-24, user: 「把头部菜单里的产品这个和
// footer 的统一一下，有些不是这个里面的可以单独出来」).
//
// Until now 「产品」 meant two different things: in the header it was one link to /platform, a page
// describing a lifecycle product and an API; in the footer it was a column of nine links that mixed
// an overview, real modules, a free tool page, the price list and a page that is a demo from top to
// bottom. Neither was derived from the other, and /platform had fallen behind both.
//
// PRODUCT_NAV is now the one list of product modules. Three places render it and nothing else:
//   · the header's 「产品」 menu (components/Header.tsx),
//   · the footer's 「产品」 column (components/Footer.tsx),
//   · the module index at the top of /platform.
// A module is on it when it is something a person can use today and it has a public face — a page
// that says what it is to someone who is not signed in. What is not a product has its own list:
// RESOURCE_NAV (the price list, the free tools, the rule book, and the one page that is still only
// a demo, marked as such). The labels are i18n keys so the three places cannot word them
// differently; the one-line descriptions are for the header menu and the index.
export type Words = { zh: string; en: string }
export type SiteLink = { key: string; href: string; desc?: Words; tag?: 'demo' }

/** The product modules, in the order a tenancy meets them. The first is the overview of all of them. */
export const PRODUCT_NAV: (SiteLink & { desc: Words })[] = [
  { key: 'foot.platform', href: '/platform', desc: { zh: '租前、租中、租后，一条流程看全', en: 'Before, during and after the lease, in one flow' } },
  { key: 'nav.listings', href: '/listings', desc: { zh: '找房，或发布核验过的房源', en: 'Find a place, or publish a verified listing' } },
  { key: 'foot.screening', href: '/screening', desc: { zh: '材料取证、公开记录、四项评分', en: 'Document forensics, public records, a four-part score' } },
  { key: 'foot.passport', href: '/tenant/passport', desc: { zh: '一份申请包，每次申请带上', en: 'One applicant pack to bring to every application' } },
  { key: 'foot.services', href: '/services', desc: { zh: '报修工单，派给核验过的服务商或你自己的联系人', en: 'Repair tickets, dispatched to verified providers or your own contacts' } },
  { key: 'foot.findAgent', href: '/agents', desc: { zh: '核验过的经纪、物业管理服务和专业服务', en: 'Verified agents, property maintenance and professional services' } },
  { key: 'foot.stayloopApi', href: '/stayloop-api', desc: { zh: '规则、合规检查、租金基准，接进你的系统', en: 'Rules, compliance checks and rent benchmarks for your system' } },
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

/** The footer's four columns, left to right. On a phone they sit two by two, so the two columns with the
 *  longest labels (产品, 资源) are first and third: they share the grid's first column, which is sized to its widest link. */
export const FOOTER_GROUPS: { titleKey: string; links: SiteLink[] }[] = [
  { titleKey: 'foot.product', links: PRODUCT_NAV },
  { titleKey: 'foot.forWhom', links: ROLE_NAV },
  { titleKey: 'foot.resources', links: RESOURCE_NAV },
  { titleKey: 'foot.company', links: COMPANY_NAV },
]
