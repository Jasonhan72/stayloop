// POST /api/agent/reflect — manual/backfill trigger for the self-learning
// reflection pass (lib/agent/reflection.ts). Two modes:
//   • x-cron-secret matching env CRON_SECRET → service-role sweep across all
//     users active in the last 36h (backstop; normally the turn route's
//     background trigger keeps profiles fresh).
//   • Authorization: Bearer <user JWT> + body {role} → reflect ONLY the
//     caller, on their own RLS-scoped data (used by verification and by a
//     future "刷新我的画像" button). Forced — ignores the staleness window.
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { reflectUser, runReflectionSweep } from '@/lib/agent/reflection'
import type { AgentRole } from '@/lib/agent/types'

export const runtime = 'edge'

function timingSafeEqual(a: string, b: string): boolean {
  const ab = new TextEncoder().encode(a)
  const bb = new TextEncoder().encode(b)
  let diff = ab.length ^ bb.length
  const n = Math.max(ab.length, bb.length)
  for (let i = 0; i < n; i++) diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0)
  return diff === 0
}

export async function POST(req: Request) {
  const cronSecret = process.env.CRON_SECRET
  const given = req.headers.get('x-cron-secret')
  if (cronSecret && given && timingSafeEqual(given, cronSecret)) {
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    )
    const result = await runReflectionSweep(admin)
    return NextResponse.json({ mode: 'cron', ...result })
  }

  const rawAuth = req.headers.get('authorization') || ''
  const authHeader = rawAuth.replace(/[^\x20-\x7E]/g, '').trim()
  if (!authHeader) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false, autoRefreshToken: false } },
  )
  const { data: ud, error: ue } = await sb.auth.getUser()
  if (ue || !ud?.user || ud.user.is_anonymous) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  let body: { role?: unknown } = {}
  try { body = await req.json() } catch { /* empty body ok */ }
  const role = typeof body.role === 'string' && ['tenant', 'landlord', 'agent'].includes(body.role) ? (body.role as AgentRole) : null
  if (!role) return NextResponse.json({ error: 'role required (tenant|landlord|agent)' }, { status: 400 })

  try {
    const reflected = await reflectUser(sb, ud.user.id, role)
    return NextResponse.json({ mode: 'self', role, reflected })
  } catch (e) {
    console.error('[agent/reflect] failed', (e as Error).message)
    return NextResponse.json({ error: 'reflection failed' }, { status: 500 })
  }
}
