// "想法" — what the assistant can do for you right now (2026-09-22, Muse
// benchmark item D). Pure and deterministic: no model call. Every idea
// carries a one-line *why* that names its evidence — a memory, the workflow
// stage, a pending card, the reflection profile — so the list never reads
// as generic marketing tips.
//
// Sources, in priority order:
//   1. Things waiting on the user (pending approvals) — always first.
//   2. The reflection profile (user_memories key `user_model`): current_focus
//      and goals become "shall I …" prompts.
//   3. The workflow stage: the next step of the role's pipeline.
//   4. Concrete memories (budget / area / move date …) → a check the
//      assistant can run against real data (TRREB, listings, renewals).
//   5. Existing recommendations (RecommendationDeck) as page links.
import type { AgentRole, BiText, MemoryItem, PendingAction, Recommendation, WorkflowState } from './types'
import { WORKFLOW_STAGES, stageIndex } from './orchestrator'
import { formatMemoryValue } from './memory'

export type Idea = {
  id: string
  text: string
  why: string
  /** Sent into the conversation when tapped (deep link ?prompt=). */
  prompt?: string
  /** Or opened as a page. */
  href?: string
  kind: 'pending' | 'profile' | 'stage' | 'memory' | 'reco'
}

type Lang = 'zh' | 'en'
const t = (lang: Lang, zh: string, en: string) => (lang === 'zh' ? zh : en)
const bi = (v: BiText, lang: Lang) => (typeof v === 'string' ? v : v[lang])

type UserModel = { goals?: string[]; current_focus?: string; constraints?: string[] }

function readUserModel(memories: MemoryItem[]): UserModel | null {
  const row = memories.find((m) => m.key === 'user_model' && m.memory_type === 'system')
  if (!row) return null
  const v = row.value
  if (v && typeof v === 'object') return v as UserModel
  if (typeof v === 'string') {
    try { return JSON.parse(v) as UserModel } catch { return null }
  }
  return null
}

function findMemory(memories: MemoryItem[], re: RegExp): MemoryItem | undefined {
  return memories.find((m) => m.memory_type !== 'system' && (re.test(m.key) || re.test(m.label)))
}

// Keys are the real WORKFLOW_STAGES keys (lib/agent/orchestrator.ts).
const NEXT_STEP_PROMPT: Record<AgentRole, Record<string, { zh: string; en: string }>> = {
  tenant: {
    intake: { zh: '我想找房，先告诉你我的预算、区域和硬条件。', en: 'I want to find a place — let me give you my budget, area and must-haves.' },
    preference_collection: { zh: '按我说过的条件先找 6 套给我看看。', en: 'Find six places matching what I told you.' },
    passport_readiness: { zh: '申请需要准备哪些材料？帮我列清单。', en: 'What documents does an application need? Make me a checklist.' },
    shortlist_and_apply: { zh: '把候选房源做个对比表，告诉我该先看哪套、怎么申请。', en: 'Compare my shortlist and tell me which to see first and how to apply.' },
    application_review: { zh: '房东审核中我该准备什么？看房时能问什么？', en: 'What should I prepare while the landlord reviews, and what can I ask at the viewing?' },
    sign_and_move_in: { zh: '帮我逐条解释安省标准租约里要注意的地方，以及入住前要做什么。', en: 'Walk me through the Ontario standard lease and what to do before move-in.' },
  },
  landlord: {
    intake: { zh: '帮我把房源信息补齐后发布。', en: 'Help me complete the listing and publish it.' },
    review_inbox: { zh: '新申请有几份？帮我按材料齐全度排一下。', en: 'How many new applications? Rank them by completeness.' },
    screening: { zh: '筛查会看哪些文件、不看什么？', en: 'What does screening check, and what does it never check?' },
    decision: { zh: '录取通知和婉拒通知分别该怎么写才合规？', en: 'How do I word an acceptance and a decline compliantly?' },
    lease: { zh: '帮我起草安省标准租约，并提醒我续约的时间点。', en: 'Draft the Ontario standard lease and remind me of the renewal timeline.' },
  },
  agent: {
    intake: { zh: '替房东做租客筛查前，我需要哪三样东西？', en: 'What three things do I need before screening a tenant for a landlord?' },
    task_inbox: { zh: '这套房现在挂多少合适？', en: 'What should this unit list at right now?' },
    fieldwork: { zh: '帮我准备明天的带看包。', en: 'Prep tomorrow’s showing pack for me.' },
    settlement: { zh: '成交后 21 天内我要交什么？押金和附表 B 有哪些红线？', en: 'What must I deliver within 21 days of closing, and what are the hard lines on deposits and Schedule B?' },
  },
}

export function buildIdeas(args: {
  role: AgentRole
  lang: Lang
  agentName: string
  memories: MemoryItem[]
  workflow: WorkflowState | null
  pendingActions: PendingAction[]
  recommendations: Recommendation[]
}): Idea[] {
  const { role, lang, memories, workflow, pendingActions, recommendations } = args
  const out: Idea[] = []
  const seen = new Set<string>()
  const push = (i: Idea) => {
    const k = (i.prompt || i.href || i.text).toLowerCase()
    if (seen.has(k)) return
    seen.add(k)
    out.push(i)
  }

  // 1. Waiting on you.
  const pending = pendingActions.filter((a) => a.status === 'pending')
  if (pending.length) {
    push({
      id: 'pending',
      kind: 'pending',
      text: t(lang, `有 ${pending.length} 件事等你点头：${pending[0].title}`, `${pending.length} waiting for your nod: ${pending[0].title}`),
      why: t(lang, '我不会替你决定，批准后才执行', 'I never decide for you — nothing runs until you approve'),
      href: `/${role}/todo`,
    })
  }

  // 2. Reflection profile.
  const um = readUserModel(memories)
  if (um?.current_focus) {
    push({
      id: 'focus',
      kind: 'profile',
      text: t(lang, `继续推进：${um.current_focus}`, `Keep going on: ${um.current_focus}`),
      why: t(lang, '这是你最近几次对话的重点', 'This is what your recent conversations centred on'),
      prompt: t(lang, `关于「${um.current_focus}」，下一步我该做什么？`, `About "${um.current_focus}" — what is my next step?`),
    })
  }
  for (const g of (um?.goals ?? []).slice(0, 2)) {
    push({
      id: `goal:${g}`,
      kind: 'profile',
      text: t(lang, `替你看看「${g}」进展到哪了`, `Check how "${g}" is going`),
      why: t(lang, '你提过这个目标', 'You mentioned this goal'),
      prompt: t(lang, `「${g}」现在进展到哪了？还差什么？`, `Where does "${g}" stand and what is still missing?`),
    })
  }

  // 3. Workflow next step.
  if (workflow) {
    const stages = WORKFLOW_STAGES[role]
    const idx = stageIndex(role, workflow.current_stage)
    const cur = stages[idx]
    const nxt = stages[idx + 1]
    const p = cur ? NEXT_STEP_PROMPT[role][cur.key] : undefined
    if (cur && p) {
      push({
        id: `stage:${cur.key}`,
        kind: 'stage',
        text: p[lang],
        why: t(lang, `你现在在「${cur.label.zh}」这一步${nxt ? `，下一步是「${nxt.label.zh}」` : ''}`, `You are at "${cur.label.en}"${nxt ? `, next is "${nxt.label.en}"` : ''}`),
        prompt: p[lang],
      })
    }
  }

  // 4. Concrete memories → a real check.
  const budget = findMemory(memories, /budget|预算/i)
  const area = findMemory(memories, /area|neighbou?rhood|区域|地区|location/i)
  if (role === 'tenant' && (budget || area)) {
    const b = budget ? formatMemoryValue(budget, lang) : ''
    const a = area ? formatMemoryValue(area, lang) : ''
    push({
      id: 'market',
      kind: 'memory',
      text: t(lang, `查一下${a ? ` ${a} ` : ''}这个季度的 TRREB 均租`, `Check this quarter’s TRREB average rent${a ? ` for ${a}` : ''}`),
      why: t(lang, `你记在案的${b ? `预算 ${b}` : ''}${b && a ? '、' : ''}${a ? `区域 ${a}` : ''}`, `From your saved ${b ? `budget ${b}` : ''}${b && a ? ' and ' : ''}${a ? `area ${a}` : ''}`),
      prompt: t(lang, `${a ? a : '我要找的区域'}${b ? `，预算 ${b}` : ''}，现在的行情怎么样？`, `${a ? a : 'my area'}${b ? `, budget ${b}` : ''} — what is the market like now?`),
    })
  }
  const moveDate = findMemory(memories, /move.?(in|date)|搬|入住/i)
  if (moveDate) {
    const d = formatMemoryValue(moveDate, lang)
    push({
      id: 'move',
      kind: 'memory',
      text: t(lang, `按「${d}」倒推，现在该做什么`, `Work back from "${d}" — what is due now`),
      why: t(lang, '你说过这个时间', 'You told me this date'),
      prompt: t(lang, `我计划 ${d} 搬家，从现在到那天每一步该什么时候做？`, `I plan to move ${d}; when should each step happen between now and then?`),
    })
  }
  if (role === 'landlord') {
    const unit = findMemory(memories, /address|unit|地址|房源|property/i)
    if (unit) {
      const u = formatMemoryValue(unit, lang)
      push({
        id: 'unit',
        kind: 'memory',
        text: t(lang, `看看 ${u} 现在的挂牌中位数`, `Check the current asking median for ${u}`),
        why: t(lang, '这是你记在案的房源', 'This is the unit on file'),
        prompt: t(lang, `${u} 同区同户型现在挂多少？`, `What are similar units to ${u} listing at now?`),
      })
    }
  }

  // 5. Existing recommendations as page links.
  for (const r of recommendations.slice(0, 3)) {
    if (!r.href) continue
    push({ id: `reco:${r.id}`, kind: 'reco', text: bi(r.title, lang), why: bi(r.description, lang), href: r.href })
  }

  return out.slice(0, 8)
}

/** Human labels for agent_audit_events.action codes shown in the activity sheet. */
export function auditActionLabel(action: string, lang: Lang, metadata?: Record<string, unknown>): string {
  const m = metadata || {}
  const to = typeof m.sent_to === 'string' ? m.sent_to : ''
  const map: Record<string, { zh: string; en: string }> = {
    turn: { zh: '和你对话了一轮', en: 'A conversation turn' },
    agent_turn: { zh: '和你对话了一轮', en: 'A conversation turn' },
    approve_action: { zh: '你批准了一个动作', en: 'You approved an action' },
    reject_action: { zh: '你拒绝了一个动作', en: 'You rejected an action' },
    executed_send_renewal_letter: { zh: `发出续约函${to ? ` · ${to}` : ''}`, en: `Renewal letter sent${to ? ` · ${to}` : ''}` },
    executed_send_message: { zh: `发出邮件${to ? ` · ${to}` : ''}`, en: `Email sent${to ? ` · ${to}` : ''}` },
    executed_rent_reminder: { zh: `发出租金提醒${to ? ` · ${to}` : ''}`, en: `Rent reminder sent${to ? ` · ${to}` : ''}` },
    executed_renewal_checkpoint: { zh: '续约触点已知悉', en: 'Renewal checkpoint acknowledged' },
    executed_showing_request: { zh: `看房请求已确认${to ? ` · ${to}` : ''}`, en: `Showing request accepted${to ? ` · ${to}` : ''}` },
    executed_listing_inquiry: { zh: `回复了房源提问${to ? ` · ${to}` : ''}`, en: `Listing question answered${to ? ` · ${to}` : ''}` },
    memory_forgotten: { zh: '按你的要求忘掉了一条记忆', en: 'Forgot a memory at your request' },
    memory_edited: { zh: '按你的要求改了一条记忆', en: 'Edited a memory at your request' },
    reflection: { zh: '更新了对你的了解', en: 'Updated what it knows about you' },
  }
  const hit = map[action]
  if (hit) return hit[lang]
  return action.replace(/_/g, ' ')
}
