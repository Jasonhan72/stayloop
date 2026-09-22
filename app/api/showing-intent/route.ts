// /api/showing-intent — the tenant's "book a viewing" / "ask the landlord"
// from a listing page (2026-09-22, EliseAI benchmark items G + H: one
// conversation thread per prospect, the landlord's agent gets one card).
//
//   1. Caller must be signed in (their own JWT; anonymous users are told to
//      sign in — the landlord needs a real email to answer to).
//   2. The intent row is written under the caller's RLS client: `intents_self`
//      only lets a tenant write rows for their own tenants.id, and the DB
//      trigger guard_not_own_listing rejects a landlord asking about their
//      own unit (`own_listing`).
//   3. With the service role we resolve the listing's landlord to an auth user
//      and insert ONE pending action per (tenant, listing) on the landlord's
//      agent — a second message from the same tenant appends to the open card
//      instead of stacking cards. Approval runs the showing_request /
//      listing_inquiry executor in /api/agent/execute (email to the tenant
//      with the landlord's contact, intent → accepted).
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { underHourlyLimit } from '@/lib/rateLimit'
import { stripNul } from '@/lib/screening/jsonSafe'

export const runtime = 'edge'

const UUID = /^[0-9a-f-]{36}$/i

export async function POST(req: Request) {
  const rawAuth = req.headers.get('authorization') || ''
  const authHeader = rawAuth.replace(/[^\x20-\x7E]/g, '').trim()
  if (!authHeader) return NextResponse.json({ error: 'sign_in_required' }, { status: 401 })
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false, autoRefreshToken: false } },
  )
  const { data: ud, error: ue } = await sb.auth.getUser()
  if (ue || !ud?.user || ud.user.is_anonymous) return NextResponse.json({ error: 'sign_in_required' }, { status: 401 })
  const user = ud.user

  let body: { listing_id?: string; kind?: string; move_in_date?: string | null; message?: string }
  try {
    body = (await req.json()) as typeof body
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 })
  }
  const listingId = String(body.listing_id || '')
  if (!UUID.test(listingId)) return NextResponse.json({ error: 'listing_id required' }, { status: 400 })
  const kind = body.kind === 'question' ? 'question' : 'showing'
  const message = stripNul(String(body.message || '')).replace(/<[^>]*>/g, '').trim().slice(0, 2000)
  if (kind === 'question' && !message) return NextResponse.json({ error: 'message required' }, { status: 400 })
  const moveIn = typeof body.move_in_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.move_in_date) ? body.move_in_date : null

  if (!(await underHourlyLimit(`intent:${user.id}`, 10, false))) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429, headers: { 'Retry-After': '3600' } })
  }

  // Tenant hat — claim_tenant() creates the tenants row on first use.
  const { data: tenant, error: tErr } = await sb.rpc('claim_tenant')
  const tenantRow = tenant as { id: string; email: string; full_name: string | null } | null
  if (tErr || !tenantRow?.id) return NextResponse.json({ error: 'tenant profile unavailable' }, { status: 500 })

  const intentId = crypto.randomUUID()
  const { error: iErr } = await sb.from('showing_intents').insert({
    id: intentId,
    tenant_id: tenantRow.id,
    listing_id: listingId,
    kind,
    move_in_date: moveIn,
    message: message || null,
    status: 'pending',
  })
  if (iErr) {
    if (/own_listing/i.test(iErr.message)) return NextResponse.json({ error: 'own_listing' }, { status: 400 })
    return NextResponse.json({ error: iErr.message }, { status: 400 })
  }

  // Mirror onto the landlord's agent (service role).
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
  const { data: listing } = await admin
    .from('listings')
    .select('id, address, unit, landlord_id, source')
    .eq('id', listingId)
    .maybeSingle()
  if (!listing) return NextResponse.json({ ok: true, intent_id: intentId, delivered: false, reason: 'listing_not_found' })
  const { data: ll } = await admin
    .from('landlords')
    .select('id, auth_id')
    .or(`id.eq.${listing.landlord_id},auth_id.eq.${listing.landlord_id}`)
    .limit(1)
    .maybeSingle()
  const landlordAuthId = (ll?.auth_id as string | null) ?? null
  if (!landlordAuthId) {
    // Realtor.ca imports have no Stayloop landlord — the intent is recorded,
    // the UI already shows the brokerage contact for those.
    return NextResponse.json({ ok: true, intent_id: intentId, delivered: false, reason: 'no_landlord_account' })
  }

  const addr = [listing.address, listing.unit ? `#${listing.unit}` : ''].filter(Boolean).join(' ')
  const who = tenantRow.full_name || user.email || '租客'
  const actionType = kind === 'showing' ? 'showing_request' : 'listing_inquiry'
  const line = kind === 'showing'
    ? `想看房${moveIn ? `，期望入住 ${moveIn}` : ''}${message ? `：${message}` : ''}`
    : `提问：${message}`

  // One open card per (tenant, listing): append to it if it exists.
  const { data: open } = await admin
    .from('agent_pending_actions')
    .select('id, summary, metadata')
    .eq('user_id', landlordAuthId)
    .eq('status', 'pending')
    .in('action_type', ['showing_request', 'listing_inquiry'])
    .contains('metadata', { listing_id: listingId, tenant_auth_id: user.id })
    .limit(1)
    .maybeSingle()
  if (open) {
    const meta = (open.metadata as Record<string, unknown>) || {}
    const messages = Array.isArray(meta.messages) ? (meta.messages as unknown[]) : []
    await admin
      .from('agent_pending_actions')
      .update({
        summary: `${String(open.summary || '')}\n· ${line}`.slice(0, 4000),
        metadata: { ...meta, messages: [...messages, { kind, message, move_in_date: moveIn, intent_id: intentId, at: new Date().toISOString() }].slice(-20) },
      })
      .eq('id', open.id)
    return NextResponse.json({ ok: true, intent_id: intentId, delivered: true, merged: true })
  }

  const { error: aErr } = await admin.from('agent_pending_actions').insert({
    user_id: landlordAuthId,
    role: 'landlord',
    action_type: actionType,
    title: kind === 'showing' ? `看房请求：${who} · ${addr}` : `房源提问：${who} · ${addr}`,
    summary:
      `${who}（${user.email}）${line}。` +
      (kind === 'showing'
        ? '批准 = 同意安排看房：我会把你的联系邮箱发给对方，由你们直接约时间；拒绝则不回复。'
        : '批准 = 我把你的联系邮箱发给对方、由你直接回答；拒绝则不回复。') +
      ' 按 OHRC 租房政策，看房与回答提问不得因受保护特征区别对待。',
    recipient_label: user.email ?? null,
    data_scope: ['你的联系邮箱', '房源地址'],
    excluded_data: ['筛查报告', '其他申请人信息'],
    risk_level: 'low',
    status: 'pending',
    requires_approval: true,
    metadata: {
      intent_id: intentId,
      listing_id: listingId,
      tenant_auth_id: user.id,
      kind,
      move_in_date: moveIn,
      message,
      messages: [{ kind, message, move_in_date: moveIn, intent_id: intentId, at: new Date().toISOString() }],
      source: 'listing_page',
    },
  })
  if (aErr) {
    console.error('[showing-intent] pending action insert failed:', aErr.message)
    return NextResponse.json({ ok: true, intent_id: intentId, delivered: false, reason: 'action_insert_failed' })
  }
  return NextResponse.json({ ok: true, intent_id: intentId, delivered: true })
}
