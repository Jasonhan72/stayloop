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

const MON3: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12, mai: 5, fev: 2, avr: 4, jui: 6, aou: 8, oct2: 10 }

/** Dates as documents print them — "1979-05-14", "MAY-14-1979", "14 MAY / MAI 79",
 *  "1979-xx-14", "05/14/1979" — reduced to {y?, m?, d} for equality tests.
 *  Masked or missing parts stay undefined and never count as a conflict. */
export function parseDateLoose(s: string): { y?: number; m?: number; d?: number } | null {
  const t = s.trim().toUpperCase().replace(/\s*\/\s*[A-Z]{3,}\b/g, '')   // "MAY / MAI" → "MAY"
  let m = t.match(/(\d{4})[-/.](\d{2}|XX)[-/.](\d{2}|XX)/)
  if (m) return { y: Number(m[1]), m: m[2] === 'XX' ? undefined : Number(m[2]), d: m[3] === 'XX' ? undefined : Number(m[3]) }
  m = t.match(/([A-Z]{3})[A-Z]*[-\s.]+(\d{1,2})(?:ST|ND|RD|TH)?[-,\s.]+(\d{2,4})/)
  if (m && MON3[m[1].toLowerCase()] != null) return { y: yr(m[3]), m: MON3[m[1].toLowerCase()], d: Number(m[2]) }
  m = t.match(/(\d{1,2})[-\s.]+([A-Z]{3})[A-Z]*[-,\s.]+(\d{2,4})/)
  if (m && MON3[m[2].toLowerCase()] != null) return { y: yr(m[3]), m: MON3[m[2].toLowerCase()], d: Number(m[1]) }
  m = t.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/)
  if (m) return { y: yr(m[3]), m: Number(m[1]), d: Number(m[2]) }
  return null
}
function yr(s: string): number { const n = Number(s); return s.length === 2 ? (n > 30 ? 1900 + n : 2000 + n) : n }

/** True when every parsed date agrees on the parts they both carry. */
export function datesAgree(dates: Array<{ y?: number; m?: number; d?: number }>): boolean {
  for (let i = 0; i < dates.length; i++) for (let j = i + 1; j < dates.length; j++) {
    const a = dates[i], b = dates[j]
    if (a.d != null && b.d != null && a.d !== b.d) return false
    if (a.m != null && b.m != null && a.m !== b.m) return false
    if (a.y != null && b.y != null && a.y !== b.y) return false
  }
  return dates.length >= 2
}
