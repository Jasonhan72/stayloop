// /api/admin/consumer — the consumer file queue (V0.8 G19; the page is G21's
// /admin/consumer-requests). Admin JWT (is_stayloop_admin), service-role writes.
//   GET  → { requests: [...request + candidates / matched summaries], disputes: [...] }
//   POST { action:'confirm_match', request_id, screening_ids[] }   human match after needs_review
//        { action:'close', request_id, note }                       nothing to disclose / abandoned
//        { action:'mark_delivered', request_id, note }              mail / phone disclosure done
//        { action:'resolve_dispute', dispute_id, resolution, note } s.13: correct / supplement / delete / maintain
// resolve_dispute appends a screening_corrections row (never edits the
// screening itself), notifies everyone who received the report in the last 60
// days (landlord email, delegation principal, partner webhook when the screening
// has one) and emails the applicant; every notification attempt is recorded in
// consumer_disputes.notified_to.
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/email'
import { applicantDisputeResultEmail, correctionNoticeEmail } from '@/lib/consumer/emails'
import { CORRECTION_ACTIONS, type ConsumerDispute, type ConsumerRequest, type CorrectionAction } from '@/lib/consumer/types'
import { NO_STORE, adminClient, audit, dueAtFor, maskEmail, screeningSummaries, siteUrl } from '@/lib/consumer/server'

export const runtime = 'edge'

const SIXTY_DAYS_MS = 60 * 86_400_000

async function guard(req: Request) {
  const rawAuth = req.headers.get('authorization') || ''
  const authHeader = rawAuth.replace(/[^\x20-\x7E]/g, '').trim()
  if (!authHeader) return { error: NextResponse.json({ error: 'Authentication required' }, { status: 401, headers: NO_STORE }) }
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false, autoRefreshToken: false } })
  const { data: ud, error: ue } = await sb.auth.getUser()
  if (ue || !ud?.user) return { error: NextResponse.json({ error: 'Invalid session' }, { status: 401, headers: NO_STORE }) }
  const { data: isAdmin } = await sb.rpc('is_stayloop_admin')
  if (isAdmin !== true) return { error: NextResponse.json({ error: 'admin only' }, { status: 403, headers: NO_STORE }) }
  return { admin: adminClient(), userId: ud.user.id }
}

const REQUEST_COLUMNS = 'id, email, email_verified_at, name, date_of_birth, delivery, mail_address, phone, status, matched_screening_ids, candidate_screening_ids, due_at, fulfilled_at, closed_at, admin_note, handled_by, lang, created_at, updated_at'
const DISPUTE_COLUMNS = 'id, request_id, screening_id, item_kind, item_ref, item_label, statement, evidence_path, status, resolution_note, resolved_by, resolved_at, notified_at, notified_to, created_at'

export async function GET(req: Request) {
  const g = await guard(req)
  if ('error' in g) return g.error
  const { data: reqs } = await g.admin.from('consumer_requests').select(REQUEST_COLUMNS).order('created_at', { ascending: false }).limit(300)
  const rows = (reqs ?? []) as Omit<ConsumerRequest, 'token' | 'token_expires_at' | 'ip_hash'>[]
  const ids = Array.from(new Set(rows.flatMap((r) => [...(r.candidate_screening_ids ?? []), ...(r.matched_screening_ids ?? [])])))
  const summaries = await screeningSummaries(g.admin, ids)
  const byId = new Map(summaries.map((s) => [s.screening_id, s]))
  const requests = rows.map((r) => ({
    ...r,
    email_masked: maskEmail(r.email),
    candidates: (r.candidate_screening_ids ?? []).map((id) => byId.get(id) ?? { screening_id: id, created_at: null, landlord_name: null, property: null }),
    matched: (r.matched_screening_ids ?? []).map((id) => byId.get(id) ?? { screening_id: id, created_at: null, landlord_name: null, property: null }),
  }))
  const { data: disp } = await g.admin.from('consumer_disputes').select(DISPUTE_COLUMNS).order('created_at', { ascending: false }).limit(300)
  return NextResponse.json({ requests, disputes: (disp ?? []) as ConsumerDispute[], now: new Date().toISOString() }, { headers: NO_STORE })
}

type Body = { action?: string; request_id?: string; screening_ids?: unknown; note?: string; dispute_id?: string; resolution?: string }

export async function POST(req: Request) {
  const g = await guard(req)
  if ('error' in g) return g.error
  let body: Body
  try { body = (await req.json()) as Body } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400, headers: NO_STORE }) }
  const note = String(body.note ?? '').trim().slice(0, 2000) || null
  const now = new Date().toISOString()
  const isUuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v)

  if (body.action === 'confirm_match' || body.action === 'close' || body.action === 'mark_delivered') {
    if (!isUuid(body.request_id)) return NextResponse.json({ error: 'invalid_input', field: 'request_id' }, { status: 400, headers: NO_STORE })
    const { data: r } = await g.admin.from('consumer_requests').select(REQUEST_COLUMNS).eq('id', body.request_id).maybeSingle()
    const request = r as ConsumerRequest | null
    if (!request) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: NO_STORE })
    let patch: Record<string, unknown>
    if (body.action === 'confirm_match') {
      const ids = (Array.isArray(body.screening_ids) ? body.screening_ids : []).filter(isUuid)
      // A human may only confirm among the email-chain candidates — never a screening the email never reached.
      const allowed = new Set(request.candidate_screening_ids ?? [])
      const bad = ids.filter((id) => !allowed.has(id))
      if (!ids.length || bad.length) return NextResponse.json({ error: 'screening_not_candidate', bad }, { status: 400, headers: NO_STORE })
      const fulfilNow = request.delivery === 'electronic'
      patch = { status: fulfilNow ? 'fulfilled' : 'matched', matched_screening_ids: ids, fulfilled_at: fulfilNow ? now : null, due_at: request.due_at ?? dueAtFor(new Date()), admin_note: note ?? request.admin_note, handled_by: g.userId }
    } else if (body.action === 'close') {
      patch = { status: 'closed', closed_at: now, admin_note: note ?? request.admin_note, handled_by: g.userId }
    } else {
      if (request.status !== 'matched') return NextResponse.json({ error: 'not_matched' }, { status: 409, headers: NO_STORE })
      patch = { status: 'fulfilled', fulfilled_at: now, admin_note: note ?? request.admin_note, handled_by: g.userId }
    }
    const { error } = await g.admin.from('consumer_requests').update(patch).eq('id', request.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: NO_STORE })
    await g.admin.from('agent_audit_events').insert({ actor_id: g.userId, actor_type: 'user', action: `consumer_request_${body.action}`, target_type: 'consumer_request', target_id: request.id, acting_role: 'admin', metadata: { ...patch, note } }).then(() => undefined, () => undefined)
    return NextResponse.json({ ok: true, status: patch.status }, { headers: NO_STORE })
  }

  if (body.action === 'resolve_dispute') {
    if (!isUuid(body.dispute_id)) return NextResponse.json({ error: 'invalid_input', field: 'dispute_id' }, { status: 400, headers: NO_STORE })
    const resolution = String(body.resolution ?? '') as CorrectionAction
    if (!CORRECTION_ACTIONS.includes(resolution)) return NextResponse.json({ error: 'invalid_input', field: 'resolution' }, { status: 400, headers: NO_STORE })
    if (resolution === 'maintained' && !note) return NextResponse.json({ error: 'note_required' }, { status: 400, headers: NO_STORE })
    const { data: d } = await g.admin.from('consumer_disputes').select(DISPUTE_COLUMNS).eq('id', body.dispute_id).maybeSingle()
    const dispute = d as ConsumerDispute | null
    if (!dispute) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: NO_STORE })
    if (dispute.status !== 'open') return NextResponse.json({ error: 'already_resolved', status: dispute.status }, { status: 409, headers: NO_STORE })
    const { data: r } = await g.admin.from('consumer_requests').select(REQUEST_COLUMNS).eq('id', dispute.request_id).maybeSingle()
    const request = r as ConsumerRequest | null
    if (!request) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: NO_STORE })

    // 1. Append-only correction on the screening (the report pages read screening_corrections).
    if (dispute.screening_id) {
      const { error: cErr } = await g.admin.from('screening_corrections').insert({ screening_id: dispute.screening_id, dispute_id: dispute.id, item_kind: dispute.item_kind, item_ref: dispute.item_ref, item_label: dispute.item_label, action: resolution, note, created_by: g.userId })
      if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500, headers: NO_STORE })
    }
    // 2. Dispute status.
    const { error: dErr } = await g.admin.from('consumer_disputes').update({ status: resolution, resolution_note: note, resolved_by: g.userId, resolved_at: now }).eq('id', dispute.id)
    if (dErr) return NextResponse.json({ error: dErr.message }, { status: 500, headers: NO_STORE })

    // 3. s.13(2): everyone who received the report in the last 60 days.
    const notified: ConsumerDispute['notified_to'] = []
    const applicantLabel = request.name || maskEmail(request.email)
    if (dispute.screening_id) {
      const { data: s } = await g.admin.from('screenings').select('id, landlord_id, scored_at, created_at, delegation_id, webhook_url').eq('id', dispute.screening_id).maybeSingle()
      const scr = s as { id: string; landlord_id: string | null; scored_at: string | null; created_at: string; delegation_id: string | null; webhook_url: string | null } | null
      const receivedAt = scr ? new Date(scr.scored_at ?? scr.created_at).getTime() : 0
      if (scr && Date.now() - receivedAt <= SIXTY_DAYS_MS) {
        const reportUrl = `${siteUrl()}/screening/${scr.id}/report`
        const targets: Array<{ to: string; kind: 'landlord' | 'principal'; name: string | null }> = []
        if (scr.landlord_id) {
          const { data: ll } = await g.admin.from('landlords').select('full_name, email').or(`id.eq.${scr.landlord_id},auth_id.eq.${scr.landlord_id}`).limit(1).maybeSingle()
          let email = (ll as { email?: string | null } | null)?.email ?? null
          let name = (ll as { full_name?: string | null } | null)?.full_name ?? null
          if (!email) { const { data: au } = await g.admin.auth.admin.getUserById(scr.landlord_id); email = au?.user?.email ?? null }
          if (!name) { const { data: ag } = await g.admin.from('agent_profiles').select('legal_name').eq('auth_id', scr.landlord_id).maybeSingle(); name = (ag as { legal_name?: string } | null)?.legal_name ?? null }
          if (email) targets.push({ to: email, kind: 'landlord', name })
        }
        if (scr.delegation_id) {
          const { data: del } = await g.admin.from('delegations').select('principal_email, principal_name').eq('id', scr.delegation_id).maybeSingle()
          const p = del as { principal_email?: string; principal_name?: string | null } | null
          if (p?.principal_email) targets.push({ to: p.principal_email, kind: 'principal', name: p.principal_name ?? null })
        }
        for (const t of targets) {
          const mail = correctionNoticeEmail({ recipientName: t.name, screeningId: scr.id, applicantLabel, action: resolution, itemLabel: dispute.item_label, note, reportUrl })
          const sent = await sendEmail({ to: t.to, subject: mail.subject, html: mail.html, text: mail.text, fromName: 'Stayloop' })
          notified.push({ to: t.to, kind: t.kind, ok: sent.ok, at: new Date().toISOString() })
        }
        if (scr.webhook_url && /^https:\/\//i.test(scr.webhook_url)) {
          let ok = false
          try {
            const res = await fetch(scr.webhook_url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(8000), body: JSON.stringify({ event: 'screening.correction', screening_id: scr.id, dispute_id: dispute.id, action: resolution, item_kind: dispute.item_kind, item_ref: dispute.item_ref, item_label: dispute.item_label, note, at: now }) })
            ok = res.ok
          } catch { ok = false }
          notified.push({ to: scr.webhook_url, kind: 'partner_webhook', ok, at: new Date().toISOString() })
        }
      }
    }
    // 4. The applicant.
    const result = applicantDisputeResultEmail({ dispute: { item_label: dispute.item_label, status: resolution, resolution_note: note }, lang: request.lang, fileUrl: `${siteUrl()}/my-file` })
    const sentApplicant = await sendEmail({ to: request.email, subject: result.subject, html: result.html, text: result.text, fromName: 'Stayloop' })
    notified.push({ to: request.email, kind: 'applicant', ok: sentApplicant.ok, at: new Date().toISOString() })
    await g.admin.from('consumer_disputes').update({ notified_at: new Date().toISOString(), notified_to: notified }).eq('id', dispute.id)

    await g.admin.from('agent_audit_events').insert({ actor_id: g.userId, actor_type: 'user', action: 'consumer_dispute_resolved', target_type: 'consumer_dispute', target_id: dispute.id, acting_role: 'admin', metadata: { request_id: request.id, screening_id: dispute.screening_id, resolution, item_kind: dispute.item_kind, item_ref: dispute.item_ref } }).then(() => undefined, () => undefined)
    await audit(g.admin, 'correction_notice_emailed', request, { dispute_id: dispute.id, screening_id: dispute.screening_id, resolution, notified }, 'consumer_dispute')
    return NextResponse.json({ ok: true, status: resolution, notified }, { headers: NO_STORE })
  }

  return NextResponse.json({ error: 'invalid_input', field: 'action' }, { status: 400, headers: NO_STORE })
}
