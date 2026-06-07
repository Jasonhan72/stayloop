// -----------------------------------------------------------------------------
// Next.js App Router root loading state — /app/loading.tsx
// -----------------------------------------------------------------------------
// Shown during route transitions while React server components stream in.
// Subtle, centered pulse so a quick navigation doesn't flash a heavy UI.
// Bilingual label, V3 cream surface. No JS dependency (pure CSS animation).
// -----------------------------------------------------------------------------

import type { CSSProperties } from 'react'

const COLORS = {
  surface: '#F2EEE5',
  textMuted: '#71717A',
  brand: '#047857',
  brandLine: 'rgba(4, 120, 87, 0.20)',
} as const

const wrapper: CSSProperties = {
  minHeight: '60vh',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 16,
  backgroundColor: COLORS.surface,
  padding: '48px 20px',
  fontFamily:
    'var(--font-inter), "Inter Tight", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
}

const spinner: CSSProperties = {
  width: 32,
  height: 32,
  borderRadius: 999,
  border: `2px solid ${COLORS.brandLine}`,
  borderTopColor: COLORS.brand,
  animation: 'stayloop-spin 0.9s linear infinite',
}

const label: CSSProperties = {
  fontSize: 13,
  fontWeight: 500,
  color: COLORS.textMuted,
  letterSpacing: '0.01em',
  margin: 0,
}

export default function Loading() {
  return (
    <div style={wrapper} aria-busy aria-live="polite">
      {/*
        Inline keyframes — no global stylesheet dependency. Next.js dedupes
        identical <style> nodes across renders, so this is fine.
      */}
      <style>{`
        @keyframes stayloop-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
      <div style={spinner} aria-hidden />
      <p style={label}>Loading… · 加载中…</p>
    </div>
  )
}
