// Derived credit analysis — the layer between transcription and judgement.
//
// 2026-08-25, after reading a SingleKey dual-bureau report side-by-side with
// ours: our report already TRANSCRIBES everything (score, tradelines,
// collections, bankruptcies, inquiries — lib/screening-types.ts CreditReport),
// but SingleKey computes an analysis layer on top: debt-to-income, per-
// category utilisation, delinquency roll-ups, score-band placement. Ours
// rendered a flat table and left the reading to the landlord.
//
// Everything here is DETERMINISTIC arithmetic over the transcription. That is
// deliberate: the numbers a landlord compares against a bank's lending rules
// must not come from a model's mouth — the model already did its one job
// (reading the PDF); deriving ratios from that transcription is plain code.
// The model's contribution to this section is a cited narrative
// (credit_report.analysis_en/zh, prompted separately), never the arithmetic.
import type { CreditReport } from '@/lib/screening-types'

export type ScoreBand = 'low' | 'fair' | 'good' | 'great' | 'excellent'

/** SingleKey/Equifax Canada band cut-offs (360–900 scale). */
export const SCORE_BANDS: Array<{ key: ScoreBand; min: number; max: number; en: string; zh: string; color: string }> = [
  { key: 'low',       min: 300, max: 559, en: 'Low',       zh: '偏低', color: '#DC2626' },
  { key: 'fair',      min: 560, max: 639, en: 'Fair',      zh: '一般', color: '#EA580C' },
  { key: 'good',      min: 640, max: 699, en: 'Good',      zh: '良好', color: '#A16207' },
  { key: 'great',     min: 700, max: 759, en: 'Great',     zh: '优秀', color: '#16A34A' },
  { key: 'excellent', min: 760, max: 900, en: 'Excellent', zh: '卓越', color: '#047857' },
]

export interface CreditCategory {
  key: 'revolving' | 'installment' | 'mortgage' | 'auto' | 'open' | 'other'
  en: string
  zh: string
  count: number
  balance: number
  /** Sum of credit_limit (falling back to high_credit per account); null when no account in the category printed either. */
  limit: number | null
  /** balance / limit, 0..∞ (a real case ran 104.7% — over limit). Null when limit is null/0. */
  utilization: number | null
  pastDue: number
  delinquentCount: number
}

export interface DelinquentAccount {
  creditor: string
  type: string
  pastDue: number
  status: string
  late: string
}

export interface DerivedCreditFlag {
  severity: 'high' | 'medium' | 'info'
  en: string
  zh: string
}

export interface CreditAnalysis {
  score: number | null
  band: (typeof SCORE_BANDS)[number] | null
  /** monthly_debt_payments / monthly income. Null when either side is unknown. */
  dti: number | null
  /** Revolving balance ÷ revolving limit across all revolving accounts. */
  revolvingUtilization: number | null
  totalBalance: number
  totalPastDue: number
  /** Inquiries dated within 12 months of report_date (or of the newest inquiry when report_date is missing). */
  inquiries12mo: number
  categories: CreditCategory[]
  delinquent: DelinquentAccount[]
  flags: DerivedCreditFlag[]
}

// ---------------------------------------------------------------- helpers --

function catOf(type: string, status: string): CreditCategory['key'] {
  const t = `${type} ${status}`.toLowerCase()
  if (/mortgage|\bm-?\d/.test(t)) return 'mortgage'
  if (/lease|auto|vehicle|\bl-?\d/.test(t)) return 'auto'
  if (/revolv|\br-?\d/.test(t)) return 'revolving'
  if (/install|student|loan|\bi-?\d/.test(t)) return 'installment'
  if (/open|\bo-?\d/.test(t)) return 'open'
  return 'other'
}

const CAT_LABELS: Record<CreditCategory['key'], { en: string; zh: string }> = {
  revolving:   { en: 'Revolving credit', zh: '循环信贷（信用卡/额度）' },
  installment: { en: 'Installment loans', zh: '分期贷款（含学贷）' },
  mortgage:    { en: 'Mortgage', zh: '按揭' },
  auto:        { en: 'Auto / lease', zh: '车贷 / 租赁' },
  open:        { en: 'Open accounts', zh: '开放账户' },
  other:       { en: 'Other', zh: '其他' },
}

/** A tradeline is delinquent when the report says so in any of the three ways it can. */
function isDelinquent(t: { past_due?: number | null; payment_status: string; late_30_60_90: string }): boolean {
  if ((t.past_due ?? 0) > 0) return true
  if (t.late_30_60_90 && t.late_30_60_90.trim() !== '' && t.late_30_60_90 !== '0/0/0') return true
  // R9/I9/M5-style terminal codes and prose statuses.
  return /bad debt|collection|write.?off|written off|late|delinquen|past due|[rimo]-?[3-9]\b/i.test(t.payment_status || '')
}

function parseYmd(s: string | null | undefined): number | null {
  if (!s) return null
  const m = s.match(/(\d{4})[/-](\d{1,2})(?:[/-](\d{1,2}))?/)
  if (!m) return null
  return Date.UTC(+m[1], +m[2] - 1, +(m[3] || 1))
}

// ---------------------------------------------------------------- analyze --

export function analyzeCreditReport(
  cr: CreditReport | null | undefined,
  opts: { monthlyIncome?: number | null } = {}
): CreditAnalysis | null {
  if (!cr) return null
  const tls = cr.tradelines ?? []
  if (tls.length === 0 && cr.credit_score == null && !(cr.collections?.length) && !(cr.bankruptcies?.length)) return null

  const score = typeof cr.credit_score === 'number' ? cr.credit_score : null
  const band = score != null ? SCORE_BANDS.find(b => score >= b.min && score <= b.max) ?? null : null

  const byCat = new Map<CreditCategory['key'], CreditCategory>()
  const delinquent: DelinquentAccount[] = []
  let totalBalance = 0
  let totalPastDue = 0

  for (const t of tls) {
    const key = catOf(t.type, t.payment_status)
    let cat = byCat.get(key)
    if (!cat) {
      cat = { key, ...CAT_LABELS[key], count: 0, balance: 0, limit: null, utilization: null, pastDue: 0, delinquentCount: 0 }
      byCat.set(key, cat)
    }
    cat.count++
    cat.balance += t.balance ?? 0
    const lim = t.credit_limit ?? t.high_credit
    if (lim != null && lim > 0) cat.limit = (cat.limit ?? 0) + lim
    cat.pastDue += t.past_due ?? 0
    totalBalance += t.balance ?? 0
    totalPastDue += t.past_due ?? 0
    if (isDelinquent(t)) {
      cat.delinquentCount++
      delinquent.push({ creditor: t.creditor, type: t.type, pastDue: t.past_due ?? 0, status: t.payment_status, late: t.late_30_60_90 })
    }
  }
  for (const cat of byCat.values()) {
    // Utilisation is a credit-LINE concept. For installment/mortgage/auto the
    // balance is amortising principal — a brand-new student loan sits at 100%
    // of high_credit by definition, which reads as alarming and means nothing.
    const isLine = cat.key === 'revolving' || cat.key === 'open'
    if (isLine && cat.limit != null && cat.limit > 0) cat.utilization = cat.balance / cat.limit
  }

  const rev = byCat.get('revolving')
  const revolvingUtilization = rev && rev.limit != null && rev.limit > 0 ? rev.balance / rev.limit : null

  const income = opts.monthlyIncome ?? null
  const dti = income != null && income > 0 && cr.monthly_debt_payments != null
    ? cr.monthly_debt_payments / income
    : null

  // Inquiry velocity — anchored on report_date so an old report doesn't count
  // its whole history as "recent".
  const anchor = parseYmd(cr.report_date) ?? Math.max(0, ...((cr.inquiries ?? []).map(q => parseYmd(q.date) ?? 0)))
  const yearMs = 365 * 24 * 3600 * 1000
  const inquiries12mo = anchor
    ? (cr.inquiries ?? []).filter(q => { const d = parseYmd(q.date); return d != null && anchor - d <= yearMs && anchor - d >= 0 }).length
    : (cr.inquiries ?? []).length

  // Derived flags — each one is arithmetic the landlord could re-check by hand.
  const flags: DerivedCreditFlag[] = []
  const pct = (x: number) => `${Math.round(x * 100)}%`
  if (band && (band.key === 'low')) {
    flags.push({ severity: 'high', en: `Credit score ${score} is in the lowest band (${band.min}–${band.max})`, zh: `信用分 ${score} 处于最低档（${band.min}–${band.max}）` })
  }
  if (totalPastDue > 0) {
    flags.push({ severity: 'high', en: `$${totalPastDue.toLocaleString()} currently past due across ${delinquent.length} account(s)`, zh: `${delinquent.length} 个账户当前逾期，合计 $${totalPastDue.toLocaleString()}` })
  } else if (delinquent.length > 0) {
    flags.push({ severity: 'medium', en: `${delinquent.length} account(s) show late-payment history`, zh: `${delinquent.length} 个账户有迟付记录` })
  }
  if (revolvingUtilization != null && revolvingUtilization > 1) {
    flags.push({ severity: 'high', en: `Revolving credit is OVER LIMIT at ${pct(revolvingUtilization)} utilisation`, zh: `循环信贷已超额度（利用率 ${pct(revolvingUtilization)}）` })
  } else if (revolvingUtilization != null && revolvingUtilization > 0.8) {
    flags.push({ severity: 'medium', en: `Revolving utilisation ${pct(revolvingUtilization)} — near limit`, zh: `循环信贷利用率 ${pct(revolvingUtilization)}，接近额度上限` })
  }
  if ((cr.bankruptcies ?? []).length > 0) {
    flags.push({ severity: 'high', en: `${cr.bankruptcies!.length} bankruptcy / insolvency record(s) on file`, zh: `档案含 ${cr.bankruptcies!.length} 条破产/无力偿债记录` })
  }
  if ((cr.collections ?? []).length > 0) {
    const unpaid = cr.collections!.filter(c => (c.balance ?? 0) > 0).length
    flags.push({
      severity: unpaid > 0 ? 'high' : 'medium',
      en: `${cr.collections!.length} collection(s)${unpaid ? ` — ${unpaid} with outstanding balance` : ' (settled)'}`,
      zh: `${cr.collections!.length} 条催收记录${unpaid ? `，其中 ${unpaid} 条仍有余额` : '（已结清）'}`,
    })
  }
  if (dti != null && dti > 0.4) {
    flags.push({ severity: 'high', en: `Debt payments consume ${pct(dti)} of stated monthly income`, zh: `每月还款占申报月收入的 ${pct(dti)}` })
  }
  if (inquiries12mo >= 5) {
    flags.push({ severity: 'medium', en: `${inquiries12mo} credit inquiries in the last 12 months — active credit seeking`, zh: `近 12 个月 ${inquiries12mo} 次信用查询，正在密集申请信贷` })
  }
  if (flags.length === 0 && score != null) {
    flags.push({ severity: 'info', en: 'No derived risk signals — no past-due balances, no collections, utilisation in range', zh: '未发现衍生风险信号——无逾期、无催收、利用率正常' })
  }

  // Stable order: biggest balance first reads naturally.
  const categories = [...byCat.values()].sort((a, b) => b.balance - a.balance)

  return { score, band: band ?? null, dti, revolvingUtilization, totalBalance, totalPastDue, inquiries12mo, categories, delinquent, flags }
}
