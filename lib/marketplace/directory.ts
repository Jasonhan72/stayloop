// The repair-provider directory at /providers (2026-11-16): which verified providers are
// listed, with what coverage, in what order. Pure. The order is fixed and stated on the page —
// every listed trade covered first, then by when the provider was verified (earliest first),
// then by name. No ranking, no paid placement.
import { coverageFor, isProfessionalTrade, TRADES, type CredentialKind, type CredentialLite, type Trade } from './trades'

export type DirectoryProvider = {
  id: string
  legal_name: string
  trade_name: string | null
  trades: string[]
  service_cities: string[]
  pricing_mode: string
  call_out_fee: number | null
  hourly_rate: number | null
  /** The directory lists read the e-mail address and the phone number (shown on the card); the website is read on the provider's page only. */
  contact_email?: string | null
  contact_phone?: string | null
  website?: string | null
  verified_at: string | null
  /** What the provider wrote about themselves, the languages they work in and their photo or logo (2026-11-23). */
  bio?: string | null
  languages?: string[] | null
  photo_key?: string | null
}
export type DirectoryCredential = CredentialLite & { provider_id: string }
/**
 * One provider's rating as the page reads it. Since 2026-11-22 the pages read the view
 * `provider_review_stats` — one row per verified provider, already averaged, `reviews` = how many —
 * because the review table itself shows each account only the reviews it wrote (plus its own
 * provider's), so the same card showed a different rating to different people. A row without
 * `reviews` is a single review (weight 1), which is what the older callers and tests pass.
 */
export type DirectoryReview = { provider_id: string | null; overall: number; reviews?: number | null; on_time?: number | null; communication?: number | null; quality?: number | null }
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
    const rating = ratingFor(p.id, reviews)
    rows.push({
      p,
      trades,
      complete: trades.every((x) => x.ok),
      creds: pc,
      avg: rating.avg,
      reviews: rating.n,
    })
  }
  const name = (r: DirectoryRow) => (r.p.trade_name || r.p.legal_name || '').toLowerCase()
  return rows.sort((a, b) =>
    Number(b.complete) - Number(a.complete)
    || (a.p.verified_at ?? '9999').localeCompare(b.p.verified_at ?? '9999')
    || name(a).localeCompare(name(b)))
}

const weight = (r: DirectoryReview) => Math.max(1, Math.round(Number(r.reviews ?? 1)) || 1)
const mean = (rows: readonly DirectoryReview[], pick: (r: DirectoryReview) => number | null | undefined): number | null => {
  let sum = 0; let n = 0
  for (const r of rows) { const v = pick(r); if (v == null || !Number.isFinite(Number(v))) continue; sum += Number(v) * weight(r); n += weight(r) }
  return n ? Math.round((sum / n) * 10) / 10 : null
}

/** A provider's rating: the overall average to one decimal, how many reviews, and the three part scores when given. */
export function ratingFor(providerId: string, reviews: readonly DirectoryReview[]): { avg: number | null; n: number; onTime: number | null; communication: number | null; quality: number | null } {
  const rv = reviews.filter((r) => r.provider_id === providerId)
  return {
    avg: mean(rv, (r) => r.overall),
    n: rv.reduce((s, r) => s + weight(r), 0),
    onTime: mean(rv, (r) => r.on_time),
    communication: mean(rv, (r) => r.communication),
    quality: mean(rv, (r) => r.quality),
  }
}

/** The name a provider goes by: the trade name when there is one, else the registered name. */
export function providerDisplayName(p: Pick<DirectoryProvider, 'legal_name' | 'trade_name'>): string {
  return (p.trade_name || p.legal_name || '').trim()
}

/** How a provider charges, as one line. Only what the provider entered — never an estimate. */
export function priceLine(p: Pick<DirectoryProvider, 'pricing_mode' | 'call_out_fee' | 'hourly_rate'>, zh: boolean): string {
  if (p.pricing_mode === 'fixed') return zh ? '固定报价' : 'Fixed quotes'
  const hourly = p.hourly_rate != null ? `$${p.hourly_rate}/h` : (zh ? '按工时' : 'Hourly')
  return p.call_out_fee != null ? `${hourly} · ${zh ? '上门费' : 'call-out'} $${p.call_out_fee}` : hourly
}

/** Every trade a provider lists (repairs and professional), with whether its required credentials are in place. */
export function tradeCoverage(p: Pick<DirectoryProvider, 'id' | 'trades'>, creds: readonly DirectoryCredential[], today = new Date(), graceDays = 0): { t: Trade; ok: boolean; professional: boolean }[] {
  const pc = creds.filter((c) => c.provider_id === p.id)
  return (p.trades ?? []).filter((t) => TRADES.some((d) => d.key === t)).map((t) => ({ t: t as Trade, ok: coverageFor(t as Trade, pc, today, graceDays).ok, professional: isProfessionalTrade(t) }))
}

/** The verified credentials a profile lists: one line per kind, with its latest expiry and whether that has passed. */
export function credentialRows(providerId: string, creds: readonly DirectoryCredential[], today = new Date()): { kind: CredentialKind; expires: string | null; expired: boolean }[] {
  const t = today.toISOString().slice(0, 10)
  const mine = creds.filter((c) => c.provider_id === providerId && c.verified_at)
  const kinds = Array.from(new Set(mine.map((c) => c.kind)))
  return kinds.map((k) => {
    const exp = mine.filter((c) => c.kind === k && c.expires_at).map((c) => c.expires_at as string).sort().pop() ?? null
    return { kind: k as CredentialKind, expires: exp, expired: !!exp && exp < t }
  })
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
/** A provider's page is /providers/<id>; anything that is not a uuid never reaches the database. */
export function isProviderId(id: string | null | undefined): id is string {
  return !!id && UUID_RE.test(id)
}
export function providerHref(id: string): string {
  return `/providers/${id}`
}
