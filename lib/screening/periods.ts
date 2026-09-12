// Small date arithmetic for rubric facts. Pure; unit-tested.

const MONTHS: Record<string, number> = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3, may: 4, jun: 5, june: 5,
  jul: 6, july: 6, aug: 7, august: 7, sep: 8, sept: 8, september: 8, oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11,
}

/** "AUGUST 2021", "Jun 2023", "2023-06", "06/2023", "2023/06/15" → months since epoch, or null. */
export function parseMonthToken(s: string): number | null {
  const t = s.trim().toLowerCase()
  let m = t.match(/^([a-z]{3,9})\.?\s+(\d{4})$/)
  if (m && MONTHS[m[1]] != null) return Number(m[2]) * 12 + MONTHS[m[1]]
  m = t.match(/^(\d{4})[-/](\d{1,2})(?:[-/]\d{1,2})?$/)
  if (m) return Number(m[1]) * 12 + (Number(m[2]) - 1)
  m = t.match(/^(\d{1,2})[-/](\d{4})$/)
  if (m) return Number(m[2]) * 12 + (Number(m[1]) - 1)
  m = t.match(/^(\d{4})$/)
  if (m) return Number(m[1]) * 12
  return null
}

/** Months covered by a declared residence period such as
 *  "AUGUST 2021 to JUNE 2023", "Jun 2023 – present", "2019-2022". */
export function parsePeriodMonths(period: string | null | undefined, now: Date = new Date()): number | null {
  if (!period) return null
  const parts = period.split(/\s*(?:\bto\b|–|—|-(?!\d)|until|through|~)\s*/i).map(p => p.trim()).filter(Boolean)
  if (parts.length < 1) return null
  const a = parseMonthToken(parts[0])
  if (a == null) return null
  const endTok = parts[1] || ''
  const b = /present|current|now|today|ongoing/i.test(endTok) || !endTok
    ? now.getUTCFullYear() * 12 + now.getUTCMonth()
    : parseMonthToken(endTok)
  if (b == null) return null
  const months = b - a
  return months >= 0 && months <= 600 ? months : null
}

/** Whole months from an ISO-ish date to now. */
export function monthsSince(date: string | null | undefined, now: Date = new Date()): number | null {
  if (!date) return null
  const m = date.match(/^(\d{4})[-/](\d{1,2})(?:[-/](\d{1,2}))?/)
  if (!m) return null
  const months = (now.getUTCFullYear() * 12 + now.getUTCMonth()) - (Number(m[1]) * 12 + (Number(m[2]) - 1))
  return months >= 0 && months <= 720 ? months : null
}
