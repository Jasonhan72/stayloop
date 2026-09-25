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
      kind: 'thread', id: `t:${t.id}`, threadId: t.id, title: t.title, summary: t.summary, turns: t.turn_count,
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
