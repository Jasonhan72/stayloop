'use client'

// ONE fact source per hat (节点 1 · 可信, 2026-09-26). Every workspace
// surface that shows a count or a state — the status tiles, the maintenance
// board, my-rent, my-applications, the today card, the lifecycle rail — reads
// the same `lifecycle_facts_<role>` RPC result through this hook, so two
// panels on one page can no longer disagree about the same tenancy. The RPCs
// are SECURITY INVOKER (caller's RLS); the hook only adds a short shared
// cache so several components mounted together pay one round trip, and a
// change event so a write anywhere refreshes every reader.
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/useAuth'
import type { AgentRole } from '@/lib/agent/types'

export type LeaseRow = {
  id: string; status: string | null; start_date: string | null; end_date: string | null; unit_label: string | null
  tenant_name?: string | null; tenant_email?: string | null; monthly_rent?: number | null
  application_id?: string | null; sent_at?: string | null; signed_at?: string | null; created_at?: string | null
  listing_id?: string | null
  /** Where the lease is (RPC 2026-10-06): the linked listing's place and the lease's own §2 block — lib/provinces/lease decides the province. */
  listing_place?: { province?: string | null; address?: string | null; city?: string | null; postal_code?: string | null } | null
  unit_place?: { street?: string | null; city?: string | null; postal?: string | null } | null
}
export type HouseholdRow = {
  id: string; current_lease_id: string | null; verified: boolean | null; status: string | null; end_date: string | null
  address?: string | null; unit?: string | null; city?: string | null; monthly_rent?: number | null; created_by?: string | null
}
export type RentRow = { id?: string; lease_id: string | null; due_date: string; status: string | null; amount?: number | null; paid_at?: string | null; method?: string | null }
export type TicketRow = { household_id: string | null; status: string | null }
// executed_at + execution_result.ok decide whether a renewal letter really went out (contract C8).
export type CardRow = { action_type: string; status: string; metadata: { lease_id?: string; stage?: string } | null; executed_at?: string | null; execution_result?: { ok?: unknown; reason?: unknown } | null }

export type LandlordFactsRaw = {
  listings: { id: string; address?: string | null; unit?: string | null; verification_status: string | null; is_active: boolean | null; source?: string | null }[]
  cards: CardRow[]
  leases: LeaseRow[]
  households: HouseholdRow[]
  applications: { id: string; listing_id: string | null; status: string | null; decision_notified_at: string | null; screened_at?: string | null; archived_at?: string | null; created_at?: string | null }[]
  rent: RentRow[]
  rent_month: RentRow[]
  tickets: TicketRow[]
  intents: { household_id: string; lease_id: string | null; intent: string }[]
  screenings: { application_id: string | null; status: string | null }[]
}

export type TenantApplicationRow = {
  id: string; status: string | null; created_at: string; move_in_date: string | null
  viewed_at: string | null; screened_at: string | null; decision_notified_at: string | null; listing_id: string | null
  listing_slug: string | null; listing_address: string | null; listing_unit: string | null; listing_active: boolean | null
  files_count?: number | null; decision_reason?: string | null
}
export type TenantFactsRaw = {
  tier: number | null
  applications: TenantApplicationRow[]
  leases: LeaseRow[]
  members: string[]
  member_roles: { household_id: string; role: string }[]
  households: HouseholdRow[]
  invites: { household_id: string; address: string | null; unit: string | null; current_lease_id: string | null; end_date: string | null }[]
  shares: number
  showings: { kind: string | null; status: string | null }[]
  rent: RentRow[]
  rent_all: RentRow[]
  tickets: TicketRow[]
  intent: { intent: string; created_at: string } | null
}

export type AgentFactsRaw = {
  profile: { status: string | null; expires_at: string | null } | null
  pending: number
  clients: { id: string; name: string; stage: string; representation_agreement_at: string | null; info_guide_given_at: string | null; last_contact_at: string | null; updated_at: string | null }[]
  commission: { fee_amount: number | null; stripe_transfer_id: string | null }[]
}

export type FactsFor<R extends AgentRole> = R extends 'landlord' ? LandlordFactsRaw : R extends 'tenant' ? TenantFactsRaw : AgentFactsRaw
export type AnyFacts = LandlordFactsRaw | TenantFactsRaw | AgentFactsRaw

/** Fired by anything that wrote a fact (a ticket, a lease, a decision) so every reader refetches. */
export const FACTS_CHANGED_EVENT = 'sl-facts-changed'
export function notifyFactsChanged() {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(FACTS_CHANGED_EVENT))
}

const RPC: Record<AgentRole, string> = { landlord: 'lifecycle_facts_landlord', tenant: 'lifecycle_facts_tenant', agent: 'lifecycle_facts_agent' }
const TTL_MS = 2_000
const cache = new Map<string, { at: number; p: Promise<AnyFacts | null> }>()

const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : [])

/** Defensive shape: every list is an array even when the RPC returned null for it. */
function normalize(role: AgentRole, raw: unknown): AnyFacts {
  const f = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  if (role === 'landlord') {
    return {
      listings: arr(f.listings), cards: arr(f.cards), leases: arr(f.leases), households: arr(f.households), applications: arr(f.applications),
      rent: arr(f.rent), rent_month: arr(f.rent_month), tickets: arr(f.tickets), intents: arr(f.intents), screenings: arr(f.screenings),
    } as LandlordFactsRaw
  }
  if (role === 'tenant') {
    return {
      tier: typeof f.tier === 'number' ? f.tier : null,
      applications: arr(f.applications), leases: arr(f.leases), members: arr<string>(f.members), member_roles: arr(f.member_roles),
      households: arr(f.households), invites: arr(f.invites), shares: Number(f.shares) || 0, showings: arr(f.showings),
      rent: arr(f.rent), rent_all: arr(f.rent_all), tickets: arr(f.tickets),
      intent: (f.intent && typeof f.intent === 'object' ? f.intent : null) as TenantFactsRaw['intent'],
    } as TenantFactsRaw
  }
  return {
    profile: (f.profile && typeof f.profile === 'object' ? f.profile : null) as AgentFactsRaw['profile'],
    pending: Number(f.pending) || 0, clients: arr(f.clients), commission: arr(f.commission),
  } as AgentFactsRaw
}

export function fetchFacts(role: AgentRole, uid: string, force = false): Promise<AnyFacts | null> {
  const key = `${role}:${uid}`
  const hit = cache.get(key)
  if (!force && hit && Date.now() - hit.at < TTL_MS) return hit.p
  const p = Promise.resolve(supabase.rpc(RPC[role]))
    .then(({ data, error }) => {
      if (error) { console.warn('[facts] rpc failed', RPC[role], error.message); return null }
      return normalize(role, data)
    })
    .catch((e) => { console.warn('[facts] rpc threw', (e as Error).message); return null })
  cache.set(key, { at: Date.now(), p })
  return p
}

export function invalidateFacts() { cache.clear() }

export function useFacts<R extends AgentRole>(role: R): { facts: FactsFor<R> | null; loading: boolean; reload: () => void } {
  const auth = useAuth()
  const [facts, setFacts] = useState<FactsFor<R> | null>(null)
  const [loading, setLoading] = useState(true)
  const [tick, setTick] = useState(0)
  const reload = useCallback(() => { invalidateFacts(); setTick((t) => t + 1) }, [])
  useEffect(() => {
    if (auth.loading) return
    if (!auth.user) { setFacts(null); setLoading(false); return }
    let cancelled = false
    setLoading(true)
    fetchFacts(role, auth.user.id, tick > 0)
      .then((f) => { if (!cancelled) setFacts(f as FactsFor<R> | null) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [auth.loading, auth.user, role, tick])
  useEffect(() => {
    const on = () => reload()
    window.addEventListener(FACTS_CHANGED_EVENT, on)
    return () => window.removeEventListener(FACTS_CHANGED_EVENT, on)
  }, [reload])
  return { facts, loading, reload }
}
