import { describe, expect, it } from 'vitest'
import { rentSchedule } from '../lib/household/schedule'
import { sanitizeLeaseImportExtraction } from '../lib/household/importExtract'

describe('rent schedule — derived, UTC-disciplined', () => {
  const now = new Date(Date.UTC(2026, 7, 3)) // 2026-08-03

  it('generates one period per month from start through one upcoming', () => {
    const s = rentSchedule('2026-05-01', 1, now)
    expect(s.map((p) => p.due)).toEqual(['2026-09-01', '2026-08-01', '2026-07-01', '2026-06-01', '2026-05-01'])
    expect(s[0].upcoming).toBe(true)
    expect(s[1].upcoming).toBe(false)
  })

  it('clamps due day 31 to the month length instead of skipping months', () => {
    const s = rentSchedule('2026-01-31', 31, new Date(Date.UTC(2026, 3, 15)))
    expect(s.map((p) => p.due)).toEqual(['2026-04-30', '2026-03-31', '2026-02-28', '2026-01-31'])
  })

  it('starts at the first due date on/after the lease start', () => {
    // Lease starts on the 15th, rent due the 1st → first period is next month.
    const s = rentSchedule('2026-06-15', 1, now)
    expect(s[s.length - 1].due).toBe('2026-07-01')
  })

  it('returns empty on unusable input rather than fabricating a schedule', () => {
    expect(rentSchedule(null, 1, now)).toEqual([])
    expect(rentSchedule('2026-05-01', null, now)).toEqual([])
    expect(rentSchedule('2026-05-01', 42, now)).toEqual([])
    expect(rentSchedule('not-a-date', 1, now)).toEqual([])
  })

  it('is capped so a decades-old start date cannot render thousands of rows', () => {
    expect(rentSchedule('1990-01-01', 1, now).length).toBeLessThanOrEqual(36)
  })
})

describe('lease import extraction sanitizer', () => {
  it('passes a well-formed extraction through', () => {
    const out = sanitizeLeaseImportExtraction({
      address: ' 23 Lorraine Drive ', unit: '1012', city: 'Toronto',
      monthly_rent: 2100, rent_due_day: 1,
      start_date: '2026-08-01', end_date: '2027-07-31',
      tenant_names: ['Alaleh Allasvandi Toghian'], landlord_names: ['J Doe'],
      note: 'handwritten initials on p.3',
    })
    expect(out.address).toBe('23 Lorraine Drive')
    expect(out.monthly_rent).toBe(2100)
    expect(out.rent_due_day).toBe(1)
    expect(out.tenant_names).toHaveLength(1)
  })

  it('rejects out-of-range and malformed values instead of throwing', () => {
    const out = sanitizeLeaseImportExtraction({
      monthly_rent: -5, rent_due_day: 32,
      start_date: '01/08/2026', end_date: 'soon',
      tenant_names: 'not-an-array', note: 42,
    })
    expect(out.monthly_rent).toBeNull()
    expect(out.rent_due_day).toBeNull()
    expect(out.start_date).toBeNull()
    expect(out.end_date).toBeNull()
    expect(out.tenant_names).toEqual([])
    expect(out.note).toBeNull()
  })

  it('drops an end date that precedes the start date', () => {
    const out = sanitizeLeaseImportExtraction({ start_date: '2026-08-01', end_date: '2025-08-01' })
    expect(out.start_date).toBe('2026-08-01')
    expect(out.end_date).toBeNull()
  })

  it('survives garbage', () => {
    expect(() => sanitizeLeaseImportExtraction(null)).not.toThrow()
    expect(() => sanitizeLeaseImportExtraction('x')).not.toThrow()
    expect(sanitizeLeaseImportExtraction(undefined).address).toBeNull()
  })
})
