'use client'

// V5.3 pricing — subscription + post-close commission model.
// Source: V5.3/v53-pricing.html (定价 v3 · 订阅 + 成交分成).
// Everyone starts free; the platform only takes a 25% commission on a
// CLOSED deal (brokerage↔brokerage referral fee). No showing fees, no rent
// skimming, tenants never pay a transaction fee. Subscriptions add value
// only — they never change an applicant's ranking or eligibility.
import { useState } from 'react'
import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'

type Role = 'tenant' | 'landlord' | 'agent'

type Tier = {
  name: string
  price: string
  per?: string
  fee: string // transaction-fee line — the trust promise per tier
  desc: string
  cta: string
  href: string
  features: string[]
  highlight?: boolean
}

const ROLE_META: Record<Role, { label: string; accent: string; tiers: Tier[] }> = {
  tenant: {
    label: '租客',
    accent: '#7C3AED',
    tiers: [
      {
        name: '免费', price: '$0', fee: '租客永远不付任何交易费',
        desc: '验证一次,处处复用。所有核心租住功能终身免费。',
        cta: '90 秒身份验证', href: '/onboarding/welcome',
        features: ['Verified Renter Passport · 认证 1–4 级全免费', 'Luna 个人 Agent 基础版', '看房意向 + 一键申请', '电子签约 + 租金支付', '维修请求 + 续约'],
      },
      {
        name: 'Plus', price: '$9', per: '/ 月', fee: '仍然不付交易费',
        desc: '更主动的 Luna:抢先看新房、批量起草意向。付费不改变房东看到的资格或排名。',
        cta: '升级 Plus', href: '/tenant/agent',
        features: ['新房源即时提醒', 'Luna 优先排队 + 更快响应', '多套并行申请追踪', '付费不改变排名 — 房东只看认证级别'],
      },
      {
        name: 'Pro', price: '$19', per: '/ 月', fee: '仍然不付交易费',
        desc: '重度找房 / 跨城搬迁。完整 Luna 自动化 + 携带式信任档高级出示。',
        cta: '升级 Pro', href: '/tenant/agent', highlight: true,
        features: ['一切 Plus 功能', 'Passport 高级出示 + 复用记录', '跨城 / 多区并行搜索', '专属续约 + 退租结算助手'],
      },
    ],
  },
  landlord: {
    label: '房东',
    accent: '#047857',
    tiers: [
      {
        name: '免费', price: '$0', fee: '≈$0 · ACH ≈$1/笔 · 刷卡 2.9% 由租客付',
        desc: '免费发布房源、免费收基础申请。需带看撮合的成交交给持牌经纪。',
        cta: '免费发布房源', href: '/dashboard/listings/new',
        features: ['免费发布 / 从旧平台迁入', '基础申请收件箱', 'Logic 摘要版评分', '租金代收(平台不抽流水)'],
      },
      {
        name: 'Pro', price: '$19', per: '/ 月', fee: 'ACH 手续费全免',
        desc: 'Logic 全功能:多维核查、排序、租约起草 —— 你只点头。',
        cta: '升级 Pro', href: '/landlord/agent', highlight: true,
        features: ['Logic Agent 全功能(筛查 / 排序 / 起草)', '六维 AI 评分 + 法庭记录查询', '租约自动起草(OREA 兼容)', '邮件 + Slack 通知', '无限申请 · 每位申请人 0 手续费'],
      },
      {
        name: 'Premium', price: '$39', per: '/ 月', fee: '含深度报告额度 · 次日到账',
        desc: '多套房源 / 机构房东。成交分成结算面板 + 专属客户成功。',
        cta: '升级 Premium', href: '/landlord/agent',
        features: ['一切 Pro 功能', '成交分成结算面板', '深度核查报告额度', '次日到账', '专属客户成功'],
      },
    ],
  },
  agent: {
    label: '经纪',
    accent: '#2563EB',
    tiers: [
      {
        name: '免费', price: '$0', fee: '25% · 仅成交后 · 经纪行↔经纪行',
        desc: '接收 Stayloop 验证后的合格租客转介。不成交不收费,无月费、无基础费。',
        cta: '免费接收转介', href: '/agent/onboarding',
        features: ['接收已验证的合格租客转介', '经纪行间转介协议(含拖尾条款)', 'Stripe 自动结算分成', '不成交不收费 · 无月费 / 无基础费'],
      },
      {
        name: 'Pro', price: '$19', per: '/ 月', fee: '25% · 仅成交后',
        desc: 'Brief 全功能工作区:任务排程、带看留痕、客户记忆复用。',
        cta: '升级 Pro', href: '/agent/onboarding', highlight: true,
        features: ['Brief 任务推荐 + 排程', '带看 / 拍照 / Listing prep 留痕', '清晰授权 = 不踩线', '客户记忆复用'],
      },
    ],
  },
}

const PROMISE = [
  { k: '全含订阅', v: '验证 · 筛查 · 收租' },
  { k: '成交后', v: '25% 分成' },
  { k: '不收', v: '带看费' },
  { k: '租客', v: '永不付交易费' },
]

export default function PricingPage() {
  const [role, setRole] = useState<Role>('tenant')
  const meta = ROLE_META[role]

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
              PRICING · v3 · 订阅 + 成交分成
            </div>
            <h1 className="mx-auto mt-3 max-w-[820px] text-[40px] font-extrabold leading-tight tracking-tight sm:text-[52px]">
              每个人都从免费开始。<br />我们只在你成交时分成。
            </h1>
            <p className="mx-auto mt-4 max-w-[680px] text-[15.5px] leading-relaxed text-body-2">
              三个角色、各有订阅档,第一档永久免费。验证、筛查、收租、AI 全部含在订阅里;
              真正撮合成交后,平台只按佣金 <b className="text-brand">25%</b> 分成 —— 不收带看费,不抽租金流水。
            </p>

            <div className="mt-7 flex flex-wrap justify-center gap-2.5">
              {PROMISE.map((p) => (
                <span key={p.k} className="inline-flex items-baseline gap-1.5 rounded-full border border-line-strong bg-white px-3.5 py-2">
                  <span className="font-mono text-[10px] font-bold uppercase tracking-eyebrow text-body-3">{p.k}</span>
                  <span className="text-[12.5px] font-bold text-brand">{p.v}</span>
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* Role tabs */}
        <section className="mx-auto max-w-[1100px] px-5 pt-10 sm:px-7 lg:px-12">
          <div className="mx-auto flex w-fit gap-1 rounded-xl border border-line-divider bg-white p-1">
            {(Object.keys(ROLE_META) as Role[]).map((r) => {
              const on = r === role
              return (
                <button
                  key={r}
                  onClick={() => setRole(r)}
                  className={'rounded-lg px-5 py-2 text-[13.5px] font-semibold transition ' + (on ? 'text-white' : 'text-body-2 hover:text-body')}
                  style={on ? { background: ROLE_META[r].accent } : undefined}
                >
                  {ROLE_META[r].label}
                </button>
              )
            })}
          </div>
        </section>

        {/* Tier cards */}
        <section className="mx-auto max-w-[1100px] px-5 py-8 sm:px-7 lg:px-12">
          <div className={'grid gap-5 ' + (meta.tiers.length === 2 ? 'md:grid-cols-2 md:max-w-[720px] md:mx-auto' : 'lg:grid-cols-3')}>
            {meta.tiers.map((t) => (
              <div
                key={t.name}
                className={'sl-card flex flex-col p-7 ' + (t.highlight ? 'ring-2' : '')}
                style={t.highlight ? { borderColor: meta.accent, boxShadow: `0 0 0 1px ${meta.accent}` } : undefined}
              >
                {t.highlight && (
                  <span className="mb-4 inline-flex w-fit items-center gap-1 rounded-md px-2 py-[4px] font-mono text-[10px] font-bold uppercase tracking-wider text-white" style={{ background: meta.accent }}>
                    最受欢迎
                  </span>
                )}
                <div className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg" style={{ color: meta.accent }}>
                  {meta.label}
                </div>
                <h3 className="mt-2 text-[26px] font-bold tracking-tight">{t.name}</h3>
                <div className="mt-3 flex items-baseline gap-1">
                  <span className="text-[38px] font-extrabold tracking-tight">{t.price}</span>
                  {t.per && <span className="text-[13px] text-body-3">{t.per}</span>}
                </div>
                <div className="mt-2 inline-flex w-fit rounded-md bg-brand/8 px-2 py-[3px] font-mono text-[10.5px] font-bold text-brand">
                  {t.fee}
                </div>
                <p className="mt-3 text-[13px] leading-relaxed text-body-2">{t.desc}</p>

                <Link
                  href={t.href}
                  className={'mt-5 inline-flex w-full items-center justify-center rounded-[10px] px-4 py-[12px] text-[14px] font-semibold transition ' + (t.highlight ? 'sl-btn-primary' : 'border border-line-strong bg-white text-body hover:border-brand hover:text-brand')}
                >
                  {t.cta}
                </Link>

                <ul className="mt-6 space-y-2 border-t border-line-divider pt-5 text-[13px]">
                  {t.features.map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <span className="mt-[3px] flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full text-[10px]" style={{ background: `${meta.accent}22`, color: meta.accent }}>✓</span>
                      <span className="leading-snug">{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        {/* Compliance explainer — why this model stays on the right side of the line */}
        <section className="mx-auto max-w-[1100px] px-5 py-10 sm:px-7 lg:px-12">
          <div className="sl-card p-7">
            <div className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-body-3">
              为什么这套定价合规
            </div>
            <h2 className="mt-2 text-[22px] font-bold tracking-tight">租客的隐私永远不是商品。付费档只加价值,绝不改变房东看到的资格或排名。</h2>
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
              { q: '租客真的永远免费吗?', a: '是。租客侧不收任何交易费 —— 身份验证、Passport、申请、电子签约、维修都免费。付费档(Plus/Pro)只加主动性,绝不改变房东看到的资格或排名。' },
              { q: '25% 分成怎么算?', a: '只在一笔需要带看撮合的租约真正成交后计提,= 成交佣金 × 25%,以经纪行↔经纪行转介费形式结算。不成交不收费。' },
              { q: '为什么不收带看费、不抽租金?', a: '收租与筛查是订阅内的服务,不是交易抽成;租金流水我们一分不抽。这让定价远离合规红线,也让租客零负担。' },
              { q: '房东免费档够用吗?', a: '够发布房源、收申请、用 Logic 摘要评分、收租(平台不抽流水)。升级 Pro($19)解锁完整筛查 / 排序 / 起草。' },
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
