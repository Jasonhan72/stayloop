// Single source of truth for the public-listing visibility policy: a listing
// is publicly visible only when Stayloop has verified it, or it was imported
// from Realtor.ca (MLS-backed, shown with a source badge instead).
//
// The database enforces this for anon reads (RLS policy "Public can read
// verified listings"); these strings keep the app-layer queries aligned so
// signed-in surfaces and the agent search apply the same rule.

// PostgREST `.or(...)` argument form (supabase-js: .or(LISTING_VISIBILITY_OR)).
export const LISTING_VISIBILITY_OR = 'verification_status.eq.verified,source.eq.realtor'

// Raw query-param form wrapped as an `or(...)` group, for hand-built
// URLSearchParams (lib/agent/listingSearch.ts combines it inside `and=`).
export const LISTING_VISIBILITY_OR_GROUP = `or(${LISTING_VISIBILITY_OR})`

// No photo, no listing (user decision 2026-09-23: a card with a blank hero is
// not acceptable on any public surface). `publishListing` refuses to create
// such a row; the browse page, the assistant search and the admin queue all
// apply the same predicate so a row that slips through (imports, legacy) is
// still never shown.
// 2026-10-13: every listing left on the site is test data (the Realtor.ca
// imports were archived). `listings.is_test` (or a "[TEST]" title/address)
// marks a listing as 测试房源 · 非实际房源 wherever it is shown.
export function isTestListing(l: { is_test?: boolean | null; title?: string | null; address?: string | null } | null | undefined): boolean {
  if (!l) return false
  if (l.is_test === true) return true
  return /^\s*\[TEST\]/i.test(l.title || '') || /^\s*\[TEST\]/i.test(l.address || '')
}

export const TEST_LISTING_LABEL = { zh: '测试房源 · 非实际房源', en: 'Test listing · not a real rental' }

export function hasUsablePhotos(images: unknown): boolean {
  return Array.isArray(images) && images.some((u) => typeof u === 'string' && /^(https?:\/\/|data:image\/)/i.test(u))
}
