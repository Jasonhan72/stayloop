// GET /api/consumer/request/<token>/pack?format=html|json — the disclosure
// itself (s.12(3), V0.8 G19). Served ONLY when the request is matched or
// fulfilled AND the email was verified by opening the link; anything else is
// 409 {error:'not_available'} (404 for a bad token). Every disclosure is
// audited (`consumer_file_disclosed`) and carries X-Content-Fingerprint.
import { NextResponse } from 'next/server'
import { buildDisclosurePack, packFingerprint } from '@/lib/consumer/pack'
import { renderDisclosurePack } from '@/lib/consumer/render'
import { activeAlertFor } from '@/lib/consumer/alerts'
import { NO_STORE, adminClient, audit, langOf, loadPackInputs, loadRequestByToken } from '@/lib/consumer/server'


export async function GET(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params
  const admin = adminClient()
  const request = await loadRequestByToken(admin, token)
  if (!request) return NextResponse.json({ error: 'invalid_token' }, { status: 404, headers: NO_STORE })
  const ready = (request.status === 'matched' || request.status === 'fulfilled') && !!request.email_verified_at
  if (!ready) return NextResponse.json({ error: 'not_available', status: request.status }, { status: 409, headers: NO_STORE })

  const url = new URL(req.url)
  const format = url.searchParams.get('format') === 'json' ? 'json' : 'html'
  const lang = langOf(url.searchParams.get('lang') ?? request.lang)
  const alert = await activeAlertFor(admin, request.email)
  const inputs = await loadPackInputs(admin, request, lang, alert ? [alert] : [])
  const pack = buildDisclosurePack(inputs)
  pack.fingerprint = await packFingerprint(pack)
  // Electronic delivery: the first successful disclosure IS fulfilment (mail / phone stay in the queue).
  if (request.status === 'matched' && request.delivery === 'electronic') {
    await admin.from('consumer_requests').update({ status: 'fulfilled', fulfilled_at: new Date().toISOString() }).eq('id', request.id).eq('status', 'matched')
  }
  await audit(admin, 'consumer_file_disclosed', request, { format, lang, screenings: pack.screenings.length, viewers: pack.viewers.length, recipients: pack.recipients.length, fingerprint: pack.fingerprint })
  if (format === 'json') return NextResponse.json(pack, { headers: { ...NO_STORE, 'X-Content-Fingerprint': pack.fingerprint } })
  return new NextResponse(renderDisclosurePack(pack, lang), { headers: { ...NO_STORE, 'Content-Type': 'text/html; charset=utf-8', 'X-Content-Fingerprint': pack.fingerprint, 'X-Frame-Options': 'SAMEORIGIN' } })
}
