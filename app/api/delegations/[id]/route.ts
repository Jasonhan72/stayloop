// POST /api/delegations/[id] { action: 'revoke' } — either side ends a
// delegation at once (节点 5). The principal (by account or by the email it
// was sent to) or the delegate may revoke; the row is never deleted; the
// other side is told; the audit row carries the delegation id.
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { underHourlyLimit } from '@/lib/rateLimit'
import { notifyUser } from '@/lib/push/notify'
import { sendEmail, renderAgentMessageEmail } from '@/lib/email'

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
  if (body.action !== 'revoke') return NextResponse.json({ error: 'unknown action' }, { status: 400 })
  if (!(await underHourlyLimit(`delegation-revoke:${ud.user.id}`, 30, false))) return NextResponse.json({ error: 'rate_limited' }, { status: 429 })

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
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
