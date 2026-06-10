'use client'
// -----------------------------------------------------------------------------
// V4 Tabs — sub-section navigator with optional count badges
// -----------------------------------------------------------------------------
// Direct port of `Tabs()` from .v4-source/primitives.jsx.
// -----------------------------------------------------------------------------

import { v3 } from '@/lib/brand'

interface TabItem {
  id: string
  label: string
  count?: number
  tone?: 'default' | 'pri' | 'ai' | 'gold' | 'ok' | 'warn' | 'err' | 'info'
}

interface Props {
  items: TabItem[]
  active: string
  onChange?: (id: string) => void
}

function tagColors(tone: TabItem['tone']) {
  switch (tone) {
    case 'ai':
      return { fg: v3.trust, bg: '#F3E8FF', bd: '#D7C5FA' }
    case 'pri':
    case 'gold':
      return { fg: v3.brand, bg: '#DCFCE7', bd: 'rgba(16,185,129,0.32)' }
    case 'ok':
      return { fg: v3.success, bg: '#DCFCE7', bd: '#BBF7D0' }
    case 'warn':
      return { fg: v3.warning, bg: '#FEF3C7', bd: '#FDE68A' }
    case 'err':
      return { fg: v3.danger, bg: '#FEE2E2', bd: '#FECACA' }
    case 'info':
      return { fg: v3.info, bg: '#DBEAFE', bd: '#BFDBFE' }
    default:
      return { fg: v3.textSecondary, bg: v3.surfaceMuted, bd: v3.border }
  }
}

export default function Tabs({ items, active, onChange }: Props) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 0,
        borderBottom: `1px solid ${v3.border}`,
        marginBottom: 20,
      }}
    >
      {items.map((t) => {
        const c = tagColors(t.tone)
        const isActive = active === t.id
        return (
          <button
            key={t.id}
            onClick={() => onChange?.(t.id)}
            style={{
              background: 'none',
              border: 0,
              padding: '10px 16px',
              fontFamily: 'Inter Tight, system-ui, sans-serif',
              fontSize: 13,
              fontWeight: isActive ? 600 : 500,
              color: isActive ? v3.textPrimary : v3.textMuted,
              cursor: 'pointer',
              borderBottom: isActive
                ? `2px solid ${v3.brand}`
                : '2px solid transparent',
              marginBottom: -1,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            {t.label}
            {t.count != null && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '3px 9px',
                  fontSize: 11,
                  fontWeight: 600,
                  borderRadius: 999,
                  border: `1px solid ${c.bd}`,
                  color: c.fg,
                  background: c.bg,
                  letterSpacing: '-0.005em',
                }}
              >
                {t.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
