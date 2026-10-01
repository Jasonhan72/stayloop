// Rent ledger view for the household hub — pure.
//
// rent_payments holds two kinds of rows: what someone recorded ('paid' /
// 'late', with paid_at) and system placeholders ('due', no paid_at — the
// e-sign flow writes one for the first month). A placeholder is NOT a record:
// it must render as 待付 with a Mark-paid button, count as unpaid once past
// due, and never feed the s.58 late-payment count (that definition is about
// rent *received* more than seven days late — sweep 2026-10-01).
import { rentSchedule, type RentPeriod } from './schedule'
import { isoDate, parseDateOnly, todayUtc } from '../dates'

export type LedgerRow = { due_date: string; status: string | null; paid_at: string | null; amount?: number | string | null }
export type PeriodState = 'paid' | 'late' | 'due' | 'upcoming'
export type LedgerPeriod<R extends LedgerRow> = {
  due: string
  upcoming: boolean
  state: PeriodState
  /** False for a row on a date the schedule does not produce (the e-sign placeholder on a mid-month start). */
  onSchedule: boolean
  /** The row behind a recorded period, or the placeholder behind a 'due' one. */
  record: R | null
  canMarkPaid: boolean
}

export function isRecordedPayment(r: { status?: string | null }): boolean {
  return r.status === 'paid' || r.status === 'late'
}

const TORONTO_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit' })

/** Calendar date in Toronto (YYYY-MM-DD) — the day a payment was made, the day a tenant sees. */
export function torontoDate(at: Date | string = new Date()): string {
  const d = typeof at === 'string' ? new Date(at) : at
  if (isNaN(d.getTime())) return ''
  const parts = Object.fromEntries(TORONTO_DAY.formatToParts(d).map((p) => [p.type, p.value]))
  return `${parts.year}-${parts.month}-${parts.day}`
}

/**
 * The schedule starts at the CURRENT lease's term. A renewal attaches to the existing
 * household (current_lease_id switches on the new term's start date — until then it waits
 * in next_lease_id — and households.start_date keeps the original start),
 * and rent_payments are read for the current lease only — scheduling from the household
 * start would list every period of the previous term as unpaid (review 2026-10-01).
 */
export function ledgerStart(householdStart: string | null | undefined, leaseStart: string | null | undefined): string | null {
  const a = householdStart ? householdStart.slice(0, 10) : null
  const b = leaseStart ? leaseStart.slice(0, 10) : null
  if (a && b) return a > b ? a : b
  return a ?? b
}

/** A rent due day from lease terms (1–31, whole), or null when absent / unusable. */
export function rentDueDay(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v.trim()) : typeof v === 'number' ? v : NaN
  return Number.isInteger(n) && n >= 1 && n <= 31 ? n : null
}

/**
 * The first scheduled due date on/after the lease start (due day from the terms,
 * default 1) — where the e-sign first-month placeholder belongs. Taken from the
 * hub's own schedule, so the placeholder is a real period (onSchedule), not a
 * full month's rent parked on a mid-month start date (B1 2026-10-01).
 */
export function firstDueDate(startDate: string | null | undefined, dueDay?: number | null): string | null {
  const start = parseDateOnly(startDate ?? null)
  if (!start) return null
  const periods = rentSchedule(isoDate(start), rentDueDay(dueDay) ?? 1, start, 1)
  return periods.length ? periods[periods.length - 1].due : null
}

/**
 * Recorded rows with paid_at reduced to the Toronto calendar day of payment, as a UTC
 * midnight — the same footing persistentLatePayment gives the due date. Without this a
 * payment made on day 7 (noon Toronto = 16:00 UTC) reads as "more than 7 days late".
 */
export function latenessRows<R extends LedgerRow>(rows: R[]): R[] {
  return rows.filter(isRecordedPayment).map((r) => {
    const day = r.paid_at ? torontoDate(r.paid_at) : ''
    return day ? { ...r, paid_at: `${day}T00:00:00.000Z` } : r
  })
}

export function rentLedger<R extends LedgerRow>(
  schedule: RentPeriod[],
  payments: R[],
  now: Date = todayUtc(),
): { periods: LedgerPeriod<R>[]; missed: string[]; recordedRows: R[]; dueSoFar: number; recordedSoFar: number } {
  const today = isoDate(todayUtc(now))
  const byDue = new Map<string, R>()
  for (const p of payments) {
    if (!p?.due_date) continue
    const d = p.due_date.slice(0, 10)
    const prev = byDue.get(d)
    // Duplicates predate the (lease_id, due_date) unique index: a recorded row wins over a placeholder.
    if (!prev || (!isRecordedPayment(prev) && isRecordedPayment(p))) byDue.set(d, p)
  }
  const upcomingOf = new Map(schedule.map((s) => [s.due, s.upcoming]))
  // Rows outside the derived schedule (e.g. the e-sign placeholder on a start date that is
  // not the due day) are still shown: hiding a ledger row is how it went unnoticed.
  const dates = Array.from(new Set([...schedule.map((s) => s.due), ...byDue.keys()])).sort().reverse()
  const periods: LedgerPeriod<R>[] = dates.map((due) => {
    const onSchedule = upcomingOf.has(due)
    const upcoming = upcomingOf.get(due) ?? due > today
    const row = byDue.get(due) ?? null
    let state: PeriodState
    if (row && isRecordedPayment(row)) state = row.status as 'paid' | 'late'
    else if (row) state = 'due'
    else state = upcoming ? 'upcoming' : 'due'
    return { due, upcoming, state, onSchedule, record: row, canMarkPaid: state === 'due' }
  })
  const recorded = (p: LedgerPeriod<R>) => p.state === 'paid' || p.state === 'late'
  return {
    periods,
    // Arrears are scheduled periods only: the off-schedule placeholder carries a full month's
    // rent on a mid-month start date, so counting it would overstate what is owed. It stays
    // listed with Mark paid.
    missed: periods.filter((p) => p.state === 'due' && !p.upcoming && p.onSchedule).map((p) => p.due),
    recordedRows: payments.filter(isRecordedPayment),
    dueSoFar: periods.filter((p) => !p.upcoming && (p.onSchedule || recorded(p))).length,
    recordedSoFar: periods.filter((p) => !p.upcoming && recorded(p)).length,
  }
}

/** What the missed periods add up to — each period's own amount when the row has one. */
export function missedArrears<R extends LedgerRow>(l: { periods: LedgerPeriod<R>[]; missed: string[] }, monthlyRent: number): number {
  const missed = new Set(l.missed)
  let cents = 0
  for (const p of l.periods) {
    if (!missed.has(p.due)) continue
    const own = Number(p.record?.amount)
    cents += Math.round((own > 0 ? own : monthlyRent > 0 ? monthlyRent : 0) * 100)
  }
  return cents / 100
}

export type PaidOnCheck = { ok: true; late: boolean; daysLate: number; countsTowardS58: boolean } | { ok: false; reason: 'bad_paid_date' }

/**
 * The payment date a member is about to record, checked the way mark_rent_paid checks it:
 * not in the future (Toronto), not more than 62 days before the due date unless it is
 * on or before today (a placeholder recorded at signing). Status follows the date paid,
 * not the day it is entered — catching up on bookkeeping must not manufacture lateness.
 */
export function checkPaidOn(due: string, paidOn: string, today: string = torontoDate()): PaidOnCheck {
  const d = parseDateOnly(due)
  const p = parseDateOnly(paidOn)
  if (!d || !p || !/^\d{4}-\d{2}-\d{2}$/.test(paidOn.slice(0, 10))) return { ok: false, reason: 'bad_paid_date' }
  if (paidOn.slice(0, 10) > today) return { ok: false, reason: 'bad_paid_date' }
  const floor = earliestPaidOn(due, today)
  if (paidOn.slice(0, 10) < floor) return { ok: false, reason: 'bad_paid_date' }
  const daysLate = Math.max(0, Math.round((p.getTime() - d.getTime()) / 86_400_000))
  return { ok: true, late: daysLate > 0, daysLate, countsTowardS58: daysLate > 7 }
}

/** Lower bound for the date input: 62 days before the due date, or today when that is earlier. */
export function earliestPaidOn(due: string, today: string = torontoDate()): string {
  const d = parseDateOnly(due)
  if (!d) return today
  const floor = isoDate(new Date(d.getTime() - 62 * 86_400_000))
  return today < floor ? today : floor
}
