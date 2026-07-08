'use client'

// The control point. Shows exactly what would be shared (data_scope) and what
// would NOT (excluded_data), the recipient, and risk — then approve / reject.
// Nothing executes until the user clicks Approve.
import { useState } from 'react'
import { useT } from '@/lib/i18n'
import type { PendingAction } from '@/lib/agent/types'

const RISK: Record<PendingAction['risk_level'], { label: { zh: string; en: string }; cls: string }> = {
  low: { label: { zh: '低风险', en: 'LOW RISK' }, cls: 'text-success bg-success/10' },
  medium: { label: { zh: '中风险', en: 'MEDIUM RISK' }, cls: 'text-warning bg-warning/10' },
  high: { label: { zh: '高风险', en: 'HIGH RISK' }, cls: 'text-danger bg-danger/10' },
}

export default function ApprovalActionCard({
  action,
  onDecide,
}: {
  action: PendingAction
  onDecide: (id: string, decision: 'approved' | 'rejected', option?: 'A' | 'B') => void | Promise<void>
}) {
  const { lang } = useT()
  const zh = lang === 'zh'
  const [busy, setBusy] = useState<null | string>(null)
  const risk = RISK[action.risk_level]

  // Renewal letters carry a rent choice — the landlord must pick explicitly
  // (no silent default to a rent increase). Other actions have one approve.
  const isRenewal = action.action_type === 'send_renewal_letter'
  const m = (action.metadata || {}) as { current_rent?: number; guideline_rent?: number; guideline_pct?: number }

  const decide = async (d: 'approved' | 'rejected', option?: 'A' | 'B') => {
    setBusy(option ? `approved:${option}` : d)
    try {
      await onDecide(action.id, d, option)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="rounded-2xl border border-brand bg-white p-6 shadow-[0_0_0_1px_rgba(4,120,87,0.22),0_6px_18px_rgba(4,120,87,0.06)]">
      <div className="flex items-center justify-between gap-3">
        <div className="font-mono text-[10px] font-bold uppercase tracking-eyebrowLg text-brand">
          {zh ? 'PENDING APPROVAL · 等你确认' : 'PENDING APPROVAL · AWAITING YOU'}
        </div>
        <span className={'rounded-md px-2 py-[3px] font-mono text-[10px] font-bold ' + risk.cls}>
          {risk.label[lang]}
        </span>
      </div>

      <h3 className="mt-2 text-[18px] font-bold tracking-tight">{action.title}</h3>
      {action.summary && (
        <p className="mt-2 text-[13.5px] leading-relaxed text-body-2">{action.summary}</p>
      )}

      {action.recipient_label && (
        <div className="mt-4 flex items-baseline gap-2 text-[12.5px]">
          <span className="font-mono text-[10px] font-bold uppercase tracking-eyebrow text-body-3">
            {zh ? '接收方' : 'RECIPIENT'}
          </span>
          <span className="font-semibold text-body">{action.recipient_label}</span>
        </div>
      )}

      <div className="mt-4 grid gap-3">
        <ScopeList tone="share" title={zh ? '将分享' : 'WILL SHARE'} items={action.data_scope} />
        <ScopeList tone="hold" title={zh ? '不会分享' : 'WILL NOT SHARE'} items={action.excluded_data} />
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {isRenewal ? (
          <>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => decide('approved', 'A')}
              className="rounded-lg border border-brand bg-white px-4 py-[9px] text-[13.5px] font-semibold text-brand transition hover:bg-brand/5 disabled:opacity-60"
            >
              {busy === 'approved:A'
                ? (zh ? '发送中…' : 'Sending…')
                : zh
                  ? `✓ 不涨续约${m.current_rent ? ` · $${m.current_rent.toLocaleString()}` : ''}`
                  : `✓ Renew, no increase${m.current_rent ? ` · $${m.current_rent.toLocaleString()}` : ''}`}
            </button>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => decide('approved', 'B')}
              className="sl-btn-primary !px-4 !py-[10px] !text-[13.5px] disabled:opacity-60"
            >
              {busy === 'approved:B'
                ? (zh ? '发送中…' : 'Sending…')
                : zh
                  ? `✓ +${m.guideline_pct ?? 2.5}% 续约${m.guideline_rent ? ` · $${m.guideline_rent.toLocaleString()}` : ''}`
                  : `✓ +${m.guideline_pct ?? 2.5}% renewal${m.guideline_rent ? ` · $${m.guideline_rent.toLocaleString()}` : ''}`}
            </button>
          </>
        ) : (
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => decide('approved')}
            className="sl-btn-primary !px-4 !py-[10px] !text-[13.5px] disabled:opacity-60"
          >
            {busy === 'approved' ? (zh ? '提交中…' : 'Submitting…') : zh ? '✓ 确认 · 替我执行' : '✓ Approve · Execute for me'}
          </button>
        )}
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => decide('rejected')}
          className="rounded-lg border border-line-strong bg-white px-4 py-[9px] text-[13.5px] font-semibold text-body transition hover:border-danger hover:text-danger disabled:opacity-60"
        >
          {busy === 'rejected' ? (zh ? '处理中…' : 'Working…') : zh ? '拒绝' : 'Reject'}
        </button>
      </div>
      <p className="mt-3 font-mono text-[10.5px] text-body-3">
        {zh ? '批准与拒绝都会写入审计 · 你随时可追溯' : 'Approve & reject are both written to the audit log · always traceable'}
      </p>
    </div>
  )
}

function ScopeList({
  tone,
  title,
  items,
}: {
  tone: 'share' | 'hold'
  title: string
  items: string[]
}) {
  if (!items?.length) return null
  const share = tone === 'share'
  return (
    <div className="rounded-xl border border-line-divider bg-surface-chip p-3">
      <div
        className={
          'font-mono text-[10px] font-bold uppercase tracking-eyebrow ' +
          (share ? 'text-brand' : 'text-body-3')
        }
      >
        {title}
      </div>
      <ul className="mt-2 space-y-1">
        {items.map((it) => (
          <li key={it} className="flex items-start gap-1.5 text-[12px] leading-snug text-body-2">
            <span className={share ? 'text-brand' : 'text-body-4'}>{share ? '✓' : '✕'}</span>
            <span>{it}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
