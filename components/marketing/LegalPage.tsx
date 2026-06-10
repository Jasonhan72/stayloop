'use client'
// -----------------------------------------------------------------------------
// LegalPage — shared shell for /legal/privacy, /legal/terms, /legal/security
// -----------------------------------------------------------------------------
// Each legal page provides bilingual title + body content via the props.
// Styling mirrors /about: marketing nav + soft-mint hero + cream body +
// marketing footer. The body sits inside a max-width prose column so long
// legal copy stays readable.
// -----------------------------------------------------------------------------

import type { ReactNode } from 'react'
import { v3, size } from '@/lib/brand'
import { useT } from '@/lib/i18n'
import MarketingNav from './MarketingNav'
import MarketingFooter from './MarketingFooter'

interface Props {
  title_en: string
  title_zh: string
  /** Short summary line shown beneath the title. */
  lede_en: string
  lede_zh: string
  /** Effective date label, e.g. "Last updated May 5, 2026". */
  updated_en: string
  updated_zh: string
  /** Body content. Each page renders its own JSX inside the prose column. */
  bodyEn: ReactNode
  bodyZh: ReactNode
}

export default function LegalPage({
  title_en, title_zh,
  lede_en, lede_zh,
  updated_en, updated_zh,
  bodyEn, bodyZh,
}: Props) {
  const { lang } = useT()
  const isZh = lang === 'zh'

  return (
    <main style={{ background: v3.surface, minHeight: '100vh', color: v3.textPrimary }}>
      <MarketingNav />

      <section
        style={{
          background: `linear-gradient(180deg, ${v3.brandWash} 0%, ${v3.surface} 100%)`,
          padding: '64px 24px 40px',
          borderBottom: `1px solid ${v3.divider}`,
        }}
      >
        <div style={{ maxWidth: size.content.default, margin: '0 auto' }}>
          <span
            style={{
              display: 'inline-block',
              fontSize: 11,
              fontWeight: 700,
              color: v3.brandStrong,
              textTransform: 'uppercase',
              letterSpacing: '0.12em',
              marginBottom: 12,
            }}
          >
            {isZh ? '法律 / 合规' : 'Legal / Compliance'}
          </span>
          <h1
            style={{
              fontSize: 'clamp(32px, 4.4vw, 44px)',
              fontWeight: 700,
              letterSpacing: '-0.025em',
              margin: '0 0 12px',
              lineHeight: 1.1,
            }}
          >
            {isZh ? title_zh : title_en}
          </h1>
          <p
            style={{
              fontSize: 16,
              color: v3.textSecondary,
              lineHeight: 1.55,
              margin: '0 0 14px',
              maxWidth: 760,
            }}
          >
            {isZh ? lede_zh : lede_en}
          </p>
          <div
            style={{
              fontSize: 12,
              color: v3.textMuted,
              fontFamily: 'var(--font-mono), ui-monospace, monospace',
              letterSpacing: '0.06em',
            }}
          >
            ◆ {isZh ? updated_zh : updated_en}
          </div>
        </div>
      </section>

      <section style={{ padding: '40px 24px 80px' }}>
        <article
          style={{
            maxWidth: 760,
            margin: '0 auto',
            background: v3.surfaceCard,
            border: `1px solid ${v3.border}`,
            borderRadius: 16,
            padding: 'clamp(24px, 3vw, 40px)',
            fontSize: 15,
            lineHeight: 1.7,
            color: v3.textSecondary,
          }}
          className="legal-prose"
        >
          {isZh ? bodyZh : bodyEn}
        </article>
      </section>

      <MarketingFooter />

      <style jsx global>{`
        .legal-prose h2 {
          font-size: 20px;
          font-weight: 700;
          color: ${v3.textPrimary};
          letter-spacing: -0.015em;
          margin: 28px 0 10px;
        }
        .legal-prose h3 {
          font-size: 15px;
          font-weight: 700;
          color: ${v3.textPrimary};
          margin: 18px 0 6px;
        }
        .legal-prose p {
          margin: 0 0 12px;
        }
        .legal-prose ul {
          margin: 0 0 12px;
          padding-left: 22px;
        }
        .legal-prose li {
          margin: 4px 0;
        }
        .legal-prose a {
          color: ${v3.brand};
          text-decoration: underline;
        }
        .legal-prose strong {
          color: ${v3.textPrimary};
        }
      `}</style>
    </main>
  )
}
