import { describe, expect, it } from 'vitest'
import { LISTINGS_PAGE, nextBatchPrompt, pageListings } from '@/lib/agent/listingPaging'
import type { ListingCard } from '@/lib/agent/types'

// 2026-09-16 — the tenant agent shows 6 cards (two rows of three) and a
// 「换一批」 button; the server ships a second page so the first click needs
// no model turn, the second click becomes a real search with exclusions.
const card = (i: number) => ({ id: `l${i}`, address: `${i} Test St`, price: 1000 + i, source: 'realtor' } as unknown as ListingCard)

describe('listing paging', () => {
  it('a page is six', () => { expect(LISTINGS_PAGE).toBe(6) })
  it('shows the first six of twelve and offers to reveal the rest', () => {
    const p = pageListings(Array.from({ length: 12 }, (_, i) => card(i)), 0)
    expect(p.visible.map(c => c.id)).toEqual(['l0', 'l1', 'l2', 'l3', 'l4', 'l5'])
    expect(p.remaining).toBe(6)
    expect(p.next).toBe('reveal')
  })
  it('the second page is the six ranked after; then the button turns into a new search', () => {
    const p = pageListings(Array.from({ length: 12 }, (_, i) => card(i)), 6)
    expect(p.visible.map(c => c.id)).toEqual(['l6', 'l7', 'l8', 'l9', 'l10', 'l11'])
    expect(p.remaining).toBe(0)
    expect(p.next).toBe('search')
  })
  it('a short pool shows what there is and goes straight to search', () => {
    const p = pageListings(Array.from({ length: 4 }, (_, i) => card(i)), 0)
    expect(p.visible).toHaveLength(4)
    expect(p.next).toBe('search')
  })
  it('an odd remainder is still revealed', () => {
    const p = pageListings(Array.from({ length: 9 }, (_, i) => card(i)), 6)
    expect(p.visible).toHaveLength(3)
    expect(p.next).toBe('search')
  })
  it('the follow-up prompt keeps the criteria', () => {
    expect(nextBatchPrompt(true)).toMatch(/条件不变/)
    expect(nextBatchPrompt(false)).toMatch(/same criteria/)
  })
})
