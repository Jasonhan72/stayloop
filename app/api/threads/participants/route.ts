// GET /api/threads/participants?thread_id=… | ?kind=…&ref=…[&listing=…&subject=…]
// Who is in a conversation (消息系统 A 期; named since 找得到人 2026-09-30).
// Answered under the caller's own JWT by thread_people / people_for, which
// return nothing unless the caller is a party. Names and roles only — never an
// address; user_id is returned for account holders so message bubbles can show
// the sender's name.
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { ThreadKind } from '@/lib/threads/shared'

export const runtime = 'edge'
const UUID = /^[0-9a-f-]{36}$/i
const KINDS: ThreadKind[] = ['work_order', 'application', 'tenancy', 'dispute', 'listing_inquiry', 'agent_client', 'support']

type Row = { user_id: string | null; name: string | null; role: string; channel: string; pending: boolean; is_me: boolean }

export async function GET(req: Request) {
  const authHeader = (req.headers.get('authorization') || '').replace(/[^\x20-\x7E]/g, '').trim()
  if (!authHeader) return NextResponse.json({ error: 'sign_in_required' }, { status: 401 })
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false, autoRefreshToken: false } })
  const { data: ud } = await sb.auth.getUser()
  if (!ud?.user || ud.user.is_anonymous) return NextResponse.json({ error: 'sign_in_required' }, { status: 401 })
  const u = new URL(req.url)
  const tid = u.searchParams.get('thread_id') || ''
  let rows: Row[] | null = null
  let party: string | null = null
  if (tid) {
    if (!UUID.test(tid)) return NextResponse.json({ error: 'bad thread_id' }, { status: 400 })
    const [p, r] = await Promise.all([sb.rpc('thread_party', { p_thread: tid }), sb.rpc('thread_people', { p_thread: tid })])
    party = (p.data as string | null) ?? null
    rows = (r.data ?? []) as Row[]
  } else {
    const kind = u.searchParams.get('kind') as ThreadKind
    const ref = u.searchParams.get('ref') || ''
    const listing = u.searchParams.get('listing') || null
    const subject = u.searchParams.get('subject') || (kind === 'support' ? ref : null)
    if (!KINDS.includes(kind) || !UUID.test(ref) || (listing && !UUID.test(listing)) || (subject && !UUID.test(subject))) return NextResponse.json({ error: 'bad target' }, { status: 400 })
    const args = { p_kind: kind, p_ref: ref, p_listing: listing, p_subject: subject }
    const [p, r] = await Promise.all([sb.rpc('party_for', args), sb.rpc('people_for', args)])
    party = (p.data as string | null) ?? null
    rows = (r.data ?? []) as Row[]
  }
  if (!party) return NextResponse.json({ error: 'not_a_party' }, { status: 403 })
  const people = (rows ?? []).map((r) => ({
    user_id: r.user_id, name: r.name && !r.name.includes('@') ? r.name : null, role: r.role,
    channel: r.channel === 'email' ? 'email' : 'app', pending: !!r.pending, is_me: !!r.is_me,
  }))
  return NextResponse.json({ party, people }, { headers: { 'Cache-Control': 'no-store' } })
}
