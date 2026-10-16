// Audit event kinds — one place that says what an `agent_audit_events.action`
// means (V1.0 阶段 1 · 甲 #6, 2026-10-15). 84% of the production rows were
// `*_agent_session_started`: every page open writes one, so "last audit event"
// could not tell a landlord who went quiet from one who was browsing. Nothing
// here changes what gets written; readers (the audit page, the panel's
// 「最近替你办完」, retention queries) classify rows with these helpers instead
// of each keeping its own regex.
//
// Three kinds:
//   · page-open   — the person looked at something (a workspace page, a listing,
//                   a search). Hidden by default on the audit page, never an outcome.
//   · bookkeeping — chat turns and reflection runs; not audit events at all.
//   · outcome     — something was actually done (an execution, a system dispatch).
// Everything else (approvals, edits, exports, file views, sign-ins) is a real
// audit event that is neither a page open nor an outcome.
//
// The outcome helpers stay defined in lib/agent/activityLog.ts (the panel's
// 「最近替你办完」 owns that logic); they are re-exported here so every reader
// imports the classification from one module.

export { NOT_AN_OUTCOME, OUTCOME_EVENTS, isNotDoneAction, isOutcomeAction, outcomeHat } from '@/lib/agent/activityLog'
import { isOutcomeAction } from '@/lib/agent/activityLog'

/** Actions that only say a page was opened or browsed. `*_session_started` is matched
 *  by suffix (`tenant_agent_session_started`, `landlord_agent_session_started`, …). */
export const PAGE_OPEN_ACTIONS = ['listing_viewed', 'listings_searched'] as const
export const PAGE_OPEN_SUFFIX = '_session_started'

/** The person opened or browsed something — not something they did. */
export function isPageOpenEvent(action: string | null | undefined): boolean {
  if (!action) return false
  return action.endsWith(PAGE_OPEN_SUFFIX) || (PAGE_OPEN_ACTIONS as readonly string[]).includes(action)
}

/** Conversation turns and reflection runs: written to the same table for cost / rate accounting,
 *  but they are not audit events (the audit page has never listed them). */
export function isBookkeepingEvent(action: string | null | undefined): boolean {
  if (!action) return false
  return /_agent_turn$|_turn$|^turn$|reflect/.test(action)
}

/** Something was actually done for the person (an executed card, a system dispatch) — never a page open. */
export function isOutcomeEvent(action: string | null | undefined): boolean {
  if (!action || isPageOpenEvent(action)) return false
  return isOutcomeAction(action)
}

/** A row the audit page should list: neither bookkeeping nor (unless asked for) a page open. */
export function isAuditRow(action: string | null | undefined, showPageOpens = false): boolean {
  if (!action || isBookkeepingEvent(action)) return false
  return showPageOpens || !isPageOpenEvent(action)
}
