'use client'
// -----------------------------------------------------------------------------
// V3 prototype frame helpers — responsive container
// -----------------------------------------------------------------------------
// Phone() used to render a literal iOS bezel on desktop — that was prototype
// styling and felt like fake "phone inside a webpage" chrome. The user
// preference is a real desktop layout. Now:
//
//   - Mobile (< 768px): edge-to-edge native, with the iOS-style time +
//     signal/battery row at the top (kept because it reads well on phones).
//   - Desktop (>= 768px): centered cream card column (max-width 540px) on
//     the V3 surface. NO bezel, NO time/status bar — looks like a focused
//     web reading column, not a prototype mock.
//
// Pages don't need to change; the wrapper alone produces both layouts.
// Browser() (used for marketing prototype mocks) is unchanged.
// -----------------------------------------------------------------------------

import type { ReactNode } from 'react'
import { v3 } from '@/lib/brand'

export function Phone({
  children,
  time = '14:22',
}: {
  children: ReactNode
  /** Time shown only on the mobile status bar; ignored on desktop. */
  time?: string
  /** Deprecated — width/height are no longer used; the frame is responsive. */
  width?: number
  height?: number
}) {
  return (
    <>
      {/* Mobile (< 768px) — render edge-to-edge as a native app */}
      <div className="phone-mobile">
        <div
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 30,
            background: v3.surface,
            padding: '12px 20px 6px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: 13,
            fontWeight: 600,
            color: v3.textPrimary,
            fontFamily: '-apple-system, system-ui',
          }}
        >
          <span>{time}</span>
          <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <SignalGlyph />
            <BatteryGlyph />
          </span>
        </div>
        <div>{children}</div>
      </div>

      {/* Desktop (>= 768px) — centered cream card, no iOS bezel */}
      <div className="phone-desktop">
        <div
          style={{
            maxWidth: 540,
            margin: '24px auto 64px',
            background: v3.surfaceCard,
            border: `1px solid ${v3.border}`,
            borderRadius: 18,
            boxShadow:
              '0 1px 3px rgba(31, 25, 11, 0.04), 0 12px 32px -8px rgba(31, 25, 11, 0.08)',
            overflow: 'hidden',
          }}
        >
          {children}
        </div>
      </div>

      <style jsx>{`
        .phone-mobile { display: block; min-height: 100vh; background: ${v3.surface}; }
        .phone-desktop { display: none; }
        @media (min-width: 768px) {
          .phone-mobile { display: none; }
          .phone-desktop { display: block; padding: 0 16px; }
        }
      `}</style>
    </>
  )
}

function SignalGlyph() {
  return (
    <svg width={16} height={11} viewBox="0 0 16 11" aria-hidden>
      <path
        d="M8 1.5C5 1.5 2.5 3 1 4.5l1.2 1.2C3.4 4.5 5.5 3.5 8 3.5s4.6 1 5.8 2.2L15 4.5C13.5 3 11 1.5 8 1.5zM4 7l1.2 1.2C5.9 7.5 6.9 7 8 7s2.1.5 2.8 1.2L12 7c-1-1-2.4-1.5-4-1.5S5 6 4 7zm2.5 2.5L8 11l1.5-1.5C9.1 9.2 8.5 9 8 9s-1.1.2-1.5.5z"
        fill="currentColor"
      />
    </svg>
  )
}

function BatteryGlyph() {
  return (
    <svg width={13} height={11} viewBox="0 0 13 11" aria-hidden>
      <rect x="0.5" y="0.5" width={11} height={6} rx={1.5} stroke="currentColor" fill="none" />
      <rect x={2} y={2} width={7.5} height={3} rx={0.5} fill="currentColor" />
    </svg>
  )
}

export function Browser({
  children,
  url = 'console.stayloop.ai',
  width = 1100,
  height = 700,
}: {
  children: ReactNode
  url?: string
  width?: number
  height?: number
}) {
  return (
    <>
      {/* Mobile — full-bleed, no chrome */}
      <div className="browser-mobile" style={{ background: v3.surface, minHeight: '100vh' }}>
        {children}
      </div>

      {/* Desktop — Mac-style window chrome */}
      <div className="browser-desktop">
        <div
          style={{
            width: '100%',
            maxWidth: width,
            margin: '24px auto',
            background: '#1a1a1f',
            borderRadius: 12,
            overflow: 'hidden',
            boxShadow: '0 25px 60px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.06)',
          }}
        >
          <div
            style={{
              height: 32,
              padding: '0 14px',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              background: 'linear-gradient(180deg, #1f1f25, #16161b)',
            }}
          >
            <span style={{ width: 11, height: 11, borderRadius: 999, background: '#FF5F57', display: 'inline-block' }} />
            <span style={{ width: 11, height: 11, borderRadius: 999, background: '#FEBC2E', display: 'inline-block' }} />
            <span style={{ width: 11, height: 11, borderRadius: 999, background: '#28C840', display: 'inline-block' }} />
            <div
              style={{
                flex: 1,
                maxWidth: 460,
                margin: '0 auto',
                background: '#0B0B0E',
                border: '1px solid #2a2a33',
                borderRadius: 6,
                height: 22,
                display: 'flex',
                alignItems: 'center',
                padding: '0 10px',
                fontFamily: 'var(--font-mono), ui-monospace, monospace',
                fontSize: 11,
                color: '#8A8A95',
                gap: 6,
              }}
            >
              <span style={{ color: v3.brandBright }}>●</span>
              <span>{url}</span>
            </div>
            <div style={{ width: 50 }} />
          </div>
          <div style={{ background: v3.surface, height, overflow: 'auto' }}>{children}</div>
        </div>
      </div>

      <style jsx>{`
        .browser-mobile { display: block; }
        .browser-desktop { display: none; }
        @media (min-width: 768px) {
          .browser-mobile { display: none; }
          .browser-desktop { display: block; }
        }
      `}</style>
    </>
  )
}
