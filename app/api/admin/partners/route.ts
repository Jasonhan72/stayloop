// /api/admin/partners — Trust API partner keys (plan §3.4 step 2).
//   GET    list keys with usage (audit events named trust_api_*)
//   POST   { partner_name, landlord_auth_id?, notes? } → { key } shown ONCE
//          (create_trust_api_key stores only the sha256 hash + prefix)
//   PATCH  { id, active } toggle
// Admin JWT only (is_stayloop_admin RPC), writes with the service role.
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'edge'

async function requireAdmin(req: Request) {
  const rawAuth = req.headers.get('authorization') || ''
  const authHeader = rawAuth.replace(/[^\x20-\x7E]/g, '').trim()
  if (!authHeader) return { error: NextResponse.json({ error: 'Authentication required' }, { status: 401 }) }
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false, autoRefreshToken: false } })
  const { data: ud, error: ue } = await sb.auth.getUser()
  if (ue || !ud?.user) return { error: NextResponse.json({ error: 'Invalid session' }, { status: 401 }) }
  const { data: isAdmin } = await sb.rpc('is_stayloop_admin')
  if (isAdmin !== true) return { error: NextResponse.json({ error: 'admin only' }, { status: 403 }) }
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } })
  return { admin, userId: ud.user.id }
}

export async function GET(req: Request) {
  const g = await requireAdmin(req)
  if ('error' in g) return g.error
  const { data: keys } = await g.admin.from('trust_api_keys').select('id, partner_name, key_prefix, active, created_at, last_used_at, landlord_auth_id, notes').order('created_at', { ascending: false })
  const { data: usage } = await g.admin.from('agent_audit_events').select('metadata').like('action', 'trust_api_%').gte('created_at', new Date(Date.now() - 30 * 86_400_000).toISOString()).limit(5000)
  const counts: Record<string, number> = {}
  for (const u of usage ?? []) {
    const pid = (u.metadata as { partner_id?: string } | null)?.partner_id
    if (pid) counts[pid] = (counts[pid] ?? 0) + 1
  }
  return NextResponse.json({ keys: (keys ?? []).map((k) => ({ ...k, calls_30d: counts[k.id as string] ?? 0 })) })
}

export async function POST(req: Request) {
  const g = await requireAdmin(req)
  if ('error' in g) return g.error
  let body: { partner_name?: string; landlord_auth_id?: string | null; notes?: string }
  try { body = (await req.json()) as typeof body } catch { return NextResponse.json({ error: 'invalid JSON' }, { status: 400 }) }
  const name = String(body.partner_name || '').trim().slice(0, 120)
  if (name.length < 2) return NextResponse.json({ error: 'partner_name required' }, { status: 400 })
  const { data: key, error } = await g.admin.rpc('create_trust_api_key', { p_partner_name: name })
  if (error || typeof key !== 'string') return NextResponse.json({ error: error?.message || 'could not create key' }, { status: 500 })
  const landlord = body.landlord_auth_id && /^[0-9a-f-]{36}$/i.test(body.landlord_auth_id) ? body.landlord_auth_id : null
  await g.admin.from('trust_api_keys').update({ created_by: g.userId, landlord_auth_id: landlord, notes: String(body.notes || '').slice(0, 500) || null }).eq('key_prefix', key.slice(0, 16))
  await g.admin.from('agent_audit_events').insert({ actor_id: g.userId, actor_type: 'user', action: 'trust_api_key_created', target_type: 'trust_api_key', metadata: { partner_name: name, key_prefix: key.slice(0, 16) } })
  return NextResponse.json({ ok: true, key, key_prefix: key.slice(0, 16) })
}

export async function PATCH(req: Request) {
  const g = await requireAdmin(req)
  if ('error' in g) return g.error
  let body: { id?: string; active?: boolean; landlord_auth_id?: string | null }
  try { body = (await req.json()) as typeof body } catch { return NextResponse.json({ error: 'invalid JSON' }, { status: 400 }) }
  if (!body.id || !/^[0-9a-f-]{36}$/i.test(body.id)) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (typeof body.active === 'boolean') patch.active = body.active
  if (body.landlord_auth_id !== undefined) patch.landlord_auth_id = body.landlord_auth_id && /^[0-9a-f-]{36}$/i.test(body.landlord_auth_id) ? body.landlord_auth_id : null
  const { error } = await g.admin.from('trust_api_keys').update(patch).eq('id', body.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await g.admin.from('agent_audit_events').insert({ actor_id: g.userId, actor_type: 'user', action: 'trust_api_key_updated', target_type: 'trust_api_key', target_id: body.id, metadata: patch })
  return NextResponse.json({ ok: true })
}
