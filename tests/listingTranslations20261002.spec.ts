// Listing translations cache (2026-10-02 · one language per detail page).
// Pins the migration (service role only) and drives /api/listings/enrich end
// to end against an in-memory Supabase fake with the model mocked: the `lang`
// param, the cache keyed by srcHash, the number backstop, the fail-closed
// global cap, and the 15 s wait with the same call finishing via waitUntil.
// 2026-10-02 (later): the page's translations are a call of their own
// (`only: 'translations'`), answered before any geocode / transit / neighbourhood
// work and counted on a separate per-IP key, so the facts call never waits on the model.
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { collectTranslatables, cleanDescription, type TranslatableListing } from '@/lib/listingLang'

type Row = Record<string, any>

const h = vi.hoisted(() => ({
  listing: null as Row | null,
  tr: {} as Record<string, Row>,
  upserts: [] as Row[],
  llm: vi.fn(),
  limit: vi.fn(async (_key: string, _n: number, _failOpen: boolean) => true),
  waitUntil: vi.fn(),
}))

vi.mock('@/lib/rateLimit', () => ({ underHourlyLimit: (k: string, n: number, f: boolean) => h.limit(k, n, f) }))
vi.mock('@/lib/llmChat', () => ({ llmChat: (p: unknown) => h.llm(p) }))
vi.mock('@/lib/modelConfig', () => ({
  DEFAULT_MODELS: { turn: 'claude-sonnet-4-6' },
  getModel: async () => 'claude-sonnet-4-6',
  getModelDefAsync: async () => ({ id: 'claude-sonnet-4-6', provider: 'anthropic' }),
  getModelDef: () => ({ id: 'claude-sonnet-4-6', provider: 'anthropic' }),
}))
vi.mock('@cloudflare/next-on-pages', () => ({ getRequestContext: () => ({ ctx: { waitUntil: (p: Promise<unknown>) => h.waitUntil(p) } }) }))
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table: string) => {
      const filters: Row = {}
      let head = false
      const q: Row = {
        select: (_c?: string, o?: { head?: boolean }) => { head = !!o?.head; return q },
        eq: (k: string, v: unknown) => { filters[k] = v; return q },
        or: () => q, ilike: () => q, neq: () => q, limit: () => q,
        maybeSingle: async () => ({
          data: table === 'listings' ? h.listing : table === 'listing_translations' ? (h.tr[`${filters.listing_id}:${filters.lang}`] ?? null) : null,
        }),
        update: () => ({ eq: async () => ({ error: null }) }),
        upsert: async (row: Row) => {
          h.upserts.push(row)
          if (table === 'listing_translations') h.tr[`${row.listing_id}:${row.lang}`] = row
          return { error: null }
        },
        then: (res: (v: unknown) => unknown) => Promise.resolve(head ? { count: 0 } : { data: [] }).then(res),
      }
      return q
    },
  }),
}))

const SRC = readFileSync('app/api/listings/enrich/route.ts', 'utf8')
const MIG = readFileSync('supabase/migrations/20261002_listing_translations.sql', 'utf8')

const HURON = 'Welcome To Suite 601 At Designhaus, A Two Bedroom Split Design Located Just Across U Of T Campus At The Corner Of Huron & College. Locker Included. (43963489)'
const HURON_SRC = cleanDescription(HURON)

let seq = 0
function listing(extra: Row = {}): Row {
  seq += 1
  return {
    id: `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`,
    address: '601 - 181 HURON STREET', unit: '601', city: 'Toronto', province: 'ON', postal_code: 'M5T 0E1', neighborhood: null,
    lat: 43.658, lng: -79.398, transit: { stations: [], fetched_at: new Date().toISOString() }, enriched_at: new Date().toISOString(),
    is_active: true, verification_status: 'verified', source: 'realtor', bedrooms: 2,
    description: HURON, parking: 'No Garage', property_type: 'condo', ownership_title: 'condominium',
    amenities: ['Balcony', 'Carpet Free', 'Storage - Locker'], appliances: ['Dishwasher', 'Dryer'], utilities_included: [],
    heating_type: 'Forced air (Natural gas)', cooling: 'Central air conditioning', exterior_finish: 'Concrete',
    ...extra,
  }
}

async function call(body: Row) {
  const { POST } = await import('@/app/api/listings/enrich/route')
  const res = await POST(new Request('http://localhost/api/listings/enrich', { method: 'POST', body: JSON.stringify(body) }))
  return { status: res.status, json: (await res.json()) as Row }
}

const flush = async () => { for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r)) }

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://supabase.test'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'svc'
  h.tr = {}
  h.upserts = []
  h.llm.mockReset()
  h.limit.mockReset()
  h.limit.mockImplementation(async () => true)
  h.waitUntil.mockReset()
})
afterEach(() => { vi.useRealTimers() })

describe('migration 20261002_listing_translations.sql', () => {
  it('one row per (listing, lang), cascades with the listing', () => {
    expect(MIG).toMatch(/create table if not exists public\.listing_translations/)
    expect(MIG).toMatch(/listing_id uuid not null references public\.listings\(id\) on delete cascade/)
    expect(MIG).toMatch(/lang\s+text not null check \(lang in \('zh', 'en'\)\)/)
    expect(MIG).toMatch(/src_hash\s+text not null/)
    expect(MIG).toMatch(/strings\s+jsonb not null default '\{\}'::jsonb/)
    expect(MIG).toMatch(/primary key \(listing_id, lang\)/)
  })
  it('service role only: RLS on, no policies, nothing for public / anon / authenticated', () => {
    const sql = MIG.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')
    expect(sql).toMatch(/alter table public\.listing_translations enable row level security/)
    expect(sql).not.toMatch(/create policy/i)
    expect(sql).toMatch(/revoke all on table public\.listing_translations from public, anon, authenticated/)
    expect(sql).toMatch(/grant all on table public\.listing_translations to service_role/)
    expect(sql).not.toMatch(/grant [^;]*to [^;]*(anon|authenticated|public)\b/i)
  })
  it('no new columns on listings (its triggers treat any column change as a landlord edit)', () => {
    expect(MIG).not.toMatch(/alter table public\.listings\b/i)
  })
})

describe('enrich route contract (source)', () => {
  it('reads every field collectTranslatables uses', () => {
    const cols = SRC.match(/const LANG_COLUMNS = '([^']+)'/)![1].split(',').map((c) => c.trim())
    const fields: (keyof TranslatableListing)[] = ['description', 'pet_policy', 'parking', 'lease_term', 'land_size', 'heating_type', 'heating_fuel', 'cooling', 'basement_type', 'exterior_finish', 'property_type', 'ownership_title', 'amenities', 'building_features', 'appliances', 'utilities_included']
    // pets_allowed / parking_spaces: when set, the page hides pet_policy / parking, so those are not sent.
    expect(cols.sort()).toEqual([...fields, 'pets_allowed', 'parking_spaces'].sort())
    // …and each of them really feeds collectTranslatables (an unknown value in one field → one string).
    for (const f of fields) {
      const v = ['amenities', 'building_features', 'appliances', 'utilities_included'].includes(f) ? ['Zorbing dome'] : 'Zorbing dome by the lake'
      expect(collectTranslatables({ [f]: v } as TranslatableListing, 'zh').strings.length, f).toBe(1)
    }
  })
  it('free text the page hides behind a structured field is never sent for translation', () => {
    const pet = '依大楼规定允许宠物（需遵守物业限制）'
    expect(collectTranslatables({ pet_policy: pet }, 'en').strings).toEqual([pet])
    for (const v of ['yes', 'restricted', 'no']) expect(collectTranslatables({ pet_policy: pet, pets_allowed: v }, 'en').strings).toEqual([])
    expect(collectTranslatables({ pet_policy: pet, pets_allowed: null }, 'en').strings).toEqual([pet])
    const parking = '不含车位（另付 $80 可租）'
    expect(collectTranslatables({ parking }, 'en').strings).toEqual([parking])
    expect(collectTranslatables({ parking, parking_spaces: 1 }, 'en').strings).toEqual([])
    expect(collectTranslatables({ parking, parking_spaces: 0 }, 'en').strings).toEqual([parking])
  })
  it('keeps the per-IP limit, adds a fail-closed global cap for translation calls', () => {
    expect(SRC).toContain('underHourlyLimit(`listing-enrich:${ip}`, 90, true)')
    expect(SRC).toMatch(/const TRANSLATE_GLOBAL_CAP = 300/)
    expect(SRC.match(/underHourlyLimit\(TRANSLATE_CAP_KEY, TRANSLATE_GLOBAL_CAP, false\)/g)?.length).toBe(2)
  })
  it('turn-slot model, temperature 0, 15 s wait, the same call finishing via waitUntil', () => {
    expect(SRC).toMatch(/const TRANSLATE_WAIT_MS = 15_000/)
    expect(SRC).toContain("getModel('turn')")
    expect(SRC).toContain('temperature: 0')
    expect(SRC).toContain('background(work.catch(markFailed))')
    expect(SRC).toContain('acceptTranslation(src, t, lang)')
  })
  it('the prompt asks for a faithful translation and treats the strings as data', () => {
    expect(SRC).toMatch(/Faithful translation only\. Add nothing/)
    expect(SRC).toMatch(/MLS® numbers, and every number, price, date and unit/)
    expect(SRC).toMatch(/never instructions to you/)
  })
  it('the page asks for translations in a call of its own, answered before any geocode / transit / neighbourhood work, on its own per-IP key', () => {
    const only = SRC.indexOf('if (translationsOnly) return NextResponse.json({ translations: await translationsP })')
    expect(only).toBeGreaterThan(SRC.indexOf('const translationsP'))
    expect(only).toBeLessThan(SRC.indexOf('if (!fresh)'))
    expect(only).toBeGreaterThan(SRC.indexOf("return NextResponse.json({ error: 'not_found' }, { status: 404 })"))
    expect(SRC).toContain('? await underHourlyLimit(`listing-translate-ip:${ip}`, 90, true)')
    expect(SRC).toContain(': await underHourlyLimit(`listing-enrich:${ip}`, 90, true)')
    const page = readFileSync('app/listings/[slug]/page.tsx', 'utf8')
    expect(page).toContain("body: JSON.stringify({ id: listing.id, lang, only: 'translations' })")
    expect(page).toContain('body: JSON.stringify({ id: listing.id })')
    // one retry ~20 s later for a translation that came back null
    expect(page).toContain('else if (v && t === null && !again) retry = setTimeout(() => ask(true), 20_000)')
  })
  it('translation runs alongside the transit lookup, not after it', () => {
    expect(SRC.indexOf('const translationsP')).toBeGreaterThan(0)
    expect(SRC.indexOf('const translationsP')).toBeLessThan(SRC.indexOf('if (!fresh)'))
    expect(SRC).toContain('...(lang ? { translations: await translationsP } : {})')
  })
})

describe('enrich route behaviour (Supabase and the model faked)', () => {
  it('without `lang` the response has no translations key and no model call', async () => {
    h.listing = listing()
    const { status, json } = await call({ id: h.listing.id })
    expect(status).toBe(200)
    expect('translations' in json).toBe(false)
    expect(h.llm).not.toHaveBeenCalled()
  })

  it('nothing to translate → { lang, strings: {} }, no cache read, no model call', async () => {
    h.listing = listing()
    const { json } = await call({ id: h.listing.id, lang: 'en' })
    expect(json.translations).toEqual({ lang: 'en', strings: {} })
    expect(h.llm).not.toHaveBeenCalled()
    expect(h.upserts).toEqual([])
  })

  it('translates the missing strings once, caches them by srcHash, then serves the cache', async () => {
    h.listing = listing()
    h.llm.mockResolvedValueOnce({ text: JSON.stringify({ s1: '欢迎来到 Designhaus 601 室，两卧分离式户型，位于 Huron & College 转角、U of T 校园对面。含储物柜。' }) })
    const { json } = await call({ id: h.listing.id, lang: 'zh' })
    expect(json.translations.lang).toBe('zh')
    expect(json.translations.strings[HURON_SRC]).toMatch(/^欢迎来到 Designhaus 601 室/)
    // One call, the source string inside the JSON object.
    expect(h.llm).toHaveBeenCalledTimes(1)
    const p = h.llm.mock.calls[0][0] as Row
    expect(JSON.parse(p.messages[0].content)).toEqual({ s1: HURON_SRC })
    expect(p.temperature).toBe(0)
    expect(p.system).toMatch(/Simplified Chinese/)
    // A pending marker, then the real row keyed by srcHash with the model id.
    const want = collectTranslatables(h.listing as TranslatableListing, 'zh').srcHash
    expect(h.upserts.map((u) => u.src_hash)).toEqual([`pending:${want}`, want])
    expect(h.upserts[1].model).toBe('claude-sonnet-4-6')
    // The global cap was checked fail-closed.
    expect(h.limit).toHaveBeenCalledWith('listing-translate:global', 300, false)

    const again = await call({ id: h.listing.id, lang: 'zh' })
    expect(again.json.translations.strings[HURON_SRC]).toMatch(/^欢迎来到/)
    expect(h.llm).toHaveBeenCalledTimes(1)
  })

  it('number backstop: a translation stating a number the source does not is not kept (retried only after the back-off)', async () => {
    h.listing = listing({ description: 'Spacious 799 sqft 1-bedroom unit. Unfurnished.' })
    h.llm.mockResolvedValueOnce({ text: JSON.stringify({ s1: '宽敞的 74 平方米一卧单位，不带家具。' }) })
    const { json } = await call({ id: h.listing.id, lang: 'zh' })
    expect(json.translations).toEqual({ lang: 'zh', strings: {} })
    // Stored as a failure (retried after FAILED_MS), not as a finished empty translation.
    expect(String(h.upserts.at(-1)?.src_hash)).toMatch(/^failed:/)
    const second = await call({ id: h.listing.id, lang: 'zh' })
    expect(second.json.translations).toBeNull()
    expect(h.llm).toHaveBeenCalledTimes(1)
  })

  it('a changed listing reuses translations still in use and translates only the new strings', async () => {
    h.listing = listing({ amenities: ['Zorbing Dome'] })
    h.llm.mockResolvedValueOnce({ text: JSON.stringify({ s1: '球形泡泡屋', s2: '欢迎来到 Designhaus 601 室。含储物柜。' }) })
    await call({ id: h.listing.id, lang: 'zh' })
    h.listing = { ...h.listing, amenities: ['Zorbing Dome', 'Koi Pond'] }
    h.llm.mockResolvedValueOnce({ text: JSON.stringify({ s1: '锦鲤池' }) })
    const { json } = await call({ id: h.listing.id, lang: 'zh' })
    expect(JSON.parse((h.llm.mock.calls[1][0] as Row).messages[0].content)).toEqual({ s1: 'Koi Pond' })
    expect(json.translations.strings).toMatchObject({ 'Zorbing Dome': '球形泡泡屋', 'Koi Pond': '锦鲤池' })
  })

  it('over the global cap (or with the limiter down) → null, no model call', async () => {
    h.listing = listing()
    h.limit.mockImplementation(async (key: string) => !key.startsWith('listing-translate'))
    const { status, json } = await call({ id: h.listing.id, lang: 'zh' })
    expect(status).toBe(200)
    expect(json.translations).toBeNull()
    expect(h.llm).not.toHaveBeenCalled()
  })

  it('a recent pending marker for the same sources → null without another call', async () => {
    h.listing = listing()
    const hash = collectTranslatables(h.listing as TranslatableListing, 'zh').srcHash
    h.tr[`${h.listing.id}:zh`] = { listing_id: h.listing.id, lang: 'zh', src_hash: `pending:${hash}`, strings: {}, created_at: new Date().toISOString() }
    const { json } = await call({ id: h.listing.id, lang: 'zh' })
    expect(json.translations).toBeNull()
    expect(h.llm).not.toHaveBeenCalled()
  })

  it('slower than 15 s → null now; the same call finishes via waitUntil and fills the cache', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    h.listing = listing()
    let resolve!: (v: unknown) => void
    h.llm.mockReturnValueOnce(new Promise((r) => { resolve = r }))
    const pending = call({ id: h.listing.id, lang: 'zh' })
    await vi.advanceTimersByTimeAsync(15_000)
    const { json } = await pending
    expect(json.translations).toBeNull()
    expect(h.waitUntil).toHaveBeenCalledTimes(1)
    resolve({ text: JSON.stringify({ s1: '欢迎来到 Designhaus 601 室。含储物柜。' }) })
    await h.waitUntil.mock.calls[0][0]
    const want = collectTranslatables(h.listing as TranslatableListing, 'zh').srcHash
    expect(h.tr[`${h.listing.id}:zh`].src_hash).toBe(want)
    expect(h.llm).toHaveBeenCalledTimes(1)
  })

  it('a fast failure → null now, one retry after the response; a second failure leaves a failure marker', async () => {
    h.listing = listing()
    h.llm.mockRejectedValueOnce(new Error('upstream 500')).mockRejectedValueOnce(new Error('upstream 500'))
    const { json } = await call({ id: h.listing.id, lang: 'zh' })
    expect(json.translations).toBeNull()
    expect(h.waitUntil).toHaveBeenCalledTimes(1)
    await h.waitUntil.mock.calls[0][0]
    await flush()
    expect(h.llm).toHaveBeenCalledTimes(2)
    const hash = collectTranslatables(h.listing as TranslatableListing, 'zh').srcHash
    expect(h.tr[`${h.listing.id}:zh`].src_hash).toBe(`failed:${hash}`)
    // Within 15 min nobody pays for another try.
    const again = await call({ id: h.listing.id, lang: 'zh' })
    expect(again.json.translations).toBeNull()
    expect(h.llm).toHaveBeenCalledTimes(2)
  })

  it('only: translations → just the translations, nothing else computed, a separate per-IP key', async () => {
    h.listing = listing({ lat: null, lng: null, transit: null, enriched_at: null, neighborhood: 'Discovery District' })
    h.llm.mockResolvedValueOnce({ text: JSON.stringify({ s1: '欢迎来到 Designhaus 601 室。含储物柜。' }) })
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const { status, json } = await call({ id: h.listing.id, lang: 'zh', only: 'translations' })
    expect(status).toBe(200)
    expect(Object.keys(json)).toEqual(['translations'])
    expect(json.translations.strings[HURON_SRC]).toMatch(/^欢迎来到/)
    // No Nominatim / Overpass call, no neighbourhood primer in the background.
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(h.waitUntil).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
    const keys = h.limit.mock.calls.map((c) => c[0])
    expect(keys.some((k) => k.startsWith('listing-translate-ip:'))).toBe(true)
    expect(keys.some((k) => k.startsWith('listing-enrich:'))).toBe(false)
  })

  it('the facts call (no lang) counts against listing-enrich only and returns no translations', async () => {
    h.listing = listing()
    await call({ id: h.listing.id })
    const keys = h.limit.mock.calls.map((c) => c[0])
    expect(keys.some((k) => k.startsWith('listing-enrich:'))).toBe(true)
    expect(keys.some((k) => k.startsWith('listing-translate-ip:'))).toBe(false)
  })

  it('only: translations without a language is a bad request', async () => {
    h.listing = listing()
    const { status } = await call({ id: h.listing.id, only: 'translations' })
    expect(status).toBe(400)
    expect(h.limit).not.toHaveBeenCalled()
  })

  it('only: translations on a non-public listing is still 404', async () => {
    h.listing = listing({ verification_status: 'pending', source: 'stayloop' })
    const { status } = await call({ id: h.listing.id, lang: 'zh', only: 'translations' })
    expect(status).toBe(404)
    expect(h.llm).not.toHaveBeenCalled()
  })

  it('a non-public listing is still 404 and nothing is translated', async () => {
    h.listing = listing({ is_active: false })
    const { status } = await call({ id: h.listing.id, lang: 'zh' })
    expect(status).toBe(404)
    expect(h.llm).not.toHaveBeenCalled()
  })
})

// 2026-10-02 (30-listing import): six descriptions came back from the model unusable and the
// route cached an empty translation under the final hash, so they were never retried.
describe('a translation the model did not deliver is retried, not cached as done', () => {
  const src = readFileSync('app/api/listings/enrich/route.ts', 'utf8')
  it('marks the set failed when any requested string is missing', () => {
    expect(src).toMatch(/const missing = todo\.some\(\(src\) => !\(src in r\.strings\)\)/)
    expect(src).toMatch(/missing \? `failed:\$\{need\.srcHash\}` : need\.srcHash/)
  })
  it('a recent failure still returns the parts that did translate', () => {
    expect(src).toMatch(/age < FAILED_MS\) return Object\.keys\(cached\)\.length \? \{ lang, strings: cached \} : null/)
  })
})
