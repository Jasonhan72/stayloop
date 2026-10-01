// Decision notices on the applicant page (sweep 2026-10-01). The landlord's
// choice is a send_decision card; the application's status changes only when
// the executor sends the notice. One live notice per application: drafting a
// new one expires the others, and a notice that was approved but never sent
// (rate limit, mail error) stays visible with a retry instead of vanishing.

export type NoticeDecision = 'approved' | 'declined' | 'needs_more'

export type NoticeRow = {
  id: string
  status: 'pending' | 'approved' | 'rejected' | 'expired'
  created_at: string
  executed_at?: string | null
  decided_at?: string | null
  execution_result?: { ok?: boolean; reason?: string } | null
  metadata: Record<string, unknown>
}

export function noticeDecisionOf(row: { metadata: Record<string, unknown> } | null | undefined): NoticeDecision | null {
  const d = row?.metadata?.decision
  return d === 'approved' || d === 'declined' || d === 'needs_more' ? d : null
}

/** The newest pending card and the newest approved card that never went out. */
export function pickNoticeCards<T extends NoticeRow>(rows: T[]): { pending: T | null; stuck: T | null } {
  const sorted = [...rows].sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
  return {
    pending: sorted.find((r) => r.status === 'pending') ?? null,
    stuck: sorted.find((r) => r.status === 'approved' && !r.executed_at) ?? null,
  }
}

/** Legacy 'rejected' is a decline (lib/matters/states; the executor maps it the same way). */
export function isDecidedStatus(status: string | null | undefined): status is 'approved' | 'declined' | 'rejected' {
  return status === 'approved' || status === 'declined' || status === 'rejected'
}

/**
 * Which decision controls are live. A decided application keeps its decision
 * (the executor refuses a notice that contradicts it); a decided application
 * whose notice never went out, with no card in flight, gets 「重新起草通知」.
 */
export function noticeControls(
  app: { status: string | null; decision_notified_at: string | null },
  cards: { pending: NoticeRow | null; stuck: NoticeRow | null },
): { canApprove: boolean; canDecline: boolean; canAskMore: boolean; redraft: 'approved' | 'declined' | null } {
  const decided = isDecidedStatus(app.status)
  const pendingDecision = noticeDecisionOf(cards.pending)
  return {
    canApprove: !decided && pendingDecision !== 'approved',
    canDecline: !decided && pendingDecision !== 'declined',
    canAskMore: true,
    redraft: decided && !app.decision_notified_at && !cards.pending && !cards.stuck ? (app.status === 'approved' ? 'approved' : 'declined') : null,
  }
}

/**
 * A just-approved card waits out the 60-second undo window before it is sent.
 * A card whose send already failed is not waiting for anything: nothing will
 * send it on its own (the to-do page treats a failed row as stalled, not resumed).
 */
export function inUndoWindow(row: Pick<NoticeRow, 'decided_at' | 'execution_result'> | null | undefined, now = Date.now()): boolean {
  if (row?.execution_result?.ok === false) return false
  const t = row?.decided_at ? Date.parse(row.decided_at) : NaN
  return Number.isFinite(t) && now - t < 75_000
}

/**
 * The execute route answers {already:true} as soon as another request holds the
 * claim — before that request's email has gone out, and it can still fail. Only
 * the card's own success stamp, or (for approve / decline) a decision_notified_at
 * newer than the card, proves the notice was sent.
 */
export function noticeConfirmedSent(
  card: Pick<NoticeRow, 'created_at' | 'metadata'>,
  latest: { executed_at?: string | null; execution_result?: { ok?: boolean } | null } | null | undefined,
  app: { decision_notified_at?: string | null } | null | undefined,
): boolean {
  if (latest?.executed_at && latest.execution_result?.ok === true) return true
  const decision = noticeDecisionOf(card)
  if (decision !== 'approved' && decision !== 'declined') return false
  const notified = app?.decision_notified_at ? Date.parse(app.decision_notified_at) : NaN
  const created = Date.parse(card.created_at)
  return Number.isFinite(notified) && Number.isFinite(created) && notified > created
}

/** Executor failure codes in words the landlord can act on. */
export function noticeReasonText(reason: string | null | undefined, zh: boolean): string {
  const r = (reason || '').trim()
  const m: Record<string, [string, string]> = {
    decision_changed: ['这张通知和这份申请现在的决定不一致，没有发出。', 'This notice no longer matches the application’s decision, so it was not sent.'],
    already_notified: ['这份申请已经发过决定通知，这张没有再发。', 'A decision notice was already sent for this application; this one was not.'],
    superseded: ['你起草了一张更新的同类通知，这张旧的没有发出。', 'You drafted a newer notice of the same kind; this older one was not sent.'],
    expired: ['这张通知已过期，没有发出。请重新起草。', 'This notice expired and was not sent. Draft it again.'],
    stale_approval: ['这张通知批准太久没有发出，已作废。请重新起草。', 'This notice was approved too long ago without being sent and has lapsed. Draft it again.'],
    withdrawn: ['你撤回了这张通知，它没有发出。', 'You withdrew this notice; it was not sent.'],
    'action is not pending': ['这张通知已经不在待批准状态（可能在别的页面处理过，或已失效），已重新读取。', 'This notice is no longer waiting for approval (it was handled on another page, or it lapsed); reloaded.'],
    card_retired: ['这张通知已失效（可能在别的页面起草了新的通知），没有发出。', 'This notice is no longer valid (a newer one may have been drafted on another page); it was not sent.'],
    network: ['网络出错，通知没有确认发出。点「重试发送」再试一次，不会重复发送。', 'Network error; the notice was not confirmed as sent. Use “Retry sending” — it will not be sent twice.'],
    in_flight: ['另一个页面正在发送这张通知，稍后刷新查看。', 'Another page is sending this notice; refresh shortly.'],
    withdraw_too_late: ['这张通知已经在发送中或已经发出，没有撤回。', 'This notice was already being sent or has been sent, so it was not withdrawn.'],
    'hourly send limit reached': ['这一小时内发出的邮件已到上限，通知还没有发出。稍后点「重试发送」。', 'You reached this hour’s email limit; the notice has not been sent. Try “Retry” later.'],
    'applicant has no email': ['申请人没有可用的邮箱，通知发不出去。可以在下方的申请对话里告诉 TA。', 'The applicant has no usable email, so the notice cannot be sent. You can tell them in the application conversation below.'],
    'application is not on your listing': ['这份申请不在你的房源下，不能发通知。', 'This application is not on your listing.'],
    'application not found': ['找不到这份申请。', 'Application not found.'],
    // Sweep 2026-10-01: the other reasons the send_decision executor and the execute route can give.
    application_withdrawn: ['申请人已经撤回了申请，这封通知没有发出。', 'The applicant withdrew the application, so this notice was not sent.'],
    'application_id missing': ['这张通知没有关联到申请，发不出去。请重新起草。', 'This notice is not linked to an application, so it cannot be sent. Draft it again.'],
    'decision missing': ['这张通知没有写明录取还是婉拒，发不出去。请重新起草。', 'This notice does not say which decision it carries, so it cannot be sent. Draft it again.'],
    'send failed': ['邮件服务暂时出错，通知没有发出。稍后点「重试发送」，不会重复发送。', 'The email service had a temporary error; the notice was not sent. Use “Retry sending” later — it will not be sent twice.'],
    'state changed, retry': ['这张通知的状态刚刚变了，通知没有发出。请再点一次「重试发送」。', 'This notice changed just now and was not sent. Use “Retry sending” once more.'],
    no_session: ['登录已过期，通知没有发出。请刷新页面后再试。', 'Your sign-in expired; the notice was not sent. Refresh the page and try again.'],
    'Invalid session': ['登录已过期，通知没有发出。请刷新页面后再试。', 'Your sign-in expired; the notice was not sent. Refresh the page and try again.'],
    'Authentication required': ['登录已过期，通知没有发出。请刷新页面后再试。', 'Your sign-in expired; the notice was not sent. Refresh the page and try again.'],
  }
  const hit = m[r]
  if (hit) return zh ? hit[0] : hit[1]
  // The execute route's "action is <status>, not approved": the card left the approved state.
  const state = r.match(/^action is (\w+), not approved$/)
  if (state) {
    const word: Record<string, [string, string]> = { pending: ['待批准', 'waiting for approval'], rejected: ['已拒绝', 'rejected'], expired: ['已失效', 'no longer valid'] }
    const w = word[state[1]] ?? [state[1], state[1]]
    return zh ? `这张通知现在是「${w[0]}」，没有发出。` : `This notice is now ${w[1]}, so it was not sent.`
  }
  return zh ? `通知没有发出${r ? `（${r}）` : ''}。` : `The notice was not sent${r ? ` (${r})` : ''}.`
}
