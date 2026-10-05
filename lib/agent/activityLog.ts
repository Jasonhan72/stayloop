// Pure helpers for the AI Agent panel's 「最近替你办完」 and the AI chats list
// rows (2026-10-04: the mixed activity log — conversations plus audit rows —
// was retired; conversations are listed by ThreadList, outcomes by the panel's
// 待办 tab, everything else on the audit page). No Supabase import here so
// tests and server code can use them; the browser hook lives in ./useActivityLog.ts.
import type { Lang } from '@/lib/i18n'

/** Events that say something did NOT happen (sweep 2026-10-01): never drawn or counted as done. */
const NOT_DONE = new Set(['work_order_dispatch_no_candidate'])
export const isNotDoneAction = (action: string): boolean => NOT_DONE.has(action)

/** Executions that are only an acknowledgement or a bookkeeping flag — not something it did for you. */
export const NOT_AN_OUTCOME = ['executed_claim_in_reply', 'executed_renewal_checkpoint', 'executed_relist_prompt'] as const
/** System events that finished something for the person (their own actions, e.g. confirming a delegation, are not listed). */
export const OUTCOME_EVENTS = ['work_order_auto_dispatched', 'work_order_quote_auto_approved', 'household_created_from_esign'] as const
/** Things it actually finished for you — the panel's 「最近替你办完」 (2026-10-04). Bookkeeping (a new avatar,
 *  file views, exports, memory edits), acknowledgements and non-events stay on the audit page. */
export function isOutcomeAction(action: string): boolean {
  if (isNotDoneAction(action) || (NOT_AN_OUTCOME as readonly string[]).includes(action)) return false
  return /^executed_/.test(action) || (OUTCOME_EVENTS as readonly string[]).includes(action)
}

// Older audit rows carry no acting_role; the action says whose hat it was done under.
const LANDLORD_OUTCOMES = /^(executed_(send_decision|send_lease|send_renewal_letter|rent_reminder|showing_request|listing_inquiry|dispatch_work_order|approve_quote|accept_completion|work_order_overdue)|work_order_auto_dispatched|work_order_quote_auto_approved|household_created_from_esign)$/
/** The hat an outcome belongs to: its acting_role, else what the action implies, else null (shown under every hat). */
export function outcomeHat(action: string, actingRole: string | null | undefined): string | null {
  if (actingRole) return actingRole
  if (LANDLORD_OUTCOMES.test(action)) return 'landlord'
  if (action === 'executed_maintenance_request') return 'tenant'
  return null
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
