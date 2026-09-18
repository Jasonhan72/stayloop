// Commercial / industrial lease search — the tenant agent's hidden skill
// (lib/agent/commercialSearch.ts, 2026-09-18). Fixtures are copied from real
// Jina renders of Realtor.ca list and detail pages (2026-09-18).
import { describe, expect, it } from 'vitest'
import {
  buildDetailQueries,
  buildDetailQuery,
  commercialKind,
  extractSpecs,
  isLeaseCandidate,
  listPageUrls,
  monthlyFromRate,
  parseCommercialDetail,
  parseCommercialList,
  parseSqftRange,
  rankCommercial,
  resolveRealtorBase,
} from '@/lib/agent/commercialSearch'
import type { ListingCard } from '@/lib/agent/types'

const LIST_MD = [
  '[![Image 26](https://cdn.realtor.ca/listings/TS639252735352430000/reb82/medres/2/c13800212_1.jpg) MLS®: C13800212 $1,695/Monthly 9 - 595 ST CLAIR AVENUE W, Toronto (Wychwood), Ontario ![Image 27](https://static.realtor.ca/images/common/icons/svg/bath-gray.svg) 1 Bathrooms ![Image 28](https://static.realtor.ca/images/common/icons/svg/square_footage-gray.svg) 0-699 Square Feet RE/MAX HALLMARK REALTY LTD., Brokerage](https://www.realtor.ca/real-estate/30296578/9-595-st-clair-avenue-w-toronto-wychwood)',
  '[![Image 37](https://cdn.realtor.ca/listings/TS639252648641700000/reb82/medres/0/w13799750_1.jpg) MLS®: W13799750 $19.95/sqft 14C - 219 DUFFERIN STREET, Toronto (South Parkdale), Ontario ![Image 38](https://static.realtor.ca/images/common/icons/svg/bath-gray.svg) 10 Bathrooms ![Image 39](https://static.realtor.ca/images/common/icons/svg/square_footage-gray.svg) 3612 Square Feet GITALIS REAL ESTATE INC., Brokerage](https://www.realtor.ca/real-estate/30295973/14c-219-dufferin-street-toronto-south-parkdale)',
  '[![Image 43](https://cdn.realtor.ca/listings/TS639252645286600000/reb82/medres/8/e13799758_1.jpg) MLS®: E13799758 $35/sqft 4 - 735 WARDEN AVENUE, Toronto (Clairlea-Birchmount), Ontario JONES LANG LASALLE REAL ESTATE SERVICES, INC., Brokerage](https://www.realtor.ca/real-estate/30295887/4-735-warden-avenue-toronto-clairlea-birchmount)',
  '[![Image 59](https://cdn.realtor.ca/listings/TS639252632269030000/reb82/medres/4/w13799654_1.jpg) MLS®: W13799654 $1,799/Monthly 11 - 2696 LAKE SHORE BOULEVARD W, Toronto (Mimico), Ontario ![Image 60](https://static.realtor.ca/images/common/icons/svg/bed-gray.svg) 1 Bedrooms ![Image 61](https://static.realtor.ca/images/common/icons/svg/bath-gray.svg) 1 Bathrooms ![Image 62](https://static.realtor.ca/images/common/icons/svg/square_footage-gray.svg) 700+ Square Feet LANDLORD REALTY INC., Brokerage](https://www.realtor.ca/real-estate/30295759/11-2696-lake-shore-boulevard-w-toronto-mimico)',
  '[Find a Home](https://www.realtor.ca/map)',
].join('\n')

const DETAIL_MD = `Title: 134 BETHRIDGE ROAD, Toronto (West Humber-Clairville), Ontario M9W5N4 - REALTOR.ca

[![Image 38: View larger image on a Photo gallery](https://cdn.realtor.ca/listings/TS639132535538230000/reb82/highres/8/w12490908_1.jpg)](https://www.realtor.ca/real-estate/29048297/134-bethridge-road-toronto-west-humber-clairville#)
![Image 44](https://static.realtor.ca/images/common/icons/svg/map-pin-blue.svg)134 BETHRIDGE ROAD $14.95/square feet
 $14.95/square feet
# 134 BETHRIDGE ROAD
Toronto (West Humber-Clairville), Ontario M9W5N4
MLS® Number: W12490908
## Listing Description
 105,368 SF in core north Etobicoke location at Bethridge and Martin Grove Road. Expansive open warehouse area with functional clear height at 22', 8 truck-level doors and 2 drive-in doors. Heavy power 1200 amps service. Zoning: E1.
## Property Summary
Property Type
 Industrial
Community Name
 West Humber-Clairville
## Building
Type
 Industrial (Warehouse)
## Measurements
Square Footage
105368 sqft
## Land
Other Property Information
Zoning Description
 E1
Lease Type
 Net
 Data provided by: [Toronto Regional Real Estate Board](http://www.trebhome.com/)
`

describe('commercialKind — when the hidden skill switches on', () => {
  it('honours an explicit commercial property_type', () => {
    expect(commercialKind({ property_type: 'industrial', keywords: null })).toBe('industrial')
    expect(commercialKind({ property_type: 'Retail', keywords: null })).toBe('retail')
    expect(commercialKind({ property_type: 'land', keywords: '' })).toBe('land')
  })
  it('never flips an explicit residential type', () => {
    expect(commercialKind({ property_type: 'apartment', keywords: 'warehouse district loft' })).toBeNull()
    expect(commercialKind({ property_type: 'house', keywords: 'office' })).toBeNull()
  })
  it('falls back to unmistakable keywords, not amenities', () => {
    expect(commercialKind({ property_type: null, keywords: '找个仓库 30000 sqft' })).toBe('industrial')
    expect(commercialKind({ property_type: null, keywords: 'storefront on Queen West' })).toBe('retail')
    expect(commercialKind({ property_type: null, keywords: '带健身房的公寓' })).toBeNull()
    expect(commercialKind({ property_type: null, keywords: 'studio near Union' })).toBeNull()
    expect(commercialKind({ property_type: null, keywords: null })).toBeNull()
  })
})

describe('resolveRealtorBase — GTA city vs Toronto district', () => {
  it('uses the city page for GTA municipalities and aliases', () => {
    expect(resolveRealtorBase('Mississauga', null)).toBe('https://www.realtor.ca/on/mississauga')
    expect(resolveRealtorBase('密西沙加', null)).toBe('https://www.realtor.ca/on/mississauga')
    expect(resolveRealtorBase('Richmond Hill, ON', null)).toBe('https://www.realtor.ca/on/richmond-hill')
  })
  it('nests Toronto districts and neighbourhoods under /on/toronto', () => {
    expect(resolveRealtorBase('Scarborough', null)).toBe('https://www.realtor.ca/on/toronto/scarborough')
    expect(resolveRealtorBase(null, ['West Humber-Clairville'])).toBe('https://www.realtor.ca/on/toronto/west-humber-clairville')
    expect(resolveRealtorBase('北约克', null)).toBe('https://www.realtor.ca/on/toronto/north-york')
  })
  it('defaults to the GTA-wide page', () => {
    expect(resolveRealtorBase(null, null)).toBe('https://www.realtor.ca/on/greater-toronto-area')
    expect(resolveRealtorBase('Greater Toronto Area', null)).toBe('https://www.realtor.ca/on/greater-toronto-area')
    expect(resolveRealtorBase('GTA 都行', null)).toBe('https://www.realtor.ca/on/greater-toronto-area')
  })
  it('only ever emits realtor.ca hosts with [a-z0-9-] slugs', () => {
    const b = resolveRealtorBase('evil.com/../x?y=1', null)
    expect(b.startsWith('https://www.realtor.ca/on/')).toBe(true)
    expect(/^https:\/\/www\.realtor\.ca\/on\/[a-z0-9-]+(\/[a-z0-9-]+)?$/.test(b)).toBe(true)
  })
  it('adds the office variant only for office searches', () => {
    expect(listPageUrls('https://www.realtor.ca/on/vaughan', 'industrial')).toEqual(['https://www.realtor.ca/on/vaughan/commercial-space-for-lease'])
    expect(listPageUrls('https://www.realtor.ca/on/vaughan', 'office')[0]).toBe('https://www.realtor.ca/on/vaughan/office-space-for-lease')
  })
})

describe('price + area normalisation', () => {
  it('turns a $/sqft/year net rate into an estimated monthly figure', () => {
    expect(monthlyFromRate(14.95, 105368)).toBe(Math.round((14.95 * 105368) / 12))
    expect(monthlyFromRate(35, undefined)).toBeUndefined()
  })
  it('reads sqft ranges the list rows print', () => {
    expect(parseSqftRange('0-699 Square Feet')).toEqual({ min: 0, max: 699 })
    expect(parseSqftRange('700+ Square Feet')).toEqual({ min: 700 })
    expect(parseSqftRange('1750 Square Feet')).toEqual({ min: 1750, max: 1750 })
    expect(parseSqftRange('105,368 sqft')).toEqual({ min: 105368, max: 105368 })
    expect(parseSqftRange('no area here')).toBeUndefined()
  })
})

describe('extractSpecs — only what the listing states', () => {
  it('quotes clear height, doors, zoning and power', () => {
    const s = extractSpecs("functional clear height at 22', 8 truck-level doors and 2 drive-in doors. Heavy power 1200 amps service. Zoning: E1.")
    expect(s).toContain("净高 22'")
    expect(s).toContain('8 truck-level')
    expect(s).toContain('2 drive-in')
    expect(s).toContain('Zoning E1')
    expect(s).toContain('1200A')
  })
  it('reads "24 ft clear" and "clear height of 18 feet" phrasings', () => {
    expect(extractSpecs('The building features a 24 ft clear height')).toContain("净高 24'")
    expect(extractSpecs('clear height of 18 feet')).toContain("净高 18'")
    expect(extractSpecs('sunny retail unit on Queen')).toEqual([])
  })
})

describe('parseCommercialList — Realtor.ca list rows', () => {
  const cards = parseCommercialList(LIST_MD, 'commercial')
  it('parses monthly and per-sqft rows, skipping non-listing lines', () => {
    expect(cards).toHaveLength(4)
    const monthly = cards.find((c) => c.address === '9 - 595 ST CLAIR AVENUE W')!
    expect(monthly.price).toBe(1695)
    expect(monthly.price_basis).toBe('monthly')
    expect(monthly.sqft_min).toBe(0)
    expect(monthly.sqft_max).toBe(699)
    expect(monthly.neighborhood).toBe('Wychwood')
    expect(monthly.city).toBe('Toronto')
    expect(monthly.url).toBe('https://www.realtor.ca/real-estate/30296578/9-595-st-clair-avenue-w-toronto-wychwood')
    expect(monthly.id).toBe('30296578')
  })
  it('estimates monthly rent from $/sqft × area ÷ 12 and labels it', () => {
    const psf = cards.find((c) => c.address === '14C - 219 DUFFERIN STREET')!
    expect(psf.rate_psf).toBe(19.95)
    expect(psf.sqft).toBe(3612)
    expect(psf.price).toBe(Math.round((19.95 * 3612) / 12))
    expect(psf.price_basis).toBe('psf_estimate')
    expect(psf.note).toMatch(/不含 TMI/)
  })
  it('keeps a per-sqft row with no printed area as price-unknown', () => {
    const warden = cards.find((c) => c.address === '4 - 735 WARDEN AVENUE')!
    expect(warden.rate_psf).toBe(35)
    expect(warden.price).toBe(0)
    expect(warden.price_basis).toBe('unknown')
    expect(warden.sqft).toBeUndefined()
  })
  it('marks every card as commercial / realtor with no bedrooms', () => {
    for (const c of cards) {
      expect(c.kind).toBe('commercial')
      expect(c.source).toBe('realtor')
      expect(c.beds).toBe(0)
      expect(c.image).toMatch(/^https:\/\/cdn\.realtor\.ca\//)
    }
  })
})

describe('parseCommercialDetail — Realtor.ca detail page', () => {
  const card = parseCommercialDetail(DETAIL_MD, 'https://www.realtor.ca/real-estate/29048297/134-bethridge-road-toronto-west-humber-clairville', 'commercial')!
  it('reads address, type, area, rate and specs', () => {
    expect(card.address).toBe('134 BETHRIDGE ROAD')
    expect(card.neighborhood).toBe('West Humber-Clairville')
    expect(card.city).toBe('Toronto')
    expect(card.property_type).toBe('Industrial (Warehouse)')
    expect(card.sqft).toBe(105368)
    expect(card.rate_psf).toBe(14.95)
    expect(card.price).toBe(Math.round((14.95 * 105368) / 12))
    expect(card.specs).toEqual(expect.arrayContaining(["净高 22'", '8 truck-level', '2 drive-in', 'Zoning E1', 'Net lease']))
    expect(card.title).toBe('Industrial (Warehouse) · 105,368 sqft')
    expect(card.id).toBe('29048297')
  })
  it('returns null without an H1 address', () => {
    expect(parseCommercialDetail('Title: 404\nnothing here', 'https://www.realtor.ca/real-estate/1/x', 'industrial')).toBeNull()
  })
})

describe('rankCommercial — min_sqft / max_price', () => {
  const mk = (address: string, sqft: number | undefined, price: number, basis: ListingCard['price_basis'] = 'monthly', max?: number): ListingCard => ({
    id: address, source: 'realtor', kind: 'commercial', title: address, address, price, beds: 0, price_basis: basis,
    sqft, sqft_min: sqft, sqft_max: max ?? sqft,
  })
  it('drops units whose stated area is well under the ask, keeps unknown-area units last', () => {
    const out = rankCommercial(
      [mk('small', 3000, 5000), mk('unknown', undefined, 0, 'unknown'), mk('big', 32000, 40000), mk('near', 27500, 30000)],
      { min_sqft: 30000, max_price: null },
    )
    expect(out.map((l) => l.address)).toEqual(['big', 'near', 'unknown'])
  })
  it('applies max_price to the monthly figure only when we have one', () => {
    const out = rankCommercial(
      [mk('cheap', 1000, 1500), mk('pricey', 1000, 9000), mk('unknown', 1000, 0, 'unknown')],
      { min_sqft: null, max_price: 2000 },
    )
    expect(out.map((l) => l.address)).toEqual(['cheap', 'unknown'])
  })
  it('a "700+" range never gets dropped by min_sqft', () => {
    const out = rankCommercial([{ ...mk('open', 700, 2000), sqft_max: undefined }], { min_sqft: 5000, max_price: null })
    expect(out).toHaveLength(1)
  })
})

describe('detail search plumbing', () => {
  it('builds two SHORT site-scoped queries: first spec phrase + size, and size only', () => {
    const qs = buildDetailQueries({ area: 'Mississauga', keywords: 'clear height 24 ft, clear span, pickleball courts, parking', min_sqft: 30000 }, 'industrial')
    expect(qs).toEqual([
      'site:realtor.ca/real-estate industrial warehouse for lease Mississauga clear height 24 ft 30,000 sq ft',
      'site:realtor.ca/real-estate industrial warehouse for lease Mississauga 30,000 sq ft',
    ])
    expect(buildDetailQuery({ area: null, keywords: null, min_sqft: null }, 'retail')).toBe('site:realtor.ca/real-estate retail space for lease Toronto')
  })
  it('drops an unknown-area unit whose monthly rent implies far less than the asked size', () => {
    const cheap: ListingCard = { id: 'x', source: 'realtor', kind: 'commercial', title: 'x', address: 'x', price: 2000, beds: 0, price_basis: 'monthly' }
    expect(rankCommercial([cheap], { min_sqft: 30000, max_price: null })).toEqual([])
    expect(rankCommercial([cheap], { min_sqft: 3000, max_price: null })).toHaveLength(1)
  })
  it('keeps only lease detail pages from search results', () => {
    expect(isLeaseCandidate({ url: 'https://www.realtor.ca/real-estate/29048297/134-bethridge-road', title: 'For lease: 134 BETHRIDGE ROAD', description: 'clear height 22' })).toBe(true)
    expect(isLeaseCandidate({ url: 'https://www.realtor.ca/real-estate/29692091/1805-80-absolute', title: '1805 - 80 ABSOLUTE AVENUE S', description: '1 bedrooms, 2 bathrooms, for sale $399000.' })).toBe(false)
    expect(isLeaseCandidate({ url: 'https://www.realtor.ca/on/toronto/commercial-space-for-lease', title: 'Commercial Spaces For Lease in Toronto', description: 'lease' })).toBe(false)
    expect(isLeaseCandidate({ url: 'https://evil.example/real-estate/1/x', title: 'for lease', description: '' })).toBe(false)
  })
})
