import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { FREE_SCREENINGS_PER_MONTH, LEGACY_TRIAL_UNTIL, TRIAL_DAYS, isProEntitled, proTrialActive, trialUntilLabel } from '@/lib/billing/entitlement'
import { inInternalTestWindow } from '@/lib/billing/freeWindow'
import { resolveSubscriptionState } from '@/lib/billing/subscriptionState'

// 2026-10-12: the internal test month (全站免费到 10-14) was replaced by a permanent free plan + a per-account
// Pro trial (new landlords 30 days; test-month accounts until 2026-11-14). One predicate, every gate.
describe('Pro entitlement', () => {
  const now = Date.parse('2026-10-20T12:00:00-04:00')
  it('a trial counts while pro_trial_until is in the future; a paid plan always counts; nothing else does', () => {
    expect(proTrialActive({ pro_trial_until: LEGACY_TRIAL_UNTIL }, now)).toBe(true)
    expect(proTrialActive({ pro_trial_until: '2026-10-19T00:00:00-04:00' }, now)).toBe(false)
    expect(proTrialActive({ pro_trial_until: null }, now)).toBe(false)
    expect(isProEntitled({ plan: 'pro', pro_trial_until: null }, now)).toBe(true)
    expect(isProEntitled({ plan: 'free', pro_trial_until: LEGACY_TRIAL_UNTIL }, now)).toBe(true)
    expect(isProEntitled({ plan: 'free', pro_trial_until: null }, now)).toBe(false)
    expect(isProEntitled(null, now)).toBe(false)
    expect(TRIAL_DAYS).toBe(30)
    expect(FREE_SCREENINGS_PER_MONTH).toBe(3)
    expect(trialUntilLabel({ pro_trial_until: LEGACY_TRIAL_UNTIL }, true)).toContain('11月14日')
  })
  it('the retired switch is always off and nothing in app/ or lib/ reads it', () => {
    expect(inInternalTestWindow(Date.parse('2026-09-15T12:00:00-04:00'))).toBe(false)
    for (const p of ['lib/billing/access.ts', 'app/api/deep-check/route.ts', 'app/api/screen-score/route.ts', 'app/api/stripe/checkout/route.ts', 'app/api/stripe/unlock/route.ts', 'lib/marketplace/server.ts', 'app/dashboard/page.tsx', 'app/pricing/page.tsx', 'components/settings/SubscriptionCard.tsx', 'app/screening/app/page.tsx']) {
      expect(readFileSync(p, 'utf8'), p).not.toMatch(/inInternalTestWindow|INTERNAL_TEST_FREE_UNTIL/)
    }
    for (const p of ['lib/billing/access.ts', 'app/api/deep-check/route.ts', 'app/api/screen-score/route.ts', 'lib/marketplace/server.ts']) {
      expect(readFileSync(p, 'utf8'), p).toMatch(/isProEntitled\(/)
    }
  })
  it('the subscription resolver reports a running trial as its own state, and Checkout is offered for it', () => {
    const base = { plan: 'free', plan_status: null, plan_current_period_end: null, stripe_customer_id: null, stripe_subscription_id: null }
    expect(resolveSubscriptionState({ ...base, pro_trial_until: new Date(Date.now() + 86_400_000).toISOString() })).toBe('trial')
    expect(resolveSubscriptionState({ ...base, pro_trial_until: '2020-01-01T00:00:00Z' })).toBe('free')
    expect(readFileSync('app/api/stripe/checkout/route.ts', 'utf8')).toContain("if (state !== 'free' && state !== 'trial') {")
  })
  it('the migration seeds the trial for every creation path and backfills the test-month accounts', () => {
    const mig = readFileSync('supabase/migrations/20261012_pro_trial.sql', 'utf8')
    expect(mig).toContain("new.pro_trial_until := now() + interval '30 days'")
    expect(mig).toContain('create trigger trg_zz_landlord_trial_defaults before insert on public.landlords')
    expect(mig).toContain("set pro_trial_until = '2026-11-14T23:59:59-04:00'::timestamptz")
    expect(mig).toContain('new.pro_trial_until := old.pro_trial_until')
  })
  it('the price shown everywhere is $19, matching the Stripe live price', () => {
    for (const p of ['app/pricing/page.tsx', 'app/dashboard/page.tsx', 'components/settings/SubscriptionCard.tsx', 'app/screening/copy.ts', 'lib/agent/prompts.ts', 'app/screening/app/page.tsx']) {
      expect(readFileSync(p, 'utf8'), p).not.toMatch(/Pro[^\n]{0,12}\$29|\$29\/(mo|月)|\$29<span/)
    }
  })
})
