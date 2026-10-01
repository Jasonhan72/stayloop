// POST /api/threads/notify { thread_id, message_id? } — after a party posted a
// message (节点 4 2026-09-26; replaces /api/household/notify-message). The
// message must be the caller's own, on that thread, from the last two minutes
// (RLS proves it); the other parties get a push (account holders, their own
// push level applies) or one email (the external contractor / an applicant
// without an account). Notifications are reminders only — the message itself
// lives in the thread.
// Sweep 2026-10-01: the composer passes the id it just inserted, so two quick
// messages announce message 1 and message 2 — not message 2 twice. A message
// that already has delivery receipts is not announced again. Without an id
// (older clients) the caller's newest message is used, as before.
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { underHourlyLimit } from '@/lib/rateLimit'
import { displayNameFor, notifyThreadParties, type ThreadRow } from '@/lib/threads/server'

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
  let body: { thread_id?: string; message_id?: number | string | null }
  try { body = (await req.json()) as typeof body } catch { return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 }) }
  const tid = String(body.thread_id || '')
  if (!UUID.test(tid)) return NextResponse.json({ error: 'thread_id required' }, { status: 400 })
  const rawId = body.message_id
  const messageId = rawId == null || rawId === '' ? null : Number(rawId)
  if (messageId !== null && !(Number.isSafeInteger(messageId) && messageId > 0)) return NextResponse.json({ error: 'message_id invalid' }, { status: 400 })

  const since = new Date(Date.now() - 120_000).toISOString()
  let q = sb.from('thread_messages').select('id, body, sender_kind, sender_label, created_at').eq('thread_id', tid).eq('sender_id', ud.user.id).eq('kind', 'message').gte('created_at', since)
  q = messageId !== null ? q.eq('id', messageId) : q.order('id', { ascending: false })
  const [{ data: t }, { data: mine }] = await Promise.all([
    sb.from('threads').select('id, kind, ref_id, household_id, title, listing_id, subject_user').eq('id', tid).maybeSingle(),
    q.limit(1),
  ])
  const msg = (mine ?? [])[0] as { id: number; body: string; sender_kind: string; sender_label: string | null; created_at: string } | undefined
  if (!t || !msg) return NextResponse.json({ error: 'no_recent_message' }, { status: 404 })

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
  // One announcement per message: a retried request must not email the same line twice.
  const { data: done } = await admin.from('message_deliveries').select('id').eq('message_id', msg.id).limit(1)
  if (done && done.length) return NextResponse.json({ ok: true, already: true })
  if (!(await underHourlyLimit(`thread-notify:${ud.user.id}`, 60, true))) return NextResponse.json({ ok: true, throttled: true })

  const labelOf: Record<string, string> = { tenant: '租客 / Tenant', landlord: '房东 / Landlord', provider: '服务商 / Provider', agent: '经纪 / Agent', admin: 'Stayloop', member: '用户 / Member' }
  const role = labelOf[msg.sender_kind] || msg.sender_kind
  const name = msg.sender_kind === 'admin' ? null : await displayNameFor(admin, ud.user.id)
  // Always "name（role）": the name is self-chosen, the role comes from the matter (review 2026-09-30).
  const base = msg.sender_kind === 'admin' ? null : (msg.sender_label || name)
  const r = await notifyThreadParties(admin, t as ThreadRow, { messageId: msg.id, createdAt: msg.created_at, exceptUserId: ud.user.id, exceptEmail: ud.user.email ?? null, preview: msg.body.slice(0, 120), body: msg.body, senderLabel: base ? `${base}（${role.split(' / ')[0]}） / ${base} (${role.split(' / ').pop()})` : role })
  return NextResponse.json({ ok: true, ...r })
}
