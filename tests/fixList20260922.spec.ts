import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { sanitizeDraftListing } from '../lib/agent/guardrail'
import { buildListingRow } from '../lib/listingPublish'

// 2026-09-22 — external "房东端 UX 修复清单" (SL-LL-001 … 014). Studied
// against the code first: the wizard's "AI" boxes were hardcoded design
// mock copy (King West, "已上传 8 张", "允许猫") beside a real publish
// button. Guards for what was changed.

describe('SL-LL-001 · unconfirmed facts never reach listing copy', () => {
  it('cuts a pet claim from the description when no pet policy was given, and says so', () => {
    const r = sanitizeDraftListing({ address: '28 Avondale Ave', monthly_rent: 2450, description: 'Bright 1+den at Yonge & Sheppard. Cats allowed. Steps to the subway.' }, 'zh')
    expect(r.draft.description).toBe('Bright 1+den at Yonge & Sheppard. Steps to the subway.')
    expect(r.flags).toContain('draft_listing_unconfirmed_pets_description')
    expect(r.note).toContain('宠物')
  })
  it('keeps the claim when the structured field confirms it', () => {
    const r = sanitizeDraftListing({ address: 'x', monthly_rent: 1, pets_allowed: 'yes', description: 'Cats allowed. Steps to the subway.' })
    expect(r.draft.description).toBe('Cats allowed. Steps to the subway.')
    expect(r.flags).toEqual([])
  })
  it('utilities, smoking and furnished are held to the same rule; a title claim drops the title', () => {
    const r = sanitizeDraftListing({ address: 'x', monthly_rent: 1, title: 'Fully furnished 1B, all utilities included', description: '包水电暖。禁止吸烟。近地铁。' }, 'zh')
    expect(r.draft.title).toBeUndefined()
    expect(r.draft.description).toBe('近地铁。')
    expect(r.flags).toEqual(expect.arrayContaining(['draft_listing_unconfirmed_utilities_description', 'draft_listing_unconfirmed_smoking_description', 'draft_listing_unconfirmed_utilities_title']))
    expect(sanitizeDraftListing({ address: 'x', monthly_rent: 1, description: 'Fully furnished. Near the park.' }).draft.description).toBe('Near the park.')
    const ok = sanitizeDraftListing({ address: 'x', monthly_rent: 1, utilities_included: ['hydro'], smoking_policy: 'no', furnished: true, title: 'Fully furnished 1B, all utilities included', description: '包水电暖。禁止吸烟。近地铁。' }, 'zh')
    expect(ok.flags).toEqual([])
  })
  it('the landlord prompt states the rule', () => {
    const src = readFileSync('lib/agent/prompts.ts', 'utf8')
    expect(src).toMatch(/title \/ description 里只能写用户给过的事实/)
  })
})

describe('SL-LL-002 / 011 · the wizard starts empty and carries no mock narration', () => {
  const src = readFileSync('app/dashboard/listings/new/page.tsx', 'utf8')
  it('no amenity, utility, photo or address is pre-selected', () => {
    expect(src).toMatch(/amenities: \[\] as string\[\]/)
    expect(src).toMatch(/utilities_included: \[\] as string\[\]/)
    expect(src).toMatch(/useState<string\[\]>\(\[\]\)/)
    expect(src).toMatch(/address: '',/)
  })
  it('the design mock copy is gone', () => {
    const code = src.split('\n').filter(l => !l.trim().startsWith('//')).join('\n')
    for (const mock of ['已上传 8 张', 'King West', '$2,820', '$2,850', '允许猫', 'cats allowed', 'Stackt Market', 'RTA / RECO 通过', '拖一份 PDF']) expect(code).not.toContain(mock)
  })
  it('the review step labels missing values as not provided instead of a dash', () => {
    expect(src).toContain("const NOT_PROVIDED = { zh: '未提供', en: 'not provided' }")
    expect(src).not.toMatch(/join\(' · '\) \|\| '—'/)
  })
})

describe('SL-LL-004 · lease terms flow from the wizard to the row', () => {
  it('the slim row carries lease term, pets, smoking, furnished, utilities and photos', () => {
    const row = buildListingRow({ address: '28 Avondale Ave', monthly_rent: 2450, bedrooms: 1, bathrooms: 1, property_type: 'condo', amenities: [], lease_term: '12 个月', pets_allowed: 'restricted', smoking_policy: 'no', furnished: false, utilities_included: ['water', 'heat'] } as never, { landlordId: 'l', slug: 's', slim: true, photos: ['data:image/jpeg;base64,x'] })
    expect(row).toMatchObject({ lease_term: '12 个月', pets_allowed: 'restricted', smoking_policy: 'no', furnished: false, utilities_included: ['water', 'heat'], images: ['data:image/jpeg;base64,x'] })
  })
  it('the detail page says "not provided" for a missing area', () => {
    expect(readFileSync('app/listings/[slug]/page.tsx', 'utf8')).toContain("(zh ? '未提供' : 'Not provided')")
  })
})

describe('SL-LL-008 / 014 · settings redirect and pricing wording', () => {
  it('/landlord/settings redirects to /settings', () => {
    expect(readFileSync('middleware.ts', 'utf8')).toMatch(/\(landlord\|tenant\|agent\)\\\/settings/)
  })
  it('the test-period banner says what "coming soon" means', () => {
    expect(readFileSync('app/pricing/page.tsx', 'utf8')).toContain('标「即将推出」的模块尚未上线，不在免费范围内')
  })
})
