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

// Ordered workflow stages per role → bilingual label, used by
// WorkflowStatusPanel (resolved per lang) and the turn's stage hint.
export const WORKFLOW_STAGES: Record<AgentRole, { key: string; label: { zh: string; en: string } }[]> = {
  tenant: [
    { key: 'intake', label: { zh: '身份验证 · 身份章', en: 'Identity check · identity stamp' } },
    { key: 'preference_collection', label: { zh: '设定偏好 · 区域 / 预算 / 户型', en: 'Set preferences · area / budget / layout' } },
    { key: 'passport_readiness', label: { zh: 'Passport 就绪检查', en: 'Passport readiness check' } },
    { key: 'shortlist_and_apply', label: { zh: '筛选房源 + 提交意向', en: 'Shortlist homes + apply' } },
    { key: 'application_review', label: { zh: '申请 → 房东审核 → 看房', en: 'Application → landlord review → viewing' } },
    { key: 'sign_and_move_in', label: { zh: '电子签约 + 入住', en: 'E-sign + move in' } },
  ],
  landlord: [
    { key: 'intake', label: { zh: '接入房源 / 申请', en: 'Connect listings / applications' } },
    { key: 'review_inbox', label: { zh: '审阅申请收件箱', en: 'Review application inbox' } },
    { key: 'screening', label: { zh: '多维核查 + 排序', en: 'Multi-dimension screening + ranking' } },
    { key: 'decision', label: { zh: '一页式决策包 → 拍板', en: 'One-page decision pack → decide' } },
    { key: 'lease', label: { zh: '起草租约 + 签署', en: 'Draft lease + sign' } },
  ],
  agent: [
    { key: 'intake', label: { zh: '接入转介', en: 'Take referrals' } },
    { key: 'task_inbox', label: { zh: '任务收件箱', en: 'Task inbox' } },
    { key: 'fieldwork', label: { zh: '带看 / 拍照 / 留痕', en: 'Showings / photos / records' } },
    { key: 'settlement', label: { zh: '成交分成结算', en: 'Deal-split settlement' } },
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
  pending: PendingAction[],
  lang: 'zh' | 'en' = 'zh'
): string {
  const open = pending.find((p) => p.status === 'pending')
  if (open) return open.title
  const stages = WORKFLOW_STAGES[role]
  const idx = stageIndex(role, workflow.current_stage)
  const cur = stages[idx]
  if (!cur) return lang === 'zh' ? '准备就绪' : 'Ready'
  return lang === 'zh' ? `下一步 · ${cur.label.zh}` : `Next · ${cur.label.en}`
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
        { id: 'passport', title: { zh: '盖上收入章解锁更多房源', en: 'Earn your income stamp to unlock more homes' }, description: { zh: '上传一张工资单或连接 Plaid,约 5 分钟。', en: 'Upload a pay stub or connect Plaid — about 5 minutes.' }, href: '/tenant/passport', badge: 'NUDGE' },
        { id: 'browse', title: { zh: '看 AI 今天筛的房源', en: "See today's AI-screened listings" }, description: { zh: '已按预算、区域、盖章门槛过滤。', en: 'Filtered by budget, area and stamp requirements.' }, href: '/listings', badge: 'SHORTLIST' },
        { id: 'apps', title: { zh: '查看申请进度', en: 'Track application progress' }, description: { zh: '跟踪每份意向与房东回应。', en: 'Follow each application and landlord response.' }, href: '/tenant/applications', badge: 'STATUS' },
      ]
    case 'landlord':
      return [
        { id: 'applicants', title: { zh: '审阅 7 份意向', en: 'Review 7 applications' }, description: { zh: 'AI 已按你的政策排序与解释。', en: 'AI has ranked and explained them by your policies.' }, href: '/landlord/applicants', badge: 'INBOX' },
        { id: 'screening', title: { zh: '多维核查报告', en: 'Multi-dimension screening report' }, description: { zh: '身份 / 收入 / 历史 / 行为,逐项可解释。', en: 'Identity / income / history / behaviour — each explainable.' }, href: '/screening', badge: 'SCREENING' },
        { id: 'finance', title: { zh: '收租与财务', en: 'Rent collection & finance' }, description: { zh: '平台不抽租金流水,手续费透明。', en: 'No cut of your rent flow — transparent fees.' }, href: '/landlord/finance', badge: 'FINANCE' },
      ]
    case 'agent':
      return [
        { id: 'tasks', title: { zh: '今日任务', en: "Today's tasks" }, description: { zh: '带看 / 拍照 / Listing prep,授权范围已标注。', en: 'Showings / photos / listing prep, authorization scope marked.' }, href: '/agent/tasks', badge: 'TASKS' },
        { id: 'clients', title: { zh: '客户与回复', en: 'Clients & replies' }, description: { zh: '2 位客户在等你回复。', en: '2 clients are waiting on your reply.' }, href: '/agent/clients', badge: 'CLIENTS' },
        { id: 'earnings', title: { zh: '本周收益', en: "This week's earnings" }, description: { zh: '成交后 25% 分成,Stripe 自动结算。', en: '25% split on close, auto-settled via Stripe.' }, href: '/agent/earnings', badge: 'EARNINGS' },
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
  listingsNotice?: string
  market?: MarketInsight
  followups?: FollowUp[]
  draftListing?: DraftListing
  urlImages?: string[]
}

export async function runAgentTurn(args: {
  // client/userId are absent on the anonymous path — there is nothing to
  // persist to and no RLS scope to persist under.
  client?: SupabaseClient
  userId?: string
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
  // Anonymous preview turn: call the route WITHOUT Authorization (the server
  // runs real reasoning under its own strict per-IP limit) and skip every
  // persistence step — no memory upsert, no pending action, no audit event.
  anonymous?: boolean
  // UI language for the few client-authored strings in the turn result.
  lang?: 'zh' | 'en'
}): Promise<AgentTurn> {
  const { client, userId, role, agentName, message, memories, workflow, stageLabel, attachments, exclude, history, live } = args
  const lang = args.lang === 'en' ? 'en' : 'zh'
  const anonymous = !!args.anonymous || !args.client || !args.userId
  const name = agentName || ROLE_META[role].name

  // Images → base64 blocks the route forwards to Claude Vision; all filenames
  // are passed as context so the agent knows what was attached.
  const images = (attachments ?? [])
    .filter((a) => a.isImage && a.dataUrl.includes(';base64,'))
    .map((a) => ({ media_type: a.mediaType, data: a.dataUrl.split(';base64,')[1] }))
  const attachmentNames = (attachments ?? []).map((a) => a.name)

  // Authed turns attach the caller's session token (per-user cost gate).
  // Anonymous preview turns send NO Authorization — the route runs them under
  // its own strict per-IP anonymous limit with zero persistence.
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (!anonymous) {
    const { data: sessionData } = await client!.auth.getSession()
    const accessToken = sessionData?.session?.access_token
    if (!accessToken) throw new Error('turn failed: no session')
    headers.Authorization = `Bearer ${accessToken}`
  }

  // Hard client-side ceiling: the route heartbeats whitespace while it works,
  // so a stalled turn would otherwise hang this await indefinitely. 100s
  // aborts fetch AND body read; the error message matches the existing
  // /timeout/ classifier in useAgentSession's fallback copy.
  let res: Response
  let rawBody: string
  try {
    res = await fetch('/api/agent/turn', {
      method: 'POST',
      headers,
      body: JSON.stringify({ role, agentName: name, message, memories, workflow, stageLabel, images, attachment_names: attachmentNames, exclude: exclude ?? [], history: history ?? [], lang }),
      signal: AbortSignal.timeout(100_000),
    })
    if (!res.ok) throw new Error(`turn failed: ${res.status}`)
    // The route streams heartbeat whitespace then the JSON body; errors that
    // occur mid-stream arrive as { error } inside a 200 body.
    rawBody = await res.text()
  } catch (e) {
    const name_ = (e as Error)?.name
    if (name_ === 'TimeoutError' || name_ === 'AbortError') throw new Error('turn failed: timeout')
    throw e
  }
  const turn = JSON.parse(rawBody) as {
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
    listings_notice?: string
    market?: MarketInsight
    followups?: FollowUp[]
    draft_listing?: DraftListing
    url_images?: string[]
    guardrail?: { flagged: boolean; notes: string[] }
  }

  if (turn.error) throw new Error(turn.error)

  const memoryWrites = anonymous ? [] : (turn.memory_writes ?? [])

  // §05 — persist implicit memory (RLS-scoped). Best-effort. Never for
  // anonymous turns (no user, and the server already strips the writes).
  if (live && !anonymous && memoryWrites.length && client && userId) {
    await upsertMemories(client, userId, role, memoryWrites)
  }

  // Build the pending action. The model only proposes; this is an approval card.
  // Anonymous turns never carry one (server forces proposed_action=null; the
  // guard here is belt-and-suspenders — there is no userId to attribute it to).
  let proposedAction: PendingAction | null = null
  let replyBody = turn.reply
  if (turn.proposed_action && !anonymous && userId) {
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
    let insertFailed = false
    if (live && client) {
      const { data, error } = await client
        .from('agent_pending_actions')
        .insert(base)
        .select('id,created_at')
        .single()
      if (!error && data) {
        id = data.id as string
        created_at = (data.created_at as string) ?? created_at
      } else if (error) {
        // A card that never persisted can't be approved — returning it would
        // render a phantom approval card. Drop it and tell the user instead.
        insertFailed = true
        console.warn('[agent] pending insert failed', error.message)
      }
    }
    if (insertFailed) {
      replyBody += lang === 'zh'
        ? '\n\n（提议动作保存失败，请重试）'
        : '\n\n(The proposed action failed to save — please try again)'
    } else {
      proposedAction = { ...base, id, created_at }
    }
  }

  // Audit the turn (best-effort, RLS-scoped). Anonymous turns leave no trail
  // by contract — there is no actor to attribute the event to.
  if (!anonymous && client && userId) {
    await writeAuditEvent(client, {
      actorId: userId,
      actorType: 'user',
      action: `${role}_agent_turn`,
      targetType: 'agent_message',
      metadata: {
        message: message.slice(0, 500),
        // Reply snippet feeds the nightly reflection pass (lib/agent/reflection.ts)
        // — without it the user-model synthesis only sees one side of the dialogue.
        reply: (replyBody || '').slice(0, 400),
        proposed: proposedAction?.action_type ?? null,
        // The guardrail is the compliance backstop we tell landlords exists;
        // its verdict was computed on every turn and then thrown away, so an
        // OHRC block or a stripped "already sent" claim left no trace in the
        // audit log the /audit pages render.
        guardrail_flagged: turn.guardrail?.flagged ?? false,
        guardrail_notes: (turn.guardrail?.notes ?? []).slice(0, 12),
      },
    })
  }

  return {
    result: { title: lang === 'zh' ? `${name} 回复` : `${name} replied`, body: replyBody },
    memoryWrites,
    proposedAction,
    nextStage: turn.next_stage,
    listings: turn.listings,
    listingsSource: turn.listings_source,
    listingsNotice: turn.listings_notice,
    market: turn.market,
    followups: turn.followups,
    draftListing: turn.draft_listing,
    urlImages: turn.url_images,
  }
}
