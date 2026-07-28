// Date-only strings from Postgres ("2026-06-01") are parsed by JS as UTC
// midnight. Reading them back with the LOCAL getters — getMonth(), getFullYear()
// — shifts them a day backwards everywhere west of Greenwich, which is all of
// Canada: a lease ending 2026-06-01 reported as May, and one ending 2026-01-01
// reported as the previous year. Mixing such a value with `new Date()` in a
// subtraction has the same problem, and here it drives an N1 notice deadline.
//
// Everything that comes from a `date` column goes through these.

/** Parse a `YYYY-MM-DD` column into the UTC instant it denotes. */
export function parseDateOnly(s: string | null | undefined): Date | null {
  if (!s) return null
  const d = new Date(`${s.slice(0, 10)}T00:00:00Z`)
  return isNaN(d.getTime()) ? null : d
}

/** Today at UTC midnight — the correct counterpart for a date-only value. */
export function todayUtc(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
}

/** Whole days from `from` to `to`, both treated as calendar dates. */
export function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 86_400_000)
}

/** Whole calendar months from `from` to `to`, never negative. */
export function monthsBetween(from: Date, to: Date): number {
  return Math.max(
    0,
    (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth()),
  )
}

/** `YYYY-MM-DD` in UTC. */
export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}
