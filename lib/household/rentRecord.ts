// Recording rent from the AI conversation (2026-11-24): what the rent record card lists and what it
// ticks, as data. The periods are the tenancy page's own — the same schedule and the same ledger
// (lib/household/schedule.ts, lib/household/ledger.ts) the rent tab of /h/<id> draws — so the card
// can never offer a period the page would not, or hide one it shows. Pure.
import { checkPaidOn, ledgerStart, rentLedger, type LedgerRow } from './ledger'
import { rentSchedule } from './schedule'

export type RentRole = 'landlord' | 'tenant'

/** A household row, as far as the ledger needs it (public.households). */
export type RentHousehold = {
  id: string; address: string | null; unit: string | null; city?: string | null
  current_lease_id: string | null; next_lease_id?: string | null
  start_date: string | null; rent_due_day: number | null; monthly_rent: number | string | null
  status?: string | null
}
export type RentPaymentRow = LedgerRow & { lease_id: string | null }

/** A period nobody has recorded yet. `overdue`: its due date has passed. */
export type OpenPeriod = { due: string; amount: number; overdue: boolean }
export type RentTenancy = {
  id: string; leaseId: string
  address: string; unit: string | null; city: string | null
  /** the tenant's name as the lease has it — shown to the landlord to tell tenancies apart */
  tenant: string | null
  periods: OpenPeriod[]
}

/** Which member roles record rent in which conversation: a landlord's (or the property manager's) as landlord, a tenant's as tenant. */
export function memberRolesFor(role: RentRole): string[] {
  return role === 'landlord' ? ['landlord', 'property_manager'] : ['tenant']
}

/**
 * The periods of the running term that can be recorded now, oldest first — exactly the rows the
 * tenancy page's rent tab shows with 「标记已付」 (`canMarkPaid`): due or overdue with nothing recorded,
 * including a placeholder the e-sign flow wrote. Periods from a signed renewal's start belong to that lease.
 */
export function openPeriods(h: RentHousehold, leaseStart: string | null, nextStart: string | null, payments: LedgerRow[], now?: Date): OpenPeriod[] {
  const termStart = ledgerStart(h.start_date, leaseStart)
  const nextFrom = h.next_lease_id ? nextStart : null
  const schedule = rentSchedule(termStart, h.rent_due_day, now).filter((p) => !nextFrom || p.due < nextFrom)
  const ledger = rentLedger(schedule, payments, now)
  return ledger.periods
    .filter((p) => p.canMarkPaid)
    .map((p) => ({ due: p.due, amount: Number(p.record?.amount ?? h.monthly_rent) || 0, overdue: !p.upcoming }))
    .sort((a, b) => (a.due < b.due ? -1 : 1))
}

/** Tenancies with a running lease, each with its recordable periods. */
export function buildRentTenancies(
  households: RentHousehold[],
  leases: { id: string; start_date: string | null; tenant_name?: string | null }[],
  payments: RentPaymentRow[],
  now?: Date,
): RentTenancy[] {
  const lease = new Map(leases.map((l) => [l.id, l]))
  const out: RentTenancy[] = []
  for (const h of households) {
    if (!h.current_lease_id || (h.status && h.status !== 'active')) continue
    const cur = lease.get(h.current_lease_id)
    const next = h.next_lease_id ? lease.get(h.next_lease_id) : undefined
    out.push({
      id: h.id, leaseId: h.current_lease_id,
      address: (h.address ?? '').trim(), unit: h.unit ?? null, city: h.city ?? null,
      tenant: cur?.tenant_name?.trim() || null,
      periods: openPeriods(h, cur?.start_date ?? null, next?.start_date ?? null, payments.filter((p) => p.lease_id === h.current_lease_id), now),
    })
  }
  return out.sort((a, b) => a.address.localeCompare(b.address) || String(a.unit ?? '').localeCompare(String(b.unit ?? '')))
}

const norm = (s: string) => s.toLowerCase().replace(/\[test\]/g, ' ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()

/**
 * The tenancy the person meant: the one whose tenant's name, street or unit they wrote; otherwise the
 * only one with something to record; otherwise the first with something to record; otherwise the first.
 * It is a starting point — the card always lets them choose.
 */
export function pickTenancy(tenancies: RentTenancy[], said: string | null | undefined): number {
  if (!tenancies.length) return -1
  const text = ` ${norm(String(said ?? ''))} `
  const named = tenancies.map((t, i) => {
    const street = norm(t.address)
    const tenant = t.tenant ? norm(t.tenant) : ''
    let score = 0
    if (tenant.length >= 2 && text.includes(` ${tenant} `)) score += 3
    else if (tenant) for (const w of tenant.split(' ')) if (w.length >= 3 && text.includes(` ${w} `)) score += 1
    if (street.length >= 5 && text.includes(` ${street} `)) score += 3
    if (t.unit && /\d/.test(t.unit) && new RegExp(`(?:^|[^\\d])${t.unit.replace(/[^\dA-Za-z]/g, '')}(?:[^\\d]|$)`).test(text) && /unit|单元|#|号/.test(String(said ?? '').toLowerCase())) score += 1
    return { i, score }
  }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score)
  if (named.length && (named.length === 1 || named[0].score > named[1].score)) return named[0].i
  const withOpen = tenancies.map((t, i) => (t.periods.length ? i : -1)).filter((i) => i >= 0)
  return withOpen.length ? withOpen[0] : 0
}

/**
 * The periods to tick to start with: the one in the month the person named; with no month named, the
 * latest period already due (this month's, usually). Never a guess beyond that — an empty tick is a
 * question the person answers on the card.
 */
export function pickPeriods(periods: OpenPeriod[], month: string | null): string[] {
  if (month) return periods.filter((p) => p.due.slice(0, 7) === month).map((p) => p.due).slice(0, 1)
  const due = periods.filter((p) => p.overdue)
  return due.length ? [due[due.length - 1].due] : []
}

/** `88 Harbour St · 2305` */
export function tenancyLabel(t: Pick<RentTenancy, 'address' | 'unit'>): string {
  return t.unit ? `${t.address} · ${t.unit}` : t.address
}

/**
 * The payment date a ticked period starts with. Today — unless recording today would make it late:
 * then nothing, and the person says which day it was. A record cannot be taken back, and in a
 * conversation a pre-filled 「today」 on last month's rent is one tap from recording an on-time
 * payment as weeks late (more than seven days counts toward s.58). The tenancy page pre-fills today
 * and warns; the card asks instead.
 */
export function defaultPaidOn(due: string, today: string): string {
  const chk = checkPaidOn(due, today, today)
  return chk.ok && !chk.late ? today : ''
}

/** What recording `paidOn` for a period means, in the tenancy page's own words (app/h/[id]/page.tsx paidOnField). */
export function paidOnNote(due: string, paidOn: string, today: string, zh: boolean): { ok: boolean; late: boolean; text: string | null } {
  if (!paidOn) return { ok: false, late: false, text: null }
  const chk = checkPaidOn(due, paidOn, today)
  if (!chk.ok) return { ok: false, late: false, text: zh ? '付款日期不能晚于今天，也不能早于到期日 62 天以上。' : 'The payment date cannot be after today or more than 62 days before the due date.' }
  if (!chk.late) return { ok: true, late: false, text: null }
  return {
    ok: true, late: true,
    text: zh
      ? `将记为迟付 ${chk.daysLate} 天${chk.countsTowardS58 ? '（超过 7 天，计入 s.58 次数）' : ''} · 不是这天付的请改成实际日期`
      : `Will be recorded ${chk.daysLate} day(s) late${chk.countsTowardS58 ? ' (over 7 days — counts toward s.58)' : ''} · not paid that day? Change it to the actual date`,
  }
}
