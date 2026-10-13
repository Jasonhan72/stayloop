// Quick publish (2026-10-13): address + rent + photos; the vision model fills
// the rest, the landlord confirms the policy questions, same publish gate.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { parseQuickDraftGuess, parsePhotoDataUrl, quickDraftSystemPrompt, quickDraftUserText, AMENITY_VOCAB, QUICK_VISION_PHOTOS } from '@/lib/listings/quickDraft'

const read = (p: string) => readFileSync(p, 'utf8')

describe('parseQuickDraftGuess — only the vocabulary survives', () => {
  it('keeps valid fields, clamps numbers, drops unknown amenities and types', () => {
    const g = parseQuickDraftGuess(JSON.stringify({
      property_type: 'Condo', bedrooms: '2', bathrooms: 1.4, has_den: true, furnished: 'yes',
      amenities: ['balcony', 'jacuzzi', 'BALCONY', 'gym'], sqft_estimate: 712.6, cover_index: 3,
      notes_zh: '  采光好，木地板。 ', notes_en: 'Bright, hardwood.', confidence: { bedrooms: 1.7, sqft_estimate: -1 },
    }), 4)
    expect(g.property_type).toBe('condo')
    expect(g.bedrooms).toBe(2)
    expect(g.bathrooms).toBe(1.5)
    expect(g.furnished).toBe('yes')
    expect(g.amenities).toEqual(['balcony', 'gym'])
    expect(g.sqft_estimate).toBe(713)
    expect(g.cover_index).toBe(3)
    expect(g.notes_zh).toBe('采光好，木地板。')
    expect(g.confidence.bedrooms).toBe(1)
    expect(g.confidence.sqft_estimate).toBe(0)
  })
  it('out-of-range values become null and garbage becomes an empty guess', () => {
    const g = parseQuickDraftGuess('```json\n{"bedrooms": 40, "bathrooms": 0, "sqft_estimate": 20, "cover_index": 9, "furnished": "maybe", "property_type": "castle"}\n```', 2)
    expect(g.bedrooms).toBeNull(); expect(g.bathrooms).toBeNull(); expect(g.sqft_estimate).toBeNull(); expect(g.cover_index).toBeNull()
    expect(g.furnished).toBeNull(); expect(g.property_type).toBeNull()
    const e = parseQuickDraftGuess('not json at all', 1)
    expect(e.amenities).toEqual([]); expect(e.bedrooms).toBeNull(); expect(e.notes_en).toBe('')
  })
  it('the prompt never asks the model about policies and lists only the vocabulary', () => {
    const p = quickDraftSystemPrompt()
    expect(p).toMatch(/Never guess policies/)
    for (const a of AMENITY_VOCAB) expect(p).toContain(a.id)
    expect(p).not.toMatch(/pets_allowed|smoking_policy|utilities_included|deposit"/)
    expect(quickDraftUserText({ address: '28 Avondale Ave', unit: '605', city: 'Toronto', province: 'ON', monthly_rent: 2800, photoCount: 3 })).toContain('unit 605')
  })
  it('photo payloads must be jpeg/png/webp data URLs under the cap', () => {
    expect(parsePhotoDataUrl('data:image/jpeg;base64,abcd')).toEqual({ media_type: 'image/jpeg', data: 'abcd' })
    expect(parsePhotoDataUrl('data:image/gif;base64,abcd')).toBeNull()
    expect(parsePhotoDataUrl('https://example.com/x.jpg')).toBeNull()
    expect(parsePhotoDataUrl('data:image/png;base64,' + 'a'.repeat(2_100_001))).toBeNull()
  })
})

describe('wiring', () => {
  it('the route requires a signed-in user, rate-limits (fail closed), caps photos and uses the classify slot', () => {
    const r = read('app/api/listings/quick-draft/route.ts')
    expect(r).toContain("return NextResponse.json({ error: 'unauthorized' }, { status: 401 })")
    expect(r).toContain("underHourlyLimit(`quick-draft:${uid}`, PER_USER_PER_HOUR, false)")
    expect(r).toContain("underHourlyLimit('quick-draft:global', SITE_PER_HOUR, false)")
    expect(r).toContain('.slice(0, QUICK_VISION_PHOTOS)')
    expect(r).toContain("getModel('classify')")
    expect(r).toContain("jsonMode: true")
    expect(QUICK_VISION_PHOTOS).toBe(8)
  })
  it('the page publishes through the shared gate, drafts copy deterministically and asks the TRESA disclosure', () => {
    const p = read('app/dashboard/listings/quick/page.tsx')
    expect(p).toContain('publishListing(supabase, row(slug)')
    expect(p).toContain('buildListingRow(')
    expect(p).toContain('draftListingCopy({')
    expect(p).toContain('<RegistrantDisclosureModal')
    expect(p).toContain('checkListingComplianceFor(')
    // the size estimate is never auto-filled — the landlord accepts it explicitly
    expect(p).toContain('data-testid="quick-use-sqft"')
    expect(p).not.toMatch(/sqft: j\.guess!\.sqft_estimate/)
    // stored photos are downscaled; the model gets smaller copies
    expect(p).toContain('downscalePhoto(f, 1600, 0.85)')
    expect(p).toContain('downscalePhoto(f, 1024, 0.8)')
  })
  it('the dashboard and the wizard link to it', () => {
    expect(read('app/dashboard/page.tsx')).toContain('href="/dashboard/listings/quick"')
    expect(read('app/dashboard/listings/new/page.tsx')).toContain('data-testid="wizard-quick-hint"')
  })
})
