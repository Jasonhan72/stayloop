// POST /api/work-orders/dispatch — the landlord assigns a ticket to a
// verified provider or to their own contact (an email). Step ③ of the
// services flow. The caller's landlord membership on the household is
// proven server-side (createWorkOrder), never trusted from the body.
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createWorkOrder } from '@/lib/marketplace/server'
import { underHourlyLimit } from '@/lib/rateLimit'

export const runtime = 'edge'

export async function POST(req: Request) {
  const rawAuth = req.headers.get('authorization') || ''
  const authHeader = rawAuth.replace(/[^\x20-\x7E]/g, '').trim()
  if (!authHeader) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false, autoRefreshToken: false } })
  const { data: ud, error: ue } = await sb.auth.getUser()
  if (ue || !ud?.user || ud.user.is_anonymous) return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
  const userId = ud.user.id

  let body: { ticket_id?: string; provider_id?: string | null; external_email?: string | null; external_name?: string | null; scope?: string | null; entry_permission?: string | null; emergency?: boolean }
  try { body = (await req.json()) as typeof body } catch { return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 }) }
  if (!body.ticket_id || !/^[0-9a-f-]{36}$/i.test(body.ticket_id)) return NextResponse.json({ error: 'ticket_id required' }, { status: 400 })
  if (body.provider_id && !/^[0-9a-f-]{36}$/i.test(body.provider_id)) return NextResponse.json({ error: 'provider_id invalid' }, { status: 400 })
  const entry = body.entry_permission && ['anytime', 'call_first', 'tenant_present'].includes(body.entry_permission) ? (body.entry_permission as 'anytime' | 'call_first' | 'tenant_present') : null

  // Mail-sending route: fail closed on the limiter (review 2026-09-19 pattern).
  if (!(await underHourlyLimit(`mail:wo-dispatch:${userId}`, 20, false))) return NextResponse.json({ error: 'rate_limited' }, { status: 429 })

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } })
  const r = await createWorkOrder(admin, {
    ticketId: body.ticket_id, landlordAuthId: userId, providerId: body.provider_id || null,
    externalEmail: body.external_email || null, externalName: body.external_name || null,
    scope: body.scope || null, entryPermission: entry, emergency: typeof body.emergency === 'boolean' ? body.emergency : undefined,
  })
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
  await admin.from('agent_audit_events').insert({ actor_id: userId, actor_type: 'user', action: 'work_order_dispatched', target_type: 'work_order', target_id: r.wo.id, metadata: { ticket_id: body.ticket_id, provider_id: r.wo.provider_id, external: !!r.wo.external_email } })
  return NextResponse.json({ ok: true, work_order_id: r.wo.id, status: r.wo.status })
}
