// /api/delegations/confirm — the principal's side of a delegation (节点 5).
//   GET  ?token=…  → what is being asked (agent, scope, actions, term, basis), for the /delegate/[token] page
//   POST {token}   → confirm: the caller must be signed in with the principal's email; the token is consumed
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { underHourlyLimit } from '@/lib/rateLimit'
import { notifyUser } from '@/lib/push/notify'

export const runtime = 'edge'
const TOKEN = /^[0-9a-f]{32,80}$/i
const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const ip = (req: Request) => (req.headers.get('cf-connecting-ip') || req.headers.get('x-forwarded-for') || 'unknown').split(',')[0].trim()
const mask = (email: string) => { const [u, d] = email.split('@'); return `${(u || '').slice(0, 1)}***@${d || ''}` }

type Row = { id: string; principal_email: string; principal_name: string | null; delegate_auth_id: string; client_id: string | null; scope: string[]; allowed_actions: string[]; expires_at: string; basis_version: string; status: string; created_at: string }

async function peek(token: string) {
  const a = admin()
  const { data } = await a.from('delegations').select('id, principal_email, principal_name, delegate_auth_id, client_id, scope, allowed_actions, expires_at, basis_version, status, created_at').eq('confirm_token', token).maybeSingle()
  const d = data as Row | null
  if (!d) return null
  const { data: prof } = await a.from('agent_profiles').select('legal_name, reco_number, brokerage_name, category, status').eq('auth_id', d.delegate_auth_id).maybeSingle()
  return { d, agent: prof as { legal_name: string; reco_number: string; brokerage_name: string; category: string; status: string } | null }
}

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get('token') || ''
  if (!TOKEN.test(token)) return NextResponse.json({ error: 'not found' }, { status: 404 })
  if (!(await underHourlyLimit(`delegation-peek:${ip(req)}`, 60, true))) return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  const v = await peek(token)
  if (!v) return NextResponse.json({ error: 'not found' }, { status: 404, headers: { 'Referrer-Policy': 'no-referrer' } })
  return NextResponse.json({
    id: v.d.id, status: v.d.status, scope: v.d.scope, allowed_actions: v.d.allowed_actions, expires_at: v.d.expires_at, basis_version: v.d.basis_version, created_at: v.d.created_at,
    principal_email_masked: mask(v.d.principal_email), principal_name: v.d.principal_name,
    agent: v.agent ? { legal_name: v.agent.legal_name, reco_number: v.agent.reco_number, brokerage_name: v.agent.brokerage_name, category: v.agent.category } : null,
  }, { headers: { 'Referrer-Policy': 'no-referrer', 'Cache-Control': 'no-store' } })
}

export async function POST(req: Request) {
  const authHeader = (req.headers.get('authorization') || '').replace(/[^\x20-\x7E]/g, '').trim()
  if (!authHeader) return NextResponse.json({ error: 'sign_in_required' }, { status: 401 })
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: authHeader } }, auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: ud } = await sb.auth.getUser()
  if (!ud?.user || ud.user.is_anonymous || !ud.user.email) return NextResponse.json({ error: 'sign_in_required' }, { status: 401 })
  let body: { token?: string }
  try { body = (await req.json()) as typeof body } catch { return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 }) }
  const token = String(body.token || '')
  if (!TOKEN.test(token)) return NextResponse.json({ error: 'not found' }, { status: 404 })
  if (!(await underHourlyLimit(`delegation-confirm:${ud.user.id}`, 20, false))) return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  const v = await peek(token)
  if (!v) return NextResponse.json({ error: 'not found' }, { status: 404 })
  if (v.d.principal_email.toLowerCase() !== ud.user.email.toLowerCase()) return NextResponse.json({ error: 'email_mismatch', principal_email_masked: mask(v.d.principal_email) }, { status: 403 })
  if (v.d.status !== 'pending') return NextResponse.json({ error: `status_${v.d.status}` }, { status: 409 })
  if (new Date(v.d.expires_at).getTime() <= Date.now()) return NextResponse.json({ error: 'expired' }, { status: 409 })
  const a = admin()
  // The agent corrected the client's email after this link went out: the old address must not become the principal
  // (an active principal is the client side of the agent ↔ client conversation). The agent re-proposes to the new one.
  if (v.d.client_id) {
    const { data: c } = await a.from('agent_clients').select('email').eq('id', v.d.client_id).maybeSingle()
    const current = ((c as { email?: string | null } | null)?.email ?? '').trim().toLowerCase()
    if (c && current !== v.d.principal_email.trim().toLowerCase()) return NextResponse.json({ error: 'client_email_changed' }, { status: 409 })
  }
  const now = new Date().toISOString()
  const { data: hit } = await a.from('delegations').update({ status: 'active', principal_auth_id: ud.user.id, confirmed_at: now, confirm_token: null, updated_at: now }).eq('id', v.d.id).eq('status', 'pending').select('id')
  if (!hit || !hit.length) return NextResponse.json({ error: 'status_changed' }, { status: 409 })
  await a.from('agent_audit_events').insert({ actor_id: ud.user.id, actor_type: 'user', action: 'delegation_confirmed', target_type: 'delegation', target_id: v.d.id, delegation_id: v.d.id, metadata: { delegate_auth_id: v.d.delegate_auth_id, scope: v.d.scope, allowed_actions: v.d.allowed_actions, expires_at: v.d.expires_at, basis_version: v.d.basis_version } }).then(() => undefined, () => undefined)
  void notifyUser(a, v.d.delegate_auth_id, { kind: 'event', title: `客户确认了委托 / Delegation confirmed · ${v.d.principal_name || mask(v.d.principal_email)}`, body: `${v.d.scope.join(' · ')} · ${v.d.expires_at.slice(0, 10)}`, url: '/agent/clients' })
  return NextResponse.json({ ok: true, id: v.d.id })
}
