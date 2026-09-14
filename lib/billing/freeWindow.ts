// Internal test month (user decision 2026-09-14): every paid gate is open to
// everyone until this date. One constant, read by the server gates
// (hasProAccess, deep-check, screen-score quota, checkout) and the UI
// (pricing, dashboard, settings, screening app), so both sides agree. To end
// the test early, move the date; to extend it, move the date. Nothing else.
export const INTERNAL_TEST_FREE_UNTIL = '2026-10-14T23:59:59-04:00'
export const INTERNAL_TEST_FREE_UNTIL_LABEL = { zh: '2026 年 10 月 14 日', en: 'October 14, 2026' }

export function inInternalTestWindow(now: number = Date.now()): boolean {
  return now < Date.parse(INTERNAL_TEST_FREE_UNTIL)
}
