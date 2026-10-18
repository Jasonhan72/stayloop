// /api/agent/intake-links — the agent's intake links (V1.0 阶段 2 · 丙 #13, 2026-10-16).
//   GET            → own links + what came in through them (submissions are service-role
//                    only, so the client table learns 「材料已到」 here, never from the table).
//   POST {client_id?, label?}          → mint a link (RECO registration live; a client, if
//                    given, must be the agent's own LANDLORD client). Token minted server side.
//   POST {action:'revoke', id}         → revoke (also possible from the browser via RLS;
//                    kept here so the client table has one call shape).
// The token is returned on creation and on GET: the rows are the agent's own.
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { underHourlyLimit } from '@/lib/rateLimit'
import { isRegistrationLive } from '@/lib/agentProfile'
import { INTAKE_LINK_DAYS, intakeLinkExpiry, intakeLinkUrl, makeIntakeToken } from '@/lib/agent/intakeLinks'

export const runtime = 'edge'

const SITE = () => (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.stayloop.ai').replace(/\/$/, '')
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function caller(req: Request) {
  const authHeader = (req.headers.get('authorization') || '').replace(/[^\x20-\x7E]/g, '').trim()
  if (!authHeader) return null
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: authHeader } }, auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: ud } = await sb.auth.getUser()
  if (!ud?.user || ud.user.is_anonymous) return null
  return { sb, uid: ud.user.id }
}
const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } })

export async function GET(req: Request) {
  const c = await caller(req)
  if (!c) return NextResponse.json({ error: 'sign_in_required' }, { status: 401 })
  const a = admin()
  const { data: links } = await a.from('agent_intake_links').select('id, client_id, token, label, expires_at, revoked_at, used_count, created_at').eq('agent_auth_id', c.uid).order('created_at', { ascending: false }).limit(200)
  const ids = ((links ?? []) as { id: string }[]).map((l) => l.id)
  const subs = ids.length
    ? (await a.from('agent_intake_submissions').select('id, link_id, applicant_name, move_in_date, screening_id, created_at').in('link_id', ids).order('created_at', { ascending: false }).limit(400)).data ?? []
    : []
  const sids = (subs as { screening_id: string | null }[]).map((s) => s.screening_id).filter((x): x is string => !!x)
  const scr = sids.length ? (await a.from('screenings').select('id, status, ai_score, v3_tier').in('id', sids)).data ?? [] : []
  const byScreening = Object.fromEntries((scr as { id: string; status: string; ai_score: number | null; v3_tier: string | null }[]).map((s) => [s.id, s]))
  return NextResponse.json({
    site: SITE(),
    links: (links ?? []).map((l) => ({ ...(l as object), url: intakeLinkUrl(SITE(), (l as { token: string }).token) })),
    // The applicant's email stays server side: the agent sees the name and the screening.
    submissions: (subs as { id: string; link_id: string; applicant_name: string; move_in_date: string | null; screening_id: string | null; created_at: string }[]).map((s) => ({ ...s, screening: s.screening_id ? byScreening[s.screening_id] ?? null : null })),
  })
}

export async function POST(req: Request) {
  const c = await caller(req)
  if (!c) return NextResponse.json({ error: 'sign_in_required' }, { status: 401 })
  let body: Record<string, unknown>
  try { body = (await req.json()) as Record<string, unknown> } catch { return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 }) }

  if (body.action === 'revoke') {
    const id = String(body.id || '')
    if (!UUID_RE.test(id)) return NextResponse.json({ error: 'id required' }, { status: 400 })
    // RLS: own row only.
    const { data, error } = await c.sb.from('agent_intake_links').update({ revoked_at: new Date().toISOString() }).eq('id', id).is('revoked_at', null).select('id').maybeSingle()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data) return NextResponse.json({ error: 'not found' }, { status: 404 })
    return NextResponse.json({ ok: true, id })
  }

  if (!(await underHourlyLimit(`agent-intake-link:${c.uid}`, 30, false))) return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  const { data: prof } = await c.sb.from('agent_profiles').select('status, expires_at').eq('auth_id', c.uid).maybeSingle()
  const p = prof as { status: string; expires_at: string | null } | null
  if (!p || !isRegistrationLive(p.status) || (p.expires_at && p.expires_at < new Date().toISOString().slice(0, 10))) return NextResponse.json({ error: 'registration_not_live' }, { status: 403 })

  const clientId = body.client_id ? String(body.client_id) : null
  if (clientId && !UUID_RE.test(clientId)) return NextResponse.json({ error: 'client_id invalid' }, { status: 400 })
  let label = typeof body.label === 'string' ? body.label.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 120) : ''
  if (clientId) {
    // Own row (RLS) and a landlord client: an intake link collects applications FOR a landlord.
    const { data: cl } = await c.sb.from('agent_clients').select('id, name, client_role, area').eq('id', clientId).maybeSingle()
    const row = cl as { id: string; name: string; client_role: string; area: string | null } | null
    if (!row) return NextResponse.json({ error: 'client_not_found' }, { status: 404 })
    if (row.client_role !== 'landlord') return NextResponse.json({ error: 'landlord_client_required' }, { status: 422 })
    if (!label) label = [row.name, row.area].filter(Boolean).join(' · ').slice(0, 120)
  }

  const token = makeIntakeToken()
  const expiresAt = intakeLinkExpiry(new Date(), INTAKE_LINK_DAYS)
  const a = admin()
  const { data: row, error } = await a.from('agent_intake_links').insert({ agent_auth_id: c.uid, client_id: clientId, token, label: label || null, expires_at: expiresAt })
    .select('id, client_id, token, label, expires_at, revoked_at, used_count, created_at').maybeSingle()
  if (error || !row) return NextResponse.json({ error: error?.message || 'insert failed' }, { status: 500 })
  await a.from('agent_audit_events').insert({ actor_id: c.uid, actor_type: 'user', action: 'agent_intake_link_created', target_type: 'agent_intake_link', target_id: (row as { id: string }).id, acting_role: 'agent', metadata: { client_id: clientId, expires_at: expiresAt } }).then(() => undefined, () => undefined)
  // Created → 201 (site test J-D4); the client only checks res.ok.
  return NextResponse.json({ link: { ...(row as object), url: intakeLinkUrl(SITE(), token) } }, { status: 201 })
}
