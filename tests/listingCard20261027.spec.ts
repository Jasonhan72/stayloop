// 房源卡片优化 (2026-10-27 · user sent our card next to a StreetEasy card): the
// kicker (type · neighbourhood), the address as the title with the unit said
// once, one-language size row with icons, concrete facts instead of generic
// chips, dots for small galleries. Nothing on the card is invented.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { cardAddress, cardFacts, cardKicker, sizeFacts } from '@/lib/listings/cardFacts'

const read = (p: string) => readFileSync(p, 'utf8')
const code = (p: string) => read(p).split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')

describe('card wording', () => {
  it('the unit is said once: appended only when the address does not already carry it', () => {
    expect(cardAddress('605 - 28 Avondale Ave, North York, Toronto, ON', '605')).toBe('605 - 28 Avondale Ave, North York, Toronto, ON')
    expect(cardAddress('28 Avondale Ave', '605')).toBe('28 Avondale Ave #605')
    expect(cardAddress('28 Avondale Ave Unit 605', 'Unit 605')).toBe('28 Avondale Ave Unit 605')
    expect(cardAddress('#1203-28 Avondale Ave', '1203')).toBe('#1203-28 Avondale Ave')
    expect(cardAddress('100 Test Ave', null)).toBe('100 Test Ave')
    // "16" inside "1605" is not the unit
    expect(cardAddress('1605 Yonge St', '16')).toBe('1605 Yonge St #16')
  })
  it('the kicker reads type · place, in one language', () => {
    expect(cardKicker({ property_type: 'condo', neighborhood: 'Yonge & Sheppard', city: 'North York' }, 'zh')).toBe('公寓 · Yonge & Sheppard，North York')
    expect(cardKicker({ property_type: 'condo', neighborhood: 'Yonge & Sheppard', city: 'North York' }, 'en')).toBe('Condo in Yonge & Sheppard, North York')
    expect(cardKicker({ property_type: null, neighborhood: null, city: 'Toronto' }, 'zh')).toBe('Toronto')
    expect(cardKicker({ property_type: 'house', neighborhood: null, city: null }, 'en')).toBe('House')
  })
  it('the size row is one language and names a den; studio is 开间', () => {
    expect(sizeFacts({ bedrooms: 2, bathrooms: 2, sqft: 850, has_den: false }, 'zh').map((f) => f.text)).toEqual(['2 卧', '2 浴', '850 ft²'])
    expect(sizeFacts({ bedrooms: 1, bathrooms: 1, sqft: null, has_den: true }, 'en').map((f) => f.text)).toEqual(['1 bed + den', '1 bath'])
    expect(sizeFacts({ bedrooms: 0, bathrooms: 1 }, 'zh')[0].text).toBe('开间')
    for (const f of sizeFacts({ bedrooms: 2, bathrooms: 2, sqft: 850 }, 'en')) expect(f.text).not.toMatch(/[一-鿿]/)
  })
  it('facts are only what the row carries: availability and pets, never "kitchen"', () => {
    const today = new Date('2026-10-27T12:00:00Z')
    expect(cardFacts({ available_date: '2026-11-01', pet_policy: 'yes' }, 'zh', today)).toEqual(['11/01 起可入住', '允许宠物'])
    expect(cardFacts({ available_date: '2026-10-01', pet_policy: 'no' }, 'en', today)).toEqual(['Available now', 'No pets'])
    expect(cardFacts({ available_date: null, pet_policy: 'whatever' }, 'zh', today)).toEqual([])
  })
})

describe('the /listings card', () => {
  const src = code('app/listings/page.tsx')
  it('uses the shared wording, keeps the test badge and the source line, and the amenities as a muted line', () => {
    for (const t of ['data-testid="card-kicker"', 'data-testid="card-address"', 'data-testid="card-size"', 'data-testid="card-facts"', 'data-testid="card-brokerage"', 'data-testid="test-listing-badge"', 'data-testid="card-amenities"']) expect(src).toContain(t)
    expect(src).toContain('cardAddress(l.address, l.unit)')
    expect(src).toContain("sizeFacts(l, zh ? 'zh' : 'en')")
    expect(src).not.toContain("`${l.bedrooms}B${l.has_den ? ' + den' : ''}`")
    expect(src).not.toContain('{l.unit && ` · Unit ${l.unit}`}')
  })
  it('small galleries get dots, larger ones the counter; the search API now returns property_type for the kicker', () => {
    expect(src).toContain('data-testid="card-photo-dots"')
    expect(src).toContain('1 / {l.photo_count}')
    expect(read('app/api/listings/search/route.ts')).toMatch(/CARD_COLUMNS = '[^']*property_type/)
  })
})
