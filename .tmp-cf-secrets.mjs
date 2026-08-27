// Push STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET from .env.local into the
// Cloudflare Pages project env (server routes read runtime env, not the
// baked build). Values go via stdin — never through a shell command line.
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split('\n')
    .filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)
if (!env.STRIPE_SECRET_KEY?.startsWith('sk_live_')) { console.error('env not live'); process.exit(1) }
if (!env.STRIPE_WEBHOOK_SECRET?.startsWith('whsec_')) { console.error('no webhook secret'); process.exit(1) }

for (const name of ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET']) {
  const res = spawnSync('wrangler', ['pages', 'secret', 'put', name, '--project-name', 'stayloop'], {
    input: env[name] + '\n', encoding: 'utf8', timeout: 120_000,
  })
  const ok = res.status === 0
  console.log(`${name}: wrangler exit ${res.status}${ok ? '' : '\n' + (res.stderr || res.stdout || '').slice(-300)}`)
  if (!ok) process.exit(1)
}
console.log('CF Pages secrets updated — takes effect on next deploy')
