// Live-mode go-live setup (idempotent):
//   1. webhook endpoint at /api/stripe/webhook with the 4 events → secret
//      written straight into .env.local (never printed)
//   2. default billing-portal configuration (invoice history, payment-method
//      update, cancel subscription) — live mode has none yet
//   3. NEXT_PUBLIC_STRIPE_PRICE_ID → the existing live $29 CAD price
import { readFileSync, writeFileSync } from 'node:fs'

const ENV = '.env.local'
const raw = readFileSync(ENV, 'utf8')
const env = Object.fromEntries(
  raw.split('\n').filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)
const SK = env.STRIPE_SECRET_KEY
if (!SK.startsWith('sk_live_')) { console.error('need live key in .env.local'); process.exit(1) }
const LIVE_PRICE = 'price_1TJagqPEHyIrPd1QtIWw0NSH'

async function api(path, method = 'GET', form = null) {
  const r = await fetch(`https://api.stripe.com/v1/${path}`, {
    method,
    headers: { Authorization: `Bearer ${SK}`, ...(form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) },
    body: form ? new URLSearchParams(form) : undefined,
  })
  return { status: r.status, body: await r.json() }
}

// sanity: the price is what we think it is
const price = await api(`prices/${LIVE_PRICE}?expand[]=product`)
if (price.status !== 200 || price.body.unit_amount !== 2900 || price.body.currency !== 'cad' || !price.body.active) {
  console.error('live price sanity failed', price.body?.error?.message ?? price.body.unit_amount)
  process.exit(1)
}
console.log('live price ok:', LIVE_PRICE, price.body.unit_amount, price.body.currency, '/', price.body.recurring?.interval, '· product:', price.body.product?.name)

// 1 — webhook endpoint (skip if one already exists at the URL)
const URL_ = 'https://www.stayloop.ai/api/stripe/webhook'
const hooks = await api('webhook_endpoints?limit=10')
let whsec = null
const existing = (hooks.body.data ?? []).find(w => w.url === URL_)
if (existing) {
  console.log('live webhook already exists:', existing.id, '(secret unknown — would need recreate)')
} else {
  const created = await api('webhook_endpoints', 'POST', {
    url: URL_,
    'enabled_events[0]': 'checkout.session.completed',
    'enabled_events[1]': 'customer.subscription.created',
    'enabled_events[2]': 'customer.subscription.updated',
    'enabled_events[3]': 'customer.subscription.deleted',
  })
  if (created.status !== 200) { console.error('webhook create failed:', created.body?.error?.message); process.exit(1) }
  whsec = created.body.secret
  console.log('live webhook created:', created.body.id, `(secret whsec_… ${whsec.length} chars)`)
}

// 2 — billing portal default configuration
const cfgs = await api('billing_portal/configurations?limit=5')
if ((cfgs.body.data ?? []).some(c => c.is_default && c.active)) {
  console.log('live portal config already present')
} else {
  const cfg = await api('billing_portal/configurations', 'POST', {
    'features[invoice_history][enabled]': 'true',
    'features[payment_method_update][enabled]': 'true',
    'features[subscription_cancel][enabled]': 'true',
    'features[subscription_cancel][mode]': 'at_period_end',
    'features[customer_update][enabled]': 'false',
    'business_profile[headline]': 'Stayloop Pro',
  })
  if (cfg.status !== 200) { console.error('portal config failed:', cfg.body?.error?.message); process.exit(1) }
  console.log('live portal config created:', cfg.body.id, 'is_default:', cfg.body.is_default)
}

// 3 — env updates in place (price id + webhook secret)
let out = raw
if (!/^NEXT_PUBLIC_STRIPE_PRICE_ID=/m.test(out)) { console.error('no price line in env'); process.exit(1) }
out = out.replace(/^NEXT_PUBLIC_STRIPE_PRICE_ID=.*$/m, `NEXT_PUBLIC_STRIPE_PRICE_ID=${LIVE_PRICE}`)
if (whsec) {
  const old = out.match(/^STRIPE_WEBHOOK_SECRET=(.*)$/m)?.[1]?.trim()
  if (old && old.startsWith('whsec_') && !/^STRIPE_TEST_WEBHOOK_SECRET=/m.test(out)) {
    out = out.replace(/^STRIPE_WEBHOOK_SECRET=.*$/m, `STRIPE_TEST_WEBHOOK_SECRET=${old}\nSTRIPE_WEBHOOK_SECRET=${whsec}`)
  } else {
    out = out.replace(/^STRIPE_WEBHOOK_SECRET=.*$/m, `STRIPE_WEBHOOK_SECRET=${whsec}`)
  }
}
writeFileSync(ENV, out)
console.log('.env.local updated: price id → live' + (whsec ? ', webhook secret → live (test secret preserved)' : ''))
