// GET /api/threads/participants?thread_id=… | ?kind=…&ref=… (消息系统 A 期)
// Who is in a conversation — for the message-centre header and step 2 of
// "新消息". The caller must be a party (party_for / thread_party under their
// own JWT). Returns names and roles and how each is reached (in app / by email);
// never an address (default relay, decision 4 of the blueprint).
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { partyDisplay, threadParties, type ThreadRow } from '@/lib/threads/server'
import type { ThreadKind } from '@/lib/threads/shared'

export const runtime = 'edge'
const UUID = /^[0-9a-f-]{36}$/i
const KINDS: ThreadKind[] = ['work_order', 'application', 'tenancy', 'dispute', 'listing_inquiry', 'agent_client', 'support']

export async function GET(req: Request) {
  const authHeader = (req.headers.get('authorization') || '').replace(/[^\x20-\x7E]/g, '').trim()
  if (!authHeader) return NextResponse.json({ error: 'sign_in_required' }, { status: 401 })
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false, autoRefreshToken: false } })
  const { data: ud } = await sb.auth.getUser()
  if (!ud?.user || ud.user.is_anonymous) return NextResponse.json({ error: 'sign_in_required' }, { status: 401 })
  const u = new URL(req.url)
  const zh = u.searchParams.get('lang') !== 'en'
  const tid = u.searchParams.get('thread_id') || ''
  let t: ThreadRow | null = null
  let party: string | null = null
  if (tid) {
    if (!UUID.test(tid)) return NextResponse.json({ error: 'bad thread_id' }, { status: 400 })
    const { data } = await sb.from('threads').select('id, kind, ref_id, household_id, title, listing_id, subject_user').eq('id', tid).maybeSingle()
    if (!data) return NextResponse.json({ error: 'not_a_party' }, { status: 403 })
    t = data as ThreadRow
    party = ((await sb.rpc('thread_party', { p_thread: tid })).data as string | null) ?? null
  } else {
    const kind = u.searchParams.get('kind') as ThreadKind
    const ref = u.searchParams.get('ref') || ''
    if (!KINDS.includes(kind) || !UUID.test(ref) || kind === 'listing_inquiry') return NextResponse.json({ error: 'bad target' }, { status: 400 })
    party = ((await sb.rpc('party_for', { p_kind: kind, p_ref: ref, p_listing: null, p_subject: kind === 'support' ? ref : null })).data as string | null) ?? null
    t = { id: '', kind, ref_id: ref, household_id: null, title: null, listing_id: null, subject_user: kind === 'support' ? ref : null }
  }
  if (!party) return NextResponse.json({ error: 'not_a_party' }, { status: 403 })
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
  const parties = await threadParties(admin, t)
  const seen = new Set<string>()
  const out: { label: string; kind: string; channel: 'app' | 'email'; me: boolean }[] = []
  let admins = 0
  for (const p of parties) {
    const key = p.userId || (p.email || '').toLowerCase()
    if (!key || seen.has(key)) continue
    seen.add(key)
    if (p.kind === 'admin') { admins++; if (admins > 1) continue }
    const me = p.userId === ud.user.id || (!!p.email && p.email.toLowerCase() === (ud.user.email || '').toLowerCase())
    out.push({ label: p.kind === 'admin' ? 'Stayloop' : me ? (zh ? '你' : 'You') : partyDisplay(p, zh), kind: p.kind, channel: p.userId ? 'app' : 'email', me })
  }
  return NextResponse.json({ party, participants: out }, { headers: { 'Cache-Control': 'no-store' } })
}
