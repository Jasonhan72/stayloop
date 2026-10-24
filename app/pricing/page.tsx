'use client'

// V5.3 pricing — VOL3 ART32 (定价 · 三角色 + Trust API).
// Static three-role layout: tenants are free forever; landlords subscribe
// (免费 / $19 / $39 三档); agents subscribe too (免费 / $29 / $59 三档 —
// pure SaaS tooling, NO commission cut; Stayloop is not RECO-registered so
// referral fees are off the table). No showing fees; online rent collection
// is NOT live, so nothing here may promise it.
// The privacy of a tenant is never a product — paid value never changes an
// applicant's eligibility or ranking. The Stayloop API is the 4th business line.
// 2026-10-16 (V1.0 stage 5): the landlord Business tier keeps its name and
// price but no feature list — nothing is built for teams yet, so the card says
// so and points to /contact; the API section lists tier 1 (free, keyless,
// seven endpoints + MCP) and an institutional tier that is "contact us" until
// there are real institutional callers (open-api research D4-2).
import Link from 'next/link'
import { TRIAL_DAYS } from '@/lib/billing/entitlement'
import { LANDLORD_GO, LANDLORD_PRO, LANDLORD_PRO_PRICE } from '@/lib/billing/landlordPlans'
import { useState } from 'react'
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
  includesLabel: LS
  /** Omitted on a tier whose feature list is deliberately not published (landlord Business, 2026-10-16). */
  features?: Feature[]
  /** Shown in place of the feature list when `features` is absent. */
  note?: LS
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
          { zh: 'AI 助理全功能', en: 'Full AI Agent' },
          { zh: '筛查与核验不向你收一分钱 · RTA s.134', en: 'Screening and verification never cost you a cent · RTA s.134' },
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
        name: LANDLORD_GO.name,
        price: { zh: '$0', en: '$0' },
        priceUnit: { zh: '永久免费', en: 'free forever' },
        tagline: LANDLORD_GO.tagline,
        cta: { zh: '免费发布房源', en: 'List a property free' },
        href: '/dashboard/listings/new',
        includesLabel: { zh: '包含:', en: 'Included:' },
        // One list for /pricing, the dashboard upgrade dialog and /settings (lib/billing/landlordPlans.ts).
        features: LANDLORD_GO.features,
      },
      {
        name: LANDLORD_PRO.name,
        price: { zh: `$${LANDLORD_PRO_PRICE}`, en: `$${LANDLORD_PRO_PRICE}` },
        priceUnit: { zh: '/ 月', en: '/ month' },
        tagline: LANDLORD_PRO.tagline,
        cta: { zh: '升级到专业版', en: 'Upgrade to Pro' },
        href: '/dashboard?upgrade=1',
        includesLabel: { zh: '起步的全部,另加:', en: 'Everything in Go, plus:' },
        features: LANDLORD_PRO.features,
        highlight: true,
      },
      {
        name: { zh: '团队', en: 'Business' },
        price: { zh: '$39', en: '$39' },
        priceUnit: { zh: '/ 月 · 尚未开售', en: '/ month · not yet on sale' },
        tagline: { zh: '给管理多套物业的团队。尚未开售。', en: 'For teams managing several properties. Not yet on sale.' },
        cta: { zh: '联系我们', en: 'Contact us' },
        href: '/contact',
        includesLabel: { zh: '包含:', en: 'Included:' },
        // 2026-10-16: no feature list — nothing team-specific is built yet; the list is decided when a real team needs it.
        note: { zh: '功能清单待定，等有真实团队需求再定。现在需要多人协作的房东请联系我们，先用专业档。', en: 'The feature list is to be decided once a real team needs it. Landlords who need multi-user access today: contact us and use Pro for now.' },
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
          { zh: 'AI 助理基础功能', en: 'AI Agent basics' },
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
          { zh: 'AI 助理全功能', en: 'Full AI Agent' },
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
              {t.features ? (
                <ul className="mt-3 space-y-2 text-[13px]">
                  {t.features.map((f) => (
                    <li key={f.zh} className="flex items-start gap-2">
                      <span className="mt-[3px] flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full text-[10px]" style={{ background: `${plan.accent}22`, color: plan.accent }}>✓</span>
                      <span className="leading-snug">{f[lang]}{f.href && <> <Link href={f.href} className="whitespace-nowrap text-brand underline underline-offset-2">{lang === 'zh' ? '了解 →' : 'Learn →'}</Link></>}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-[13px] leading-relaxed text-body-3" data-testid="tier-note">{t.note?.[lang]}</p>
              )}
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
  return (
    <>
      <Header variant="transparent" />
      <main>
        <div className="border-b border-emerald-200 bg-emerald-50 px-4 py-3 text-center text-[13px] font-semibold text-emerald-900" data-testid="pricing-trial-banner">
          {lang === 'zh' ? `租客永久免费 · 房东免费档永久免费 · 新注册的房东账号 Pro 功能免费试用 ${TRIAL_DAYS} 天，不要信用卡，到期自动降回免费档。标「即将推出」的模块尚未上线，不在免费范围内，也不会另收费。` : `Tenants: free forever · Landlord Go: free forever · New landlord accounts get every Pro feature free for ${TRIAL_DAYS} days, no card, then drop to Go automatically. Modules marked "coming soon" are not live yet; they are neither included nor charged for.`}
        </div>
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
        <RolePlansSection lang={lang} zh={zh} />

        {/* Stayloop API — 4th business line. Tier 1 is free and keyless (seven endpoints + MCP);
            the institutional tier has no price until there are real institutional callers. */}
        <section className="mx-auto max-w-[1100px] px-5 pb-12 sm:px-7 lg:px-12" data-testid="pricing-api">
          <div className="sl-card overflow-hidden p-8" style={{ background: 'linear-gradient(135deg, #0B0B0E 0%, #1E293B 100%)' }}>
            <div className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg" style={{ color: '#93C5FD' }}>
              {zh ? 'STAYLOOP API · 给开发者与合作方的接口' : 'STAYLOOP API · For developers and partners'}
            </div>
            <h2 className="mt-2 text-[26px] font-bold tracking-tight text-white">
              {zh ? '租房规则、合规检查、日期算术和租金基准，接进你的系统或你的 AI 客户端' : 'Rental rules, compliance checks, date arithmetic and rent benchmarks, inside your system or your AI client'}
            </h2>
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <div className="rounded-[14px] border border-white/15 bg-white/5 p-5" data-testid="pricing-api-tier1">
                <div className="flex items-baseline justify-between gap-3">
                  <div className="text-[17px] font-bold text-white">{zh ? '第一档 · 开放' : 'Tier 1 · open'}</div>
                  <div className="text-[13px] font-semibold" style={{ color: '#93C5FD' }}>{zh ? '免费 · 无需密钥' : 'Free · no key'}</div>
                </div>
                <p className="mt-2 text-[13.5px] leading-relaxed" style={{ color: '#D3E3EF' }}>
                  {zh
                    ? '七个端点 + 一个 MCP 端点：规则清单、房源合规检查、租约条款检查、租金指导比例、N4 最早终止日、持续迟付判定、租金基准（CMHC + 加拿大统计局，开放授权）。不接受、不存储个人信息；按调用方或 IP 限流。'
                    : 'Seven endpoints + one MCP endpoint: the rules list, listing compliance, lease-terms check, rent-increase guideline, N4 earliest termination, persistent late payment, rent benchmarks (CMHC + Statistics Canada, open licences). No personal data accepted or stored; rate-limited per caller or IP.'}
                </p>
                <Link href="/stayloop-api/docs" className="mt-4 inline-flex items-center justify-center rounded-[10px] bg-white px-5 py-[10px] text-[14px] font-semibold text-ink transition hover:opacity-90">
                  {zh ? '接口文档 →' : 'API docs →'}
                </Link>
              </div>
              <div className="rounded-[14px] border border-white/15 bg-white/5 p-5" data-testid="pricing-api-institutional">
                <div className="flex items-baseline justify-between gap-3">
                  <div className="text-[17px] font-bold text-white">{zh ? '机构档' : 'Institutional'}</div>
                  <div className="text-[13px] font-semibold" style={{ color: '#93C5FD' }}>{zh ? '联系我们' : 'Contact us'}</div>
                </div>
                <p className="mt-2 text-[13.5px] leading-relaxed" style={{ color: '#D3E3EF' }}>
                  {zh
                    ? '物业系统、经纪工具等需要更高配额、申请人授权的核验结论（第二档）或支持承诺的机构。定价等有真实机构调用方后再定；筛查接口在 Stayloop 完成《消费者报告法》注册前不开放。'
                    : 'For property systems, brokerage tools and other institutions that need higher quotas, applicant-authorised verification (tier 2) or a support commitment. Pricing is set once there are real institutional callers; the screening endpoint stays closed until Stayloop’s Consumer Reporting Act registration is complete.'}
                </p>
                <Link href="/contact" className="mt-4 inline-flex items-center justify-center rounded-[10px] border border-white/40 px-5 py-[10px] text-[14px] font-semibold text-white transition hover:bg-white/10">
                  {zh ? '联系我们 →' : 'Contact us →'}
                </Link>
              </div>
            </div>
            <p className="mt-4 text-[12.5px]" style={{ color: '#93A4B8' }}>
              <Link href="/stayloop-api" className="underline">{zh ? '了解 Stayloop API →' : 'About the Stayloop API →'}</Link>
              {zh ? ' · 使用规则见服务条款第 7 节' : ' · usage rules: Terms of Service §7'}
            </p>
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
              { q: { zh: '租客真的永远免费吗?', en: 'Are tenants really free forever?' }, a: { zh: '是。找房、申请、签约、报修和护照分享链接都免费；房东的筛查与核验费用也不能转给你（安省 RTA s.134）。', en: 'Yes. Searching, applying, signing, repairs and your Passport share link are all free, and a landlord cannot pass screening or verification costs on to you (Ontario RTA s.134).' } },
              { q: { zh: '经纪订阅包含什么?', en: 'What does the agent subscription include?' }, a: { zh: '现在可用的是免费档：RECO 注册核验徽章、认证经纪目录与 AI 助理。日程编排、客户管理等付费工具即将推出、尚未开售。不抽任何佣金。', en: 'Available today is the free tier: the RECO-checked badge, the verified agent directory and the AI Agent. Paid tools such as scheduling and client management are coming soon and not yet on sale. No commission cut.' } },
              { q: { zh: '为什么不收带看费、不抽租金?', en: 'Why no showing fees and no rent skim?' }, a: { zh: '我们只收订阅费。Stayloop 目前不经手租金（在线收租尚未上线），租客也零负担。', en: 'We only charge subscriptions. Stayloop does not handle rent today (online rent collection is not live), and tenants pay nothing.' } },
              { q: { zh: '房东免费档够用吗?', en: 'Is the landlord free tier enough?' }, a: { zh: '多数个人房东够用：发布房源、收申请、每月 3 次 AI 筛查都在免费档，还送 1 次深度核查；新注册账号前 30 天按 Pro 计。需要更多筛查、深度核查或已核验服务商网络时再升级。', en: 'For most individual landlords, yes: listing, applications and 3 AI screenings a month are in the free tier, plus one deep check; a new account runs as Pro for its first 30 days. Upgrade when you need more screenings, deep checks or the verified provider network.' } },
              { q: { zh: '只筛一两个人，非要订阅吗?', en: 'Screening one or two applicants — do I need a subscription?' }, a: { zh: '不用。免费档每月 3 次筛查，并送 1 次深度核查；之后只有深度核查（公司注册交叉核查、董事比对、关联关系识别，以及陆续上线的身份 / 银行 / 征信直连）需要解锁——单个申请人 $14.99 一次性，由房东支付（安省 RTA s.134 禁止向申请人收取任何费用）。多套房再考虑 Pro。', en: 'No. The free tier includes 3 screenings a month plus one deep check. Beyond that, only deep checks (company-registry cross-check, director matching, related-party detection, and the ID / bank / credit direct verification as it launches) need an unlock — $14.99 one-time per applicant, paid by the landlord (Ontario\'s RTA s.134 prohibits charging applicants). Pro is for landlords with several properties.' } },
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
