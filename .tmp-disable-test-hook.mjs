// Disable (not delete) the TEST-mode webhook endpoint: production now
// verifies with the LIVE signing secret, so any future test-mode event would
// just 400 against it. Kept disabled for possible future test-mode work.
import { readFileSync } from 'node:fs'
const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split('\n')
    .filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)
const TK = env.STRIPE_TEST_SECRET_KEY
if (!TK?.startsWith('sk_test_')) { console.error('no preserved test key'); process.exit(1) }
const list = await fetch('https://api.stripe.com/v1/webhook_endpoints?limit=10', { headers: { Authorization: `Bearer ${TK}` } }).then(r => r.json())
for (const w of list.data ?? []) {
  if (w.url === 'https://www.stayloop.ai/api/stripe/webhook' && w.status === 'enabled') {
    const r = await fetch(`https://api.stripe.com/v1/webhook_endpoints/${w.id}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TK}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ disabled: 'true' }),
    }).then(x => x.json())
    console.log('test endpoint', w.id, '→', r.status ?? r.error?.message)
  }
}
console.log('done')
