// Agent spine — orchestration helpers: role metadata, workflow stage
// labels, status derivation, and a rule-based message handler (MVP).
// Real model calls slot in here later without changing the page.
import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  AgentRole,
  AgentStatus,
  PendingAction,
  Recommendation,
  WorkflowState,
} from './types'
import { writeAuditEvent } from './audit'

export const ROLE_META: Record<
  AgentRole,
  { name: string; accent: string; tagline: string; workflowType: string }
> = {
  tenant: {
    name: 'Luna',
    accent: '#7C3AED',
    tagline: '开口找房、约看、一键申请 —— 资料只在你点头时分享。',
    workflowType: 'tenant_rental',
  },
  landlord: {
    name: 'Logic',
    accent: '#047857',
    tagline: '读懂每份申请、同步尽调、守住合规 —— 你只点头。',
    workflowType: 'landlord_screening',
  },
  agent: {
    name: 'Brief',
    accent: '#2563EB',
    tagline: '把行政杂活理顺,把时间留给带看与关系。',
    workflowType: 'agent_fieldwork',
  },
}

// Ordered workflow stages per role → label, used by WorkflowStatusPanel.
export const WORKFLOW_STAGES: Record<AgentRole, { key: string; label: string }[]> = {
  tenant: [
    { key: 'intake', label: '身份验证 · Tier 1' },
    { key: 'preference_collection', label: '设定偏好 · 区域 / 预算 / 户型' },
    { key: 'passport_readiness', label: 'Passport 就绪检查' },
    { key: 'shortlist_and_apply', label: '筛选房源 + 提交意向' },
    { key: 'application_review', label: '申请 → 房东审核 → 看房' },
    { key: 'sign_and_move_in', label: '电子签约 + 入住' },
  ],
  landlord: [
    { key: 'intake', label: '接入房源 / 申请' },
    { key: 'review_inbox', label: '审阅申请收件箱' },
    { key: 'screening', label: '多维核查 + 排序' },
    { key: 'decision', label: '一页式决策包 → 拍板' },
    { key: 'lease', label: '起草租约 + 签署' },
  ],
  agent: [
    { key: 'intake', label: '接入转介' },
    { key: 'task_inbox', label: '任务收件箱' },
    { key: 'fieldwork', label: '带看 / 拍照 / 留痕' },
    { key: 'settlement', label: '成交分成结算' },
  ],
}

export function stageIndex(role: AgentRole, stage: string): number {
  const i = WORKFLOW_STAGES[role].findIndex((s) => s.key === stage)
  return i < 0 ? 0 : i
}

// Status is derived: an open approval dominates; otherwise Result if there's
// recent output; otherwise Idle. Understanding/Working are transient (set by
// the input bar while a message is in flight).
export function deriveStatus(pending: PendingAction[]): AgentStatus {
  if (pending.some((p) => p.status === 'pending')) return 'approval'
  return 'result'
}

export function nextBestAction(
  role: AgentRole,
  workflow: WorkflowState,
  pending: PendingAction[]
): string {
  const open = pending.find((p) => p.status === 'pending')
  if (open) return open.title
  const stages = WORKFLOW_STAGES[role]
  const idx = stageIndex(role, workflow.current_stage)
  const cur = stages[idx]
  return cur ? `下一步 · ${cur.label}` : '准备就绪'
}

// MVP rule-based recommendations. For tenants we surface the next concrete
// move; later this reads from listings/applications.
export function buildRecommendations(
  role: AgentRole,
  _workflow: WorkflowState
): Recommendation[] {
  switch (role) {
    case 'tenant':
      return [
        { id: 'passport', title: '升级到 Tier 2 解锁更多房源', description: '上传一张工资单或连接 Plaid,约 5 分钟。', href: '/tenant/passport', badge: 'NUDGE' },
        { id: 'browse', title: '看 Luna 今天筛的房源', description: '已按预算、区域、Tier 匹配过滤。', href: '/listings', badge: 'SHORTLIST' },
        { id: 'apps', title: '查看申请进度', description: '跟踪每份意向与房东回应。', href: '/tenant/applications', badge: 'STATUS' },
      ]
    case 'landlord':
      return [
        { id: 'applicants', title: '审阅 7 份意向', description: 'Logic 已按你的政策排序与解释。', href: '/landlord/applicants', badge: 'INBOX' },
        { id: 'screening', title: '多维核查报告', description: '身份 / 收入 / 历史 / 行为,逐项可解释。', href: '/landlord/maintenance', badge: 'SCREENING' },
        { id: 'finance', title: '收租与财务', description: '平台不抽租金流水,手续费透明。', href: '/landlord/finance', badge: 'FINANCE' },
      ]
    case 'agent':
      return [
        { id: 'tasks', title: '今日任务', description: '带看 / 拍照 / Listing prep,授权范围已标注。', href: '/agent/tasks', badge: 'TASKS' },
        { id: 'clients', title: '客户与回复', description: '2 位客户在等你回复。', href: '/agent/clients', badge: 'CLIENTS' },
        { id: 'earnings', title: '本周收益', description: '成交后 25% 分成,Stripe 自动结算。', href: '/agent/earnings', badge: 'EARNINGS' },
      ]
    default:
      return []
  }
}

// MVP message handler: log the request as an audit event and return a
// rule-based acknowledgement. Does NOT execute key actions — anything
// side-effectful would be returned as a pending action for approval.
export async function handleMessage(
  client: SupabaseClient,
  userId: string,
  role: AgentRole,
  message: string
): Promise<{ title: string; body: string }> {
  await writeAuditEvent(client, {
    actorId: userId,
    actorType: 'user',
    action: `${role}_agent_message_submitted`,
    targetType: 'agent_message',
    metadata: { message: message.slice(0, 500) },
  })

  const name = ROLE_META[role].name
  return {
    title: `${name} 收到了`,
    body:
      `我记下了:“${message.trim()}”。我会据此更新筛选与下一步建议;` +
      `任何需要对外分享或提交的动作,都会先作为待批准卡片让你确认 —— 绝不自动执行。`,
  }
}
