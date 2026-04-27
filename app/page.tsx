'use client'
// -----------------------------------------------------------------------------
// Homepage — Stayloop V3 marketing site
// -----------------------------------------------------------------------------
// Reproduces section 21 of the V3 classic-print prototype: hero, partner row,
// 3-audience trifecta, network-effect panel, closing CTA. Bilingual EN/ZH.
// -----------------------------------------------------------------------------

import Link from 'next/link'
import { v3, size } from '@/lib/brand'
import { useT } from '@/lib/i18n'
import MarketingNav from '@/components/marketing/MarketingNav'
import MarketingFooter from '@/components/marketing/MarketingFooter'
import NetworkDiagram from '@/components/marketing/NetworkDiagram'

const AUDIENCES: Array<{
  key: 'tenants' | 'landlords' | 'agents'
  eyebrow_zh: string
  eyebrow_en: string
  title_zh: string
  title_en: string
  body_zh: string
  body_en: string
  stat: string
  caption_zh: string
  caption_en: string
  href: string
}> = [
  {
    key: 'tenants',
    eyebrow_zh: '租客',
    eyebrow_en: 'TENANTS',
    title_zh: '一本 Passport，处处可用',
    title_en: 'One Passport. Anywhere.',
    body_zh: '银行 + 政府 ID 一次性验证。一本 Passport，90 秒申请任意房源。',
    body_en: 'One bank + government-ID verification. One Passport — apply to any unit in 90 seconds.',
    stat: '94%',
    caption_zh: '相比纸质申请，步骤减少',
    caption_en: 'fewer steps vs. paper applications',
    href: '/tenants',
  },
  {
    key: 'landlords',
    eyebrow_zh: '房东',
    eyebrow_en: 'LANDLORDS',
    title_zh: 'AI 替你筛选每位申请人',
    title_en: 'AI ranks every applicant.',
    body_zh: 'Logic agent 按支付能力、租房历史、匹配度筛出最佳人选。',
    body_en: 'Logic agent surfaces the best fit by ability-to-pay, history, and fit.',
    stat: '6.2 d',
    caption_zh: '平均挂牌天数（行业 18 d）',
    caption_en: 'avg days-on-market (vs. 18 d industry)',
    href: '/landlords',
  },
  {
    key: 'agents',
    eyebrow_zh: '经纪',
    eyebrow_en: 'AGENTS',
    title_zh: '只做带看，不做文书',
    title_en: 'Show. Don\u2019t shuffle paper.',
    body_zh: 'Atlas 起草租约。Verify 预审租客。Echo 回答问题。你专注线下。',
    body_en: 'Atlas drafts leases. Verify pre-screens. Echo answers FAQ. You handle the human.',
    stat: '3.4×',
    caption_zh: '每位经纪每月签约量',
    caption_en: 'more closings per agent / month',
    href: '/agents',
  },
]

export default function Home() {
  const { lang } = useT()
  const isZh = lang === 'zh'

  return (
    <main style={{ background: v3.surface, minHeight: '100vh', color: v3.textPrimary }}>
      <MarketingNav />

      {/* HERO ─────────────────────────────────────────────────────────── */}
      <section
        style={{
          background: `linear-gradient(180deg, ${v3.brandWash} 0%, ${v3.surface} 100%)`,
          padding: '88px 24px 96px',
          borderBottom: `1px solid ${v3.divider}`,
        }}
      >
        <div style={{ maxWidth: size.content.wide, margin: '0 auto' }}>
          <Eyebrow>{isZh ? 'Series A · 2026 年 4 月' : 'Series A · April 2026'}</Eyebrow>
          <h1
            style={{
              fontSize: 'clamp(40px, 6vw, 72px)',
              lineHeight: 1.04,
              fontWeight: 800,
              letterSpacing: '-0.035em',
              margin: '24px 0 28px',
              maxWidth: 880,
            }}
          >
            {isZh ? (
              <>
                为 <span style={{ color: v3.brand }}>$640B</span> 租赁市场
                <br />
                打造的信任基础设施。
              </>
            ) : (
              <>
                Trust infrastructure for the
                <br />
                <span style={{ color: v3.brand }}>$640B rental market.</span>
              </>
            )}
          </h1>
          <p
            style={{
              fontSize: 17,
              lineHeight: 1.6,
              color: v3.textSecondary,
              maxWidth: 620,
              margin: '0 0 32px',
            }}
          >
            {isZh
              ? '一次验证，一本护照。处处通行 — 房东、经纪、保险公司，全部可以读取。'
              : 'One verification. One passport. Used everywhere — by every landlord, every brokerage, every insurer.'}{' '}
            <span style={{ color: v3.textMuted }}>
              {isZh ? '租客一次验证，处处通行。' : '租客一次验证，处处通行。'}
            </span>
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Link
              href="/chat"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                background: v3.brand,
                color: '#fff',
                fontSize: 15,
                fontWeight: 600,
                padding: '12px 22px',
                borderRadius: 10,
                textDecoration: 'none',
              }}
            >
              {isZh ? '获取我的 Passport' : 'Get my Passport'} <span aria-hidden>→</span>
            </Link>
          </div>
        </div>
      </section>


      {/* AUDIENCE TRIFECTA ────────────────────────────────────────────── */}
      <section style={{ padding: '64px 24px 32px' }}>
        <div style={{ maxWidth: size.content.wide, margin: '0 auto' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: 16,
            }}
          >
            {AUDIENCES.map((a) => (
              <AudienceCard key={a.key} a={a} isZh={isZh} />
            ))}
          </div>
        </div>
      </section>

      {/* NETWORK EFFECT ──────────────────────────────────────────────── */}
      <section style={{ padding: '32px 24px 96px' }}>
        <div style={{ maxWidth: size.content.wide, margin: '0 auto' }}>
          <div
            style={{
              background: v3.brandWash,
              border: `1px solid ${v3.brandSoft}`,
              borderRadius: 20,
              padding: 'clamp(28px, 4vw, 56px)',
              display: 'grid',
              gridTemplateColumns: '1.3fr 1fr',
              alignItems: 'center',
              gap: 32,
            }}
            className="mk-network-block"
          >
            <div>
              <Eyebrow>{isZh ? '网络效应' : 'NETWORK EFFECT'}</Eyebrow>
              <h2
                style={{
                  fontSize: 'clamp(28px, 3.4vw, 38px)',
                  lineHeight: 1.15,
                  fontWeight: 800,
                  letterSpacing: '-0.025em',
                  margin: '14px 0 18px',
                }}
              >
                {isZh
                  ? '每一次验证，下一次都更便宜。'
                  : 'Every verification makes the next one cheaper.'}
              </h2>
              <p style={{ fontSize: 15, lineHeight: 1.65, color: v3.textSecondary, margin: 0 }}>
                {isZh
                  ? 'Stayloop Passport 在房东、经纪、保险公司之间复用。网络中的每一方，都让单次验证成本更低 — 也让离开它的成本更高。'
                  : 'Stayloop Passport is reusable across landlords, brokerages, and insurers. The more sides on the network, the lower per-verification cost — and the harder it is to leave.'}
              </p>
            </div>
            <div style={{ display: 'grid', placeItems: 'center' }}>
              <NetworkDiagram lang={isZh ? 'zh' : 'en'} />
            </div>
          </div>
        </div>
        <style jsx>{`
          @media (max-width: 760px) {
            :global(.mk-network-block) {
              grid-template-columns: 1fr !important;
            }
          }
        `}</style>
      </section>

      {/* CLOSING CTA ─────────────────────────────────────────────────── */}
      <section
        style={{
          padding: '64px 24px 96px',
          borderTop: `1px solid ${v3.divider}`,
          background: v3.surface,
        }}
      >
        <div
          style={{
            maxWidth: size.content.wide,
            margin: '0 auto',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            gap: 24,
            flexWrap: 'wrap',
          }}
        >
          <div>
            <h2
              style={{
                fontSize: 'clamp(28px, 3vw, 38px)',
                lineHeight: 1.15,
                fontWeight: 800,
                letterSpacing: '-0.025em',
                margin: '0 0 12px',
              }}
            >
              {isZh ? '把纸质流程留给上个时代。' : 'Ready to skip the paper trail?'}
            </h2>
            <p style={{ color: v3.textMuted, fontSize: 15, margin: 0 }}>
              {isZh
                ? '租客免费。企业按调用计费。'
                : 'Free for renters. Pay-per-verify for businesses.'}
            </p>
          </div>
          <Link
            href="/chat"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              background: v3.brand,
              color: '#fff',
              fontSize: 15,
              fontWeight: 600,
              padding: '14px 24px',
              borderRadius: 10,
              textDecoration: 'none',
            }}
          >
            {isZh ? '开始我的 Passport' : 'Start your Passport'} <span aria-hidden>→</span>
          </Link>
        </div>
      </section>

      <MarketingFooter />
    </main>
  )
}

// ── Sub-components ──────────────────────────────────────────────────────

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        display: 'inline-block',
        fontSize: 11,
        fontWeight: 700,
        color: v3.brandStrong,
        textTransform: 'uppercase',
        letterSpacing: '0.12em',
        padding: '4px 10px',
        borderRadius: 999,
        background: v3.brandSoft,
        border: `1px solid ${v3.brandSoft}`,
      }}
    >
      {children}
    </span>
  )
}

function AudienceCard({
  a,
  isZh,
}: {
  a: (typeof AUDIENCES)[number]
  isZh: boolean
}) {
  return (
    <Link
      href={a.href}
      style={{
        display: 'block',
        background: v3.surface,
        border: `1px solid ${v3.border}`,
        borderRadius: 16,
        padding: 24,
        textDecoration: 'none',
        color: 'inherit',
        transition: 'border-color 140ms, transform 140ms',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = v3.brand
        e.currentTarget.style.transform = 'translateY(-1px)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = v3.border
        e.currentTarget.style.transform = 'translateY(0)'
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: v3.textPrimary,
          letterSpacing: '0.1em',
          marginBottom: 12,
        }}
      >
        {isZh ? a.eyebrow_zh : a.eyebrow_en} · {isZh ? a.eyebrow_en : a.eyebrow_zh}
      </div>
      <h3
        style={{
          fontSize: 22,
          fontWeight: 700,
          letterSpacing: '-0.02em',
          margin: '0 0 10px',
          lineHeight: 1.25,
        }}
      >
        {isZh ? a.title_zh : a.title_en}
      </h3>
      <p style={{ color: v3.textSecondary, fontSize: 14, lineHeight: 1.6, margin: '0 0 24px' }}>
        {isZh ? a.body_zh : a.body_en}
      </p>
      <div style={{ borderTop: `1px solid ${v3.divider}`, paddingTop: 20 }}>
        <div
          style={{
            fontSize: 36,
            fontWeight: 800,
            color: v3.brand,
            letterSpacing: '-0.025em',
            lineHeight: 1.05,
            marginBottom: 4,
          }}
        >
          {a.stat}
        </div>
        <div style={{ color: v3.textMuted, fontSize: 13 }}>
          {isZh ? a.caption_zh : a.caption_en}
        </div>
      </div>
    </Link>
  )
}
