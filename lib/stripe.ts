import Stripe from 'stripe'

// Single Stripe client configured for Cloudflare Pages' edge runtime.
// - Uses fetch HTTP client (no Node http module).
// - Uses SubtleCrypto-backed provider so webhook signature verification works
//   via stripe.webhooks.constructEventAsync(...).
//
// Re-create per request is fine; Stripe's client is lightweight and stateless.
export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error('STRIPE_SECRET_KEY is not set')
  return new Stripe(key, {
    apiVersion: '2025-02-24.acacia',
    httpClient: Stripe.createFetchHttpClient(),
  })
}

// Separate async crypto provider — required for webhook signature
// verification under the edge runtime.
export const stripeCryptoProvider = Stripe.createSubtleCryptoProvider()
