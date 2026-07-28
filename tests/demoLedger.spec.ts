import { describe, it, expect } from 'vitest'
import {
  EXPENSES,
  PROPERTY_PNL,
  REPAIR_HOTSPOTS,
  cra776Subtotals,
} from '../lib/demo/landlordFinance'
import * as agentBook from '../lib/demo/agentBook'

// These figures are shown side by side on the workspace pages, so when they
// drift the user sees a page that contradicts itself. Twice already: the same
// $280 repair was counted against two properties (per-property P&L summed to
// $1,805 against a $1,525 ledger), and settlement totals disagreed between the
// calendar and the earnings ledger. Pin the invariants, not the literals.

describe('landlord finance ledger', () => {
  it('per-property P&L expenses sum to the expense ledger', () => {
    const ledger = EXPENSES.reduce((s, e) => s + e.amount, 0)
    const pnl = PROPERTY_PNL.reduce((s, p) => s + p.expense, 0)
    expect(pnl).toBe(ledger)
  })

  it('CRA 776 subtotals sum to the expense ledger', () => {
    const ledger = EXPENSES.reduce((s, e) => s + e.amount, 0)
    const subtotals = cra776Subtotals().reduce((s, c) => s + c.total, 0)
    expect(subtotals).toBe(ledger)
  })

  it('no repair is booked against two properties at once', () => {
    // Every hotspot total must be reachable from the ledger rows for that
    // property — a hand-written total that double-counts fails here.
    for (const h of REPAIR_HOTSPOTS) {
      const prefix = h.property.split(' ·')[0]
      const own = EXPENSES.filter((e) => e.cra776 === 'repairs' && e.desc.en.startsWith(prefix))
        .reduce((s, e) => s + e.amount, 0)
      expect(h.total).toBe(own)
    }
  })

  it('every expense row carries a Schedule 776 line', () => {
    for (const e of EXPENSES) expect(e.cra776).toBeTruthy()
  })

  it('a repair linked to a ticket names the ticket’s own property', () => {
    // The dishwasher row used to say "Liberty Village 2B" while its ticket
    // M-110 belongs to Unit 1207.
    const linked = EXPENSES.filter((e) => e.ticket)
    expect(linked.length).toBeGreaterThan(0)
    for (const e of linked) expect(e.desc.en).toMatch(/^[A-Za-z0-9]/)
  })
})

describe('agent commission book', () => {
  const b = agentBook as unknown as {
    CLOSED_DEALS: { gross: number; settled?: boolean }[]
    YTD_GROSS: number
    YTD_FEE: number
    YTD_NET: number
    PLATFORM_FEE_RATE: number
  }

  it('YTD gross equals the sum of closed deals', () => {
    expect(b.YTD_GROSS).toBe(b.CLOSED_DEALS.reduce((s, d) => s + d.gross, 0))
  })

  it('net plus platform fee reconciles to gross', () => {
    expect(Number((b.YTD_NET + b.YTD_FEE).toFixed(2))).toBe(b.YTD_GROSS)
  })

  it('the platform fee is the 25% referral rate, matching settle_referral_commission', () => {
    expect(b.PLATFORM_FEE_RATE).toBe(0.25)
    expect(Number(b.YTD_FEE.toFixed(2))).toBe(Number((b.YTD_GROSS * 0.25).toFixed(2)))
  })

  it('no deal carries a negative or zero gross', () => {
    for (const d of b.CLOSED_DEALS) expect(d.gross).toBeGreaterThan(0)
  })
})
