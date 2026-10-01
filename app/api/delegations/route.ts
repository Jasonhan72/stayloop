// POST /api/delegations — an agent proposes a delegation to a client (节点 5,
// 2026-09-27). Preconditions the server checks itself: the caller's RECO
// registration is live; the client row is theirs, has an email, and both
// TRESA dates are recorded (written representation agreement + Information
// Guide). The row is created pending with a confirm token that only the
// principal ever sees (emailed link); nothing is delegated until they confirm
// while signed in with that email.
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { underHourlyLimit } from '@/lib/rateLimit'
import { isRegistrationLive } from '@/lib/agentProfile'
import { BASIS_VERSION, validateProposal, type DelegationAction, type DelegationScope } from '@/lib/delegations/shared'
import { sendDelegationLink } from './confirmEmail'

export const runtime = 'edge'

export async function POST(req: Request) {
  const authHeader = (req.headers.get('authorization') || '').replace(/[^\x20-\x7E]/g, '').trim()
  if (!authHeader) return NextResponse.json({ error: 'sign_in_required' }, { status: 401 })
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: authHeader } }, auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: ud } = await sb.auth.getUser()
  if (!ud?.user || ud.user.is_anonymous) return NextResponse.json({ error: 'sign_in_required' }, { status: 401 })
  let body: Record<string, unknown>
  try { body = (await req.json()) as Record<string, unknown> } catch { return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 }) }
  const v = validateProposal({ client_id: String(body.client_id || ''), scope: body.scope, allowed_actions: body.allowed_actions, months: body.months })
  if (!v.ok) return NextResponse.json({ error: `invalid_${v.reason}` }, { status: 400 })
  if (!(await underHourlyLimit(`delegation-propose:${ud.user.id}`, 20, false))) return NextResponse.json({ error: 'rate_limited' }, { status: 429 })

  // The agent's own registration (RLS: own row) and the client (RLS: own row).
  const [{ data: prof }, { data: client }] = await Promise.all([
    sb.from('agent_profiles').select('status, legal_name, reco_number, brokerage_name, category, expires_at').eq('auth_id', ud.user.id).maybeSingle(),
    sb.from('agent_clients').select('id, name, email, client_role, representation_agreement_at, info_guide_given_at').eq('id', v.value.client_id).maybeSingle(),
  ])
  const p = prof as { status: string; legal_name: string; reco_number: string; brokerage_name: string; category: string; expires_at: string | null } | null
  if (!p || !isRegistrationLive(p.status) || (p.expires_at && p.expires_at < new Date().toISOString().slice(0, 10))) return NextResponse.json({ error: 'registration_not_live' }, { status: 403 })
  const c = client as { id: string; name: string; email: string | null; client_role: string; representation_agreement_at: string | null; info_guide_given_at: string | null } | null
  if (!c) return NextResponse.json({ error: 'client_not_found' }, { status: 404 })
  if (!c.email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c.email)) return NextResponse.json({ error: 'client_email_required' }, { status: 422 })
  if (!c.representation_agreement_at || !c.info_guide_given_at) return NextResponse.json({ error: 'paperwork_required' }, { status: 422 })

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
  const { data: existing } = await admin.from('delegations').select('id, status').eq('delegate_auth_id', ud.user.id).eq('client_id', c.id).in('status', ['pending', 'active']).gt('expires_at', new Date().toISOString()).limit(1)
  if (existing && existing.length) return NextResponse.json({ error: 'already_delegated', delegation_id: (existing[0] as { id: string }).id }, { status: 409 })

  const token = (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, '')
  const expiresAt = new Date(Date.now() + v.value.months * 30 * 86_400_000).toISOString()
  const { data: row, error } = await admin.from('delegations').insert({
    principal_email: c.email.trim().toLowerCase(), principal_name: c.name, delegate_auth_id: ud.user.id, client_id: c.id,
    scope: v.value.scope, allowed_actions: v.value.allowed_actions, expires_at: expiresAt, basis_version: BASIS_VERSION, status: 'pending', confirm_token: token,
  }).select('id, status, expires_at, scope, allowed_actions').maybeSingle()
  if (error || !row) return NextResponse.json({ error: error?.message || 'insert failed' }, { status: 500 })

  // Whether the link actually left is stored on the row and returned: the agent is told
  // when it did not, and can resend or withdraw from the client book (sweep 2026-10-01).
  const emailed = await sendDelegationLink(admin, {
    delegationId: (row as { id: string }).id, token, to: c.email.trim().toLowerCase(), clientName: c.name, clientId: c.id, clientRole: c.client_role,
    agentAuthId: ud.user.id, agent: { legal_name: p.legal_name, reco_number: p.reco_number, brokerage_name: p.brokerage_name },
    scope: v.value.scope as DelegationScope[], actions: v.value.allowed_actions as DelegationAction[], expiresAt,
  })
  const sent = { ok: emailed }
  await admin.from('agent_audit_events').insert({ actor_id: ud.user.id, actor_type: 'user', action: 'delegation_proposed', target_type: 'delegation', target_id: (row as { id: string }).id, acting_role: 'agent', delegation_id: (row as { id: string }).id, metadata: { client_id: c.id, scope: v.value.scope, allowed_actions: v.value.allowed_actions, expires_at: expiresAt, emailed: sent.ok } }).then(() => undefined, () => undefined)
  return NextResponse.json({ delegation: row, emailed: sent.ok })
}
