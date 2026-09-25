// Pure helpers for the assistant's activity log. The log lists conversations
// — one row per agent_threads row (user 2026-09-25: "不是记录每一条消息，是
// 记录每一个对话", after the Muse web panel where every row is a chat with its
// outcome) — with the decisions taken inside a conversation folded into its
// row, plus the actions that happened outside any conversation (a card
// approved on the to-do page, a work order). No Supabase import here so tests
// and server code can use them; the browser hook lives in ./useActivityLog.ts.
import type { Lang } from '@/lib/i18n'
import type { ThreadListRow } from './threads'

export type ActivityRow = { id: string; action: string; actor_type: string; created_at: string; metadata: Record<string, unknown> | null }

export type ThreadItem = {
  kind: 'thread'
  id: string
  threadId: string
  /** The hat the conversation ran under — it reopens on that hat's page. */
  role: string
  title: string | null
  summary: string | null
  turns: number
  at: string
  approved: number
  rejected: number
  executed: number
  undone: number
}
export type ActionItem = { kind: 'action'; id: string; threadId: string | null; action: string; actor_type: string; at: string; metadata: Record<string, unknown> | null }
export type ActivityItem = ThreadItem | ActionItem

/** A turn is a message inside a conversation — the conversation row stands for it. */
export const isTurnAction = (action: string): boolean => /(^|_)turn$/.test(action)

const threadIdOf = (r: ActivityRow): string | null => (typeof r.metadata?.thread_id === 'string' ? (r.metadata.thread_id as string) : null)
const ts = (iso: string): number => Date.parse(iso) || 0

/** Conversations first-class; decisions with a thread_id fold into their
 *  conversation (counts + the row's time); everything else stays its own row.
 *  Newest first. */
export function buildActivity(threads: ThreadListRow[], events: ActivityRow[]): ActivityItem[] {
  const byThread = new Map<string, ThreadItem>()
  for (const t of threads) {
    byThread.set(t.id, {
      kind: 'thread', id: `t:${t.id}`, threadId: t.id, role: t.role, title: t.title, summary: t.summary, turns: t.turn_count,
      at: t.last_message_at ?? t.updated_at, approved: 0, rejected: 0, executed: 0, undone: 0,
    })
  }
  const items: ActivityItem[] = [...byThread.values()]
  for (const e of events) {
    if (isTurnAction(e.action)) continue
    const tid = threadIdOf(e)
    const t = tid ? byThread.get(tid) : undefined
    if (t) {
      if (/^executed_|^work_order_/.test(e.action)) t.executed++
      else if (e.action === 'approval_undone') t.undone++
      else if (/_rejected$/.test(e.action)) t.rejected++
      else if (/_approved$/.test(e.action)) t.approved++
      if (ts(e.created_at) > ts(t.at)) t.at = e.created_at
      continue
    }
    items.push({ kind: 'action', id: `a:${e.id}`, threadId: tid, action: e.action, actor_type: e.actor_type, at: e.created_at, metadata: e.metadata })
  }
  return items.sort((a, b) => ts(b.at) - ts(a.at))
}

/** Today / Yesterday / Earlier, in that order, empty groups dropped (Muse web reference). */
export function activityGroups<T extends { at: string }>(items: T[], lang: Lang, now = new Date()): { key: 'today' | 'yesterday' | 'earlier'; label: string; rows: T[] }[] {
  const today = now.toDateString()
  const yesterday = new Date(now.getTime() - 86_400_000).toDateString()
  const g: Record<'today' | 'yesterday' | 'earlier', T[]> = { today: [], yesterday: [], earlier: [] }
  for (const r of items) {
    const d = new Date(r.at).toDateString()
    g[d === today ? 'today' : d === yesterday ? 'yesterday' : 'earlier'].push(r)
  }
  const label = { today: lang === 'zh' ? '今天' : 'Today', yesterday: lang === 'zh' ? '昨天' : 'Yesterday', earlier: lang === 'zh' ? '更早' : 'Earlier' }
  return (['today', 'yesterday', 'earlier'] as const).filter((k) => g[k].length).map((k) => ({ key: k, label: label[k], rows: g[k] }))
}

/** A glyph per action family — the log should scan by shape, not by reading every line. */
export function activityIcon(action: string): string {
  if (/^executed_|^work_order_/.test(action)) return '✓'
  if (/^approval_undone|_rejected$|^rejected/.test(action)) return '↩'
  if (/^approval|_approved$/.test(action)) return '✓'
  if (/memory/.test(action)) return '🧠'
  if (/listing|search/.test(action)) return '🔎'
  if (/message|notified|sent|email/.test(action)) return '✉'
  if (/file|document|screen/.test(action)) return '📄'
  if (/(^|_)turn$/.test(action)) return '💬'
  return '·'
}

/** A conversation row is a speech bubble until something was carried out in it. */
export function itemIcon(item: ActivityItem): string {
  if (item.kind === 'action') return activityIcon(item.action)
  return item.executed > 0 || item.approved > 0 ? '✓' : '💬'
}

/** HH:MM inside today / yesterday (the group header already says which day);
 *  date + time further back. */
export function fmtRowTime(iso: string, lang: Lang, now = new Date()): string {
  const d = new Date(iso)
  const hm = d.toLocaleTimeString(lang === 'zh' ? 'zh-CN' : 'en-CA', { hour: '2-digit', minute: '2-digit', hour12: false })
  const day = d.toDateString()
  if (day === now.toDateString() || day === new Date(now.getTime() - 86_400_000).toDateString()) return hm
  return `${d.toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'en-CA', { month: 'short', day: 'numeric' })} ${hm}`
}

/** The short note under a conversation's title (Muse: "Generated 10-page PDF
 *  and saved session notes"): the first sentence of what it amounted to — two
 *  when the first is just "好的。" — capped at `max` chars. */
export function shortNote(summary: string | null | undefined, max = 64): string | null {
  const s = (summary ?? '').replace(/\s+/g, ' ').trim()
  if (!s) return null
  const END = /[。！？!?]|\.\s/g
  let cut = -1
  let m: RegExpExecArray | null
  while ((m = END.exec(s))) {
    const end = m.index + m[0].length
    if (end >= 8) { cut = end; break }
  }
  const out = (cut > 0 ? s.slice(0, cut) : s).trim()
  return out.length > max ? `${out.slice(0, max - 1)}…` : out
}

const ACTION_TYPE: Record<string, { zh: string; en: string }> = {
  send_message: { zh: '发一条消息', en: 'Send a message' },
  send_renewal_letter: { zh: '续约函', en: 'Renewal letter' },
  rent_reminder: { zh: '租金提醒', en: 'Rent reminder' },
  renewal_checkpoint: { zh: '续约提醒', en: 'Renewal checkpoint' },
  relist_prompt: { zh: '重新挂牌提醒', en: 'Relist prompt' },
  showing_request: { zh: '看房请求', en: 'Showing request' },
  listing_inquiry: { zh: '房源提问', en: 'Listing inquiry' },
  send_decision: { zh: '申请决定通知', en: 'Decision notice' },
  send_lease: { zh: '发送租约', en: 'Send the lease' },
  maintenance_request: { zh: '报修工单', en: 'Maintenance request' },
  dispatch_work_order: { zh: '派单', en: 'Dispatch a work order' },
  approve_quote: { zh: '批准报价', en: 'Approve a quote' },
  accept_completion: { zh: '验收完工', en: 'Accept completion' },
  payment_authorization: { zh: '付款授权', en: 'Payment authorization' },
  publish_listing: { zh: '发布房源', en: 'Publish a listing' },
}
/** What kind of card an approval / execution row was about. */
export function actionTypeLabel(type: string | null | undefined, lang: Lang): string | null {
  if (!type) return null
  const hit = ACTION_TYPE[type]
  return hit ? (lang === 'zh' ? hit.zh : hit.en) : type.replace(/_/g, ' ')
}

/** The note line: a conversation's outcome, or the card an action was about. */
export function itemNote(item: ActivityItem, lang: Lang): string | null {
  if (item.kind === 'thread') return shortNote(item.summary)
  const t = typeof item.metadata?.action_type === 'string' ? (item.metadata.action_type as string) : null
  return actionTypeLabel(t, lang)
}
