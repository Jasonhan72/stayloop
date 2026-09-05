// Deterministic income reading of bank transactions (P0-3). Same rule as the
// credit-analysis layer: arithmetic never comes from a model. The output feeds
// ability_to_pay as a FACT ("bank shows $X/month of recurring deposits from
// Y"), replacing the pay-stub inference when present.
import type { BankResult, BankAccountSummary, RecurringDeposit } from './types'

export type Txn = { date: string; description: string; credit: number | null; debit: number | null; balance?: number | null }
export type AccountIn = {
  title?: string | null
  account_number?: string | null
  category?: string | null
  type?: string | null
  currency?: string | null
  holder_name?: string | null
  balance_current?: number | null
  balance_available?: number | null
  transactions: Txn[]
}

const NOISE = /\b(e-?transfer|etransfer|interac|transfer|tfr|deposit|dep|credit|cr|payment|pmt|pay|from|to|ref|#|no\.?|inc\.?|ltd\.?|corp\.?)\b/gi
const PAYROLL_HINT = /payroll|pay\b|salary|wages|direct dep|dd\b|adp|ceridian|dayforce|paie|remun|payroll|employment|canada life|service canada|cra\b|gov|benefit|pension|cpp|oas|ei\b/i
// Word-bounded: 'traNSFer' must not count as an NSF.
const NSF = /\bnsf\b|non.?sufficient|returned item|insufficient funds|overdraft fee|\brtn\b/i

export function normalizeCounterparty(desc: string): string {
  return desc
    .toLowerCase()
    .replace(/\d{3,}/g, ' ')       // account/ref numbers vary per deposit
    .replace(NOISE, ' ')
    .replace(/[^a-z一-鿿\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 40)
}

function daysBetween(a: string, b: string): number {
  return Math.abs((Date.parse(b) - Date.parse(a)) / 86_400_000)
}

export function findRecurringDeposits(txns: Txn[]): RecurringDeposit[] {
  const credits = txns
    .filter((t) => typeof t.credit === 'number' && t.credit! > 0 && !!Date.parse(t.date))
    .sort((a, b) => Date.parse(a.date) - Date.parse(b.date))
  const groups = new Map<string, Txn[]>()
  for (const t of credits) {
    const key = normalizeCounterparty(t.description) || '(unlabelled)'
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(t)
  }
  const out: RecurringDeposit[] = []
  for (const [label, list] of groups) {
    if (list.length < 2) continue
    const gaps: number[] = []
    for (let i = 1; i < list.length; i++) gaps.push(daysBetween(list[i - 1].date, list[i].date))
    const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length
    // Weekly … monthly cadence. Anything outside is not "income-like".
    if (avgGap < 5 || avgGap > 36) continue
    const amounts = list.map((t) => t.credit as number)
    const avg = amounts.reduce((a, b) => a + b, 0) / amounts.length
    // Amount stability: ignore groups whose spread is wild (refunds, sales).
    const spread = Math.max(...amounts) - Math.min(...amounts)
    if (spread > avg * 0.75) continue
    const monthly = avg * (30.4375 / avgGap)
    out.push({
      label,
      occurrences: list.length,
      avg_amount: round2(avg),
      avg_interval_days: round1(avgGap),
      monthly_equivalent: round2(monthly),
      last_date: list[list.length - 1].date,
    })
  }
  return out.sort((a, b) => b.monthly_equivalent - a.monthly_equivalent)
}

export function isPayrollLike(d: RecurringDeposit): boolean {
  // Cadence alone is a weak signal (a friend's monthly e-transfer also
  // recurs); the label has to look like an employer / government source,
  // OR the deposit is large enough and regular enough to be a salary.
  if (PAYROLL_HINT.test(d.label)) return true
  return d.occurrences >= 3 && d.avg_amount >= 800
}

export function summarizeBank(accounts: AccountIn[], institution: string | null, windowDays = 90): BankResult {
  const allTxns: Txn[] = []
  const summaries: BankAccountSummary[] = []
  const holders = new Set<string>()
  let totalCredits = 0, totalDebits = 0, nsf = 0
  let closing: number | null = null
  for (const a of accounts) {
    const txns = (a.transactions || []).filter((t) => !!Date.parse(t.date))
    const dates = txns.map((t) => t.date).sort()
    for (const t of txns) {
      if (typeof t.credit === 'number') totalCredits += t.credit
      if (typeof t.debit === 'number') totalDebits += t.debit
      if (NSF.test(t.description)) nsf++
    }
    if (a.holder_name) holders.add(a.holder_name.trim())
    if (typeof a.balance_current === 'number') closing = (closing ?? 0) + a.balance_current
    summaries.push({
      title: a.title ?? null,
      masked_number: a.account_number ? `···· ${String(a.account_number).slice(-4)}` : null,
      category: a.category ?? null,
      type: a.type ?? null,
      currency: a.currency ?? null,
      holder_name: a.holder_name ?? null,
      balance_current: a.balance_current ?? null,
      balance_available: a.balance_available ?? null,
      transactions_count: txns.length,
      first_txn_date: dates[0] ?? null,
      last_txn_date: dates[dates.length - 1] ?? null,
    })
    allTxns.push(...txns)
  }
  const recurring = findRecurringDeposits(allTxns)
  const payroll = recurring.filter(isPayrollLike)
  return {
    institution,
    accounts: summaries,
    holder_names: Array.from(holders),
    window_days: windowDays,
    total_credits: round2(totalCredits),
    total_debits: round2(totalDebits),
    recurring_deposits: recurring,
    payroll_monthly_estimate: payroll.length ? round2(payroll.reduce((s, d) => s + d.monthly_equivalent, 0)) : null,
    nsf_count: nsf,
    closing_balance_total: closing === null ? null : round2(closing),
  }
}

function round2(n: number) { return Math.round(n * 100) / 100 }
function round1(n: number) { return Math.round(n * 10) / 10 }
