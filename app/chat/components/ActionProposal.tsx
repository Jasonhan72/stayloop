'use client'

// -----------------------------------------------------------------------------
// ActionProposal — pending-actions block
// -----------------------------------------------------------------------------
// Renders an AI-proposed action with [批准] / [驳回] / [修改] buttons.
// Wires to /api/agent/action endpoint.
// -----------------------------------------------------------------------------

import { useState } from 'react'
import { tokens } from '@/lib/agent/theme'

interface ActionProposalProps {
  pending_action_id: string
  action_kind: string
  preview?: any
  label_zh?: string
  label_en?: string
  lang?: 'zh' | 'en'
  authToken: string
  onDecided?: (decision: string) => void
}

export function ActionProposal({
  pending_action_id,
  action_kind,
  preview,
  label_zh,
  label_en,
  lang = 'zh',
  authToken,
  onDecided,
}: ActionProposalProps) {
  const [decision, setDecision] = useState<'pending' | 'approving' | 'rejecting' | 'approved' | 'rejected'>('pending')
  const [error, setError] = useState<string | null>(null)

  async function decide(action: 'approve' | 'reject') {
    setDecision(action === 'approve' ? 'approving' : 'rejecting')
    setError(null)
    try {
      const res = await fetch('/api/agent/action', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          pending_action_id,
          decision: action,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'failed')
        setDecision('pending')
        return
      }
      setDecision(action === 'approve' ? 'approved' : 'rejected')
      onDecided?.(action)
    } catch (e: any) {
      setError(e?.message || 'failed')
      setDecision('pending')
    }
  }

  const label = lang === 'zh' ? label_zh || label_en || action_kind : label_en || label_zh || action_kind

  if (decision === 'approved' || decision === 'rejected') {
    return (
      <div
        style={{
          marginTop: 10,
          padding: 12,
          background: decision === 'approved' ? tokens.successLight : tokens.surfaceMuted,
          border: `1px solid ${decision === 'approved' ? tokens.success : tokens.borderSubtle}`,
          borderRadius: 10,
          fontSize: 12,
          color: decision === 'approved' ? '#15803D' : tokens.textTertiary,
        }}
      >
        {decision === 'approved'
          ? lang === 'zh' ? '✓ 已批准并执行' : '✓ Approved & executed'
          : lang === 'zh' ? '⊘ 已驳回' : '⊘ Rejected'}
      </div>
    )
  }

  return (
    <div
      style={{
        marginTop: 10,
        padding: 14,
        border: `1px dashed ${tokens.brand}`,
        borderRadius: 10,
        background: tokens.brandLight,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span
          style={{
            fontSize: 9,
            fontWeight: 700,
            padding: '2px 6px',
            borderRadius: 3,
            background: tokens.brand,
            color: '#fff',
            letterSpacing: 0.3,
            textTransform: 'uppercase',
          }}
        >
          {lang === 'zh' ? '待批准' : 'Pending'}
        </span>
        <span style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: tokens.textTertiary }}>
          {action_kind}
        </span>
      </div>
      <div style={{ fontSize: 13, color: tokens.textPrimary, lineHeight: 1.5, marginBottom: 8 }}>{label}</div>

      {preview && typeof preview === 'object' && (
        <pre
          style={{
            marginTop: 6,
            padding: 8,
            background: tokens.surface,
            border: `1px solid ${tokens.borderSubtle}`,
            borderRadius: 6,
            fontSize: 10,
            fontFamily: 'JetBrains Mono, monospace',
            color: tokens.textSecondary,
            overflowX: 'auto',
            maxHeight: 140,
          }}
        >
          {JSON.stringify(preview, null, 2)}
        </pre>
      )}

      {error && (
        <div style={{ marginTop: 6, fontSize: 11, color: tokens.danger }}>
          {lang === 'zh' ? '错误' : 'Error'}: {error}
        </div>
      )}

      <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
        <button
          onClick={() => decide('approve')}
          disabled={decision !== 'pending'}
          style={{
            padding: '6px 16px',
            fontSize: 12,
            fontWeight: 600,
            background: tokens.brand,
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            cursor: decision === 'pending' ? 'pointer' : 'wait',
            opacity: decision === 'pending' ? 1 : 0.6,
          }}
        >
          {decision === 'approving' ? '…' : lang === 'zh' ? '批准' : 'Approve'}
        </button>
        <button
          onClick={() => decide('reject')}
          disabled={decision !== 'pending'}
          style={{
            padding: '6px 16px',
            fontSize: 12,
            fontWeight: 500,
            background: 'transparent',
            color: tokens.textSecondary,
            border: `1px solid ${tokens.border}`,
            borderRadius: 6,
            cursor: decision === 'pending' ? 'pointer' : 'wait',
          }}
        >
          {decision === 'rejecting' ? '…' : lang === 'zh' ? '驳回' : 'Reject'}
        </button>
      </div>
    </div>
  )
}
