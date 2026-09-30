// AI rewrite of an existing listing (2026-09-30 · user: "生成的卡片里没有了图片；
// 生成了修改的卡片后，可以直接点击发布，或者点击编辑手动编辑一些")
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { matchOwnedListing, mergeWithExisting, type OwnedListingRow } from '@/lib/agent/draftExisting'
import { buildListingPatch } from '@/lib/listingPublish'
import type { DraftListing } from '@/lib/agent/types'

const read = (p: string) => readFileSync(p, 'utf8')

const colvestone: OwnedListingRow = {
  id: '11111111-1111-1111-1111-111111111111', slug: '8-colvestone-road-abc', address: '8 Colvestone Road', unit: null,
  city: 'Toronto', neighborhood: 'St. Andrew-Windfields', monthly_rent: 13800, bedrooms: 8, bathrooms: 7, sqft: 6000, has_den: true,
  title: 'Old title', description: 'Old description', amenities: ['Wood-paneled Library'], images: ['https://cdn.realtor.ca/a.jpg', 'https://cdn.realtor.ca/b.jpg'],
  lease_term: '12 months', source: 'realtor',
}
const tower: OwnedListingRow = { id: '22222222-2222-2222-2222-222222222222', slug: 'x', address: '28 Avondale Ave', unit: '1203', monthly_rent: 2450, images: ['https://x/1.jpg'] }
const tower2: OwnedListingRow = { id: '33333333-3333-3333-3333-333333333333', slug: 'y', address: '28 Avondale Ave', unit: '905', monthly_rent: 2300, images: ['https://x/2.jpg'] }

const folded: OwnedListingRow = { id: '44444444-4444-4444-4444-444444444444', slug: 'z', address: '1105 - 203 COLLEGE STREET', unit: null, monthly_rent: 2250, images: ['https://x/3.jpg'] }

describe('matching a draft to the landlord’s own listing', () => {
  it('same street number + street name (abbreviations differ); units must agree on both sides', () => {
    expect(matchOwnedListing({ address: '8 Colvestone Rd, Toronto, ON' }, [colvestone])?.id).toBe(colvestone.id)
    expect(matchOwnedListing({ address: '28 Avondale Avenue', unit: '#1203' }, [tower, tower2])?.id).toBe(tower.id)
    expect(matchOwnedListing({ address: '1203 - 28 Avondale Ave' }, [tower, tower2])?.id).toBe(tower.id)
    expect(matchOwnedListing({ address: '28 Avondale Ave' }, [tower, tower2])).toBeNull()
    expect(matchOwnedListing({ address: '80 Colvestone Road' }, [colvestone])).toBeNull()
    expect(matchOwnedListing({ address: '8 Colborne Road' }, [colvestone])).toBeNull()
  })
  it('a new listing without a unit never becomes an update of the landlord’s only unit in that building (review)', () => {
    expect(matchOwnedListing({ address: '28 Avondale Ave' }, [tower])).toBeNull()
  })
  it('stored rows that fold the unit into the address match too (8 of 16 production rows) (review)', () => {
    expect(matchOwnedListing({ address: '203 College St', unit: '1105' }, [folded])?.id).toBe(folded.id)
    expect(matchOwnedListing({ address: '1105 - 203 College Street' }, [folded])?.id).toBe(folded.id)
    expect(matchOwnedListing({ address: '203 College St' }, [folded])).toBeNull()
  })
})

describe('merging the AI’s rewrite onto the stored listing', () => {
  const model: DraftListing = {
    address: '8 Colvestone Road, Toronto, ON', monthly_rent: 13800, bedrooms: 8, bathrooms: 7, sqft: 6000, city: 'Toronto', neighborhood: 'Bridle Path',
    title: 'Bridle Path estate · 8 bedrooms', description: 'New bilingual copy', amenities: ['Finished Basement'],
  }
  it('keeps the photos and the stored facts, applies the new copy, records only what changed', () => {
    const d = mergeWithExisting({ ...colvestone, updated_at: '2026-09-30T01:02:03.456789+00:00', is_active: true }, model, '可以的，帮我修改一下')
    expect(d.images).toEqual(colvestone.images)
    expect(d.title).toBe('Bridle Path estate · 8 bedrooms')
    expect(d.description).toBe('New bilingual copy')
    expect(d.amenities).toEqual(['Wood-paneled Library', 'Finished Basement']) // stored ∪ new
    expect(d.neighborhood).toBe('St. Andrew-Windfields') // never from the model
    expect(d.lease_term).toBe('12 months')
    expect(d.listing_id).toBe(colvestone.id)
    expect(d.base_updated_at).toBe('2026-09-30T01:02:03.456789+00:00')
    expect(d.changed_fields?.sort()).toEqual(['amenities', 'description', 'title'])
  })
  it('hard facts change only when the user says the new value, in context', () => {
    expect(mergeWithExisting(colvestone, { ...model, monthly_rent: 14500 }, '帮我改一下描述').monthly_rent).toBe(13800)
    const up = mergeWithExisting(colvestone, { ...model, monthly_rent: 14500 }, '租金改成 14500')
    expect(up.monthly_rent).toBe(14500)
    expect(up.changed_fields).toContain('monthly_rent')
    expect(mergeWithExisting(colvestone, { ...model, bedrooms: 2 }, '突出步行 2 分钟到地铁').bedrooms).toBe(8)
    expect(mergeWithExisting(colvestone, { ...model, bedrooms: 7 }, '其实是 7 房').bedrooms).toBe(7)
  })
  it('photos from a link replace the stored ones only when the user asked about photos', () => {
    expect(mergeWithExisting(colvestone, model, '参考这个链接改一下描述', ['https://other/1.jpg']).images).toEqual(colvestone.images)
    expect(mergeWithExisting(colvestone, model, '换成这个链接里的照片', ['https://new/1.jpg']).images).toEqual(['https://new/1.jpg'])
  })
  it('the update patch writes only the changed fields (and photos only when changed)', () => {
    const d = mergeWithExisting(colvestone, model, '帮我改一下')
    const p = buildListingPatch(d, null, d.changed_fields ?? [])
    expect(Object.keys(p).sort()).toEqual(['amenities', 'description', 'title'])
    expect(buildListingPatch(d, ['https://a'], [])).toEqual({ images: ['https://a'], photo_count: 1 })
  })
})
describe('wiring', () => {
  it('the turn route merges first, then runs the compliance filter, then the grounding check', () => {
    const r = read('app/api/agent/turn/route.ts')
    expect(r).toContain('draftListing = mergeWithExisting(hit, draftListing, message, urlImages)')
    expect(r.indexOf('matchOwnedListing(draftListing')).toBeLessThan(r.indexOf('const sanitized = sanitizeDraftListing(draftListing, uiLang)'))
    expect(r.indexOf('const sanitized = sanitizeDraftListing(draftListing, uiLang)')).toBeLessThan(r.indexOf('if (draftListing && !ownedMatch) {'))
    expect(r).toContain("if (!ownedMatch && !(draftListing.monthly_rent > 0)) draftListing = undefined")
  })
  it('the client never re-reconciles a server-merged rewrite against an older card', () => {
    expect(read('lib/agent/useAgentSession.ts')).toContain('if (draftListing && !draftListing.listing_id) {')
  })
  it('an update refuses when the listing changed since the card was drafted', () => {
    const l = read('lib/listingPublish.ts')
    expect(l).toContain("if (opts.expectedUpdatedAt) q = q.eq('updated_at', opts.expectedUpdatedAt)")
    expect(read('supabase/migrations/20260930_listings_updated_at.sql')).toContain('new.updated_at := clock_timestamp();')
  })
  it('the card updates in place and edits the listing’s own editor', () => {
    const c = read('components/agent/DraftListingChatCard.tsx')
    expect(c).toContain('const isUpdate = !!form.listing_id')
    expect(c).toContain('buildListingPatch(form, photosChanged ? photos : null, changedFields)')
    expect(c).toContain('expectedUpdatedAt: form.base_updated_at ?? null')
    expect(c).toContain('router.push(`/dashboard/listings/${form.listing_id}/edit?from=agent`)')
    expect(c).toContain("isUpdate ? (zh ? '更新房源' : 'Update listing')")
    expect(c).toContain("isUpdate ? (zh ? '修改稿' : 'REVISION')")
    expect(c).toContain('data-testid="draft-card-changes"')
  })
  it('the listing editor picks up the AI’s changes once, and says nothing is saved yet', () => {
    const e = read('app/dashboard/listings/[id]/edit/page.tsx')
    expect(e).toContain('localStorage.getItem(LISTING_EDIT_DRAFT_PREFIX + id)')
    expect(e).toContain('localStorage.removeItem(LISTING_EDIT_DRAFT_PREFIX + id)')
    expect(e).toContain('data-testid="agent-edit-banner"')
    expect(e).toContain('if (cancelled) return')
    expect(e).toContain('data-testid="free-amenity"')
  })
  it('the prompt tells the AI a rewrite keeps the listing’s address and unit', () => {
    expect(read('lib/agent/prompts.ts')).toContain('卡片上的按钮会变成「更新房源」')
  })
})
