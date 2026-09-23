// POST /api/work-orders/[id]/act — every signed-in transition on a work
// order (provider with an account, landlord, tenant, admin). The actor kind
// is derived from the caller's relationship to the row, never from the
// body; the pure state table decides whether the action is allowed.
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { actOnWorkOrder } from '@/lib/marketplace/server'
import type { ActorKind, WoAction } from '@/lib/marketplace/workOrders'
import { underHourlyLimit } from '@/lib/rateLimit'

export const runtime = 'edge'

const ACTIONS: WoAction[] = ['accept', 'decline', 'quote', 'approve_quote', 'reject_quote', 'arrive', 'complete', 'tenant_confirm', 'accept_completion', 'request_rework', 'dispute', 'resolve_dispute', 'mark_paid', 'close', 'cancel']

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'bad id' }, { status: 400 })
  const rawAuth = req.headers.get('authorization') || ''
  const authHeader = rawAuth.replace(/[^\x20-\x7E]/g, '').trim()
  if (!authHeader) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false, autoRefreshToken: false } })
  const { data: ud, error: ue } = await sb.auth.getUser()
  if (ue || !ud?.user || ud.user.is_anonymous) return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
  const userId = ud.user.id

  let body: { action?: string; payload?: Record<string, unknown> }
  try { body = (await req.json()) as typeof body } catch { return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 }) }
  const action = body.action as WoAction
  if (!ACTIONS.includes(action)) return NextResponse.json({ error: 'unknown action' }, { status: 400 })
  if (!(await underHourlyLimit(`wo-act:${userId}`, 60, false))) return NextResponse.json({ error: 'rate_limited' }, { status: 429 })

  // RLS proves the caller is a party; the role comes from the row.
  const { data: wo } = await sb.from('work_orders').select('id, landlord_auth_id, provider_id, household_id').eq('id', id).maybeSingle()
  if (!wo) return NextResponse.json({ error: 'not found' }, { status: 404 })
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } })
  let by: ActorKind | null = null
  if (action === 'resolve_dispute') {
    const { data: adm } = await admin.from('admin_users').select('role').eq('user_id', userId).maybeSingle()
    if (adm) by = 'admin'
  }
  if (!by && wo.landlord_auth_id === userId) by = 'landlord'
  else {
    const { data: prov } = wo.provider_id ? await admin.from('service_providers').select('auth_id').eq('id', wo.provider_id).maybeSingle() : { data: null }
    if (prov && (prov as { auth_id: string }).auth_id === userId) by = 'provider'
    else {
      const { data: mem } = await admin.from('household_members').select('role').eq('household_id', wo.household_id).eq('user_id', userId).eq('status', 'active').maybeSingle()
      if (mem && (mem as { role: string }).role === 'tenant') by = 'tenant'
      else {
        const { data: adm } = await admin.from('admin_users').select('role').eq('user_id', userId).maybeSingle()
        if (adm) by = 'admin'
      }
    }
  }
  if (!by) return NextResponse.json({ error: 'not a party' }, { status: 403 })

  const r = await actOnWorkOrder(admin, { woId: id, action, by, actorId: userId, payload: body.payload || {} })
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
  return NextResponse.json({ ok: true, status: r.wo.status, work_order: r.wo })
}
