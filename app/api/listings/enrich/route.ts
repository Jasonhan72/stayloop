// Listing detail enrichment (StreetEasy comparison, 2026-09-25): geocode the
// address once (Nominatim), find the nearest subway / GO / streetcar stops
// once (Overpass, OpenStreetMap), cache both on the row for 30 days; and on
// every call return two cheap aggregates the page cannot compute under the
// anonymous RLS — other active units at the same address, and the
// neighbourhood's asking-rent medians. Public listings only, rate limited per
// IP, nothing the caller sends is stored.
import { NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { underHourlyLimit } from '@/lib/rateLimit'
import { median, pickTransit, type ListingTransit } from '@/lib/listingInsights'
import { DEFAULT_MODELS, getModel, getModelDef, getModelDefAsync } from '@/lib/modelConfig'
import { llmChat } from '@/lib/llmChat'
import { parseModelJson } from '@/lib/screening/jsonRepair'
import { stripNul } from '@/lib/screening/jsonSafe'

export const runtime = 'edge'

const UA = 'Stayloop/0.6 (https://www.stayloop.ai; privacy@stayloop.ai)'
const FRESH_MS = 30 * 86_400_000
const VISIBLE = 'verification_status.eq.verified,source.eq.realtor'

type Row = {
  id: string; address: string; unit: string | null; city: string; province: string | null; postal_code: string | null
  neighborhood: string | null; lat: number | null; lng: number | null; transit: ListingTransit | null; enriched_at: string | null
  is_active: boolean; verification_status: string | null; source: string | null; bedrooms: number | null
}

async function geocode(q: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const u = `https://nominatim.openstreetmap.org/search?${new URLSearchParams({ format: 'jsonv2', limit: '1', countrycodes: 'ca', q })}`
    const res = await fetch(u, { headers: { 'User-Agent': UA, 'Accept-Language': 'en' }, signal: AbortSignal.timeout(8000) })
    if (!res.ok) return null
    const rows = (await res.json()) as { lat: string; lon: string }[]
    if (!rows?.[0]) return null
    const lat = Number(rows[0].lat), lng = Number(rows[0].lon)
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null
  } catch { return null }
}

// "关于社区" prose (StreetEasy "About Murray Hill"): written once per
// (city, neighbourhood) from facts we hold, cached in neighborhood_profiles,
// labelled as AI-written on the page. The prompt forbids numbers, years,
// prices, safety or demographic claims (OHRC) — the numbers next to it come
// from our own tables, not from the model.
const PROFILE_PROMPT = `You write short, neutral neighbourhood primers for a Toronto-area rental site.
Use only well-known, general knowledge about the named neighbourhood plus the facts given. Do NOT include numbers, years, prices, rents, distances, statistics, crime or safety claims, or anything about who lives there by ethnicity, income, religion, family status or age (Ontario Human Rights Code). No superlatives, no marketing tone.
Write 3–4 sentences on: the area's character and streetscape, everyday conveniences (groceries, parks, culture, campuses or offices nearby if well known), and how people get around (name the transit lines or stations from the facts).
Return only JSON: {"zh": "<Simplified Chinese>", "en": "<English>"}`

async function neighbourhoodProfile(svc: SupabaseClient, city: string, name: string, facts: Record<string, unknown>): Promise<{ zh: string; en: string; generated_at: string } | null> {
  const { data: cached } = await svc.from('neighborhood_profiles').select('zh, en, generated_at').eq('city', city).eq('name', name).maybeSingle()
  if (cached) return cached as { zh: string; en: string; generated_at: string }
  try {
    const modelId = await getModel('turn')
    const def = (await getModelDefAsync(modelId)) ?? getModelDef(DEFAULT_MODELS.turn)!
    const { text } = await llmChat({
      model: def,
      system: PROFILE_PROMPT,
      messages: [{ role: 'user', content: `Neighbourhood: ${name}, ${city}, Ontario\nFacts (for grounding only): ${JSON.stringify(facts).slice(0, 2000)}` }],
      maxTokens: 900,
      temperature: 0.3,
      jsonMode: def.provider === 'openai-compat',
      prefillJson: def.provider === 'anthropic',
      signal: AbortSignal.timeout(40_000),
      meta: { slot: 'turn', source: 'listings/enrich' },
    })
    const parsed = parseModelJson(text) as { zh?: unknown; en?: unknown } | null
    const zh = typeof parsed?.zh === 'string' ? stripNul(parsed.zh).trim().slice(0, 900) : ''
    const en = typeof parsed?.en === 'string' ? stripNul(parsed.en).trim().slice(0, 1200) : ''
    // Money, percentages, years or big figures in the prose mean the model ignored
    // the brief — do not publish it (transit line numbers such as "Line 1" are fine).
    const hardNumber = /\$\s?\d|\d\s?%|\b(19|20)\d{2}\b|\d{1,3}(,\d{3})+|\b\d{4,}\b/
    if (!zh || !en || hardNumber.test(zh) || hardNumber.test(en)) {
      console.warn('[listings/enrich] profile rejected', { zh: zh.slice(0, 80), en: en.slice(0, 80), raw: text.slice(0, 240), keys: parsed ? Object.keys(parsed) : null })
      return null
    }
    const row = { city, name, zh, en, model: def.id, facts, generated_at: new Date().toISOString() }
    await svc.from('neighborhood_profiles').upsert(row, { onConflict: 'city,name' })
    return { zh, en, generated_at: row.generated_at }
  } catch (e) {
    console.warn('[listings/enrich] profile failed', (e as Error).message)
    return null
  }
}

async function nearbyTransit(lat: number, lng: number): Promise<ListingTransit | null> {
  const q = `[out:json][timeout:15];(node(around:1500,${lat},${lng})["railway"="station"];node(around:1500,${lat},${lng})["public_transport"="station"]["subway"="yes"];node(around:600,${lat},${lng})["railway"="tram_stop"];);out body 80;`
  try {
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(q)}`,
      signal: AbortSignal.timeout(20000),
    })
    if (!res.ok) return null
    const json = (await res.json()) as { elements?: { lat: number; lon: number; tags?: Record<string, string> }[] }
    return { stations: pickTransit(json.elements || [], lat, lng), fetched_at: new Date().toISOString() }
  } catch { return null }
}

export async function POST(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return NextResponse.json({ error: 'unavailable' }, { status: 503 })
  let body: { id?: unknown } = {}
  try { body = await req.json() } catch { /* empty body */ }
  const id = typeof body.id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.id) ? body.id : null
  if (!id) return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  const ip = req.headers.get('cf-connecting-ip') || (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'anon'
  if (!(await underHourlyLimit(`listing-enrich:${ip}`, 90, true))) return NextResponse.json({ error: 'rate_limited' }, { status: 429 })

  const svc = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data } = await svc
    .from('listings')
    .select('id, address, unit, city, province, postal_code, neighborhood, lat, lng, transit, enriched_at, is_active, verification_status, source, bedrooms')
    .eq('id', id)
    .maybeSingle()
  const l = data as Row | null
  // Only what the public can already see.
  if (!l || !l.is_active || !(l.verification_status === 'verified' || l.source === 'realtor')) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  let lat = l.lat, lng = l.lng, transit = l.transit
  const fresh = !!l.enriched_at && Date.now() - Date.parse(l.enriched_at) < FRESH_MS && !!transit
  if (!fresh) {
    if (lat == null || lng == null) {
      const g = await geocode(`${l.address}, ${l.city}, ${l.province || 'Ontario'}${l.postal_code ? ` ${l.postal_code}` : ''}`)
      if (g) { lat = g.lat; lng = g.lng }
    }
    if (lat != null && lng != null) transit = (await nearbyTransit(lat, lng)) ?? transit
    // Cache even an empty result so a listing outside any station's reach is not re-queried on every view.
    await svc.from('listings').update({ lat, lng, transit: transit ?? { stations: [], fetched_at: new Date().toISOString() }, enriched_at: new Date().toISOString() }).eq('id', id)
  }

  const [{ count: others }, { data: peers }] = await Promise.all([
    svc.from('listings').select('id', { count: 'exact', head: true }).eq('is_active', true).or(VISIBLE).ilike('address', l.address).neq('id', id),
    (l.neighborhood
      ? svc.from('listings').select('monthly_rent, bedrooms').eq('is_active', true).or(VISIBLE).ilike('neighborhood', l.neighborhood).neq('id', id).limit(300)
      : svc.from('listings').select('monthly_rent, bedrooms').eq('is_active', true).or(VISIBLE).ilike('city', l.city).neq('id', id).limit(300)),
  ])
  const rows = ((peers ?? []) as { monthly_rent: number; bedrooms: number | null }[]).filter((r) => r.monthly_rent > 0)
  const sameBeds = rows.filter((r) => (r.bedrooms ?? -1) === (l.bedrooms ?? -2))
  const profile = l.neighborhood
    ? await neighbourhoodProfile(svc, l.city, l.neighborhood, {
        transit: (transit?.stations ?? []).slice(0, 6).map((st) => ({ name: st.name, kind: st.kind, lines: st.lines })),
        listings_in_sample: rows.length,
      })
    : null
  return NextResponse.json(
    {
      lat, lng,
      transit: transit ?? { stations: [] },
      profile,
      building: { other_active: others ?? 0 },
      neighborhood: {
        scope: l.neighborhood ? 'neighborhood' : 'city',
        name: l.neighborhood || l.city,
        all: { n: rows.length, median: median(rows.map((r) => r.monthly_rent)) },
        same_beds: { n: sameBeds.length, median: median(sameBeds.map((r) => r.monthly_rent)) },
      },
    },
    { headers: { 'Cache-Control': 'public, max-age=600' } },
  )
}
