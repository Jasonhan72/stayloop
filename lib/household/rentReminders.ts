// Rent due / overdue touchpoints · V1.0 阶段 3 甲 #4 (G11) — pure planner.
//
// Two things, both derived from the same ledger the hub (/h/[id] rent tab) and
// the landlord ledger draw: rentSchedule + ledgerStart for the periods,
// rent_payments rows for what was recorded. Nothing here is a second
// calculation of a due date.
//
//   • tenantDue — a period of a verified, active tenancy falls due in
//     RENT_DUE_PUSH_DAYS_BEFORE days (or fewer, if a sweep was missed) and
//     nobody has recorded it → one push per tenant member. Idempotent on the
//     key `rent_due:<lease>:<due>`, which the cron writes to agent_audit_events
//     (action `rent_due_pushed`, metadata.key) and passes back in.
//   • landlordOverdue — a period is RENT_OVERDUE_CARD_DAY days past due (one
//     day beyond the s.58 seven-day grace, so "overdue" here and "late" there
//     mean the same thing) and still unrecorded → one `rent_overdue` card per
//     landlord member. Approval = acknowledged; the executor only stamps.
//     One card per lease + due date, ever (any status counts as existing).
//     Only the LATEST overdue period of a lease is carded in a sweep: an
//     imported tenancy with months of unrecorded history gets one card that
//     says how many periods are open, not one card per month.
//
// Ontario leases get the s.58 count and the two N4 earliest-termination dates
// (hand / mail) as date arithmetic only — whether to serve, and how, is the
// landlord's call (LSA s.1(5): the platform picks no form and no method).
// Leases in another province get the amount and the days late, nothing else.
import { daysBetween, parseDateOnly } from '../dates'
import { PERSISTENT_LATE_COUNT, PERSISTENT_LATE_GRACE_DAYS, PERSISTENT_LATE_WINDOW_MONTHS, n4EarliestTermination, persistentLatePayment } from '../ontario/rules'
import type { ProvinceCode } from '../provinces/detect'
import { isRecordedPayment, latenessRows, ledgerStart, missedArrears, rentLedger, torontoDate, type LedgerRow } from './ledger'
import { rentSchedule } from './schedule'

export const RENT_DUE_PUSH_DAYS_BEFORE = 3
/** The first day a still-unrecorded period is carded: past the s.58 grace. */
export const RENT_OVERDUE_CARD_DAY = PERSISTENT_LATE_GRACE_DAYS + 1
export const RENT_DUE_PUSH_ACTION = 'rent_due_pushed'
/** The landlord's nudge the day after a period fell due with nothing recorded (2026-10-26): a push,
 *  no card — the s.58 card above still comes after the grace period. */
export const RENT_LATE_PUSH_ACTION = 'rent_late_pushed'
export const RENT_LATE_PUSH_FROM_DAY = 1
export const RENT_OVERDUE_ACTION_TYPE = 'rent_overdue'

export const rentDueKey = (leaseId: string, due: string) => `rent_due:${leaseId}:${due.slice(0, 10)}`
export const rentLateKey = (leaseId: string, due: string) => `rent_late:${leaseId}:${due.slice(0, 10)}`

export type ReminderHousehold = {
  id: string
  current_lease_id: string | null
  next_lease_id?: string | null
  monthly_rent: number | string | null
  rent_due_day: number | null
  start_date: string | null
  verified?: boolean | null
  status?: string | null
  address?: string | null
  unit?: string | null
  city?: string | null
}

export type ReminderLease = {
  id: string
  tenant_name?: string | null
  unit_label?: string | null
  monthly_rent?: number | string | null
  start_date?: string | null
  end_date?: string | null
  status?: string | null
  /** lib/provinces/lease leaseProvince; undefined = Ontario. */
  province?: ProvinceCode | null
}

export type ReminderRent = LedgerRow & { lease_id: string }

export type ReminderMember = { household_id: string; user_id: string; role: string; status?: string | null }

/** An existing rent_overdue card of ANY status (one per lease + due, ever). */
export type ExistingOverdueCard = { id: string; status: string; metadata: { lease_id?: unknown; due_date?: unknown } | null }

export type TenantDuePush = {
  userId: string
  householdId: string
  leaseId: string
  due: string
  amount: number
  daysUntil: number
  key: string
  unitLabel: string | null
}

export type LandlordLatePush = {
  userId: string
  householdId: string
  leaseId: string
  due: string
  amount: number
  daysLate: number
  key: string
  unitLabel: string | null
}

export type OverdueMetadata = {
  lease_id: string
  household_id: string
  due_date: string
  amount: number
  days_late: number
  /** Scheduled periods past due with nothing recorded (this one included). */
  missed_count: number
  arrears_total: number
  unit_label: string | null
  province: ProvinceCode
  stage: 'overdue'
  source: 'proactive_sweep'
  // Ontario only
  late_count_6m?: number
  persistent?: boolean
  n4_earliest_hand?: string
  n4_earliest_mail?: string
}

export type OverdueProposal = {
  user_id: string
  role: 'landlord'
  action_type: typeof RENT_OVERDUE_ACTION_TYPE
  title: string
  summary: string
  recipient_label: null
  data_scope: string[]
  excluded_data: string[]
  risk_level: 'low'
  status: 'pending'
  requires_approval: true
  metadata: OverdueMetadata
}

export type RentReminderSkip = 'not_active' | 'no_lease' | 'lease_ended' | 'no_schedule'

export type RentReminderPlan = {
  tenantDue: TenantDuePush[]
  /** The day after a due date passes unrecorded: one push per landlord member (2026-10-26). */
  landlordLate: LandlordLatePush[]
  landlordOverdue: OverdueProposal[]
  /** Pending rent_overdue cards whose period has since been recorded. */
  expire: { id: string; reason: 'period_paid' }[]
  skipped: Record<RentReminderSkip, number>
}

export type RentReminderInput = {
  households: ReminderHousehold[]
  leases: ReminderLease[]
  rentRows: ReminderRent[]
  members: ReminderMember[]
  /** Pending (and any other status) rent_overdue cards already written. */
  existingCards?: ExistingOverdueCard[]
  /** `rent_due:<lease>:<due>` and `rent_late:<lease>:<due>` keys already pushed (agent_audit_events). */
  pushedKeys?: Iterable<string>
  today?: Date
}

const num = (v: unknown): number => {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN
  return Number.isFinite(n) ? n : 0
}

const fmtMoney = (n: number) => n.toLocaleString('en-CA', { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })

function unitOf(h: ReminderHousehold, l: ReminderLease): string | null {
  const label = (l.unit_label || '').trim()
  if (label) return label
  const addr = [h.address, h.unit ? `#${h.unit}` : null].filter(Boolean).join(' ').trim()
  return addr || null
}

/** Late (>7 days) recorded payments whose due date falls in the last six months. */
export function lateCountWithin(late: string[], todayIso: string): number {
  const t = parseDateOnly(todayIso)
  if (!t) return late.length
  const floor = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() - PERSISTENT_LATE_WINDOW_MONTHS, t.getUTCDate()))
  return late.filter((d) => { const x = parseDateOnly(d); return !!x && x.getTime() >= floor.getTime() }).length
}

export function buildOverdueProposal(userId: string, meta: OverdueMetadata): OverdueProposal {
  const unit = meta.unit_label || '你的单元 / your unit'
  const ontario = meta.province === 'ON'
  const title = `租金逾期 ${meta.days_late} 天 · ${unit} · ${meta.due_date} / Rent ${meta.days_late} days overdue · ${unit} · ${meta.due_date}`
  const zh: string[] = []
  const en: string[] = []
  zh.push(`${meta.due_date} 到期的这期租金 $${fmtMoney(meta.amount)} 还没有记录到账`)
  en.push(`The $${fmtMoney(meta.amount)} rent due ${meta.due_date} has not been recorded as received`)
  if (meta.missed_count > 1) {
    zh.push(`共 ${meta.missed_count} 期未记录，合计 $${fmtMoney(meta.arrears_total)}`)
    en.push(`${meta.missed_count} periods are unrecorded, $${fmtMoney(meta.arrears_total)} in all`)
  }
  if (ontario) {
    const n = meta.late_count_6m ?? 0
    zh.push(`6 个月内已有 ${n} 次迟付超过 7 天（安省：满 ${PERSISTENT_LATE_COUNT} 次即 RTA s.58 持续迟付）${meta.persistent ? '，目前已构成持续迟付' : ''}`)
    en.push(`${n} payment${n === 1 ? '' : 's'} in the last 6 months arrived more than 7 days late (Ontario: ${PERSISTENT_LATE_COUNT} makes it persistent late payment, RTA s.58)${meta.persistent ? ' — that threshold is met' : ''}`)
    zh.push(`若今天送达 N4，终止日最早 ${meta.n4_earliest_hand}（邮寄送达 ${meta.n4_earliest_mail}）`)
    en.push(`If an N4 were served today, the earliest termination date is ${meta.n4_earliest_hand} (${meta.n4_earliest_mail} if mailed)`)
    zh.push('这只是日期算术，发不发、怎么送达由你决定')
    en.push('That is date arithmetic only — whether to serve a notice, and how, is your decision')
  } else {
    zh.push('这份租约不在安省，这里只提醒到期与逾期')
    en.push('This lease is outside Ontario, so this is a due-date reminder only')
  }
  zh.push('批准 = 知悉，不会发送任何东西')
  en.push('Approving only records that you have seen this; nothing is sent')
  return {
    user_id: userId,
    role: 'landlord',
    action_type: RENT_OVERDUE_ACTION_TYPE,
    title,
    summary: `${zh.join('。')}。 / ${en.join('. ')}.`,
    recipient_label: null,
    data_scope: ['到期日', '金额'],
    excluded_data: [],
    risk_level: 'low',
    status: 'pending',
    requires_approval: true,
    metadata: meta,
  }
}

export function planRentReminders(input: RentReminderInput): RentReminderPlan {
  const now = input.today ?? new Date()
  const todayIso = torontoDate(now)
  const today = parseDateOnly(todayIso)!
  const leaseById = new Map(input.leases.map((l) => [l.id, l]))
  const rentsByLease = new Map<string, ReminderRent[]>()
  for (const r of input.rentRows) {
    if (!r?.lease_id) continue
    rentsByLease.set(r.lease_id, [...(rentsByLease.get(r.lease_id) ?? []), r])
  }
  const membersByHousehold = new Map<string, ReminderMember[]>()
  for (const m of input.members) {
    if ((m.status ?? 'active') !== 'active') continue
    membersByHousehold.set(m.household_id, [...(membersByHousehold.get(m.household_id) ?? []), m])
  }
  // Every card ever written for a lease + due (any status): existence blocks a new one,
  // the pending ones among them expire once the period is recorded.
  const existingByKey = new Map<string, ExistingOverdueCard[]>()
  for (const c of input.existingCards ?? []) {
    const lid = typeof c.metadata?.lease_id === 'string' ? c.metadata.lease_id : null
    const due = typeof c.metadata?.due_date === 'string' ? c.metadata.due_date.slice(0, 10) : null
    if (lid && due) existingByKey.set(`${lid}:${due}`, [...(existingByKey.get(`${lid}:${due}`) ?? []), c])
  }
  const pushed = new Set(input.pushedKeys ?? [])

  const plan: RentReminderPlan = { tenantDue: [], landlordLate: [], landlordOverdue: [], expire: [], skipped: { not_active: 0, no_lease: 0, lease_ended: 0, no_schedule: 0 } }

  for (const h of input.households) {
    if (h.verified === false || (h.status ?? 'active') !== 'active') { plan.skipped.not_active++; continue }
    const lease = h.current_lease_id ? leaseById.get(h.current_lease_id) : null
    if (!lease) { plan.skipped.no_lease++; continue }
    if (lease.status === 'ended') { plan.skipped.lease_ended++; continue }
    const nextFrom = h.next_lease_id ? leaseById.get(h.next_lease_id)?.start_date ?? null : null
    const schedule = rentSchedule(ledgerStart(h.start_date, lease.start_date), h.rent_due_day, now, 1)
      .filter((p) => !nextFrom || p.due < nextFrom.slice(0, 10))
    if (!schedule.length) { plan.skipped.no_schedule++; continue }
    const rows = rentsByLease.get(lease.id) ?? []
    const ledger = rentLedger(schedule, rows, now)
    const monthlyRent = num(h.monthly_rent) || num(lease.monthly_rent)
    const amountOf = (due: string) => {
      const own = num(ledger.periods.find((p) => p.due === due)?.record?.amount)
      return own > 0 ? own : monthlyRent
    }
    const recordedDues = new Set(rows.filter(isRecordedPayment).map((r) => r.due_date.slice(0, 10)))
    const members = membersByHousehold.get(h.id) ?? []
    const unitLabel = unitOf(h, lease)

    // Cards for periods recorded since the card was written.
    for (const due of recordedDues) {
      for (const c of existingByKey.get(`${lease.id}:${due}`) ?? []) {
        if (c.status === 'pending') plan.expire.push({ id: c.id, reason: 'period_paid' })
      }
    }

    // Tenant: upcoming period within the push window, nothing recorded, not yet pushed.
    for (const p of ledger.periods) {
      if (!p.upcoming) continue
      const dueDate = parseDateOnly(p.due)
      if (!dueDate) continue
      const daysUntil = daysBetween(today, dueDate)
      if (daysUntil < 1 || daysUntil > RENT_DUE_PUSH_DAYS_BEFORE) continue
      if (recordedDues.has(p.due)) continue
      const key = rentDueKey(lease.id, p.due)
      if (pushed.has(key)) continue
      for (const m of members) {
        if (m.role !== 'tenant') continue
        plan.tenantDue.push({ userId: m.user_id, householdId: h.id, leaseId: lease.id, due: p.due, amount: amountOf(p.due), daysUntil, key, unitLabel })
      }
    }

    // Landlord, the day after: the latest period that fell due 1..7 days ago with nothing
    // recorded gets one push per landlord member (once per lease + due). Information only.
    const fresh = ledger.missed
      .map((due) => ({ due, daysLate: daysBetween(parseDateOnly(due)!, today) }))
      .filter((x) => x.daysLate >= RENT_LATE_PUSH_FROM_DAY && x.daysLate < RENT_OVERDUE_CARD_DAY)
      .sort((a, b) => (a.due < b.due ? 1 : -1))[0]
    if (fresh && !pushed.has(rentLateKey(lease.id, fresh.due))) {
      for (const m of members) {
        if (m.role !== 'landlord') continue
        plan.landlordLate.push({ userId: m.user_id, householdId: h.id, leaseId: lease.id, due: fresh.due, amount: amountOf(fresh.due), daysLate: fresh.daysLate, key: rentLateKey(lease.id, fresh.due), unitLabel })
      }
    }

    // Landlord: the latest scheduled period past the grace period with nothing recorded.
    const overdue = ledger.missed
      .map((due) => ({ due, daysLate: daysBetween(parseDateOnly(due)!, today) }))
      .filter((x) => x.daysLate >= RENT_OVERDUE_CARD_DAY)
      .sort((a, b) => (a.due < b.due ? 1 : -1))
    const latest = overdue[0]
    if (!latest) continue
    if (existingByKey.has(`${lease.id}:${latest.due}`)) continue
    const landlords = members.filter((m) => m.role === 'landlord')
    if (!landlords.length) continue
    const province: ProvinceCode = lease.province ?? 'ON'
    const base: OverdueMetadata = {
      lease_id: lease.id,
      household_id: h.id,
      due_date: latest.due,
      amount: amountOf(latest.due),
      days_late: latest.daysLate,
      missed_count: ledger.missed.length,
      arrears_total: missedArrears(ledger, monthlyRent),
      unit_label: unitLabel,
      province,
      stage: 'overdue',
      source: 'proactive_sweep',
    }
    if (province === 'ON') {
      // s.58 counts rent RECEIVED late — recorded rows only; the open period is arrears, not lateness yet.
      const lateness = persistentLatePayment(latenessRows(ledger.recordedRows), today)
      base.late_count_6m = lateCountWithin(lateness.late, todayIso)
      base.persistent = lateness.persistent
      base.n4_earliest_hand = n4EarliestTermination(todayIso, 'hand')
      base.n4_earliest_mail = n4EarliestTermination(todayIso, 'mail')
    }
    for (const m of landlords) plan.landlordOverdue.push(buildOverdueProposal(m.user_id, base))
  }
  return plan
}

/** The push a landlord gets the day after rent fell due with nothing recorded. */
export function landlordLatePush(p: LandlordLatePush): { title: string; body: string; url: string } {
  const unit = p.unitLabel ? ` · ${p.unitLabel}` : ''
  const when = p.daysLate === 1 ? '昨天' : `${p.daysLate} 天前`
  const whenEn = p.daysLate === 1 ? 'yesterday' : `${p.daysLate} days ago`
  return {
    title: `租金${when}到期，还没记收 · $${fmtMoney(p.amount)}${unit} / Rent due ${whenEn}, nothing recorded`,
    body: `${p.due} 到期。收到了就记一笔；没收到可以先发一句温和提醒 / Due ${p.due}. Record it if received; otherwise a friendly reminder first`,
    url: `/h/${p.householdId}?tab=rent`,
  }
}

/** The push a tenant gets a few days before rent is due. */
export function tenantDuePush(p: TenantDuePush): { title: string; body: string; url: string } {
  const unit = p.unitLabel ? ` · ${p.unitLabel}` : ''
  return {
    title: `租金 ${p.daysUntil} 天后到期 · $${fmtMoney(p.amount)} / Rent due in ${p.daysUntil} day${p.daysUntil === 1 ? '' : 's'}`,
    body: `${p.due} 到期${unit}。付了以后在共享中心记一下 / Due ${p.due}${unit}. Record it on the shared hub once paid`,
    url: `/h/${p.householdId}?tab=rent`,
  }
}
