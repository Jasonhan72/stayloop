'use client'

// /services — the public face of the repairs & services network (services
// marketplace Phase 0–2, entry proposal approved 2026-09-26). Until now the
// marketplace was reachable only from inside a tenancy hub; this page is the
// one place that says what it is, who it is for and what it is not. Every
// sentence describes something that exists; the honest-state chips carry the
// pilot stage. The trades / credentials table reads lib/marketplace/trades.ts
// so the page can never drift from the eligibility rule the server enforces.
import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { useT, type Lang } from '@/lib/i18n'
import { CREDENTIAL_LABEL, TRADES } from '@/lib/marketplace/trades'

type Bi = { zh: string; en: string }
const pick = (b: Bi, lang: Lang) => (lang === 'zh' ? b.zh : b.en)

const FLOW: Bi[] = [
  { zh: '租客在在管租约上报修（可附照片）', en: 'The tenant files a ticket on the managed tenancy (photos optional)' },
  { zh: '房东派给已核验服务商，或自己的联系人（只要一个邮箱）', en: 'The landlord dispatches to a verified provider, or to their own contact (an email is enough)' },
  { zh: '服务商接单后报价；报价须房东批准', en: 'The provider accepts and quotes; the quote needs the landlord’s approval' },
  { zh: '批准即按 RTA s.27 给租客发进入通知（紧急件按 s.26）', en: 'Approval sends the tenant an RTA s.27 entry notice (s.26 for emergencies)' },
  { zh: '到场 → 完工 → 账单；超出报价 10% 会被标出（CPA）', en: 'Arrive → complete → invoice; anything over the quote by 10% is flagged (CPA)' },
  { zh: '房东验收、租客确认，付款线下直接结算——Stayloop 不抽成', en: 'Landlord accepts, tenant confirms, payment settles directly offline — Stayloop takes no commission' },
]

const AUDIENCES: { eyebrow: string; title: Bi; steps: Bi[]; cta: Bi; href: string }[] = [
  {
    eyebrow: 'LANDLORD · 房东',
    title: { zh: '房东怎么用', en: 'How landlords use it' },
    steps: [
      { zh: '报修工单出现在维修看板与在管租约页；每张工单上有「指派」', en: 'Tickets land on your maintenance board and the tenancy hub; every ticket has “Dispatch”' },
      { zh: '精选网络按工种 · 资质 · 城市筛过；也可派给你自己的联系人', en: 'The curated network is filtered by trade, credentials and city; your own contact works too' },
      { zh: '派单策略：只建议（默认）/ 紧急件自动派 / 全部自动派，紧急报价可预授权一个上限', en: 'Dispatch policy: suggest only (default) / auto-dispatch emergencies / auto-dispatch all, with an optional pre-approved cap for emergency quotes' },
      { zh: '报价卡、验收卡都进你的待办，60 秒内可撤销', en: 'Quote and acceptance cards sit in your to-do list with a 60-second undo' },
    ],
    cta: { zh: '去派单 · 服务商与策略 →', en: 'Dispatch · providers & policy →' },
    href: '/landlord/providers',
  },
  {
    eyebrow: 'PROVIDER · 服务商',
    title: { zh: '服务商怎么入驻', en: 'How providers join' },
    steps: [
      { zh: '填法定名 / 商号 / 工种 / 服务城市，添加每个工种要求的资质编号与到期日', en: 'Enter legal name / trade name / trades / cities, then each credential number and expiry your trades require' },
      { zh: 'Stayloop 管理员对照公开注册库人工核验，核验后才会收到派单', en: 'A Stayloop admin checks each credential against the public register; dispatch starts only after verification' },
      { zh: '接单前只看到城市；接单后看到完整地址与房东联系方式', en: 'Before accepting you see the city only; after accepting, the full address and landlord contact' },
      { zh: '不收入驻费、不抽成；付款由房东直接结算', en: 'No onboarding fee, no commission; the landlord pays you directly' },
    ],
    cta: { zh: '申请入驻 →', en: 'Apply to join →' },
    href: '/provider/onboard',
  },
  {
    eyebrow: 'TENANT · 租客',
    title: { zh: '租客看到什么', en: 'What tenants see' },
    steps: [
      { zh: '报修后工单状态一路可见：已派 → 已报价 → 已排期 → 处理中 → 待你确认', en: 'After filing, the ticket status is visible all the way: dispatched → quoted → scheduled → in progress → awaiting your confirmation' },
      { zh: '进入通知写明日期、时段与法条；非紧急件至少提前 24 小时、8:00–20:00', en: 'The entry notice states date, window and statute; non-emergencies at least 24 hours ahead, 8:00–20:00' },
      { zh: '完工后你确认问题已解决；验收后 14 天内可给服务商评价', en: 'After completion you confirm the problem is solved; you can review the provider within 14 days of acceptance' },
      { zh: '你的照片只有房东和被派单的服务商能看到', en: 'Your photos are visible only to the landlord and the dispatched provider' },
    ],
    cta: { zh: '我的报修 →', en: 'My repairs →' },
    href: '/tenant/maintenance',
  },
]

const HONEST: Bi[] = [
  { zh: '试点阶段：网络里的服务商还很少，覆盖多伦多及周边；没有合格服务商时，派给你自己的联系人所有计划都可用。', en: 'Pilot stage: the network is still small and covers Toronto and nearby cities; when no eligible provider exists, dispatching to your own contact works on every plan.' },
  { zh: '付款线下、不抽成：Stayloop 不经手任何资金，「标记已付」只是记录。', en: 'Payment is offline and commission-free: Stayloop never handles money; “mark as paid” is a record only.' },
  { zh: '没有公开的服务商目录：入驻信息只在房东派单时、按工种与城市可见。', en: 'There is no public provider directory: onboarding details are visible only to a landlord dispatching, by trade and city.' },
  { zh: '「资质已核」只表示核验日该编号在公开注册库上有效；到期后自动不再计入。争议由 Stayloop 管理员裁定，不替代法院或 LTB。', en: '“Verified” means the number was valid on the public register on the day it was checked; it stops counting at expiry. Disputes are ruled on by a Stayloop admin and do not replace a court or the LTB.' },
]

export default function ServicesPage() {
  const { lang } = useT()
  const zh = lang === 'zh'
  return (
    <div style={{ background: '#FFFFFF' }} className="text-body">
      <Header variant="transparent" />

      <section style={{ background: 'linear-gradient(180deg,#E9F5FD 0%,#FFFFFF 100%)' }}>
        <div className="mx-auto max-w-[1100px] px-5 py-14 sm:px-7 lg:py-18">
          <div className="font-mono text-[13px] font-semibold uppercase tracking-[.12em] text-brand">{zh ? 'STAYLOOP SERVICES · 维修与服务网络' : 'STAYLOOP SERVICES · Repairs & services network'}</div>
          <h1 className="mt-4 max-w-[760px] text-[clamp(28px,3.4vw,42px)] font-semibold leading-[1.1] tracking-[-0.03em]">
            {zh ? '报修到验收，一条留痕的工单；服务商凭资质入驻，付款你们直接结算。' : 'From ticket to acceptance, one traceable work order; providers join on credentials, and you settle payment directly.'}
          </h1>
          <p className="mt-4 max-w-[720px] text-[16px] leading-[1.6] text-body-2">
            {zh
              ? '房东在在管租约上收到报修，派给已核验的服务商或自己的联系人；报价须你批准，系统按 RTA s.27 给租客发进入通知；完工验收后线下结算，Stayloop 不抽成。'
              : 'A landlord receives the ticket on the managed tenancy and dispatches it to a verified provider or their own contact; the quote needs your approval, the system sends the tenant an RTA s.27 entry notice; after acceptance you settle offline, and Stayloop takes no commission.'}
          </p>
          <div className="mt-5 flex flex-wrap gap-2 text-[12.5px]">
            <span className="rounded-full border border-line-divider bg-white px-3 py-1">{zh ? '试点阶段 · 多伦多及周边' : 'Pilot · Toronto and nearby'}</span>
            <span className="rounded-full border border-line-divider bg-white px-3 py-1">{zh ? '付款线下 · 不抽成' : 'Offline payment · no commission'}</span>
            <span className="rounded-full border border-line-divider bg-white px-3 py-1">{zh ? '资质对照公开注册库人工核验' : 'Credentials checked by hand against public registers'}</span>
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/landlord/providers" className="sl-btn-primary">{zh ? '房东：去派单' : 'Landlords: dispatch'}</Link>
            <Link href="/provider/onboard" className="sl-btn-secondary">{zh ? '服务商：申请入驻' : 'Providers: apply to join'}</Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1100px] px-5 py-14 sm:px-7" id="flow">
        <h2 className="text-[24px] font-extrabold tracking-tight sm:text-[30px]">{zh ? '一张工单的六步' : 'Six steps of one work order'}</h2>
        <ol className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {FLOW.map((f, i) => (
            <li key={f.en} className="flex gap-3 rounded-2xl border border-line-divider bg-white p-4">
              <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-brand/10 font-mono text-[12px] font-bold text-brand">{i + 1}</span>
              <span className="text-[14px] leading-relaxed text-body-2">{pick(f, lang)}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="border-y border-line-divider" style={{ background: '#F3F8FC' }}>
        <div className="mx-auto max-w-[1100px] px-5 py-14 sm:px-7">
          <h2 className="text-[24px] font-extrabold tracking-tight sm:text-[30px]">{zh ? '三方各看到什么' : 'What each side sees'}</h2>
          <div className="mt-6 grid gap-5 md:grid-cols-3">
            {AUDIENCES.map((a) => (
              <div key={a.href} className="flex flex-col rounded-2xl border border-line-divider bg-white p-5">
                <div className="font-mono text-[11px] font-bold uppercase tracking-eyebrowLg text-body-3">{a.eyebrow}</div>
                <div className="mt-2 text-[17px] font-bold">{pick(a.title, lang)}</div>
                <ul className="mt-3 flex-1 space-y-2 text-[13.5px] leading-relaxed text-body-2">
                  {a.steps.map((s) => <li key={s.en} className="flex gap-2"><span className="mt-[9px] h-1.5 w-1.5 flex-none rounded-full bg-brand" /><span>{pick(s, lang)}</span></li>)}
                </ul>
                <Link href={a.href} className="mt-4 border-t border-line-divider pt-3 text-[13.5px] font-semibold text-brand hover:underline">{pick(a.cta, lang)}</Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1100px] px-5 py-14 sm:px-7" id="trades">
        <h2 className="text-[24px] font-extrabold tracking-tight sm:text-[30px]">{zh ? '工种与必需资质' : 'Trades and required credentials'}</h2>
        <p className="mt-2 max-w-[760px] text-[14.5px] leading-relaxed text-body-2">
          {zh
            ? '要求的是安省法律，不是 Stayloop 的规定：强制行业要 Skilled Trades Ontario 资格证，电气承包要 ESA 牌照，燃气设备要 TSSA 技师证，除虫要环境部许可；出租物业上的施工类工作要 WSIB 清关。每项须存在 · 已核 · 未过期，工种才算覆盖。'
            : 'The requirements are Ontario law, not Stayloop policy: compulsory trades need a Skilled Trades Ontario certificate, electrical contracting an ESA licence, gas equipment a TSSA certificate, pest control an MECP licence; construction-class work on a rental needs WSIB clearance. A trade counts as covered only when every item exists, is verified and is unexpired.'}
        </p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="trades-grid">
          {TRADES.map((t) => (
            <div key={t.key} className="rounded-2xl border border-line-divider bg-white p-4">
              <div className="text-[15px] font-bold">{zh ? t.zh : t.en}</div>
              <ul className="mt-2 space-y-1 text-[12.5px] leading-snug text-body-2">
                {t.required.map((k) => (
                  <li key={k}>
                    {CREDENTIAL_LABEL[k].url
                      ? <a href={CREDENTIAL_LABEL[k].url} target="_blank" rel="noopener noreferrer" className="underline decoration-line-strong underline-offset-2 hover:text-brand">{zh ? CREDENTIAL_LABEL[k].zh : CREDENTIAL_LABEL[k].en}</a>
                      : (zh ? CREDENTIAL_LABEL[k].zh : CREDENTIAL_LABEL[k].en)}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="mt-4 text-[12.5px] text-body-3">{zh ? '规则全文：' : 'Rules in full: '}<Link href="/rules" className="underline">/rules</Link>{zh ? '（维修与进入：RTA s.20 / s.26 / s.27、CPA 估价 10%）' : ' (repairs and entry: RTA s.20 / s.26 / s.27, CPA estimate 10%)'}</p>
      </section>

      <section className="border-t border-line-divider" style={{ background: '#F3F8FC' }}>
        <div className="mx-auto max-w-[1100px] px-5 py-12 sm:px-7">
          <h2 className="text-[22px] font-extrabold tracking-tight">{zh ? '现状与边界（先读这段）' : 'Status and boundary (read this first)'}</h2>
          <ul className="mt-3 list-disc space-y-1.5 pl-5 text-[14.5px] leading-relaxed text-body-2">
            {HONEST.map((b) => <li key={b.en}>{pick(b, lang)}</li>)}
          </ul>
          <p className="mt-6 text-[13px] text-body-3">
            {zh ? '维修工单与派给自己的联系人所有计划都含；已核验服务商网络与派单策略在 ' : 'Tickets and dispatch to your own contacts are on every plan; the verified network and dispatch policy are in '}
            <Link href="/pricing" className="underline">{zh ? '专业版' : 'Pro'}</Link>
            {zh ? '。整条租房流程见 ' : '. The whole rental flow: '}
            <Link href="/platform" className="underline">/platform</Link>.
          </p>
        </div>
      </section>
      <Footer />
    </div>
  )
}
