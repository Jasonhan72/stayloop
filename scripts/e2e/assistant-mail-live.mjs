// A real email through the whole path of the AI Agent's mailbox, on production (2026-11-27):
//   Resend → Cloudflare Email Routing → workers/reply-email → /api/assistant/inbound → the mailbox.
//
//   node scripts/e2e/assistant-mail-live.mjs <role> [--pdf] [--stranger]
//     role        landlord | tenant | agent | provider | admin   — whose assistant's mailbox
//     --pdf       attach a small one-page lease PDF
//     --stranger  send from ANOTHER test account instead: the mail must be refused and never stored
//
// The mailbox has to exist already (the account opens it under 收件). Only our own addresses are
// ever involved: the sender is a test account's login address on stayloop.ai (so DKIM and DMARC
// pass through Resend, exactly as a real forward from someone's own mail does), the recipient is
// that account's mailbox. Keys are read from .env.local inside this process and never printed.
// A refused mail bounces at Resend; that did not stop later deliveries to the same address.
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n').filter((l) => /^[A-Z_]+=/.test(l)).map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, '')] }))
const role = process.argv[2]
if (!['landlord', 'tenant', 'agent', 'provider', 'admin'].includes(role)) { console.log('usage: node scripts/e2e/assistant-mail-live.mjs landlord|tenant|agent|provider|admin [--pdf] [--stranger]'); process.exit(2) }
const stranger = process.argv.includes('--stranger')
const owner = `${role}-test@stayloop.ai`
const from = stranger ? `${role === 'tenant' ? 'landlord' : 'tenant'}-test@stayloop.ai` : owner
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const SB = env.NEXT_PUBLIC_SUPABASE_URL
const H = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` }
const rest = async (path) => (await fetch(`${SB}/rest/v1/${path}`, { headers: H })).json()

// whose mailbox: the test account's user id, then its address
const users = await (await fetch(`${SB}/auth/v1/admin/users?per_page=200`, { headers: H })).json()
const uid = (users.users ?? []).find((u) => u.email === owner)?.id
if (!uid) { console.log(`no account ${owner}`); process.exit(1) }
const box = (await rest(`assistant_inboxes?select=local_part,enabled&user_id=eq.${uid}`))[0]
const cfg = (await rest('app_config?select=value&key=eq.assistant_mail'))[0]?.value ?? {}
if (!box?.enabled) { console.log(`${owner} has no mailbox yet: open one under 收件 first`); process.exit(1) }
const to = `${box.local_part}@${cfg.domain || 'reply.stayloop.ai'}`

function pdf() {
  const lines = ['RESIDENTIAL TENANCY AGREEMENT (Ontario Standard Lease) - TEST', 'Landlord: Test Landlord 2   Tenant: Test Tenant', 'Rental unit: Unit 1, 100 Test Ave, Toronto ON', 'Term: 2026-12-01 to 2027-11-30   Rent: $2,450.00 per month, due on the 1st', 'Signed by both parties on 2026-11-20.']
  const content = `BT /F1 11 Tf 50 740 Td 14 TL ${lines.map((l) => `(${l.replace(/[()\\]/g, '')}) Tj T*`).join(' ')} ET`
  const objs = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>', `<< /Length ${content.length} >>\nstream\n${content}\nendstream`, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>']
  let out = '%PDF-1.4\n'; const offs = []
  objs.forEach((o, i) => { offs.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n` })
  const xref = out.length
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(out, 'latin1').toString('base64')
}

const subject = `[TEST] assistant mail ${stranger ? 'from a stranger' : 'live check'} ${new Date().toISOString().slice(0, 19)}`
const send = await fetch('https://api.resend.com/emails', {
  method: 'POST',
  headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ from: `Stayloop Test <${from}>`, to: [to], subject, text: '[TEST] A message used to check the AI Agent mailbox end to end.\n', ...(process.argv.includes('--pdf') ? { attachments: [{ filename: 'Lease-100-Test-Ave.pdf', content: pdf() }] } : {}) }),
})
const sent = await send.json().catch(() => ({}))
console.log(`sent ${from} → ${to}: ${send.status}`)
if (!send.ok) process.exit(1)

let row = null
for (let i = 0; i < 12 && !row; i++) { await sleep(5000); row = (await rest(`assistant_mail?select=id,from_addr,file_count,status,auth&user_id=eq.${uid}&subject=eq.${encodeURIComponent(subject)}`))[0] ?? null }
const event = (await (await fetch(`https://api.resend.com/emails/${sent.id}`, { headers: { Authorization: `Bearer ${env.RESEND_API_KEY}` } })).json().catch(() => ({}))).last_event
if (stranger) {
  const ok = !row && event === 'bounced'
  console.log(`${ok ? 'PASS' : 'FAIL'}  refused and not stored (stored: ${!!row}; the sender's side says: ${event})`)
  process.exit(ok ? 0 : 1)
}
const ok = !!row && row.from_addr === owner && row.auth?.by === 'mx.cloudflare.net' && row.auth?.dmarc === 'pass' && row.file_count === (process.argv.includes('--pdf') ? 1 : 0)
console.log(`${ok ? 'PASS' : 'FAIL'}  ${row ? `stored: from ${row.from_addr}, ${row.file_count} file(s), dmarc=${row.auth?.dmarc} by ${row.auth?.by}` : 'not stored within a minute'} (the sender's side says: ${event})`)
process.exit(ok ? 0 : 1)
