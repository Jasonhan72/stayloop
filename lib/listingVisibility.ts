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
