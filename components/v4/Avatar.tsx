'use client'
// -----------------------------------------------------------------------------
// V4 Avatar — circular initials badge with role-derived color
// -----------------------------------------------------------------------------
// Direct port of `Avatar()` from .v4-source/primitives.jsx.
// -----------------------------------------------------------------------------

import { v3 } from '@/lib/brand'

interface Props {
  name?: string
  size?: number
}

const PALETTE = [v3.brand, v3.brandBright, v3.trust, v3.success, v3.info, '#9333EA', '#0891B2']

export default function Avatar({ name = '?', size = 32 }: Props) {
  const initials = (() => {
    if (!name) return '?'
    const parts = name.trim().split(/\s+/)
    return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '?'
  })()
  const color = PALETTE[(name?.length || 0) % PALETTE.length]

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: color,
        color: '#F2EEE5',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 600,
        fontSize: Math.round(size * 0.4),
        flexShrink: 0,
        userSelect: 'none',
      }}
    >
      {initials}
    </div>
  )
}
