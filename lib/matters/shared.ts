// Rental matters · pure helpers (节点 5, 2026-09-27). A matter is the one id
// that follows a tenancy from application to move-out: listing → application
// (→ screening) → lease → managed tenancy (→ work orders, threads, files).
// The database keeps `rental_matters` + `rental_matter_links`; this module
// turns a summary row into a stage and a human line. No scores here, ever.

export type MatterStage = 'applied' | 'screened' | 'decided' | 'lease_sent' | 'signed' | 'active' | 'ended'
export type MatterSummary = {
  id: string
  address: string | null
  unit: string | null
  landlord_auth_id: string
  tenant_auth_id: string | null
  tenant_email: string | null
  listing_id: string | null
  application: { id: string; status: string | null; created_at: string; decision_notified_at: string | null } | null
  screening: { id: string; status: string | null } | null
  lease: { id: string; status: string | null; start_date: string | null; end_date: string | null; sent_at: string | null; signed_at: string | null } | null
  household: { id: string; verified: boolean | null; status: string | null } | null
  work_orders: { open: number; total: number }
  threads: number
  delegation: { id: string; delegate_name: string | null; scope: string[]; expires_at: string } | null
  created_at: string
}

export const STAGE_LABEL: Record<MatterStage, { zh: string; en: string }> = {
  applied: { zh: '已申请', en: 'Applied' },
  screened: { zh: '已筛查', en: 'Screened' },
  decided: { zh: '已决定', en: 'Decided' },
  lease_sent: { zh: '租约待签', en: 'Lease sent' },
  signed: { zh: '已签约', en: 'Signed' },
  active: { zh: '在管租约', en: 'Managed tenancy' },
  ended: { zh: '已结束', en: 'Ended' },
}
export const STAGE_ORDER: MatterStage[] = ['applied', 'screened', 'decided', 'lease_sent', 'signed', 'active', 'ended']

/** The furthest point the chain has reached (states, not scores). */
export function matterStage(m: MatterSummary, today = new Date()): MatterStage {
  const t = today.toISOString().slice(0, 10)
  if (m.household) return m.household.status === 'ended' || (m.lease?.end_date && m.lease.end_date < t) ? 'ended' : 'active'
  if (m.lease) {
    if (m.lease.status === 'ended' || (m.lease.end_date && m.lease.end_date < t)) return 'ended'
    if (m.lease.status === 'signed_both' || m.lease.status === 'active' || m.lease.status === 'imported') return 'signed'
    if (m.lease.status === 'sent' || m.lease.status === 'signed_tenant') return 'lease_sent'
    return 'decided'
  }
  if (m.application?.decision_notified_at || (m.application?.status && ['approved', 'declined'].includes(m.application.status))) return 'decided'
  if (m.screening) return 'screened'
  return 'applied'
}

export function matterTitle(m: Pick<MatterSummary, 'address' | 'unit'>): string {
  return [m.address, m.unit ? `#${m.unit}` : null].filter(Boolean).join(' ') || '—'
}

/** Where each party opens the matter's parts. */
export function matterLinks(m: MatterSummary, viewer: 'tenant' | 'landlord' | 'agent'): { key: string; zh: string; en: string; href: string }[] {
  const out: { key: string; zh: string; en: string; href: string }[] = []
  if (m.application) out.push({ key: 'application', zh: '申请', en: 'Application', href: viewer === 'tenant' ? `/tenant/applications/${m.application.id}` : `/landlord/applicants/${m.application.id}` })
  if (m.screening && viewer !== 'tenant') out.push({ key: 'screening', zh: '筛查', en: 'Screening', href: `/screening/app?screening=${m.screening.id}` })
  if (m.lease) out.push({ key: 'lease', zh: '租约', en: 'Lease', href: viewer === 'tenant' ? '/tenant/lease' : '/landlord/leases' })
  if (m.household) {
    out.push({ key: 'household', zh: '在管租约', en: 'Tenancy', href: `/h/${m.household.id}` })
    out.push({ key: 'maintenance', zh: `报修 · ${m.work_orders.open} 开放 / ${m.work_orders.total}`, en: `Repairs · ${m.work_orders.open} open / ${m.work_orders.total}`, href: `/h/${m.household.id}?tab=maintenance` })
  }
  return out
}
