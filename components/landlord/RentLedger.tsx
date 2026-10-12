'use client'

// The landlord's real rent ledger (four-role audit P1-2, 2026-10-12). Until now
// /landlord/finance was a design sample whose empty state promised a ledger
// that "starts itself" — nothing real was ever shown. The truth: rent periods
// live in `rent_payments`, one row per (lease, due_date), and a row only
// exists for a MANAGED tenancy (the e-sign flow writes the first period when a
// household is created; `mark_rent_paid` requires one). A lease with no
// household therefore has no ledger, and this block says so instead of hiding it.
//
// Data path: the tenancy list and the landlord's leases come from the one
// fact source (lib/facts/useFacts — `lifecycle_facts_landlord`), so the
// tenancies counted here are the ones the tiles and the rail count. The facts
// payload only carries OPEN rent rows (`rent`: due / late, for the counters)
// and the current month (`rent_month`); a ledger needs every period, so the
// rows themselves are read through the caller's own RLS client:
// households (for current / previous / next lease pointers) → rent_payments
// by lease id. Nothing is written here — "mark paid" lives on /h/<id>?tab=rent.
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { SectionCard, StatusPill, Table, Td, Tr, type PillTone } from '@/components/workspace'
import { isoDate, todayUtc } from '@/lib/dates'
import { useFacts, type LeaseRow } from '@/lib/facts/useFacts'
import { useT } from '@/lib/i18n'
import { useReportLiveRows } from '@/lib/liveRows'
import { isLeaseInForce, RENT_STATE_LABEL } from '@/lib/matters/states'
import { supabase } from '@/lib/supabase'

// ── Pure helpers (tested in tests/fourRoleAudit20261012_c.spec.ts) ──────────

export type LedgerRent = {
  id: string
  lease_id: string | null
  due_date: string
  status: string | null
  amount: number | string | null
  paid_at: string | null
  method?: string | null
}
export type LedgerHousehold = {
  id: string
  address: string | null
  unit: string | null
  city?: string | null
  current_lease_id: string | null
  previous_lease_id: string | null
  next_lease_id?: string | null
}
/** What a period IS today: a `due` row past its date is unpaid and overdue; `late` means received late. */
export type LedgerPeriodState = 'paid' | 'paid_late' | 'overdue' | 'due' | 'failed'
export type LedgerLine = LedgerRent & { household_id: string; address: string; unit: string | null; state: LedgerPeriodState }

export const LEDGER_STATE_LABEL: Record<LedgerPeriodState, { zh: string; en: string; tone: PillTone }> = {
  paid: { zh: RENT_STATE_LABEL.paid.zh, en: RENT_STATE_LABEL.paid.en, tone: 'ok' },
  paid_late: { zh: '已付 · 迟付', en: 'Paid late', tone: 'ok' },
  overdue: { zh: '逾期未付', en: 'Overdue', tone: 'danger' },
  due: { zh: RENT_STATE_LABEL.due.zh, en: RENT_STATE_LABEL.due.en, tone: 'pending' },
  failed: { zh: RENT_STATE_LABEL.failed.zh, en: RENT_STATE_LABEL.failed.en, tone: 'danger' },
}

/** `$2,500` — whole dollars unless there are cents. */
export function money(v: number | string | null | undefined): string {
  const n = typeof v === 'string' ? Number(v) : v
  if (n == null || !Number.isFinite(n)) return '—'
  const hasCents = Math.round(n * 100) % 100 !== 0
  return `$${n.toLocaleString('en-CA', { minimumFractionDigits: hasCents ? 2 : 0, maximumFractionDigits: 2 })}`
}

export function ledgerState(r: Pick<LedgerRent, 'status' | 'due_date'>, today: string): LedgerPeriodState {
  if (r.status === 'paid') return 'paid'
  if (r.status === 'late') return 'paid_late'
  if (r.status === 'failed') return 'failed'
  return r.due_date.slice(0, 10) < today ? 'overdue' : 'due'
}

/** Rent rows attributed to the tenancy whose current or previous lease they belong to, newest period first. */
export function buildLedgerLines(rents: LedgerRent[], households: LedgerHousehold[], today: string): LedgerLine[] {
  const byLease = new Map<string, LedgerHousehold>()
  for (const h of households) {
    if (h.current_lease_id) byLease.set(h.current_lease_id, h)
    if (h.previous_lease_id) byLease.set(h.previous_lease_id, h)
    if (h.next_lease_id) byLease.set(h.next_lease_id, h)
  }
  const lines: LedgerLine[] = []
  for (const r of rents) {
    const h = r.lease_id ? byLease.get(r.lease_id) : undefined
    if (!h || !r.due_date) continue
    lines.push({ ...r, household_id: h.id, address: h.address ?? '', unit: h.unit ?? null, state: ledgerState(r, today) })
  }
  return lines.sort((a, b) => (a.due_date < b.due_date ? 1 : a.due_date > b.due_date ? -1 : a.address.localeCompare(b.address)))
}

export type LedgerSummary = { month: { received: number; due: number; overdue: number }; year: { received: number } }

/** Sums by period (due_date): this month's received / still due / overdue, and this year's received. */
export function summarizeLedger(lines: Pick<LedgerLine, 'due_date' | 'state' | 'amount'>[], today: string): LedgerSummary {
  const month = today.slice(0, 7)
  const year = today.slice(0, 4)
  const amt = (v: LedgerLine['amount']) => { const n = typeof v === 'string' ? Number(v) : v; return n != null && Number.isFinite(n) ? n : 0 }
  const s: LedgerSummary = { month: { received: 0, due: 0, overdue: 0 }, year: { received: 0 } }
  for (const l of lines) {
    const received = l.state === 'paid' || l.state === 'paid_late'
    if (received && l.due_date.startsWith(year)) s.year.received += amt(l.amount)
    if (!l.due_date.startsWith(month)) continue
    if (received) s.month.received += amt(l.amount)
    else if (l.state === 'overdue') s.month.overdue += amt(l.amount)
    else if (l.state === 'due') s.month.due += amt(l.amount)
  }
  return s
}

/** In-force leases that no tenancy points at (current / previous / next): signed, started, but no ledger possible. */
export function leasesWithoutHousehold<L extends Pick<LeaseRow, 'id' | 'status' | 'start_date' | 'end_date'>>(leases: L[], households: Pick<LedgerHousehold, 'current_lease_id' | 'previous_lease_id' | 'next_lease_id'>[], today: Date): L[] {
  const linked = new Set<string>()
  for (const h of households) for (const id of [h.current_lease_id, h.previous_lease_id, h.next_lease_id]) if (id) linked.add(id)
  return leases.filter((l) => !linked.has(l.id) && isLeaseInForce(l, today))
}

/** Where an orphan lease is, from what the facts payload carries. */
export function leasePlaceLabel(l: Pick<LeaseRow, 'unit_label' | 'listing_place' | 'unit_place'>): string {
  const street = l.listing_place?.address || l.unit_place?.street || ''
  const unit = l.unit_label || ''
  if (!street) return unit
  if (!unit || street.includes(unit)) return street
  // A label like "1105 - 203 College St" already carries the street.
  if (unit.includes(street)) return unit
  return `${street} · ${unit}`
}

// ── Component ───────────────────────────────────────────────────────────────

type Loaded = { households: LedgerHousehold[]; rents: LedgerRent[] }

export default function RentLedger() {
  const { lang } = useT()
  const zh = lang === 'zh'
  const { facts } = useFacts('landlord')
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const hhIds = facts ? facts.households.map((h) => h.id).sort().join(',') : null

  useEffect(() => {
    if (hhIds == null) return
    let cancelled = false
    const ids = hhIds ? hhIds.split(',') : []
    ;(async () => {
      if (ids.length === 0) { if (!cancelled) setLoaded({ households: [], rents: [] }); return }
      const { data: hh } = await supabase
        .from('households')
        .select('id, address, unit, city, current_lease_id, previous_lease_id, next_lease_id')
        .in('id', ids)
      const households = ((hh as LedgerHousehold[] | null) ?? [])
      const leaseIds = Array.from(new Set(households.flatMap((h) => [h.current_lease_id, h.previous_lease_id, h.next_lease_id]).filter((x): x is string => !!x)))
      const { data: rp } = leaseIds.length
        ? await supabase
            .from('rent_payments')
            .select('id, lease_id, due_date, status, amount, paid_at, method')
            .in('lease_id', leaseIds)
            .order('due_date', { ascending: false })
            .limit(600)
        : { data: [] as LedgerRent[] }
      if (!cancelled) setLoaded({ households, rents: ((rp as LedgerRent[] | null) ?? []) })
    })().catch(() => { if (!cancelled) setLoaded({ households: [], rents: [] }) })
    return () => { cancelled = true }
  }, [hhIds])

  const today = todayUtc()
  const todayIso = isoDate(today)
  const lines = loaded ? buildLedgerLines(loaded.rents, loaded.households, todayIso) : null
  const orphans = facts && loaded ? leasesWithoutHousehold(facts.leases, loaded.households, today) : null
  const count = lines && orphans ? lines.length + orphans.length : null
  useReportLiveRows('rent-ledger', count)
  if (!lines || !orphans || count === 0) return null
  const sum = summarizeLedger(lines, todayIso)
  const L = (s: LedgerPeriodState) => (zh ? LEDGER_STATE_LABEL[s].zh : LEDGER_STATE_LABEL[s].en)
  const monthLabel = zh ? `${Number(todayIso.slice(5, 7))} 月` : today.toLocaleString('en-CA', { month: 'short', timeZone: 'UTC' })

  return (
    <div className="mb-6" data-testid="rent-ledger">
      <div className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-body-3">{zh ? '租金台账 · 真实记录' : 'RENT LEDGER · LIVE'}</div>

      {lines.length > 0 && (
        <>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4" data-testid="rent-ledger-summary">
            {([
              [zh ? `${monthLabel}到账` : `${monthLabel} received`, sum.month.received, 'text-[#047857]'],
              [zh ? `${monthLabel}待付` : `${monthLabel} due`, sum.month.due, ''],
              [zh ? `${monthLabel}逾期` : `${monthLabel} overdue`, sum.month.overdue, sum.month.overdue > 0 ? 'text-danger' : ''],
              [zh ? '今年到账' : 'Received this year', sum.year.received, ''],
            ] as const).map(([label, v, cls]) => (
              <div key={label} className="rounded-xl border border-line-divider bg-white px-3 py-2">
                <div className={`font-mono text-[18px] font-extrabold leading-none [font-variant-numeric:tabular-nums] ${cls}`}>{money(v)}</div>
                <div className="mt-1 text-[11px] text-body-3">{label}</div>
              </div>
            ))}
          </div>

          <SectionCard
            className="mt-3"
            padded={false}
            title={zh ? '租金账期 · 全部在管租约' : 'Rent periods · all managed tenancies'}
            meta={zh ? `${lines.length} 期 · 按账期从新到旧` : `${lines.length} periods · newest first`}
          >
            <Table head={[zh ? '房源' : 'Property', zh ? '账期' : 'Period', zh ? '应付' : 'Amount', zh ? '状态' : 'Status', zh ? '付款日' : 'Paid on']}>
              {lines.map((r) => (
                <Tr key={r.id}>
                  <Td>
                    <Link href={`/h/${r.household_id}?tab=rent`} className="text-[13px] font-semibold hover:text-brand">
                      {r.address}{r.unit ? ` #${r.unit}` : ''}
                    </Link>
                  </Td>
                  <Td align="right" mono>{r.due_date.slice(0, 7)}</Td>
                  <Td align="right" mono strong>{money(r.amount)}</Td>
                  <Td align="right"><StatusPill tone={LEDGER_STATE_LABEL[r.state].tone}>{L(r.state)}</StatusPill></Td>
                  <Td align="right" mono muted>{r.paid_at ? r.paid_at.slice(0, 10) : '—'}</Td>
                </Tr>
              ))}
            </Table>
          </SectionCard>
          <p className="mt-2 text-[11px] text-body-3">
            {zh
              ? '只记录，不经手资金：每期由你或租客在在管租约页「标记已付」。到账 = 已付（含迟付）的账期合计；逾期 = 账期已过仍未记录的。'
              : 'Records only, no money handled: each period is marked paid by you or the tenant on the tenancy page. Received = paid periods (incl. late); overdue = past periods with no record.'}
          </p>
        </>
      )}

      {orphans.length > 0 && (
        <SectionCard
          className="mt-3"
          padded={false}
          title={zh ? '没有在管租约 · 没有台账' : 'No managed tenancy · no ledger'}
          meta={zh ? `${orphans.length} 份生效中的租约` : `${orphans.length} lease${orphans.length > 1 ? 's' : ''} in force`}
        >
          <div className="divide-y divide-line-divider" data-testid="rent-ledger-orphans">
            {orphans.map((l) => (
              <div key={l.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 px-4 py-2.5 text-[13px]">
                <div className="min-w-0 flex-1 basis-[200px]">
                  <div className="break-words font-semibold">{leasePlaceLabel(l) || (zh ? '（租约未写地址）' : '(no address on the lease)')}</div>
                  <div className="mt-0.5 text-[12px] text-body-3">
                    {l.tenant_name ? `${l.tenant_name} · ` : ''}{l.start_date ?? '?'} → {l.end_date ?? '?'}{l.monthly_rent != null ? ` · ${money(l.monthly_rent)}${zh ? '/月' : '/mo'}` : ''}
                  </div>
                </div>
                <div className="flex flex-none items-center gap-3 text-[12.5px] font-semibold">
                  <Link href={`/landlord/leases/${l.id}`} className="text-body-2 hover:text-brand">{zh ? '租约 →' : 'Lease →'}</Link>
                  <Link href="/leases/import" className="text-brand-strong">{zh ? '邀请租客加入 →' : 'Invite the tenant →'}</Link>
                </div>
              </div>
            ))}
          </div>
          <p className="border-t border-line-divider px-4 py-2.5 text-[11.5px] text-body-3">
            {zh
              ? '台账只来自在管租约：导入这份租约并邀请租客，租客接受后每期租金才会出现在这里。'
              : 'The ledger only comes from managed tenancies: import this lease and invite the tenant — periods appear here once they accept.'}
          </p>
        </SectionCard>
      )}
    </div>
  )
}
