import { describe, it, expect } from 'vitest'
import {
  resolveSubscriptionState,
  pickLandlordRow,
  formatCard,
  type LandlordBillingRow,
} from '../lib/billing/subscriptionState'

// 订阅卡的状态判定。最要紧的一条：webhook 在扣款失败时会把 plan 写回 free，
// 若按 plan 判定就会给已在催款中的房东再卖一份订阅。

function row(over: Partial<LandlordBillingRow> = {}): LandlordBillingRow {
  return {
    id: 'profile-1',
    auth_id: 'auth-1',
    plan: 'pro',
    plan_status: 'active',
    plan_current_period_end: '2026-09-26T00:00:00Z',
    plan_cancel_at_period_end: false,
    stripe_customer_id: 'cus_1',
    stripe_subscription_id: 'sub_1',
    plan_card_brand: 'visa',
    plan_card_last4: '4242',
    ...over,
  }
}

describe('resolveSubscriptionState', () => {
  it('no row / free plan → free', () => {
    expect(resolveSubscriptionState(null)).toBe('free')
    expect(resolveSubscriptionState(row({ plan: 'free', plan_status: null, stripe_customer_id: null, stripe_subscription_id: null }))).toBe('free')
  })

  it('paid with a live Stripe subscription → active', () => {
    expect(resolveSubscriptionState(row())).toBe('active')
    expect(resolveSubscriptionState(row({ plan: 'team' }))).toBe('active')
    expect(resolveSubscriptionState(row({ plan_status: 'trialing' }))).toBe('active')
  })

  it('cancel_at_period_end flips active → canceling even though Stripe still says active', () => {
    expect(resolveSubscriptionState(row({ plan_cancel_at_period_end: true }))).toBe('canceling')
  })

  it('paid without a Stripe subscription → comped (nothing to manage)', () => {
    expect(resolveSubscriptionState(row({ stripe_customer_id: null, stripe_subscription_id: null }))).toBe('comped')
    // A customer id left over from an earlier, since-deleted subscription
    // must not turn a comped plan into "active" with dead portal doors.
    expect(resolveSubscriptionState(row({ stripe_subscription_id: null }))).toBe('comped')
  })

  it('dunning wins over plan: plan=free + past_due + customer → past_due, never Upgrade', () => {
    expect(resolveSubscriptionState(row({ plan: 'free', plan_status: 'past_due' }))).toBe('past_due')
    expect(resolveSubscriptionState(row({ plan: 'free', plan_status: 'unpaid' }))).toBe('past_due')
    expect(resolveSubscriptionState(row({ plan: 'pro', plan_status: 'past_due' }))).toBe('past_due')
  })

  it('past_due without a Stripe customer has nothing to fix in the portal → free', () => {
    expect(resolveSubscriptionState(row({ plan: 'free', plan_status: 'past_due', stripe_customer_id: null, stripe_subscription_id: null }))).toBe('free')
  })

  it('a fully canceled subscription is free again (checkout reuses the customer)', () => {
    expect(resolveSubscriptionState(row({ plan: 'free', plan_status: 'canceled', stripe_subscription_id: null }))).toBe('free')
  })
})

describe('pickLandlordRow', () => {
  it('prefers the auth_id row over a legacy profile-id row regardless of order', () => {
    const legacy = { id: 'auth-1', auth_id: null, plan: 'free' }
    const current = { id: 'profile-9', auth_id: 'auth-1', plan: 'pro' }
    expect(pickLandlordRow([legacy, current], 'auth-1')).toBe(current)
    expect(pickLandlordRow([current, legacy], 'auth-1')).toBe(current)
  })
  it('falls back to the id match, then the first row, then null', () => {
    const legacy = { id: 'auth-1', auth_id: null }
    expect(pickLandlordRow([legacy], 'auth-1')).toBe(legacy)
    expect(pickLandlordRow([{ id: 'x', auth_id: 'y' }], 'auth-1')?.id).toBe('x')
    expect(pickLandlordRow([], 'auth-1')).toBeNull()
    expect(pickLandlordRow(null, 'auth-1')).toBeNull()
  })
})

describe('formatCard', () => {
  it('renders brand + last4, tolerates a missing brand, hides when no last4', () => {
    expect(formatCard(row())).toBe('Visa ···· 4242')
    expect(formatCard(row({ plan_card_brand: null }))).toBe('Card ···· 4242')
    expect(formatCard(row({ plan_card_last4: null }))).toBeNull()
  })
})
