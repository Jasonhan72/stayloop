// POST /api/consumer/request { email, lang? } — "show me my screening file"
// (Consumer Reporting Act s.12(1)(a); V0.8 G19). Anonymous. ALWAYS answers
// 200 {ok:true}: whether the email has a file, is rate-limited, or the mail
// failed is never revealed (enumeration guard). The one-time token goes into
// the email only. Limits: 5 per IP per hour, 3 per email per hour, both
// fail-CLOSED (this route sends mail).
import { NextResponse } from 'next/server'
import { underHourlyLimit } from '@/lib/rateLimit'
import { sendEmail } from '@/lib/email'
import { confirmRequestEmail } from '@/lib/consumer/emails'
import { NO_STORE, TOKEN_HOURS, adminClient, audit, clientIp, hashIp, langOf, makeToken, normalizeEmail, sha256Hex, siteUrl } from '@/lib/consumer/server'

export const runtime = 'edge'

const OK = () => NextResponse.json({ ok: true }, { headers: NO_STORE })

export async function POST(req: Request) {
  let body: { email?: unknown; lang?: unknown }
  try { body = (await req.json()) as typeof body } catch { return OK() }
  const email = normalizeEmail(body.email)
  if (!email) return OK()
  const lang = langOf(body.lang)
  const ip = clientIp(req)
  const ipHash = await hashIp(ip)
  // Two buckets, both fail-closed: no limiter → no email.
  if (!(await underHourlyLimit(`consumer-request:ip:${ipHash}`, 5, false))) return OK()
  if (!(await underHourlyLimit(`consumer-request:email:${(await sha256Hex(email)).slice(0, 32)}`, 3, false))) return OK()

  const admin = adminClient()
  const token = makeToken()
  const { data: row, error } = await admin.from('consumer_requests').insert({
    email, token, token_expires_at: new Date(Date.now() + TOKEN_HOURS * 3_600_000).toISOString(), ip_hash: ipHash, lang,
  }).select('id').maybeSingle()
  if (error || !row) return OK()
  const link = `${siteUrl()}/my-file/${token}`
  const mail = confirmRequestEmail({ link, lang })
  const sent = await sendEmail({ to: email, subject: mail.subject, html: mail.html, text: mail.text, fromName: 'Stayloop' })
  await audit(admin, 'consumer_request_created', { id: (row as { id: string }).id }, { lang, emailed: sent.ok, ip_hash: ipHash })
  return OK()
}
