// -----------------------------------------------------------------------------
// /tenant-screening — V4.1 public alias
// -----------------------------------------------------------------------------
// We expose `/tenant-screening` as a friendly public URL for outbound copy
// (ads, emails, decks) while keeping the existing `/screen` route as the
// canonical implementation. Pure server-side redirect — zero client JS,
// zero duplicate UI.
// -----------------------------------------------------------------------------

import { redirect } from 'next/navigation'

export const dynamic = 'force-static'

export default function TenantScreeningAlias(): never {
  redirect('/screen')
}
