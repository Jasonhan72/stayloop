// The repair-provider directory at /providers (2026-11-16): which verified providers are
// listed, with what coverage, in what order. Pure. The order is fixed and stated on the page —
// every listed trade covered first, then by when the provider was verified (earliest first),
// then by name. No ranking, no paid placement.
import { coverageFor, isProfessionalTrade, type CredentialLite, type Trade } from './trades'

export type DirectoryProvider = {
  id: string
  legal_name: string
  trade_name: string | null
  trades: string[]
  service_cities: string[]
  pricing_mode: string
  call_out_fee: number | null
  hourly_rate: number | null
  contact_email: string | null
  contact_phone: string | null
  website: string | null
  verified_at: string | null
}
export type DirectoryCredential = CredentialLite & { provider_id: string }
export type DirectoryReview = { provider_id: string | null; overall: number }
export type DirectoryRow = {
  p: DirectoryProvider
  /** The provider's repair trades (professional trades live on the other tab) and whether each is covered. */
  trades: { t: Trade; ok: boolean }[]
  /** Every listed repair trade is covered. */
  complete: boolean
  creds: DirectoryCredential[]
  avg: number | null
  reviews: number
}

export function repairDirectory(
  providers: readonly DirectoryProvider[],
  creds: readonly DirectoryCredential[],
  reviews: readonly DirectoryReview[],
  filter: { trade?: string | null; city?: string | null } = {},
  today = new Date(),
  graceDays = 0,
): DirectoryRow[] {
  const rows: DirectoryRow[] = []
  for (const p of providers) {
    const repair = (p.trades ?? []).filter((t) => !isProfessionalTrade(t)) as Trade[]
    if (!repair.length) continue
    if (filter.trade && filter.trade !== 'all' && !repair.includes(filter.trade as Trade)) continue
    if (filter.city && filter.city !== 'all' && !(p.service_cities ?? []).includes(filter.city)) continue
    const pc = creds.filter((c) => c.provider_id === p.id)
    const trades = repair.map((t) => ({ t, ok: coverageFor(t, pc, today, graceDays).ok }))
    const rv = reviews.filter((r) => r.provider_id === p.id)
    rows.push({
      p,
      trades,
      complete: trades.every((x) => x.ok),
      creds: pc,
      avg: rv.length ? Math.round((rv.reduce((s, r) => s + r.overall, 0) / rv.length) * 10) / 10 : null,
      reviews: rv.length,
    })
  }
  const name = (r: DirectoryRow) => (r.p.trade_name || r.p.legal_name || '').toLowerCase()
  return rows.sort((a, b) =>
    Number(b.complete) - Number(a.complete)
    || (a.p.verified_at ?? '9999').localeCompare(b.p.verified_at ?? '9999')
    || name(a).localeCompare(name(b)))
}
