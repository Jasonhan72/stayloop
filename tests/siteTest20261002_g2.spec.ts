// Site test 2026-10-02 · group G2 (listings): guards for L7-anon D-01 / D-04 /
// D-06 / D-08 and L6-public D5 / D7.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { addressHasUnit, listingTitle } from '@/lib/listingDisplay'
import { parseRealtor } from '@/lib/agent/listingSearch'

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const detail = read('app/listings/[slug]/page.tsx')
const apply = read('app/apply/[slug]/page.tsx')
const browse = read('app/listings/page.tsx')

describe('D-06 · unit not repeated when the address already carries it', () => {
  it('drops the #unit suffix for "608 - 1080 BAY STREET" with unit 608', () => {
    expect(listingTitle('608 - 1080 BAY STREET', '608')).toBe('608 - 1080 BAY STREET')
    expect(listingTitle('1802 - 210 SIMCOE STREET', '#1802')).toBe('1802 - 210 SIMCOE STREET')
    expect(listingTitle('PH1 - 10 York St', 'ph1')).toBe('PH1 - 10 York St')
    expect(addressHasUnit('609 - 195 MCCAUL STREET', '609')).toBe(true)
  })
  it('keeps the suffix when the address does not start with that unit', () => {
    expect(listingTitle('1001 Bay St', '1618')).toBe('1001 Bay St #1618')
    expect(listingTitle('608 - 1080 BAY STREET', '1207')).toBe('608 - 1080 BAY STREET #1207')
    expect(listingTitle('100 King St W', null)).toBe('100 King St W')
    expect(addressHasUnit('100 King St W', '100')).toBe(false)
  })
  it('the detail page H1 and similar-homes cards use the helper, never raw address + " #unit"', () => {
    expect(detail).toMatch(/<h1[^>]*>\{listingTitle\(listing\.address, listing\.unit\)\}<\/h1>/)
    expect(detail).toContain('{listingTitle(sl.address, sl.unit)}</Link>')
    expect(detail).not.toMatch(/\.unit \? ` #\$\{/)
  })
})

describe('D-01 · Realtor.ca imports cannot be applied to on Stayloop', () => {
  it('the apply link renders only for non-realtor listings', () => {
    const i = detail.indexOf('href={`/apply/${listing.slug}`}')
    expect(i).toBeGreaterThan(0)
    const before = detail.slice(Math.max(0, i - 400), i)
    expect(before).toMatch(/listing\.source !== 'realtor' && \(\s*<Link\s*$/)
  })
  it('/apply/<slug> reads the source on load and at submit, and refuses realtor listings', () => {
    expect(apply).toMatch(/\.select\('id, landlord_id, source,/)
    expect(apply).toMatch(/\.select\('id, source'\)/)
    expect((apply.match(/source === 'realtor'/g) || []).length).toBeGreaterThanOrEqual(2)
    expect(apply).toContain("listingCheck === 'realtor'")
    expect(apply).toContain('data-testid="apply-realtor-refused"')
    expect(apply).toMatch(/<AgentPicker /)
  })
})

describe('D-04 · Realtor.ca chat cards carry an English note and a language-neutral title', () => {
  const md = [
    '[x](https://www.realtor.ca/real-estate/123/foo) $2,450/Month 100 King St W, Toronto (Waterfront) ![img](https://cdn.realtor.ca/listings/a.jpg) 1 Bedrooms 1 Bathrooms',
    '[y](https://www.realtor.ca/real-estate/456/bar) $1,900/Month 5 Queen St, Toronto ![img](https://cdn.realtor.ca/listings/b.jpg) 0 Bathrooms',
  ].join('\n')
  const { cards } = parseRealtor(md, {} as never)
  it('every residential Realtor card has note_en in English', () => {
    expect(cards.length).toBe(2)
    for (const c of cards) {
      expect(c.note_en).toBe('External listing · Realtor.ca live · not verified by Stayloop')
      expect(c.note).toContain('未经 Stayloop 验证')
    }
  })
  it('titles contain no Chinese', () => {
    for (const c of cards) expect(c.title).not.toMatch(/[一-鿿]/)
    expect(cards.map((c) => c.title)).toEqual(['1B', 'Studio'])
  })
})

describe('D-08 / D7 · /listings has an h1', () => {
  it('renders exactly one h1', () => {
    expect((browse.match(/<h1\b/g) || []).length).toBe(1)
  })
})

describe('D5 · realtor viewing button wraps balanced', () => {
  it('the Find-a-verified-agent button uses text-wrap: balance', () => {
    const i = detail.indexOf("'Find a verified agent for a viewing'")
    expect(detail.slice(i - 400, i)).toContain('[text-wrap:balance]')
  })
})

describe('D-06 · the browser tab title uses the same helper (review 2026-10-02)', () => {
  it('app/listings/[slug]/layout.tsx builds the metadata title with listingTitle()', () => {
    const s = readFileSync('app/listings/[slug]/layout.tsx', 'utf8')
    expect(s).toContain("import { listingTitle } from '@/lib/listingDisplay'")
    expect(s).toContain('const addr = listingTitle(l.address, l.unit)')
    expect(s).not.toContain("[l.address, l.unit ? `#${l.unit}` : '']")
  })
})

