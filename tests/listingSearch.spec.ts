// Street/building-level matching for the tenant agent listing search
// (lib/agent/listingSearch.ts): street-token extraction from model keywords,
// case-insensitive AREA_ALIASES normalization (Sugar Wharf / CityPlace),
// and the exact-street rank-or-notice filter pass.
import { describe, expect, it } from 'vitest'
import {
  extractStreetRef,
  extractStreetToken,
  filterByStreetToken,
  normalizeArea,
} from '@/lib/agent/listingSearch'
import type { ListingCard } from '@/lib/agent/types'

describe('extractStreetToken — street/building references in keywords', () => {
  it('extracts the street name from a numbered address', () => {
    expect(extractStreetToken('找 55 Cooper St 的房子')).toBe('cooper')
    expect(extractStreetToken('55 Cooper Street')).toBe('cooper')
  })

  it('matches other street suffixes', () => {
    expect(extractStreetToken('Queens Quay 公寓')).toBe('queens')
    expect(extractStreetToken('120 Bremner Blvd')).toBe('bremner')
  })

  it('hits known building/development aliases', () => {
    expect(extractStreetToken('sugar wharf 一居')).toBe('sugar wharf')
    expect(extractStreetToken('Sugar Wharf 一居')).toBe('sugar wharf')
    expect(extractStreetToken('CityPlace condo')).toBe('cityplace')
  })

  it('returns null for plain type/area keywords', () => {
    expect(extractStreetToken('北约克两房')).toBeNull()
    expect(extractStreetToken('house')).toBeNull()
    expect(extractStreetToken('')).toBeNull()
    expect(extractStreetToken(null)).toBeNull()
    expect(extractStreetToken(undefined)).toBeNull()
  })

  it('keeps the original casing in the label for the notice text', () => {
    expect(extractStreetRef('找 55 Cooper St 的房子')?.label).toBe('55 Cooper St')
    expect(extractStreetRef('Sugar Wharf 一居')?.label).toBe('Sugar Wharf')
  })
})

describe('normalizeArea — case-insensitive aliases', () => {
  it('maps building/development names to their official neighbourhood, any casing', () => {
    expect(normalizeArea('sugar wharf')).toBe('Harbourfront')
    expect(normalizeArea('Sugar Wharf')).toBe('Harbourfront')
    expect(normalizeArea('SUGAR WHARF')).toBe('Harbourfront')
    expect(normalizeArea('CityPlace')).toBe('Fort York')
    expect(normalizeArea('City Place')).toBe('Fort York')
  })

  it('still maps the Chinese aliases', () => {
    expect(normalizeArea('北约克')).toBe('North York')
    expect(normalizeArea('士嘉堡')).toBe('Scarborough')
  })

  it('passes standard area names through unchanged', () => {
    expect(normalizeArea('North York')).toBe('North York')
    expect(normalizeArea('')).toBeNull()
    expect(normalizeArea(null)).toBeNull()
  })
})

function card(id: string, address: string): ListingCard {
  return { id, source: 'realtor', title: `${id} title`, address, price: 2500, beds: 1 }
}

describe('filterByStreetToken — rank exact-street hits or attach honest notice', () => {
  const ref = { token: 'cooper', label: '55 Cooper St' }

  it('floats address matches to the front without a notice', () => {
    const cards = [card('a', '88 Blue Jays Way'), card('b', '605 - 55 Cooper St'), card('c', '18 York St')]
    const r = filterByStreetToken(cards, ref, 'Harbourfront')
    expect(r.listings.map((l) => l.id)).toEqual(['b', 'a', 'c'])
    expect(r.notice).toBeUndefined()
  })

  it('keeps cards and attaches the same-area notice when nothing matches', () => {
    const cards = [card('a', '88 Blue Jays Way'), card('c', '18 York St')]
    const r = filterByStreetToken(cards, { token: 'sugar wharf', label: 'Sugar Wharf' }, 'Harbourfront')
    expect(r.listings.map((l) => l.id)).toEqual(['a', 'c'])
    expect(r.notice).toContain('Sugar Wharf')
    expect(r.notice).toContain('Harbourfront')
    expect(r.notice).toContain('暂无直接挂牌')
  })

  it('is a no-op without a street ref or without cards', () => {
    const cards = [card('a', '88 Blue Jays Way')]
    expect(filterByStreetToken(cards, null, 'Harbourfront')).toEqual({ listings: cards })
    expect(filterByStreetToken([], ref, 'Harbourfront')).toEqual({ listings: [] })
  })
})

// 2026-09-12: the Jina prepaid balance ran out (402) and every search
// silently degraded to the DB's two rows while the reply blamed "thin
// inventory". A provider failure must be reported as one.
import { externalFromStatuses } from '@/lib/agent/listingSearch'
describe('externalFromStatuses — provider outage vs empty page', () => {
  it('any 200 means the source answered', () => {
    expect(externalFromStatuses([402, 200, 0]).status).toBe('ok')
  })
  it('402 balance exhausted is unavailable with a named reason', () => {
    const r = externalFromStatuses([402, 402, 402])
    expect(r.status).toBe('unavailable')
    expect(r.reason).toMatch(/402/)
  })
  it('timeouts only are unavailable too, without a provider code', () => {
    const r = externalFromStatuses([0, 0])
    expect(r.status).toBe('unavailable')
    expect(r.reason).not.toMatch(/402/)
  })
})

// 2026-09-25: a TMU 2-bed search came back empty. Realtor.ca's slugs are not
// the TREB names the model uses (church-yonge-corridor is a map page), and its
// bot check answers some reads with a "Security Check" page that Jina returns
// as HTTP 200 — both had counted as "the page answered, nothing matched".
import { vi } from 'vitest'
import { classifyRealtorPage, readRealtorPage, resolveRealtorSlugs, REALTOR_BLOCKED } from '@/lib/agent/listingSearch'

describe('Realtor.ca slugs, map pages and bot checks (2026-09-25)', () => {
  it('TREB community names resolve to the slugs Realtor.ca actually serves, deduped and best first', () => {
    expect(resolveRealtorSlugs(['Church-Yonge Corridor', 'Bay Street Corridor'])).toEqual(['church-wellesley', 'downtown-yonge-east', 'yonge-bay-corridor', 'bay-street-corridor'])
    expect(resolveRealtorSlugs(['Toronto Metropolitan University', 'Church-Yonge Corridor'], 3)).toEqual(['ryerson', 'downtown-yonge-east', 'church-wellesley'])
    expect(resolveRealtorSlugs(['University', 'Kensington-Chinatown'])).toEqual(['kensington-chinatown', 'bay-street-corridor'])
    expect(resolveRealtorSlugs(['North York', null, ''])).toEqual(['north-york'])
  })
  it('classifies a Jina render: rows → ok, an area page with no rows → empty, the generic map page → nopage, a bot check → blocked', () => {
    expect(classifyRealtorPage('Title: 58 - 2 Bedroom Apartments For Rent in Church & Wellesley\nURL Source: x\n\n[$2,900 / Month 12 Wellesley St E ![img](https://cdn.realtor.ca/listings/a.jpg) 2 Bedrooms 1 Bathroom](https://www.realtor.ca/real-estate/1/x)')).toBe('ok')
    expect(classifyRealtorPage('Title: 0 Apartments For Rent in Nowhere, Toronto\nURL Source: x\n\nMarkdown Content: nothing here')).toBe('empty')
    expect(classifyRealtorPage('Title: MLS® & Real Estate Map\nURL Source: https://www.realtor.ca/on/toronto/church-yonge-corridor/apartments-for-rent\n\nMarkdown Content: Find a REALTOR® …')).toBe('nopage')
    expect(classifyRealtorPage('Title: Just a moment...\nURL Source: x\nWarning: This page maybe requiring CAPTCHA\n\n## Performing security verification')).toBe('blocked')
    expect(classifyRealtorPage('Title: Security Check / Contrôle de sécurité\nURL Source: x\nWarning: Target URL returned error 403: Forbidden')).toBe('blocked')
  })
  it('a bot check on every read is "unavailable · realtor.ca bot check", never "no results"; one real page still means ok', () => {
    expect(externalFromStatuses([REALTOR_BLOCKED, REALTOR_BLOCKED])).toEqual({ status: 'unavailable', reason: 'realtor.ca bot check' })
    expect(externalFromStatuses([REALTOR_BLOCKED, 200]).status).toBe('ok')
    expect(externalFromStatuses([402, REALTOR_BLOCKED]).reason).toMatch(/402/) // the account problem wins
  })
  it('a blocked read is retried once through Jina’s proxy pool; a map page is a 404, not an answer', async () => {
    const calls: { url: string; headers: Record<string, string> }[] = []
    const page = 'Title: 77 - 2 Bedroom Apartments For Rent in Bay Street Corridor\nURL Source: x\n\n[$3,100/Monthly 1001 Bay St ![img](https://cdn.realtor.ca/listings/b.jpg) 2 Bedrooms 2 Bathrooms 800 Square Feet](https://www.realtor.ca/real-estate/2/y)'
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: { headers: Record<string, string> }) => {
      calls.push({ url, headers: init.headers })
      const body = url.includes('nowhere') ? 'Title: MLS® & Real Estate Map\nURL Source: x\n' : init.headers['X-Proxy'] === 'auto' ? page : 'Title: Just a moment...\nURL Source: x\nWarning: This page maybe requiring CAPTCHA\n'
      return { ok: true, status: 200, text: async () => body }
    }))
    try {
      const r = await readRealtorPage('k', 'https://www.realtor.ca/on/toronto/bay-street-corridor/2-bedroom-apartments-for-rent', { min_beds: 2 })
      expect(r.status).toBe(200)
      expect(r.cards).toHaveLength(1)
      expect(r.cards[0].address).toBe('1001 Bay St')
      expect(calls).toHaveLength(2)
      expect(calls[0].headers['X-Proxy']).toBeUndefined()
      expect(calls[1].headers['X-Proxy']).toBe('auto')
      const missing = await readRealtorPage('k', 'https://www.realtor.ca/on/toronto/nowhere/apartments-for-rent', { min_beds: 2 })
      expect(missing.status).toBe(404)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
