// POST /api/consumer/request/<token>/verify { name, date_of_birth?, delivery,
// mail_address?, phone? } — the identity step (s.12(6)) and the match (V0.8
// G19). The name / DOB are compared with the screenings reachable from the
// request's email (lib/consumer/match.ts); the result decides the status:
//   matched + electronic  → fulfilled now (s.12(8): electronic is immediate)
//   matched + mail/phone  → matched, queued for a human (due in 2 business days)
//   needs_review          → nothing shown; admins emailed
// Returns the same shape as GET. Re-running (the applicant corrected a typo)
// is allowed while the request is not fulfilled / closed.
import { NextResponse } from 'next/server'
import { underHourlyLimit } from '@/lib/rateLimit'
import { adminReviewEmail } from '@/lib/consumer/emails'
import { NO_STORE, adminClient, adminEmails, sendAdminAlert, audit, dueAtFor, loadRequestByToken, maskEmail, requestView, runMatch, siteUrl } from '@/lib/consumer/server'
import type { ConsumerDelivery } from '@/lib/consumer/types'


const DELIVERIES: ConsumerDelivery[] = ['electronic', 'mail', 'phone']

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params
  const admin = adminClient()
  const request = await loadRequestByToken(admin, token)
  if (!request) return NextResponse.json({ error: 'invalid_token' }, { status: 404, headers: NO_STORE })
  if (!request.email_verified_at) return NextResponse.json({ error: 'not_verified' }, { status: 403, headers: NO_STORE })
  if (request.status === 'fulfilled' || request.status === 'closed') return NextResponse.json({ error: 'already_handled' }, { status: 409, headers: NO_STORE })
  // Five identity attempts per token per hour (fail-closed: it can email admins).
  if (!(await underHourlyLimit(`consumer-verify:${request.id}`, 5, false))) return NextResponse.json({ error: 'rate_limited' }, { status: 429, headers: NO_STORE })

  let body: Record<string, unknown>
  try { body = (await req.json()) as Record<string, unknown> } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400, headers: NO_STORE }) }
  const name = String(body.name ?? '').trim().slice(0, 200)
  if (name.length < 2) return NextResponse.json({ error: 'invalid_input', field: 'name' }, { status: 400, headers: NO_STORE })
  const dobRaw = String(body.date_of_birth ?? '').trim()
  const dob = dobRaw ? (/^\d{4}-\d{2}-\d{2}$/.test(dobRaw) && !Number.isNaN(new Date(`${dobRaw}T00:00:00Z`).getTime()) ? dobRaw : null) : null
  if (dobRaw && !dob) return NextResponse.json({ error: 'invalid_input', field: 'date_of_birth' }, { status: 400, headers: NO_STORE })
  const delivery = DELIVERIES.includes(body.delivery as ConsumerDelivery) ? (body.delivery as ConsumerDelivery) : 'electronic'
  const mailAddress = String(body.mail_address ?? '').trim().slice(0, 400) || null
  const phone = String(body.phone ?? '').trim().slice(0, 60) || null
  if (delivery === 'mail' && !mailAddress) return NextResponse.json({ error: 'invalid_input', field: 'mail_address' }, { status: 400, headers: NO_STORE })
  if (delivery === 'phone' && !phone) return NextResponse.json({ error: 'invalid_input', field: 'phone' }, { status: 400, headers: NO_STORE })

  const m = await runMatch(admin, { email: request.email, name, date_of_birth: dob })
  const now = new Date()
  const fulfilNow = m.status === 'matched' && delivery === 'electronic'
  const status = fulfilNow ? 'fulfilled' : m.status
  const dueAt = request.due_at ?? dueAtFor(now)
  const patch = {
    name, date_of_birth: dob, delivery, mail_address: mailAddress, phone,
    status, matched_screening_ids: m.matched, candidate_screening_ids: m.candidates, due_at: dueAt,
    fulfilled_at: fulfilNow ? now.toISOString() : null,
  }
  const { error } = await admin.from('consumer_requests').update(patch).eq('id', request.id)
  if (error) return NextResponse.json({ error: 'write_failed' }, { status: 500, headers: NO_STORE })
  Object.assign(request, patch)
  await audit(admin, 'consumer_request_verified', request, { status, matched: m.matched.length, candidates: m.candidates.length, delivery, dob_given: !!dob })

  // A human is needed: no match, or the applicant asked for paper / a call.
  if (status === 'needs_review' || (status === 'matched' && delivery !== 'electronic')) {
    const to = await adminEmails(admin)
    if (to.length) {
      const mail = adminReviewEmail({ requestId: request.id, emailMasked: maskEmail(request.email), reason: status === 'needs_review' ? 'needs_review' : delivery === 'mail' ? 'mail' : 'phone', dueAt, candidates: m.candidates.length, queueUrl: `${siteUrl()}/admin/consumer-requests` })
      await sendAdminAlert(to, mail)
    }
  }
  return NextResponse.json(await requestView(admin, request), { headers: NO_STORE })
}
