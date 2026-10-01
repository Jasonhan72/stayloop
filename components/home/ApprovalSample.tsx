'use client'

// The "It proposes, you decide" panel's picture (homepage, 2026-10-01): the product's own approval card,
// not a drawing of one (rule: demos of the product use its real components). Same card as the film's
// showing request — Mia Chen asking Sarah for a viewing of King St W #1207 — marked 「示例」 and inert,
// so nothing on it can be clicked or sent.
import ApprovalActionCard from '@/components/agent/ApprovalActionCard'
import type { PendingAction } from '@/lib/agent/types'

const ADDR = 'King St W #1207'

function sampleCard(zh: boolean): PendingAction {
  return {
    id: 'home-sample-showing',
    user_id: 'home-sample',
    workflow_id: null,
    role: 'landlord',
    action_type: 'showing_request',
    title: zh ? `看房请求：Mia Chen · ${ADDR}` : `Showing request: Mia Chen · ${ADDR}`,
    summary: zh
      ? 'Mia Chen 想看房，期望入住 11 月 1 日：周六上午方便的话想来看看。批准 = 同意安排看房：我会邮件告诉对方，你们在「消息」里的这段对话约时间（双方都看不到对方的私人邮箱）；拒绝则不回复。'
      : 'Mia Chen would like a showing, move-in November 1: Saturday morning if that works. Approve = agree to a showing: I email her and you pick a time in this conversation under Messages (neither side sees the other’s personal email); reject = no reply.',
    recipient_label: 'Mia Chen',
    data_scope: zh ? ['房源地址', '这段对话的链接'] : ['The listing address', 'A link to this conversation'],
    excluded_data: zh ? ['你的私人邮箱', '筛查报告', '其他申请人信息'] : ['Your personal email', 'Screening reports', 'Other applicants’ information'],
    risk_level: 'low',
    status: 'pending',
    requires_approval: true,
    created_at: '2026-10-01T15:00:00.000Z',
    expires_at: null,
    metadata: {},
  }
}

export default function ApprovalSample({ zh }: { zh: boolean }) {
  return (
    <div className="relative" data-testid="home-approval-sample">
      <span className="absolute -top-3 right-5 z-[1] rounded-full bg-white px-2.5 py-1 text-[12px] font-semibold text-body-3 shadow-[0_4px_12px_-6px_rgba(27,27,60,0.35)]">
        {zh ? '示例' : 'Sample'}
      </span>
      {/* inert: the card is a picture here — no preview, approve or reject */}
      <div inert aria-hidden className="pointer-events-none select-none">
        <ApprovalActionCard action={sampleCard(zh)} onDecide={() => {}} />
      </div>
    </div>
  )
}
