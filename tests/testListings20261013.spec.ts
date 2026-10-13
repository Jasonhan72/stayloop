// 2026-10-13: every listing left on the site is test data; it must say so
// wherever a listing is shown (browse card, detail page, similar cards, AI chat
// card, apply page) and stay out of the public-stats count.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { isTestListing, TEST_LISTING_LABEL } from '@/lib/listingVisibility'

const read = (p: string) => readFileSync(p, 'utf8')

describe('isTestListing', () => {
  it('reads the column first, then the [TEST] prefix', () => {
    expect(isTestListing({ is_test: true, title: 'Nice condo' })).toBe(true)
    expect(isTestListing({ is_test: false, title: '[TEST] 100 Test QA Lane' })).toBe(true)
    expect(isTestListing({ is_test: null, address: ' [test] 1 Main St' })).toBe(true)
    expect(isTestListing({ is_test: false, title: 'Real listing', address: '1 Main St' })).toBe(false)
    expect(isTestListing(null)).toBe(false)
    expect(TEST_LISTING_LABEL.zh).toContain('非实际房源')
  })
})

describe('the badge is rendered everywhere a listing appears', () => {
  for (const f of ['app/listings/page.tsx', 'app/listings/[slug]/page.tsx', 'components/agent/ListingChatCard.tsx', 'app/apply/[slug]/page.tsx']) {
    it(`${f} carries data-testid="test-listing-badge"`, () => {
      expect(read(f)).toMatch(/test-listing-badge/)
    })
  }
  it('the detail page marks similar cards too (two badge sites)', () => {
    expect((read('app/listings/[slug]/page.tsx').match(/data-testid="test-listing-badge"/g) || []).length).toBe(2)
  })
  it('the column travels through the search API, the similar-card columns and the AI search', () => {
    expect(read('app/api/listings/search/route.ts')).toMatch(/display_avm,is_test'/)
    expect(read('app/api/listings/[slug]/route.ts')).toMatch(/source, brokerage, is_test`/)
    expect(read('lib/agent/listingSearch.ts')).toMatch(/verification_status,is_test'/)
    expect(read('lib/agent/types.ts')).toContain('is_test?: boolean')
  })
  it('public stats exclude test listings', () => {
    expect(read('supabase/migrations/20261013_listings_is_test.sql')).toContain('where is_active and not is_test')
  })
})
