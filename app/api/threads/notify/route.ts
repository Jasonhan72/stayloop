// POST /api/threads/notify { thread_id } — after a party posted a message
// (节点 4 2026-09-26; replaces /api/household/notify-message). The caller must
// have written a message on that thread in the last two minutes (RLS proves it);
// the other parties get a push (account holders, their own push level applies)
// or one email (the external contractor / an applicant without an account).
// Notifications are reminders only — the message itself lives in the thread.
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { underHourlyLimit } from '@/lib/rateLimit'
import { notifyThreadParties, type ThreadRow } from '@/lib/threads/server'

export const runtime = 'edge'
const UUID = /^[0-9a-f-]{36}$/i

export async function POST(req: Request) {
  const authHeader = (req.headers.get('authorization') || '').replace(/[^\x20-\x7E]/g, '').trim()
  if (!authHeader) return NextResponse.json({ error: 'sign_in_required' }, { status: 401 })
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: authHeader } }, auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: ud } = await sb.auth.getUser()
  if (!ud?.user || ud.user.is_anonymous) return NextResponse.json({ error: 'sign_in_required' }, { status: 401 })
  let body: { thread_id?: string }
  try { body = (await req.json()) as typeof body } catch { return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 }) }
  const tid = String(body.thread_id || '')
  if (!UUID.test(tid)) return NextResponse.json({ error: 'thread_id required' }, { status: 400 })

  const since = new Date(Date.now() - 120_000).toISOString()
  const [{ data: t }, { data: mine }] = await Promise.all([
    sb.from('threads').select('id, kind, ref_id, household_id, title').eq('id', tid).maybeSingle(),
    sb.from('thread_messages').select('id, body, sender_kind, sender_label').eq('thread_id', tid).eq('sender_id', ud.user.id).eq('kind', 'message').gte('created_at', since).order('id', { ascending: false }).limit(1),
  ])
  const msg = (mine ?? [])[0] as { id: number; body: string; sender_kind: string; sender_label: string | null } | undefined
  if (!t || !msg) return NextResponse.json({ error: 'no_recent_message' }, { status: 404 })
  if (!(await underHourlyLimit(`thread-notify:${ud.user.id}`, 60, true))) return NextResponse.json({ ok: true, throttled: true })

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
  const labelOf: Record<string, string> = { tenant: '租客 / Tenant', landlord: '房东 / Landlord', provider: '服务商 / Provider', agent: '经纪 / Agent', admin: 'Stayloop' }
  const r = await notifyThreadParties(admin, t as ThreadRow, { exceptUserId: ud.user.id, exceptEmail: ud.user.email ?? null, preview: msg.body.slice(0, 120), senderLabel: msg.sender_label || labelOf[msg.sender_kind] || msg.sender_kind })
  return NextResponse.json({ ok: true, ...r })
}
