// RETIRED 2026-10-12. The internal test month (全站免费到 2026-10-14) was replaced by a permanent free
// plan + a per-account Pro trial — see lib/billing/entitlement.ts. Kept only so old imports fail loudly in
// review rather than silently: nothing in app/ or lib/ should import this any more.
export const INTERNAL_TEST_FREE_UNTIL = '2026-10-14T23:59:59-04:00'
export const INTERNAL_TEST_FREE_UNTIL_LABEL = { zh: '2026 年 10 月 14 日', en: 'October 14, 2026' }
/** Always false now: the switch is retired. */
export function inInternalTestWindow(_now: number = Date.now()): boolean {
  return false
}
