// One state vocabulary for the objects a rental matter is made of
// (节点 1 · 可信, 2026-09-26). Every page derives what it SHOWS from here —
// the stored status column plus the dates — instead of mapping the raw
// column on its own. The reviewer's "L-46B5 starts 2026-11-01 but shows
// ACTIVE" was exactly that: five places each decided that signed_both means
// in force. Pure functions; no I/O; the same `today` convention as
// lib/lifecycle/stages.ts (UTC date-only compare).
import { parseDateOnly, todayUtc } from '@/lib/dates'

export type Bi = { zh: string; en: string }
export type Tone = 'ok' | 'warn' | 'muted' | 'default' | 'danger'

// ── Leases ────────────────────────────────────────────────────────────────
// Stored: draft → sent → signed_tenant → signed_both → active → ended
// (imported = a signed lease keyed in from paper). Displayed:
//   draft · sent · awaiting_landlord · upcoming (signed, start date ahead)
//   · active (in force today) · ended (end date passed or status ended).
export type LeaseDisplayState = 'draft' | 'sent' | 'awaiting_landlord' | 'upcoming' | 'active' | 'ended'
export type LeaseLike = { status: string | null | undefined; start_date?: string | null; end_date?: string | null }

/** Statuses that mean both parties signed (or the lease was keyed in as signed). */
export const LEASE_SIGNED_STATUSES: ReadonlySet<string> = new Set(['signed_both', 'active', 'imported', 'ended'])

export function leaseDisplayState(l: LeaseLike, today: Date = new Date()): LeaseDisplayState {
  const s = l.status ?? 'draft'
  if (s === 'ended') return 'ended'
  if (s === 'sent') return 'sent'
  if (s === 'signed_tenant') return 'awaiting_landlord'
  if (s === 'signed_both' || s === 'active' || s === 'imported') {
    const t = todayUtc(today)
    const end = parseDateOnly(l.end_date)
    if (end && end.getTime() < t.getTime()) return 'ended'
    const start = parseDateOnly(l.start_date)
    if (start && start.getTime() > t.getTime()) return 'upcoming'
    return 'active'
  }
  return 'draft'
}

/** In force today: signed, started, not ended. The only definition proactive scans and tiles may use. */
export function isLeaseInForce(l: LeaseLike, today: Date = new Date()): boolean {
  return leaseDisplayState(l, today) === 'active'
}

/** Signed by both sides (whether or not it has started). */
export function isLeaseSigned(l: LeaseLike): boolean {
  return LEASE_SIGNED_STATUSES.has(l.status ?? '')
}

export const LEASE_STATE_LABEL: Record<LeaseDisplayState, Bi & { shortZh: string; shortEn: string; tone: Tone; pill: string }> = {
  draft: { zh: '草稿', en: 'Draft', shortZh: '草稿', shortEn: 'Draft', tone: 'muted', pill: 'DRAFT' },
  sent: { zh: '待签署', en: 'Awaiting signature', shortZh: '待签署', shortEn: 'To sign', tone: 'warn', pill: 'TO SIGN' },
  awaiting_landlord: { zh: '租客已签 · 待房东回签', en: 'Tenant signed · awaiting landlord', shortZh: '待回签', shortEn: 'Countersign', tone: 'warn', pill: 'COUNTERSIGN' },
  upcoming: { zh: '已签 · 待起租', en: 'Signed · starts later', shortZh: '待起租', shortEn: 'Upcoming', tone: 'default', pill: 'SIGNED · UPCOMING' },
  active: { zh: '生效中', en: 'In force', shortZh: '生效中', shortEn: 'Active', tone: 'ok', pill: 'ACTIVE' },
  ended: { zh: '已结束', en: 'Ended', shortZh: '已结束', shortEn: 'Ended', tone: 'muted', pill: 'ENDED' },
}

/** "已签 · 11-01 起租" style detail for an upcoming lease. */
export function leaseStateDetail(l: LeaseLike, zh: boolean, today: Date = new Date()): string {
  const st = leaseDisplayState(l, today)
  if (st === 'upcoming' && l.start_date) return zh ? `已签 · ${l.start_date} 起租` : `Signed · starts ${l.start_date}`
  if (st === 'active' && l.end_date) return zh ? `生效中 · ${l.end_date} 到期` : `In force · ends ${l.end_date}`
  if (st === 'ended' && l.end_date) return zh ? `已结束 · ${l.end_date}` : `Ended · ${l.end_date}`
  return zh ? LEASE_STATE_LABEL[st].zh : LEASE_STATE_LABEL[st].en
}

// ── Applications ──────────────────────────────────────────────────────────
// Stored: status (new | scored | reviewing | approved | declined | rejected |
// withdrawn) + screened_at + decision_notified_at + archived_at (landlord).
export type ApplicationDisplayState = 'to_screen' | 'scored' | 'decided' | 'withdrawn' | 'archived'
export type ApplicationLike = { status: string | null | undefined; screened_at?: string | null; decision_notified_at?: string | null; archived_at?: string | null; ai_score?: number | null }

export function applicationDisplayState(a: ApplicationLike): ApplicationDisplayState {
  if (a.archived_at) return 'archived'
  const s = a.status ?? 'new'
  if (s === 'withdrawn') return 'withdrawn'
  if (s === 'approved' || s === 'declined' || s === 'rejected' || a.decision_notified_at) return 'decided'
  if (a.screened_at || s === 'scored' || (a.ai_score != null)) return 'scored'
  return 'to_screen'
}

/** Still moving through the funnel (not decided, not archived, not withdrawn). */
export function isApplicationOpen(a: ApplicationLike): boolean {
  const st = applicationDisplayState(a)
  return st === 'to_screen' || st === 'scored'
}

export const APPLICATION_STATE_LABEL: Record<ApplicationDisplayState, Bi & { tone: Tone }> = {
  to_screen: { zh: '待筛查', en: 'To screen', tone: 'warn' },
  scored: { zh: '已评分 · 待决定', en: 'Scored · to decide', tone: 'default' },
  decided: { zh: '已决定', en: 'Decided', tone: 'ok' },
  withdrawn: { zh: '已撤回', en: 'Withdrawn', tone: 'muted' },
  archived: { zh: '已归档', en: 'Archived', tone: 'muted' },
}

// ── Maintenance tickets ───────────────────────────────────────────────────
export type TicketState = 'new' | 'assigned' | 'in_progress' | 'review' | 'done' | 'cancelled'
export const TICKET_OPEN_STATES: ReadonlySet<string> = new Set(['new', 'assigned', 'in_progress', 'review'])
export function isTicketOpen(t: { status: string | null | undefined }): boolean {
  return TICKET_OPEN_STATES.has(t.status ?? 'new')
}
export const TICKET_STATE_LABEL: Record<TicketState, Bi & { tone: Tone }> = {
  new: { zh: '待指派', en: 'To dispatch', tone: 'warn' },
  assigned: { zh: '已派单', en: 'Dispatched', tone: 'default' },
  in_progress: { zh: '处理中', en: 'In progress', tone: 'default' },
  review: { zh: '待验收', en: 'To accept', tone: 'warn' },
  done: { zh: '已完成', en: 'Done', tone: 'ok' },
  cancelled: { zh: '已取消', en: 'Cancelled', tone: 'muted' },
}

// ── Listings ──────────────────────────────────────────────────────────────
export type ListingDisplayState = 'live' | 'pending' | 'rejected' | 'inactive'
export function listingDisplayState(l: { is_active: boolean | null | undefined; verification_status: string | null | undefined; source?: string | null }): ListingDisplayState {
  if (l.is_active === false) return 'inactive'
  if (l.verification_status === 'verified' || l.source === 'realtor') return 'live'
  if (l.verification_status === 'rejected') return 'rejected'
  return 'pending'
}
export const LISTING_STATE_LABEL: Record<ListingDisplayState, Bi & { tone: Tone }> = {
  live: { zh: '公开中', en: 'Live', tone: 'ok' },
  pending: { zh: '待核验', en: 'Awaiting verification', tone: 'warn' },
  rejected: { zh: '未通过', en: 'Rejected', tone: 'danger' },
  inactive: { zh: '已下架', en: 'Off market', tone: 'muted' },
}

// ── Screenings ────────────────────────────────────────────────────────────
export type ScreeningDisplayState = 'running' | 'scored' | 'error'
export function screeningDisplayState(s: { status: string | null | undefined }): ScreeningDisplayState {
  const st = s.status ?? ''
  if (st === 'scored') return 'scored'
  if (st === 'error') return 'error'
  return 'running'
}

// ── Rent instalments ─────────────────────────────────────────────────────
export const RENT_STATE_LABEL: Record<string, Bi & { tone: Tone }> = {
  due: { zh: '待付', en: 'Due', tone: 'warn' },
  paid: { zh: '已付', en: 'Paid', tone: 'ok' },
  late: { zh: '逾期', en: 'Late', tone: 'danger' },
  failed: { zh: '失败', en: 'Failed', tone: 'danger' },
}
export function isRentOutstanding(r: { status: string | null | undefined }): boolean {
  return r.status === 'due' || r.status === 'late'
}

// ── Booleans never reach the screen raw ───────────────────────────────────
export function yesNo(v: unknown, zh: boolean): string {
  const b = v === true || v === 'true' || v === 1 || v === '1'
  const f = v === false || v === 'false' || v === 0 || v === '0'
  if (!b && !f) return '—'
  return b ? (zh ? '是' : 'Yes') : zh ? '否' : 'No'
}
