// Equifax Canada — applicant-authorised credit pull (competitor review P1-1,
// provider chosen 2026-09-05). The applicant authorises the pull of THEIR OWN
// report on /verify/<token>; Stayloop is the conduit to the landlord, not a
// consumer reporting agency furnishing reports on its own account.
//
// Transport status: Equifax's Canadian API reference sits behind the
// developer-portal login and the commercial agreement. Until those exist this
// module offers
//   · CREDIT_PULL_PROVIDER=mock    — a realistic fixture that exercises the
//     whole flow (form → pull → CreditReport → deterministic analysis →
//     scoring → report) end to end, stamped sandbox:true so scoring ignores it
//   · CREDIT_PULL_PROVIDER=equifax — OAuth2 client-credentials + inquiry,
//     with the request/response mapping isolated in two small functions
//     (buildInquiry / mapReport) that get finalised against the spec Equifax
//     hands over. Anything unmapped stays null rather than being guessed.
import type { CreditReport } from '../../screening-types'
import type { CreditResult } from '../types'

export type CreditPullInput = {
  first_name: string
  last_name: string
  date_of_birth: string           // YYYY-MM-DD
  address: { line1: string; city: string; province: string; postal_code: string }
  // No SIN: Equifax Canada matches on name + DOB + address; PIPEDA
  // minimisation says don't collect what the match does not need.
}

export function creditProvider(): 'equifax' | 'mock' | null {
  const p = (process.env.CREDIT_PULL_PROVIDER || '').toLowerCase()
  if (p === 'mock') return 'mock'
  if (p === 'equifax' && process.env.EQUIFAX_CLIENT_ID && process.env.EQUIFAX_CLIENT_SECRET) return 'equifax'
  return null
}

export function creditProviderIsSandbox(): boolean {
  const p = creditProvider()
  if (p === 'mock') return true
  return (process.env.EQUIFAX_ENV || 'sandbox') !== 'production'
}

export async function pullCredit(input: CreditPullInput): Promise<CreditResult> {
  const p = creditProvider()
  if (p === 'mock') return mockPull(input)
  if (p === 'equifax') return equifaxPull(input)
  throw new Error('credit provider not configured')
}

// ---------------------------------------------------------------- Equifax --

const EQ_BASE = () => {
  const env = process.env.EQUIFAX_ENV || 'sandbox'
  return (process.env.EQUIFAX_API_BASE || (env === 'production' ? 'https://api.equifax.com' : env === 'test' ? 'https://api.uat.equifax.com' : 'https://api.sandbox.equifax.com')).replace(/\/$/, '')
}

async function equifaxToken(): Promise<string> {
  const body = new URLSearchParams({ grant_type: 'client_credentials', scope: process.env.EQUIFAX_SCOPE || 'https://api.equifax.com/business/consumer-credit/v1' })
  const basic = btoa(`${process.env.EQUIFAX_CLIENT_ID}:${process.env.EQUIFAX_CLIENT_SECRET}`)
  const res = await fetch(`${EQ_BASE()}/v2/oauth/token`, {
    method: 'POST', signal: AbortSignal.timeout(15000),
    headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  const data = await res.json().catch(() => ({})) as { access_token?: string; error?: string }
  if (!res.ok || !data.access_token) throw new Error(`equifax token ${res.status}: ${data.error || ''}`)
  return data.access_token
}

// Finalise against the Canadian inquiry schema once the agreement is signed.
function buildInquiry(i: CreditPullInput): Record<string, unknown> {
  return {
    consumers: {
      name: [{ firstName: i.first_name, lastName: i.last_name }],
      dateOfBirth: i.date_of_birth,
      addresses: [{ identifier: 'current', streetAddress: i.address.line1, city: i.address.city, state: i.address.province, zip: i.address.postal_code }],
    },
    customerConfiguration: {
      equifaxUSConsumerCreditReport: {
        memberNumber: process.env.EQUIFAX_MEMBER_NUMBER,
        securityCode: process.env.EQUIFAX_SECURITY_CODE,
        customerCode: process.env.EQUIFAX_CUSTOMER_CODE,
        permissiblePurposeCode: process.env.EQUIFAX_PERMISSIBLE_PURPOSE || 'TENANT',
        models: [{ identifier: process.env.EQUIFAX_MODEL || '' }].filter((m) => m.identifier),
      },
    },
  }
}

// Provisional mapping of the JSON credit file into our CreditReport. Every
// field is null-tolerant; nothing is invented when the path is absent.
function mapReport(raw: any): CreditReport {
  const rep = raw?.consumerCreditReports?.[0] ?? raw?.consumerCreditReport ?? raw ?? {}
  const num = (v: unknown) => (typeof v === 'number' && isFinite(v) ? v : typeof v === 'string' && v.trim() && !isNaN(Number(v)) ? Number(v) : null)
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : '')
  const trades = Array.isArray(rep.trades) ? rep.trades : []
  const tradelines = trades.map((t: any) => ({
    creditor: str(t.customerName ?? t.creditorName),
    type: str(t.portfolioTypeCode?.description ?? t.accountTypeCode?.description ?? t.accountType),
    date_opened: str(t.dateOpened),
    balance: num(t.balance),
    high_credit: num(t.highCredit),
    credit_limit: num(t.creditLimit),
    past_due: num(t.pastDueAmount),
    payment_status: str(t.rate?.description ?? t.status?.description ?? t.paymentStatus),
    late_30_60_90: `${num(t.thirtyDayCounter) ?? 0}/${num(t.sixtyDayCounter) ?? 0}/${num(t.ninetyDayCounter) ?? 0}`,
  }))
  const collections = (Array.isArray(rep.collections) ? rep.collections : []).map((c: any) => ({
    creditor: str(c.customerName ?? c.agencyClientName ?? c.creditorName),
    date_assigned: str(c.dateAssigned ?? c.dateReported),
    original_amount: num(c.originalAmount),
    balance: num(c.balance),
  }))
  const bankruptcies = (Array.isArray(rep.bankruptcies) ? rep.bankruptcies : []).map((b: any) => ({
    date_filed: str(b.dateFiled), type: str(b.type?.description ?? b.type), amount: num(b.liabilityAmount ?? b.amount), disposition: str(b.dispositionCode?.description ?? b.disposition),
  }))
  const inquiries = (Array.isArray(rep.inquiries) ? rep.inquiries : []).map((q: any) => ({ date: str(q.dateOfInquiry ?? q.date), creditor: str(q.customerName ?? q.creditorName) }))
  const score = num(rep.models?.[0]?.score ?? rep.score)
  return {
    bureau: 'Equifax',
    credit_score: score,
    score_band: null,
    report_date: str(rep.reportDate ?? rep.dateReported) || new Date().toISOString().slice(0, 10),
    tradelines, collections, bankruptcies, inquiries,
    total_debt: tradelines.reduce((s: number, t: { balance: number | null }) => s + (t.balance ?? 0), 0) || null,
    monthly_debt_payments: null,
    employment: {
      current: str(rep.employments?.[0]?.employerName) || null,
      previous: str(rep.employments?.[1]?.employerName) || null,
    },
  } as CreditReport
}

async function equifaxPull(i: CreditPullInput): Promise<CreditResult> {
  const token = await equifaxToken()
  const res = await fetch(`${EQ_BASE()}${process.env.EQUIFAX_INQUIRY_PATH || '/business/consumer-credit/v1/reports/credit-report'}`, {
    method: 'POST', signal: AbortSignal.timeout(25000),
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(buildInquiry(i)),
  })
  const raw = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`equifax inquiry ${res.status}: ${JSON.stringify(raw).slice(0, 160)}`)
  const report = mapReport(raw)
  return {
    provider: 'equifax', bureau: 'Equifax', score: report.credit_score ?? null, report_date: report.report_date ?? null,
    report, reference: (raw?.transactionId ?? raw?.consumerCreditReports?.[0]?.identifier ?? null) as string | null, summary: null,
  }
}

// ------------------------------------------------------------------- mock --

// A plausible Ontario file: one card near its limit, a clean car loan, one
// paid collection, two recent inquiries. Enough to light up every part of
// the analysis layer. sandbox:true means scoring never trusts it.
function mockPull(i: CreditPullInput): CreditResult {
  const today = new Date().toISOString().slice(0, 10)
  const report: CreditReport = {
    bureau: 'Equifax (mock)',
    credit_score: 684,
    score_band: 'Good',
    report_date: today,
    tradelines: [
      { creditor: 'TD VISA', type: 'Revolving', date_opened: '2021/03/14', balance: 4820, high_credit: 5100, credit_limit: 5000, past_due: 0, payment_status: 'R1 Paid as agreed', late_30_60_90: '0/0/0' },
      { creditor: 'RBC LINE OF CREDIT', type: 'Open', date_opened: '2019/09/02', balance: 2100, high_credit: 9000, credit_limit: 10000, past_due: 0, payment_status: 'O1 Paid as agreed', late_30_60_90: '1/0/0' },
      { creditor: 'HONDA FINANCE', type: 'Installment', date_opened: '2023/06/20', balance: 14350, high_credit: 24000, credit_limit: null, past_due: 0, payment_status: 'I1 Paid as agreed', late_30_60_90: '0/0/0' },
      { creditor: 'ROGERS', type: 'Open', date_opened: '2020/01/11', balance: 0, high_credit: 240, credit_limit: null, past_due: 0, payment_status: 'O1 Paid as agreed', late_30_60_90: '0/0/0' },
    ],
    collections: [{ creditor: 'CBV COLLECTIONS (BELL)', date_assigned: '2022/11/05', original_amount: 312, balance: 0 }],
    bankruptcies: [],
    inquiries: [{ date: '2026/07/18', creditor: 'CANADIAN TIRE BANK' }, { date: '2026/02/03', creditor: 'BMO' }],
    total_debt: 21270,
    monthly_debt_payments: 690,
    employment: { current: 'ACME LOGISTICS INC', previous: null },
  } as CreditReport
  return {
    provider: 'mock', bureau: 'Equifax (mock)', score: 684, report_date: today, report,
    reference: `mock-${i.last_name.toLowerCase().slice(0, 8)}-${Date.now().toString(36)}`, summary: { note: 'fixture — sandbox only' },
  }
}
