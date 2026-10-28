// GET /api/listings/[slug] — the listing detail read for the public page and the apply page (2026-10-11,
// PropTx readiness). The browser no longer queries the listings table at all (anon SELECT is revoked):
//   • public: the row only when it is publicly visible (verified or Realtor.ca import, is_active,
//     display_internet, feed not stale); the owning landlord also sees their own pending listing
//   • 8.14: with display_address = false the address / unit / coordinates / postal code never leave
//     the server for anyone but the owner
//   • 8.13: per-IP / per-account hourly budgets; private columns (broker phone, freshness bookkeeping)
//     are stripped
//   • similar homes are ranked here too (same lib/listingSimilar rules), so that query is gone from the client
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { LISTING_VISIBILITY_OR, hasUsablePhotos } from '@/lib/listingVisibility'
import { SIMILAR_LIMIT, rankSimilar, similarSearchBox } from '@/lib/listingSimilar'
import { underHourlyLimit } from '@/lib/rateLimit'
import type { PublicMlsListing } from '@/lib/listings/syndication'


export const ANON_DETAILS_PER_HOUR = 300
export const USER_DETAILS_PER_HOUR = 1500
const PRIVATE_COLUMNS = ['broker_phone', 'realtor_check', 'management_company'] as const
const SIMILAR_RANK_COLUMNS = 'id, slug, address, city, neighborhood, lat, lng, bedrooms, has_den, property_type, monthly_rent, created_at, status, display_address'
const SIMILAR_CARD_COLUMNS = `${SIMILAR_RANK_COLUMNS}, unit, bathrooms, sqft, images, thumb_a, thumb_b, source, brokerage, is_test`
const SIMILAR_POOL = 500
const SIMILAR_SHORTLIST = 12

type Row = Record<string, unknown> & { id: string; landlord_id: string | null; is_active: boolean; display_internet: boolean; display_address: boolean; feed_updated_at: string | null; source: string | null; verification_status: string | null; lat: number | null; lng: number | null; neighborhood: string | null; images: unknown; status: string | null }

const withheld = (l: Record<string, unknown>) => ({ ...l, address: '', unit: null, lat: null, lng: null, postal_code: null, cross_streets: null })
const publicShape = (l: Record<string, unknown>, owner: boolean) => {
  const out: Record<string, unknown> = { ...l }
  for (const k of PRIVATE_COLUMNS) delete out[k]
  // site test 2026-10-28 (C-D1 / C-D2): the images array is the photo count; the forms write pets_allowed
  out.photo_count = Array.isArray(out.images) ? out.images.length : (typeof out.photo_count === 'number' ? out.photo_count : 0)
  if (out.pet_policy == null && typeof out.pets_allowed === 'string') out.pet_policy = out.pets_allowed
  return !owner && out.display_address === false ? withheld(out) : out
}

export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params
  if (!slug || slug.length > 200) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  const ip = (req.headers.get('cf-connecting-ip') || req.headers.get('x-forwarded-for') || 'unknown').split(',')[0].trim()
  let userId: string | null = null
  const authHeader = (req.headers.get('authorization') || '').replace(/[^\x20-\x7E]/g, '').trim()
  if (authHeader) {
    const asUser = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false, autoRefreshToken: false } })
    const { data } = await asUser.auth.getUser()
    if (data?.user && !data.user.is_anonymous) userId = data.user.id
  }
  const ok = userId
    ? await underHourlyLimit(`ldetail:u:${userId}`, USER_DETAILS_PER_HOUR, true)
    : await underHourlyLimit(`ldetail:ip:${ip}`, ANON_DETAILS_PER_HOUR, true)
  if (!ok) return NextResponse.json({ error: 'rate_limited' }, { status: 429, headers: { 'Retry-After': '600', 'Cache-Control': 'no-store' } })

  const svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data, error } = await svc.from('listings').select('*').eq('slug', slug).eq('is_active', true).maybeSingle()
  if (error) return NextResponse.json({ error: 'read_failed' }, { status: 502, headers: { 'Cache-Control': 'no-store' } })
  const l = data as Row | null
  if (!l) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: { 'Cache-Control': 'no-store' } })

  // Owner = the landlord row behind landlord_id (legacy rows store landlords.id, new rows store the auth id).
  let owner = false
  if (userId && l.landlord_id) {
    if (l.landlord_id === userId) owner = true
    else {
      const { data: lr } = await svc.from('landlords').select('id').eq('id', l.landlord_id).eq('auth_id', userId).maybeSingle()
      owner = !!lr
    }
  }
  const stale = !!l.feed_updated_at && Date.parse(l.feed_updated_at) < Date.now() - 24 * 3600_000
  const publiclyVisible = (l.verification_status === 'verified' || l.source === 'realtor') && l.display_internet !== false && !stale
  if (!publiclyVisible && !owner) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: { 'Cache-Control': 'no-store' } })

  // Similar homes (never for a withheld-address row: no location to compare from).
  let similar: unknown[] | null = null
  const origin = l.lat != null && l.lng != null && Number.isFinite(Number(l.lat)) && Number.isFinite(Number(l.lng)) ? { lat: Number(l.lat), lng: Number(l.lng) } : null
  const hood = (l.neighborhood || '').trim()
  if (l.display_address !== false && (origin || hood)) {
    let q = svc.from('listings').select(SIMILAR_RANK_COLUMNS).eq('is_active', true).eq('display_internet', true).or(LISTING_VISIBILITY_OR).neq('id', l.id)
    if (origin) {
      const box = similarSearchBox(origin.lat, origin.lng)
      q = q.gte('lat', box.minLat).lte('lat', box.maxLat).gte('lng', box.minLng).lte('lng', box.maxLng)
    } else {
      q = q.ilike('neighborhood', hood.replace(/[\\%_]/g, (c) => `\\${c}`))
    }
    const { data: rest } = await q.order('created_at', { ascending: false }).limit(SIMILAR_POOL)
    const pool = ((rest || []) as unknown as Row[]).filter((x) => x.status !== 'archived' && x.display_address !== false)
    const shortlist = rankSimilar(l as never, pool as never[], { origin, limit: SIMILAR_SHORTLIST })
    if (shortlist.length) {
      const { data: cards } = await svc.from('listings').select(SIMILAR_CARD_COLUMNS).in('id', shortlist.map((m) => (m.listing as Row).id))
      const byId = new Map(((cards || []) as unknown as Row[]).map((c) => [c.id, c]))
      similar = shortlist
        .map((m) => ({ ...m, listing: byId.get((m.listing as Row).id) }))
        .filter((m) => m.listing && hasUsablePhotos((m.listing as Row).images) && (m.listing as Row).status !== 'archived')
        .slice(0, SIMILAR_LIMIT)
        .map((m) => ({ ...m, listing: publicShape(m.listing as Record<string, unknown>, false) }))
    } else similar = []
  }
  // A posted MLS® hand-off (V0.8 第二项 · 第 3 步): the number and public link the agent wrote back,
  // plus the agent's registered name and brokerage (O. Reg. 567/05 s.12.1). Nothing is read from MLS.
  let mls: PublicMlsListing | null = null
  {
    const { data: s } = await svc.from('listing_syndications').select('external_id, external_url, agent_auth_id').eq('listing_id', l.id).eq('channel', 'mls').eq('status', 'posted').limit(1).maybeSingle()
    const row = s as { external_id: string | null; external_url: string | null; agent_auth_id: string | null } | null
    if (row?.agent_auth_id) {
      const { data: a } = await svc.from('agent_profiles').select('legal_name, brokerage_name, public_profile, profile_slug').eq('auth_id', row.agent_auth_id).maybeSingle()
      const ag = a as { legal_name: string; brokerage_name: string; public_profile: boolean; profile_slug: string | null } | null
      if (ag) mls = { external_id: row.external_id, external_url: row.external_url, agent: { name: ag.legal_name, brokerage: ag.brokerage_name, slug: ag.public_profile ? ag.profile_slug : null } }
    }
  }
  return NextResponse.json({ listing: publicShape(l, owner), owner, similar, mls }, { headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } })
}
