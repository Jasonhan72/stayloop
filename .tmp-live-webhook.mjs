// Create the live-mode webhook endpoint (the user explicitly requested
// go-live and supplied the live key). The signing secret is written ONLY into
// .env.local — never printed, never passed through a shell.
import { readFileSync, writeFileSync } from 'node:fs'
const ENV = '.env.local'
const raw = readFileSync(ENV, 'utf8')
const env = Object.fromEntries(
  raw.split('\n').filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)
const SK = env.STRIPE_SECRET_KEY
if (!SK.startsWith('sk_live_')) { console.error('need live key'); process.exit(1) }

const URL_ = 'https://www.stayloop.ai/api/stripe/webhook'
const list = await fetch('https://api.stripe.com/v1/webhook_endpoints?limit=10', { headers: { Authorization: `Bearer ${SK}` } }).then(r => r.json())
if ((list.data ?? []).some(w => w.url === URL_)) { console.log('live endpoint already exists — nothing to do'); process.exit(0) }

const r = await fetch('https://api.stripe.com/v1/webhook_endpoints', {
  method: 'POST',
  headers: { Authorization: `Bearer ${SK}`, 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    url: URL_,
    'enabled_events[0]': 'checkout.session.completed',
    'enabled_events[1]': 'customer.subscription.created',
    'enabled_events[2]': 'customer.subscription.updated',
    'enabled_events[3]': 'customer.subscription.deleted',
  }),
})
const b = await r.json()
if (r.status !== 200) { console.error('create failed:', b?.error?.message); process.exit(1) }

const old = raw.match(/^STRIPE_WEBHOOK_SECRET=(.*)$/m)?.[1]?.trim()
let out = raw
if (old && old.startsWith('whsec_') && !/^STRIPE_TEST_WEBHOOK_SECRET=/m.test(raw)) {
  out = out.replace(/^STRIPE_WEBHOOK_SECRET=.*$/m, `STRIPE_TEST_WEBHOOK_SECRET=${old}\nSTRIPE_WEBHOOK_SECRET=${b.secret}`)
} else {
  out = out.replace(/^STRIPE_WEBHOOK_SECRET=.*$/m, `STRIPE_WEBHOOK_SECRET=${b.secret}`)
}
writeFileSync(ENV, out)
console.log('live webhook created:', b.id, '· secret stored in .env.local (test secret preserved)')
