// 批准记录 (2026-11-27): the panel's record of every card the assistant proposed and what became
// of it. Pure — the tab reads the person's own agent_pending_actions rows (RLS = self) and these
// helpers say, from the row alone, what happened. Nothing here decides anything: approvals still
// happen only on the cards in the conversation.
import { executionReasonText } from './chatCopy'

export type ApprovalRow = {
  id: string
  action_type: string
  title: string
  summary: string | null
  recipient_label: string | null
  status: string
  created_at: string
  decided_at: string | null
  executed_at: string | null
  execution_result: { ok?: boolean; reason?: string | null; error?: string | null } | null
  metadata: Record<string, unknown> | null
}
/** Explicit columns — never '*': the record needs these and nothing else. */
export const APPROVAL_HISTORY_COLUMNS = 'id, action_type, title, summary, recipient_label, status, created_at, decided_at, executed_at, execution_result, metadata'

/**
 * waiting   proposed, or approved and not run yet — still on the person's plate
 * ran       approved and it ran
 * failed    approved, the run was recorded as failed
 * declined  the person said no (or dropped an approved card)
 * refused   it was checked when it was about to run and could not go ahead
 * lapsed    it stopped applying before anyone decided (the facts changed, or time ran out)
 */
export type ApprovalOutcome = 'waiting' | 'ran' | 'failed' | 'declined' | 'refused' | 'lapsed'

const reasonOf = (r: Pick<ApprovalRow, 'execution_result'>): string => String(r.execution_result?.reason ?? r.execution_result?.error ?? '').trim()

export function approvalOutcome(r: Pick<ApprovalRow, 'status' | 'executed_at' | 'execution_result'>): ApprovalOutcome {
  if (r.status === 'pending') return 'waiting'
  if (r.status === 'approved') {
    if (!r.executed_at) return 'waiting'
    return r.execution_result?.ok === false ? 'failed' : 'ran'
  }
  if (r.status === 'rejected') return reasonOf(r) ? 'refused' : 'declined'
  return 'lapsed'
}

/** One line: what became of the card. Reasons are the same wording the chat uses (chatCopy). */
export function approvalOutcomeLabel(r: Pick<ApprovalRow, 'status' | 'executed_at' | 'execution_result'>, zh: boolean): string {
  const o = approvalOutcome(r)
  const why = reasonOf(r)
  if (o === 'waiting') return r.status === 'approved' ? (zh ? '已批准，尚未执行' : 'Approved, not run yet') : (zh ? '等你点头' : 'Waiting on you')
  if (o === 'ran') return zh ? '已批准，已执行' : 'Approved and done'
  if (o === 'failed') return zh ? `已批准，没有执行成：${executionReasonText(why, true)}` : `Approved, but it did not run: ${executionReasonText(why, false)}`
  if (o === 'declined') return zh ? '你没有批准' : 'You declined'
  if (o === 'refused') return zh ? `没有执行：${executionReasonText(why, true)}` : `Not run: ${executionReasonText(why, false)}`
  return why
    ? (zh ? `已失效：${executionReasonText(why, true)}` : `No longer applies: ${executionReasonText(why, false)}`)
    : (zh ? '已过期，没有处理' : 'Expired, never handled')
}

/** When the outcome happened, and what that time is: a row that lapsed with no decision on record
 *  only has the day it was proposed — the list says so rather than passing it off as the outcome. */
export function approvalAt(r: Pick<ApprovalRow, 'created_at' | 'decided_at' | 'executed_at'>): { at: string; basis: 'ran' | 'decided' | 'proposed' } {
  if (r.executed_at) return { at: r.executed_at, basis: 'ran' }
  if (r.decided_at) return { at: r.decided_at, basis: 'decided' }
  return { at: r.created_at, basis: 'proposed' }
}

/** Newest outcome first; waiting rows are not history. */
export function approvalHistory<T extends ApprovalRow>(rows: readonly T[], keep = 20): T[] {
  return rows
    .filter((r) => approvalOutcome(r) !== 'waiting')
    .sort((a, b) => approvalAt(b).at.localeCompare(approvalAt(a).at))
    .slice(0, keep)
}

export type ApprovalFamily = 'message' | 'repair' | 'lease' | 'other'
const MESSAGE = new Set(['send_message', 'rent_reminder', 'rent_overdue', 'send_decision', 'listing_inquiry', 'showing_request', 'share_passport_summary', 'takedown_reminder'])
const REPAIR = new Set(['maintenance_request', 'dispatch_work_order', 'approve_quote', 'accept_completion', 'work_order_overdue'])
const LEASE = new Set(['send_lease', 'send_renewal_letter', 'approve_applicant'])
/** Which small icon the row carries. */
export function approvalFamily(actionType: string): ApprovalFamily {
  if (MESSAGE.has(actionType)) return 'message'
  if (REPAIR.has(actionType)) return 'repair'
  if (LEASE.has(actionType)) return 'lease'
  return 'other'
}

/** 「3 小时前」 / "3h ago"; a calendar date once it is more than 30 days back. */
export function agoLabel(iso: string, zh: boolean, now: Date = new Date()): string {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return ''
  const min = Math.floor((now.getTime() - t) / 60_000)
  if (min < 1) return zh ? '刚刚' : 'just now'
  if (min < 60) return zh ? `${min} 分钟前` : `${min}m ago`
  const h = Math.floor(min / 60)
  if (h < 24) return zh ? `${h} 小时前` : `${h}h ago`
  const d = Math.floor(h / 24)
  if (d <= 30) return zh ? `${d} 天前` : `${d}d ago`
  return new Date(t).toLocaleDateString(zh ? 'zh-CN' : 'en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' })
}
