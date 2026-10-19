// POST /api/cron/model-discover — weekly model auto-discovery (pg_cron `model-discover-weekly`, Mondays
// 13:40 UTC, x-cron-secret), also runnable by an admin JWT. See lib/models/autoDiscover.ts.
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { secretMatches } from '@/lib/cron/secret'
import { emailAdminsSummary, runAutoDiscovery } from '@/lib/models/autoDiscover'


async function authorized(req: Request): Promise<{ ok: boolean; userId: string | null }> {
  const secret = process.env.CRON_SECRET
  const given = (req.headers.get('x-cron-secret') || '').trim()
  if (secret && given && (await secretMatches(given, secret))) return { ok: true, userId: null }
  const authHeader = (req.headers.get('authorization') || '').replace(/[^\x20-\x7E]/g, '').trim()
  if (!authHeader) return { ok: false, userId: null }
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false, autoRefreshToken: false } })
  const { data: ud } = await sb.auth.getUser()
  if (!ud?.user) return { ok: false, userId: null }
  const { data: isAdmin } = await sb.rpc('is_stayloop_admin')
  return { ok: !!isAdmin, userId: isAdmin ? ud.user.id : null }
}

export async function POST(req: Request) {
  const auth = await authorized(req)
  if (!auth.ok) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } })
  const result = await runAutoDiscovery(admin, auth.userId)
  const emailed = await emailAdminsSummary(admin, result)
  return NextResponse.json({ ...result, emailed })
}
