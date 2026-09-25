// Pure helpers for the assistant's activity log (grouping, time, glyphs).
// No Supabase import here so tests and server code can use them; the
// browser hook lives in ./useActivityLog.ts.
import type { Lang } from '@/lib/i18n'

export type ActivityRow = { id: string; action: string; actor_type: string; created_at: string; metadata: Record<string, unknown> | null }

export function fmtActivityTime(iso: string, lang: Lang, now = new Date()): string {
  const d = new Date(iso)
  const sameDay = d.toDateString() === now.toDateString()
  const hm = d.toLocaleTimeString(lang === 'zh' ? 'zh-CN' : 'en-CA', { hour: '2-digit', minute: '2-digit', hour12: false })
  if (sameDay) return hm
  const yest = new Date(now.getTime() - 86_400_000)
  if (d.toDateString() === yest.toDateString()) return lang === 'zh' ? `昨天 ${hm}` : `Yesterday ${hm}`
  return d.toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'en-CA', { month: 'short', day: 'numeric' })
}

/** Today / Yesterday / Earlier, in that order, empty groups dropped (Muse web reference). */
export function activityGroups(rows: ActivityRow[], lang: Lang, now = new Date()): { key: 'today' | 'yesterday' | 'earlier'; label: string; rows: ActivityRow[] }[] {
  const today = now.toDateString()
  const yesterday = new Date(now.getTime() - 86_400_000).toDateString()
  const g: Record<'today' | 'yesterday' | 'earlier', ActivityRow[]> = { today: [], yesterday: [], earlier: [] }
  for (const r of rows) {
    const d = new Date(r.created_at).toDateString()
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
  if (action === 'turn') return '💬'
  return '·'
}
