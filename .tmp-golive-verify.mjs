// Read-only: verify the live key belongs to the same account and can charge.
import { readFileSync } from 'node:fs'
const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split('\n')
    .filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)
const SK = env.STRIPE_SECRET_KEY
if (!SK.startsWith('sk_live_')) { console.error('expected live key in .env.local'); process.exit(1) }
const r = await fetch('https://api.stripe.com/v1/account', { headers: { Authorization: `Bearer ${SK}` } })
const a = await r.json()
if (r.status !== 200) { console.error('key rejected:', a?.error?.message); process.exit(1) }
console.log(JSON.stringify({ account: a.id, charges_enabled: a.charges_enabled, payouts_enabled: a.payouts_enabled, currency: a.default_currency, country: a.country }))
const prices = await fetch('https://api.stripe.com/v1/prices?limit=10&active=true', { headers: { Authorization: `Bearer ${SK}` } }).then(x => x.json())
console.log('existing live prices:', (prices.data ?? []).map(p => ({ id: p.id, amount: p.unit_amount, cur: p.currency, interval: p.recurring?.interval })))
const hooks = await fetch('https://api.stripe.com/v1/webhook_endpoints?limit=10', { headers: { Authorization: `Bearer ${SK}` } }).then(x => x.json())
console.log('existing live webhooks:', (hooks.data ?? []).map(w => ({ url: w.url, status: w.status, events: w.enabled_events })))
const cfgs = await fetch('https://api.stripe.com/v1/billing_portal/configurations?limit=5', { headers: { Authorization: `Bearer ${SK}` } }).then(x => x.json())
console.log('live portal configs:', (cfgs.data ?? []).map(c => ({ id: c.id, is_default: c.is_default, active: c.active })))
