// 「今天」 in the panel's 任务 tab (2026-11-27): what the assistant did today, newest first —
// the conversations it had with the person under this hat and the things it finished for them.
// Only today: the full list of conversations stays in the AI chats list (2026-10-04: 「对话只在
// 左边」), and everything older than today is one fold below or on the audit page. Pure.
import type { Lang } from '@/lib/i18n'
import { auditActionLabel } from './ideas'
import { threadAt, threadGroupKey, threadLabel, threadNote } from './threadList'
import type { ThreadListRow } from './threads'
import type { OutcomeRow } from './useActivityLog'

export type TodayItem =
  | { kind: 'chat'; id: string; at: string; title: string; note: string; threadId: string }
  | { kind: 'done'; id: string; at: string; title: string; note: string; failed: boolean; threadId: string | null }

type ThreadLike = Pick<ThreadListRow, 'id' | 'role' | 'title' | 'summary' | 'updated_at' | 'last_message_at'> & Partial<Pick<ThreadListRow, 'custom_title' | 'created_at' | 'is_main' | 'turn_count'>>

const sameDay = (iso: string, now: Date): boolean => {
  const d = new Date(iso)
  return Number.isFinite(d.getTime()) && d.toDateString() === now.toDateString()
}

/** Conversations of this hat that moved today and have at least one turn in them, plus today's
 *  outcomes. An outcome recorded as failed keeps its reason — a list that only ever ticks is not a record. */
export function todayItems(threads: readonly ThreadLike[], outcomes: readonly OutcomeRow[], role: string, lang: Lang, now: Date = new Date()): TodayItem[] {
  const items: TodayItem[] = []
  for (const t of threads) {
    if (t.role !== role) continue
    if (typeof t.turn_count === 'number' && t.turn_count < 1) continue
    const at = threadAt(t)
    if (threadGroupKey(at, now) !== 'today') continue
    items.push({ kind: 'chat', id: `chat:${t.id}`, at, title: threadLabel(t, lang), note: threadNote(t, 44), threadId: t.id })
  }
  for (const o of outcomes) {
    if (!sameDay(o.created_at, now)) continue
    const failed = o.metadata?.ok === false
    const reason = failed ? String(o.metadata?.reason ?? o.metadata?.error ?? '').slice(0, 60) : ''
    const tid = typeof o.metadata?.thread_id === 'string' && o.metadata.thread_id ? (o.metadata.thread_id as string) : null
    items.push({ kind: 'done', id: `done:${o.id}`, at: o.created_at, title: auditActionLabel(o.action, lang, o.metadata || undefined), note: reason, failed, threadId: tid })
  }
  return items.sort((a, b) => b.at.localeCompare(a.at))
}

/** Rows that are not today's — the fold under 「今天」 groups them by day. */
export function beforeToday<T extends { created_at: string }>(rows: readonly T[], now: Date = new Date()): T[] {
  return rows.filter((r) => !sameDay(r.created_at, now))
}
