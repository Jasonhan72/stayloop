// Which province's rules a lease follows (2026-10-06). The same chain the
// lease page already used inline: the linked listing decides when there is
// one; otherwise the managed tenancy's address, then the lease's own §2
// rental-unit block, then the unit label; an empty row is Ontario. Pure.
import { effectiveProvince, type ProvinceCode, type ProvinceRow } from './detect'

export type LeaseUnitTerms = { street?: string | null; city?: string | null; postal?: string | null } | null | undefined

export type LeasePlace = {
  /** The linked listing row (province / address / city / postal_code), when the lease has one the caller could read. */
  listing?: ProvinceRow | null
  /** The managed tenancy created from the lease (address / city). */
  household?: { address?: string | null; city?: string | null } | null
  /** `lease_documents.terms.unit` — street / city / postal of the standard lease. */
  unit?: LeaseUnitTerms
  unit_label?: string | null
}

export function leaseProvince(p: LeasePlace | null | undefined): ProvinceCode {
  if (!p) return 'ON'
  if (p.listing) return effectiveProvince(p.listing)
  return effectiveProvince({
    address: p.household?.address ?? p.unit?.street ?? p.unit_label ?? null,
    city: p.household?.city ?? p.unit?.city ?? null,
    postal_code: p.unit?.postal ?? null,
  })
}

/** `terms.unit` out of a lease's jsonb terms, whatever shape the row has. */
export function unitTermsOf(terms: unknown): LeaseUnitTerms {
  const u = (terms as { unit?: unknown } | null)?.unit
  if (!u || typeof u !== 'object') return null
  const o = u as Record<string, unknown>
  const s = (k: string) => (typeof o[k] === 'string' ? (o[k] as string) : null)
  return { street: s('street'), city: s('city'), postal: s('postal') }
}
