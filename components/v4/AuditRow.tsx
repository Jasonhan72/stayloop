'use client'
// -----------------------------------------------------------------------------
// V4 AuditRow — single row in an audit/activity log table
// -----------------------------------------------------------------------------
// Direct port of `AuditRow()` from .v4-source/primitives.jsx.
// -----------------------------------------------------------------------------

import { v3 } from '@/lib/brand'

interface Props {
  when: string
  actor: string
  action: string
  target: string
  ip?: string
}

export default function AuditRow({ when, actor, action, target, ip }: Props) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '120px 140px 1fr 100px',
        gap: 14,
        padding: '10px 0',
        borderBottom: `1px dashed ${v3.border}`,
        fontSize: 12,
        alignItems: 'baseline',
      }}
    >
      <span style={{ fontFamily: 'JetBrains Mono, monospace', color: v3.textFaint }}>
        {when}
      </span>
      <span style={{ color: v3.textPrimary, fontWeight: 500 }}>{actor}</span>
      <span style={{ color: v3.textSecondary }}>
        {action}{' '}
        <b style={{ color: v3.textPrimary }}>{target}</b>
      </span>
      {ip ? (
        <span
          style={{
            fontFamily: 'JetBrains Mono, monospace',
            color: v3.textFaint,
            textAlign: 'right',
          }}
        >
          {ip}
        </span>
      ) : (
        <span />
      )}
    </div>
  )
}
