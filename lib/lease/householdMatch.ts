// Is this the same tenancy as one already managed? Used by the e-sign route
// (a second lease for the same unit attaches to the existing household instead
// of creating a duplicate) and by /leases/import (re-importing, or the other
// party importing the same lease, offers the existing household). One
// normaliser for both, so the two never disagree (sweep 2026-10-01, #14 / #18).

const SUFFIX: Record<string, string> = {
  street: 'st', st: 'st', str: 'st', avenue: 'ave', ave: 'ave', av: 'ave', road: 'rd', rd: 'rd',
  drive: 'dr', dr: 'dr', boulevard: 'blvd', blvd: 'blvd', crescent: 'cres', cres: 'cres',
  court: 'crt', crt: 'crt', ct: 'crt', place: 'pl', pl: 'pl', lane: 'ln', ln: 'ln', way: 'way',
  terrace: 'terr', terr: 'terr', trail: 'trl', trl: 'trl', parkway: 'pkwy', pkwy: 'pkwy',
  circle: 'cir', cir: 'cir', square: 'sq', sq: 'sq', gate: 'gate', gardens: 'gdns', gdns: 'gdns',
  highway: 'hwy', hwy: 'hwy', grove: 'grv', grv: 'grv', heights: 'hts', hts: 'hts', path: 'path',
  row: 'row', walk: 'walk', close: 'close', mews: 'mews', quay: 'quay', line: 'line', park: 'park',
}
const DIR: Record<string, string> = { e: 'e', east: 'e', w: 'w', west: 'w', n: 'n', north: 'n', s: 's', south: 's' }
const UNIT_SEGMENT = /^\s*(unit|suite|ste|apt|apartment|#)\s*#?\s*([a-z0-9-]+)\s*$/i

export function normalizeUnit(unit: string | null | undefined): string {
  return String(unit ?? '')
    .toLowerCase()
    .replace(/\b(unit|suite|ste|apt|apartment|no)\b\.?/g, ' ')
    .replace(/[^a-z0-9]/g, '')
    .replace(/^0+(?=\d)/, '')
}

/** "1203 - 28 Avondale Ave" and "Unit 1203, 28 Avondale Ave" carry the unit inside the address. */
export function splitAddress(address: string | null | undefined, unit?: string | null): { street: string; unit: string } {
  let a = String(address ?? '').trim()
  let u = String(unit ?? '').trim()
  const dash = a.match(/^\s*#?([a-z0-9]+)\s*[-–]\s*(\d+[a-z]?\b.*)$/i)
  if (dash) { if (!u) u = dash[1]; a = dash[2] }
  const segments = a.split(',').map((x) => x.trim()).filter(Boolean)
  let street = ''
  for (const seg of segments) {
    const um = seg.match(UNIT_SEGMENT)
    if (um) { if (!u) u = um[2]; continue }
    if (/\d+[a-z]?\s+[a-z]/i.test(seg)) { street = seg; break }
  }
  if (!street) street = segments.find((s) => !UNIT_SEGMENT.test(s)) ?? ''
  return { street, unit: u }
}

/** "28 Avondale Avenue, Toronto" → "28 avondale"; "100 King Street West" → "100 king w". null when there is no house number + name. */
export function streetKey(address: string | null | undefined): string | null {
  const { street } = splitAddress(address)
  const tokens = street.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean)
  const i = tokens.findIndex((t) => /^\d+[a-z]?$/.test(t))
  if (i < 0) return null
  const number = tokens[i]
  const rest = tokens.slice(i + 1)
  const name: string[] = []
  let dir = ''
  for (let j = 0; j < rest.length; j++) {
    const t = rest[j]
    // A suffix word ends the name — but not as the first word ("St Clair Ave W").
    if (name.length > 0 && SUFFIX[t]) {
      const next = rest[j + 1]
      if (next && DIR[next]) dir = DIR[next]
      break
    }
    name.push(t)
  }
  if (!name.length) return null
  return [number, ...name, dir].filter(Boolean).join(' ')
}

export function sameTenancyAddress(a: { address: string | null; unit?: string | null }, b: { address: string | null; unit?: string | null }): boolean {
  const sa = splitAddress(a.address, a.unit)
  const sb = splitAddress(b.address, b.unit)
  const ka = streetKey(sa.street)
  const kb = streetKey(sb.street)
  if (!ka || !kb || ka !== kb) return false
  return normalizeUnit(sa.unit) === normalizeUnit(sb.unit)
}

export type HouseholdCandidate = {
  id: string
  address: string | null
  unit: string | null
  status: string | null
  /**
   * Who the household's tenant is, lower-case: tenant invites that were not
   * declined or revoked, the current lease's tenant email, and the account
   * emails of active tenant members.
   */
  tenant_emails?: string[]
}

export function normalizeEmail(email: string | null | undefined): string {
  return String(email ?? '').trim().toLowerCase()
}

/**
 * Could this household be the lease's tenancy by address alone (before the
 * tenant is known)? Same address + unit, or one side has no comparable street
 * and the units do not conflict. The sign route uses it to look up tenant
 * emails only for the few households that can still match.
 */
export function householdAddressMayMatch(
  lease: { address: string | null; unit?: string | null },
  c: { address: string | null; unit: string | null },
): boolean {
  if (sameTenancyAddress(lease, c)) return true
  const ls = splitAddress(lease.address, lease.unit)
  const cs = splitAddress(c.address, c.unit)
  if (streetKey(ls.street) && streetKey(cs.street)) return false
  const lu = normalizeUnit(ls.unit), cu = normalizeUnit(cs.unit)
  return !(lu && cu && lu !== cu)
}

/**
 * The managed household a newly signed lease belongs to: the same tenancy
 * means the same tenant. A household at the same address + unit whose tenant
 * is someone else (the previous tenant, after the unit was re-let) is never
 * reused — attaching would show each tenant the other's thread, tickets and
 * rent ledger. Same address + unit wins; when the addresses cannot be compared
 * (one side has no house number) the units must not conflict. No tenant email
 * on the lease → no match (a new household).
 */
export function pickHouseholdForLease(
  lease: { address: string | null; unit?: string | null; tenant_email?: string | null },
  candidates: HouseholdCandidate[],
): string | null {
  const email = normalizeEmail(lease.tenant_email)
  if (!email) return null
  const live = candidates.filter((c) => (c.status ?? 'active') === 'active' && (c.tenant_emails ?? []).map(normalizeEmail).includes(email))
  const byAddress = live.find((c) => sameTenancyAddress(lease, c))
  if (byAddress) return byAddress.id
  const fallback = live.find((c) => householdAddressMayMatch(lease, c))
  return fallback ? fallback.id : null
}

export type InviteRow = { invited_email: string | null; accepted_at?: string | null; expires_at?: string | null; declined_at?: string | null; revoked_at?: string | null }

/** Does this email already hold an invite that works — accepted, or open and not expired? */
export function hasUsableInvite(invites: InviteRow[], email: string, now: number): boolean {
  const want = normalizeEmail(email)
  return invites.some((i) => {
    if (normalizeEmail(i.invited_email) !== want || i.declined_at || i.revoked_at) return false
    if (i.accepted_at) return true
    const exp = i.expires_at ? Date.parse(i.expires_at) : NaN
    return !Number.isNaN(exp) && exp > now
  })
}

/**
 * Where a newly signed lease goes on the tenancy it joins (B1 2026-10-01). A term
 * that has started (start date today or earlier, Toronto) is the current lease; a
 * renewal that starts later waits in households.next_lease_id until its start date
 * (promote_household_leases, daily). Switching at signing hid the running term's
 * remaining rent periods in the hub, and mark_rent_paid (current lease only)
 * refused them. No start date → current, as before.
 */
export function leaseAttachSlot(startDate: string | null | undefined, today: string): 'current' | 'next' {
  const s = String(startDate ?? '').slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && s > today ? 'next' : 'current'
}
