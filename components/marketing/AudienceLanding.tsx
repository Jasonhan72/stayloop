'use client'
// -----------------------------------------------------------------------------
// AudienceLanding — shared layout for /tenants, /landlords, /agents, /trust-api
// -----------------------------------------------------------------------------
// V5 visual: glass cards on a soft warm-cream backdrop with a purple radial
// gradient at the hero, plus a named personal-agent badge per role. Per the
// V5 preview HTML in /uploads/preview\ \(3\).html.
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

/**
 * Optional personal-agent badge shown in the hero. Per V5 preview, every
 * role has a named agent: Tenant=Luna · Landlord=Logic · Agent=Brief ·
 * Trust API=Verify · etc.
 */
export interface AgentIdentity {
  name: string
  /** Drives the orb gradient + badge accent color. */
  accent?: 'purple' | 'emerald' | 'mint'
  /** Pill text next to the name. Defaults to 'Pro'. */
  tier?: string
  /** ZH/EN status line — defaults to '正在为你工作' / 'Working for you'. */
  status_zh?: string
  status_en?: string
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
  /** Optional named agent identity for this role (V5). */
  agent?: AgentIdentity
}

const ACCENT: Record<NonNullable<AgentIdentity['accent']>, { fg: string; soft: string; orbA: string; orbB: string }> = {
  purple:  { fg: '#7C3AED', soft: 'rgba(124,58,237,0.10)', orbA: 'rgba(124,58,237,0.92)', orbB: 'rgba(139,92,246,0.74)' },
  emerald: { fg: '#047857', soft: 'rgba(4,120,87,0.10)',   orbA: 'rgba(4,120,87,0.92)',   orbB: 'rgba(16,185,129,0.78)' },
  mint:    { fg: '#10B981', soft: 'rgba(16,185,129,0.12)', orbA: 'rgba(16,185,129,0.92)', orbB: 'rgba(110,231,183,0.78)' },
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

  const accent = p.agent ? ACCENT[p.agent.accent || 'purple'] : ACCENT.purple

  return (
    <main style={{ background: v3.surface, minHeight: '100vh', color: v3.textPrimary }}>
      <MarketingNav />

      {/* Hero — V5: warm cream + purple radial gradient + (optional) agent orb */}
      <section
        style={{
          background: `
            radial-gradient(circle at 50% -8%, rgba(124,58,237,0.15), transparent 34%),
            radial-gradient(circle at 8% 58%, rgba(4,120,87,0.06), transparent 32%),
            radial-gradient(circle at 94% 74%, rgba(124,58,237,0.07), transparent 38%),
            linear-gradient(180deg, #fff 0%, #FBFAF7 46%, ${v3.surface} 100%)
          `,
          padding: '72px 24px 88px',
          borderBottom: `1px solid ${v3.divider}`,
        }}
      >
        <div style={{ maxWidth: size.content.wide, margin: '0 auto' }}>
          {/* Agent badge — only when an agent identity is provided */}
          {p.agent && (
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 12,
                padding: '8px 14px 8px 8px',
                borderRadius: 999,
                background: 'rgba(255,255,255,0.78)',
                border: `1px solid ${accent.soft}`,
                boxShadow: '0 12px 36px rgba(124,58,237,0.10)',
                marginBottom: 22,
                backdropFilter: 'blur(18px)',
              }}
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
                {p.agent.name}
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
                {p.agent.tier || 'Pro'}
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: v3.textMuted, fontWeight: 500, paddingLeft: 4, borderLeft: `1px solid ${v3.divider}` }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: v3.success, boxShadow: `0 0 0 4px ${v3.successSoft}` }} />
                {isZh
                  ? p.agent.status_zh || '正在为你工作'
                  : p.agent.status_en || 'Working for you'}
              </span>
            </div>
          )}

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
              marginLeft: p.agent ? 12 : 0,
              verticalAlign: 'middle',
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
              {isZh ? p.primaryCta.label_zh : p.primaryCta.label_en} <span aria-hidden>→</span>
            </Link>
            {p.secondaryCta && (
              <Link
                href={p.secondaryCta.href}
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
          >
            {p.features.map((f, i) => (
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
                    product-definition feature ("personal AI agent"). */}
                {i === 0 && p.agent && (
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
            {isZh ? p.closing_zh : p.closing_en}
          </p>
          <Link
            href={p.primaryCta.href}
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
