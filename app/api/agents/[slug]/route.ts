// GET /api/agents/<slug> — one public agent profile (2026-10-21): public fields, the
// ids of the listings they publish on Stayloop (cards come from /api/listings/search,
// which applies the visibility rules), and activity counts only if the agent opted in.
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { underHourlyLimit } from '@/lib/rateLimit'
import { agentActivity, agentListingIds, loadPublicAgent } from '@/lib/agentPublicServer'

const NO_STORE = { 'Cache-Control': 'no-store' }

export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params
  const ip = req.headers.get('cf-connecting-ip') || (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'anon'
  const [a, b] = await Promise.all([underHourlyLimit(`agents-profile:ip:${ip}`, 600, true), underHourlyLimit('agents-profile:global', 30000, true)])
  if (!a || !b) return NextResponse.json({ error: 'rate_limited' }, { status: 429, headers: NO_STORE })
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } })
  const hit = await loadPublicAgent(admin, slug)
  if (!hit) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: NO_STORE })
  const listing_ids = await agentListingIds(admin, hit.row.auth_id)
  const activity = hit.row.show_activity ? await agentActivity(admin, hit.row.auth_id, listing_ids.length) : null
  return NextResponse.json({ agent: hit.agent, listing_ids, activity }, { headers: NO_STORE })
}
