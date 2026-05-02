'use client'
// -----------------------------------------------------------------------------
// V4 SecHead — eyebrow + title (+ sub) + right slot, with emerald gradient rule
// -----------------------------------------------------------------------------
// Direct port of `SecHead()` from .v4-source/primitives.jsx.
// Used as the section header on most pages.
// -----------------------------------------------------------------------------

import type { ReactNode } from 'react'
import { v3 } from '@/lib/brand'

interface Props {
  eyebrow?: string
  title: string
  sub?: string
  right?: ReactNode
}

export default function SecHead({ eyebrow, title, sub, right }: Props) {
  return (
    <div style={{ marginBottom: 20 }}>
      {eyebrow && (
        <div
          style={{
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 10.5,
            letterSpacing: '0.10em',
            textTransform: 'uppercase',
            color: v3.textMuted,
            fontWeight: 700,
            marginBottom: 10,
          }}
        >
          {eyebrow}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
        <h2
          style={{
            margin: 0,
            fontFamily: 'Inter Tight, system-ui, sans-serif',
            fontSize: 24,
            fontWeight: 600,
            color: v3.textPrimary,
            letterSpacing: '-0.02em',
          }}
        >
          {title}
        </h2>
        {sub && <span style={{ fontSize: 13, color: v3.textMuted }}>{sub}</span>}
        <div style={{ flex: 1 }} />
        {right}
      </div>
      <hr
        style={{
          height: 1,
          background:
            'linear-gradient(90deg, #047857, rgba(16,185,129,0.32) 60%, transparent)',
          border: 0,
          marginTop: 14,
        }}
      />
    </div>
  )
}
