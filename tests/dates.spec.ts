import { describe, it, expect } from 'vitest'
import { daysBetween, isoDate, monthsBetween, parseDateOnly, todayUtc } from '../lib/dates'

// All of these fail with plain `new Date(str)` + local getters anywhere west of
// Greenwich, which is every timezone Stayloop operates in.
describe('date-only columns', () => {
  it('reads the month a lease actually ends in', () => {
    const end = parseDateOnly('2026-06-01')!
    expect(end.getUTCMonth()).toBe(5) // June — local getters report May
    expect(end.getUTCFullYear()).toBe(2026)
  })

  it('does not roll a Jan-1 expiry back into the previous year', () => {
    const end = parseDateOnly('2026-01-01')!
    expect(end.getUTCFullYear()).toBe(2026)
    expect(end.getUTCMonth()).toBe(0)
  })

  it('counts whole days regardless of the hour of day', () => {
    const end = parseDateOnly('2026-06-30')!
    // Same calendar day, three very different wall-clock instants.
    for (const at of ['2026-04-01T00:30:00Z', '2026-04-01T12:00:00Z', '2026-04-01T23:45:00Z']) {
      expect(daysBetween(todayUtc(new Date(at)), end)).toBe(90)
    }
  })

  it('derives the N1 service deadline exactly 90 days before expiry', () => {
    const end = parseDateOnly('2026-06-30')!
    expect(isoDate(new Date(end.getTime() - 90 * 86_400_000))).toBe('2026-04-01')
  })

  it('never reports negative months remaining', () => {
    expect(monthsBetween(parseDateOnly('2026-06-01')!, parseDateOnly('2026-01-01')!)).toBe(0)
    expect(monthsBetween(parseDateOnly('2026-01-15')!, parseDateOnly('2026-06-01')!)).toBe(5)
  })

  it('returns null for missing or malformed values instead of Invalid Date', () => {
    expect(parseDateOnly(null)).toBeNull()
    expect(parseDateOnly('')).toBeNull()
    expect(parseDateOnly('not-a-date')).toBeNull()
  })
})
