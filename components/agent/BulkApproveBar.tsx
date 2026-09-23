'use client'

// Portfolio bulk proposals (P2 2026-09-23): when several cards of the same
// deterministic kind are waiting, approve them in one go. Only kinds whose
// body the landlord has already seen in the card summary are eligible —
// renewal letters (with an explicit A/B for all) and acknowledge-only
// checkpoints. Free-text emails are never bulk-approved.
import { useState } from 'react'
import type { PendingAction } from '@/lib/agent/types'

export const BULK_KINDS = {
  renewal: ['send_renewal_letter'],
  acknowledge: ['renewal_checkpoint', 'relist_prompt'],
} as const

export function bulkGroups(actions: PendingAction[]): { renewal: PendingAction[]; acknowledge: PendingAction[] } {
  return {
    renewal: actions.filter((a) => a.status === 'pending' && (BULK_KINDS.renewal as readonly string[]).includes(a.action_type)),
    acknowledge: actions.filter((a) => a.status === 'pending' && (BULK_KINDS.acknowledge as readonly string[]).includes(a.action_type)),
  }
}

export default function BulkApproveBar({ actions, onDecide, zh }: {
  actions: PendingAction[]
  onDecide: (id: string, decision: 'approved' | 'rejected', option?: 'A' | 'B') => void | Promise<void>
  zh: boolean
}) {
  const [busy, setBusy] = useState<string | null>(null)
  const g = bulkGroups(actions)
  if (g.renewal.length < 2 && g.acknowledge.length < 2) return null
  const run = async (key: string, list: PendingAction[], option?: 'A' | 'B') => {
    setBusy(key)
    try {
      // Each decide waits out its own 60-second undo window; run them together.
      await Promise.all(list.map((a) => onDecide(a.id, 'approved', option)))
    } finally { setBusy(null) }
  }
  return (
    <div className="mb-4 rounded-2xl border border-brand/30 bg-brand/[0.04] p-4" data-testid="bulk-approve">
      <div className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-brand">{zh ? '批量处理 · 同类卡片' : 'BULK · CARDS OF ONE KIND'}</div>
      <div className="mt-2 space-y-2 text-[13px]">
        {g.renewal.length >= 2 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-body-2">{zh ? `${g.renewal.length} 封续约函等你批准（每封都带 60 秒撤销）：` : `${g.renewal.length} renewal letters waiting (each with a 60-second undo):`}</span>
            <button type="button" disabled={!!busy} onClick={() => void run('A', g.renewal, 'A')} className="rounded-full bg-brand px-3 py-1 text-[12px] font-bold text-white disabled:opacity-50">{zh ? '全部方案 A · 不涨' : 'All option A · no increase'}</button>
            <button type="button" disabled={!!busy} onClick={() => void run('B', g.renewal, 'B')} className="rounded-full border border-brand px-3 py-1 text-[12px] font-bold text-brand disabled:opacity-50">{zh ? '全部方案 B · 指导上限' : 'All option B · guideline'}</button>
          </div>
        )}
        {g.acknowledge.length >= 2 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-body-2">{zh ? `${g.acknowledge.length} 张只需知悉的提示卡：` : `${g.acknowledge.length} acknowledge-only cards:`}</span>
            <button type="button" disabled={!!busy} onClick={() => void run('ack', g.acknowledge)} className="rounded-full border border-line-strong bg-white px-3 py-1 text-[12px] font-bold text-body disabled:opacity-50">{zh ? '全部知悉' : 'Acknowledge all'}</button>
          </div>
        )}
        <p className="text-[11.5px] text-body-3">{zh ? '邮件类卡片（看房回复、决定通知、租客消息）不提供批量，请逐张预览。' : 'Email cards (showing replies, decision notices, tenant messages) are never bulk-approved — preview each one.'}</p>
      </div>
    </div>
  )
}
