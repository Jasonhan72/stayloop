// -----------------------------------------------------------------------------
// /landlord/listings — alias → /dashboard/portfolio
// -----------------------------------------------------------------------------
// /dashboard/portfolio is the canonical landlord listings management page.
// /landlord/listings is the URL most agents/landlords expect to see, so we
// expose it as a clean server-side redirect. Pure alias — zero duplication.
// -----------------------------------------------------------------------------

import { redirect } from 'next/navigation'

export const dynamic = 'force-static'

export default function LandlordListingsAlias(): never {
  redirect('/dashboard/portfolio')
}
