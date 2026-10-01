// Work-order state machine (services marketplace §3). Pure: who may take
// which action from which status, and what the transition writes. The
// server (routes / executors) is the only writer; this module is the rule.
/**
 * Every work_orders column a signed-in client may read. The table has COLUMN-level
 * grants for `authenticated` (review 2026-09-23 took `token` back — it is the
 * external contact's capability URL), and Postgres refuses `select *` unless the
 * role can read every column: a `select('*')` from the browser was a 403
 * "permission denied for table work_orders" for tenants, landlords and providers
 * alike (three-role walkthrough 2026-09-26). Read this list, never `*`.
 */
export const WORK_ORDER_COLUMNS = [
  'id', 'ticket_id', 'household_id', 'landlord_auth_id', 'provider_id', 'external_name', 'trade', 'scope', 'emergency', 'status',
  'quote_amount', 'quote_type', 'quote_note', 'quote_valid_until', 'quoted_at', 'approved_amount', 'approved_at',
  'schedule_start', 'schedule_end', 'entry_permission', 'entry_notice_sent_at', 'arrived_at',
  'completed_at', 'completion_note', 'completion_photos', 'invoice_amount', 'invoice_note',
  'tenant_confirmed_at', 'accepted_at', 'accepted_by', 'resolution_note', 'dispute_reason', 'disputed_at', 'disputed_by',
  'paid_at', 'payment_mode', 'cancel_reason', 'created_at', 'updated_at',
  // 节点 3 (2026-09-26): SLA, versions, decline reason — granted column by column in 20260926_node3_execution.sql.
  'quote_due_at', 'sla_overdue_at', 'quote_version', 'decline_code',
].join(', ')

export type WorkOrderStatus = 'offered' | 'declined' | 'quoted' | 'scheduled' | 'in_progress' | 'completed' | 'accepted' | 'rework' | 'disputed' | 'paid' | 'closed' | 'cancelled' | 'expired'
export type ActorKind = 'landlord' | 'tenant' | 'provider' | 'external' | 'system' | 'admin'
export type WoAction = 'accept' | 'decline' | 'quote' | 'approve_quote' | 'reject_quote' | 'arrive' | 'complete' | 'tenant_confirm' | 'accept_completion' | 'request_rework' | 'dispute' | 'resolve_dispute' | 'mark_paid' | 'close' | 'cancel'

export const TICKET_STATUS_FOR: Partial<Record<WorkOrderStatus, string>> = {
  offered: 'assigned', quoted: 'assigned', scheduled: 'assigned', in_progress: 'in_progress', rework: 'in_progress',
  completed: 'review', accepted: 'done', paid: 'done', closed: 'done', cancelled: 'new', declined: 'new', expired: 'new', disputed: 'review',
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
  tenant_confirm: { from: ['completed', 'accepted', 'paid', 'closed'], by: ['tenant'], to: (s) => s },
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

/** Today's calendar date in Toronto (YYYY-MM-DD). A quote "valid until" a date is valid through that whole Toronto day — validation and approval both compare against this. */
export function torontoToday(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}
export function quoteExpired(validUntil: string | null | undefined, now = new Date()): boolean {
  return !!validUntil && validUntil < torontoToday(now)
}

export function validateQuote(q: Partial<QuoteInput>, now = new Date()): { ok: boolean; reason?: string; value?: QuoteInput } {
  const amount = Number(q.amount)
  if (!Number.isFinite(amount) || amount < 0 || amount > 100_000) return { ok: false, reason: 'amount' }
  const type = q.type === 'fixed' || q.type === 'hourly_estimate' ? q.type : null
  if (!type) return { ok: false, reason: 'type' }
  const start = q.schedule_start ? new Date(q.schedule_start) : null
  const end = q.schedule_end ? new Date(q.schedule_end) : null
  if ((start && isNaN(start.getTime())) || (end && isNaN(end.getTime()))) return { ok: false, reason: 'schedule' }
  if (start && end && end.getTime() < start.getTime()) return { ok: false, reason: 'schedule' }
  // A window in the past cannot be an entry notice (review 2026-09-23).
  if (start && start.getTime() < now.getTime() - 5 * 60_000) return { ok: false, reason: 'schedule_past' }
  if (q.valid_until && !/^\d{4}-\d{2}-\d{2}$/.test(q.valid_until)) return { ok: false, reason: 'valid_until' }
  // A quote that is already expired when sent can never be approved (approval returns quote_expired).
  if (quoteExpired(q.valid_until, now)) return { ok: false, reason: 'valid_until_past' }
  return { ok: true, value: { amount: Math.round(amount * 100) / 100, type, note: (q.note || '').trim().slice(0, 2000) || undefined, valid_until: q.valid_until || undefined, schedule_start: start ? start.toISOString() : undefined, schedule_end: end ? end.toISOString() : undefined } }
}

/**
 * A quote is a whole set of terms (amount, type, window, note, validity). A
 * revision may send only what changed: a key that is ABSENT keeps the row's
 * value; a key sent as null / '' clears it (sweep 2026-10-01 — "修改报价"
 * rebuilt the quote from an empty form and wiped the window, so approval then
 * dead-ended on entry_window_no_window).
 */
export type QuoteRowTerms = { quote_amount: number | string | null; quote_type: string | null; quote_note: string | null; quote_valid_until: string | null; schedule_start: string | null; schedule_end: string | null }
export function mergeQuote(prev: QuoteRowTerms, p: Record<string, unknown>, now = new Date()): Partial<QuoteInput> {
  const has = (k: string) => Object.prototype.hasOwnProperty.call(p, k) && p[k] !== undefined
  const str = (v: unknown) => (v == null || v === '' ? undefined : String(v))
  // A kept validity that has already lapsed is dropped: otherwise a price-only
  // revision re-sends the expired date and approval dead-ends on quote_expired
  // again. A date the contractor sends explicitly is still validated (and refused if past).
  const keptValidUntil = prev.quote_valid_until && !quoteExpired(prev.quote_valid_until, now) ? prev.quote_valid_until : undefined
  return {
    amount: has('amount') ? Number(p.amount) : prev.quote_amount == null ? NaN : Number(prev.quote_amount),
    type: (has('type') ? str(p.type) : prev.quote_type ?? undefined) as QuoteInput['type'],
    note: has('note') ? str(p.note) : prev.quote_note ?? undefined,
    valid_until: has('valid_until') ? str(p.valid_until) : keptValidUntil,
    schedule_start: has('schedule_start') ? str(p.schedule_start) : prev.schedule_start ?? undefined,
    schedule_end: has('schedule_end') ? str(p.schedule_end) : prev.schedule_end ?? undefined,
  }
}

/**
 * The approval is bound to the version of the quote the landlord saw. Any of
 * expected amount / version / quoted_at that the caller sends must match the
 * row (a re-quote in a stale tab or inside the 60 s undo window otherwise gets
 * approved blind — on a new amount or a new entry window).
 */
export function quoteStillAsSeen(row: { quote_amount: number | string | null; quote_version: number | null; quoted_at: string | null }, p: Record<string, unknown>): boolean {
  if (p.expected_amount != null && p.expected_amount !== '' && Number(p.expected_amount) !== Number(row.quote_amount)) return false
  if (p.expected_version != null && p.expected_version !== '' && Number(p.expected_version) !== Number(row.quote_version ?? 0)) return false
  if (typeof p.expected_quoted_at === 'string' && p.expected_quoted_at && row.quoted_at && new Date(p.expected_quoted_at).getTime() !== new Date(row.quoted_at).getTime()) return false
  return true
}

/**
 * Completing again after rework: what the payload omits is kept from the row
 * (the first invoice must survive a second "完工" with only a note, or the CPA
 * check, the acceptance card and the receipt lose the bill).
 */
export type CompletionRow = { invoice_amount: number | string | null; invoice_note: string | null; completion_note: string | null; completion_photos: string[] | null }
export function mergeCompletion(prev: CompletionRow, p: Record<string, unknown>): { ok: true; value: { invoice_amount: number | null; invoice_note: string | null; completion_note: string | null; completion_photos: string[] } } | { ok: false; reason: 'invoice_amount' } {
  const given = p.invoice_amount != null && p.invoice_amount !== ''
  const invoice = given ? Number(p.invoice_amount) : prev.invoice_amount == null || prev.invoice_amount === '' ? null : Number(prev.invoice_amount)
  if (given && (!Number.isFinite(invoice) || (invoice as number) < 0)) return { ok: false, reason: 'invoice_amount' }
  const photos = Array.isArray(p.photos) ? (p.photos as unknown[]).filter((x) => typeof x === 'string').slice(0, 12) as string[] : []
  return {
    ok: true,
    value: {
      invoice_amount: invoice,
      invoice_note: String(p.invoice_note ?? '').trim().slice(0, 1000) || prev.invoice_note || null,
      completion_note: String(p.note ?? '').trim().slice(0, 2000) || prev.completion_note || null,
      completion_photos: photos.length ? photos : prev.completion_photos ?? [],
    },
  }
}

/** Entry permission on a dispatch: an explicit choice, else what the tenant said on the ticket, else "call first" (never a silent "enter while you are out"). */
export const ENTRY_PERMISSIONS = ['anytime', 'call_first', 'tenant_present'] as const
export type EntryPermission = (typeof ENTRY_PERMISSIONS)[number]
export function resolveEntryPermission(explicit: unknown, ticket: unknown): EntryPermission {
  const ok = (v: unknown): v is EntryPermission => typeof v === 'string' && (ENTRY_PERMISSIONS as readonly string[]).includes(v)
  return ok(explicit) ? explicit : ok(ticket) ? ticket : 'call_first'
}

/** CPA 2002 s.10: an invoice may exceed the approved estimate by at most 10% unless new work was approved. */
export function invoiceWithinEstimate(approved: number | null | undefined, invoice: number | null | undefined): { ok: boolean; overBy?: number } {
  if (approved == null || invoice == null || approved <= 0) return { ok: true }
  const over = Math.round((invoice / approved - 1) * 10000) / 10000
  return over > 0.10 ? { ok: false, overBy: Math.round(over * 1000) / 10 } : { ok: true }
}

/**
 * RTA s.27(1): non-emergency entry needs written notice ≥24 h ahead naming a
 * time between 8:00 and 20:00. Returns the reason the window cannot be
 * noticed, or null when it can (emergencies pass: s.26).
 */
export function entryWindowProblem(i: { emergency: boolean; scheduleStart: string | null | undefined; scheduleEnd?: string | null }, now = new Date()): 'no_window' | 'less_than_24h' | 'outside_8_20' | null {
  if (i.emergency) return null
  if (!i.scheduleStart) return 'no_window'
  const start = new Date(i.scheduleStart)
  if (isNaN(start.getTime())) return 'no_window'
  if (start.getTime() < now.getTime() + 24 * 3_600_000) return 'less_than_24h'
  const hour = (d: Date) => Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', hour: '2-digit', hour12: false }).format(d))
  const h1 = hour(start)
  if (h1 < 8 || h1 >= 20) return 'outside_8_20'
  if (i.scheduleEnd) { const end = new Date(i.scheduleEnd); if (!isNaN(end.getTime())) { const h2 = hour(end); const m2 = Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', minute: '2-digit' }).format(end)); if (h2 < 8 || h2 > 20 || (h2 === 20 && m2 > 0)) return 'outside_8_20' } }
  return null
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

/** The tenant was formally told someone would enter; when the visit is called off they are told the same way. */
export function entryCancelText(i: { unit: string; scheduleStart?: string | null; scheduleEnd?: string | null; provider: string; scope: string; byContractor: boolean; reason?: string | null }): { subject: string; body: string } {
  const fmt = (s?: string | null) => (s ? new Date(s).toLocaleString('en-CA', { timeZone: 'America/Toronto', dateStyle: 'medium', timeStyle: 'short' }) : '待定 / TBD')
  const window = `${fmt(i.scheduleStart)} – ${fmt(i.scheduleEnd)}`
  const who = i.byContractor ? { zh: '服务商取消了这次上门', en: 'The contractor cancelled this visit' } : { zh: '房东取消了这次上门', en: 'The landlord cancelled this visit' }
  const reason = (i.reason || '').trim()
  const subject = `进入取消 · ${i.unit} · ${window} / Entry cancelled`
  const body =
    `您好，\n\n此前通知您：服务商 ${i.provider} 将于 ${window} 进入 ${i.unit} 处理「${i.scope}」。${who.zh}，届时不会有人进入，您无需为此留出时间。${reason ? `原因：${reason}` : ''}\n\n如需重新安排，您会再收到一份新的进入通知。如有疑问，请直接回复本邮件。\n\n` +
    `Hi,\n\nYou were told that ${i.provider} would enter ${i.unit} on ${window} for "${i.scope}". ${who.en}; nobody will enter at that time and you do not need to keep the window free.${reason ? ` Reason: ${reason}` : ''}\n\nIf it is rescheduled you will receive a new notice of entry. Reply to this email with any questions.`
  return { subject, body }
}

/** Six pilot metrics from the event log (services marketplace §7). */
export type WoRow = { status: WorkOrderStatus; created_at: string; quoted_at: string | null; approved_amount: number | null; invoice_amount: number | null; schedule_start: string | null; arrived_at: string | null; accepted_at: string | null; emergency: boolean }
export type ProviderMetrics = { offered: number; acceptRate: number | null; arrivalMinutesMedian: number | null; quoteVariance: number | null; reworkRate: number | null; disputeRate: number | null; responseHoursMedian: number | null; onTimeRate: number | null; firstTimeFixRate: number | null }
export function providerMetrics(rows: WoRow[]): ProviderMetrics {
  const offered = rows.length
  const accepted = rows.filter((r) => r.quoted_at).length
  const arrivals = rows.filter((r) => r.schedule_start && r.arrived_at).map((r) => (new Date(r.arrived_at!).getTime() - new Date(r.schedule_start!).getTime()) / 60_000).sort((a, b) => a - b)
  const vars = rows.filter((r) => r.approved_amount && r.invoice_amount).map((r) => r.invoice_amount! / r.approved_amount! - 1)
  const done = rows.filter((r) => ['accepted', 'paid', 'closed', 'rework', 'disputed'].includes(r.status))
  const med = (a: number[]) => (a.length ? a[Math.floor((a.length - 1) / 2)] : null)
  // 节点 3 (2026-09-26): response time (offer → quote), punctuality (arrived within
  // 15 min of the window start) and first-time fix (finished without rework or dispute).
  const responses = rows.filter((r) => r.quoted_at).map((r) => (new Date(r.quoted_at!).getTime() - new Date(r.created_at).getTime()) / 3_600_000).sort((a, b) => a - b)
  const timed = rows.filter((r) => r.schedule_start && r.arrived_at)
  const onTime = timed.filter((r) => new Date(r.arrived_at!).getTime() <= new Date(r.schedule_start!).getTime() + 15 * 60_000).length
  const fixed = done.filter((r) => ['accepted', 'paid', 'closed'].includes(r.status)).length
  return {
    offered,
    acceptRate: offered ? Math.round((accepted / offered) * 100) / 100 : null,
    arrivalMinutesMedian: med(arrivals) == null ? null : Math.round(med(arrivals)!),
    quoteVariance: vars.length ? Math.round((vars.reduce((s, v) => s + v, 0) / vars.length) * 1000) / 1000 : null,
    reworkRate: done.length ? Math.round((rows.filter((r) => r.status === 'rework').length / done.length) * 100) / 100 : null,
    disputeRate: done.length ? Math.round((rows.filter((r) => r.status === 'disputed').length / done.length) * 100) / 100 : null,
    responseHoursMedian: med(responses) == null ? null : Math.round(med(responses)! * 10) / 10,
    onTimeRate: timed.length ? Math.round((onTime / timed.length) * 100) / 100 : null,
    firstTimeFixRate: done.length ? Math.round((fixed / done.length) * 100) / 100 : null,
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
