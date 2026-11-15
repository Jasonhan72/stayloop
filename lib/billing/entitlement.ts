// Who gets Pro-level features (2026-10-12, replaces the internal test month switch):
//   · a paid plan (pro / team), or
//   · a running Pro trial — landlords.pro_trial_until in the future (new accounts: 30 days from
//     sign-up; accounts from the test month: until 2026-11-14, user decision).
// One pure predicate read by every server gate (deep check, screen-score quota, verification links,
// provider network) and by the UI (dashboard chip, settings card, pricing). Checkout and per-use
// unlocks are always available — a trial user may subscribe early.
export const TRIAL_DAYS = 30
export const LEGACY_TRIAL_UNTIL = '2026-11-14T23:59:59-04:00'
/** Free plan: screenings per calendar month (deep check and verification links are Pro / per-use). */
export const FREE_SCREENINGS_PER_MONTH = 3
/**
 * Free plan: how many times ONE screening may be scored in a calendar month. Re-running after
 * adding a missing document is normal; re-using one row for a stream of different applicants
 * was a way round the monthly allowance (code review 2026-11-15, S2-11).
 */
export const FREE_RUNS_PER_SCREENING = 3
/** Scoring runs per account per hour, every plan — a cost ceiling, fail-open. */
export const SCREEN_SCORE_RUNS_PER_HOUR = 40

/**
 * Whether the name a deep-check request carries is the applicant of the screening its
 * one-time unlock was bought for (code review 2026-11-15, S2-10). Case, spacing, punctuation
 * and word order are ignored; anything else is a different person.
 */
export function sameApplicantName(claimed: string | null | undefined, onFile: (string | null | undefined)[]): boolean {
  const key = (v: string | null | undefined) => (v ?? '').normalize('NFKC').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean).sort().join(' ')
  const want = key(claimed)
  return !!want && onFile.some((n) => key(n) === want)
}

export type EntitlementRow = { plan?: string | null; pro_trial_until?: string | null } | null | undefined

export function proTrialActive(row: EntitlementRow, now: number = Date.now()): boolean {
  const v = row?.pro_trial_until
  if (!v) return false
  const t = Date.parse(v)
  return Number.isFinite(t) && t > now
}

export function isPaidPlan(row: EntitlementRow): boolean {
  return row?.plan === 'pro' || row?.plan === 'team'
}

export function isProEntitled(row: EntitlementRow, now: number = Date.now()): boolean {
  return isPaidPlan(row) || proTrialActive(row, now)
}

/** "2026 年 11 月 14 日" / "November 14, 2026" in the user's timezone-agnostic calendar (Toronto). */
export function trialUntilLabel(row: EntitlementRow, zh: boolean): string | null {
  const v = row?.pro_trial_until
  if (!v) return null
  const d = new Date(v)
  if (!Number.isFinite(d.getTime())) return null
  return d.toLocaleDateString(zh ? 'zh-CN' : 'en-CA', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/Toronto' })
}
