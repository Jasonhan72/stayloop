'use client'

// V5.3 pricing — VOL3 ART32 (定价 · 三角色 + Trust API).
// Static three-role layout: tenants are free forever; landlords subscribe
// (免费 / $19 / $39 三档); agents subscribe too (免费 / $29 / $59 三档 —
// pure SaaS tooling, NO commission cut; Stayloop is not RECO-registered so
// referral fees are off the table). No showing fees, no rent skimming.
// The privacy of a tenant is never a product — paid value never changes an
// applicant's eligibility or ranking. Trust API is the 4th business line.
import Link from 'next/link'
import { useState } from 'react'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { useT, type Lang } from '@/lib/i18n'

type LS = Record<Lang, string>

type Tier = {
  name: LS
  price: LS
  priceUnit: LS
  tagline: LS
  cta: LS
  href: string
  includesLabel: LS
  features: LS[]
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
    accent: '#7C3AED',
    tiers: [
      {
        name: { zh: '免费', en: 'Free' },
        price: { zh: '$0', en: '$0' },
        priceUnit: { zh: '永远免费 · 无需信用卡', en: 'free forever · no credit card' },
        tagline: { zh: '全部功能，永远免费。', en: 'Everything included, free forever.' },
        cta: { zh: '免费开始', en: 'Start free' },
        href: '/onboarding/welcome',
        includesLabel: { zh: '全部包含:', en: 'Everything included:' },
        features: [
          { zh: '个人 AI Agent 全功能', en: 'Full personal AI agent' },
          { zh: '四枚章,全部免费盖', en: 'All four stamps free to earn' },
          { zh: '申请 · 签约 · 维修全流程', en: 'Apply, sign and maintenance end to end' },
          { zh: '持牌经纪免费带看', en: 'Free showings with licensed agents' },
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
    accent: '#047857',
    tiers: [
      {
        name: { zh: '起步', en: 'Go' },
        price: { zh: '$0', en: '$0' },
        priceUnit: { zh: '永久免费', en: 'free forever' },
        tagline: { zh: '一套房，免费开始。', en: 'One property, free to start.' },
        cta: { zh: '免费发布房源', en: 'List a property free' },
        href: '/dashboard/listings/new',
        includesLabel: { zh: '包含:', en: 'Included:' },
        features: [
          { zh: '1 套房源', en: '1 listing' },
          { zh: 'AI 摘要评分', en: 'AI summary scoring' },
          { zh: '接收申请 + 看房意向', en: 'Applications + showing intents' },
          { zh: '在线收租，不抽流水', en: 'Online rent collection, no cut' },
        ],
      },
      {
        name: { zh: '专业', en: 'Pro' },
        price: { zh: '$19', en: '$19' },
        priceUnit: { zh: '/ 月', en: '/ month' },
        tagline: { zh: '全部功能，无限房源。', en: 'Everything, unlimited listings.' },
        cta: { zh: '升级到专业版', en: 'Upgrade to Pro' },
        href: '/dashboard/listings/new',
        includesLabel: { zh: '起步的全部,另加:', en: 'Everything in Go, plus:' },
        features: [
          { zh: '无限发布房源', en: 'Unlimited listings' },
          { zh: 'AI Agent 全功能', en: 'Full AI agent' },
          { zh: '验证 / 筛查全含', en: 'Verification / screening included' },
          { zh: '租约起草 + 一键续约', en: 'Lease drafting + 1-click renewals' },
          { zh: '财务面板 + 税务表(T776)', en: 'Finance dashboard + tax forms (T776)' },
        ],
        highlight: true,
      },
      {
        name: { zh: '团队', en: 'Business' },
        price: { zh: '$39', en: '$39' },
        priceUnit: { zh: '/ 月', en: '/ month' },
        tagline: { zh: '团队协作，管理多套物业。', en: 'Team collaboration across properties.' },
        cta: { zh: '升级到团队版', en: 'Upgrade to Business' },
        href: '/dashboard/listings/new',
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
    accent: '#2563EB',
    tiers: [
      {
        name: { zh: '起步', en: 'Go' },
        price: { zh: '$0', en: '$0' },
        priceUnit: { zh: '永久免费', en: 'free forever' },
        tagline: { zh: '每月 5 个客户，免费试用。', en: '5 clients a month, free.' },
        cta: { zh: '免费开始', en: 'Start free' },
        href: '/agent/onboarding',
        includesLabel: { zh: '包含:', en: 'Included:' },
        features: [
          { zh: '5 个客户 / 月', en: '5 clients / month' },
          { zh: 'AI Agent 基础功能', en: 'AI agent basics' },
          { zh: '看房排程 + 现场记录', en: 'Showing scheduler + on-site notes' },
          { zh: '不抽佣金', en: 'No commission cut' },
        ],
      },
      {
        name: { zh: '专业', en: 'Pro' },
        price: { zh: '$29', en: '$29' },
        priceUnit: { zh: '/ 月', en: '/ month' },
        tagline: { zh: '无限客户，全部功能。', en: 'Unlimited clients, everything included.' },
        cta: { zh: '升级到专业版', en: 'Upgrade to Pro' },
        href: '/agent/onboarding',
        includesLabel: { zh: '起步的全部,另加:', en: 'Everything in Go, plus:' },
        features: [
          { zh: '无限客户', en: 'Unlimited clients' },
          { zh: 'AI Agent 全功能', en: 'Full AI agent' },
          { zh: 'RECO 合规工具 + 审计提醒', en: 'RECO compliance tools + audit reminders' },
          { zh: '自动跟进与催款', en: 'Automated follow-ups and collections' },
        ],
        highlight: true,
      },
      {
        name: { zh: '团队', en: 'Business' },
        price: { zh: '$59', en: '$59' },
        priceUnit: { zh: '/ 月', en: '/ month' },
        tagline: { zh: '团队协作后台。', en: 'A shared team back office.' },
        cta: { zh: '升级到团队版', en: 'Upgrade to Business' },
        href: '/agent/onboarding',
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

function RolePlansSection({ lang, zh }: { lang: Lang; zh: boolean }) {
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
              href={t.href}
              className={
                'mt-4 inline-flex w-full items-center justify-center rounded-[10px] px-4 py-[12px] text-[14px] font-semibold transition active:translate-y-px ' +
                (t.highlight ? 'text-white' : 'border border-line-strong bg-white text-body hover:border-brand hover:text-brand')
              }
              style={t.highlight ? { background: plan.accent, boxShadow: `0 6px 18px -8px ${plan.accent}88` } : undefined}
            >
              {t.cta[lang]}
            </Link>
            <div className="mt-6 border-t border-line-divider pt-5">
              <div className="text-[12.5px] font-bold text-body">{t.includesLabel[lang]}</div>
              <ul className="mt-3 space-y-2 text-[13px]">
                {t.features.map((f) => (
                  <li key={f.zh} className="flex items-start gap-2">
                    <span className="mt-[3px] flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full text-[10px]" style={{ background: `${plan.accent}22`, color: plan.accent }}>✓</span>
                    <span className="leading-snug">{f[lang]}</span>
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
  return (
    <>
      <Header variant="transparent" />
      <main>
        <section
          className="relative overflow-hidden"
          style={{ background: 'linear-gradient(180deg, #F2EEE5 0%, #E4EEE3 100%)', marginTop: -72, paddingTop: 72 }}
        >
          <div className="mx-auto max-w-[1100px] px-5 pb-10 pt-20 text-center sm:px-7 lg:px-12">
            <div className="font-mono text-[11px] font-bold uppercase tracking-eyebrowLg text-brand">
              {zh ? 'PRICING · 透明 · 无隐藏' : 'PRICING · Transparent · No hidden fees'}
            </div>
            <h1 className="mx-auto mt-3 max-w-[820px] text-[30px] font-extrabold leading-tight tracking-tight sm:text-[44px] lg:text-[52px]">
              {zh ? <>简单透明的订阅定价</> : <>Simple, transparent subscription pricing</>}
            </h1>
            <p className="mx-auto mt-4 max-w-[680px] text-[15.5px] leading-relaxed text-body-2">
              {zh ? '只收订阅费，不抽佣金、不抽租金。' : 'Subscription only — no commission, no cut of the rent.'}
            </p>
          </div>
        </section>

        {/* Role switcher + named tiers per role */}
        <RolePlansSection lang={lang} zh={zh} />

        {/* Trust API — 4th business line */}
        <section className="mx-auto max-w-[1100px] px-5 pb-12 sm:px-7 lg:px-12">
          <div className="sl-card overflow-hidden p-8" style={{ background: 'linear-gradient(135deg, #0B0B0E 0%, #1E293B 100%)' }}>
            <div className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg" style={{ color: '#93C5FD' }}>
              {zh ? 'TRUST API · 企业服务' : 'TRUST API · Enterprise'}
            </div>
            <h2 className="mt-2 text-[26px] font-bold tracking-tight text-white">
              {zh ? '给银行和保险机构的验证接口' : 'A verification API for banks and insurers'}
            </h2>
            <p className="mt-3 max-w-[760px] text-[14px] leading-relaxed" style={{ color: '#CBD5E1' }}>
              {zh
                ? '机构通过 API 验证租客的租房资质，只得到「已验证」的结果，拿不到任何原始文件。'
                : 'Institutions verify a tenant’s rental standing via API — they get a “verified” result, never the raw documents.'}
            </p>
            <Link
              href="/contact"
              className="mt-5 inline-flex items-center justify-center rounded-[10px] bg-white px-5 py-[12px] text-[14px] font-semibold text-ink transition hover:opacity-90"
            >
              {zh ? '联系企业销售 →' : 'Contact enterprise sales →'}
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
                <>验证、筛查、收租、租约起草都含在订阅里。带看由<b>持牌经纪</b>完成。我们不抽佣金、不抽租金流水——付费只解锁你自己的工具，不影响任何人的资格。</>
              ) : (
                <>Verification, screening, rent collection and lease drafting are all part of the subscription. Showings are done by <b>licensed agents</b>. We take no commission and no cut of the rent — paying unlocks your own tools, and never affects anyone’s eligibility.</>
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
              { q: { zh: '经纪订阅包含什么?', en: 'What does the agent subscription include?' }, a: { zh: '日程编排、客户管理、RECO 合规提醒等全套工具。免费档 5 个客户/月，Pro 无限客户。不抽任何佣金。', en: 'The full toolset: scheduling, client management, RECO compliance reminders. Free tier is 5 clients/month; Pro is unlimited. No commission cut.' } },
              { q: { zh: '为什么不收带看费、不抽租金?', en: 'Why no showing fees and no rent skim?' }, a: { zh: '我们只收订阅费。租金流水一分不抽，租客也零负担。', en: 'We only charge subscriptions. Nothing is taken from the rent, and tenants pay nothing.' } },
              { q: { zh: '房东免费档够用吗?', en: 'Is the landlord free tier enough?' }, a: { zh: '一套房够用：发布房源、收申请、AI 评分、在线收租都在免费档。多套房或要完整 AI Agent 再升级。', en: 'For one property, yes: listing, applications, AI scoring and rent collection are all in the free tier. Upgrade when you have more properties or want the full AI agent.' } },
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
