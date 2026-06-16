'use client'

// V5.3 pricing — VOL3 ART32 (定价 · 三角色 + Trust API).
// Static three-role layout: tenants are free forever; landlords subscribe
// (免费 / $19 / $39 三档); brokerages pay 25% only on a CLOSED deal
// (brokerage↔brokerage referral fee). No showing fees, no rent skimming.
// The privacy of a tenant is never a product — paid value never changes an
// applicant's eligibility or ranking. Trust API is the 4th business line.
import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'

type Card = {
  role: string
  accent: string
  tier: string
  price: string
  sub: string
  cta: string
  href: string
  features: string[]
  highlight?: boolean
}

const CARDS: Card[] = [
  {
    role: 'TENANT · 租客',
    accent: '#7C3AED',
    tier: '免费 · 永久',
    price: '$0',
    sub: '租客的隐私永远不是商品',
    cta: '90 秒身份验证',
    href: '/onboarding/welcome',
    features: [
      'Luna 个人 Agent 全功能',
      '认证 1–4 级 全部免费升级',
      '申请 / 谈判 / 签约 / 维修',
      '跨平台房客信用记录可携带',
      '完整数据导出 / 删除权',
    ],
  },
  {
    role: 'LANDLORD · 房东',
    accent: '#047857',
    tier: '房东订阅 · Pro',
    price: '$19 · 每月 / $39 团队',
    sub: '免费 / $19 / $39 三档 · 服务全含',
    cta: '免费发布房源',
    href: '/dashboard/listings/new',
    highlight: true,
    features: [
      'Logic Agent 全功能',
      '无限发布房源',
      'Stripe 托管收租 · 不抽租金流水',
      '1-click 续约 / 起草租约',
      '财务面板 + 税务表（T776）',
      '验证 / 筛查 / AI 全含在订阅',
      '免费档永久 · 仅 1 套房源',
    ],
  },
  {
    role: 'AGENT / BROKERAGE · 持牌经纪',
    accent: '#2563EB',
    tier: '25% · 成交分成',
    price: '25% · 成交后转介费',
    sub: '仅成交后 · 经纪行↔经纪行',
    cta: '免费接收转介',
    href: '/agent/onboarding',
    features: [
      'Brief Agent 任务管理',
      'RECO 合规授权清单',
      'Stripe 自动结算分成',
      '客户跟进 + 反馈模板',
      '转介协议 + 拖尾条款',
      '不收带看费 · 不成交不收费',
    ],
  },
]

export default function PricingPage() {
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
              PRICING · 透明 · 无隐藏
            </div>
            <h1 className="mx-auto mt-3 max-w-[820px] text-[40px] font-extrabold leading-tight tracking-tight sm:text-[52px]">
              租客永远免费<br />房东 / 经纪按价值付费
            </h1>
            <p className="mx-auto mt-4 max-w-[680px] text-[15.5px] leading-relaxed text-body-2">
              Stayloop 靠订阅 + 成交分成 —— 租客的隐私永远不是商品。
            </p>
          </div>
        </section>

        {/* Three role cards */}
        <section className="mx-auto max-w-[1100px] px-5 py-10 sm:px-7 lg:px-12">
          <div className="grid gap-5 lg:grid-cols-3">
            {CARDS.map((c) => (
              <div
                key={c.role}
                className={'sl-card flex flex-col p-7 ' + (c.highlight ? 'ring-2' : '')}
                style={c.highlight ? { borderColor: c.accent, boxShadow: `0 0 0 1px ${c.accent}` } : undefined}
              >
                {c.highlight && (
                  <span className="mb-4 inline-flex w-fit items-center gap-1 rounded-md px-2 py-[4px] font-mono text-[10px] font-bold uppercase tracking-wider text-white" style={{ background: c.accent }}>
                    最受欢迎
                  </span>
                )}
                <div className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg" style={{ color: c.accent }}>
                  {c.role}
                </div>
                <h3 className="mt-2 text-[24px] font-bold tracking-tight">{c.tier}</h3>
                <div className="mt-3 text-[28px] font-extrabold tracking-tight">{c.price}</div>
                <div className="mt-2 inline-flex w-fit rounded-md px-2 py-[3px] font-mono text-[10.5px] font-bold" style={{ background: `${c.accent}14`, color: c.accent }}>
                  {c.sub}
                </div>

                <Link
                  href={c.href}
                  className={'mt-5 inline-flex w-full items-center justify-center rounded-[10px] px-4 py-[12px] text-[14px] font-semibold transition ' + (c.highlight ? 'sl-btn-primary' : 'border border-line-strong bg-white text-body hover:border-brand hover:text-brand')}
                >
                  {c.cta}
                </Link>

                <ul className="mt-6 space-y-2 border-t border-line-divider pt-5 text-[13px]">
                  {c.features.map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <span className="mt-[3px] flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full text-[10px]" style={{ background: `${c.accent}22`, color: c.accent }}>✓</span>
                      <span className="leading-snug">{f}</span>
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
              TRUST API · 第 4 商业线
            </div>
            <h2 className="mt-2 text-[26px] font-bold tracking-tight text-white">
              把 Stayloop 的信任引擎给银行 / 保险 / 政府机构
            </h2>
            <p className="mt-3 max-w-[760px] text-[14px] leading-relaxed" style={{ color: '#CBD5E1' }}>
              他们的产品里嵌入「Stayloop Trust Verified」。租客一次验证，到处通行。
              让 Stayloop 成为加拿大租住业的信任基础设施。
            </p>
            <Link
              href="/contact"
              className="mt-5 inline-flex items-center justify-center rounded-[10px] bg-white px-5 py-[12px] text-[14px] font-semibold text-ink transition hover:opacity-90"
            >
              联系企业销售 →
            </Link>
          </div>
        </section>

        {/* Compliance explainer — why this model stays on the right side of the line */}
        <section className="mx-auto max-w-[1100px] px-5 py-6 sm:px-7 lg:px-12">
          <div className="sl-card p-7">
            <div className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-body-3">
              为什么这套定价合规
            </div>
            <h2 className="mt-2 text-[22px] font-bold tracking-tight">租客的隐私永远不是商品。付费只加价值,绝不改变房东看到的资格或排名。</h2>
            <p className="mt-3 max-w-[820px] text-[14px] leading-relaxed text-body-2">
              验证、筛查、收租、AI 起草 —— 全部含在 <b>订阅</b> 里,这些不是"交易行为",不碰合规红线。
              真正的看房与撮合交给 <b>持牌经纪</b>;成交后,Stayloop 以经纪行间转介费的形式参与 <b className="text-brand">25% 分成</b>。
              不收带看费、不抽租金流水 —— 客户赢了,我们才分成。
            </p>
          </div>
        </section>

        {/* FAQ */}
        <section className="mx-auto max-w-[1100px] px-5 pb-16 sm:px-7 lg:px-12">
          <h2 className="text-[24px] font-bold tracking-tight sm:text-[30px]">常见问题</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {[
              { q: '租客真的永远免费吗?', a: '是。租客侧不收任何交易费 —— 身份验证、Passport、申请、电子签约、维修都免费,且认证 1–4 级全部免费升级。租客的隐私永远不是商品。' },
              { q: '25% 分成怎么算?', a: '只在一笔需要带看撮合的租约真正成交后计提,= 成交佣金 × 25%,以经纪行↔经纪行转介费形式结算。不成交不收费。' },
              { q: '为什么不收带看费、不抽租金?', a: '收租与筛查是订阅内的服务,不是交易抽成;租金流水我们一分不抽。这让定价远离合规红线,也让租客零负担。' },
              { q: '房东免费档够用吗?', a: '免费档永久可用,可发布 1 套房源、收申请、用 Logic 摘要评分、Stripe 托管收租(平台不抽流水)。升级 Pro($19)或团队($39)解锁完整 Logic、无限房源与财务面板。' },
            ].map((f) => (
              <div key={f.q} className="sl-card p-5">
                <h4 className="text-[15px] font-bold">{f.q}</h4>
                <p className="mt-2 text-[13.5px] leading-relaxed text-body-2">{f.a}</p>
              </div>
            ))}
          </div>
        </section>
      </main>
      <Footer />
    </>
  )
}
