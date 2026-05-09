'use client'

import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'

interface Tier {
  name: string
  audience: string
  price: string
  per: string
  desc: string
  cta: string
  href: string
  features: string[]
  highlight?: boolean
  accent: string
}

const TIERS: Tier[] = [
  {
    name: 'Free',
    audience: 'TENANT · 租客',
    price: '$0',
    per: '永久',
    desc: '完成 Tier 1 即可使用。所有租客功能终身免费。',
    cta: '90 秒身份验证',
    href: '/onboarding/tier1',
    accent: '#7C3AED',
    features: [
      'Rental Passport · 一份资料处处用',
      'Luna 个人 AI Agent',
      '看房意向 + 申请',
      '电子签约 + 租金支付',
      '维修请求 + 续约',
    ],
  },
  {
    name: 'Pro',
    audience: 'LANDLORD · 房东',
    price: '$29',
    per: '/ 月',
    desc: '管理 1-25 套房源 · 开放六维 AI 评分 + 法庭记录查询。',
    cta: '免费试用 14 天',
    href: '/dashboard',
    accent: '#047857',
    highlight: true,
    features: [
      '六维 AI 评分 (Vision OCR + Claude Sonnet)',
      'CanLII 法庭记录自动查询',
      '租约自动起草 (OREA 兼容)',
      '租金代收 + 维修工单',
      '邮件 + Slack 通知',
      '无限申请 · 无每位申请人手续费',
    ],
  },
  {
    name: 'Agent',
    audience: 'FIELD AGENT · 经纪',
    price: '收 30%',
    per: '/ 单',
    desc: '看完即结算 · 无月费。系统从平台收的服务费里返你 30%。',
    cta: '加入经纪网络',
    href: '/agent/onboarding',
    accent: '#2563EB',
    features: [
      'Brief 任务推荐',
      '清晰授权 = 不踩线',
      '即时 Stripe 结算',
      '客户记忆复用',
      '看房 / 拍照 / Listing prep · 全部计费',
    ],
  },
  {
    name: 'Trust API',
    audience: 'PARTNER · 银行 / 法务',
    price: '联系',
    per: '我们',
    desc: '银行 / 物业 / 法务 / 保险公司接入。按调用量计费。',
    cta: '预约洽谈',
    href: '/contact',
    accent: '#0B0B0E',
    features: [
      '租客身份 + 收入即时验证',
      'Tier 1-4 信任分数 webhook',
      'OAuth + SSO',
      'SLA 99.9%',
      '私有部署可选 (Toronto · Canada-only)',
    ],
  },
]

export default function PricingPage() {
  return (
    <>
      <Header />
      <main>
        <section
          className="relative overflow-hidden"
          style={{ background: 'linear-gradient(180deg, #F2EEE5 0%, #E4EEE3 100%)' }}
        >
          <div className="mx-auto max-w-[1320px] px-5 pb-12 pt-20 text-center sm:px-7 lg:px-12">
            <div className="font-mono text-[11px] font-bold uppercase tracking-eyebrowLg text-brand">
              PRICING · 2026
            </div>
            <h1 className="mx-auto mt-3 max-w-[820px] text-[42px] font-extrabold leading-tight tracking-tight sm:text-[56px]">
              租客永远免费。<br />房东 / 经纪 / 合作伙伴按使用付费。
            </h1>
            <p className="mx-auto mt-4 max-w-[640px] text-[16px] leading-relaxed text-body-2">
              我们的商业模式很直接 — 让最需要被看见的人 (租客) 永远免费，让从这套系统获益最多的人 (房东 / 银行) 付费。
            </p>
          </div>
        </section>

        <section className="mx-auto max-w-[1320px] px-5 py-12 sm:px-7 lg:px-12">
          <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-4">
            {TIERS.map((t) => (
              <div
                key={t.name}
                className={
                  'sl-card flex flex-col p-7 ' +
                  (t.highlight ? 'ring-2 ring-brand' : '')
                }
                style={t.highlight ? { borderColor: '#047857' } : undefined}
              >
                {t.highlight && (
                  <span className="mb-4 inline-flex w-fit items-center gap-1 rounded-md bg-brand px-2 py-[4px] font-mono text-[10px] font-bold uppercase tracking-wider text-white">
                    MOST POPULAR
                  </span>
                )}
                <div
                  className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg"
                  style={{ color: t.accent }}
                >
                  {t.audience}
                </div>
                <h3 className="mt-2 text-[28px] font-bold tracking-tight">{t.name}</h3>
                <div className="mt-3 flex items-baseline gap-1">
                  <span className="text-[40px] font-extrabold tracking-tight">{t.price}</span>
                  <span className="text-[13px] text-body-3">{t.per}</span>
                </div>
                <p className="mt-3 text-[13px] leading-relaxed text-body-2">{t.desc}</p>

                <Link
                  href={t.href}
                  className={
                    'mt-5 inline-flex w-full items-center justify-center rounded-[10px] px-4 py-[12px] text-[14px] font-semibold transition ' +
                    (t.highlight
                      ? 'sl-btn-primary'
                      : 'border border-line-strong bg-white text-body hover:border-brand hover:text-brand')
                  }
                >
                  {t.cta}
                </Link>

                <ul className="mt-6 space-y-2 border-t border-line-divider pt-5 text-[13px]">
                  {t.features.map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <span className="mt-[3px] flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-brand/15 text-[10px] text-brand">
                        ✓
                      </span>
                      <span className="leading-snug">{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-[1320px] px-5 py-16 sm:px-7 lg:px-12">
          <h2 className="text-[26px] font-bold tracking-tight sm:text-[32px]">常见问题</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {[
              {
                q: '租客真的永远免费吗？',
                a: '是。租客侧不会向你收任何费用，包括身份验证、Passport 维护、申请提交、电子签约、维修请求。',
              },
              {
                q: '房东 Pro $29 包括哪些功能？',
                a: '六维 AI 评分、CanLII 法庭查询、租约起草、租金代收、邮件通知。无限申请，每位申请人 0 手续费。',
              },
              {
                q: '可以临时停用吗？',
                a: '可以。账户停用期间所有数据保留 90 天，复用时直接续费即可。',
              },
              {
                q: 'Trust API 的合作模式？',
                a: '按调用次数计费 + 私有部署可选。已与 RBC 等机构对接。请用 /contact 预约洽谈。',
              },
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
