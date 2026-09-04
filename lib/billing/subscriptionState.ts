// Subscription state as the UI sees it — one pure resolver shared by the
// settings card and the billing routes, so "what does this landlord's row
// mean" is decided in exactly one place.
//
// The row is written only by the Stripe webhook (plus resume/route.ts for the
// un-cancel case). The two traps this encodes:
//   · past_due: the webhook writes plan='free' the moment a renewal charge
//     fails, so a "plan === 'free' → show Upgrade" rule would sell a second
//     subscription to someone who already has one in dunning. Status + a
//     Stripe customer on file wins over plan.
//   · cancel_at_period_end: Stripe keeps status='active' until the period
//     actually ends, so "renews on <date>" was wrong for anyone who had
//     cancelled in the portal.

export type LandlordBillingRow = {
  id?: string | null
  auth_id?: string | null
  plan: string | null
  plan_status: string | null
  plan_current_period_end: string | null
  plan_cancel_at_period_end?: boolean | null
  stripe_customer_id: string | null
  stripe_subscription_id?: string | null
  plan_card_brand?: string | null
  plan_card_last4?: string | null
}

export const BILLING_SELECT =
  'id, auth_id, plan, plan_status, plan_current_period_end, plan_cancel_at_period_end, ' +
  'stripe_customer_id, stripe_subscription_id, plan_card_brand, plan_card_last4'

export type SubscriptionState = 'free' | 'active' | 'canceling' | 'past_due' | 'comped'

// Dual-ID invariant (CLAUDE.md): a user can match a legacy row by id and a
// current row by auth_id. `.or().limit(1)` picks whichever Postgres returns
// first — prefer the auth_id row (that is where the webhook writes).
export function pickLandlordRow<T extends { id?: string | null; auth_id?: string | null }>(
  rows: T[] | null | undefined,
  userId: string,
): T | null {
  if (!rows?.length) return null
  return rows.find((r) => r.auth_id === userId) ?? rows.find((r) => r.id === userId) ?? rows[0]
}

export function resolveSubscriptionState(row: LandlordBillingRow | null | undefined): SubscriptionState {
  if (!row) return 'free'
  const hasCustomer = !!row.stripe_customer_id
  const status = row.plan_status
  if (hasCustomer && (status === 'past_due' || status === 'unpaid')) return 'past_due'
  const paid = row.plan === 'pro' || row.plan === 'team'
  if (!paid) return 'free'
  // Paid with nothing to manage in Stripe = granted directly by Stayloop.
  if (!row.stripe_subscription_id) return 'comped'
  if (row.plan_cancel_at_period_end) return 'canceling'
  return 'active'
}

export function formatCard(row: LandlordBillingRow | null | undefined): string | null {
  if (!row?.plan_card_last4) return null
  const brand = (row.plan_card_brand || '').trim()
  const nice = brand ? brand.charAt(0).toUpperCase() + brand.slice(1) : 'Card'
  return `${nice} ···· ${row.plan_card_last4}`
}
