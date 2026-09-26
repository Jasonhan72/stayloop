'use client'

// /platform — product structure in one page (2026-09-23, user decision).
// Two products, one flow:
//   1. Stayloop 全流程 — 租前 · 租中 · 租后, one conversation and one
//      approval spine across the whole tenancy (the counterpart of
//      "leasing + resident" suites elsewhere).
//   2. Stayloop API — the same facts and rules, callable by partners
//      (formerly "Trust API").
// Every capability listed here links to the page that actually does it and
// carries its real status; nothing here is a promise.
import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { useT, type Lang } from '@/lib/i18n'

type Bi = { zh: string; en: string }
const pick = (b: Bi, lang: Lang) => (lang === 'zh' ? b.zh : b.en)

type Cap = { t: Bi; href: string; status?: 'demo' | 'soon' }
type Stage = { key: string; eyebrow: string; title: Bi; lead: Bi; caps: Cap[] }

const STAGES: Stage[] = [
  {
    key: 'pre',
    eyebrow: 'LEASING · 租前',
    title: { zh: '租前', en: 'Before the lease' },
    lead: { zh: '从一句话找房，到房东手里一份有依据的筛查报告。', en: 'From a one-sentence search to a screening report the landlord can trust.' },
    caps: [
      { t: { zh: '对话找房 · 真实挂牌 + TRREB 行情', en: 'Conversational search · live listings + TRREB data' }, href: '/?role=tenant' },
      { t: { zh: '房源发布 · 发布前合规检查', en: 'Listing publish · compliance checks before publish' }, href: '/dashboard/listings/new' },
      { t: { zh: '看房请求与提问 · 进房东待办', en: 'Showing requests & questions · into the landlord queue' }, href: '/listings' },
      { t: { zh: '在线申请 · 材料直达房东', en: 'Online application · documents straight to the landlord' }, href: '/listings' },
      { t: { zh: '租客筛查 · 取证 + 公开记录 + 评分', en: 'Tenant screening · forensics + public records + score' }, href: '/screening' },
      { t: { zh: '申请人本人核验 · 身份 / 银行 / 征信', en: 'Applicant verification · identity / bank / credit' }, href: '/screening', status: 'soon' },
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
      { t: { zh: '租金提醒 · 批准后才发', en: 'Rent reminders · sent only after approval' }, href: '/landlord/todo' },
      { t: { zh: '在线收租', en: 'Online rent collection' }, href: '/tenant/payments', status: 'demo' },
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
      { t: { zh: '租金记录上报信用局', en: 'Rent reporting to credit bureaus' }, href: '/tenant/passport', status: 'soon' },
    ],
  },
]

const API_POINTS: { code: string; t: Bi }[] = [
  { code: 'POST /listings/compliance', t: { zh: '房源合规检查 · 免费、无需密钥、不存个人信息', en: 'Listing compliance · free, keyless, stores no personal data' } },
  { code: 'POST /passport/verify', t: { zh: '申请人出示的核验结论 · 只回结论不回文件', en: 'Applicant-presented verification · conclusions, never documents' } },
  { code: 'POST /screen', t: { zh: '发起筛查 · 同一条管线，须附申请人同意', en: 'Start a screening · same pipeline, applicant consent required' } },
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

export default function PlatformPage() {
  const { lang } = useT()
  const zh = lang === 'zh'
  return (
    <div style={{ background: '#FFFFFF' }} className="text-body">
      <Header variant="transparent" />

      {/* ================= HERO ================= */}
      <section style={{ background: 'linear-gradient(180deg,#E9F5FD 0%,#FFFFFF 100%)' }}>
        <div className="mx-auto max-w-[1100px] px-5 py-14 sm:px-7 lg:py-18">
          <div className="font-mono text-[13px] font-semibold uppercase tracking-[.12em] text-brand">{zh ? 'PRODUCTS · 产品结构' : 'PRODUCTS'}</div>
          <h1 className="mt-4 max-w-[760px] text-[clamp(28px,3.4vw,42px)] font-semibold leading-[1.1] tracking-[-0.03em]">
            {zh ? <>两个产品，一条流程：<br />租前 · 租中 · 租后，加一个可调用的 API。</> : <>Two products, one flow:<br />before, during and after the lease — plus an API you can call.</>}
          </h1>
          <p className="mt-4 max-w-[680px] text-[16px] leading-[1.6] text-body-2">
            {zh
              ? '找房、看房、申请、筛查、签约、在管、续约——Stayloop 把整个租期放进同一条对话和同一条审批链里；同一套事实与规则再以 Stayloop API 开放给合作方。'
              : 'Search, showings, applications, screening, signing, managing, renewal — Stayloop keeps the whole tenancy in one conversation and one approval chain; the same facts and rules are exposed to partners as the Stayloop API.'}
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <a href="#lifecycle" className="sl-btn-primary">{zh ? 'Stayloop 全流程' : 'Stayloop Lifecycle'}</a>
            <a href="#api" className="sl-btn-secondary">Stayloop API</a>
          </div>
        </div>
      </section>

      {/* ================= PRODUCT 1: LIFECYCLE ================= */}
      <section id="lifecycle" className="mx-auto max-w-[1100px] px-5 py-14 sm:px-7">
        <div className="font-mono text-[11px] font-bold uppercase tracking-eyebrowLg text-body-3">{zh ? '产品一' : 'Product 1'}</div>
        <h2 className="mt-2 text-[26px] font-extrabold leading-tight tracking-tight sm:text-[34px]">{zh ? 'Stayloop 全流程' : 'Stayloop Lifecycle'}</h2>
        <p className="mt-2 max-w-[720px] text-[15.5px] text-body-2">
          {zh
            ? '三个阶段不是三个产品：同一个房源、同一位申请人、同一份租约在每个阶段接力，你的 AI 助手在每个节点先动，会对外产生影响的事一律先变成等你批准的卡片。'
            : 'Three stages, not three products: the same listing, applicant and lease hand off across every stage; your AI assistant moves first at each step, and anything that reaches another person becomes a card waiting for your approval.'}
        </p>

        {/* rail */}
        <div className="relative mt-10">
          <div className="absolute left-0 right-0 top-[18px] hidden h-px bg-line-strong md:block" aria-hidden />
          <div className="grid gap-6 md:grid-cols-3">
            {STAGES.map((st, i) => (
              <div key={st.key} className="relative">
                <div className="flex items-center gap-3">
                  <span className="relative z-10 flex h-9 w-9 flex-none items-center justify-center rounded-full font-mono text-[13px] font-bold text-white" style={{ background: '#00ACE4' }}>{i + 1}</span>
                  <span className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-body-3">{st.eyebrow}</span>
                </div>
                <div className="mt-4 rounded-2xl border border-line-divider bg-white p-5">
                  <div className="text-[20px] font-extrabold tracking-tight">{pick(st.title, lang)}</div>
                  <p className="mt-1 text-[13.5px] leading-relaxed text-body-2">{pick(st.lead, lang)}</p>
                  <ul className="mt-4 space-y-2 text-[13.5px]">
                    {st.caps.map((c) => (
                      <li key={c.t.en} className="flex items-start gap-2">
                        <span className="mt-[7px] h-1.5 w-1.5 flex-none rounded-full" style={{ background: c.status ? '#CBD5E1' : '#00ACE4' }} />
                        <span className="min-w-0">
                          {c.status ? <span className="text-body-2">{pick(c.t, lang)}</span> : <Link href={c.href} className="underline-offset-2 hover:underline">{pick(c.t, lang)}</Link>}
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
            { h: { zh: '一条对话', en: 'One conversation' }, p: { zh: '一个 AI 助理跟着你的三种身份：租客、房东、经纪的事都由它办，只对你负责；记忆与画像跨身份延续，各身份的流程与数据分开。', en: 'One assistant across your hats — tenant, landlord, agent — answering only to you; memory and profile carry across, each hat keeps its own flow and data.' } },
            { h: { zh: '一条审批链', en: 'One approval chain' }, p: { zh: '发信、发租约、发续约函先变成卡片：预览正文 → 批准 → 60 秒可撤销 → 执行 → 审计。', en: 'Emails, leases and renewal letters become cards: preview → approve → 60-second undo → execute → audit.' } },
            { h: { zh: '一套规则', en: 'One rule set' }, p: { zh: '安省 RTA、OHRC 与《消费者报告法》的规则是单一来源，发布检查、租约草稿、通知信和 API 引用同一份。', en: 'Ontario RTA, OHRC and Consumer Reporting Act rules live in one place, cited by publish checks, lease drafts, notices and the API alike.' } },
          ].map((b) => (
            <div key={b.h.en} className="rounded-2xl p-5 text-white" style={{ background: '#1B1B3C' }}>
              <div className="text-[16px] font-bold">{pick(b.h, lang)}</div>
              <p className="mt-1.5 text-[13.5px] leading-relaxed" style={{ color: '#B7C2D6' }}>{pick(b.p, lang)}</p>
            </div>
          ))}
        </div>
        <p className="mt-4 text-[12.5px] text-body-3">
          {zh ? '标「示范」的项目仍是产品演示，标「即将」的项目接口已接、待供应商凭证。规则全文见 ' : 'Items marked "demo" are still product demos; "soon" means the integration is built and awaits provider credentials. Full rules: '}
          <Link href="/rules" className="underline">/rules</Link>.
        </p>
      </section>

      {/* ================= PRODUCT 2: API ================= */}
      <section id="api" className="border-t border-line-divider" style={{ background: '#F3F8FC' }}>
        <div className="mx-auto max-w-[1100px] px-5 py-14 sm:px-7">
          <div className="font-mono text-[11px] font-bold uppercase tracking-eyebrowLg text-body-3">{zh ? '产品二' : 'Product 2'}</div>
          <h2 className="mt-2 text-[26px] font-extrabold leading-tight tracking-tight sm:text-[34px]">Stayloop API</h2>
          <p className="mt-2 max-w-[720px] text-[15.5px] text-body-2">
            {zh
              ? '全流程里产生的事实与规则，以三个端点开放给物业系统、租赁平台和合作方。申请人主动出示，合作方只拿到结论；每次调用留痕并通知申请人。'
              : 'The facts and rules produced across the lifecycle, exposed to property systems, rental platforms and partners through three endpoints. Applicants present; partners receive conclusions only; every call is audited and the applicant is told.'}
          </p>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {API_POINTS.map((a) => (
              <div key={a.code} className="rounded-2xl border border-line-divider bg-white p-5">
                <code className="font-mono text-[12.5px] font-bold text-brand">{a.code}</code>
                <p className="mt-2 text-[13.5px] leading-relaxed text-body-2">{pick(a.t, lang)}</p>
              </div>
            ))}
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/stayloop-api" className="sl-btn-primary">{zh ? '了解 Stayloop API' : 'About Stayloop API'}</Link>
            <Link href="/stayloop-api/docs" className="sl-btn-secondary">{zh ? '接口文档' : 'API docs'}</Link>
          </div>
        </div>
      </section>

      {/* ================= FINAL ================= */}
      <section className="mx-auto max-w-[1100px] px-5 py-16 text-center sm:px-7">
        <h2 className="text-[26px] font-extrabold leading-tight tracking-tight sm:text-[34px]">{zh ? '从任何一个阶段进来，都在同一条流程里。' : 'Enter at any stage — it is the same flow.'}</h2>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Link href="/?role=tenant" className="sl-btn-secondary">{zh ? '我是租客' : 'I’m a tenant'}</Link>
          <Link href="/landlord" className="sl-btn-secondary">{zh ? '我是房东' : 'I’m a landlord'}</Link>
          <Link href="/agent" className="sl-btn-secondary">{zh ? '我是经纪' : 'I’m an agent'}</Link>
        </div>
      </section>
      <Footer />
    </div>
  )
}
