// -----------------------------------------------------------------------------
// /landlord/listings — alias → /landlord/properties (canonical)
// -----------------------------------------------------------------------------
// Canonical naming under Sprint A.1 is /landlord/properties (matches
// Sidebar label "Properties / 房源"). This file kept as a 301-style
// redirect so old bookmarks / external links don't 404.
// -----------------------------------------------------------------------------

import { redirect } from 'next/navigation'

export const dynamic = 'force-static'

export default function LandlordListingsAlias(): never {
  redirect('/landlord/properties')
}
