'use client'
// -----------------------------------------------------------------------------
// AudienceLanding — shared layout for /tenants, /landlords, /agents, /trust-api
// -----------------------------------------------------------------------------

import Link from 'next/link'
import { v3, size } from '@/lib/brand'
import { useT } from '@/lib/i18n'
import MarketingNav from './MarketingNav'
import MarketingFooter from './MarketingFooter'

export interface FeatureItem {
  title_zh: string
  title_en: string
  body_zh: string
  body_en: string
}

export interface AudienceProps {
  eyebrow_zh: string
  eyebrow_en: string
  title_zh: string
  title_en: string
  /** Optional accent word inside the title that gets brand-color treatment. */
  accentWord_zh?: string
  accentWord_en?: string
  subtitle_zh: string
  subtitle_en: string
  /** Primary CTA label + href. */
  primaryCta: { label_zh: string; label_en: string; href: string }
  /** Optional secondary CTA. */
  secondaryCta?: { label_zh: string; label_en: string; href: string }
  /** Stat row (3-4 items). */
  stats: Array<{ value: string; label_zh: string; label_en: string }>
  /** Feature list. */
  features: FeatureItem[]
  /** Closing CTA. */
  closing_zh: string
  closing_en: string
}

export default function AudienceLanding(p: AudienceProps) {
  const { lang } = useT()
  const isZh = lang === 'zh'

  const wrapAccent = (text: string, accent: string | undefined) => {
    if (!accent) return text
    const idx = text.indexOf(accent)
    if (idx < 0) return text
    return (
      <>
        {text.slice(0, idx)}
        <span style={{ color: v3.brand }}>{accent}</span>
        {text.slice(idx + accent.length)}
      </>
    )
  }

  return (
    <main style={{ background: v3.surface, minHeight: '100vh', color: v3.textPrimary }}>
      <MarketingNav />

      {/* Hero */}
      <section
        style={{
          background: `linear-gradient(180deg, ${v3.brandWash} 0%, ${v3.surface} 100%)`,
          padding: '72px 24px 80px',
          borderBottom: `1px solid ${v3.divider}`,
        }}
      >
        <div style={{ maxWidth: size.content.wide, margin: '0 auto' }}>
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
            }}
          >
            {isZh ? `${p.eyebrow_zh} · ${p.eyebrow_en}` : `${p.eyebrow_en} · ${p.eyebrow_zh}`}
          </span>
          <h1
            style={{
              fontSize: 'clamp(36px, 5vw, 60px)',
              lineHeight: 1.06,
              fontWeight: 800,
              letterSpacing: '-0.03em',
              margin: '24px 0 22px',
              maxWidth: 880,
            }}
          >
            {wrapAccent(isZh ? p.title_zh : p.title_en, isZh ? p.accentWord_zh : p.accentWord_en)}
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
            {isZh ? p.subtitle_zh : p.subtitle_en}
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Link
              href={p.primaryCta.href}
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
              {isZh ? p.primaryCta.label_zh : p.primaryCta.label_en} <span aria-hidden>→</span>
            </Link>
            {p.secondaryCta && (
              <Link
                href={p.secondaryCta.href}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  background: v3.surface,
                  color: v3.textPrimary,
                  fontSize: 15,
                  fontWeight: 600,
                  padding: '12px 22px',
                  borderRadius: 10,
                  textDecoration: 'none',
                  border: `1px solid ${v3.borderStrong}`,
                }}
              >
                {isZh ? p.secondaryCta.label_zh : p.secondaryCta.label_en}
              </Link>
            )}
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
            gridTemplateColumns: `repeat(${p.stats.length}, 1fr)`,
            gap: 24,
          }}
          className="mk-stats-grid"
        >
          {p.stats.map((s, i) => (
            <div key={i} style={{ borderLeft: `2px solid ${v3.brand}`, paddingLeft: 16 }}>
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

      {/* Features */}
      <section style={{ padding: '64px 24px 32px' }}>
        <div style={{ maxWidth: size.content.wide, margin: '0 auto' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: 16,
            }}
          >
            {p.features.map((f, i) => (
              <div
                key={i}
                style={{
                  background: v3.surface,
                  border: `1px solid ${v3.border}`,
                  borderRadius: 14,
                  padding: 24,
                }}
              >
                <h3
                  style={{
                    fontSize: 18,
                    fontWeight: 700,
                    letterSpacing: '-0.015em',
                    margin: '0 0 10px',
                    lineHeight: 1.3,
                  }}
                >
                  {isZh ? f.title_zh : f.title_en}
                </h3>
                <p style={{ color: v3.textSecondary, fontSize: 14, lineHeight: 1.6, margin: 0 }}>
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
            background: v3.brandWash,
            border: `1px solid ${v3.brandSoft}`,
            borderRadius: 20,
            padding: 'clamp(28px, 4vw, 48px)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 24,
            flexWrap: 'wrap',
          }}
        >
          <p
            style={{
              fontSize: 22,
              fontWeight: 700,
              letterSpacing: '-0.02em',
              margin: 0,
              color: v3.textPrimary,
            }}
          >
            {isZh ? p.closing_zh : p.closing_en}
          </p>
          <Link
            href={p.primaryCta.href}
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
            {isZh ? p.primaryCta.label_zh : p.primaryCta.label_en} <span aria-hidden>→</span>
          </Link>
        </div>
      </section>

      <MarketingFooter />
      <style jsx>{`
        @media (max-width: 760px) {
          :global(.mk-stats-grid) {
            grid-template-columns: 1fr 1fr !important;
          }
        }
      `}</style>
    </main>
  )
}
