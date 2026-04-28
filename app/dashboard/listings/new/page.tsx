// -----------------------------------------------------------------------------
// /dashboard/listings/new — legacy URL, now redirects to /listings/new
// -----------------------------------------------------------------------------
// The /listings/new (Nova-driven composer) is the single new-listing flow.
// We keep this route alive purely to catch old bookmarks and external links.
// -----------------------------------------------------------------------------

import { redirect } from 'next/navigation'

export default function LegacyNewListingRedirect() {
  redirect('/listings/new')
}
