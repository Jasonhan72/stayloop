'use client'
// -----------------------------------------------------------------------------
// /trust-api — Trust API marketing page (Verify agent, emerald accent, B2B)
// -----------------------------------------------------------------------------
// Self-contained V5 marketing layout: glass cards on a warm-cream backdrop with
// a purple radial gradient at the hero, plus the Verify agent badge. Formerly
// rendered via the shared AudienceLanding component (deleted with the dead V4
// /tenants /landlords /agents plural routes); this inlines the exact code paths
// that component exercised for this page's props, so the visual output is
// unchanged.
// -----------------------------------------------------------------------------

import Link from 'next/link'
import { v3, size } from '@/lib/brand'
import { useT } from '@/lib/i18n'
import Header from '@/components/Header'

// Emerald accent (Verify agent) — values match the former AudienceLanding ACCENT map.
const accent = {
  fg: '#047857',
  soft: 'rgba(4,120,87,0.10)',
  orbA: 'rgba(4,120,87,0.92)',
  orbB: 'rgba(16,185,129,0.78)',
}

const AGENT = { name: 'Verify', tier: 'B2B' }

const COPY = {
  eyebrow_zh: 'Trust API',
  eyebrow_en: 'TRUST API',
  title_zh: '把租赁信任变成可调用的 API。',
  title_en: 'Rental trust as a callable API.',
  accentWord_zh: '可调用的 API',
  accentWord_en: 'callable API',
  subtitle_zh:
    '用统一接口完成身份、收入、信用、租房记录与合规审计，为租赁平台、保险和金融服务提供可信基础设施。',
  subtitle_en:
    'One unified interface for identity, income, credit, rental history and compliance — trust infrastructure for rental platforms, insurers, and financial services.',
  primaryCta: { label_zh: '获取 API Key', label_en: 'Get an API key', href: '/contact' },
  secondaryCta: { label_zh: '查看示例响应', label_en: 'See sample response', href: '/trust-api/docs' },
  closing_zh: '一份 Passport，整个北美都能读。',
  closing_en: 'One Passport. Read by every business in North America.',
}

const STATS: Array<{ value: string; label_zh: string; label_en: string }> = [
  { value: '$6', label_zh: 'Identity verify · 单次价格', label_en: 'per identity verification' },
  { value: '~400ms', label_zh: '中位响应时间', label_en: 'median response time' },
  { value: '99.95%', label_zh: 'API 可用率（最近 90 天）', label_en: 'API uptime (trailing 90 days)' },
  { value: '20k+', label_zh: 'Verified Passport 总量', label_en: 'verified passports issued' },
]

const FEATURES: Array<{ title_zh: string; title_en: string; body_zh: string; body_en: string }> = [
  {
    title_zh: 'Identity · Persona + GovID',
    title_en: 'Identity · Persona + GovID',
    body_zh: '政府 ID + 活体 selfie。返回欺诈分、文件元数据、12 个月可用 JWT proof。',
    body_en: 'Government ID + biometric liveness. Returns a fraud score, document metadata, and a 12-month JWT proof.',
  },
  {
    title_zh: 'Income (VOIE)',
    title_en: 'Income (VOIE)',
    body_zh: 'Flinks bank API + Argyle payroll。读取 90 天存款，AI 检测稳定性，输出 sealed average。',
    body_en: 'Flinks bank API + Argyle payroll. Reads 90 days of deposits, runs AI stability checks, returns a sealed average.',
  },
  {
    title_zh: 'Credit · Equifax Rental Connect',
    title_en: 'Credit · Equifax Rental Connect',
    body_zh: '原生 Equifax 加拿大对接。返回 score、tradelines、AI 解读。',
    body_en: 'Native Equifax Canada integration. Returns score, tradelines, and an AI-written interpretation.',
  },
  {
    title_zh: 'Eviction · Openroom + CanLII',
    title_en: 'Eviction · Openroom + CanLII',
    body_zh: 'Openroom LTB 数据 + CanLII 全省判例。同名消歧由 Verify agent 完成。',
    body_en: 'Openroom LTB data plus full-province CanLII rulings. Name disambiguation handled by the Verify agent.',
  },
  {
    title_zh: 'Webhook 事件',
    title_en: 'Webhook events',
    body_zh: 'identity.verified · income.verified · score.computed · passport.shared · passport.revoked。HMAC-SHA256 签名。',
    body_en: 'identity.verified · income.verified · score.computed · passport.shared · passport.revoked. HMAC-SHA256 signed.',
  },
  {
    title_zh: '合规 · PIPEDA + GDPR',
    title_en: 'Compliance · PIPEDA + GDPR',
    body_zh: 'Append-only 审计日志、租客可导出全部数据、可一键撤销。SOC2 进行中。',
    body_en: 'Append-only audit log, full data export for the tenant, one-click revocation. SOC2 in progress.',
  },
]

const FOOTER_GROUPS: Array<{
  heading: { zh: string; en: string }
  links: Array<{ href: string; zh: string; en: string }>
}> = [
  {
    heading: { zh: '产品', en: 'Product' },
    links: [
      { href: '/tenant', zh: '租客 · Passport', en: 'Tenants · Passport' },
      { href: '/landlord', zh: '房东 · Pipeline', en: 'Landlords · Pipeline' },
      { href: '/agent', zh: '经纪 · Day Brief', en: 'Agents · Day Brief' },
      { href: '/trust-api', zh: 'Trust API', en: 'Trust API' },
      { href: '/dashboard', zh: 'Console', en: 'Console' },
    ],
  },
  {
    heading: { zh: '公司', en: 'Company' },
    links: [
      { href: '/about', zh: '关于', en: 'About' },
      { href: '/contact', zh: '联系', en: 'Contact' },
    ],
  },
  {
    heading: { zh: '合规', en: 'Compliance' },
    links: [
      { href: '/privacy', zh: '隐私 (PIPEDA)', en: 'Privacy (PIPEDA)' },
      { href: '/terms', zh: '使用条款', en: 'Terms of service' },
    ],
  },
]

export default function TrustApiPage() {
  const { lang } = useT()
  const isZh = lang === 'zh'
  const year = new Date().getFullYear()

  const title = isZh ? COPY.title_zh : COPY.title_en
  const accentWord = isZh ? COPY.accentWord_zh : COPY.accentWord_en
  const accentIdx = title.indexOf(accentWord)

  return (
    <main style={{ background: v3.surface, minHeight: '100vh', color: v3.textPrimary }}>
      <Header variant="transparent" />

      {/* Hero — warm cream + purple radial gradient + Verify agent orb */}
      <section
        style={{
          background: `
            radial-gradient(circle at 50% -8%, rgba(0,172,228,0.15), transparent 34%),
            radial-gradient(circle at 8% 58%, rgba(4,120,87,0.06), transparent 32%),
            radial-gradient(circle at 94% 74%, rgba(0,172,228,0.07), transparent 38%),
            linear-gradient(180deg, #fff 0%, #FBFAF7 46%, ${v3.surface} 100%)
          `,
          padding: '72px 24px 88px',
          borderBottom: `1px solid ${v3.divider}`,
        }}
      >
        <div style={{ maxWidth: size.content.wide, margin: '0 auto' }}>
          {/* Agent badge */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 12,
              padding: '8px 14px 8px 8px',
              borderRadius: 999,
              background: 'rgba(255,255,255,0.78)',
              border: `1px solid ${accent.soft}`,
              boxShadow: '0 12px 36px rgba(0,172,228,0.10)',
              marginBottom: 22,
              backdropFilter: 'blur(18px)',
              flexWrap: 'wrap',
            }}
            className="mk-agent-badge"
          >
            {/* Orb */}
            <span
              aria-hidden
              style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                position: 'relative',
                overflow: 'hidden',
                background: `radial-gradient(circle at 34% 28%, rgba(255,255,255,0.95), rgba(255,255,255,0.26) 24%, transparent 35%), linear-gradient(135deg, ${accent.orbA}, ${accent.orbB})`,
                boxShadow: `0 6px 18px ${accent.soft}`,
                flexShrink: 0,
              }}
            />
            <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: '-0.01em', color: v3.textPrimary }}>
              {AGENT.name}
            </span>
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: accent.fg,
                background: accent.soft,
                padding: '3px 8px',
                borderRadius: 999,
              }}
            >
              {AGENT.tier}
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: v3.textMuted, fontWeight: 500, paddingLeft: 4, borderLeft: `1px solid ${v3.divider}` }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: v3.success, boxShadow: `0 0 0 4px ${v3.successSoft}` }} />
              {isZh ? '正在为你工作' : 'Working for you'}
            </span>
          </div>

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
              marginLeft: 12,
              verticalAlign: 'middle',
            }}
          >
            {isZh ? `${COPY.eyebrow_zh} · ${COPY.eyebrow_en}` : `${COPY.eyebrow_en} · ${COPY.eyebrow_zh}`}
          </span>
          <h1
            className="mk-hero-h1"
            style={{
              fontSize: 'clamp(28px, 5vw, 60px)',
              lineHeight: 1.06,
              fontWeight: 800,
              letterSpacing: '-0.03em',
              margin: '24px 0 22px',
              maxWidth: 880,
            }}
          >
            {accentIdx < 0 ? (
              title
            ) : (
              <>
                {title.slice(0, accentIdx)}
                <span style={{ color: v3.brand }}>{accentWord}</span>
                {title.slice(accentIdx + accentWord.length)}
              </>
            )}
          </h1>
          <p
            style={{
              fontSize: 17,
              lineHeight: 1.65,
              color: v3.textSecondary,
              maxWidth: 640,
              margin: '0 0 32px',
            }}
          >
            {isZh ? COPY.subtitle_zh : COPY.subtitle_en}
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Link
              href={COPY.primaryCta.href}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                background: `linear-gradient(135deg, ${accent.orbA}, ${accent.orbB})`,
                color: '#fff',
                fontSize: 15,
                fontWeight: 700,
                padding: '14px 24px',
                borderRadius: 14,
                textDecoration: 'none',
                boxShadow: `0 14px 34px ${accent.soft}`,
                letterSpacing: '-0.01em',
              }}
            >
              {isZh ? COPY.primaryCta.label_zh : COPY.primaryCta.label_en} <span aria-hidden>→</span>
            </Link>
            <Link
              href={COPY.secondaryCta.href}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                background: 'rgba(255,255,255,0.78)',
                color: accent.fg,
                fontSize: 15,
                fontWeight: 700,
                padding: '14px 24px',
                borderRadius: 14,
                textDecoration: 'none',
                border: `1px solid ${accent.soft}`,
                backdropFilter: 'blur(12px)',
              }}
            >
              {isZh ? COPY.secondaryCta.label_zh : COPY.secondaryCta.label_en}
            </Link>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section style={{ padding: '48px 24px', borderBottom: `1px solid ${v3.divider}` }}>
        <div
          style={{
            maxWidth: size.content.wide,
            margin: '0 auto',
            display: 'grid',
            gridTemplateColumns: `repeat(${STATS.length}, 1fr)`,
            gap: 24,
          }}
          className="mk-stats-grid"
        >
          {STATS.map((s, i) => (
            <div key={i} style={{ borderLeft: `2px solid ${accent.fg}`, paddingLeft: 16 }}>
              <div
                style={{
                  fontSize: 36,
                  fontWeight: 800,
                  color: v3.textPrimary,
                  letterSpacing: '-0.025em',
                  lineHeight: 1.05,
                  marginBottom: 6,
                }}
              >
                {s.value}
              </div>
              <div style={{ color: v3.textMuted, fontSize: 13, lineHeight: 1.5 }}>
                {isZh ? s.label_zh : s.label_en}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Features — V5 glass cards */}
      <section style={{ padding: '64px 24px 32px' }}>
        <div style={{ maxWidth: size.content.wide, margin: '0 auto' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
              gap: 18,
            }}
            className="mk-features-grid"
          >
            {FEATURES.map((f, i) => (
              <div
                key={i}
                style={{
                  background: 'rgba(255,255,255,0.78)',
                  border: `1px solid ${v3.border}`,
                  borderRadius: 24,
                  padding: 24,
                  boxShadow: '0 18px 56px rgba(32,24,12,0.06)',
                  backdropFilter: 'blur(18px)',
                }}
              >
                {/* Top accent bar — only on the first card to highlight the V5
                    product-definition feature. */}
                {i === 0 && (
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      marginBottom: 14,
                      background: `linear-gradient(135deg, ${accent.orbA}, ${accent.orbB})`,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#fff',
                      fontSize: 18,
                      fontWeight: 800,
                      letterSpacing: '-0.04em',
                      boxShadow: `0 8px 18px ${accent.soft}`,
                    }}
                  >
                    ✦
                  </div>
                )}
                <h3
                  style={{
                    fontSize: 18,
                    fontWeight: 700,
                    letterSpacing: '-0.02em',
                    margin: '0 0 10px',
                    lineHeight: 1.3,
                    color: v3.textPrimary,
                  }}
                >
                  {isZh ? f.title_zh : f.title_en}
                </h3>
                <p style={{ color: v3.textSecondary, fontSize: 14, lineHeight: 1.65, margin: 0 }}>
                  {isZh ? f.body_zh : f.body_en}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Closing CTA */}
      <section style={{ padding: '56px 24px 88px' }}>
        <div
          style={{
            maxWidth: size.content.default,
            margin: '0 auto',
            background: `linear-gradient(135deg, ${accent.soft}, rgba(255,255,255,0.6))`,
            border: `1px solid ${accent.soft}`,
            borderRadius: 24,
            padding: 'clamp(28px, 4vw, 48px)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 24,
            flexWrap: 'wrap',
            boxShadow: `0 24px 80px ${accent.soft}`,
            backdropFilter: 'blur(18px)',
          }}
        >
          <p
            style={{
              fontSize: 24,
              fontWeight: 800,
              letterSpacing: '-0.025em',
              margin: 0,
              color: v3.textPrimary,
              maxWidth: 560,
              lineHeight: 1.25,
            }}
          >
            {isZh ? COPY.closing_zh : COPY.closing_en}
          </p>
          <Link
            href={COPY.primaryCta.href}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              background: `linear-gradient(135deg, ${accent.orbA}, ${accent.orbB})`,
              color: '#fff',
              fontSize: 15,
              fontWeight: 700,
              padding: '14px 26px',
              borderRadius: 14,
              textDecoration: 'none',
              boxShadow: `0 14px 34px ${accent.soft}`,
              letterSpacing: '-0.01em',
            }}
          >
            {isZh ? COPY.primaryCta.label_zh : COPY.primaryCta.label_en} <span aria-hidden>→</span>
          </Link>
        </div>
      </section>

      {/* Marketing footer (formerly MarketingFooter component) */}
      <footer
        style={{
          background: v3.surface,
          borderTop: `1px solid ${v3.divider}`,
          padding: '48px 24px 32px',
        }}
      >
        <div style={{ maxWidth: 1260, margin: '0 auto' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(220px, 1.4fr) repeat(3, minmax(160px, 1fr))',
              gap: 32,
              paddingBottom: 32,
              borderBottom: `1px solid ${v3.divider}`,
            }}
            className="mk-footer-grid"
          >
            <div>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'baseline',
                  marginBottom: 12,
                  fontFamily: 'Inter Tight, system-ui, sans-serif',
                  fontSize: 19,
                  fontWeight: 700,
                  letterSpacing: '-0.025em',
                }}
              >
                <span style={{ color: v3.textPrimary }}>stay</span>
                <span
                  style={{
                    background:
                      'linear-gradient(90deg, #4F46E5 0%, #00ACE4 50%, #A855F7 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                    color: 'transparent',
                  }}
                >
                  loop
                </span>
              </div>
              <p style={{ color: v3.textMuted, fontSize: 13, lineHeight: 1.6, margin: 0 }}>
                {isZh
                  ? '为北美租赁市场打造的 AI 信任基础设施。'
                  : 'AI-native trust infrastructure for the North American rental market.'}
              </p>
            </div>
            {FOOTER_GROUPS.map((g) => (
              <div key={g.heading.en}>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: v3.textPrimary,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    marginBottom: 14,
                  }}
                >
                  {isZh ? g.heading.zh : g.heading.en}
                </div>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {g.links.map((l) => (
                    <li key={l.href}>
                      <Link
                        href={l.href}
                        style={{
                          color: v3.textSecondary,
                          textDecoration: 'none',
                          fontSize: 14,
                        }}
                      >
                        {isZh ? l.zh : l.en}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 16,
              paddingTop: 24,
              color: v3.textMuted,
              fontSize: 12,
            }}
          >
            <div>© {year} Stayloop Inc. · Toronto, ON</div>
            <div>
              {isZh ? 'PIPEDA · OHRC · RTA 合规' : 'PIPEDA · OHRC · RTA compliant'}
            </div>
          </div>
        </div>
      </footer>

      <style jsx>{`
        @media (max-width: 860px) {
          :global(.mk-stats-grid) {
            grid-template-columns: 1fr 1fr !important;
          }
          :global(.mk-features-grid) {
            grid-template-columns: 1fr !important;
          }
          :global(.mk-agent-badge) {
            gap: 8px !important;
          }
          :global(.mk-footer-grid) {
            grid-template-columns: 1fr 1fr !important;
          }
        }
        @media (max-width: 600px) {
          :global(.mk-stats-grid) {
            grid-template-columns: 1fr !important;
          }
          :global(.mk-agent-badge) {
            flex-direction: column !important;
            align-items: flex-start !important;
          }
          :global(.mk-footer-grid) {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </main>
  )
}
