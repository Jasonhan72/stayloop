import { NextRequest, NextResponse } from 'next/server'
import { sendEmail } from '@/lib/email'
import { CONTACT_TO, makeThrottle, renderContactEmail, validateContact } from '@/lib/contact'

export const runtime = 'edge'

/**
 * POST /api/contact
 *
 * Public contact form → one email to the Stayloop inbox, reply_to = visitor.
 * Body: { name, company?, email, topic, message, website? }
 * `website` is a honeypot: humans never see it, bots fill it — we answer 200
 * and send nothing. The per-IP throttle is per isolate (5 / hour).
 */
const allow = makeThrottle(5, 60 * 60 * 1000)

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  if (typeof body.website === 'string' && body.website.trim() !== '') {
    return NextResponse.json({ ok: true })
  }

  const v = validateContact(body)
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })

  if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM) {
    return NextResponse.json({ error: 'email_not_configured' }, { status: 503 })
  }

  const ip =
    req.headers.get('cf-connecting-ip') ||
    (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() ||
    'unknown'
  if (!allow(ip)) return NextResponse.json({ error: 'rate_limited' }, { status: 429 })

  const { subject, html, text } = renderContactEmail(v.value)
  const result = await sendEmail({ to: CONTACT_TO, replyTo: v.value.email, subject, html, text })
  if (!result.ok) {
    console.error('contact send failed', result.error)
    return NextResponse.json({ error: 'send_failed' }, { status: 502 })
  }
  return NextResponse.json({ ok: true })
}
