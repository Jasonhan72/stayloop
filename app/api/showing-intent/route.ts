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
import { notifyUser } from '@/lib/push/notify'
import { ensureListingThread, postSystemMessage } from '@/lib/threads/server'
import { messageCenterHref } from '@/lib/threads/shared'

export const runtime = 'edge'

const UUID = /^[0-9a-f-]{36}$/i

const SHOWING_NOTE = '批准 = 同意安排看房：我会邮件告诉对方，你们在「消息」里的这段对话约时间（双方都看不到对方的私人邮箱）；拒绝则不回复。也可以直接去对话里回复。'
const QUESTION_NOTE = '批准 = 我邮件告诉对方你收到了，你在「消息」里的这段对话回答（双方都看不到对方的私人邮箱）；也可以直接去对话里回复。'
const OHRC_NOTE = ' 按 OHRC 租房政策，看房与回答提问不得因受保护特征区别对待。'

type Merged = { kind?: string; message?: string | null; move_in_date?: string | null; intent_id?: string; at?: string }

function lineOf(kind: 'showing' | 'question', moveIn: string | null, message: string): string {
  return kind === 'showing'
    ? `想看房${moveIn ? `，期望入住 ${moveIn}` : ''}${message ? `：${message}` : ''}`
    : `提问：${message}`
}

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

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
  const { data: listing } = await admin
    .from('listings')
    .select('id, address, unit, landlord_id, source, is_active, status')
    .eq('id', listingId)
    .maybeSingle()
  // Off the market (sweep 2026-10-01): a request nobody can grant is not recorded or sent.
  if (listing && (listing.is_active === false || listing.status === 'archived')) {
    return NextResponse.json({ error: 'listing_inactive' }, { status: 409 })
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
  // Relay (消息系统 A 期): the landlord sees the prospect's name, never their address.
  const who = tenantRow.full_name || '租客'
  // The listing-inquiry conversation: one per (listing, prospect). The request
  // itself is the prospect's message in it; the to-do card is only a reminder.
  const th = await ensureListingThread(admin, { id: listing.id as string, address: listing.address as string | null, unit: listing.unit as string | null }, user.id)
  if (th) {
    const text = kind === 'showing'
      ? `想预约看房${moveIn ? `（期望入住 ${moveIn}）` : ''}${message ? `：${message}` : ''}`
      : message
    await postSystemMessage(admin, th.id, { kind: 'message', channel: 'app', senderId: user.id, senderKind: 'tenant', actingRole: 'tenant', body: text.slice(0, 4000), meta: { intent_id: intentId, via: 'listing_page' } })
  }
  const hubUrl = th ? messageCenterHref(th.id) : '/landlord/todo'
  const actionType = kind === 'showing' ? 'showing_request' : 'listing_inquiry'
  const line = lineOf(kind, moveIn, message)

  // One open card per (tenant, listing): append to it if it exists.
  const { data: open } = await admin
    .from('agent_pending_actions')
    .select('id, action_type, summary, metadata')
    .eq('user_id', landlordAuthId)
    .eq('status', 'pending')
    .in('action_type', ['showing_request', 'listing_inquiry'])
    .contains('metadata', { listing_id: listingId, tenant_auth_id: user.id })
    .limit(1)
    .maybeSingle()
  if (open) {
    const meta = (open.metadata as Record<string, unknown>) || {}
    const prior = (Array.isArray(meta.messages) ? (meta.messages as Merged[]) : []).filter((x) => x && typeof x === 'object')
    // The executor answers every merged entry (each carries its intent_id); the
    // first message may predate the messages[] list, so it is folded in.
    const firstId = typeof meta.intent_id === 'string' ? meta.intent_id : null
    const base: Merged[] = firstId && !prior.some((x) => x.intent_id === firstId)
      ? [{ kind: meta.kind === 'question' ? 'question' : 'showing', message: typeof meta.message === 'string' ? meta.message : '', move_in_date: typeof meta.move_in_date === 'string' ? meta.move_in_date : null, intent_id: firstId }, ...prior]
      : prior
    const messages = [...base, { kind, message, move_in_date: moveIn, intent_id: intentId, at: new Date().toISOString() }].slice(-20)
    // A viewing joining a question card turns it into a showing card: approving
    // it must accept the viewing, and its summary must say so (sweep 2026-10-01).
    const upgrade = kind === 'showing' && open.action_type !== 'showing_request'
    if (upgrade) {
      // Never rewrite what approving does under a landlord who may be looking at
      // the 「房源提问」 card (review 2026-10-01): the question card is retired
      // ('superseded' — a click on it then fails as "not pending" and the to-dos
      // are re-read) and a fresh showing card carries every merged request.
      const { data: retired } = await admin
        .from('agent_pending_actions')
        .update({ status: 'expired', execution_result: { ok: false, reason: 'superseded', superseded_by: 'showing_request' } })
        .eq('id', open.id)
        .eq('status', 'pending')
        .select('id')
      if (retired && retired.length) {
        const summary = `${who} ${messages.map((x) => lineOf(x.kind === 'question' ? 'question' : 'showing', x.move_in_date ?? null, x.message ?? '')).join('；')}。${SHOWING_NOTE}${OHRC_NOTE}`
        const { error: upErr } = await admin.from('agent_pending_actions').insert({
          user_id: landlordAuthId,
          role: 'landlord',
          action_type: 'showing_request',
          title: `看房请求：${who} · ${addr}`,
          summary: summary.slice(0, 4000),
          recipient_label: who,
          data_scope: ['房源地址', '这段对话的链接'],
          excluded_data: ['你的私人邮箱', '筛查报告', '其他申请人信息'],
          risk_level: 'low',
          status: 'pending',
          requires_approval: true,
          metadata: { ...meta, intent_id: firstId ?? intentId, listing_id: listingId, tenant_auth_id: user.id, kind: 'showing', source: 'listing_page', thread_id: th?.id ?? meta.thread_id ?? null, messages, supersedes: open.id },
        })
        if (!upErr) {
          await notifyUser(admin, landlordAuthId, { kind: 'approval', title: `看房请求 · ${addr}`, body: `${who}：${line.slice(0, 120)}`, url: hubUrl })
          return NextResponse.json({ ok: true, intent_id: intentId, delivered: true, merged: true, thread_id: th?.id ?? null })
        }
        console.error('[showing-intent] superseding showing card insert failed:', upErr.message)
      }
    } else {
      const summary = `${String(open.summary || '')}\n· ${line}`
      // Only while still pending: a card the landlord decided in the meantime is
      // never rewritten, and this request then gets a card of its own below.
      const { data: mergedRows } = await admin
        .from('agent_pending_actions')
        .update({
          summary: summary.slice(0, 4000),
          metadata: { ...meta, thread_id: th?.id ?? meta.thread_id ?? null, messages },
        })
        .eq('id', open.id)
        .eq('status', 'pending')
        .select('id')
      if (mergedRows && mergedRows.length) {
        await notifyUser(admin, landlordAuthId, { kind: 'approval', title: kind === 'showing' ? `看房请求 · ${addr}` : `房源提问 · ${addr}`, body: `${who}：${line.slice(0, 120)}`, url: hubUrl })
        return NextResponse.json({ ok: true, intent_id: intentId, delivered: true, merged: true, thread_id: th?.id ?? null })
      }
    }
  }

  const { error: aErr } = await admin.from('agent_pending_actions').insert({
    user_id: landlordAuthId,
    role: 'landlord',
    action_type: actionType,
    title: kind === 'showing' ? `看房请求：${who} · ${addr}` : `房源提问：${who} · ${addr}`,
    summary: `${who} ${line}。` + (kind === 'showing' ? SHOWING_NOTE : QUESTION_NOTE) + OHRC_NOTE,
    recipient_label: who,
    data_scope: ['房源地址', '这段对话的链接'],
    excluded_data: ['你的私人邮箱', '筛查报告', '其他申请人信息'],
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
      thread_id: th?.id ?? null,
    },
  })
  if (aErr) {
    console.error('[showing-intent] pending action insert failed:', aErr.message)
    return NextResponse.json({ ok: true, intent_id: intentId, delivered: false, reason: 'action_insert_failed' })
  }
  await notifyUser(admin, landlordAuthId, { kind: 'approval', title: kind === 'showing' ? `看房请求 · ${addr}` : `房源提问 · ${addr}`, body: `${who}：${line.slice(0, 120)}`, url: hubUrl })
  return NextResponse.json({ ok: true, intent_id: intentId, delivered: true, thread_id: th?.id ?? null })
}
