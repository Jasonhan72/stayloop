'use client'

// Loads the facts behind the lifecycle rail through the user's own RLS client
// (no service role, no model), then hands them to the pure derivation in
// ./stages. One hook per workspace page; refetch on demand.
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/useAuth'
import type { AgentRole } from '@/lib/agent/types'
import {
  agentLifecycle, landlordLifecycle, tenantLifecycle,
  type HouseholdFact, type LeaseFact, type Lifecycle, type RentFact, type TicketFact,
} from './stages'

const LEASE_COLS = 'id, status, start_date, end_date, unit_label, tenant_name, monthly_rent'
const HH_COLS = 'id, current_lease_id, verified, status, end_date, address, unit, monthly_rent, created_by'

async function loadLandlord(uid: string): Promise<Lifecycle> {
  const { data: lls } = await supabase.from('landlords').select('id').or(`id.eq.${uid},auth_id.eq.${uid}`)
  const llIds = (lls ?? []).map((r: { id: string }) => r.id)
  const [{ data: listings }, { data: cards }, { data: leases }, { data: hhRaw }] = await Promise.all([
    llIds.length ? supabase.from('listings').select('id, verification_status, is_active').in('landlord_id', llIds).limit(200) : Promise.resolve({ data: [] as never[] }),
    supabase.from('agent_pending_actions').select('action_type, status, metadata').eq('user_id', uid).in('action_type', ['showing_request', 'listing_inquiry', 'send_renewal_letter', 'renewal_checkpoint']).limit(200),
    llIds.length ? supabase.from('lease_documents').select(LEASE_COLS).in('landlord_id', llIds).limit(200) : Promise.resolve({ data: [] as never[] }),
    supabase.from('households').select(HH_COLS).limit(200),
  ])
  const listingIds = (listings ?? []).map((l: { id: string }) => l.id)
  const leaseRows = (leases ?? []) as LeaseFact[]
  const leaseIds = new Set(leaseRows.map((l) => l.id))
  const households = ((hhRaw ?? []) as (HouseholdFact & { created_by?: string | null })[]).filter((h) => h.created_by === uid || (h.current_lease_id && leaseIds.has(h.current_lease_id)))
  const hhIds = households.map((h) => h.id)
  const [{ data: apps }, { data: rent }, { data: tickets }, { data: intents }] = await Promise.all([
    listingIds.length ? supabase.from('applications').select('id, listing_id, status, decision_notified_at').in('listing_id', listingIds).limit(300) : Promise.resolve({ data: [] as never[] }),
    leaseIds.size ? supabase.from('rent_payments').select('lease_id, due_date, status, amount').in('lease_id', Array.from(leaseIds)).in('status', ['due', 'late']).limit(100) : Promise.resolve({ data: [] as never[] }),
    hhIds.length ? supabase.from('maintenance_tickets').select('household_id, status').in('household_id', hhIds).limit(100) : Promise.resolve({ data: [] as never[] }),
    hhIds.length ? supabase.from('renewal_intents').select('household_id, lease_id, intent').in('household_id', hhIds).order('created_at', { ascending: false }).limit(100) : Promise.resolve({ data: [] as never[] }),
  ])
  const appIds = (apps ?? []).map((a: { id: string }) => a.id)
  const { data: screenings } = appIds.length ? await supabase.from('screenings').select('application_id, status').in('application_id', appIds).limit(300) : { data: [] as never[] }
  const cardRows = (cards ?? []) as { action_type: string; status: string; metadata: { lease_id?: string; stage?: string } | null }[]
  return landlordLifecycle({
    listings: (listings ?? []) as { id: string; verification_status: string | null; is_active: boolean | null }[],
    showingsPending: cardRows.filter((c) => ['showing_request', 'listing_inquiry'].includes(c.action_type) && c.status === 'pending').length,
    applications: (apps ?? []) as { id: string; listing_id: string | null; status: string | null; decision_notified_at: string | null }[],
    screenings: (screenings ?? []) as { application_id: string | null; status: string | null }[],
    leases: leaseRows,
    households,
    rent: (rent ?? []) as RentFact[],
    tickets: (tickets ?? []) as TicketFact[],
    renewalIntents: (intents ?? []) as { household_id: string; lease_id: string | null; intent: string }[],
    renewalCards: cardRows.filter((c) => ['send_renewal_letter', 'renewal_checkpoint'].includes(c.action_type)).map((c) => ({ action_type: c.action_type, status: c.status, lease_id: c.metadata?.lease_id, stage: c.metadata?.stage })),
  })
}

async function loadTenant(uid: string, email: string | null): Promise<Lifecycle> {
  // Multi-hat accounts: the landlord policies would also return applications
  // and intents RECEIVED on their listings — read the applicant view (email
  // filtered) and intents by the caller's own tenants row (review 2026-09-23).
  const { data: tenantRow } = await supabase.from('tenants').select('id').eq('auth_id', uid).maybeSingle()
  const tenantId = (tenantRow as { id: string } | null)?.id ?? null
  const [{ data: showings }, { data: apps }, { data: leases }, { data: members }, { data: hhRaw }, { count: shareCount }, { data: invites }] = await Promise.all([
    tenantId ? supabase.from('showing_intents').select('kind, status').eq('tenant_id', tenantId).limit(50) : Promise.resolve({ data: [] as never[] }),
    supabase.from('applicant_applications').select('id, status, decision_notified_at, viewed_at, screened_at').limit(50),
    email ? supabase.from('lease_documents').select(LEASE_COLS).ilike('tenant_email', email).limit(50) : Promise.resolve({ data: [] as never[] }),
    supabase.from('household_members').select('household_id').eq('user_id', uid).limit(50),
    supabase.from('households').select(HH_COLS).limit(50),
    supabase.from('passport_share_tokens').select('token', { count: 'exact', head: true }).eq('tenant_user_id', uid).is('revoked_at', null),
    supabase.rpc('my_pending_invites'),
  ])
  const pendingInvites = ((invites ?? []) as { household_id: string; address: string | null; unit: string | null; current_lease_id: string | null; start_date: string | null; end_date: string | null }[]).map((i) => ({ id: i.household_id, current_lease_id: i.current_lease_id, verified: false, status: 'pending', end_date: i.end_date, address: i.address, unit: i.unit }))
  const leaseRows = (leases ?? []) as LeaseFact[]
  const memberOf = (members ?? []).map((m: { household_id: string }) => m.household_id)
  const households = (hhRaw ?? []) as HouseholdFact[]
  const leaseIds = Array.from(new Set([...leaseRows.map((l) => l.id), ...households.map((h) => h.current_lease_id).filter(Boolean) as string[]]))
  const hhIds = households.map((h) => h.id)
  const [{ data: rent }, { data: tickets }, { data: intents }] = await Promise.all([
    leaseIds.length ? supabase.from('rent_payments').select('lease_id, due_date, status, amount').in('lease_id', leaseIds).in('status', ['due', 'late']).limit(100) : Promise.resolve({ data: [] as never[] }),
    hhIds.length ? supabase.from('maintenance_tickets').select('household_id, status').in('household_id', hhIds).limit(100) : Promise.resolve({ data: [] as never[] }),
    hhIds.length ? supabase.from('renewal_intents').select('intent, created_at').eq('tenant_user_id', uid).in('household_id', hhIds).order('created_at', { ascending: false }).limit(1) : Promise.resolve({ data: [] as never[] }),
  ])
  return tenantLifecycle({
    showings: (showings ?? []) as { kind: string | null; status: string | null }[],
    applications: (apps ?? []) as { id: string; status: string | null; decision_notified_at: string | null; viewed_at?: string | null; screened_at?: string | null }[],
    renewalIntent: ((intents ?? []) as { intent: string; created_at: string }[])[0] ?? null,
    leases: leaseRows,
    households,
    memberOf,
    pendingInvites,
    rent: (rent ?? []) as RentFact[],
    tickets: (tickets ?? []) as TicketFact[],
    passportShares: shareCount ?? 0,
  })
}

async function loadAgent(uid: string): Promise<Lifecycle> {
  const [{ data: prof }, { count }, { data: clients }] = await Promise.all([
    supabase.from('agent_profiles').select('status').eq('auth_id', uid).maybeSingle(),
    supabase.from('agent_pending_actions').select('id', { count: 'exact', head: true }).eq('user_id', uid).eq('status', 'pending'),
    supabase.from('agent_clients').select('stage, representation_agreement_at, info_guide_given_at').eq('agent_auth_id', uid).limit(200),
  ])
  return agentLifecycle({ profileStatus: (prof as { status?: string } | null)?.status ?? null, pendingCards: count ?? 0, clients: (clients ?? []) as { stage: string; representation_agreement_at: string | null; info_guide_given_at: string | null }[] })
}

export function useLifecycle(role: AgentRole): { lifecycle: Lifecycle | null; loading: boolean; reload: () => void } {
  const auth = useAuth()
  const [lifecycle, setLifecycle] = useState<Lifecycle | null>(null)
  const [loading, setLoading] = useState(true)
  const [tick, setTick] = useState(0)
  const reload = useCallback(() => setTick((t) => t + 1), [])
  useEffect(() => {
    if (auth.loading) return
    if (!auth.user) { setLifecycle(null); setLoading(false); return }
    let cancelled = false
    setLoading(true)
    const uid = auth.user.id
    const p = role === 'landlord' ? loadLandlord(uid) : role === 'agent' ? loadAgent(uid) : loadTenant(uid, auth.user.email ?? null)
    p.then((lc) => { if (!cancelled) setLifecycle(lc) })
      .catch((e) => { console.warn('[lifecycle] load failed', (e as Error).message); if (!cancelled) setLifecycle(null) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [auth.loading, auth.user, role, tick])
  return { lifecycle, loading, reload }
}
