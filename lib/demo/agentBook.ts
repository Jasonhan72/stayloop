// The agent workspace's single demo ledger.
//
// Why this module exists: /agent/earnings, /agent/calendar and /agent/clients
// each used to carry their own commission fixtures, and they disagreed —
// calendar claimed $2,760 settled this month / $11,420 YTD while earnings
// claimed $3,315 / $9,435 for the same demo agent. Every money number the
// three pages show now derives from the arrays below, so a change lands in
// one place and the pages cannot drift apart again.
//
// Commission semantics follow the real engine (settle_referral_commission in
// 20260608_billing_commission.sql):
//   gross  = referral_agreement.gross_commission   — what the agent bills
//   fee    = commission.fee_amount = gross × 0.25  — the platform referral fee
//   net    = gross − fee                           — what the agent keeps
// The demo grosses are ~half a month's rent on each canon listing, which is
// how the fixtures were originally written (Eric K. $5,200 rent → $2,600).

export type Bi = { zh: string; en: string }

/** Platform referral fee rate — mirrors commission.referral_rate default 0.250. */
export const PLATFORM_FEE_RATE = 0.25

/** Demo "today" for the agent workspace: Tue 5/12, week 20 (5/11–5/17). */
export const DEMO_MONTH = 5
export const DEMO_MONTH_DAYS_LEFT = 19

export interface ClosedDeal {
  /** M/D as shown in the UI. */
  date: string
  month: number
  client: Bi
  /** Matches a row in the /agent/clients CRM list when the client is still active there. */
  clientKey?: string
  listing: string
  /** Gross commission billed on the deal. */
  gross: number
  /** Platform referral fee already settled. */
  settled: boolean
  /** What is still open on this client — rendered on /agent/clients. */
  followUp?: Bi
}

export const CLOSED_DEALS: ClosedDeal[] = [
  {
    date: '5/8',
    month: 5,
    client: { zh: 'Yuki M.', en: 'Yuki M.' },
    clientKey: 'Yuki M.',
    listing: 'King West condo',
    gross: 1475,
    settled: true,
    followUp: { zh: '租约到期 2027-05', en: 'Lease ends 2027-05' },
  },
  {
    date: '5/3',
    month: 5,
    client: { zh: 'David Z.', en: 'David Z.' },
    listing: 'Distillery 1207',
    gross: 1840,
    settled: true,
  },
  {
    date: '4/28',
    month: 4,
    client: { zh: 'Kevin Tran 续约', en: 'Kevin Tran renewal' },
    clientKey: 'Kevin Tran',
    listing: 'Hanna Loft',
    gross: 720,
    settled: true,
    followUp: { zh: '续约草稿 5/12 到期', en: 'Renewal draft due 5/12' },
  },
  {
    date: '4/22',
    month: 4,
    client: { zh: 'Marcus T.', en: 'Marcus T.' },
    listing: 'Leslieville Stack',
    gross: 1550,
    settled: true,
  },
  {
    date: '4/14',
    month: 4,
    client: { zh: 'Lisa W.', en: 'Lisa W.' },
    listing: 'CityPlace 4502',
    gross: 1725,
    settled: true,
  },
  {
    date: '4/4',
    month: 4,
    client: { zh: 'Anna L.（首签）', en: 'Anna L. (first signing)' },
    listing: 'Brunswick Ave',
    gross: 2125,
    settled: true,
  },
]

export type PipelineStage = 'searching' | 'showing' | 'applied' | 'closing'

export interface PipelineDeal {
  client: string
  listing: Bi
  /** Expected gross commission if the deal closes. */
  gross: number
  /** Estimated signing date, M/D. */
  eta: string
  etaMonth: number
  stage: PipelineStage
}

export const PIPELINE: PipelineDeal[] = [
  { client: 'Anna L.', listing: { zh: 'Brunswick Ave 续约', en: 'Brunswick Ave renewal' }, gross: 2125, eta: '7/2', etaMonth: 7, stage: 'showing' },
  { client: 'Lisa W.', listing: { zh: 'CityPlace 4502', en: 'CityPlace 4502' }, gross: 1725, eta: '5/15', etaMonth: 5, stage: 'applied' },
  { client: 'Eric K.', listing: { zh: 'Yorkville', en: 'Yorkville' }, gross: 2600, eta: '5/22', etaMonth: 5, stage: 'showing' },
  { client: 'Jason H.', listing: { zh: 'King West / Liberty', en: 'King West / Liberty' }, gross: 1700, eta: '5/30', etaMonth: 5, stage: 'searching' },
]

/* ── commission math ─────────────────────────────────────────────────── */

const round2 = (n: number) => Math.round(n * 100) / 100

export function platformFee(gross: number): number {
  return round2(gross * PLATFORM_FEE_RATE)
}

export function netCommission(gross: number): number {
  return round2(gross - platformFee(gross))
}

/** $1,475 / $368.75 — cents only when they exist. */
export function money(n: number): string {
  return `$${n.toLocaleString('en-US', {
    minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
    maximumFractionDigits: 2,
  })}`
}

const sum = (ns: number[]) => round2(ns.reduce((a, b) => a + b, 0))

export const YTD_GROSS = sum(CLOSED_DEALS.map((d) => d.gross))
export const YTD_FEE = sum(CLOSED_DEALS.map((d) => platformFee(d.gross)))
export const YTD_NET = round2(YTD_GROSS - YTD_FEE)

const monthDeals = CLOSED_DEALS.filter((d) => d.month === DEMO_MONTH)
export const MONTH_GROSS = sum(monthDeals.map((d) => d.gross))
export const MONTH_FEE = sum(monthDeals.map((d) => platformFee(d.gross)))
export const MONTH_NET = round2(MONTH_GROSS - MONTH_FEE)
export const MONTH_DEALS = monthDeals

export const PIPELINE_TOTAL = sum(PIPELINE.map((p) => p.gross))
/** Pipeline that could still sign inside the current demo month. */
export const PIPELINE_THIS_MONTH = PIPELINE.filter((p) => p.etaMonth === DEMO_MONTH)
export const PIPELINE_THIS_MONTH_TOTAL = sum(PIPELINE_THIS_MONTH.map((p) => p.gross))

/** Monthly gross-commission goal — same figure the agent's GOAL memory carries. */
export const MONTH_GOAL = 7200
/** Probability weighting applied to open pipeline in the month-end forecast. */
export const WIN_PROBABILITY = 0.6
export const MONTH_FORECAST = Math.round(MONTH_GROSS + PIPELINE_THIS_MONTH_TOTAL * WIN_PROBABILITY)
export const MONTH_GOAL_PCT = Math.round((MONTH_GROSS / MONTH_GOAL) * 100)

/* ── field work (showings) ───────────────────────────────────────────── */

// Showing fees are a separate line from commission: a landlord dispatches a
// Field Agent for a flat fee per showing (agent_tasks.payout_cents).
export const SHOWING_FEE = 80

export const FIELD_WEEK = {
  showingsDone: 5,
  newClients: 2,
  /** Completed showings whose fee has not been settled yet. */
  unsettledShowings: 4,
}
export const WEEK_SHOWING_FEES = FIELD_WEEK.showingsDone * SHOWING_FEE // $400
export const WEEK_UNSETTLED_FEES = FIELD_WEEK.unsettledShowings * SHOWING_FEE // $320

/* ── invoices (invoice table: kind='commission', amount = fee, hst) ───── */

export const HST_RATE = 0.13

export interface FeeInvoice {
  id: string
  date: string
  /** The deal the referral fee was raised against. */
  deal: Bi
  amount: number
  hst: number
}

export const FEE_INVOICES: FeeInvoice[] = MONTH_DEALS.map((d, i) => {
  const amount = platformFee(d.gross)
  return {
    id: `INV-2026-0${DEMO_MONTH}-0${MONTH_DEALS.length - i}`,
    date: d.date,
    deal: {
      zh: `${d.client.zh} · ${d.listing}`,
      en: `${d.client.en} · ${d.listing}`,
    },
    amount,
    hst: round2(amount * HST_RATE),
  }
})
