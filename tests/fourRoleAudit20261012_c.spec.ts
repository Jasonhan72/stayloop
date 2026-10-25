// 2026-10-12 · four-role audit, P1-2: /landlord/finance had no real data — a pure design
// sample whose empty state promised a ledger that "starts itself". Now a liveSlot
// (components/landlord/RentLedger.tsx) lists the landlord's real rent periods across
// managed tenancies, and the empty-state copy tells the truth about where a ledger comes from.
import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'

// The component module pulls in the browser Supabase client (createClient('') throws in
// node) and next/link; neither is exercised by the pure helpers under test.
vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn(), auth: {} }, getSupabaseBrowser: () => ({}) }))
vi.mock('@/lib/useAuth', () => ({ useAuth: () => ({ loading: true, user: null }) }))
vi.mock('next/link', () => ({ default: () => null }))

import {
  buildLedgerLines,
  leasePlaceLabel,
  leasesWithoutHousehold,
  ledgerState,
  money,
  summarizeLedger,
  type LedgerHousehold,
  type LedgerRent,
} from '../components/landlord/RentLedger'

const read = (p: string) => readFileSync(p, 'utf8')
const TODAY = '2026-10-12'
const HH: LedgerHousehold[] = [
  { id: 'hh-1', address: '100 Test Ave', unit: '1', city: 'Toronto', current_lease_id: 'lease-cur', previous_lease_id: 'lease-prev', next_lease_id: null },
  { id: 'hh-2', address: '28 Avondale Ave', unit: null, city: 'Toronto', current_lease_id: 'lease-b', previous_lease_id: null, next_lease_id: 'lease-b-renewal' },
]
const RENT: LedgerRent[] = [
  { id: 'r1', lease_id: 'lease-cur', due_date: '2026-10-01', status: 'paid', amount: '2500.00', paid_at: '2026-10-01T15:00:00Z', method: 'e-transfer' },
  { id: 'r2', lease_id: 'lease-cur', due_date: '2026-11-01', status: 'due', amount: 2500, paid_at: null, method: null },
  { id: 'r3', lease_id: 'lease-prev', due_date: '2026-09-01', status: 'late', amount: 2400, paid_at: '2026-09-09T12:00:00Z', method: null },
  { id: 'r4', lease_id: 'lease-b', due_date: '2026-10-01', status: 'due', amount: 1800, paid_at: null, method: null },
  { id: 'r5', lease_id: 'lease-b', due_date: '2026-10-12', status: 'due', amount: 50, paid_at: null, method: null },
  { id: 'r6', lease_id: 'lease-b', due_date: '2025-12-01', status: 'paid', amount: 1800, paid_at: '2025-12-01T12:00:00Z', method: null },
  { id: 'orphan', lease_id: 'lease-nobody', due_date: '2026-10-01', status: 'paid', amount: 999, paid_at: null, method: null },
]

describe('rent ledger · pure helpers', () => {
  it('formats money as $2,500 (cents only when present)', () => {
    expect(money(2500)).toBe('$2,500')
    expect(money('2500.00')).toBe('$2,500')
    expect(money(2853.2)).toBe('$2,853.20')
    expect(money(null)).toBe('—')
    expect(money('abc')).toBe('—')
  })

  it('derives the period state: paid / paid late / overdue (due row past its date) / due / failed', () => {
    expect(ledgerState({ status: 'paid', due_date: '2026-10-01' }, TODAY)).toBe('paid')
    expect(ledgerState({ status: 'late', due_date: '2026-09-01' }, TODAY)).toBe('paid_late')
    expect(ledgerState({ status: 'due', due_date: '2026-10-01' }, TODAY)).toBe('overdue')
    expect(ledgerState({ status: 'due', due_date: '2026-10-12' }, TODAY)).toBe('due')
    expect(ledgerState({ status: 'due', due_date: '2026-11-01' }, TODAY)).toBe('due')
    expect(ledgerState({ status: 'failed', due_date: '2026-10-01' }, TODAY)).toBe('failed')
    expect(ledgerState({ status: null, due_date: '2026-11-01' }, TODAY)).toBe('due')
  })

  it('attributes rows to the tenancy by current, previous or next lease; drops rows of leases no tenancy points at; newest first', () => {
    const lines = buildLedgerLines(RENT, HH, TODAY)
    expect(lines.map((l) => l.id)).toEqual(['r2', 'r5', 'r1', 'r4', 'r3', 'r6'])
    expect(lines.find((l) => l.id === 'r3')).toMatchObject({ household_id: 'hh-1', address: '100 Test Ave', unit: '1', state: 'paid_late' })
    expect(lines.find((l) => l.id === 'r4')).toMatchObject({ household_id: 'hh-2', unit: null, state: 'overdue' })
    expect(lines.some((l) => l.id === 'orphan')).toBe(false)
  })

  it('sums this month (received / due / overdue) and this year (received) by period', () => {
    const s = summarizeLedger(buildLedgerLines(RENT, HH, TODAY), TODAY)
    expect(s.month).toEqual({ received: 2500, due: 50, overdue: 1800 })
    // r1 (Oct, paid) + r3 (Sep, paid late); r6 is 2025 and r2 is not received.
    expect(s.year.received).toBe(4900)
  })

  it('lists in-force leases that no tenancy points at (a renewal waiting in next_lease_id is NOT an orphan)', () => {
    const today = new Date('2026-10-12T12:00:00Z')
    const leases = [
      { id: 'lease-cur', status: 'active', start_date: '2026-01-01', end_date: '2026-12-31', unit_label: '1' },
      { id: 'lease-b-renewal', status: 'signed_both', start_date: '2027-01-01', end_date: '2027-12-31', unit_label: null },
      { id: 'L-DF4C', status: 'active', start_date: '2026-09-01', end_date: '2027-08-31', unit_label: 'Unit 4', listing_place: { address: '12 Maple St' } },
      { id: 'L-upcoming', status: 'imported', start_date: '2026-11-01', end_date: '2027-10-31', unit_label: null },
      { id: 'L-draft', status: 'draft', start_date: '2026-01-01', end_date: '2026-12-31', unit_label: null },
      { id: 'L-ended', status: 'active', start_date: '2025-01-01', end_date: '2025-12-31', unit_label: null },
    ]
    const orphans = leasesWithoutHousehold(leases, HH, today)
    expect(orphans.map((l) => l.id)).toEqual(['L-DF4C'])
    expect(leasePlaceLabel(orphans[0])).toBe('12 Maple St · Unit 4')
    expect(leasePlaceLabel({ unit_label: '1105 - 203 College St', listing_place: null, unit_place: { street: '203 College St' } })).toBe('1105 - 203 College St')
    expect(leasePlaceLabel({ unit_label: null, listing_place: null, unit_place: null })).toBe('')
  })
})

describe('rent ledger · wiring', () => {
  const ledger = read('components/landlord/RentLedger.tsx')
  const page = read('app/landlord/finance/page.tsx')
  const shell = read('components/WorkspaceShell.tsx')

  it('is mounted on /landlord/finance as the liveSlot AND inline (demo mode), like the maintenance board', () => {
    expect(page).toContain("import RentLedger from '@/components/landlord/RentLedger'")
    expect(page).toContain('liveSlot={<><RentLedger /><LiveTaxBlock zh={zh} /></>}' /* 2026-10-27: the T776 export rides beside the real ledger */)
    expect(page).toMatch(/liveSlot=\{<><RentLedger \/><LiveTaxBlock zh=\{zh\} \/><\/>\}>\s*<RentLedger \/>/)
  })

  it('reads tenancies and leases from the one facts source, rent rows through the caller RLS client, and never writes', () => {
    expect(ledger).toContain("useFacts('landlord')")
    expect(ledger).toContain("from('households')")
    expect(ledger).toContain("select('id, address, unit, city, current_lease_id, previous_lease_id, next_lease_id, start_date, rent_due_day, monthly_rent')")
    expect(ledger).toContain("from('rent_payments')")
    expect(ledger).toContain("select('id, lease_id, due_date, status, amount, paid_at, method')")
    expect(ledger).not.toMatch(/\.(insert|update|upsert|delete|rpc)\(/)
    expect(ledger).not.toContain('service_role')
  })

  it('reports its row count to the shell and renders nothing when there is nothing real', () => {
    expect(ledger).toContain("useReportLiveRows('rent-ledger', count)")
    expect(ledger).toContain('if (!lines || !orphans || count === 0) return null')
  })

  it('shows the four summary tiles, the period table and the no-tenancy section with the import / invite path', () => {
    expect(ledger).toContain('data-testid="rent-ledger-summary"')
    expect(ledger).toContain("zh ? '今年到账' : 'Received this year'")
    for (const h of ["zh ? '房源' : 'Property'", "zh ? '账期' : 'Period'", "zh ? '应付' : 'Amount'", "zh ? '状态' : 'Status'", "zh ? '付款日' : 'Paid on'"]) expect(ledger).toContain(h)
    expect(ledger).toContain("title={zh ? '没有在管租约 · 没有台账' : 'No managed tenancy · no ledger'}")
    expect(ledger).toContain('href="/leases/import"')
    expect(ledger).toContain('台账只来自在管租约')
    // Period links open the tenancy rent tab, where "mark paid" lives.
    expect(ledger).toContain('href={`/h/${r.household_id}?tab=rent`}')
    // The assistant is never called「助手」; this block has no assistant copy at all.
    expect(ledger).not.toMatch(/助手|管家/)
  })

  it('the finance empty state tells the truth: the ledger comes from managed tenancies, not from importing a file', () => {
    expect(shell).toContain("'/landlord/finance': {")
    expect(shell).toContain('还没有租金记录。台账来自在管租约——租客接受邀请后，每期租金自动出现在这里，双方都可记录已付。')
    expect(shell).toContain('No rent records yet. The ledger comes from managed tenancies')
    expect(shell).not.toContain('租金台账从第一天起自动记录')
    expect(shell).not.toContain('the rent ledger starts itself')
    // CTA unchanged: importing a signed lease is still the way to create the tenancy.
    const entry = shell.slice(shell.indexOf("'/landlord/finance': {"), shell.indexOf("'/landlord/maintenance': {"))
    expect(entry).toContain("href: '/leases/import'")
  })
})

describe('scheduled periods nobody has recorded yet (audit 2026-10-12 P1-2 follow-up)', async () => {
  const { scheduledPlaceholders } = await import('@/components/landlord/RentLedger')
  const now = new Date(Date.UTC(2026, 10, 15))
  const hh = [{ id: 'h1', address: 'A', unit: null, current_lease_id: 'L1', previous_lease_id: null, next_lease_id: null, start_date: '2026-11-01', rent_due_day: 1, monthly_rent: 2500 }]
  it('an imported tenancy with no rent_payments rows still lists its periods (one month ahead), as the hub does', () => {
    const rows = scheduledPlaceholders(hh, [{ id: 'L1', start_date: '2026-11-01' }], [], now)
    expect(rows.map((r) => r.due_date).sort()).toEqual(['2026-11-01', '2026-12-01'])
    const nov = rows.find((r) => r.due_date === '2026-11-01')!
    expect(nov).toMatchObject({ lease_id: 'L1', status: 'due', amount: 2500, paid_at: null })
    expect(nov.id).toBe('sched:L1:2026-11-01')
  })
  it('dates that already have a row, and dates owned by a signed renewal, are not duplicated', () => {
    const paid = [{ id: 'r1', lease_id: 'L1', due_date: '2026-11-01', status: 'paid', amount: 2500, paid_at: '2026-11-01T15:00:00Z' }]
    expect(scheduledPlaceholders(hh, [{ id: 'L1', start_date: '2026-11-01' }], paid, now).map((r) => r.due_date)).toEqual(['2026-12-01'])
    const renewed = [{ ...hh[0], next_lease_id: 'L2' }]
    expect(scheduledPlaceholders(renewed, [{ id: 'L1', start_date: '2026-11-01' }, { id: 'L2', start_date: '2026-12-01' }], [], now).map((r) => r.due_date)).toEqual(['2026-11-01'])
  })
  it('a household without a current lease or a due day produces nothing', () => {
    expect(scheduledPlaceholders([{ ...hh[0], current_lease_id: null }], [], [], now)).toEqual([])
    expect(scheduledPlaceholders([{ ...hh[0], rent_due_day: null }], [{ id: 'L1', start_date: '2026-11-01' }], [], now)).toEqual([])
  })
})
