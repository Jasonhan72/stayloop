// Consumer Reporting Act s.12(8): an electronic disclosure must go out within
// 2 business days of the request. "Business day" here = Monday–Friday; statutory
// holidays are NOT skipped (the deadline is then slightly earlier than the law
// requires, never later). Pure; UTC-based so the result does not depend on the
// server's zone.

/** `d` plus `n` business days (weekends skipped). A request made on Friday + 2 = Tuesday. */
export function addBusinessDays(d: Date, n: number): Date {
  const out = new Date(d.getTime())
  let left = Math.max(0, Math.floor(n))
  while (left > 0) {
    out.setUTCDate(out.getUTCDate() + 1)
    const dow = out.getUTCDay()
    if (dow !== 0 && dow !== 6) left -= 1
  }
  return out
}

/** Whole business days from `from` to `to` (negative when `to` is earlier). */
export function businessDaysBetween(from: Date, to: Date): number {
  const sign = to.getTime() >= from.getTime() ? 1 : -1
  const [a, b] = sign === 1 ? [from, to] : [to, from]
  const cur = new Date(Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate()))
  const end = new Date(Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate()))
  let n = 0
  while (cur.getTime() < end.getTime()) {
    cur.setUTCDate(cur.getUTCDate() + 1)
    const dow = cur.getUTCDay()
    if (dow !== 0 && dow !== 6) n += 1
  }
  return n * sign
}
