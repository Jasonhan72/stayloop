'use client'

// V5.3 pricing — VOL3 ART32 (定价 · 三角色 + Trust API).
// Static three-role layout: tenants are free forever; landlords subscribe
// (免费 / $19 / $39 三档); agents subscribe too (免费 / $29 / $59 三档 —
// pure SaaS tooling, NO commission cut; Stayloop is not RECO-registered so
// referral fees are off the table). No showing fees; online rent collection
// is NOT live, so nothing here may promise it.
// The privacy of a tenant is never a product — paid value never changes an
// applicant's eligibility or ranking. Trust API is the 4th business line.
import Link from 'next/link'
import { INTERNAL_TEST_FREE_UNTIL_LABEL, inInternalTestWindow } from '@/lib/billing/freeWindow'
import { useEffect, useState } from 'react'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { useT, type Lang } from '@/lib/i18n'

type LS = Record<Lang, string>
/** A feature line; `href` adds a small "了解 →" link (the repairs network page, 2026-09-26). */
type Feature = LS & { href?: string }

type Tier = {
  name: LS
  price: LS
  priceUnit: LS
  tagline: LS
  cta: LS
  href: string
  /** Shown instead of cta / href while the internal test window is open. */
  ctaInWindow?: LS
  hrefInWindow?: string
  includesLabel: LS
  features: Feature[]
  highlight?: boolean
}

type RolePlan = {
  key: 'tenant' | 'landlord' | 'agent'
  role: LS
  accent: string
  tiers: Tier[]
}

const PLANS: RolePlan[] = [
  {
    key: 'tenant',
    role: { zh: '租客', en: 'Tenant' },
    accent: '#00ACE4',
    tiers: [
      {
        name: { zh: '免费', en: 'Free' },
        price: { zh: '$0', en: '$0' },
        priceUnit: { zh: '永远免费 · 无需信用卡', en: 'free forever · no credit card' },
        tagline: { zh: '全部功能，永远免费。', en: 'Everything included, free forever.' },
        cta: { zh: '免费开始', en: 'Start free' },
        href: '/onboarding/name',
        includesLabel: { zh: '全部包含:', en: 'Everything included:' },
        features: [
          { zh: '个人 AI Agent 全功能', en: 'Full personal AI agent' },
          { zh: '四枚章,全部免费盖', en: 'All four stamps free to earn' },
          { zh: '申请 · 签约 · 维修全流程', en: 'Apply, sign and maintenance end to end' },
          { zh: '可直接联系平台认证的持牌经纪（Stayloop 不收费）', en: 'Contact Stayloop-verified licensed agents directly (no fee from Stayloop)' },
          { zh: '租房记录可携带', en: 'Portable rental record' },
          { zh: '数据可导出、可删除', en: 'Full data export / deletion rights' },
        ],
        highlight: true,
      },
    ],
  },
  {
    key: 'landlord',
    role: { zh: '房东', en: 'Landlord' },
    accent: '#00ACE4',
    tiers: [
      {
        name: { zh: '起步', en: 'Go' },
        price: { zh: '$0', en: '$0' },
        priceUnit: { zh: '永久免费', en: 'free forever' },
        tagline: { zh: '免费开始发布房源。', en: 'Free to start listing.' },
        cta: { zh: '免费发布房源', en: 'List a property free' },
        href: '/dashboard/listings/new',
        includesLabel: { zh: '包含:', en: 'Included:' },
        features: [
          { zh: '房源发布', en: 'Publish listings' },
          { zh: '每月 5 次租客筛查（含取证与信用分析）', en: '5 tenant screenings a month (forensics + credit analysis included)' },
          { zh: '深度核查按次解锁 $14.99', en: 'Deep checks unlock per applicant at $14.99' },
          { zh: '接收在线申请', en: 'Receive online applications' },
          { zh: '维修工单 + 派给你自己的联系人', en: 'Repair tickets + dispatch to your own contacts', href: '/services' },
        ],
      },
      {
        name: { zh: '专业', en: 'Pro' },
        price: { zh: '$19', en: '$19' },
        priceUnit: { zh: '/ 月', en: '/ month' },
        tagline: { zh: '全部功能，无限房源。', en: 'Everything, unlimited listings.' },
        cta: { zh: '升级到专业版', en: 'Upgrade to Pro' },
        href: '/dashboard?upgrade=1',
        ctaInWindow: { zh: '测试期免费使用', en: 'Free during the test period' },
        hrefInWindow: '/dashboard',
        includesLabel: { zh: '起步的全部,另加:', en: 'Everything in Go, plus:' },
        features: [
          { zh: '无限发布房源', en: 'Unlimited listings' },
          { zh: 'AI Agent 全功能', en: 'Full AI agent' },
          { zh: '验证 / 筛查全含', en: 'Verification / screening included' },
          { zh: '租约起草 + 一键续约', en: 'Lease drafting + 1-click renewals' },
          { zh: '维修派单：已核验服务商网络 + 派单策略（紧急件自动派、预授权）· 不抽成，付款你与服务商直接结算', en: 'Repairs: verified provider network + dispatch policy (auto-dispatch emergencies, pre-approval) · no commission, you pay the provider directly', href: '/services' },
          { zh: '财务面板（即将推出）', en: 'Finance dashboard (coming soon)' },
        ],
        highlight: true,
      },
      {
        name: { zh: '团队', en: 'Business' },
        price: { zh: '$39', en: '$39' },
        priceUnit: { zh: '/ 月', en: '/ month' },
        tagline: { zh: '团队协作，管理多套物业。', en: 'Team collaboration across properties.' },
        cta: { zh: '升级到团队版', en: 'Upgrade to Business' },
        href: '/contact',
        includesLabel: { zh: '专业的全部,另加:', en: 'Everything in Pro, plus:' },
        features: [
          { zh: '多成员协作 + 权限', en: 'Multi-member collaboration + roles' },
          { zh: '多物业组合面板', en: 'Portfolio dashboard' },
          { zh: '操作审计留痕', en: 'Full audit trail' },
          { zh: '优先支持', en: 'Priority support' },
        ],
      },
    ],
  },
  {
    key: 'agent',
    role: { zh: '经纪', en: 'Agent' },
    accent: '#00ACE4',
    tiers: [
      {
        name: { zh: '起步', en: 'Go' },
        price: { zh: '$0', en: '$0' },
        priceUnit: { zh: '永久免费', en: 'free forever' },
        tagline: { zh: '免费开始。需 RECO 注册核验。', en: 'Free to start. Requires a RECO registration check.' },
        cta: { zh: '去认证', en: 'Get verified' },
        href: '/agent/verify',
        includesLabel: { zh: '包含:', en: 'Included:' },
        features: [
          { zh: 'RECO 注册核验徽章 + 认证经纪目录', en: 'RECO-checked badge + verified agent directory' },
          { zh: 'AI Agent 基础功能', en: 'AI agent basics' },
          { zh: '看房排程 + 现场记录（即将推出）', en: 'Showing scheduler + on-site notes (coming soon)' },
          { zh: '不抽佣金', en: 'No commission cut' },
        ],
      },
      {
        name: { zh: '专业', en: 'Pro' },
        price: { zh: '$29', en: '$29' },
        priceUnit: { zh: '/ 月', en: '/ month' },
        tagline: { zh: '无限客户，全部功能。需 RECO 注册核验。尚未开售。', en: 'Unlimited clients, everything included. Requires a RECO registration check. Not yet on sale.' },
        cta: { zh: '即将推出', en: 'Coming soon' },
        href: '/contact',
        includesLabel: { zh: '起步的全部,另加:', en: 'Everything in Go, plus:' },
        features: [
          { zh: '无限客户', en: 'Unlimited clients' },
          { zh: 'AI Agent 全功能', en: 'Full AI agent' },
          { zh: 'RECO 合规工具 + 审计提醒', en: 'RECO compliance tools + audit reminders' },
          { zh: '自动跟进提醒', en: 'Automated follow-up reminders' },
        ],
        highlight: true,
      },
      {
        name: { zh: '团队', en: 'Business' },
        price: { zh: '$59', en: '$59' },
        priceUnit: { zh: '/ 月', en: '/ month' },
        tagline: { zh: '团队协作后台。尚未开售。', en: 'A shared team back office. Not yet on sale.' },
        cta: { zh: '即将推出', en: 'Coming soon' },
        href: '/contact',
        includesLabel: { zh: '专业的全部,另加:', en: 'Everything in Pro, plus:' },
        features: [
          { zh: '多经纪协作 + 团队任务池', en: 'Multi-agent collaboration + shared task pool' },
          { zh: '绩效面板', en: 'Performance dashboard' },
          { zh: '团队权限与审计', en: 'Team roles & audit' },
          { zh: '优先支持', en: 'Priority support' },
        ],
      },
    ],
  },
]

function RolePlansSection({ lang, zh, inWindow }: { lang: Lang; zh: boolean; inWindow: boolean }) {
  const [active, setActive] = useState(1) // landlord opens by default (paying role)
  const plan = PLANS[active]
  return (
    <section className="mx-auto max-w-[1100px] px-5 py-10 sm:px-7 lg:px-12">
      {/* Role tabs */}
      <div className="flex flex-wrap justify-center gap-2">
        {PLANS.map((p, i) => (
          <button
            key={p.key}
            onClick={() => setActive(i)}
            aria-pressed={i === active}
            className="flex items-center gap-2 rounded-lg px-5 py-2.5 text-[14px] font-bold transition"
            style={
              i === active
                ? { background: '#fff', border: `1.5px solid ${p.accent}`, color: p.accent, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }
                : { background: 'transparent', border: '1.5px solid transparent', color: '#71717A' }
            }
          >
            <span className="h-2 w-2 rounded-full" style={{ background: p.accent }} />
            {p.role[lang]}
          </button>
        ))}
      </div>

      {/* Tier cards */}
      <div
        className={
          'mt-8 grid gap-5 ' +
          (plan.tiers.length === 1 ? 'mx-auto max-w-[460px]' : 'lg:grid-cols-3')
        }
      >
        {plan.tiers.map((t) => (
          <div
            key={t.name.en}
            className="sl-card flex flex-col p-7"
            style={t.highlight ? { borderColor: plan.accent, boxShadow: `0 0 0 1px ${plan.accent}` } : undefined}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-[20px] font-extrabold tracking-tight">{t.name[lang]}</h3>
              {t.highlight && plan.tiers.length > 1 && (
                <span className="rounded-md px-2 py-[4px] font-mono text-[10px] font-bold uppercase tracking-wider text-white" style={{ background: plan.accent }}>
                  {zh ? '最受欢迎' : 'Most popular'}
                </span>
              )}
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-[38px] font-extrabold leading-none tracking-tight">{t.price[lang]}</span>
              <span className="text-[13px] font-semibold text-body-2">{t.priceUnit[lang]}</span>
            </div>
            <p className="mt-3 min-h-[40px] text-[13.5px] leading-relaxed text-body-2">{t.tagline[lang]}</p>
            <Link
              href={inWindow && t.hrefInWindow ? t.hrefInWindow : t.href}
              className={
                'mt-4 inline-flex w-full items-center justify-center rounded-[10px] px-4 py-[12px] text-[14px] font-semibold transition active:translate-y-px ' +
                (t.highlight ? 'text-white' : 'border border-line-strong bg-white text-body hover:border-brand hover:text-brand')
              }
              style={t.highlight ? { background: plan.accent, boxShadow: `0 6px 18px -8px ${plan.accent}88` } : undefined}
            >
              {(inWindow && t.ctaInWindow ? t.ctaInWindow : t.cta)[lang]}
            </Link>
            <div className="mt-6 border-t border-line-divider pt-5">
              <div className="text-[12.5px] font-bold text-body">{t.includesLabel[lang]}</div>
              <ul className="mt-3 space-y-2 text-[13px]">
                {t.features.map((f) => (
                  <li key={f.zh} className="flex items-start gap-2">
                    <span className="mt-[3px] flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full text-[10px]" style={{ background: `${plan.accent}22`, color: plan.accent }}>✓</span>
                    <span className="leading-snug">{f[lang]}{f.href && <> <Link href={f.href} className="whitespace-nowrap text-brand underline underline-offset-2">{lang === 'zh' ? '了解 →' : 'Learn →'}</Link></>}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

export default function PricingPage() {
  const { lang } = useT()
  const zh = lang === 'zh'
  // This page is prerendered: evaluating the window during render would bake
  // the build-time answer into the HTML and mismatch the client after the end
  // date (React #418). Render closed first, then open it on the client.
  const [inWindow, setInWindow] = useState(false)
  useEffect(() => setInWindow(inInternalTestWindow()), [])
  return (
    <>
      <Header variant="transparent" />
      <main>
        {inWindow && (
          <div className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-center text-[13px] font-semibold text-amber-900">
            {lang === 'zh' ? `限时免费：到 ${INTERNAL_TEST_FREE_UNTIL_LABEL.zh} 为止，下面已上线的功能对所有账号免费，无需订阅或解锁。标「即将推出」的模块尚未上线，不在免费范围内，也不会另收费。` : `Free for a limited time: until ${INTERNAL_TEST_FREE_UNTIL_LABEL.en} every feature below that is live is free for every account — no subscription or unlock needed. Modules marked "coming soon" are not live yet; they are neither included nor charged for.`}
          </div>
        )}
        <section
          className="relative overflow-hidden"
          style={{ background: '#F3F8FC', borderBottom: '1px solid #E4EEF6', marginTop: -72, paddingTop: 72 }}
        >
          <div className="mx-auto max-w-[1100px] px-5 pb-10 pt-20 text-center sm:px-7 lg:px-12">
            <div className="font-mono text-[11px] font-bold uppercase tracking-eyebrowLg text-brand">
              {zh ? 'PRICING · 透明 · 无隐藏' : 'PRICING · Transparent · No hidden fees'}
            </div>
            <h1 className="mx-auto mt-3 max-w-[820px] text-[30px] font-semibold leading-[1.1] tracking-[-0.03em] sm:text-[38px] lg:text-[42px]">
              {zh ? <>简单透明的订阅定价</> : <>Simple, transparent subscription pricing</>}
            </h1>
            <p className="mx-auto mt-4 max-w-[680px] text-[15.5px] leading-relaxed text-body-2">
              {zh ? '只收订阅费，不抽佣金、不经手租金。' : 'Subscription only — no commission, and we never handle the rent.'}
            </p>
          </div>
        </section>

        {/* Role switcher + named tiers per role */}
        <RolePlansSection lang={lang} zh={zh} inWindow={inWindow} />

        {/* Stayloop API — 4th business line */}
        <section className="mx-auto max-w-[1100px] px-5 pb-12 sm:px-7 lg:px-12">
          <div className="sl-card overflow-hidden p-8" style={{ background: 'linear-gradient(135deg, #0B0B0E 0%, #1E293B 100%)' }}>
            <div className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg" style={{ color: '#93C5FD' }}>
              {zh ? 'STAYLOOP API · 给合作方的接口' : 'STAYLOOP API · For partners'}
            </div>
            <h2 className="mt-2 text-[26px] font-bold tracking-tight text-white">
              {zh ? '把房源合规检查、申请人出示的核验结论和筛查接进你的系统' : 'Listing compliance checks, applicant-presented verification and screening, inside your own system'}
            </h2>
            <p className="mt-3 max-w-[760px] text-[14px] leading-relaxed" style={{ color: '#D3E3EF' }}>
              {zh
                ? '三个端点，每个都有真实后端：房源合规检查免费无需密钥；申请人主动出示核验结论，合作方只拿到结论、拿不到文件；发起筛查走与产品同一条管线。面向金融机构的用途待法律意见。'
                : 'Three endpoints, each with a real backend: listing compliance is free and keyless; applicants present verification conclusions and partners never see documents; screening runs on the same pipeline as the product. Use by financial institutions is pending legal advice.'}
            </p>
            <Link
              href="/stayloop-api"
              className="mt-5 inline-flex items-center justify-center rounded-[10px] bg-white px-5 py-[12px] text-[14px] font-semibold text-ink transition hover:opacity-90"
            >
              {zh ? '了解 Stayloop API →' : 'About Stayloop API →'}
            </Link>
          </div>
        </section>

        {/* Compliance explainer — why this model stays on the right side of the line */}
        <section className="mx-auto max-w-[1100px] px-5 py-6 sm:px-7 lg:px-12">
          <div className="sl-card p-7">
            <div className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-body-3">
              {zh ? '一条底线' : 'One rule'}
            </div>
            <h2 className="mt-2 text-[22px] font-bold tracking-tight">{zh ? '付费不改变任何评分或排名。' : 'Paying never changes a score or a ranking.'}</h2>
            <p className="mt-3 max-w-[820px] text-[14px] leading-relaxed text-body-2">
              {zh ? (
                <>验证、筛查、租约起草都含在订阅里。带看由<b>持牌经纪</b>完成。我们不抽佣金，也不经手租金（在线收租尚未上线）——付费只解锁你自己的工具，不影响任何人的资格。</>
              ) : (
                <>Verification, screening and lease drafting are all part of the subscription. Showings are done by <b>licensed agents</b>. We take no commission and do not handle rent (online rent collection is not live) — paying unlocks your own tools, and never affects anyone’s eligibility.</>
              )}
            </p>
          </div>
        </section>

        {/* FAQ */}
        <section className="mx-auto max-w-[1100px] px-5 pb-16 sm:px-7 lg:px-12">
          <h2 className="text-[24px] font-bold tracking-tight sm:text-[30px]">{zh ? '常见问题' : 'Frequently asked questions'}</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {[
              { q: { zh: '租客真的永远免费吗?', en: 'Are tenants really free forever?' }, a: { zh: '是。验证、护照、申请、签约、维修全部免费，四枚章也免费盖。', en: 'Yes. Verification, Passport, applications, signing and maintenance are all free — including all four stamps.' } },
              { q: { zh: '经纪订阅包含什么?', en: 'What does the agent subscription include?' }, a: { zh: '现在可用的是免费档：RECO 注册核验徽章、认证经纪目录与 AI 助手。日程编排、客户管理等付费工具即将推出、尚未开售。不抽任何佣金。', en: 'Available today is the free tier: the RECO-checked badge, the verified agent directory and the AI assistant. Paid tools such as scheduling and client management are coming soon and not yet on sale. No commission cut.' } },
              { q: { zh: '为什么不收带看费、不抽租金?', en: 'Why no showing fees and no rent skim?' }, a: { zh: '我们只收订阅费。Stayloop 目前不经手租金（在线收租尚未上线），租客也零负担。', en: 'We only charge subscriptions. Stayloop does not handle rent today (online rent collection is not live), and tenants pay nothing.' } },
              { q: { zh: '房东免费档够用吗?', en: 'Is the landlord free tier enough?' }, a: { zh: '多数个人房东够用：发布房源、收申请、每月 5 次 AI 筛查都在免费档。需要更多筛查、深度核查或完整 AI Agent 再升级。', en: 'For most individual landlords, yes: listing, applications and 5 AI screenings a month are all in the free tier. Upgrade when you need more screenings, deep checks or the full AI agent.' } },
              { q: { zh: '只筛一两个人，非要订阅吗?', en: 'Screening one or two applicants — do I need a subscription?' }, a: { zh: '不用。免费档每月 5 次筛查；只有深度核查（公司注册交叉核查、董事比对、关联关系识别，以及陆续上线的身份 / 银行 / 征信直连）需要解锁——单个申请人 $14.99 一次性，由房东支付（安省 RTA s.134 禁止向申请人收取任何费用）。多套房再考虑 Pro。', en: 'No. The free tier includes 5 screenings a month. Only deep checks (company-registry cross-check, director matching, related-party detection, and the ID / bank / credit direct verification as it launches) need an unlock — $14.99 one-time per applicant, paid by the landlord (Ontario\'s RTA s.134 prohibits charging applicants). Pro is for landlords with several properties.' } },
            ].map((f) => (
              <div key={f.q.zh} className="sl-card p-5">
                <h4 className="text-[15px] font-bold">{f.q[lang]}</h4>
                <p className="mt-2 text-[13.5px] leading-relaxed text-body-2">{f.a[lang]}</p>
              </div>
            ))}
          </div>
        </section>
      </main>
      <Footer />
    </>
  )
}
