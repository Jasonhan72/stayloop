// -----------------------------------------------------------------------------
// Next.js App Router 404 — /app/not-found.tsx
// -----------------------------------------------------------------------------
// Rendered for any unmatched route under /app. Server component (no JS).
// Bilingual EN + ZH, V3 brand palette via inline styles.
// -----------------------------------------------------------------------------

import Link from 'next/link'
import type { CSSProperties } from 'react'

const COLORS = {
  surface: '#F2EEE5',
  card: '#FFFFFF',
  border: '#D8D2C2',
  textPrimary: '#171717',
  textSecondary: '#3F3F46',
  textMuted: '#71717A',
  brand: '#047857',
  brandSoft: '#E4EEE3',
  textOnBrand: '#FFFFFF',
} as const

const wrapper: CSSProperties = {
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: COLORS.surface,
  padding: '32px 20px',
  fontFamily:
    'var(--font-inter), "Inter Tight", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  color: COLORS.textPrimary,
}

const card: CSSProperties = {
  width: '100%',
  maxWidth: 520,
  backgroundColor: COLORS.card,
  border: `1px solid ${COLORS.border}`,
  borderRadius: 12,
  padding: '40px 32px',
  textAlign: 'center',
  boxShadow:
    '0 1px 3px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)',
}

const codeBadge: CSSProperties = {
  display: 'inline-block',
  fontSize: 12,
  fontWeight: 600,
  letterSpacing: '0.08em',
  color: COLORS.brand,
  backgroundColor: COLORS.brandSoft,
  padding: '4px 10px',
  borderRadius: 999,
  marginBottom: 20,
  textTransform: 'uppercase',
}

const homeLink: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: COLORS.brand,
  color: COLORS.textOnBrand,
  padding: '10px 20px',
  fontSize: 14,
  fontWeight: 600,
  borderRadius: 8,
  textDecoration: 'none',
  minWidth: 160,
}

export default function NotFound() {
  return (
    <div style={wrapper}>
      <div style={card}>
        <span style={codeBadge}>404</span>
        <h1
          style={{
            fontSize: 22,
            fontWeight: 700,
            margin: '0 0 8px',
            letterSpacing: '-0.01em',
          }}
        >
          Page not found
        </h1>
        <p
          style={{
            fontSize: 16,
            fontWeight: 500,
            margin: '0 0 18px',
            color: COLORS.textSecondary,
          }}
        >
          页面没找到
        </p>
        <p
          style={{
            fontSize: 14,
            lineHeight: 1.55,
            color: COLORS.textMuted,
            margin: '0 0 28px',
          }}
        >
          The page you're looking for has moved or doesn't exist.
          <br />
          您访问的页面已迁移或不存在。
        </p>
        <Link href="/" style={homeLink}>
          回到首页 · Back to home
        </Link>
      </div>
    </div>
  )
}
