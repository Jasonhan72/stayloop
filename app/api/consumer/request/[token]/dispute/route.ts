// POST /api/consumer/request/<token>/dispute { screening_id, item_kind,
// item_ref, item_label, statement } — s.13(1) (V0.8 G19). The screening must
// be one this request matched (never a candidate, never any other id); the
// item kind is the pack's vocabulary. Creates consumer_disputes (open), emails
// the admins, returns {id}. 10 per token per hour, fail-closed.
import { NextResponse } from 'next/server'
import { underHourlyLimit } from '@/lib/rateLimit'
import { adminDisputeEmail } from '@/lib/consumer/emails'
import { DISPUTE_ITEM_KINDS, type DisputeItemKind } from '@/lib/consumer/types'
import { NO_STORE, adminClient, adminEmails, sendAdminAlert, audit, loadRequestByToken, maskEmail, siteUrl } from '@/lib/consumer/server'


export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params
  const admin = adminClient()
  const request = await loadRequestByToken(admin, token)
  if (!request) return NextResponse.json({ error: 'invalid_token' }, { status: 404, headers: NO_STORE })
  if (!request.email_verified_at || !(request.status === 'matched' || request.status === 'fulfilled')) return NextResponse.json({ error: 'not_available', status: request.status }, { status: 409, headers: NO_STORE })
  if (!(await underHourlyLimit(`consumer-dispute:${request.id}`, 10, false))) return NextResponse.json({ error: 'rate_limited' }, { status: 429, headers: NO_STORE })

  let body: Record<string, unknown>
  try { body = (await req.json()) as Record<string, unknown> } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400, headers: NO_STORE }) }
  const screeningId = String(body.screening_id ?? '')
  // Only a screening this request matched may be disputed.
  if (!/^[0-9a-f-]{36}$/i.test(screeningId) || !(request.matched_screening_ids ?? []).includes(screeningId)) return NextResponse.json({ error: 'screening_not_matched' }, { status: 403, headers: NO_STORE })
  const itemKind = String(body.item_kind ?? '') as DisputeItemKind
  if (!DISPUTE_ITEM_KINDS.includes(itemKind)) return NextResponse.json({ error: 'invalid_input', field: 'item_kind' }, { status: 400, headers: NO_STORE })
  const itemRef = String(body.item_ref ?? '').trim().slice(0, 200) || null
  const itemLabel = String(body.item_label ?? '').trim().slice(0, 300) || null
  const statement = String(body.statement ?? '').trim().slice(0, 2000)
  if (statement.length < 5) return NextResponse.json({ error: 'invalid_input', field: 'statement' }, { status: 400, headers: NO_STORE })

  const { data: row, error } = await admin.from('consumer_disputes').insert({ request_id: request.id, screening_id: screeningId, item_kind: itemKind, item_ref: itemRef, item_label: itemLabel, statement }).select('id').maybeSingle()
  if (error || !row) return NextResponse.json({ error: 'write_failed' }, { status: 500, headers: NO_STORE })
  const id = (row as { id: string }).id
  await audit(admin, 'consumer_dispute_filed', request, { dispute_id: id, screening_id: screeningId, item_kind: itemKind, item_ref: itemRef })
  const to = await adminEmails(admin)
  if (to.length) {
    const mail = adminDisputeEmail({ disputeId: id, requestId: request.id, emailMasked: maskEmail(request.email), itemLabel, statement, queueUrl: `${siteUrl()}/admin/consumer-requests` })
    await sendAdminAlert(to, mail)
  }
  return NextResponse.json({ id, status: 'open' }, { status: 201, headers: NO_STORE })
}
