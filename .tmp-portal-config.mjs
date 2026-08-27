// Create the live-mode billing-portal default configuration (none exists).
// No secrets involved — the config id is public-safe. Without this, the
// /api/stripe/portal route 500s in live mode ("no default configuration").
import { readFileSync } from 'node:fs'
const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split('\n')
    .filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)
const SK = env.STRIPE_SECRET_KEY
const r = await fetch('https://api.stripe.com/v1/billing_portal/configurations', {
  method: 'POST',
  headers: { Authorization: `Bearer ${SK}`, 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    'features[invoice_history][enabled]': 'true',
    'features[payment_method_update][enabled]': 'true',
    'features[subscription_cancel][enabled]': 'true',
    'features[subscription_cancel][mode]': 'at_period_end',
    'business_profile[headline]': 'Stayloop Pro',
  }),
})
const b = await r.json()
if (r.status !== 200) { console.error('failed:', b?.error?.message); process.exit(1) }
console.log('portal config:', b.id, 'is_default:', b.is_default, 'active:', b.active)
