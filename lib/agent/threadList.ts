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
export function filterThreads<T extends Pick<ThreadListRow, 'title' | 'summary'> & Partial<Pick<ThreadListRow, 'custom_title'>>>(rows: T[], q: string): T[] {
  const needle = q.trim().toLowerCase()
  if (!needle) return rows
  return rows.filter((r) => `${r.custom_title ?? ''} ${r.title ?? ''} ${r.summary ?? ''}`.toLowerCase().includes(needle))
}

/** A title as stored can be an unfilled guided-intake template (「我要报修：【哪里，如厨房 / 卫生间】…」):
 *  cut at the first 【 and drop the dangling punctuation. */
export function cleanTitle(title: string | null | undefined): string {
  const t = (title ?? '').replace(/\s+/g, ' ').trim()
  const cut = t.includes('【') ? t.slice(0, t.indexOf('【')) : t
  return cut.replace(/[\s:：,，、;；·\-—]+$/u, '').trim()
}

function shortLine(text: string | null | undefined, max: number): string {
  const flat = (text ?? '').replace(/\s+/g, ' ').trim()
  if (!flat) return ''
  return flat.length > max ? flat.slice(0, max - 1).trimEnd() + '…' : flat
}

/** What a conversation is called in the list: its (cleaned) title, else what the AI Agent last said,
 *  else the day it happened — never the literal 「新对话」 next to the 新对话 button (2026-10-04). */
export function threadLabel(t: Pick<ThreadListRow, 'title'> & Partial<Pick<ThreadListRow, 'custom_title' | 'summary' | 'last_message_at' | 'updated_at' | 'created_at'>>, lang: Lang): string {
  // A name the user typed is shown exactly as typed; only the automatic title is cleaned.
  const custom = (t.custom_title ?? '').replace(/\s+/g, ' ').trim()
  if (custom) return custom
  const title = cleanTitle(t.title)
  if (title) return title
  const note = shortLine(t.summary, 24)
  if (note) return note
  const at = t.last_message_at || t.updated_at || t.created_at
  if (at) {
    const d = new Date(at)
    if (Number.isFinite(d.getTime())) return lang === 'zh' ? `${d.getMonth() + 1}月${d.getDate()}日的对话` : `Chat · ${d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}`
  }
  return lang === 'zh' ? '对话' : 'Chat'
}

/** The second line of a row: what the AI Agent last said, one line. */
export function threadNote(t: Pick<ThreadListRow, 'summary'>, max = 40): string {
  return shortLine(t.summary, max)
}

/** A row nobody needs to see: no user turn, no title, and not the one on screen (greeting-only leftovers). Nothing is deleted. */
export function isEmptyThread(t: Pick<ThreadListRow, 'id' | 'turn_count' | 'title'> & Partial<Pick<ThreadListRow, 'custom_title'>>, currentId: string | null): boolean {
  return t.id !== currentId && (t.turn_count ?? 0) === 0 && !cleanTitle(t.title) && !(t.custom_title ?? '').trim()
}

const HAT_ORDER = ['tenant', 'landlord', 'agent'] as const
export type Hat = (typeof HAT_ORDER)[number]
/** Section names for conversations held under another hat (deliberately not called HAT_LABEL). */
export const HAT_SECTION: Record<Hat, { zh: string; en: string }> = {
  tenant: { zh: '租客身份', en: 'As tenant' },
  landlord: { zh: '房东身份', en: 'As landlord' },
  agent: { zh: '经纪身份', en: 'As agent' },
}

/** This hat's conversations, and the other hats' grouped by hat (tenant · landlord · agent). */
export function partitionByHat<T extends Pick<ThreadListRow, 'role'>>(rows: T[], role: string): { mine: T[]; others: { hat: Hat; rows: T[] }[] } {
  const mine = rows.filter((r) => r.role === role)
  const others = HAT_ORDER.filter((h) => h !== role)
    .map((hat) => ({ hat, rows: rows.filter((r) => r.role === hat) }))
    .filter((g) => g.rows.length > 0)
  return { mine, others }
}
