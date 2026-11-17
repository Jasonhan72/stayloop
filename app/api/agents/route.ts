// GET /api/agents?language=&focus=&area=&q= — the public agent directory (2026-10-21).
// `q` (2026-11-17): name or brokerage; applies to both lists.
// `items`: published, verified, live registrations; public fields only (lib/agentPublic.ts).
// `basic` (2026-11-16): verified, live registrations without a published profile — registered name,
// descriptor, brokerage and RECO number only. Left out while a filter is on (they carry nothing to match).
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { underHourlyLimit } from '@/lib/rateLimit'
import { matchesAgentQuery, matchesDirectoryFilter } from '@/lib/agentPublic'
import { listBasicAgents, listPublicAgents } from '@/lib/agentPublicServer'

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
  const q = (u.searchParams.get('q') || '').slice(0, 60).trim() || null
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } })
  const filtered = !!(language || focus || area)
  const [all, allBasic] = await Promise.all([listPublicAgents(admin), filtered ? Promise.resolve([]) : listBasicAgents(admin)])
  const items = all.filter((x) => matchesDirectoryFilter(x, { language, focus, area }) && matchesAgentQuery(x, q))
  const basic = allBasic.filter((x) => matchesAgentQuery(x, q))
  return NextResponse.json({ items, basic, total: items.length + basic.length }, { headers: NO_STORE })
}
