// Pure view helpers for the provider workbench and history pages (节点 3
// 2026-09-26). Kept out of the page modules because Next.js only allows the
// known exports from a page.tsx; the guard spec imports them from here.
import { slaState } from './sla'
import type { WorkOrderStatus } from './workOrders'

export type TileRow = { status: WorkOrderStatus; quote_due_at?: string | null; invoice_amount?: string | number | null; approved_amount?: number | null; paid_at?: string | null }
const IN_PROGRESS: WorkOrderStatus[] = ['scheduled', 'in_progress', 'rework']
const AWAITING_ACCEPT: WorkOrderStatus[] = ['completed', 'disputed']
export const PROVIDER_GROUPS = { IN_PROGRESS, AWAITING_ACCEPT }

/** The six workbench tiles (报告 7): counts and money from the provider's own rows. */
export function buildProviderTiles(rows: TileRow[], reviews: { overall: number }[], now = new Date()) {
  const invites = rows.filter((r) => r.status === 'offered')
  const urgent = invites.filter((r) => { const s = slaState(r.quote_due_at, now); return s && s.kind !== 'due' }).length
  const quoted = rows.filter((r) => r.status === 'quoted')
  const active = rows.filter((r) => IN_PROGRESS.includes(r.status))
  const awaiting = rows.filter((r) => AWAITING_ACCEPT.includes(r.status))
  const settle = rows.filter((r) => r.status === 'accepted')
  const settleSum = settle.reduce((s, r) => s + (Number(r.invoice_amount) || Number(r.approved_amount) || 0), 0)
  const year = now.getUTCFullYear()
  const paid = rows.filter((r) => (r.status === 'paid' || r.status === 'closed') && r.paid_at && r.paid_at.startsWith(String(year)))
  const paidSum = paid.reduce((s, r) => s + (Number(r.invoice_amount) || 0), 0)
  const avg = reviews.length ? Math.round((reviews.reduce((s, r) => s + Number(r.overall), 0) / reviews.length) * 10) / 10 : null
  return { invites: invites.length, urgent, quoted: quoted.length, active: active.length, awaiting: awaiting.length, settle: settle.length, settleSum, paid: paid.length, paidSum, avg, reviews: reviews.length }
}

/** Offline settlement record: paid jobs grouped by the month the landlord marked them paid, newest first. */
export function settlementByMonth(rows: { status: WorkOrderStatus; paid_at: string | null; invoice_amount: string | number | null }[]): { month: string; count: number; total: number }[] {
  const m = new Map<string, { count: number; total: number }>()
  for (const r of rows) {
    if (!r.paid_at || !(r.status === 'paid' || r.status === 'closed')) continue
    const k = r.paid_at.slice(0, 7)
    const cur = m.get(k) ?? { count: 0, total: 0 }
    m.set(k, { count: cur.count + 1, total: cur.total + (Number(r.invoice_amount) || 0) })
  }
  return Array.from(m.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1)).map(([month, v]) => ({ month, ...v }))
}
