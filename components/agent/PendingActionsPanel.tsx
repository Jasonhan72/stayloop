'use client'

import type { PendingAction } from '@/lib/agent/types'
import ApprovalActionCard from './ApprovalActionCard'

export default function PendingActionsPanel({
  actions,
  onDecide,
}: {
  actions: PendingAction[]
  onDecide: (id: string, decision: 'approved' | 'rejected') => void | Promise<void>
}) {
  if (!actions?.length) return null
  return (
    <div className="space-y-4">
      {actions.map((a) => (
        <ApprovalActionCard key={a.id} action={a} onDecide={onDecide} />
      ))}
    </div>
  )
}
