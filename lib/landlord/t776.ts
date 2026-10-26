// CRA Form T776 (Statement of Real Estate Rentals) — the year's figures from
// Stayloop's own records (2026-10-27 · report review batch 2; design/ai-rebuild-
// report-review-2026-10-25.md §"会计"). Pure and deterministic:
//   • line 8141 gross rents = rent periods RECORDED as received in the year
//     (rent_payments paid / late with a paid_at date), per property
//   • line 8960 repairs and maintenance = work orders completed in the year with
//     an amount on record (invoice, else approved, else quote), per property
//   • every other T776 line is listed EMPTY with "no record here": insurance,
//     taxes, interest, utilities and the rest never pass through Stayloop, so
//     the landlord fills them from their own papers. Nothing is estimated.
// Not tax advice; the official form and guide (T4036) govern.
import { torontoDate } from '@/lib/household/ledger'

export type T776Line = { line: string; zh: string; en: string; source?: 'rent' | 'work_orders' }
export const T776_LINES: T776Line[] = [
  { line: '8141', zh: '租金总收入', en: 'Gross rents', source: 'rent' },
  { line: '8521', zh: '广告', en: 'Advertising' },
  { line: '8690', zh: '保险', en: 'Insurance' },
  { line: '8710', zh: '利息与银行费用', en: 'Interest and bank charges' },
  { line: '8810', zh: '办公费用', en: 'Office expenses' },
  { line: '8860', zh: '专业费用（法律、会计）', en: 'Professional fees (legal, accounting)' },
  { line: '8871', zh: '管理与行政费', en: 'Management and administration fees' },
  { line: '8960', zh: '维修与保养', en: 'Repairs and maintenance', source: 'work_orders' },
  { line: '9060', zh: '薪金、工资与福利', en: 'Salaries, wages and benefits' },
  { line: '9180', zh: '地税', en: 'Property taxes' },
  { line: '9200', zh: '差旅', en: 'Travel' },
  { line: '9220', zh: '水电气', en: 'Utilities' },
  { line: '9281', zh: '机动车费用', en: 'Motor vehicle expenses' },
  { line: '9270', zh: '其他费用', en: 'Other expenses' },
]
export const T776_GUIDE_URL = 'https://www.canada.ca/en/revenue-agency/services/forms-publications/forms/t776.html'

export type T776Lease = { id: string; unit_label: string | null; household: { address: string; unit: string | null } | null }
export type T776Rent = { lease_id: string | null; amount: number | string | null; status: string | null; paid_at: string | null }
export type T776WorkOrder = { household_id: string | null; lease_id?: string | null; status: string; invoice_amount: number | string | null; approved_amount: number | string | null; quote_amount: number | string | null; completed_at: string | null }
export type T776Property = { key: string; label: string; gross_rents: number; rent_count: number; repairs: number; repair_count: number }
export type T776Summary = { year: number; properties: T776Property[]; totals: { gross_rents: number; rent_count: number; repairs: number; repair_count: number }; unplaced_repairs: number }

const num = (v: unknown): number => { const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN; return Number.isFinite(n) ? n : 0 }
// A landlord's year is the Toronto year: a receipt recorded at 21:00 on Dec 31 (02:00Z next day) stays in it (review 2026-10-27).
const inYear = (iso: string | null | undefined, year: number) => { if (!iso) return false; try { return torontoDate(iso).slice(0, 4) === String(year) } catch { return false } }
export const propertyLabel = (l: T776Lease): string => (l.household ? `${l.household.address}${l.household.unit ? ` #${l.household.unit}` : ''}` : (l.unit_label || '').trim() || '—')

/** Amount a completed work order puts on line 8960: what was invoiced, else approved, else quoted. */
export function workOrderAmount(w: Pick<T776WorkOrder, 'invoice_amount' | 'approved_amount' | 'quote_amount'>): number {
  const inv = num(w.invoice_amount); if (inv > 0) return inv
  const app = num(w.approved_amount); if (app > 0) return app
  return num(w.quote_amount)
}

export function summarizeT776(input: { year: number; leases: T776Lease[]; rents: T776Rent[]; workOrders: T776WorkOrder[]; householdOfLease?: Record<string, string> }): T776Summary {
  const { year } = input
  const props = new Map<string, T776Property>()
  const propOfLease = new Map<string, string>()
  const propOfHousehold = new Map<string, string>()
  const ensure = (key: string, label: string) => { if (!props.has(key)) props.set(key, { key, label, gross_rents: 0, rent_count: 0, repairs: 0, repair_count: 0 }); return props.get(key)! }
  for (const l of input.leases) {
    const label = propertyLabel(l)
    const key = label.toLowerCase()
    ensure(key, label)
    propOfLease.set(l.id, key)
    const hid = input.householdOfLease?.[l.id]
    if (hid) propOfHousehold.set(hid, key)
  }
  for (const r of input.rents) {
    if (!r.lease_id || !(r.status === 'paid' || r.status === 'late') || !inYear(r.paid_at, year)) continue
    const key = propOfLease.get(r.lease_id); if (!key) continue
    const p = props.get(key)!; p.gross_rents += num(r.amount); p.rent_count += 1
  }
  let unplaced = 0
  for (const w of input.workOrders) {
    if (!inYear(w.completed_at, year)) continue
    const amt = workOrderAmount(w); if (amt <= 0) continue
    const key = (w.household_id && propOfHousehold.get(w.household_id)) || (w.lease_id ? propOfLease.get(w.lease_id) : undefined)
    if (!key) { unplaced += amt; continue }
    const p = props.get(key)!; p.repairs += amt; p.repair_count += 1
  }
  const properties = [...props.values()].sort((a, b) => a.label.localeCompare(b.label))
  const totals = properties.reduce((t, p) => ({ gross_rents: t.gross_rents + p.gross_rents, rent_count: t.rent_count + p.rent_count, repairs: t.repairs + p.repairs, repair_count: t.repair_count + p.repair_count }), { gross_rents: 0, rent_count: 0, repairs: 0, repair_count: 0 })
  return { year, properties, totals, unplaced_repairs: Math.round(unplaced * 100) / 100 }
}

const csvCell = (v: string | number) => { const s = String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }

/** One row per property × T776 line (empty lines included, amount blank), then totals. */
export function t776Csv(s: T776Summary, lang: 'zh' | 'en'): string {
  const zh = lang === 'zh'
  const head = [zh ? '物业' : 'Property', zh ? 'T776 行' : 'T776 line', zh ? '项目' : 'Item', zh ? '金额' : 'Amount', zh ? '笔数' : 'Count', zh ? '来源' : 'Source']
  const rows: (string | number)[][] = [head]
  const src = { rent: zh ? 'Stayloop 记录的租金' : 'Rent recorded in Stayloop', work_orders: zh ? 'Stayloop 完工工单' : 'Work orders completed in Stayloop', none: zh ? '这里没有记录' : 'No record here' }
  for (const p of s.properties) {
    for (const l of T776_LINES) {
      const amount = l.source === 'rent' ? p.gross_rents : l.source === 'work_orders' ? p.repairs : ''
      const count = l.source === 'rent' ? p.rent_count : l.source === 'work_orders' ? p.repair_count : ''
      rows.push([p.label, l.line, zh ? l.zh : l.en, amount === '' ? '' : amount.toFixed(2), count, l.source ? src[l.source] : src.none])
    }
  }
  rows.push([zh ? '合计' : 'Total', '8141', zh ? '租金总收入' : 'Gross rents', s.totals.gross_rents.toFixed(2), s.totals.rent_count, src.rent])
  rows.push([zh ? '合计' : 'Total', '8960', zh ? '维修与保养' : 'Repairs and maintenance', s.totals.repairs.toFixed(2), s.totals.repair_count, src.work_orders])
  return '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n'
}
