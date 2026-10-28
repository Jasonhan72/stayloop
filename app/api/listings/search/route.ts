// GET /api/listings/search — the ONLY way the public browse page reads listings (2026-10-11, PropTx readiness).
//   8.27  at most 100 listings per inquiry: server-side filters + `page`, each response ≤ PAGE_SIZE rows
//   8.13  reasonable anti-scraping: per-IP and per-account hourly budgets, card fields only (no description,
//         no photos beyond the two thumbnails, no broker phone), and the browser never queries the table directly
//   8.14  seller display directives (display_internet) and 8.17 feed staleness (> 24 h) are applied here
//   8.29  `source` searches one source at a time; 'all' returns both, labelled by the client
// Signed-in callers pass their JWT so the budget is per account (and their searches are audited client-side).
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { LISTING_VISIBILITY_OR, hasUsablePhotos, cardImages } from '@/lib/listingVisibility'
import { underHourlyLimit } from '@/lib/rateLimit'


export const PAGE_SIZE = 100
export const ANON_SEARCHES_PER_HOUR = 240
export const USER_SEARCHES_PER_HOUR = 1200
export const CARD_COLUMNS = 'id,slug,address,unit,city,province,monthly_rent,bedrooms,bathrooms,sqft,neighborhood,pet_policy,pets_allowed,property_type,amenities,lat,lng,thumb_a,thumb_b,photo_count,created_at,images,available_date,has_den,source,verification_status,brokerage,display_address,display_avm,is_test'

const NEGATIVE_PETS = /\b(no|not|without)\b|不可|禁止|不允许|不接受/i
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const num = (v: string | null, min: number, max: number): number | null => {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : null
}
// PostgREST filter values: strip the characters that have meaning in its grammar.
const safeLike = (t: string) => t.replace(/[%,()*."'\\]/g, '').slice(0, 40)

export async function GET(req: Request) {
  const url = new URL(req.url)
  const p = url.searchParams
  const ip = (req.headers.get('cf-connecting-ip') || req.headers.get('x-forwarded-for') || 'unknown').split(',')[0].trim()

  // Who is asking — budget per account when signed in, per IP otherwise.
  let userId: string | null = null
  const authHeader = (req.headers.get('authorization') || '').replace(/[^\x20-\x7E]/g, '').trim()
  if (authHeader) {
    const asUser = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false, autoRefreshToken: false } })
    const { data } = await asUser.auth.getUser()
    if (data?.user && !data.user.is_anonymous) userId = data.user.id
  }
  const ok = userId
    ? await underHourlyLimit(`lsearch:u:${userId}`, USER_SEARCHES_PER_HOUR, true)
    : await underHourlyLimit(`lsearch:ip:${ip}`, ANON_SEARCHES_PER_HOUR, true)
  if (!ok) return NextResponse.json({ error: 'rate_limited' }, { status: 429, headers: { 'Retry-After': '600', 'Cache-Control': 'no-store' } })

  const svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } })
  const page = Math.max(0, Math.floor(num(p.get('page'), 0, 1000) ?? 0))
  const sort = p.get('sort') === 'price_asc' ? 'price_asc' : p.get('sort') === 'price_desc' ? 'price_desc' : 'newest'
  const source = p.get('source') === 'stayloop' ? 'stayloop' : p.get('source') === 'realtor' ? 'realtor' : 'all'
  const priceMin = num(p.get('min'), 0, 1_000_000)
  const priceMax = num(p.get('max'), 0, 1_000_000)
  const minBeds = num(p.get('beds'), 0, 20)
  const minBaths = num(p.get('baths'), 0, 20)
  const minSqft = num(p.get('sqft'), 0, 100_000)
  const pets = p.get('pets') === '1'
  const moveIn = /^\d{4}-\d{2}-\d{2}$/.test(p.get('move_in') || '') ? p.get('move_in') : null
  const ids = (p.get('ids') || '').split(',').map((s) => s.trim()).filter((s) => UUID.test(s)).slice(0, PAGE_SIZE)
  const bboxRaw = (p.get('bbox') || '').split(',').map(Number)
  const bbox = bboxRaw.length === 4 && bboxRaw.every(Number.isFinite) ? { s: bboxRaw[0], w: bboxRaw[1], n: bboxRaw[2], e: bboxRaw[3] } : null
  const tokens = (p.get('q') || '').split(/[\s,，·]+/).map((t) => safeLike(t.trim().toLowerCase())).filter((t) => t.length >= 2 && !['多伦多', 'toronto'].includes(t)).slice(0, 6)

  // Over-fetch a little so rows without a usable photo can be dropped without a short page.
  const from = page * PAGE_SIZE
  let q = svc.from('listings').select(CARD_COLUMNS, { count: 'exact' })
    .eq('is_active', true)
    .eq('display_internet', true)
    .or(LISTING_VISIBILITY_OR)
    .or('feed_updated_at.is.null,feed_updated_at.gt.' + new Date(Date.now() - 24 * 3600_000).toISOString())
  if (ids.length) q = q.in('id', ids)
  if (source !== 'all') q = source === 'realtor' ? q.eq('source', 'realtor') : q.neq('source', 'realtor')
  if (priceMin != null) q = q.gte('monthly_rent', priceMin)
  if (priceMax != null) q = q.lte('monthly_rent', priceMax)
  if (minBeds != null) q = q.gte('bedrooms', minBeds)
  if (minBaths != null) q = q.gte('bathrooms', minBaths)
  if (minSqft != null) q = q.gte('sqft', minSqft)
  if (moveIn) q = q.or(`available_date.is.null,available_date.lte.${moveIn}`)
  // site test 2026-10-28 (C-D2): the forms write pets_allowed (yes / no / restricted); pet_policy is the older free text
  if (pets) q = q.or('pet_policy.not.is.null,pets_allowed.in.(yes,restricted)')
  if (bbox) q = q.gte('lat', bbox.s).lte('lat', bbox.n).gte('lng', bbox.w).lte('lng', bbox.e)
  if (tokens.length) q = q.or(tokens.map((t) => `address.ilike.*${t}*,unit.ilike.*${t}*,city.ilike.*${t}*,neighborhood.ilike.*${t}*`).join(','))
  q = sort === 'price_asc' ? q.order('monthly_rent', { ascending: true }) : sort === 'price_desc' ? q.order('monthly_rent', { ascending: false }) : q.order('created_at', { ascending: false })
  q = q.order('id', { ascending: true }).range(from, from + PAGE_SIZE + 9)
  const { data, error, count } = await q
  // A page past the end makes PostgREST answer 416 (PGRST103) — that is an
  // empty page, not a failure (found 2026-10-13 probing ?page=1 on a 5-row site).
  if (error && error.code === 'PGRST103') {
    return NextResponse.json({ items: [], total: 0, page, pages: 1, page_size: PAGE_SIZE }, { headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } })
  }
  if (error) return NextResponse.json({ error: 'search_failed' }, { status: 502, headers: { 'Cache-Control': 'no-store' } })

  type Row = Record<string, unknown> & { images: unknown; pet_policy: string | null; pets_allowed: string | null; photo_count: number | null; display_address: boolean; address: string; unit: string | null }
  let rows = ((data || []) as Row[]).filter((l) => hasUsablePhotos(l.images))
  const petsOk = (l: Row) => (!!l.pet_policy && !NEGATIVE_PETS.test(l.pet_policy)) || l.pets_allowed === 'yes' || l.pets_allowed === 'restricted'
  if (pets) rows = rows.filter(petsOk)
  // 8.14: a withheld address never leaves the server.
  const items = rows.slice(0, PAGE_SIZE).map((r) => {
    // C-D1: photo_count is a stored column with an old default of 12 that not every write path kept up — the images array is the truth.
    const l = { ...r, images: cardImages(r.images), pet_policy: r.pet_policy ?? r.pets_allowed ?? null, photo_count: Array.isArray(r.images) ? r.images.length : r.photo_count ?? 0 }
    return l.display_address ? l : { ...l, address: '', unit: null, lat: null, lng: null }
  })
  const total = count ?? items.length
  return NextResponse.json(
    { items, total, page, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)), page_size: PAGE_SIZE },
    { headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } },
  )
}
