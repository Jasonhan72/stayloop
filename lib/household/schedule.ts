// Rent schedule for a household — pure and UTC-disciplined.
//
// The schedule is DERIVED, never stored: households carry (start_date,
// rent_due_day) and rent_payments stores only what actually happened. This
// generator produces the due dates between the lease start and a horizon so
// the rent tab can render "due / paid / late" without a cron having to
// pre-materialize rows.
//
// All date math uses the UTC getters via lib/dates — the local-getter bug
// class ("June 1st due date reads as May") is documented in that file.

import { isoDate, parseDateOnly, todayUtc } from '../dates'

export interface RentPeriod {
  /** ISO yyyy-mm-dd of the due date. */
  due: string
  /** True when the due date is in the future relative to `now`. */
  upcoming: boolean
}

/**
 * Clamp a due-day to the month that contains it: due_day 31 in April means
 * April 30, in February the 28th/29th. This matches how leases are actually
 * administered — "rent due on the 31st" never skips February.
 */
function dueDateInMonth(yearUtc: number, monthUtc: number, dueDay: number): Date {
  const lastDay = new Date(Date.UTC(yearUtc, monthUtc + 1, 0)).getUTCDate()
  return new Date(Date.UTC(yearUtc, monthUtc, Math.min(dueDay, lastDay)))
}

/**
 * Due dates from the lease start through `monthsAhead` months past `now`
 * (default: one upcoming period). Returns [] when inputs are unusable —
 * callers render an empty-state, never a fabricated schedule.
 */
export function rentSchedule(
  startDate: string | null | undefined,
  dueDay: number | null | undefined,
  now: Date = todayUtc(),
  monthsAhead = 1,
  cap = 36,
): RentPeriod[] {
  const start = parseDateOnly(startDate ?? null)
  if (!start || !dueDay || dueDay < 1 || dueDay > 31) return []

  const today = todayUtc(now)
  const horizon = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + monthsAhead, today.getUTCDate()))

  const out: RentPeriod[] = []
  let y = start.getUTCFullYear()
  let m = start.getUTCMonth()
  // First due date on/after the lease start.
  let due = dueDateInMonth(y, m, dueDay)
  if (due < start) {
    m += 1
    due = dueDateInMonth(y + Math.floor(m / 12), m % 12, dueDay)
  }
  while (due <= horizon && out.length < cap) {
    out.push({ due: isoDate(due), upcoming: due > today })
    m += 1
    const ny = start.getUTCFullYear() + Math.floor(m / 12)
    due = dueDateInMonth(ny, m % 12, dueDay)
  }
  // Most-recent first: the rent tab leads with the period that matters now.
  return out.reverse()
}
