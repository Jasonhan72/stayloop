// POST /api/push/test — send a test notification to the caller's own devices
// (2026-09-22). The only way to prove the whole chain (service worker,
// subscription row, VAPID, encryption, push service) on a real phone.
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { notifyUser } from '@/lib/push/notify'
import { underHourlyLimit } from '@/lib/rateLimit'

export const runtime = 'edge'

export async function POST(req: Request) {
  const rawAuth = req.headers.get('authorization') || ''
  const authHeader = rawAuth.replace(/[^\x20-\x7E]/g, '').trim()
  if (!authHeader) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false, autoRefreshToken: false } },
  )
  const { data: ud, error } = await sb.auth.getUser()
  if (error || !ud?.user || ud.user.is_anonymous) return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
  if (!(await underHourlyLimit(`push-test:${ud.user.id}`, 5, false))) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429, headers: { 'Retry-After': '3600' } })
  }
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
  const sent = await notifyUser(admin, ud.user.id, {
    kind: 'approval',
    title: 'Stayloop 测试通知 / Test notification',
    body: '推送链路正常。真正的通知只在需要你决定或有新事项时发送。 / Push works; real ones only when you need to decide or something new arrives.',
    url: '/settings',
  })
  return NextResponse.json({ ok: true, sent })
}
