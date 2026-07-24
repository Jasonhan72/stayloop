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
