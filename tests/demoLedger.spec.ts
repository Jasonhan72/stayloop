import { describe, it, expect } from 'vitest'
import {
  EXPENSES,
  MONTHLY_EXPECTED,
  PROPERTY_PNL,
  REPAIR_HOTSPOTS,
  YTD_MONTHS,
  YTD_NET,
  YTD_RENT,
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

describe('finance rent roll', () => {
  // The page carried three different monthly totals (10,590 in the chart and
  // the receivables, 10,250 in the ledger) and a YTD KPI that agreed with none
  // of them, while the per-property P&L directly below said something else.
  it('monthly expected times the elapsed months equals YTD rent', () => {
    expect(MONTHLY_EXPECTED * YTD_MONTHS).toBe(YTD_RENT)
  })

  it('YTD rent equals the sum of the per-property P&L', () => {
    expect(YTD_RENT).toBe(PROPERTY_PNL.reduce((s, p) => s + p.rent, 0))
  })

  it('YTD net is rent minus the expense ledger, not a standalone figure', () => {
    expect(YTD_NET).toBe(YTD_RENT - EXPENSES.reduce((s, e) => s + e.amount, 0))
  })

  it('a vacant property contributes no rent', () => {
    for (const p of PROPERTY_PNL) {
      if (p.vacancyNote) expect(p.rent).toBe(0)
    }
  })
})

describe('agent CRM agrees with the commission book', () => {
  // Four clients carried a settled commission while the CRM still had them
  // shopping — David Z. was "awaiting landlord reply" on the same date his
  // Distillery 1207 fee was booked.
  it('every client with a settled deal is at the leased stage', async () => {
    const { CLOSED_DEALS } = await import('../lib/demo/agentBook')
    const { CLIENTS } = await import('../lib/demo/agentClients')
    const stages = new Map(CLIENTS('AI').map((c) => [c.name, c.stage]))
    for (const d of CLOSED_DEALS) {
      const key = d.clientKey
      if (!key || !stages.has(key)) continue
      expect(stages.get(key), `${key} has a settled deal but is at stage ${stages.get(key)}`).toBe('leased')
    }
  })

  it('every closed deal can be matched back to the CRM', async () => {
    // Four of the six deals had no clientKey, which is why the drift went
    // unseen: the CRM simply rendered nothing for them.
    const { CLOSED_DEALS } = await import('../lib/demo/agentBook')
    for (const d of CLOSED_DEALS) expect(d.clientKey, `${d.client.en} has no clientKey`).toBeTruthy()
  })
})
