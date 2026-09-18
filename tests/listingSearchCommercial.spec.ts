// Commercial / industrial lease search — the tenant agent's hidden skill
// (lib/agent/commercialSearch.ts, 2026-09-18). Fixtures are copied from real
// Jina renders of Realtor.ca list and detail pages (2026-09-18).
import { describe, expect, it } from 'vitest'
import {
  assessFit,
  buildDetailQueries,
  cityAllowed,
  isPlaceholderPrice,
  buildDetailQuery,
  commercialKind,
  extractFacts,
  extractSpecs,
  scoreSnippet,
  searchAreas,
  splitAreas,
  summarizeCommercial,
  useProhibited,
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
  it('reads feet-inches and never borrows digits from the next number', () => {
    expect(extractFacts(`Features include 17'8" clear height, 800 amps/600 volts power, two truck-level doors`).clearFt).toBe(17.7)
    expect(extractFacts('clear height, 800 amps service').clearFt).toBeUndefined()
    expect(extractFacts('Clear height: 22 ft. Zoning E1.').clearFt).toBe(22)
  })
  it('drops listings outside Ontario', () => {
    expect(parseCommercialDetail('## 9622 Hill Drive\nColdstream, British Columbia V1B0B1\n $12/square feet\n## Listing Description\n 30,000 sqft.\n', 'https://www.realtor.ca/real-estate/1/x', 'industrial')).toBeNull()
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
  it('never returns empty while sized pages were parsed — shows the closest, flagged', () => {
    const out = rankCommercial([mk('tiny', 3000, 5000), mk('smallish', 12000, 15000)], { min_sqft: 30000, max_price: null })
    expect(out.map((l) => l.address)).toEqual(['smallish', 'tiny'])
    expect(out[0].specs_warn).toEqual(['面积偏小 12,000'])
    expect(out[0].fit_tier).toBe(2)
  })
  it('applies max_price to the monthly figure only when we have one', () => {
    const out = rankCommercial(
      [mk('cheap', 1000, 1500), mk('pricey', 1000, 9000), mk('unknown', 1000, 0, 'unknown')],
      { min_sqft: null, max_price: 2000 },
    )
    // Over budget is a red flag and a demotion, not a silent drop.
    expect(out.map((l) => l.address)).toEqual(['cheap', 'unknown', 'pricey'])
    expect(out[2].specs_warn).toEqual(['超预算'])
  })
  it('a "700+" range never gets dropped by min_sqft', () => {
    const out = rankCommercial([{ ...mk('open', 700, 5000), sqft_max: undefined }], { min_sqft: 5000, max_price: null })
    expect(out).toHaveLength(1)
  })
})

describe('detail search plumbing', () => {
  it('builds SHORT number-free queries: kind + city phrasings, spec word, never the size', () => {
    const qs = buildDetailQueries({ area: 'Mississauga', keywords: 'clear height 24 ft, clear span, pickleball courts, parking', min_sqft: 30000 }, 'industrial')
    expect(qs.slice(0, 3)).toEqual([
      'site:realtor.ca/real-estate industrial warehouse for lease Mississauga',
      'site:realtor.ca/real-estate "Mississauga" industrial "clear height"',
      'site:realtor.ca/real-estate "Mississauga" industrial "truck level"',
    ])
    expect(qs).toContain('site:realtor.ca/real-estate "For lease" "Mississauga (" industrial')
    expect(qs).toContain('site:realtor.ca/real-estate "Mississauga" industrial "truck level"')
    expect(qs.length).toBeLessThanOrEqual(16)
    expect(qs.join(' ')).not.toMatch(/30,000|24 ft/)
    // GTA-wide: 8 areas → two queries each (16 cap).
    const wide = buildDetailQueries({ area: 'Greater Toronto Area', keywords: null, min_sqft: 30000 }, 'industrial')
    expect(wide.length).toBe(16)
    expect(wide[0]).toBe('site:realtor.ca/real-estate industrial warehouse for lease Toronto')
    // Three named cities → five phrasings each (capped at 16 total).
    const three = buildDetailQueries({ area: null, area_candidates: ['Markham', 'Richmond Hill', 'Toronto'], keywords: 'clear height 24 ft, pickleball', min_sqft: 30000 }, 'industrial')
    expect(three.length).toBe(15)
    expect(three).toContain('site:realtor.ca/real-estate "Markham" industrial "truck level"')
    expect(three).toContain('site:realtor.ca/real-estate "Richmond Hill" industrial "clear height"')
    expect(buildDetailQuery({ area: null, keywords: null, min_sqft: null }, 'retail')).toBe('site:realtor.ca/real-estate retail space for lease Toronto')
  })
  it('scoreSnippet: printed area in band +3, far below −3, spec word +1', () => {
    const need = { min_sqft: 30000, max_sqft: null, keywords: 'clear height 24 ft' }
    expect(scoreSnippet({ description: 'Industrial (Warehouse). Square Footage. 30000 sqft. Lease Type. Net.' }, need)).toBe(3)
    expect(scoreSnippet({ description: '25,135 sq. ft. with 18 ft clear height' }, need)).toBe(4)
    expect(scoreSnippet({ description: 'Bright 2,424 sq ft office unit' }, need)).toBe(-4)
    expect(scoreSnippet({ description: 'Rare freestanding industrial building' }, need)).toBe(1)
    expect(scoreSnippet({ description: 'Bright suite on the 3rd floor' }, need)).toBe(-1)
    expect(scoreSnippet({ description: '2,424 sq ft office' }, { min_sqft: null, max_sqft: null, keywords: null })).toBe(0)
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

describe('splitAreas — one string naming several cities', () => {
  it('splits slash / comma / 、 / and lists into cities', () => {
    expect(splitAreas(['Markham/ Richmond Hill /Toronto'])).toEqual(['Markham', 'Richmond Hill', 'Toronto'])
    expect(splitAreas(['Vaughan and Mississauga', 'Ajax、Pickering'])).toEqual(['Vaughan', 'Mississauga', 'Ajax', 'Pickering'])
    expect(searchAreas({ area: 'Markham/ Richmond Hill /Toronto', area_candidates: null })).toEqual(['Markham', 'Richmond Hill', 'Toronto'])
    expect(cityAllowed('Mississauga', { area: 'Markham/ Richmond Hill /Toronto', area_candidates: null })).toBe(false)
    expect(cityAllowed('Richmond Hill', { area: 'Markham/ Richmond Hill /Toronto', area_candidates: null })).toBe(true)
  })
})

describe('searchAreas — fan-out set', () => {
  it('uses the tenant\'s own areas, deduped, GTA-wide → default set', () => {
    expect(searchAreas({ area: 'Markham', area_candidates: ['Richmond Hill', 'markham'] })).toEqual(['Markham', 'Richmond Hill'])
    expect(searchAreas({ area: null, area_candidates: null })[0]).toBe('Toronto')
    expect(searchAreas({ area: 'GTA 都行', area_candidates: null }).length).toBe(8)
    expect(searchAreas({ area: 'Greater Toronto Area', area_candidates: ['Ajax'] })[0]).toBe('Ajax')
  })
})

describe('extractFacts — everything a broker\'s shortlist column needs', () => {
  it('reads possession, sublease term, parking, sprinklers, office %, freestanding, TMI in text', () => {
    const f = extractFacts('SUBLEASE opportunity for approximately 21,898 sq. ft. The space features an 18 ft clear height, with 1 drive-in shipping doors. 100% industrial area with sprinklers. Outside/surface parking available. Immediate possession. E1 zoning. Sublease term currently indicated through January 31, 2029.')
    expect(f.clearFt).toBe(18)
    expect(f.driveInDoors).toBe(1)
    expect(f.possession).toBe('immediate')
    expect(f.sublease).toBe(true)
    expect(f.subleaseUntil).toBe('January 31, 2029')
    expect(f.sprinklers).toBe(true)
    const g = extractFacts('Freestanding facility, 35 marked parking spaces, 33% office, ESFR sprinklers, TMI $4.50 psf. Possession Q4 2026. No Recreational Uses.')
    expect(g.parking).toBe(35)
    expect(g.officePct).toBe(33)
    expect(g.esfr).toBe(true)
    expect(g.freestanding).toBe(true)
    expect(g.tmiPsfFromText).toBe(4.5)
    expect(g.possession).toBe('Q4 2026')
    expect(g.excludedUses).toEqual(['Recreational'])
  })
  it('reads "Zoned E 0.8" style zoning from prose', () => {
    expect(extractFacts('Zoned E 0.8 (Employment Industrial), allowing for a broad range of uses').zoning).toBe('E 0.8')
  })
})

describe('useProhibited — tenant use vs listing exclusions', () => {
  it('kills a pickleball venue on "No Recreational Uses" but not a warehouse tenant', () => {
    expect(useProhibited(['Recreational'], 'pickleball courts / indoor sports')).toBe('娱乐 / 体育用途')
    expect(useProhibited(['Recreational'], 'warehouse distribution')).toBeNull()
    expect(useProhibited(['food'], 'restaurant')).toBe('餐饮用途')
    expect(useProhibited([], 'pickleball')).toBeNull()
    expect(useProhibited(['Recreational'], null)).toBeNull()
  })
})

describe('assessFit + rankCommercial — requirement tiers', () => {
  const mk = (address: string, over: Partial<ListingCard>): ListingCard => ({
    id: address, source: 'realtor', kind: 'commercial', title: address, address, price: 40000, beds: 0, price_basis: 'psf_estimate',
    rate_psf: 16, sqft: 30000, sqft_min: 30000, sqft_max: 30000, ...over,
  })
  const need = { min_sqft: 30000, max_sqft: null, max_price: null, min_clear_ft: 24, use: 'pickleball courts', keywords: null }
  it('tiers: fits < unstated < size off < clear short < use excluded; oversize ×4 dropped', () => {
    const fits = mk('fits', { clear_ft: 26 })
    const unstated = mk('unstated', {})
    const short = mk('short', { clear_ft: 14 })
    const big = mk('big', { sqft: 100000, sqft_min: 100000, sqft_max: 100000, clear_ft: 30 })
    const huge = mk('huge', { sqft: 166378, sqft_min: 166378, sqft_max: 166378, clear_ft: 30 })
    const banned = mk('banned', { clear_ft: 30, excluded_uses: ['Recreational'] })
    const out = rankCommercial([banned, huge, big, short, unstated, fits], need)
    expect(out.map((l) => l.address)).toEqual(['fits', 'unstated', 'big', 'short', 'banned'])
    const smallish = mk('smallish', { sqft: 25129, sqft_min: 25129, sqft_max: 25129, clear_ft: 26 })
    const noArea = mk('noarea', { sqft: undefined, sqft_min: undefined, sqft_max: undefined, price_basis: 'unknown', price: 0 })
    // 84% of the ask with the clear height met beats a listing with no area at all.
    expect(rankCommercial([noArea, smallish], need).map((l) => l.address)).toEqual(['smallish', 'noarea'])
    expect(assessFit(short, need).warn).toEqual(["净高 14' 不足"])
    expect(assessFit(big, need).warn).toEqual(['面积远超需求'])
    expect(assessFit(banned, need).warn).toEqual(['房东明写禁止娱乐 / 体育用途'])
    expect(out.find((l) => l.address === 'banned')?.fit_tier).toBe(5)
    expect(out.find((l) => l.address === 'fits')?.specs_warn).toBeUndefined()
  })
  it('drops no-area rows once three sized candidates exist, keeps them when thin', () => {
    const sized = Array.from({ length: 3 }, (_, i) => mk(`s${i}`, { clear_ft: 26, sqft: 30000 + i, sqft_min: 30000 + i, sqft_max: 30000 + i }))
    const noArea = mk('noarea', { sqft: undefined, sqft_min: undefined, sqft_max: undefined, price_basis: 'unknown', price: 0 })
    expect(rankCommercial([...sized, noArea], need).map((l) => l.address)).not.toContain('noarea')
    expect(rankCommercial([sized[0], noArea], need).map((l) => l.address)).toContain('noarea')
  })
  it('a huge building survives when the listing says it can be demised', () => {
    const huge = mk('huge', { sqft: 166378, sqft_max: 166378, description: 'Full building or can be demised into smaller units' })
    expect(assessFit(huge, need).drop).toBe(false)
  })
  it('respects an explicit max_sqft and a monthly budget against the all-in figure', () => {
    const l = mk('l', { sqft: 45000, sqft_max: 45000, monthly_all_in: 90000 })
    expect(assessFit(l, { ...need, max_sqft: 40000 }).warn).toContain('面积远超需求')
    expect(assessFit(l, { ...need, max_price: 60000 }).warn).toContain('超预算')
  })
})

describe('parseCommercialDetail — TMI from the taxes field, all-in cost, MLS, brokerage', () => {
  const md = `# 1615 WARDEN AVENUE  
Toronto (Wexford-Maryvale), Ontario M1R1B2
MLS® Number: E13752790
 $16.50/square feet
## Listing Description
 Rare opportunity to lease a freestanding industrial facility with two drive-in shipping doors. Zoned E 0.8 (Employment Industrial). Immediate possession.
## Property Summary
Property Type
 Industrial 
Annual Property Taxes
 $4.90 (CAD)
## Parking
Total Parking Spaces
 30 
## Measurements
Square Footage
30400 sqft
Lease Type
 Net 
[REAL ONE REALTY INC. Brokerage 15 WERTHEIM COURT UNIT 302 RICHMOND HILL, Ontario L4B3H7](https://www.realtor.ca/office/firm/103644/x)
`
  const card = parseCommercialDetail(md, 'https://www.realtor.ca/real-estate/30244060/1615-warden-avenue-toronto-wexford-maryvale', 'industrial')!
  it('matches the broker report line for line', () => {
    expect(card.rate_psf).toBe(16.5)
    expect(card.tmi_psf).toBe(4.9)
    expect(card.sqft).toBe(30400)
    expect(card.annual_cost).toBe(Math.round((16.5 + 4.9) * 30400)) // $650,560
    expect(card.annual_cost).toBe(650560)
    expect(card.monthly_all_in).toBe(Math.round(650560 / 12))
    expect(card.mls).toBe('E13752790')
    expect(card.brokerage).toBe('REAL ONE REALTY INC.')
    expect(card.zoning).toBe('E 0.8')
    expect(card.possession).toBe('immediate')
    expect(card.specs).toEqual(expect.arrayContaining(['2 drive-in', 'Zoning E 0.8', '30 车位', '独立物业', '即可入驻', 'Net lease']))
    expect(card.note).toMatch(/TMI \$4.9/)
  })
  it('treats a gross lease as all-in and a real tax bill as not-TMI', () => {
    const gross = parseCommercialDetail(md.replace('Net', 'Gross').replace('$4.90', '$0'), 'https://www.realtor.ca/real-estate/1/x', 'industrial')!
    expect(gross.tmi_psf).toBe(0)
    expect(gross.annual_cost).toBe(Math.round(16.5 * 30400))
    const taxBill = parseCommercialDetail(md.replace('$4.90', '$48,200'), 'https://www.realtor.ca/real-estate/2/x', 'industrial')!
    expect(taxBill.tmi_psf).toBeUndefined()
    expect(taxBill.monthly_all_in).toBeUndefined()
  })
})

describe('summarizeCommercial — the digest appended to the reply', () => {
  it('states cities, size band, clear-height coverage, all-in cost range and exclusions', () => {
    const a: ListingCard = { id: 'a', source: 'realtor', kind: 'commercial', title: 'a', address: 'A', city: 'Vaughan', price: 0, beds: 0, sqft: 22035, clear_ft: 32, annual_cost: 447311, tmi_psf: 3.8, fit_tier: 0 }
    const b: ListingCard = { id: 'b', source: 'realtor', kind: 'commercial', title: 'b', address: 'B', city: 'Richmond Hill', price: 0, beds: 0, sqft: 23513, annual_cost: 531797, tmi_psf: 5.56, fit_tier: 5 }
    const c: ListingCard = { id: 'c', source: 'realtor', kind: 'commercial', title: 'c', address: 'C', city: 'Markham', price: 0, beds: 0, sqft: 25135, clear_ft: 18, fit_tier: 4 }
    const d: ListingCard = { id: 'd', source: 'realtor', kind: 'commercial', title: 'd', address: 'D', city: 'Toronto', price: 0, beds: 0, sqft: 166378, clear_ft: 11, annual_cost: 3008114, tmi_psf: 3.13, fit_tier: 4 }
    const s = summarizeCommercial([a, b, c, d], { min_sqft: 30000, min_clear_ft: 24, use: 'pickleball' }, true)
    expect(s).toContain('本轮核对了 4 套 Realtor.ca 挂牌，4 套接近你的条件（Vaughan / Richmond Hill / Markham / Toronto）')
    expect(summarizeCommercial([a, b, c, d], { min_sqft: 30000 }, true, 35)).toContain('本轮核对了 35 套')
    expect(s).toContain('面积 22,035–166,378 sqft')
    expect(s).toContain("净高已标注 3 套，其中 1 套 ≥ 24'")
    // Cost range covers viable rows only — the flagged ones are excluded.
    expect(s).toContain('年成本（净租 + 挂牌自报 TMI）$447,311–$447,311')
    expect(s).toContain('1 套房东明写禁止你的用途')
    expect(summarizeCommercial([], { min_sqft: 30000 }, true)).toBe('')
  })
})

describe('geography gate + placeholder prices + dead pages', () => {
  it('keeps GTA cities on a GTA-wide ask and only the named cities otherwise', () => {
    expect(cityAllowed('Brantford', { area: 'Greater Toronto Area', area_candidates: null })).toBe(false)
    expect(cityAllowed('Milton', { area: 'Greater Toronto Area', area_candidates: null })).toBe(true)
    expect(cityAllowed('East Gwillimbury', { area: null, area_candidates: null })).toBe(true)
    expect(cityAllowed('Vaughan', { area: 'Markham', area_candidates: ['Richmond Hill'] })).toBe(false)
    expect(cityAllowed('Richmond Hill', { area: 'Markham', area_candidates: ['Richmond Hill'] })).toBe(true)
    expect(cityAllowed('Toronto', { area: 'Scarborough', area_candidates: null })).toBe(true)
    expect(cityAllowed(undefined, { area: 'Markham', area_candidates: null })).toBe(true)
  })
  it('treats $1/sqft and $1/Monthly as "call for pricing"', () => {
    expect(isPlaceholderPrice(1, true)).toBe(true)
    expect(isPlaceholderPrice(1, false)).toBe(true)
    expect(isPlaceholderPrice(16.5, true)).toBe(false)
    expect(isPlaceholderPrice(2000, false)).toBe(false)
    const card = parseCommercialDetail('# 6750 FIFTH LINE\nMilton (Derry Green), Ontario L9T2X8\n $1/Monthly\n## Listing Description\n 30,000 sqft warehouse, 36 ft clear height.\n## Property Summary\nProperty Type\n Industrial\nSquare Footage\n30000 sqft\n', 'https://www.realtor.ca/real-estate/1/x', 'industrial')!
    expect(card.price_basis).toBe('unknown')
    expect(card.annual_cost).toBeUndefined()
    expect(card.note).toMatch(/面议/)
  })
  it('accepts an H2 address (older Realtor.ca layouts)', () => {
    const card = parseCommercialDetail('## 15 - 260 REGINA ROAD W\nVaughan (West Woodbridge Industrial Area), Ontario L4L8L6\n $14/square feet\n## Listing Description\n 31,000 sq ft, 24 ft clear.\n## Property Summary\nProperty Type\n Industrial\nSquare Footage\n31000 sqft\n', 'https://www.realtor.ca/real-estate/30188569/x', 'industrial')!
    expect(card.address).toBe('15 - 260 REGINA ROAD W')
    expect(card.city).toBe('Vaughan')
    expect(card.clear_ft).toBe(24)
  })
  it('returns null for an expired-listing page', () => {
    expect(parseCommercialDetail('# The listing you are looking for no longer exists.\nsome text', 'https://www.realtor.ca/real-estate/1/x', 'industrial')).toBeNull()
  })
  it('reads word-number shipping doors ("two drive-in")', () => {
    expect(extractFacts('with two drive-in shipping doors and one truck-level door').driveInDoors).toBe(2)
    expect(extractFacts('with two drive-in shipping doors and one truck-level door').truckDoors).toBe(1)
  })
})
