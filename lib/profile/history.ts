// Applicant pack — tenancies confirmed on Stayloop (V1.0 阶段 4 · 乙 #7 · G13, 2026-10-16).
//
// These never become rows in applicant_profile_history: they are computed from the
// tenancy records with the SAME test as the public /p/<token> card
// (app/p/[token]/page.tsx): a household BOTH sides confirmed (households.verified)
// or a lease both sides signed through the e-sign flow (signed_both + both
// signatures + signed_at). `status='active'` typed by one side is not enough —
// one account could mint an on-time history with it (review 2026-09-19).
//
// Reads go through the CALLER's RLS client: household_members → households →
// lease_documents → rent_payments. Output is counts only (on time / late over
// 7 days / total) — never amounts.
import type { SupabaseClient } from '@supabase/supabase-js'
import type { StayloopHistoryEntry } from './types'

type HouseholdRow = {
  id: string
  verified: boolean | null
  current_lease_id: string | null
  previous_lease_id: string | null
  address: string | null
  unit: string | null
  city: string | null
  start_date: string | null
  end_date: string | null
}

type LeaseRow = {
  id: string
  status: string | null
  signed_at: string | null
  landlord_signature: { name?: string } | null
  tenant_signature: { name?: string } | null
  tenant_email: string | null
  start_date: string | null
  end_date: string | null
  unit_label: string | null
  terms: { landlord_legal_name?: string; unit?: { street?: string; city?: string } } | null
}

type PayRow = { lease_id: string; due_date: string; status: string; paid_at: string | null }

const DAY_MS = 86_400_000
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function utcDay(s: string | null | undefined): number | null {
  if (!s) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  if (!m) return null
  return Math.floor(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / DAY_MS)
}

/** Both sides signed through the e-sign flow — the public card's second test. */
export function isDualSignedLease(l: Pick<LeaseRow, 'status' | 'signed_at' | 'landlord_signature' | 'tenant_signature'>): boolean {
  return l.status === 'signed_both' && !!l.signed_at && !!l.landlord_signature && !!l.tenant_signature
}

/** Paid more than 7 days after the due date (the s.58 "persistently late" yardstick). */
export function isLateOver7(p: Pick<PayRow, 'due_date' | 'paid_at'>): boolean {
  const due = utcDay(p.due_date)
  const paid = utcDay(p.paid_at)
  if (due === null || paid === null) return false
  return paid - due > 7
}

/** Pure: fold the rows into entries (exported so the test can run it without a client). */
export function buildStayloopHistory(households: HouseholdRow[], leases: LeaseRow[], pays: PayRow[]): StayloopHistoryEntry[] {
  const leaseById = new Map(leases.map((l) => [l.id, l]))
  const householdByLease = new Map<string, HouseholdRow>()
  for (const h of households) {
    for (const lid of [h.current_lease_id, h.previous_lease_id]) if (lid && !householdByLease.has(lid)) householdByLease.set(lid, h)
  }
  // Which leases count: in a verified household, or dual-signed.
  const qualifying = new Set<string>()
  for (const h of households) {
    if (!h.verified) continue
    for (const lid of [h.current_lease_id, h.previous_lease_id]) if (lid) qualifying.add(lid)
  }
  for (const l of leases) if (isDualSignedLease(l)) qualifying.add(l.id)

  const counts = new Map<string, { onTime: number; lateOver7: number; total: number }>()
  for (const p of pays) {
    if (!qualifying.has(p.lease_id)) continue
    if (p.status !== 'paid' && p.status !== 'late') continue
    const c = counts.get(p.lease_id) ?? { onTime: 0, lateOver7: 0, total: 0 }
    c.total += 1
    if (p.status === 'paid') c.onTime += 1
    else if (isLateOver7(p)) c.lateOver7 += 1
    counts.set(p.lease_id, c)
  }

  const out: StayloopHistoryEntry[] = []
  for (const lid of qualifying) {
    const l = leaseById.get(lid) ?? null
    const h = householdByLease.get(lid) ?? null
    const address = (h?.address || l?.terms?.unit?.street || '').trim()
    if (!address) continue
    const c = counts.get(lid) ?? { onTime: 0, lateOver7: 0, total: 0 }
    const landlordName = (l?.landlord_signature?.name || l?.terms?.landlord_legal_name || '').trim()
    out.push({
      source: 'stayloop',
      address,
      unit: (h?.unit || l?.unit_label || null) || null,
      city: (h?.city || l?.terms?.unit?.city || null) || null,
      start: l?.start_date || h?.start_date || null,
      end: l?.end_date || h?.end_date || null,
      onTime: c.onTime,
      lateOver7: c.lateOver7,
      total: c.total,
      ...(landlordName ? { landlordName } : {}),
    })
  }
  // Most recent first; a tenancy without dates sorts last.
  out.sort((a, b) => (utcDay(b.start) ?? -Infinity) - (utcDay(a.start) ?? -Infinity))
  return out
}

/**
 * The signed-in applicant's Stayloop-confirmed tenancies, read with their own RLS
 * client. `email` is the JWT email (leases name the tenant by email). Errors in any
 * read are tolerated — the pack simply shows fewer confirmed tenancies.
 */
export async function stayloopHistory(sb: SupabaseClient, uid: string, email: string | null | undefined): Promise<StayloopHistoryEntry[]> {
  if (!UUID.test(uid)) return []
  let households: HouseholdRow[] = []
  try {
    const { data: mem } = await sb.from('household_members').select('household_id').eq('user_id', uid).eq('status', 'active').eq('role', 'tenant').limit(50)
    const ids = Array.from(new Set(((mem ?? []) as { household_id: string }[]).map((m) => m.household_id).filter((id) => UUID.test(id))))
    if (ids.length) {
      const { data } = await sb
        .from('households')
        .select('id, verified, current_lease_id, previous_lease_id, address, unit, city, start_date, end_date')
        .in('id', ids)
        .limit(50)
      households = ((data ?? []) as HouseholdRow[])
    }
  } catch {
    /* tolerated */
  }

  const leaseIds = new Set<string>()
  for (const h of households) for (const lid of [h.current_lease_id, h.previous_lease_id]) if (lid) leaseIds.add(lid)

  let leases: LeaseRow[] = []
  const cols = 'id, status, signed_at, landlord_signature, tenant_signature, tenant_email, start_date, end_date, unit_label, terms'
  try {
    const mail = (email || '').trim()
    if (mail) {
      const { data } = await sb.from('lease_documents').select(cols).ilike('tenant_email', mail).limit(50)
      leases = ((data ?? []) as LeaseRow[])
    }
    const missing = Array.from(leaseIds).filter((id) => !leases.some((l) => l.id === id))
    if (missing.length) {
      const { data } = await sb.from('lease_documents').select(cols).in('id', missing).limit(50)
      leases = leases.concat(((data ?? []) as LeaseRow[]))
    }
  } catch {
    /* tolerated */
  }
  for (const l of leases) leaseIds.add(l.id)

  let pays: PayRow[] = []
  try {
    if (leaseIds.size) {
      const { data } = await sb
        .from('rent_payments')
        .select('lease_id, due_date, status, paid_at')
        .in('lease_id', Array.from(leaseIds))
        .in('status', ['paid', 'late'])
        .order('due_date', { ascending: false })
        .limit(600)
      pays = ((data ?? []) as PayRow[])
    }
  } catch {
    /* tolerated */
  }

  return buildStayloopHistory(households, leases, pays)
}
