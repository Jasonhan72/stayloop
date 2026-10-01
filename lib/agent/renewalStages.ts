// Renewal touchpoints — 90 / 60 / 30 days before a lease ends (2026-09-22,
// EliseAI benchmark item F). Pure planner shared by both entry modes of
// /api/agent/proactive (user JWT + cron). Given the landlord's leases in the
// renewal window and every renewal-related action already proposed, it
// returns the pending actions that are still missing:
//
//   90d  (≤120 days)  send_renewal_letter — A/B rent options + TRREB market
//                     line; on approval the letter is really sent.
//   60d  (≤60 days)   renewal_checkpoint stage=60d — only when the letter was
//                     never sent: the N1 service deadline is close, the
//                     landlord acknowledges the card (executor just stamps it).
//   30d  (≤30 days)   send_message to the tenant asking for their intent —
//                     only when the letter WAS sent and the tenant has not
//                     answered yet (otherwise a 30d checkpoint says "call
//                     the tenant yourself", or names the recorded answer).
//
// Idempotency is by (lease_id, stage): each stage is proposed at most once
// per lease, ever — decided or not, we never re-nag.
//
// Sweep 2026-10-01: "sent" means the executor stamped a successful send
// (approval alone is not delivery — the tab can close inside the 60 s undo
// window, or the send can fail); a lease with a signed successor on the same
// unit gets no touchpoints; the tenant's own recorded intent (renewal_intents)
// replaces the questions it already answers.
import { daysBetween, isoDate, parseDateOnly, todayUtc } from '@/lib/dates'
import { rentAmount } from './chatCopy'
import { N1_NOTICE_DAYS, guidelineFor, n1DeadlineFor } from '@/lib/ontario/rules'

// The guideline is per calendar year of the increase's effective date (RTA
// s.120; 2026 = 2.1%, 2027 = 1.9%) — see lib/ontario/rules.ts RENT_GUIDELINE.
// A renewal increase takes effect when the current term ends.
export const WINDOW_DAYS = 120
// One source for the N1 lead time (lib/ontario/rules) — the deadline dates already come from n1DeadlineFor.
export const NOTICE_DAYS = N1_NOTICE_DAYS

export type RenewalStage = '90d' | '60d' | '30d'

export type RenewalLease = {
  id: string
  /** The managed tenancy created from this lease, when one exists — the 30-day email links the tenant to /h/<id>?intent=… */
  household_id?: string | null
  landlord_id?: string | null
  listing_id?: string | null
  tenant_name: string | null
  tenant_email: string | null
  unit_label: string | null
  monthly_rent: number | string | null
  start_date?: string | null
  end_date: string
}

export type ExistingRenewalAction = {
  /** Present when the caller selected it — needed to expire moot cards (staleRenewalCards). */
  id?: string
  action_type: string
  status: string
  metadata: { lease_id?: string; stage?: string; source?: string } | null
  executed_at?: string | null
  /** `by` marks a card this planner expired (STALE_EXPIRED_BY). */
  execution_result?: { ok?: unknown; reason?: unknown; by?: unknown } | null
}

/**
 * The one definition of "the renewal letter went out" (contract C8): the
 * executor stamped executed_at AND a successful result. An approved card
 * whose send never ran (tab closed in the undo window) or failed is not sent.
 */
export function renewalLetterSent(a: { action_type: string; executed_at?: string | null; execution_result?: { ok?: unknown } | null }): boolean {
  return a.action_type === 'send_renewal_letter' && !!a.executed_at && a.execution_result?.ok === true
}

// Statuses that mean a lease is signed and can be in force (lib/matters/states
// LEASE_SIGNED_STATUSES minus 'ended'); `imported` = a signed lease keyed in
// from paper. Proactive scans select these, then keep only isLeaseInForce.
export const IN_FORCE_STATUSES = ['signed_both', 'active', 'imported'] as const
// A later lease on the same unit supersedes the current one once the tenant
// has signed it (signed_tenant) — the renewal question is answered.
export const SUCCESSOR_STATUSES = ['signed_tenant', 'signed_both', 'active', 'imported'] as const

export type LeaseSlot = {
  id: string
  landlord_id?: string | null
  unit_label?: string | null
  listing_id?: string | null
  tenant_email?: string | null
  start_date?: string | null
  end_date?: string | null
  status?: string | null
}

const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase()

/** Same rentable unit: the listing when both came from one, else the unit label (the relist sweep's key), else the tenant e-mail. */
export function sameUnit(a: LeaseSlot, b: LeaseSlot): boolean {
  if (a.landlord_id && b.landlord_id && a.landlord_id !== b.landlord_id) return false
  if (a.listing_id && b.listing_id) return a.listing_id === b.listing_id
  if (norm(a.unit_label) && norm(b.unit_label)) return norm(a.unit_label) === norm(b.unit_label)
  if (norm(a.tenant_email) && norm(b.tenant_email)) return norm(a.tenant_email) === norm(b.tenant_email)
  return false
}

/**
 * A signed lease on the same unit that starts after this one started (or, for
 * rows without a start date, on/after this one's end) — the tenancy was
 * already renewed or re-let, so 90/60/30 touchpoints for `l` are moot.
 */
export function successorLease(l: LeaseSlot, others: LeaseSlot[]): LeaseSlot | null {
  if (!l.end_date) return null
  const after = l.start_date || l.end_date
  for (const o of others) {
    if (o.id === l.id || !o.start_date) continue
    if (!(SUCCESSOR_STATUSES as readonly string[]).includes(o.status ?? '')) continue
    const later = l.start_date ? o.start_date > after : o.start_date >= after
    if (later && sameUnit(l, o)) return o
  }
  return null
}

/**
 * Rent on `onDate` is owed under a newer lease on the same unit that is in
 * force by then (IN_FORCE_STATUSES, started on or before `onDate`). A
 * successor the tenant has only signed (signed_tenant) is not in force and
 * does not take the reminder away from the lease that still is.
 */
export function replacedInForceBy(l: LeaseSlot, others: LeaseSlot[], onDate: string): boolean {
  const after = l.start_date || l.end_date || ''
  return others.some((o) => {
    if (o.id === l.id || !o.start_date || o.start_date > onDate) return false
    if (!(IN_FORCE_STATUSES as readonly string[]).includes(o.status ?? '')) return false
    const later = l.start_date ? o.start_date > after : o.start_date >= after
    return later && sameUnit(l, o)
  })
}

export type RenewalIntent = { lease_id: string | null; household_id: string | null; intent: string; created_at: string }

/** The tenant's newest recorded answer for this lease (renewal_intents written from /h/<id>). */
export function latestIntentFor(l: { id: string; household_id?: string | null }, intents: RenewalIntent[]): RenewalIntent | null {
  let best: RenewalIntent | null = null
  for (const i of intents) {
    const mine = i.lease_id ? i.lease_id === l.id : !!l.household_id && i.household_id === l.household_id
    if (!mine || !['renew', 'leave', 'negotiate'].includes(i.intent)) continue
    if (!best || i.created_at > best.created_at) best = i
  }
  return best
}

const INTENT_ZH: Record<string, string> = { renew: '续约', leave: '搬离', negotiate: '想谈谈条件' }

export type MarketLine = { period: string; avg_by_bed: Record<number, number> }

export type RenewalProposal = {
  user_id: string
  role: 'landlord'
  action_type: 'send_renewal_letter' | 'renewal_checkpoint' | 'send_message'
  title: string
  summary: string
  recipient_label: string | null
  data_scope: string[]
  excluded_data: string[]
  risk_level: 'low' | 'medium' | 'high'
  status: 'pending'
  requires_approval: true
  metadata: Record<string, unknown>
}

export function stageForDays(daysToEnd: number): RenewalStage | null {
  if (daysToEnd < 0) return null
  if (daysToEnd <= 30) return '30d'
  if (daysToEnd <= 60) return '60d'
  if (daysToEnd <= WINDOW_DAYS) return '90d'
  return null
}

export function marketLineText(m: MarketLine | null | undefined): string {
  if (!m) return ''
  const parts = [1, 2, 3]
    .filter((b) => Number.isFinite(m.avg_by_bed[b]))
    .map((b) => `${b === 3 ? '3+' : b} 房 $${Math.round(m.avg_by_bed[b]).toLocaleString()}`)
  if (!parts.length) return ''
  return `TRREB ${m.period} 均租：${parts.join(' · ')}。`
}

// Same figure as the card's buttons, the executed line and the letter: a
// guideline increase on $2,800 is $2,853.20, not "$2,853" here and "$2,853.20" there.
const fmt = rentAmount

export function buildRenewalProposal(userId: string, l: RenewalLease, today: Date, market?: MarketLine | null): RenewalProposal {
  const rent = Number(l.monthly_rent) || 0
  // The increase takes effect the day after the term ends (a lease ending
  // Dec 31 gets next year's guideline). Review 2026-09-23.
  const g = guidelineFor(isoDate(new Date((parseDateOnly(l.end_date) ?? todayUtc(today)).getTime() + 86_400_000)))
  const raised = Math.round(rent * (1 + g.pct / 100) * 100) / 100
  const end = parseDateOnly(l.end_date) ?? todayUtc(today)
  // Same clock as the lifecycle rail: the increase takes effect the day after
  // the term ends and the N1 must land 90 days before THAT day (RTA s.116) —
  // the card said 09-20 while the rail said 09-21 (walk-through 2026-09-25).
  const noticeDeadline = new Date(`${n1DeadlineFor(isoDate(new Date(end.getTime() + 86_400_000)))}T00:00:00Z`)
  const daysToEnd = daysBetween(todayUtc(today), end)
  const tenant = l.tenant_name || '租客'
  const mkt = marketLineText(market)
  return {
    user_id: userId,
    role: 'landlord',
    action_type: 'send_renewal_letter',
    title: `续约窗口 · 90 天触点：${tenant} · ${l.end_date} 到期（还有 ${daysToEnd} 天）`,
    summary:
      `${l.unit_label || '你的单元'} 月租 $${fmt(rent)}。` +
      `方案 A 不涨续约；方案 B 按 ${g.year} 年指导上限 +${g.pct}% → $${fmt(raised)}` +
      (g.published ? '' : `（${g.year} 年指导比例尚未公布，暂按最新已公布值）`) +
      `（2018-11-15 后首次入住的单位不受上限约束）。` +
      (mkt ? `${mkt}` : '') +
      `N1/N2 需提前 ${NOTICE_DAYS} 天送达 — 最晚 ${isoDate(noticeDeadline)}。批准后我会把续约函真实发送给 ${l.tenant_email || tenant}。`,
    recipient_label: l.tenant_email || tenant,
    data_scope: ['租约条款摘要', '续约方案', '同区行情'],
    excluded_data: ['筛查报告', '收入证明原件'],
    risk_level: 'medium',
    status: 'pending',
    requires_approval: true,
    metadata: {
      lease_id: l.id,
      stage: '90d',
      tenant_name: l.tenant_name,
      tenant_email: l.tenant_email,
      unit_label: l.unit_label,
      current_rent: rent,
      guideline_rent: raised,
      guideline_pct: g.pct,
      guideline_year: g.year,
      end_date: l.end_date,
      notice_deadline: isoDate(noticeDeadline),
      market: market ? { period: market.period, avg_by_bed: market.avg_by_bed } : null,
      source: 'proactive_sweep',
    },
  }
}

export type CheckpointContext = {
  /** The 90d letter really went out (renewalLetterSent). */
  letterSent?: boolean
  /** The 90d letter card is still waiting for approval. */
  letterPending?: boolean
  /** The 90d letter was approved but never ran — the to-do list still offers 「现在执行」 on it. */
  letterApprovedUnsent?: boolean
  /** The tenant's newest recorded answer, if any. */
  intent?: RenewalIntent | null
}

export function buildCheckpointProposal(userId: string, l: RenewalLease, today: Date, stage: '60d' | '30d', ctx: CheckpointContext = {}): RenewalProposal {
  const end = parseDateOnly(l.end_date) ?? todayUtc(today)
  // Same clock as the lifecycle rail: the increase takes effect the day after
  // the term ends and the N1 must land 90 days before THAT day (RTA s.116) —
  // the card said 09-20 while the rail said 09-21 (walk-through 2026-09-25).
  const noticeDeadline = new Date(`${n1DeadlineFor(isoDate(new Date(end.getTime() + 86_400_000)))}T00:00:00Z`)
  const daysToEnd = daysBetween(todayUtc(today), end)
  const daysToNotice = daysBetween(todayUtc(today), noticeDeadline)
  const tenant = l.tenant_name || '租客'
  const unit = l.unit_label || '你的单元'
  const intent = ctx.intent ?? null
  const said = intent ? `${tenant} 在 ${intent.created_at.slice(0, 10)} 表示「${INTENT_ZH[intent.intent] ?? intent.intent}」。` : ''
  // Only the card that is really still waiting may be called "still approvable".
  const letterCard = ctx.letterPending
    ? '上方 90 天那张卡仍可批准发送续约函。'
    : ctx.letterApprovedUnsent
      ? '90 天那张续约函已批准但没有发出，可在待办里点「现在执行」。'
      : '90 天那张续约函没有发出（已拒绝、已过期或发送未完成）。'
  let summary: string
  let title: string
  if (stage === '60d') {
    title = `续约窗口 · 60 天触点：${tenant} · N1 截止 ${isoDate(noticeDeadline)}`
    summary = `${unit} 的租约 ${l.end_date} 到期，续约函还没有发出。` + said +
      (daysToNotice >= 0
        ? `涨租的 N1 通知最晚 ${isoDate(noticeDeadline)} 送达（还有 ${daysToNotice} 天）。`
        : `涨租的 N1 通知 90 天期限（${isoDate(noticeDeadline)}）已过：到期日起先按原租金续约或转为月租，要涨租需另定更晚的生效日并重新送达 N1（距上次涨租满 12 个月）。`) +
      `到期不续签会自动转为月租（RTA s.38）。${letterCard}点「批准」表示你已知悉。`
  } else if (intent?.intent === 'negotiate') {
    title = `续约窗口 · 30 天触点：${tenant} · 想谈谈续约条件`
    summary = `${unit} 的租约 ${l.end_date} 到期（还有 ${daysToEnd} 天）。${said}` +
      `建议直接联系 TA 把条款谈定；到期不续签会按 RTA s.38 自动转为月租。点「批准」表示你已知悉。`
  } else if (intent?.intent === 'renew') {
    title = `续约窗口 · 30 天触点：${tenant} · 已表示续约`
    summary = `${unit} 的租约 ${l.end_date} 到期（还有 ${daysToEnd} 天）。${said}续约函没有发出，` +
      `到期不签新租约会按 RTA s.38 自动转为月租；如需新的固定租期，请直接与 TA 确认条款。点「批准」表示你已知悉。`
  } else {
    title = `续约窗口 · 30 天触点：${tenant} · 请直接联系确认去留`
    summary = ctx.letterSent
      ? `${unit} 的租约 ${l.end_date} 到期（还有 ${daysToEnd} 天）。续约函已发出，还没有收到 ${tenant} 的意向；租约上没有租客邮箱，无法发邮件询问。` +
        `建议直接致电或短信确认去留，好安排空置期。点「批准」表示你已知悉。`
      : `${unit} 的租约 ${l.end_date} 到期（还有 ${daysToEnd} 天），续约函没有发出、也没有收到 ${tenant} 的意向。` +
        `建议直接致电或短信确认去留，好安排空置期。点「批准」表示你已知悉。`
  }
  return {
    user_id: userId,
    role: 'landlord',
    action_type: 'renewal_checkpoint',
    title,
    summary,
    recipient_label: null,
    data_scope: ['租约到期日'],
    excluded_data: ['筛查报告', '收入证明原件'],
    risk_level: 'low',
    status: 'pending',
    requires_approval: true,
    metadata: {
      lease_id: l.id,
      stage,
      tenant_name: l.tenant_name,
      tenant_email: l.tenant_email,
      unit_label: l.unit_label,
      end_date: l.end_date,
      notice_deadline: isoDate(noticeDeadline),
      ...(intent ? { tenant_intent: intent.intent, tenant_intent_at: intent.created_at } : {}),
      source: 'proactive_sweep',
    },
  }
}

/** One-click intent links (P1 2026-09-23): the tenant answers on their own hub; both sides then see the row. */
export function intentLinks(householdId: string | null | undefined, lang: 'zh' | 'en'): string {
  if (!householdId) return ''
  const base = `${(process.env.NEXT_PUBLIC_SITE_URL || 'https://www.stayloop.ai').replace(/\/$/, '')}/h/${householdId}?intent=`
  return lang === 'zh'
    ? `一键回复（登录后记录，房东同步可见）：\n  续约 → ${base}renew\n  计划搬离 → ${base}leave\n  想谈谈条件 → ${base}negotiate\n\n`
    : `Reply with one click (recorded on sign-in, visible to your landlord):\n  Renew → ${base}renew\n  Plan to move out → ${base}leave\n  Discuss terms → ${base}negotiate\n\n`
}

export function buildIntentAskProposal(userId: string, l: RenewalLease, today: Date): RenewalProposal {
  const end = parseDateOnly(l.end_date) ?? todayUtc(today)
  const daysToEnd = daysBetween(todayUtc(today), end)
  const tenant = l.tenant_name || '租客'
  const unit = l.unit_label || '你的单元'
  const body =
    `${tenant} 您好，\n\n${unit} 的租约将于 ${l.end_date} 到期（还有 ${daysToEnd} 天）。此前已把续约方案发给您，` +
    `为了安排接下来的事项，想请您在方便时回复一下：是否续约、或计划搬离的日期。\n\n` +
    `按安省《住宅租赁法》，租约到期不续签会自动转为月租，您的权利不受影响；搬离需提前 60 天以 N9 表格书面通知。\n\n` +
    intentLinks(l.household_id, 'zh') +
    `谢谢！\n\n` +
    `Hi ${tenant},\n\nThe lease for ${unit} ends on ${l.end_date} (${daysToEnd} days from now). We sent the renewal options earlier — ` +
    `when convenient, could you let us know whether you plan to renew or your intended move-out date?\n\n` +
    `Under Ontario's RTA a lease that is not renewed continues month-to-month with your rights unchanged; moving out needs 60 days' written notice (Form N9).\n\n` +
    intentLinks(l.household_id, 'en') +
    `Thank you!`
  return {
    user_id: userId,
    role: 'landlord',
    action_type: 'send_message',
    title: `续约窗口 · 30 天触点：向 ${tenant} 确认续约意向`,
    summary:
      `续约函已发出、还没有回音。批准后我会给 ${l.tenant_email} 发一封双语邮件，请 ${tenant} 回复是否续约或搬离日期。`,
    recipient_label: l.tenant_email,
    data_scope: ['租约到期日', '续约意向询问'],
    excluded_data: ['筛查报告', '续约方案金额'],
    risk_level: 'low',
    status: 'pending',
    requires_approval: true,
    metadata: {
      lease_id: l.id,
      stage: '30d',
      to_email: l.tenant_email,
      subject: `续约意向确认 · ${unit} · ${l.end_date} 到期 / Renewal intent · ${unit}`,
      body,
      tenant_name: l.tenant_name,
      tenant_email: l.tenant_email,
      unit_label: l.unit_label,
      end_date: l.end_date,
      source: 'proactive_sweep',
    },
  }
}

// Cards this planner expired because the lease was renewed another way or the
// tenant said they are leaving (staleRenewalCards → STALE_EXPIRED_BY). Those
// reasons can stop being true (the successor is voided, the tenant changes
// their answer), so such a card does not count as "already proposed". A card
// the executor refused (409) stays proposed: its blocker check is not this
// one, and reviving it would re-propose a card the executor refuses again.
export const STALE_EXPIRED_BY = 'renewal_planner'
const REVIVABLE_REASONS = new Set(['lease_superseded', 'tenant_leaving'])
// A renewal letter that expired on a clock — an approval that never ran for a
// week, a pending card past its expiry, an interrupted countdown — was never
// refused by the landlord. Only the sweep proposes letters (chat cannot), so
// such a card must not count as "proposed" or no letter could ever be sent for
// that lease again; the next sweep proposes a fresh one with current figures
// (review 2026-10-01). A letter the landlord rejected stays decided.
const CLOCK_EXPIRED_LETTER = new Set(['stale_approval', 'expired', 'interrupted'])
function revivable(a: ExistingRenewalAction): boolean {
  const r = a.execution_result
  if (a.status !== 'expired' || a.executed_at) return false
  if (r?.by === STALE_EXPIRED_BY && typeof r.reason === 'string' && REVIVABLE_REASONS.has(r.reason)) return true
  return a.action_type === 'send_renewal_letter' && typeof r?.reason === 'string' && CLOCK_EXPIRED_LETTER.has(r.reason)
}

/** Why the planner proposes nothing for this lease, or null. Same checks, same order as planRenewalActions. */
export function renewalSkipReason(l: RenewalLease, ctx: { laterLeases?: LeaseSlot[]; intents?: RenewalIntent[] } = {}): 'lease_superseded' | 'tenant_leaving' | null {
  if (successorLease(l, ctx.laterLeases ?? [])) return 'lease_superseded'
  if (latestIntentFor(l, ctx.intents ?? [])?.intent === 'leave') return 'tenant_leaving'
  return null
}

/** A renewal touchpoint card about this lease: the letter, a checkpoint, or the 30-day intent ask. */
function isTouchpointCard(a: ExistingRenewalAction): boolean {
  if (a.action_type === 'send_renewal_letter' || a.action_type === 'renewal_checkpoint') return true
  return a.action_type === 'send_message' && a.metadata?.stage === '30d'
}

/**
 * Cards already in the landlord's to-do that the planner would no longer
 * propose: the lease was renewed / re-let, or the tenant said they are
 * leaving. A pending letter would still say 「批准后我会把续约函真实发送」 and a
 * 30d checkpoint 「也没有收到意向」; approving the letter only earns a 409.
 * Only cards that never ran (executed_at null) and still await a person.
 */
export type StaleRenewalReason = 'lease_superseded' | 'tenant_leaving' | 'tenant_answered'
export function staleRenewalCards(
  leases: RenewalLease[],
  existing: ExistingRenewalAction[],
  ctx: { laterLeases?: LeaseSlot[]; intents?: RenewalIntent[] } = {},
): { id: string; reason: StaleRenewalReason }[] {
  const reasonByLease = new Map<string, 'lease_superseded' | 'tenant_leaving'>()
  // Any recorded answer makes the 30-day "are you renewing?" ask moot (review 2026-10-01).
  const answered = new Set<string>()
  for (const l of leases) {
    const r = renewalSkipReason(l, ctx)
    if (r) reasonByLease.set(l.id, r)
    if (latestIntentFor(l, ctx.intents ?? [])) answered.add(l.id)
  }
  const out: { id: string; reason: StaleRenewalReason }[] = []
  for (const a of existing) {
    const lid = a.metadata?.lease_id
    if (!lid || !a.id || a.executed_at || !isTouchpointCard(a)) continue
    if (a.status !== 'pending' && a.status !== 'approved') continue
    const reason = reasonByLease.get(lid)
    if (reason) out.push({ id: a.id, reason })
    else if (a.action_type === 'send_message' && a.metadata?.stage === '30d' && answered.has(lid)) out.push({ id: a.id, reason: 'tenant_answered' })
  }
  return out
}

/**
 * The planner. `existing` must contain every renewal-related action already
 * proposed for the leases in question (any status, with executed_at /
 * execution_result). Returns the proposals to insert, in lease order, at most
 * one per lease per stage.
 *
 * `ctx.laterLeases` — the landlord's other signed leases (successor check);
 * `ctx.intents` — renewal_intents rows for these leases / households.
 */
export function planRenewalActions(
  userId: string,
  leases: RenewalLease[],
  existing: ExistingRenewalAction[],
  today: Date,
  market?: MarketLine | null,
  ctx: { laterLeases?: LeaseSlot[]; intents?: RenewalIntent[] } = {},
): RenewalProposal[] {
  const seen = new Set<string>()
  const letterSent = new Set<string>()
  const letterPending = new Set<string>()
  const letterApprovedUnsent = new Set<string>()
  for (const a of existing) {
    const lid = a.metadata?.lease_id
    if (!lid || revivable(a)) continue
    // Legacy rows (before stages) have no `stage`; a renewal letter without a
    // stage is the 90d touchpoint.
    const stage = a.metadata?.stage ?? (a.action_type === 'send_renewal_letter' ? '90d' : null)
    if (stage) seen.add(`${lid}:${stage}`)
    if (renewalLetterSent(a)) letterSent.add(lid)
    if (a.action_type === 'send_renewal_letter' && a.status === 'pending') letterPending.add(lid)
    if (a.action_type === 'send_renewal_letter' && a.status === 'approved' && !a.executed_at) letterApprovedUnsent.add(lid)
  }
  const later = ctx.laterLeases ?? []
  const intents = ctx.intents ?? []
  const out: RenewalProposal[] = []
  for (const l of leases) {
    const end = parseDateOnly(l.end_date)
    if (!end) continue
    const days = daysBetween(todayUtc(today), end)
    const stage = stageForDays(days)
    if (!stage) continue
    // Renewed or re-let already (a signed lease on the same unit starts
    // later), or the tenant said they are leaving — no renewal offer, no N1
    // nudge, no "are you staying?" question. The re-list prompt follows the
    // end date. Cards already proposed are expired by staleRenewalCards.
    if (renewalSkipReason(l, { laterLeases: later, intents })) continue
    const intent = latestIntentFor(l, intents)
    // 90d — always the first touchpoint, even when the lease enters the
    // window late (e.g. imported at 50 days): the letter is the action that
    // matters, the checkpoints only make sense on top of it.
    if (!seen.has(`${l.id}:90d`)) {
      out.push(buildRenewalProposal(userId, l, today, market))
      seen.add(`${l.id}:90d`)
      // Nothing else for this lease this run — give the landlord one card.
      continue
    }
    const cctx: CheckpointContext = { letterSent: letterSent.has(l.id), letterPending: letterPending.has(l.id), letterApprovedUnsent: !letterSent.has(l.id) && letterApprovedUnsent.has(l.id), intent }
    if (stage === '60d' && !seen.has(`${l.id}:60d`) && !letterSent.has(l.id)) {
      out.push(buildCheckpointProposal(userId, l, today, '60d', cctx))
      seen.add(`${l.id}:60d`)
    }
    if (stage === '30d' && !seen.has(`${l.id}:30d`)) {
      // The tenant already answered "renew" after a sent letter — nothing left to ask.
      if (intent?.intent === 'renew' && letterSent.has(l.id)) continue
      out.push(letterSent.has(l.id) && l.tenant_email && !intent
        ? buildIntentAskProposal(userId, l, today)
        : buildCheckpointProposal(userId, l, today, '30d', cctx))
      seen.add(`${l.id}:30d`)
    }
  }
  return out
}

/** Latest TRREB quarter → market line, from trreb_rent_stats rows. */
export function marketFromRows(rows: { period: string; bed_type: number; avg_rent: number | string }[] | null | undefined): MarketLine | null {
  if (!rows || !rows.length) return null
  // Periods sort lexically ('2026 Q1' < '2026 Q2'); pick the latest.
  const latest = rows.map((r) => r.period).sort().at(-1)!
  const avg_by_bed: Record<number, number> = {}
  for (const r of rows) if (r.period === latest) avg_by_bed[r.bed_type] = Number(r.avg_rent)
  return { period: latest, avg_by_bed }
}
