// Agent spine — orchestration helpers: role metadata, workflow stage
// labels, status derivation, and a rule-based message handler (MVP).
// Real model calls slot in here later without changing the page.
import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  AgentRole,
  AgentStatus,
  ChatAttachment,
  DraftListing,
  ListingCard,
  MemoryItem,
  PendingAction,
  Recommendation,
  WorkflowState,
  MarketInsight,
  FollowUp,
} from './types'
import { writeAuditEvent } from './audit'
import { upsertMemories } from './memory'
import { ROLE_THEME } from '../roleTheme'

export const ROLE_META: Record<
  AgentRole,
  { name: string; accent: string; tagline: string; workflowType: string }
> = {
  tenant: {
    name: 'AI Agent',
    accent: ROLE_THEME.tenant.accent,
    tagline: '开口找房、约看、一键申请 —— 资料只在你点头时分享。',
    workflowType: 'tenant_rental',
  },
  landlord: {
    name: 'AI Agent',
    accent: ROLE_THEME.landlord.accent,
    tagline: '读懂每份申请、同步尽调、守住合规 —— 你只点头。',
    workflowType: 'landlord_screening',
  },
  agent: {
    name: 'AI Agent',
    accent: ROLE_THEME.agent.accent,
    tagline: '把行政杂活理顺,把时间留给带看与关系。',
    workflowType: 'agent_fieldwork',
  },
}

// Ordered workflow stages per role → label, used by WorkflowStatusPanel.
export const WORKFLOW_STAGES: Record<AgentRole, { key: string; label: string }[]> = {
  tenant: [
    { key: 'intake', label: '身份验证 · 身份章' },
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
        { id: 'passport', title: '盖上收入章解锁更多房源', description: '上传一张工资单或连接 Plaid,约 5 分钟。', href: '/tenant/passport', badge: 'NUDGE' },
        { id: 'browse', title: '看 AI 今天筛的房源', description: '已按预算、区域、盖章门槛过滤。', href: '/listings', badge: 'SHORTLIST' },
        { id: 'apps', title: '查看申请进度', description: '跟踪每份意向与房东回应。', href: '/tenant/applications', badge: 'STATUS' },
      ]
    case 'landlord':
      return [
        { id: 'applicants', title: '审阅 7 份意向', description: 'AI 已按你的政策排序与解释。', href: '/landlord/applicants', badge: 'INBOX' },
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

// The Personal Agent turn (architecture §03/§04 + L3/L4). Calls the server
// reasoning route (/api/agent/turn — Claude + Compliance Guardrail), then
// persists what it learned through the caller's RLS-scoped client: implicit
// memory writes, a proposed approval card, and an audit event. The agent
// PROPOSES — the returned pending action still requires the user to approve it.
export type AgentTurn = {
  result: { title: string; body: string }
  memoryWrites: MemoryItem[]
  proposedAction: PendingAction | null
  nextStage: string | null
  listings?: ListingCard[]
  listingsSource?: 'stayloop' | 'realtor'
  market?: MarketInsight
  followups?: FollowUp[]
  draftListing?: DraftListing
  urlImages?: string[]
}

export async function runAgentTurn(args: {
  client: SupabaseClient
  userId: string
  role: AgentRole
  agentName: string
  message: string
  memories: MemoryItem[]
  workflow: WorkflowState
  stageLabel?: string
  attachments?: ChatAttachment[]
  exclude?: string[]
  history?: { role: 'user' | 'agent'; text: string }[]
  live: boolean
}): Promise<AgentTurn> {
  const { client, userId, role, agentName, message, memories, workflow, stageLabel, attachments, exclude, history, live } = args
  const name = agentName || ROLE_META[role].name

  // Images → base64 blocks the route forwards to Claude Vision; all filenames
  // are passed as context so the agent knows what was attached.
  const images = (attachments ?? [])
    .filter((a) => a.isImage && a.dataUrl.includes(';base64,'))
    .map((a) => ({ media_type: a.mediaType, data: a.dataUrl.split(';base64,')[1] }))
  const attachmentNames = (attachments ?? []).map((a) => a.name)

  // The route requires a Supabase bearer token (cost gate) — attach the
  // caller's session token. Demo/anonymous sessions never reach this code
  // path (useAgentSession returns canned replies when live=false).
  const { data: sessionData } = await client.auth.getSession()
  const accessToken = sessionData?.session?.access_token
  if (!accessToken) throw new Error('turn failed: no session')

  const res = await fetch('/api/agent/turn', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ role, agentName: name, message, memories, workflow, stageLabel, images, attachment_names: attachmentNames, exclude: exclude ?? [], history: history ?? [] }),
  })
  if (!res.ok) throw new Error(`turn failed: ${res.status}`)
  // The route streams heartbeat whitespace then the JSON body; errors that
  // occur mid-stream arrive as { error } inside a 200 body.
  const turn = (await res.json()) as {
    error?: string
    reply: string
    memory_writes: MemoryItem[]
    proposed_action: null | {
      action_type: string
      title: string
      summary: string
      recipient_label?: string | null
      data_scope: string[]
      excluded_data: string[]
      risk_level: 'low' | 'medium' | 'high'
    }
    next_stage: string | null
    listings?: ListingCard[]
    listings_source?: 'stayloop' | 'realtor'
    market?: MarketInsight
    followups?: FollowUp[]
    draft_listing?: DraftListing
    url_images?: string[]
  }

  if (turn.error) throw new Error(turn.error)

  const memoryWrites = turn.memory_writes ?? []

  // §05 — persist implicit memory (RLS-scoped). Best-effort.
  if (live && memoryWrites.length) {
    await upsertMemories(client, userId, role, memoryWrites)
  }

  // Build the pending action. The model only proposes; this is an approval card.
  let proposedAction: PendingAction | null = null
  if (turn.proposed_action) {
    const pa = turn.proposed_action
    const base = {
      user_id: userId,
      workflow_id: workflow.workflow_id ?? null,
      role,
      action_type: pa.action_type,
      title: pa.title,
      summary: pa.summary,
      recipient_label: pa.recipient_label ?? null,
      data_scope: pa.data_scope ?? [],
      excluded_data: pa.excluded_data ?? [],
      risk_level: pa.risk_level,
      status: 'pending' as const,
      requires_approval: true,
      expires_at: null,
      metadata: { origin: 'agent_turn' },
    }
    let id = (globalThis.crypto?.randomUUID?.() as string) || `act-${Date.now()}`
    let created_at = new Date().toISOString()
    if (live) {
      const { data, error } = await client
        .from('agent_pending_actions')
        .insert(base)
        .select('id,created_at')
        .single()
      if (!error && data) {
        id = data.id as string
        created_at = (data.created_at as string) ?? created_at
      } else if (error) {
        console.warn('[agent] pending insert failed', error.message)
      }
    }
    proposedAction = { ...base, id, created_at }
  }

  // Audit the turn (best-effort, RLS-scoped).
  await writeAuditEvent(client, {
    actorId: userId,
    actorType: 'user',
    action: `${role}_agent_turn`,
    targetType: 'agent_message',
    metadata: { message: message.slice(0, 500), proposed: proposedAction?.action_type ?? null },
  })

  return {
    result: { title: `${name} 回复`, body: turn.reply },
    memoryWrites,
    proposedAction,
    nextStage: turn.next_stage,
    listings: turn.listings,
    listingsSource: turn.listings_source,
    market: turn.market,
    followups: turn.followups,
    draftListing: turn.draft_listing,
    urlImages: turn.url_images,
  }
}
