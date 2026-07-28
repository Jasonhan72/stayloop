// Landlord demo/canon finance fixtures.
//
// These rows used to live inline in app/landlord/finance/page.tsx. The
// maintenance page now shows the same repair spend (a repair ticket and its
// cost are the same event seen from two sides), so the data lives here once
// instead of being copy-pasted into both pages.
//
// Layout/presentation only — no product behaviour depends on this module.

/** CRA Schedule 776 (Statement of Real Estate Rentals) expense grouping. */
export type Cra776Key = 'repairs' | 'admin' | 'professional'

export const CRA776_LABEL: Record<Cra776Key, { zh: string; en: string }> = {
  repairs: { zh: '维修与保养', en: 'Repairs & maintenance' },
  admin: { zh: '管理与行政', en: 'Management & administration' },
  professional: { zh: '专业服务', en: 'Professional fees' },
}

export type LandlordExpense = {
  date: string
  desc: { zh: string; en: string }
  amount: number
  /** Schedule 776 line this expense is grouped under. */
  cra776: Cra776Key
  /** Contractor, when the work was outsourced. */
  vendor?: string
  /** Maintenance ticket this spend settles, when there is one. */
  ticket?: string
  /** Surfaced on the maintenance page's repair-spend table. */
  recent?: boolean
}

export const EXPENSES: LandlordExpense[] = [
  {
    date: '5/2',
    desc: { zh: 'Unit 1207 · 洗碗机维修', en: 'Unit 1207 · dishwasher repair' },
    amount: 280,
    cra776: 'repairs',
    vendor: 'GE Repair',
    ticket: 'M-110',
    recent: true,
  },
  {
    date: '4/22',
    desc: { zh: 'Unit 1207 · 物业管理费', en: 'Unit 1207 · property management fee' },
    amount: 645,
    cra776: 'admin',
    recent: true,
  },
  {
    date: '4/15',
    desc: { zh: '432 Brunswick · 屋顶检查', en: '432 Brunswick · roof inspection' },
    amount: 420,
    cra776: 'professional',
  },
  {
    date: '4/3',
    desc: { zh: 'Liberty Village 2B · 空调清洗', en: 'Liberty Village 2B · AC cleaning' },
    amount: 180,
    cra776: 'repairs',
  },
]

/** Per-776-line subtotals, in the order the categories are declared. */
export function cra776Subtotals(rows: LandlordExpense[] = EXPENSES): { key: Cra776Key; total: number }[] {
  return (Object.keys(CRA776_LABEL) as Cra776Key[])
    .map((key) => ({ key, total: rows.filter((r) => r.cra776 === key).reduce((s, r) => s + r.amount, 0) }))
    .filter((c) => c.total > 0)
}

/** The repair spend surfaced next to the maintenance queue. */
export const MAINTENANCE_SPEND = EXPENSES.filter((e) => e.recent)

/** Footer totals on the maintenance repair-spend table. */
export const REPAIR_SPEND_TOTALS = {
  month: cra776Subtotals().find((c) => c.key === 'repairs')?.total ?? 0,
  year: EXPENSES.reduce((s, e) => s + e.amount, 0),
}

/** Per-property year-to-date P&L (finance page). */
export type PropertyPnl = {
  name: string
  tenant: { zh: string; en: string }
  rent: number
  expense: number
  /** Days vacant YTD; null when the unit has not been occupied yet. */
  vacantDays: number | null
  vacancyNote?: { zh: string; en: string }
}

export const PROPERTY_PNL: PropertyPnl[] = [
  {
    name: 'Unit 1207 · King West',
    tenant: { zh: 'Mia Chen', en: 'Mia Chen' },
    rent: 14000,
    expense: 925,
    vacantDays: 0,
  },
  {
    name: 'Liberty Village 2B',
    tenant: { zh: 'Thompson', en: 'Thompson' },
    rent: 16000,
    expense: 460,
    vacantDays: 0,
  },
  {
    name: '432 Brunswick Ave',
    tenant: { zh: 'Anna L.（待入住）', en: 'Anna L. (moving in)' },
    rent: 0,
    expense: 420,
    vacantDays: null,
    vacancyNote: { zh: '待入住', en: 'Moving in' },
  },
]

/** Recurring-issue hotspots by property (maintenance page). */
// Repair spend per property is DERIVED from EXPENSES (repairs line only) so it
// can never drift from the ledger — the hand-written totals used to double-count
// the same $280 dishwasher against two properties.
const repairSpendFor = (property: string) =>
  EXPENSES.filter((e) => e.cra776 === 'repairs' && e.desc.en.startsWith(property.split(' ·')[0]))
    .reduce((sum, e) => sum + e.amount, 0)

export const REPAIR_HOTSPOTS = [
  {
    property: 'Unit 1207 · King West',
    tickets: 3,
    categories: { zh: '水电 / 电器', en: 'Plumbing / appliance' },
    total: repairSpendFor('Unit 1207'),
  },
  {
    property: 'Liberty Village 2B',
    tickets: 4,
    categories: { zh: 'HVAC / 电器', en: 'HVAC / appliance' },
    total: repairSpendFor('Liberty Village 2B'),
  },
]
