// POST /api/household/notify-message { household_id } — V0.6 (2026-09-24).
// A message on the tenancy hub (household_messages) was a silent insert: the
// other side only saw it if they happened to open the hub. This pushes a
// short notification to the other active members (push only, never email —
// a chat must not flood inboxes; each member's push level still applies).
// The caller must have just sent a message there (RLS read of their own row).
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { underHourlyLimit } from '@/lib/rateLimit'
import { notifyUser } from '@/lib/push/notify'

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
  let body: { household_id?: string }
  try { body = (await req.json()) as typeof body } catch { return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 }) }
  const hh = String(body.household_id || '')
  if (!UUID.test(hh)) return NextResponse.json({ error: 'household_id required' }, { status: 400 })

  // Their own latest message in this household, within the last two minutes.
  const since = new Date(Date.now() - 120_000).toISOString()
  const { data: mine } = await sb.from('household_messages').select('id, body').eq('household_id', hh).eq('sender_id', ud.user.id).gte('created_at', since).order('id', { ascending: false }).limit(1)
  const msg = (mine ?? [])[0] as { id: number; body: string } | undefined
  if (!msg) return NextResponse.json({ error: 'no_recent_message' }, { status: 404 })
  if (!(await underHourlyLimit(`hh-msg-notify:${ud.user.id}`, 60, true))) return NextResponse.json({ ok: true, throttled: true })

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
  const [{ data: members }, { data: house }] = await Promise.all([
    admin.from('household_members').select('user_id').eq('household_id', hh).eq('status', 'active'),
    admin.from('households').select('address, unit').eq('id', hh).maybeSingle(),
  ])
  const others = ((members ?? []) as { user_id: string }[]).map((m) => m.user_id).filter((u) => u && u !== ud.user.id)
  const place = house ? `${(house as { address: string }).address}${(house as { unit: string | null }).unit ? ` #${(house as { unit: string | null }).unit}` : ''}` : ''
  let pushed = 0
  for (const uid of others) pushed += await notifyUser(admin, uid, { kind: 'event', title: `新消息 / New message · ${place}`.slice(0, 80), body: msg.body.slice(0, 120), url: `/h/${hh}?tab=messages` })
  return NextResponse.json({ ok: true, pushed })
}
