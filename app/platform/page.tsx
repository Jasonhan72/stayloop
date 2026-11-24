'use client'

// /platform — 「产品」: what Stayloop is, on one page.
//
// The structure is the one decided on 2026-09-23: two products, one flow — the lifecycle
// (租前 · 租中 · 租后, one conversation and one approval spine across the whole tenancy) and the
// Stayloop API (the same facts and rules, callable by partners).
//
// 2026-11-24 (user: 「把这个产品单独为一个页面，这些菜单项放在产品页面里，你要重新设计一下产品页面的 UI」): the
// header's 「产品」 leads here and nowhere else, so the product modules are presented here, one
// block each — the list is lib/nav/siteNav.ts PRODUCT_PAGE_MODULES (the product list without this
// page). 房源 and 租客筛查 are not on that list and appear nowhere on this page, the lifecycle section
// included: they are the header row's own items. The page:
//   hero + jump links → the modules → the lifecycle → what runs through it → the API → resources →
//   the four role pages.
// Every capability listed links to the page that actually does it and carries its real status;
// nothing here is a promise.
import Link from 'next/link'
import type { ReactNode } from 'react'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { FIND_GROUND } from '@/components/directory/FindHeader'
import { PANEL } from '@/components/directory/cardStyle'
import { eyebrowFor } from '@/lib/ui/eyebrow'
import { useT, type Lang } from '@/lib/i18n'
import { PRODUCT_PAGE_MODULES, RESOURCE_NAV } from '@/lib/nav/siteNav'
import { PROVIDER_ACCENT, ROLE_THEME } from '@/lib/roleTheme'

type Bi = { zh: string; en: string }
const pick = (b: Bi, lang: Lang) => (lang === 'zh' ? b.zh : b.en)

type Cap = { t: Bi; href: string; status?: 'demo' | 'soon' }
type Stage = { key: string; eyebrow: string; title: Bi; lead: Bi; caps: Cap[] }

const STAGES: Stage[] = [
  {
    key: 'pre',
    eyebrow: 'LEASING · 租前',
    title: { zh: '租前', en: 'Before the lease' },
    // 房源 and 租客筛查 have items of their own in the header row and are not repeated on this page
    // (user, 2026-11-24, twice: 「房源和租客筛选已经在头部菜单里有了，不要再放进产品页面里了」) — so this stage
    // lists what else happens before a lease, and nothing here links to /listings or /screening.
    lead: { zh: '带着一份申请包去申请；想有人帮忙，就找一位核验过注册的经纪。', en: 'Apply with one applicant pack; when you want help, find an agent whose registration was checked.' },
    caps: [
      { t: { zh: '申请包 · 填一次，申请时自动带入', en: 'Applicant pack · filled in once, carried into each application' }, href: '/tenant/passport' },
      { t: { zh: '找经纪 · 人工核验过注册的租赁经纪，站内联系', en: 'Find an agent · leasing agents whose registration was checked by hand, reachable on Stayloop' }, href: '/agents' },
      { t: { zh: '决定通知 · 固定合规声明', en: 'Decision notice · fixed compliance wording' }, href: '/rules' },
    ],
  },
  {
    key: 'mid',
    eyebrow: 'LIVING · 租中',
    title: { zh: '租中', en: 'During the lease' },
    lead: { zh: '标准租约到电子签，双签即成在管租约。', en: 'Standard lease to e-signature; both signatures create a managed tenancy.' },
    caps: [
      { t: { zh: '安省标准租约起草 · 保存前规则检查', en: 'Ontario standard lease drafting · rule checks on save' }, href: '/landlord/leases/new' },
      { t: { zh: '电子签 · 租客凭链接签、房东回签', en: 'E-signature · tenant by link, landlord countersigns' }, href: '/landlord/leases' },
      { t: { zh: '在管租约 · 双方确认的共享中心', en: 'Managed tenancy · a shared hub both sides confirmed' }, href: '/leases/import' },
      { t: { zh: '租金记录 · 持续迟付法定定义提示', en: 'Rent ledger · statutory persistent-late flag' }, href: '/leases/import' },
      { t: { zh: '报修工单', en: 'Maintenance tickets' }, href: '/tenant/maintenance' },
      { t: { zh: '维修派单 · 已核验服务商或自己的联系人 · 报价须批准 · RTA s.27 进入通知 · 验收', en: 'Repair dispatch · verified providers or your own contacts · quotes need approval · RTA s.27 entry notice · acceptance' }, href: '/services' },
      { t: { zh: '找物业管理服务与专业服务 · 资质人工核验，直接联系', en: 'Find property maintenance and professional services · credentials checked by hand, contact them directly' }, href: '/providers' },
      { t: { zh: '租金提醒 · 批准后才发', en: 'Rent reminders · sent only after approval' }, href: '/landlord/todo' },
    ],
  },
  {
    key: 'post',
    eyebrow: 'RENEWAL · 租后',
    title: { zh: '租后', en: 'Renewal and after' },
    lead: { zh: '到期前 120 天起自动跟进，租史变成下一次的信用。', en: 'Automatic follow-ups from 120 days out; the tenancy becomes credit for the next one.' },
    caps: [
      { t: { zh: '续约 90 / 60 / 30 天触点 · 方案 A/B', en: 'Renewal touchpoints at 90 / 60 / 30 days · options A/B' }, href: '/landlord/leases' },
      { t: { zh: '涨租按生效年份指导比例 · N1 截止日', en: 'Rent guideline by effective year · N1 deadline' }, href: '/rules' },
      { t: { zh: 'N 表工具箱 · N1 / N2 / N4 / N12 / N13', en: 'N-form toolbox · N1 / N2 / N4 / N12 / N13' }, href: '/landlord/leases' },
      { t: { zh: '退租 · N9 60 天', en: 'Move-out · N9, 60 days' }, href: '/rules' },
      { t: { zh: '租客护照 · 已确认租史，只读分享', en: 'Tenant passport · confirmed tenancy, read-only sharing' }, href: '/tenant/passport' },
    ],
  },
]

// The three tiers as /stayloop-api states them (2026-11-24: the section had kept an older count and listed /screen as open).
const API_POINTS: { code: string; t: Bi }[] = [
  { code: 'GET /rules · POST /listings/compliance · … + MCP', t: { zh: '第一档 · 七个端点和一个 MCP 端点：规则、合规检查、日期算术、租金基准。免费、无需密钥、不存个人信息', en: 'Tier 1 · seven endpoints and one MCP endpoint: rules, compliance checks, date arithmetic, rent benchmarks. Free, keyless, stores no personal data' } },
  { code: 'POST /passport/verify', t: { zh: '第二档 · 申请人出示的核验结论：需要合作方密钥和申请人本人授权，只回结论不回文件', en: 'Tier 2 · applicant-presented verification: needs a partner key and the applicant’s own authorisation; conclusions, never documents' } },
  { code: 'POST /screen', t: { zh: '第三档 · 合作方发起筛查：Stayloop 完成《消费者报告法》注册前暂不开放', en: 'Tier 3 · partner-initiated screening: not open until Stayloop’s Consumer Reporting Act registration is complete' } },
]

function StatusTag({ s, lang }: { s?: 'demo' | 'soon'; lang: Lang }) {
  if (!s) return null
  const zh = lang === 'zh'
  return (
    <span className={'ml-1.5 inline-block rounded-full border px-1.5 py-px font-mono text-[9.5px] font-bold uppercase tracking-wider ' + (s === 'demo' ? 'border-amber-300 text-amber-700' : 'border-line-divider text-body-3')}>
      {s === 'demo' ? (zh ? '示范' : 'demo') : (zh ? '即将' : 'soon')}
    </span>
  )
}

// ── the modules, as the page presents them ───────────────────────────────────
type Who = 'tenant' | 'landlord' | 'agent' | 'provider'
const WHO: Record<Who, { label: Bi; color: string }> = {
  tenant: { label: { zh: '租客', en: 'Tenants' }, color: ROLE_THEME.tenant.accent },
  landlord: { label: { zh: '房东', en: 'Landlords' }, color: ROLE_THEME.landlord.accent },
  agent: { label: { zh: '经纪', en: 'Agents' }, color: ROLE_THEME.agent.accent },
  provider: { label: { zh: '服务商', en: 'Providers' }, color: PROVIDER_ACCENT },
}
const ICON = (d: string) => (
  <svg aria-hidden width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    {d.split('|').map((x, i) => <path key={i} d={x} />)}
  </svg>
)
/** What each module's block says beyond its name and one line (those come from the list): who it is for, three things it does, and its door. */
const MODULE: Record<string, { id: string; icon: ReactNode; color: string; tint: string; who: Who[]; note?: Bi; points: Bi[]; cta: Bi; more?: { href: string; t: Bi } }> = {
  '/tenant/passport': {
    id: 'passport', color: ROLE_THEME.tenant.accent, tint: '#F3EEFF', who: ['tenant'],
    icon: ICON('M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z|M8.5 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4z|M5.5 16a3 3 0 0 1 6 0|M14 9h4|M14 13h4'),
    points: [
      { zh: '自述、材料和同意书填一次，以后每次申请自动带入', en: 'Your details, documents and consent, filled in once and carried into every application' },
      { zh: '只读分享链接：对方看到的是姓名缩写和双方确认过的付租记录', en: 'A read-only share link: the other side sees initials and the rent record both sides confirmed' },
      { zh: '可以预览，也可以打印导出', en: 'Preview it, or print and export it' },
    ],
    cta: { zh: '打开租客护照', en: 'Open the passport' },
  },
  '/leases/import': {
    id: 'leases', color: ROLE_THEME.landlord.accent, tint: '#E6F5EF', who: ['landlord', 'tenant', 'agent'],
    icon: ICON('M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z|M14 2v6h6|M9 15l2 2 4-4'),
    points: [
      { zh: '上传签好的租约，AI 助理读出信息，你确认后才保存', en: 'Upload the signed lease; the AI Agent reads it and nothing is saved until you confirm' },
      { zh: '对方加入并确认后，记录是双方共同的；对话、报修、租金提醒都在这里', en: 'Once the other side joins and confirms, the record belongs to both; messages, repairs and rent reminders live here' },
      { zh: '房东每月记租金，需要时导出记录。Stayloop 不经手资金', en: 'The landlord records the rent each month and exports the record when needed. Stayloop handles no money' },
    ],
    cta: { zh: '导入租约', en: 'Import a lease' },
  },
  '/services': {
    id: 'services', color: PROVIDER_ACCENT, tint: '#FFF1E6', who: ['landlord', 'tenant', 'provider'],
    note: { zh: '试点 · 多伦多及周边', en: 'Pilot · Toronto and nearby' },
    icon: ICON('M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94z'),
    points: [
      { zh: '租客报修变成工单，房东派给核验过的服务商或自己的联系人', en: 'A tenant’s repair request becomes a ticket the landlord dispatches to a verified provider or their own contact' },
      { zh: '报价要房东批准；上门前按法规发进入通知；完工后验收', en: 'Quotes need the landlord’s approval; the entry notice goes out as the law requires; the work is accepted when done' },
      { zh: '不抽成，费用由双方线下结算', en: 'No commission; payment is settled between the two sides' },
    ],
    cta: { zh: '了解服务网络', en: 'About the network' },
  },
  '/agents': {
    id: 'directory', color: ROLE_THEME.agent.accent, tint: '#EAF1FF', who: ['tenant', 'landlord', 'agent', 'provider'],
    icon: ICON('M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z|M2 21v-2a4 4 0 0 1 4-4h4|M17 20a3 3 0 1 0 0-6 3 3 0 0 0 0 6z|M22 22l-2.8-2.8'),
    points: [
      { zh: '经纪：注册由工作人员人工核验，在站内直接发消息', en: 'Agents: registration checked by hand, reachable by message on Stayloop' },
      { zh: '物业管理服务与专业服务：资质人工核验，登录后查看和联系', en: 'Property maintenance and professional services: credentials checked by hand, shown once you sign in' },
      { zh: '排序固定，不排名，也不收排名费', en: 'A fixed order: no ranking, and no fee for position' },
    ],
    cta: { zh: '去找人', en: 'Open the directory' },
    more: { href: '/onboard', t: { zh: '你是经纪或服务商？申请加入', en: 'An agent or a provider? Apply to join' } },
  },
  '/stayloop-api': {
    id: 'api', color: '#93C5FD', tint: 'rgba(255,255,255,0.08)', who: [],
    icon: ICON('M8 8l-4 4 4 4|M16 8l4 4-4 4|M13.5 5l-3 14'),
    points: [],
    cta: { zh: '了解 Stayloop API', en: 'About Stayloop API' },
  },
}
const Check = ({ color }: { color: string }) => (
  <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="mt-[3px] flex-none"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
)
const EYEBROW = 'font-mono text-[11px] font-bold uppercase tracking-eyebrowLg text-body-3'
const H2 = 'mt-2 text-[26px] font-semibold leading-tight tracking-[-0.02em] text-ink sm:text-[32px]'
const JUMP = 'flex min-h-[40px] items-center rounded-full border border-line-divider bg-white px-4 text-[13.5px] font-semibold text-ink transition hover:border-brand hover:text-brand'

export default function PlatformPage() {
  const { lang, t } = useT()
  const zh = lang === 'zh'
  const cards = PRODUCT_PAGE_MODULES.filter((m) => m.href !== '/stayloop-api')
  const api = MODULE['/stayloop-api']
  return (
    <div style={{ background: FIND_GROUND }} className="text-body">
      <Header variant="transparent" />

      {/* ================= HERO ================= */}
      <section style={{ background: `linear-gradient(180deg,#E8F1FD 0%,${FIND_GROUND} 100%)` }}>
        <div className="mx-auto max-w-[1320px] px-6 pb-12 pt-14 sm:px-8 lg:px-12 lg:pt-16">
          <div className="font-mono text-[11px] font-bold uppercase tracking-eyebrowLg text-brand">{zh ? '产品' : 'Product'}</div>
          <h1 className="sl-type-head mt-3 max-w-[860px] text-[clamp(28px,3.6vw,46px)] font-semibold leading-[1.1] tracking-[-0.03em] text-ink">
            {zh ? <>两个产品，一条流程：<br />租前 · 租中 · 租后，加一个可调用的 API。</> : <>Two products, one flow:<br />before, during and after the lease — plus an API you can call.</>}
          </h1>
          <p className="mt-4 max-w-[700px] text-[16px] leading-[1.6] text-body-2">
            {zh
              ? '从租前到续约，Stayloop 把整个租期放进同一条对话和同一条审批链里；同一套事实与规则再以 Stayloop API 开放给合作方。下面是各个模块，点进去就能用。'
              : 'From before the lease to renewal, Stayloop keeps the whole tenancy in one conversation and one approval chain; the same facts and rules are exposed to partners as the Stayloop API. The modules are below, each one a tap away.'}
          </p>
          {/* the page's own map: every block below is one tap away */}
          <nav className="mt-8 flex flex-wrap gap-2" aria-label={zh ? '本页内容' : 'On this page'} data-testid="platform-jump">
            {PRODUCT_PAGE_MODULES.map((m) => <a key={m.href} href={`#${MODULE[m.href].id}`} className={JUMP}>{t(m.key)}</a>)}
            <a href="#lifecycle" className={JUMP}>{zh ? '整条流程' : 'The whole flow'}</a>
          </nav>
        </div>
      </section>

      {/* ================= THE MODULES ================= */}
      {/* One block per module of the product list (lib/nav/siteNav.ts) — the same names the footer's 产品 column uses. */}
      <section className="mx-auto max-w-[1320px] px-6 pb-16 pt-2 sm:px-8 lg:px-12" data-testid="platform-modules">
        <div className={EYEBROW}>{zh ? '各个模块' : 'The modules'}</div>
        <div className="mt-4 grid gap-5 lg:grid-cols-2">
          {cards.map((m) => {
            const d = MODULE[m.href]
            return (
              <article key={m.href} id={d.id} className={`${PANEL} flex scroll-mt-24 flex-col`} data-testid="platform-module-card">
                <div className="flex items-start gap-4">
                  <span className="flex h-12 w-12 flex-none items-center justify-center rounded-2xl" style={{ background: d.tint, color: d.color }}>{d.icon}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                      <h2 className="text-[20px] font-semibold tracking-[-0.01em] text-ink">{t(m.key)}</h2>
                      {d.note && <span className="rounded-full border border-line-divider bg-white px-2.5 py-[2px] text-[12px] text-body-2">{pick(d.note, lang)}</span>}
                    </div>
                    <p className="mt-1 text-[14.5px] leading-relaxed text-body-2">{m.desc[lang]}</p>
                  </div>
                </div>
                <ul className="mt-5 grid gap-2.5">
                  {d.points.map((x) => (
                    <li key={x.en} className="flex items-start gap-2.5 text-[14px] leading-relaxed text-ink"><Check color={d.color} /><span className="min-w-0">{pick(x, lang)}</span></li>
                  ))}
                </ul>
                {d.more && <Link href={d.more.href} className="mt-4 inline-block text-[13.5px] font-semibold text-brand underline-offset-2 hover:underline">{pick(d.more.t, lang)} →</Link>}
                <div className="mt-auto pt-6">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line-divider pt-4">
                    <div className="flex flex-wrap gap-1.5" data-testid="platform-module-who">
                      {d.who.map((w) => (
                        <span key={w} className="inline-flex items-center gap-1.5 rounded-full bg-[#F1F5F9] px-2.5 py-[3px] text-[12px] text-body-2">
                          <span className="h-1.5 w-1.5 rounded-full" style={{ background: WHO[w].color }} />{pick(WHO[w].label, lang)}
                        </span>
                      ))}
                    </div>
                    <Link href={m.href} className="sl-btn-primary min-h-[44px] !px-5 !py-0 !text-[14px] sm:min-h-[40px]" data-testid="platform-module">{pick(d.cta, lang)}<span aria-hidden>→</span></Link>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      </section>

      {/* ================= PRODUCT 1: LIFECYCLE ================= */}
      <section id="lifecycle" className="scroll-mt-20 border-y border-line-divider bg-white">
        <div className="mx-auto max-w-[1320px] px-6 py-16 sm:px-8 lg:px-12">
          <div className={EYEBROW}>{zh ? '产品一' : 'Product 1'}</div>
          <h2 className={H2}>{zh ? 'Stayloop 全流程' : 'Stayloop Lifecycle'}</h2>
          <p className="mt-2 max-w-[720px] text-[15.5px] leading-relaxed text-body-2">
            {zh
              ? '三个阶段不是三个产品：同一个房源、同一位申请人、同一份租约在每个阶段接力，你的 AI 助理在每个节点先动，会对外产生影响的事一律先变成等你批准的卡片。'
              : 'Three stages, not three products: the same listing, applicant and lease hand off across every stage; your AI Agent moves first at each step, and anything that reaches another person becomes a card waiting for your approval.'}
          </p>

          {/* rail */}
          <div className="relative mt-10">
            <div className="absolute left-0 right-0 top-[18px] hidden h-px bg-line-strong md:block" aria-hidden />
            <div className="grid gap-6 md:grid-cols-3">
              {STAGES.map((st, i) => (
                <div key={st.key} className="relative flex flex-col">
                  <div className="flex items-center gap-3">
                    <span className="relative z-10 flex h-9 w-9 flex-none items-center justify-center rounded-full font-mono text-[13px] font-bold text-white" style={{ background: '#00ACE4' }}>{i + 1}</span>
                    <span className="bg-white pr-3 font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-body-3">{eyebrowFor(st.eyebrow, lang)}</span>
                  </div>
                  <div className="mt-4 flex-1 rounded-2xl border border-line-divider p-5 sm:p-6" style={{ background: FIND_GROUND }}>
                    <div className="text-[20px] font-semibold tracking-[-0.01em] text-ink">{pick(st.title, lang)}</div>
                    <p className="mt-1 text-[13.5px] leading-relaxed text-body-2">{pick(st.lead, lang)}</p>
                    <ul className="mt-4 space-y-2 text-[13.5px] [text-wrap:pretty]">
                      {st.caps.map((c) => (
                        <li key={c.t.en} className="flex items-start gap-2">
                          <span className="mt-[7px] h-1.5 w-1.5 flex-none rounded-full" style={{ background: c.status ? '#CBD5E1' : '#00ACE4' }} />
                          <span className="min-w-0 break-keep [overflow-wrap:anywhere] [text-wrap:pretty]">
                            {c.status ? <span className="text-body-2">{pick(c.t, lang)}</span> : <Link href={c.href} className="text-ink underline-offset-2 hover:text-brand hover:underline">{pick(c.t, lang)}</Link>}
                            <StatusTag s={c.status} lang={lang} />
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* what runs through all three */}
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {[
              { h: { zh: '一条对话', en: 'One conversation' }, p: { zh: '一个 AI 助理跟着你的三种身份：租客、房东、经纪的事都由它办，只对你负责；记忆与画像跨身份延续，各身份的流程与数据分开。', en: 'One AI Agent across your hats — tenant, landlord, agent — answering only to you; memory and profile carry across, while each hat’s workflow and data stay separate.' } },
              { h: { zh: '一条审批链', en: 'One approval chain' }, p: { zh: '发信、发租约、发续约函先变成卡片：预览正文 → 批准 → 60 秒可撤销 → 执行 → 审计。', en: 'Emails, leases and renewal letters become cards: preview → approve → 60-second undo → execute → audit.' } },
              { h: { zh: '一套规则', en: 'One rule set' }, p: { zh: '安省 RTA、OHRC 与《消费者报告法》的规则是单一来源，发布检查、租约草稿、通知信和 API 引用同一份。', en: 'Ontario RTA, OHRC and Consumer Reporting Act rules live in one place, cited by publish checks, lease drafts, notices and the API alike.' } },
            ].map((b, i) => (
              <div key={b.h.en} className="rounded-2xl border border-line-divider bg-white p-5 sm:p-6">
                <div className="flex items-center gap-3">
                  <span className="sl-type-num flex h-8 w-8 flex-none items-center justify-center rounded-full bg-[#EEF5FA] text-[14px] font-semibold text-ink">{i + 1}</span>
                  <div className="text-[16px] font-semibold text-ink">{pick(b.h, lang)}</div>
                </div>
                <p className="mt-3 text-[13.5px] leading-relaxed text-body-2">{pick(b.p, lang)}</p>
              </div>
            ))}
          </div>
          <p className="mt-5 text-[12.5px] text-body-3">
            {zh ? '标「即将」的项目接口已接、待供应商凭证。规则全文见 ' : '"Soon" means the integration is built and awaits provider credentials. Full rules: '}
            <Link href="/rules" className="underline">/rules</Link>.
          </p>
        </div>
      </section>

      {/* ================= PRODUCT 2: API ================= */}
      <section id="api" className="mx-auto max-w-[1320px] scroll-mt-20 px-6 py-16 sm:px-8 lg:px-12">
        <div className="overflow-hidden rounded-[28px] p-7 text-white sm:p-10" style={{ background: 'linear-gradient(135deg,#0B0B0E 0%,#1E293B 100%)' }} data-testid="platform-api">
          <div className="flex items-start gap-4">
            <span className="flex h-12 w-12 flex-none items-center justify-center rounded-2xl" style={{ background: api.tint, color: api.color }}>{api.icon}</span>
            <div className="min-w-0">
              <div className="font-mono text-[11px] font-bold uppercase tracking-eyebrowLg" style={{ color: '#93C5FD' }}>{zh ? '产品二 · 给开发者与合作方' : 'Product 2 · for developers and partners'}</div>
              <h2 className="mt-1 text-[26px] font-semibold leading-tight tracking-[-0.02em] sm:text-[32px]">Stayloop API</h2>
            </div>
          </div>
          <p className="mt-4 max-w-[760px] text-[15px] leading-relaxed" style={{ color: '#CBD5E1' }}>
            {zh
              ? '全流程里用到的规则与事实，分三档开放给物业系统、租赁平台和 AI 客户端：规则与日期算术可以直接调用；核验结论由申请人主动出示，合作方只拿到结论，每次调用留痕并通知申请人；合作方发起筛查暂不开放。'
              : 'The rules and facts used across the lifecycle, opened in three tiers to property systems, rental platforms and AI clients: rules and date arithmetic can be called directly; verification is presented by the applicant, the partner receives conclusions only, and every call is audited and the applicant told; partner-initiated screening is not open yet.'}
          </p>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {API_POINTS.map((a) => (
              <div key={a.code} className="rounded-2xl border border-white/15 bg-white/5 p-5">
                <code className="break-words font-mono text-[12.5px] font-bold" style={{ color: '#7DD3FC' }}>{a.code}</code>
                <p className="mt-2 text-[13.5px] leading-relaxed" style={{ color: '#E2E8F0' }}>{pick(a.t, lang)}</p>
              </div>
            ))}
          </div>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/stayloop-api" className="sl-btn-primary" data-testid="platform-module">{pick(api.cta, lang)}</Link>
            <Link href="/stayloop-api/docs" className="inline-flex items-center justify-center rounded-full border border-white/30 px-5 py-[11px] text-[14px] font-semibold text-white transition hover:border-white">{zh ? '接口文档' : 'API docs'}</Link>
          </div>
        </div>
      </section>

      {/* ================= RESOURCES ================= */}
      <section className="mx-auto max-w-[1320px] px-6 pb-4 sm:px-8 lg:px-12" data-testid="platform-resources">
        <div className={EYEBROW}>{zh ? '另有' : 'Also'}</div>
        <div className="mt-3 flex flex-wrap gap-2">
          {RESOURCE_NAV.map((r) => (
            <Link key={r.href} href={r.href} className={JUMP}>
              {t(r.key)}
              {r.tag === 'demo' && <span className="ml-2 rounded-full border border-amber-300 px-1.5 py-px font-mono text-[9.5px] font-bold uppercase tracking-wider text-amber-700">{zh ? '示范' : 'demo'}</span>}
            </Link>
          ))}
        </div>
      </section>

      {/* ================= FINAL ================= */}
      <section className="mx-auto max-w-[1320px] px-6 py-16 text-center sm:px-8 lg:px-12">
        <h2 className="text-[26px] font-semibold leading-tight tracking-[-0.02em] text-ink sm:text-[32px]">{zh ? '从任何一个阶段进来，都在同一条流程里。' : 'Enter at any stage — it is the same flow.'}</h2>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Link href="/tenant" className="sl-btn-secondary">{zh ? '我是租客' : 'I’m a tenant'}</Link>
          <Link href="/landlord" className="sl-btn-secondary">{zh ? '我是房东' : 'I’m a landlord'}</Link>
          <Link href="/agent" className="sl-btn-secondary">{zh ? '我是经纪' : 'I’m an agent'}</Link>
          <Link href="/services" className="sl-btn-secondary">{zh ? '我是服务商' : 'I’m a provider'}</Link>
        </div>
      </section>
      <Footer />
    </div>
  )
}
