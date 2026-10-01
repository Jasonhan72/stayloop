// POST /api/delegations/[id] { action: 'revoke' } — either side ends a
// delegation at once (节点 5). The principal (by account or by the email it
// was sent to) or the delegate may revoke; the row is never deleted; the
// other side is told; the audit row carries the delegation id.
// { action: 'resend' } — the delegate re-sends the confirmation link of a
// still-pending delegation (the first send can fail; sweep 2026-10-01). It goes
// to the email the delegation is bound to, never to an address in the body.
import { NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { underHourlyLimit } from '@/lib/rateLimit'
import { notifyUser } from '@/lib/push/notify'
import { sendEmail, renderAgentMessageEmail } from '@/lib/email'
import { isRegistrationLive } from '@/lib/agentProfile'
import type { DelegationAction, DelegationScope } from '@/lib/delegations/shared'
import { sendDelegationLink } from '../confirmEmail'

export const runtime = 'edge'
const UUID = /^[0-9a-f-]{36}$/i

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  if (!UUID.test(id)) return NextResponse.json({ error: 'bad id' }, { status: 400 })
  const authHeader = (req.headers.get('authorization') || '').replace(/[^\x20-\x7E]/g, '').trim()
  if (!authHeader) return NextResponse.json({ error: 'sign_in_required' }, { status: 401 })
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: authHeader } }, auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: ud } = await sb.auth.getUser()
  if (!ud?.user || ud.user.is_anonymous) return NextResponse.json({ error: 'sign_in_required' }, { status: 401 })
  let body: { action?: string }
  try { body = (await req.json()) as typeof body } catch { return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 }) }
  if (body.action !== 'revoke' && body.action !== 'resend') return NextResponse.json({ error: 'unknown action' }, { status: 400 })
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
  if (body.action === 'resend') return resend(admin, sb, id, ud.user.id)
  if (!(await underHourlyLimit(`delegation-revoke:${ud.user.id}`, 30, false))) return NextResponse.json({ error: 'rate_limited' }, { status: 429 })

  const { data } = await admin.from('delegations').select('id, principal_auth_id, principal_email, principal_name, delegate_auth_id, status, scope').eq('id', id).maybeSingle()
  const d = data as { id: string; principal_auth_id: string | null; principal_email: string; principal_name: string | null; delegate_auth_id: string; status: string; scope: string[] } | null
  if (!d) return NextResponse.json({ error: 'not found' }, { status: 404 })
  const me = ud.user.id; const email = (ud.user.email || '').toLowerCase()
  const asPrincipal = d.principal_auth_id === me || (!!email && d.principal_email.toLowerCase() === email)
  const asDelegate = d.delegate_auth_id === me
  if (!asPrincipal && !asDelegate) return NextResponse.json({ error: 'not a party' }, { status: 403 })
  if (!['pending', 'active'].includes(d.status)) return NextResponse.json({ error: `status_${d.status}` }, { status: 409 })
  const now = new Date().toISOString()
  const { data: hit } = await admin.from('delegations').update({ status: 'revoked', revoked_at: now, revoked_by: me, confirm_token: null, updated_at: now }).eq('id', id).in('status', ['pending', 'active']).select('id')
  if (!hit || !hit.length) return NextResponse.json({ error: 'status_changed' }, { status: 409 })
  await admin.from('agent_audit_events').insert({ actor_id: me, actor_type: 'user', action: 'delegation_revoked', target_type: 'delegation', target_id: id, acting_role: asDelegate ? 'agent' : null, delegation_id: id, metadata: { by: asDelegate ? 'delegate' : 'principal', previous_status: d.status } }).then(() => undefined, () => undefined)
  // Tell the other side. The principal may have no account: email.
  if (asPrincipal) {
    void notifyUser(admin, d.delegate_auth_id, { kind: 'event', title: `委托已撤销 / Delegation revoked · ${d.principal_name || d.principal_email}`, body: d.scope.join(' · '), url: '/agent/clients' })
  } else {
    if (d.principal_auth_id) void notifyUser(admin, d.principal_auth_id, { kind: 'event', title: '经纪撤回了委托 / Your agent withdrew the delegation', body: d.scope.join(' · '), url: '/settings' })
    const subject = '经纪撤回了委托 / Your agent withdrew the delegation'
    const { html, text } = renderAgentMessageEmail({ subject, body: `${d.principal_name || ''} 你好，\n\n你的经纪撤回了在 Stayloop 上的委托（范围：${d.scope.join('、')}），即时生效。\n\nHi ${d.principal_name || ''},\n\nYour agent withdrew the Stayloop delegation (scope: ${d.scope.join(', ')}), effective immediately.` })
    void sendEmail({ to: d.principal_email, subject, html, text })
  }
  return NextResponse.json({ ok: true })
}

async function resend(admin: SupabaseClient, sb: SupabaseClient, id: string, me: string) {
  if (!(await underHourlyLimit(`delegation-resend:${me}`, 10, false))) return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  const { data } = await admin.from('delegations').select('id, principal_email, principal_name, delegate_auth_id, client_id, scope, allowed_actions, expires_at, status, confirm_token').eq('id', id).maybeSingle()
  const d = data as { id: string; principal_email: string; principal_name: string | null; delegate_auth_id: string; client_id: string | null; scope: DelegationScope[]; allowed_actions: DelegationAction[]; expires_at: string; status: string; confirm_token: string | null } | null
  if (!d) return NextResponse.json({ error: 'not found' }, { status: 404 })
  if (d.delegate_auth_id !== me) return NextResponse.json({ error: 'not a party' }, { status: 403 })
  if (d.status !== 'pending' || !d.confirm_token || new Date(d.expires_at).getTime() <= Date.now()) return NextResponse.json({ error: `status_${d.status}` }, { status: 409 })
  // The agent's registration (RLS: own row) must still be live, as when it was proposed.
  const { data: prof } = await sb.from('agent_profiles').select('status, legal_name, reco_number, brokerage_name, expires_at').eq('auth_id', me).maybeSingle()
  const p = prof as { status: string; legal_name: string; reco_number: string; brokerage_name: string; expires_at: string | null } | null
  if (!p || !isRegistrationLive(p.status) || (p.expires_at && p.expires_at < new Date().toISOString().slice(0, 10))) return NextResponse.json({ error: 'registration_not_live' }, { status: 403 })
  let clientRole: string | null = null
  if (d.client_id) {
    const { data: c } = await sb.from('agent_clients').select('client_role, email').eq('id', d.client_id).maybeSingle()
    const row = c as { client_role?: string; email?: string | null } | null
    // The link is bound to principal_email; once the client's email was corrected, re-sending it would hand the
    // old address a way to confirm and join this client's conversation (sweep 2026-10-01).
    if (row && (row.email ?? '').trim().toLowerCase() !== d.principal_email.trim().toLowerCase()) return NextResponse.json({ error: 'client_email_changed' }, { status: 409 })
    clientRole = row?.client_role ?? null
  }
  const emailed = await sendDelegationLink(admin, {
    delegationId: d.id, token: d.confirm_token, to: d.principal_email, clientName: d.principal_name || d.principal_email, clientId: d.client_id, clientRole,
    agentAuthId: me, agent: { legal_name: p.legal_name, reco_number: p.reco_number, brokerage_name: p.brokerage_name },
    scope: d.scope, actions: d.allowed_actions, expiresAt: d.expires_at,
  })
  await admin.from('agent_audit_events').insert({ actor_id: me, actor_type: 'user', action: 'delegation_link_resent', target_type: 'delegation', target_id: id, acting_role: 'agent', delegation_id: id, metadata: { emailed } }).then(() => undefined, () => undefined)
  return NextResponse.json({ ok: true, emailed })
}
