// POST /api/consumer/request/<token>/alert { statement } · DELETE — identity
// alert on the applicant's file (s.12.1–12.3, V0.8 G19). The email comes from
// the request, never from the body. POST replaces any live alert (the older one
// is revoked, not edited); DELETE revokes. Needs a verified email; the request
// does not have to be matched (an applicant with nothing on file may still
// want the alert waiting for them).
import { NextResponse } from 'next/server'
import { underHourlyLimit } from '@/lib/rateLimit'
import { ALERT_MAX_CHARS, activeAlertFor, alertPublic } from '@/lib/consumer/alerts'
import { NO_STORE, adminClient, audit, loadRequestByToken } from '@/lib/consumer/server'

export const runtime = 'edge'

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params
  const admin = adminClient()
  const request = await loadRequestByToken(admin, token)
  if (!request) return NextResponse.json({ error: 'invalid_token' }, { status: 404, headers: NO_STORE })
  if (!request.email_verified_at) return NextResponse.json({ error: 'not_verified' }, { status: 403, headers: NO_STORE })
  if (!(await underHourlyLimit(`consumer-alert:${request.id}`, 10, false))) return NextResponse.json({ error: 'rate_limited' }, { status: 429, headers: NO_STORE })
  let body: { statement?: unknown }
  try { body = (await req.json()) as typeof body } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400, headers: NO_STORE }) }
  const statement = String(body.statement ?? '').replace(/\s+/g, ' ').trim().slice(0, ALERT_MAX_CHARS)
  if (statement.length < 5) return NextResponse.json({ error: 'invalid_input', field: 'statement' }, { status: 400, headers: NO_STORE })
  const now = new Date().toISOString()
  await admin.from('consumer_alerts').update({ revoked_at: now }).eq('email', request.email).is('revoked_at', null)
  const { data: row, error } = await admin.from('consumer_alerts').insert({ email: request.email, name: request.name, statement, request_id: request.id }).select('id, email, name, statement, created_at, expires_at, revoked_at, request_id').maybeSingle()
  if (error || !row) return NextResponse.json({ error: 'write_failed' }, { status: 500, headers: NO_STORE })
  await audit(admin, 'consumer_alert_set', request, { alert_id: (row as { id: string }).id })
  return NextResponse.json({ ok: true, alert: alertPublic(row as Parameters<typeof alertPublic>[0]) }, { headers: NO_STORE })
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params
  const admin = adminClient()
  const request = await loadRequestByToken(admin, token)
  if (!request) return NextResponse.json({ error: 'invalid_token' }, { status: 404, headers: NO_STORE })
  if (!request.email_verified_at) return NextResponse.json({ error: 'not_verified' }, { status: 403, headers: NO_STORE })
  const live = await activeAlertFor(admin, request.email)
  if (live) {
    await admin.from('consumer_alerts').update({ revoked_at: new Date().toISOString() }).eq('email', request.email).is('revoked_at', null)
    await audit(admin, 'consumer_alert_revoked', request, { alert_id: live.id })
  }
  return NextResponse.json({ ok: true, alert: null }, { headers: NO_STORE })
}
