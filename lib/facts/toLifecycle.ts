// Facts → lifecycle rail input. Pure; the only bridge between the raw RPC
// payload (lib/facts/useFacts) and lib/lifecycle/stages, so the rail, the
// today card and the status tiles all start from the same rows.
import { agentLifecycle, landlordLifecycle, tenantLifecycle, type HouseholdFact, type LeaseFact, type Lifecycle, type RentFact, type TicketFact } from '@/lib/lifecycle/stages'
import type { AgentFactsRaw, AnyFacts, LandlordFactsRaw, TenantFactsRaw } from './useFacts'
import type { AgentRole } from '@/lib/agent/types'

export function landlordFactsToLifecycle(f: LandlordFactsRaw, today = new Date()): Lifecycle {
  const cards = f.cards
  return landlordLifecycle({
    listings: f.listings,
    showingsPending: cards.filter((c) => ['showing_request', 'listing_inquiry'].includes(c.action_type) && c.status === 'pending').length,
    // Archived applications left the queue; the rail counts the live ones only.
    applications: f.applications.filter((a) => !a.archived_at),
    screenings: f.screenings,
    leases: f.leases as LeaseFact[],
    households: f.households as HouseholdFact[],
    rent: f.rent as RentFact[],
    tickets: f.tickets as TicketFact[],
    renewalIntents: f.intents,
    renewalCards: cards.filter((c) => ['send_renewal_letter', 'renewal_checkpoint'].includes(c.action_type)).map((c) => ({ action_type: c.action_type, status: c.status, lease_id: c.metadata?.lease_id, stage: c.metadata?.stage })),
  }, today)
}

export function tenantFactsToLifecycle(f: TenantFactsRaw, today = new Date()): Lifecycle {
  return tenantLifecycle({
    showings: f.showings,
    applications: f.applications,
    renewalIntent: f.intent,
    leases: f.leases as LeaseFact[],
    households: f.households as HouseholdFact[],
    memberOf: f.members,
    pendingInvites: f.invites.map((i) => ({ id: i.household_id, current_lease_id: i.current_lease_id, verified: false, status: 'pending', end_date: i.end_date, address: i.address, unit: i.unit })),
    rent: f.rent as RentFact[],
    tickets: f.tickets as TicketFact[],
    passportShares: f.shares,
  }, today)
}

export function agentFactsToLifecycle(f: AgentFactsRaw): Lifecycle {
  return agentLifecycle({ profileStatus: f.profile?.status ?? null, pendingCards: f.pending, clients: f.clients })
}

export function factsToLifecycle(role: AgentRole, f: AnyFacts, today = new Date()): Lifecycle {
  if (role === 'landlord') return landlordFactsToLifecycle(f as LandlordFactsRaw, today)
  if (role === 'tenant') return tenantFactsToLifecycle(f as TenantFactsRaw, today)
  return agentFactsToLifecycle(f as AgentFactsRaw)
}
