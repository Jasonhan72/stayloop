'use client'
// -----------------------------------------------------------------------------
// Next.js App Router global error boundary
// -----------------------------------------------------------------------------
// Rendered when any uncaught error bubbles out of a page or layout in /app.
// Must be a Client Component (Next.js requirement).
//
// Design language: V3 brand palette (cream + emerald) with inline styles so
// the boundary stays usable even if the global stylesheet fails to load.
// Bilingual EN + ZH so both audiences understand the failure mode regardless
// of LanguageProvider state (which may itself be the thing that crashed).
// -----------------------------------------------------------------------------

import { useEffect } from 'react'
import Link from 'next/link'
import { captureException } from '@/lib/observability/sentry'

interface AppErrorProps {
  error: Error & { digest?: string }
  reset: () => void
}

// V3 brand palette — duplicated as literals so this file has no runtime
// dependency on lib/brand (so it can render even if brand module crashed).
const COLORS = {
  surface: '#F2EEE5',
  card: '#FFFFFF',
  border: '#D8D2C2',
  textPrimary: '#171717',
  textSecondary: '#3F3F46',
  textMuted: '#71717A',
  brand: '#047857',
  brandStrong: '#065F46',
  textOnBrand: '#FFFFFF',
  dangerSoft: '#FEE2E2',
  danger: '#DC2626',
} as const

export default function AppError({ error, reset }: AppErrorProps) {
  useEffect(() => {
    captureException(error, { route: 'app-error-boundary' })
  }, [error])

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: COLORS.surface,
        padding: '32px 20px',
        fontFamily:
          'var(--font-inter), "Inter Tight", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        color: COLORS.textPrimary,
      }}
    >
      <div
        role="alert"
        aria-live="assertive"
        style={{
          width: '100%',
          maxWidth: 520,
          backgroundColor: COLORS.card,
          border: `1px solid ${COLORS.border}`,
          borderRadius: 12,
          padding: '36px 32px',
          boxShadow:
            '0 1px 3px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)',
          textAlign: 'center',
        }}
      >
        <div
          aria-hidden
          style={{
            width: 56,
            height: 56,
            borderRadius: 999,
            backgroundColor: COLORS.dangerSoft,
            color: COLORS.danger,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 28,
            lineHeight: 1,
            marginBottom: 20,
          }}
        >
          !
        </div>

        <h1
          style={{
            fontSize: 22,
            fontWeight: 700,
            margin: '0 0 8px',
            letterSpacing: '-0.01em',
          }}
        >
          Something went wrong
        </h1>
        <p
          style={{
            fontSize: 16,
            fontWeight: 500,
            margin: '0 0 18px',
            color: COLORS.textSecondary,
          }}
        >
          出错了，请刷新或返回首页
        </p>

        <p
          style={{
            fontSize: 14,
            lineHeight: 1.55,
            color: COLORS.textMuted,
            margin: '0 0 24px',
          }}
        >
          We've logged the issue and our team will look into it.
          <br />
          我们已记录此问题，团队会尽快排查。
        </p>

        {error?.digest ? (
          <p
            style={{
              fontSize: 12,
              color: COLORS.textMuted,
              fontFamily: 'var(--font-mono), ui-monospace, monospace',
              margin: '0 0 24px',
              wordBreak: 'break-all',
            }}
          >
            ref: {error.digest}
          </p>
        ) : null}

        <div
          style={{
            display: 'flex',
            gap: 12,
            justifyContent: 'center',
            flexWrap: 'wrap',
          }}
        >
          <button
            type="button"
            onClick={() => reset()}
            style={{
              appearance: 'none',
              border: 'none',
              cursor: 'pointer',
              backgroundColor: COLORS.brand,
              color: COLORS.textOnBrand,
              padding: '10px 20px',
              fontSize: 14,
              fontWeight: 600,
              borderRadius: 8,
              minWidth: 120,
            }}
            onMouseDown={(e) => {
              e.currentTarget.style.backgroundColor = COLORS.brandStrong
            }}
            onMouseUp={(e) => {
              e.currentTarget.style.backgroundColor = COLORS.brand
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = COLORS.brand
            }}
          >
            重试 · Retry
          </button>
          <Link
            href="/"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: COLORS.card,
              color: COLORS.textPrimary,
              padding: '10px 20px',
              fontSize: 14,
              fontWeight: 600,
              borderRadius: 8,
              border: `1px solid ${COLORS.border}`,
              textDecoration: 'none',
              minWidth: 120,
            }}
          >
            回到首页 · Home
          </Link>
        </div>
      </div>
    </div>
  )
}
