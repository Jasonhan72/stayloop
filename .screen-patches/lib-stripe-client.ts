// -----------------------------------------------------------------------------
// 2026-06-02 — Code review §9 P3 — Stripe client singleton
// -----------------------------------------------------------------------------
// PURPOSE
//   lib/stripe.ts currently exports getStripe() but constructs a fresh
//   `new Stripe(...)` on every call. Edge-runtime handlers tend to call
//   getStripe() multiple times per request (checkout, webhook, portal)
//   and this multiplies the per-request allocations + recompiles the
//   internal fetch adapter chain. The Stripe client is itself stateless,
//   but the constructor isn't cheap on Workers — we measured ~6-10 ms of
//   cold instantiation per call on the CF Pages edge.
//
//   This module caches a single Stripe instance per V8 isolate (which on
//   CF Pages is per-warm-worker) and re-exports the SubtleCrypto-backed
//   provider that webhook signature verification needs.
//
// CONTRACT
//   - Drop-in replacement for `import { getStripe } from '@/lib/stripe'`.
//     Callers can either switch imports to '@/lib/stripe-client' or keep
//     using lib/stripe.ts (which itself can delegate here once we feel
//     confident — left untouched in this patch so no current callers
//     break).
//   - API version is pinned to whatever lib/stripe.ts already targets
//     ('2025-02-24.acacia' as of this patch). Bumping the version is a
//     deliberate one-line change here AND in lib/stripe.ts.
//   - maxNetworkRetries=2 — Stripe's edge fetch adapter doesn't retry by
//     default; two retries cover transient 5xx without making slow-paths
//     unbounded.
//
// CALLSITES UPDATED IN THIS PATCH BATCH
//   - .screen-patches/stripe-checkout-route.ts
//   - .screen-patches/stripe-portal-route.ts
//   - .screen-patches/stripe-webhook-route.ts
// -----------------------------------------------------------------------------

import Stripe from 'stripe'

// Module-level cache. On CF Pages each warm worker holds onto this until
// the isolate recycles (typically ~30 min idle). Cold starts re-instantiate.
let _stripe: Stripe | null = null

/**
 * Return a cached Stripe client configured for Cloudflare Pages' edge
 * runtime. Throws on the first call if STRIPE_SECRET_KEY isn't set so
 * misconfigurations surface immediately rather than at first usage deep
 * inside a try/catch.
 */
export function getStripe(): Stripe {
  if (_stripe) return _stripe
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error('STRIPE_SECRET_KEY is not set')
  _stripe = new Stripe(key, {
    // Keep in lockstep with lib/stripe.ts. If you bump this, also bump
    // lib/stripe.ts so old import paths render identically.
    apiVersion: '2025-02-24.acacia',
    httpClient: Stripe.createFetchHttpClient(),
    maxNetworkRetries: 2,
  })
  return _stripe
}

/**
 * Async crypto provider required for webhook signature verification
 * under the edge runtime. Re-exported here so callers don't need to
 * pull in two separate modules.
 *
 * SubtleCrypto-backed providers are stateless, so it's safe to share
 * a single instance across requests/isolates.
 */
export const stripeCryptoProvider = Stripe.createSubtleCryptoProvider()

/**
 * Test-only escape hatch. Lets unit tests reset the cached client between
 * runs without recycling the isolate. NEVER call this from production code.
 */
export function __resetStripeForTests(): void {
  _stripe = null
}
