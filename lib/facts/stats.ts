// Status-tile numbers derived from the one fact source (节点 1, 2026-09-26).
// Pure: the same facts object the lifecycle rail and the boards read, so the
// tiles can no longer disagree with them. The old StatusOverview loaders
// queried lease_documents by tenants.id and maintenance_tickets by listing_id
// — columns the e-sign / household flows never write — and showed 暂无租约
// under a rail that said 租中 (external review 2026-09-26).
import { isApplicationOpen, isLeaseInForce, isRentOutstanding, isTicketOpen, leaseDisplayState, type LeaseDisplayState } from '@/lib/matters/states'
import { daysBetween, parseDateOnly, todayUtc } from '@/lib/dates'
import type { AgentFactsRaw, AnyFacts, LandlordFactsRaw, TenantFactsRaw } from './useFacts'
import type { AgentRole } from '@/lib/agent/types'

export type Stats = {
  // tenant
  apps?: number | null
  leaseState?: LeaseDisplayState | null // null = no lease at all
  leaseDetail?: { start: string | null; end: string | null } | null
  openTickets?: number | null
  nextRent?: { date: string; amount: number; late: boolean } | null
  passportTier?: number | null
  // landlord
  pendingApps?: number | null
  activeLeases?: number | null
  upcomingLeases?: number | null
  expiringLeases?: number | null
  renewal?: { d90: number; d60: number; d30: number } | null
  rentMonth?: { collected: number; expected: number } | null
  // agent
  clientsToFollowUp?: number | null
  activeClients?: number | null
  unsettled?: { count: number; amount: number } | null
}

const RENEWAL_WINDOW_DAYS = 120
const QUIET_DAYS = 7

export function tenantStats(f: TenantFactsRaw, today = new Date()): Stats {
  // The lease that matters: in force first, else the newest signed / in-flight one.
  const leases = [...f.leases].sort((a, b) => (b.start_date || '').localeCompare(a.start_date || ''))
  const lease = leases.find((l) => isLeaseInForce(l, today)) ?? leases.find((l) => leaseDisplayState(l, today) !== 'ended') ?? leases[0] ?? null
  const due = f.rent.filter(isRentOutstanding).sort((a, b) => a.due_date.localeCompare(b.due_date))[0]
  return {
    apps: f.applications.filter(isApplicationOpen).length,
    leaseState: lease ? leaseDisplayState(lease, today) : null,
    leaseDetail: lease ? { start: lease.start_date, end: lease.end_date } : null,
    openTickets: f.tickets.filter(isTicketOpen).length,
    nextRent: due ? { date: due.due_date, amount: Number(due.amount) || 0, late: due.status === 'late' } : null,
    passportTier: f.tier ?? null,
  }
}

export function landlordStats(f: LandlordFactsRaw, today = new Date()): Stats {
  const t = todayUtc(today)
  const inForce = f.leases.filter((l) => isLeaseInForce(l, today))
  const upcoming = f.leases.filter((l) => leaseDisplayState(l, today) === 'upcoming')
  const stageOf = (l: { end_date: string | null }) => {
    const end = parseDateOnly(l.end_date)
    if (!end) return null
    const days = daysBetween(t, end)
    if (days < 0 || days > RENEWAL_WINDOW_DAYS) return null
    return days <= 30 ? '30d' : days <= 60 ? '60d' : '90d'
  }
  const stages = inForce.map(stageOf)
  const renewal = { d90: stages.filter((s) => s === '90d').length, d60: stages.filter((s) => s === '60d').length, d30: stages.filter((s) => s === '30d').length }
  const month = f.rent_month
  const rentMonth = month.length
    ? { expected: month.reduce((s, p) => s + (Number(p.amount) || 0), 0), collected: month.filter((p) => p.status === 'paid').reduce((s, p) => s + (Number(p.amount) || 0), 0) }
    : null
  return {
    pendingApps: f.applications.filter((a) => !a.archived_at && isApplicationOpen(a)).length,
    activeLeases: inForce.length,
    upcomingLeases: upcoming.length,
    expiringLeases: renewal.d90 + renewal.d60 + renewal.d30,
    renewal,
    openTickets: f.tickets.filter(isTicketOpen).length,
    rentMonth,
  }
}

export function agentStats(f: AgentFactsRaw, today = new Date()): Stats {
  const open = f.clients.filter((c) => c.stage !== 'closed')
  const quietSince = (iso: string | null) => (iso ? daysBetween(todayUtc(new Date(iso)), todayUtc(today)) : Infinity)
  const followUp = open.filter((c) => !c.representation_agreement_at || !c.info_guide_given_at || quietSince(c.last_contact_at) >= QUIET_DAYS).length
  const unpaid = f.commission.filter((c) => !c.stripe_transfer_id)
  return {
    clientsToFollowUp: followUp,
    activeClients: open.length,
    unsettled: unpaid.length ? { count: unpaid.length, amount: unpaid.reduce((s, c) => s + (Number(c.fee_amount) || 0), 0) } : null,
  }
}

export function statsFromFacts(role: AgentRole, f: AnyFacts, today = new Date()): Stats {
  if (role === 'tenant') return tenantStats(f as TenantFactsRaw, today)
  if (role === 'landlord') return landlordStats(f as LandlordFactsRaw, today)
  return agentStats(f as AgentFactsRaw, today)
}
