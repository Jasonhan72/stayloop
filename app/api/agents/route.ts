// GET /api/agents?language=&focus=&area= — the public agent directory (2026-10-21).
// Published, verified, live registrations only; public fields only (lib/agentPublic.ts).
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { underHourlyLimit } from '@/lib/rateLimit'
import { matchesDirectoryFilter } from '@/lib/agentPublic'
import { listPublicAgents } from '@/lib/agentPublicServer'

const NO_STORE = { 'Cache-Control': 'no-store' }

export async function GET(req: Request) {
  const ip = req.headers.get('cf-connecting-ip') || (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'anon'
  // Anonymous read surface: per-IP plus a site-wide gate (cost guard, fail-open).
  const [a, b] = await Promise.all([underHourlyLimit(`agents-dir:ip:${ip}`, 300, true), underHourlyLimit('agents-dir:global', 20000, true)])
  if (!a || !b) return NextResponse.json({ error: 'rate_limited' }, { status: 429, headers: NO_STORE })
  const u = new URL(req.url)
  const language = (u.searchParams.get('language') || '').slice(0, 8) || null
  const focus = (u.searchParams.get('focus') || '').slice(0, 20) || null
  const area = (u.searchParams.get('area') || '').slice(0, 40) || null
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } })
  const all = await listPublicAgents(admin)
  const items = all.filter((x) => matchesDirectoryFilter(x, { language, focus, area }))
  return NextResponse.json({ items, total: items.length }, { headers: NO_STORE })
}
