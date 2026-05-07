// -----------------------------------------------------------------------------
// /tenant/listings — alias → /listings
// -----------------------------------------------------------------------------
// The public /listings page already shows all live listings with real DB
// data, search, filtering, and per-card detail links. The previous tenant-
// only variant rendered hardcoded demo data with a Passport-fit overlay
// that wasn't actually computed (placeholder numbers). Until the
// Passport-fit scoring lands, redirect tenants to the public browse view
// so they see the same real data everyone else does.
// -----------------------------------------------------------------------------

import { redirect } from 'next/navigation'

export const dynamic = 'force-static'

export default function TenantListingsAlias(): never {
  redirect('/listings')
}
