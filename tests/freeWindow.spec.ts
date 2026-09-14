import { describe, expect, it } from 'vitest'
import { INTERNAL_TEST_FREE_UNTIL, inInternalTestWindow } from '@/lib/billing/freeWindow'
import { readFileSync } from 'node:fs'

// Internal test month (2026-09-14 → 2026-10-14): every paid gate reads this
// one predicate. After the date the gates close by themselves.
describe('internal test window', () => {
  it('is open until the end date and closed after it', () => {
    const end = Date.parse(INTERNAL_TEST_FREE_UNTIL)
    expect(inInternalTestWindow(end - 1000)).toBe(true)
    expect(inInternalTestWindow(end + 1000)).toBe(false)
    expect(inInternalTestWindow(Date.parse('2026-09-15T12:00:00-04:00'))).toBe(true)
  })
  it('every paid gate consults it', () => {
    for (const p of ['lib/billing/access.ts', 'app/api/deep-check/route.ts', 'app/api/screen-score/route.ts', 'app/api/stripe/checkout/route.ts']) {
      expect(readFileSync(p, 'utf8'), p).toMatch(/inInternalTestWindow\(/)
    }
  })
  it('the price shown everywhere is $19, matching the Stripe live price', () => {
    for (const p of ['app/pricing/page.tsx', 'app/dashboard/page.tsx', 'components/settings/SubscriptionCard.tsx', 'app/screening/copy.ts', 'lib/agent/prompts.ts', 'app/screening/app/page.tsx']) {
      expect(readFileSync(p, 'utf8'), p).not.toMatch(/Pro[^\n]{0,12}\$29|\$29\/(mo|月)|\$29<span/)
    }
  })
})
