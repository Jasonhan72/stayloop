'use client'

// V5.3 pricing — VOL3 ART32 (定价 · 三角色 + Trust API).
// Static three-role layout: tenants are free forever; landlords subscribe
// (免费 / $19 / $39 三档); agents subscribe too (免费 / $29 / $59 三档 —
// pure SaaS tooling, NO commission cut; Stayloop is not RECO-registered so
// referral fees are off the table). No showing fees, no rent skimming.
// The privacy of a tenant is never a product — paid value never changes an
// applicant's eligibility or ranking. Trust API is the 4th business line.
import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { useT, type Lang } from '@/lib/i18n'

type LS = Record<Lang, string>

type Card = {
  role: LS
  tagline: LS
  accent: string
  price: LS
  priceUnit: LS
  priceNote: LS
  cta: LS
  href: string
  features: LS[]
  highlight?: boolean
}

const CARDS: Card[] = [
  {
    role: { zh: '租客', en: 'Tenant' },
    tagline: { zh: '你的 AI 租房助手', en: 'Your personal rental AI' },
    accent: '#7C3AED',
    price: { zh: '$0', en: '$0' },
    priceUnit: { zh: '永远免费', en: 'free forever' },
    priceNote: { zh: '无任何交易费 · 隐私永远不是商品', en: 'No transaction fees · privacy is never a product' },
    cta: { zh: '唤醒你的 AI 助手', en: 'Wake up your AI' },
    href: '/onboarding/welcome',
    features: [
      { zh: 'Luna 个人 Agent 全功能', en: 'Full Luna personal agent' },
      { zh: '认证 1–4 级,全部免费升级', en: 'Tiers 1–4 all upgraded free' },
      { zh: '申请 · 签约 · 维修全流程', en: 'Apply, sign and maintenance end to end' },
      { zh: '信用记录跨平台可携带', en: 'Portable tenant credit record' },
      { zh: '数据可导出、可删除', en: 'Full data export / deletion rights' },
    ],
  },
  {
    role: { zh: '房东', en: 'Landlord' },
    tagline: { zh: 'AI 替你出租和管房', en: 'AI rents and manages for you' },
    accent: '#047857',
    price: { zh: '$19', en: '$19' },
    priceUnit: { zh: '/ 月', en: '/ month' },
    priceNote: { zh: '免费档:1 套房源 · 团队版 $39/月', en: 'Free tier: 1 listing · Team $39/month' },
    cta: { zh: '免费发布房源', en: 'List a property free' },
    href: '/dashboard/listings/new',
    highlight: true,
    features: [
      { zh: 'Logic Agent 全功能', en: 'Full Logic agent' },
      { zh: '无限发布房源', en: 'Unlimited listings' },
      { zh: '托管收租,不抽租金流水', en: 'Managed rent collection, no skim' },
      { zh: '租约起草 + 一键续约', en: 'Lease drafting + 1-click renewals' },
      { zh: '财务面板 + 税务表(T776)', en: 'Finance dashboard + tax forms (T776)' },
      { zh: '验证 / 背调全含在订阅里', en: 'Verification / screening all included' },
    ],
  },
  {
    role: { zh: '经纪', en: 'Agent' },
    tagline: { zh: 'AI 后台,杂活全包', en: 'An AI back office for the busywork' },
    accent: '#2563EB',
    price: { zh: '$29', en: '$29' },
    priceUnit: { zh: '/ 月', en: '/ month' },
    priceNote: { zh: '免费档:5 客户/月 · 团队版 $59/月', en: 'Free tier: 5 clients/month · Team $59/month' },
    cta: { zh: '免费开始', en: 'Start free' },
    href: '/agent/onboarding',
    features: [
      { zh: 'Brief Agent 全功能', en: 'Full Brief agent' },
      { zh: 'RECO 合规工具 + 审计提醒', en: 'RECO compliance tools + audit reminders' },
      { zh: '客户管理 + 看房排程', en: 'Client management + showing scheduler' },
      { zh: '跟进与催款,全自动', en: 'Follow-ups & collections, automated' },
      { zh: '纯 SaaS 工具,不抽佣金', en: 'Pure SaaS — no commission cut' },
    ],
  },
]

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
              {zh ? <>租客永远免费<br />房东 / 经纪按价值付费</> : <>Tenants always free<br />Landlords / agents pay for value</>}
            </h1>
            <p className="mx-auto mt-4 max-w-[680px] text-[15.5px] leading-relaxed text-body-2">
              {zh ? 'Stayloop 靠订阅收费 —— 租客的隐私永远不是商品。' : 'Stayloop runs on subscriptions — a tenant’s privacy is never a product.'}
            </p>
          </div>
        </section>

        {/* Three role cards */}
        <section className="mx-auto max-w-[1100px] px-5 py-10 sm:px-7 lg:px-12">
          <div className="grid gap-5 lg:grid-cols-3">
            {CARDS.map((c) => (
              <div
                key={c.role.zh}
                className={'sl-card flex flex-col p-7 ' + (c.highlight ? 'ring-2' : '')}
                style={c.highlight ? { borderColor: c.accent, boxShadow: `0 0 0 1px ${c.accent}` } : undefined}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: c.accent }} />
                    <h3 className="text-[24px] font-extrabold tracking-tight">{c.role[lang]}</h3>
                  </div>
                  {c.highlight && (
                    <span className="rounded-md px-2 py-[4px] font-mono text-[10px] font-bold uppercase tracking-wider text-white" style={{ background: c.accent }}>
                      {zh ? '最受欢迎' : 'Most popular'}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-[13.5px] text-body-2">{c.tagline[lang]}</p>

                <div className="mt-5 flex items-baseline gap-2">
                  <span className="text-[40px] font-extrabold leading-none tracking-tight">{c.price[lang]}</span>
                  <span className="text-[14px] font-semibold text-body-2">{c.priceUnit[lang]}</span>
                </div>
                <div className="mt-2 text-[12.5px] text-body-3">{c.priceNote[lang]}</div>

                <Link
                  href={c.href}
                  className="mt-5 inline-flex w-full items-center justify-center rounded-[10px] px-4 py-[12px] text-[14px] font-semibold text-white transition active:translate-y-px"
                  style={{ background: c.accent, boxShadow: `0 6px 18px -8px ${c.accent}88` }}
                >
                  {c.cta[lang]}
                </Link>

                <ul className="mt-6 space-y-2 border-t border-line-divider pt-5 text-[13px]">
                  {c.features.map((f) => (
                    <li key={f.zh} className="flex items-start gap-2">
                      <span className="mt-[3px] flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full text-[10px]" style={{ background: `${c.accent}22`, color: c.accent }}>✓</span>
                      <span className="leading-snug">{f[lang]}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        {/* Trust API — 4th business line */}
        <section className="mx-auto max-w-[1100px] px-5 pb-12 sm:px-7 lg:px-12">
          <div className="sl-card overflow-hidden p-8" style={{ background: 'linear-gradient(135deg, #0B0B0E 0%, #1E293B 100%)' }}>
            <div className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg" style={{ color: '#93C5FD' }}>
              {zh ? 'TRUST API · 第 4 商业线' : 'TRUST API · 4th business line'}
            </div>
            <h2 className="mt-2 text-[26px] font-bold tracking-tight text-white">
              {zh ? '把 Stayloop 的信任引擎给银行 / 保险 / 政府机构' : 'Give Stayloop’s trust engine to banks, insurers and government agencies'}
            </h2>
            <p className="mt-3 max-w-[760px] text-[14px] leading-relaxed" style={{ color: '#CBD5E1' }}>
              {zh
                ? '他们的产品里嵌入「Stayloop Trust Verified」。租客一次验证，到处通行。让 Stayloop 成为加拿大租住业的信任基础设施。'
                : 'Embed “Stayloop Trust Verified” inside their products. Tenants verify once and go anywhere — making Stayloop the trust infrastructure for Canadian renting.'}
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
              {zh ? '为什么这套定价合规' : 'Why this pricing is compliant'}
            </div>
            <h2 className="mt-2 text-[22px] font-bold tracking-tight">{zh ? '租客的隐私永远不是商品。付费只加价值,绝不改变房东看到的资格或排名。' : 'A tenant’s privacy is never a product. Paying only adds value — it never changes the eligibility or ranking a landlord sees.'}</h2>
            <p className="mt-3 max-w-[820px] text-[14px] leading-relaxed text-body-2">
              {zh ? (
                <>验证、筛查、收租、AI 起草 —— 全部含在 <b>订阅</b> 里,这些不是"交易行为",不碰合规红线。
                真正的看房与撮合交给 <b>持牌经纪</b>,他们通过订阅使用 Stayloop 的 AI 工具（任务编排、客户管理、合规提醒）。
                不抽佣金、不抽租金流水——纯工具订阅,零交易抽成。</>
              ) : (
                <>Verification, screening, rent collection and AI drafting are all bundled into the <b>subscription</b> — these aren’t “transactional” acts, so they stay clear of the compliance line.
                Real showings and matchmaking are left to <b>licensed agents</b>, who subscribe to Stayloop's AI tools (task orchestration, client management, compliance reminders).
                No commission cut, no skim on rent — pure SaaS tooling, zero transaction fees.</>
              )}
            </p>
          </div>
        </section>

        {/* FAQ */}
        <section className="mx-auto max-w-[1100px] px-5 pb-16 sm:px-7 lg:px-12">
          <h2 className="text-[24px] font-bold tracking-tight sm:text-[30px]">{zh ? '常见问题' : 'Frequently asked questions'}</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {[
              { q: { zh: '租客真的永远免费吗?', en: 'Are tenants really free forever?' }, a: { zh: '是。租客侧不收任何交易费 —— 身份验证、Passport、申请、电子签约、维修都免费,且认证 1–4 级全部免费升级。租客的隐私永远不是商品。', en: 'Yes. There are no transaction fees on the tenant side — identity verification, Passport, applications, e-signing and maintenance are all free, and Tiers 1–4 are all upgraded free. A tenant’s privacy is never a product.' } },
              { q: { zh: '经纪订阅包含什么?', en: 'What does the agent subscription include?' }, a: { zh: 'Brief Agent 全功能（任务编排、客户管理、看房排程、RECO 合规提醒）。免费档 5 个客户/月;Pro($29)无限客户;Team($59)多经纪协作 + 绩效面板。纯 SaaS 工具,不抽任何佣金。', en: 'Full Brief agent (task orchestration, client management, showing scheduler, RECO compliance reminders). Free tier: 5 clients/month; Pro ($29): unlimited; Team ($59): multi-agent collaboration + performance dashboard. Pure SaaS tooling — no commission cut.' } },
              { q: { zh: '为什么不收带看费、不抽租金?', en: 'Why no showing fees and no rent skim?' }, a: { zh: '收租与筛查是订阅内的服务,不是交易抽成;租金流水我们一分不抽。这让定价远离合规红线,也让租客零负担。', en: 'Rent collection and screening are subscription services, not transactional cuts — we take nothing from the rent flow. This keeps pricing well clear of the compliance line and keeps tenants at zero cost.' } },
              { q: { zh: '房东免费档够用吗?', en: 'Is the landlord free tier enough?' }, a: { zh: '免费档永久可用,可发布 1 套房源、收申请、用 Logic 摘要评分、Stripe 托管收租(平台不抽流水)。升级 Pro($19)或团队($39)解锁完整 Logic、无限房源与财务面板。', en: 'The free tier is permanent: list 1 property, receive applications, use Logic summary scoring, and Stripe-managed rent collection (the platform takes no cut of the flow). Upgrade to Pro ($19) or Team ($39) to unlock full Logic, unlimited listings and the finance dashboard.' } },
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
