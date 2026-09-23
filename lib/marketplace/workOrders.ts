// Work-order state machine (services marketplace §3). Pure: who may take
// which action from which status, and what the transition writes. The
// server (routes / executors) is the only writer; this module is the rule.
export type WorkOrderStatus = 'offered' | 'declined' | 'quoted' | 'scheduled' | 'in_progress' | 'completed' | 'accepted' | 'rework' | 'disputed' | 'paid' | 'closed' | 'cancelled' | 'expired'
export type ActorKind = 'landlord' | 'tenant' | 'provider' | 'external' | 'system' | 'admin'
export type WoAction = 'accept' | 'decline' | 'quote' | 'approve_quote' | 'reject_quote' | 'arrive' | 'complete' | 'tenant_confirm' | 'accept_completion' | 'request_rework' | 'dispute' | 'resolve_dispute' | 'mark_paid' | 'close' | 'cancel'

export const TICKET_STATUS_FOR: Partial<Record<WorkOrderStatus, string>> = {
  offered: 'assigned', quoted: 'assigned', scheduled: 'assigned', in_progress: 'in_progress', rework: 'in_progress',
  completed: 'review', accepted: 'done', paid: 'done', closed: 'done', cancelled: 'new', declined: 'new', expired: 'new',
}

const CONTRACTOR: ActorKind[] = ['provider', 'external']
const OWNER: ActorKind[] = ['landlord']
const TABLE: Record<WoAction, { from: WorkOrderStatus[]; by: ActorKind[]; to: WorkOrderStatus | ((s: WorkOrderStatus) => WorkOrderStatus) }> = {
  accept: { from: ['offered'], by: CONTRACTOR, to: 'quoted' },          // accept = accept with a quote (amount may be 0 for "on inspection")
  quote: { from: ['offered', 'quoted'], by: CONTRACTOR, to: 'quoted' },
  decline: { from: ['offered', 'quoted'], by: CONTRACTOR, to: 'declined' },
  approve_quote: { from: ['quoted'], by: OWNER, to: 'scheduled' },
  reject_quote: { from: ['quoted'], by: OWNER, to: 'cancelled' },
  arrive: { from: ['scheduled', 'rework'], by: CONTRACTOR, to: 'in_progress' },
  complete: { from: ['scheduled', 'in_progress', 'rework'], by: CONTRACTOR, to: 'completed' },
  tenant_confirm: { from: ['completed', 'accepted'], by: ['tenant'], to: (s) => s },
  accept_completion: { from: ['completed'], by: OWNER, to: 'accepted' },
  request_rework: { from: ['completed'], by: OWNER, to: 'rework' },
  dispute: { from: ['completed', 'accepted', 'in_progress'], by: [...OWNER, ...CONTRACTOR], to: 'disputed' },
  resolve_dispute: { from: ['disputed'], by: ['admin'], to: 'accepted' },
  mark_paid: { from: ['accepted'], by: OWNER, to: 'paid' },
  close: { from: ['paid', 'accepted'], by: [...OWNER, 'system'], to: 'closed' },
  cancel: { from: ['offered', 'quoted', 'scheduled'], by: [...OWNER, ...CONTRACTOR], to: 'cancelled' },
}

export function canAct(action: WoAction, status: WorkOrderStatus, by: ActorKind): { ok: boolean; reason?: string; to?: WorkOrderStatus } {
  const t = TABLE[action]
  if (!t) return { ok: false, reason: 'unknown_action' }
  if (!t.by.includes(by)) return { ok: false, reason: 'not_your_action' }
  if (!t.from.includes(status)) return { ok: false, reason: `not_from_${status}` }
  return { ok: true, to: typeof t.to === 'function' ? t.to(status) : t.to }
}

export type QuoteInput = { amount: number; type: 'fixed' | 'hourly_estimate'; note?: string; valid_until?: string; schedule_start?: string; schedule_end?: string }

export function validateQuote(q: Partial<QuoteInput>): { ok: boolean; reason?: string; value?: QuoteInput } {
  const amount = Number(q.amount)
  if (!Number.isFinite(amount) || amount < 0 || amount > 100_000) return { ok: false, reason: 'amount' }
  const type = q.type === 'fixed' || q.type === 'hourly_estimate' ? q.type : null
  if (!type) return { ok: false, reason: 'type' }
  const start = q.schedule_start ? new Date(q.schedule_start) : null
  const end = q.schedule_end ? new Date(q.schedule_end) : null
  if ((start && isNaN(start.getTime())) || (end && isNaN(end.getTime()))) return { ok: false, reason: 'schedule' }
  if (start && end && end.getTime() < start.getTime()) return { ok: false, reason: 'schedule' }
  return { ok: true, value: { amount: Math.round(amount * 100) / 100, type, note: (q.note || '').trim().slice(0, 2000) || undefined, valid_until: q.valid_until || undefined, schedule_start: start ? start.toISOString() : undefined, schedule_end: end ? end.toISOString() : undefined } }
}

/** CPA 2002 s.10: an invoice may exceed the approved estimate by at most 10% unless new work was approved. */
export function invoiceWithinEstimate(approved: number | null | undefined, invoice: number | null | undefined): { ok: boolean; overBy?: number } {
  if (approved == null || invoice == null || approved <= 0) return { ok: true }
  const over = Math.round((invoice / approved - 1) * 10000) / 10000
  return over > 0.10 ? { ok: false, overBy: Math.round(over * 1000) / 10 } : { ok: true }
}

/** RTA s.27(1): non-emergency entry needs 24 hours' written notice, 8:00–20:00; s.26 waives it in an emergency. */
export function entryNoticeRequired(emergency: boolean, entryPermission: string | null | undefined): boolean {
  if (emergency) return false
  return entryPermission !== 'tenant_present' ? true : true // a notice still goes out; tenant_present only changes the wording
}

export function entryNoticeText(i: { unit: string; scheduleStart?: string | null; scheduleEnd?: string | null; provider: string; scope: string; entryPermission: string | null | undefined; emergency: boolean }): { subject: string; body: string } {
  const fmt = (s?: string | null) => (s ? new Date(s).toLocaleString('en-CA', { timeZone: 'America/Toronto', dateStyle: 'medium', timeStyle: 'short' }) : '待定 / TBD')
  const window = `${fmt(i.scheduleStart)} – ${fmt(i.scheduleEnd)}`
  const perm = i.entryPermission === 'tenant_present' ? { zh: '按您的要求，须您本人在场。', en: 'At your request, you will be present.' }
    : i.entryPermission === 'call_first' ? { zh: '进入前会先电话联系您。', en: 'You will be called before entry.' }
    : { zh: '如您不在，服务商将在上述时间段内进入。', en: 'If you are out, the contractor will enter within the window above.' }
  const legal = i.emergency
    ? { zh: '本次为紧急维修（RTA s.26），可不提前 24 小时通知；仍以本邮件告知。', en: 'This is an emergency repair (RTA s.26); 24 hours\' notice is not required, but you are informed by this email.' }
    : { zh: '按《住宅租赁法》s.27，此为提前 24 小时以上的书面进入通知，进入时间在 8:00–20:00 之间。', en: 'Under RTA s.27 this is written notice of entry given at least 24 hours ahead, between 8:00 and 20:00.' }
  const subject = `进入通知 · ${i.unit} · ${window} / Notice of entry`
  const body =
    `您好，\n\n为处理报修「${i.scope}」，服务商 ${i.provider} 将于 ${window} 进入 ${i.unit}。${perm.zh}\n\n${legal.zh}\n\n如时间不便，请直接回复本邮件。\n\n谢谢！\n\n` +
    `Hi,\n\nTo carry out the repair "${i.scope}", ${i.provider} will enter ${i.unit} on ${window}. ${perm.en}\n\n${legal.en}\n\nIf the time does not work for you, reply to this email.\n\nThank you!`
  return { subject, body }
}

/** Six pilot metrics from the event log (services marketplace §7). */
export type WoRow = { status: WorkOrderStatus; created_at: string; quoted_at: string | null; approved_amount: number | null; invoice_amount: number | null; schedule_start: string | null; arrived_at: string | null; accepted_at: string | null; emergency: boolean }
export function providerMetrics(rows: WoRow[]): { offered: number; acceptRate: number | null; arrivalMinutesMedian: number | null; quoteVariance: number | null; reworkRate: number | null; disputeRate: number | null } {
  const offered = rows.length
  const accepted = rows.filter((r) => r.quoted_at).length
  const arrivals = rows.filter((r) => r.schedule_start && r.arrived_at).map((r) => (new Date(r.arrived_at!).getTime() - new Date(r.schedule_start!).getTime()) / 60_000).sort((a, b) => a - b)
  const vars = rows.filter((r) => r.approved_amount && r.invoice_amount).map((r) => r.invoice_amount! / r.approved_amount! - 1)
  const done = rows.filter((r) => ['accepted', 'paid', 'closed', 'rework', 'disputed'].includes(r.status))
  const med = (a: number[]) => (a.length ? a[Math.floor((a.length - 1) / 2)] : null)
  return {
    offered,
    acceptRate: offered ? Math.round((accepted / offered) * 100) / 100 : null,
    arrivalMinutesMedian: med(arrivals) == null ? null : Math.round(med(arrivals)!),
    quoteVariance: vars.length ? Math.round((vars.reduce((s, v) => s + v, 0) / vars.length) * 1000) / 1000 : null,
    reworkRate: done.length ? Math.round((rows.filter((r) => r.status === 'rework').length / done.length) * 100) / 100 : null,
    disputeRate: done.length ? Math.round((rows.filter((r) => r.status === 'disputed').length / done.length) * 100) / 100 : null,
  }
}

export const WO_STATUS_LABEL: Record<WorkOrderStatus, { zh: string; en: string; tone: 'ok' | 'warn' | 'info' | 'danger' | 'neutral' }> = {
  offered: { zh: '已派单 · 等服务商回应', en: 'Offered · awaiting response', tone: 'warn' },
  declined: { zh: '服务商婉拒', en: 'Declined', tone: 'danger' },
  quoted: { zh: '已报价 · 等房东批准', en: 'Quoted · awaiting approval', tone: 'warn' },
  scheduled: { zh: '已安排', en: 'Scheduled', tone: 'info' },
  in_progress: { zh: '处理中', en: 'In progress', tone: 'info' },
  completed: { zh: '已完工 · 待验收', en: 'Completed · awaiting acceptance', tone: 'warn' },
  accepted: { zh: '已验收', en: 'Accepted', tone: 'ok' },
  rework: { zh: '返工中', en: 'Rework', tone: 'danger' },
  disputed: { zh: '争议中', en: 'Disputed', tone: 'danger' },
  paid: { zh: '已付款', en: 'Paid', tone: 'ok' },
  closed: { zh: '已归档', en: 'Closed', tone: 'neutral' },
  cancelled: { zh: '已取消', en: 'Cancelled', tone: 'neutral' },
  expired: { zh: '已过期', en: 'Expired', tone: 'neutral' },
}
