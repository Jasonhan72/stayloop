// 租中 · 第 N 个月 · 到期 X 天 — the household hub's header line (P1
// 2026-09-23), from the lease dates alone. No model, no I/O.
import { daysBetween, monthsBetween, parseDateOnly, todayUtc } from '@/lib/dates'

export function tenancyClock(start: string | null, end: string | null, today = new Date()): { month: number | null; daysToEnd: number | null } {
  const t = todayUtc(today)
  const s = parseDateOnly(start)
  const e = parseDateOnly(end)
  // Calendar months, not 30.44-day buckets (review 2026-09-23: Mar 1 read as month 2).
  const month = s && s.getTime() <= t.getTime() ? monthsBetween(s, t) + 1 : null
  const daysToEnd = e ? daysBetween(t, e) : null
  return { month, daysToEnd }
}
