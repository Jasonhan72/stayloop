// Conversation list (2026-10-04, user: "新的 thread 需要有一个地方可以查看，也可以点击进去，
// 参考你自己的界面设计"). Pure helpers for components/agent/ThreadList.tsx — the
// claude.ai-style list of past conversations beside the chat.
import type { ThreadListRow } from './threads'

type Lang = 'zh' | 'en'
export type ThreadGroupKey = 'today' | 'yesterday' | 'week' | 'month' | 'older'

const LABEL: Record<ThreadGroupKey, Record<Lang, string>> = {
  today: { zh: '今天', en: 'Today' },
  yesterday: { zh: '昨天', en: 'Yesterday' },
  week: { zh: '过去 7 天', en: 'Previous 7 days' },
  month: { zh: '过去 30 天', en: 'Previous 30 days' },
  older: { zh: '更早', en: 'Older' },
}

/** When a conversation last moved: its last message, else its last save. */
export function threadAt(t: Pick<ThreadListRow, 'last_message_at' | 'updated_at'>): string {
  return t.last_message_at || t.updated_at
}

function dayStart(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

export function threadGroupKey(iso: string, now = new Date()): ThreadGroupKey {
  const t = new Date(iso).getTime()
  const today = dayStart(now)
  const DAY = 86_400_000
  if (t >= today) return 'today'
  if (t >= today - DAY) return 'yesterday'
  if (t >= today - 7 * DAY) return 'week'
  if (t >= today - 30 * DAY) return 'month'
  return 'older'
}

/** Newest first, grouped like claude.ai's sidebar; empty groups dropped. */
export function groupThreads<T extends Pick<ThreadListRow, 'last_message_at' | 'updated_at'>>(rows: T[], lang: Lang, now = new Date()): { key: ThreadGroupKey; label: string; rows: T[] }[] {
  const sorted = [...rows].sort((a, b) => threadAt(b).localeCompare(threadAt(a)))
  const order: ThreadGroupKey[] = ['today', 'yesterday', 'week', 'month', 'older']
  return order
    .map((key) => ({ key, label: LABEL[key][lang], rows: sorted.filter((r) => threadGroupKey(threadAt(r), now) === key) }))
    .filter((g) => g.rows.length > 0)
}

/** Search box: matches the title and the last reply, case-insensitively. */
export function filterThreads<T extends Pick<ThreadListRow, 'title' | 'summary'>>(rows: T[], q: string): T[] {
  const needle = q.trim().toLowerCase()
  if (!needle) return rows
  return rows.filter((r) => `${r.title ?? ''} ${r.summary ?? ''}`.toLowerCase().includes(needle))
}

/** Title shown for a conversation that never got a user message saved as one. */
export function threadLabel(t: Pick<ThreadListRow, 'title'>, lang: Lang): string {
  return t.title?.trim() || (lang === 'zh' ? '新对话' : 'New conversation')
}
