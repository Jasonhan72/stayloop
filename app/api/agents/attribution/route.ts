// GET /api/agents/attribution?screening=<uuid> — who prepared a screening, when that was an agent
// (V0.9, 2026-11-22; lib/agent/attribution.ts has the rule).
//
// The screening is read through the CALLER's own JWT, so only someone who can already open the
// report (its owner, or the principal / delegate of its delegation — the table's RLS) gets an answer;
// the agent's registration is then read with the service role. What comes back is what the public
// directory shows for any RECO-verified agent: registered name, descriptor, brokerage, number.
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { underHourlyLimit } from '@/lib/rateLimit'
import { isPublishable, isRegistrationCurrent } from '@/lib/agentPublic'
import type { AgentAttribution } from '@/lib/agent/attribution'
import type { AgentCategory, AgentStatus } from '@/lib/agentProfile'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const none = () => NextResponse.json({ attribution: null }, { headers: { 'Cache-Control': 'no-store' } })

export async function GET(req: Request) {
  const sid = new URL(req.url).searchParams.get('screening') || ''
  if (!UUID.test(sid)) return NextResponse.json({ error: 'bad id' }, { status: 400 })
  const authHeader = (req.headers.get('authorization') || '').replace(/[^\x20-\x7E]/g, '').trim()
  if (!authHeader) return NextResponse.json({ error: 'sign_in_required' }, { status: 401 })
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: authHeader } }, auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: ud } = await sb.auth.getUser()
  if (!ud?.user || ud.user.is_anonymous) return NextResponse.json({ error: 'sign_in_required' }, { status: 401 })
  // A read that costs two small queries: fail open, like the other cost-type limits.
  if (!(await underHourlyLimit(`agent-attribution:${ud.user.id}`, 600, true))) return NextResponse.json({ error: 'rate_limited' }, { status: 429 })

  const { data: row } = await sb.from('screenings').select('id, landlord_id, delegation_id').eq('id', sid).maybeSingle()
  const scr = row as { id: string; landlord_id: string | null; delegation_id: string | null } | null
  if (!scr) return none()

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
  let agentId: string | null = null
  let via: AgentAttribution['via'] = 'own'
  if (scr.delegation_id) {
    const { data: d } = await admin.from('delegations').select('delegate_auth_id').eq('id', scr.delegation_id).maybeSingle()
    agentId = (d as { delegate_auth_id?: string | null } | null)?.delegate_auth_id ?? null
    via = 'delegation'
  } else if (scr.landlord_id && UUID.test(scr.landlord_id)) {
    // landlord_id is the auth id on new rows and landlords.id on old ones (the dual-ID invariant).
    // Two plain .eq() reads, never a filter string.
    const [{ data: byId }, { data: byAuth }] = await Promise.all([
      admin.from('landlords').select('auth_id').eq('id', scr.landlord_id).limit(1),
      admin.from('landlords').select('auth_id').eq('auth_id', scr.landlord_id).limit(1),
    ])
    const holdsLandlordHat = !!(byId && byId.length) || !!(byAuth && byAuth.length)
    // An account that is also a landlord may have run this as either; the row does not say which.
    if (!holdsLandlordHat) agentId = scr.landlord_id
  }
  if (!agentId) return none()

  const { data: p } = await admin.from('agent_profiles')
    .select('legal_name, reco_number, category, brokerage_name, status, expires_at, public_profile, profile_slug')
    .eq('auth_id', agentId).maybeSingle()
  const prof = p as { legal_name: string | null; reco_number: string | null; category: AgentCategory | null; brokerage_name: string | null; status: AgentStatus; expires_at: string | null; public_profile: boolean | null; profile_slug: string | null } | null
  if (!prof || !prof.legal_name || !prof.reco_number || !prof.category || !isRegistrationCurrent(prof)) return none()

  const attribution: AgentAttribution = {
    name: prof.legal_name,
    category: prof.category,
    brokerage_name: prof.brokerage_name ?? '',
    reco_number: prof.reco_number,
    slug: isPublishable({ status: prof.status, expires_at: prof.expires_at, public_profile: !!prof.public_profile, profile_slug: prof.profile_slug }) ? prof.profile_slug : null,
    via,
  }
  return NextResponse.json({ attribution }, { headers: { 'Cache-Control': 'no-store' } })
}
