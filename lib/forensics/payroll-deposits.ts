// -----------------------------------------------------------------------------
// Payroll-deposit reconciliation — the reading a human examiner does when a
// bank statement's payer is not the employer's name.
//
// Case 2026-09-11 (Acciona / OSV): the stubs said ACCIONA INFRASTRUCTURE
// CANADA INC., the Scotiabank statements said "Osv-Payroll" / "Osv Solutions
// Canada Inc", and the model wrote "工资来源不符" and capped ability-to-pay.
// OSV is OneSource Virtual — a Workday payroll outsourcing provider — and the
// stubs were Workday-rendered (Producer "… Workday, Inc."). Outsourced payroll
// is the norm at mid/large employers; the payer being the processor, not the
// employer, is corroboration once the processor is recognised. The same file
// also carried an April deposit of $21,035.39 that equals one regular net pay
// plus the after-tax value of the $30,418.41 bonus the employment letter
// states, expense reimbursements paid directly by Acciona, and a $4,000
// cheque on the 1st of every month (the current rent). None of that was read.
//
// Everything here is deterministic arithmetic and pattern matching on text
// the forensics pass already extracted. Output is INFO-severity corroboration
// (never suspicion) plus a compact fact block the scoring prompt trusts.
// -----------------------------------------------------------------------------

import type { ForensicFlag } from './types'

export interface PayrollProcessor {
  name: string
  /** payer strings as banks print them on statements */
  payer: RegExp[]
  /** the payroll platform whose stubs this processor runs, matched against the stub PDF producer/creator */
  platform?: RegExp
}

export const PAYROLL_PROCESSORS: PayrollProcessor[] = [
  { name: 'OneSource Virtual (OSV) — Workday payroll BPO', payer: [/\bOSV\b/i, /\bOsv[- ]?Payroll\b/i, /\bOsv\s+Solutions\b/i, /OneSource\s+Virtual/i], platform: /Workday/i },
  { name: 'ADP Canada', payer: [/\bADP\b/i, /\bADP\s+Canada\b/i], platform: /ADP|Xenos|AutoPay/i },
  { name: 'Ceridian / Dayforce', payer: [/\bCeridian\b/i, /\bDayforce\b/i, /\bPowerpay\b/i], platform: /Ceridian|Dayforce/i },
  { name: 'Payworks', payer: [/\bPayworks\b/i], platform: /Payworks/i },
  { name: 'Wagepoint', payer: [/\bWagepoint\b/i], platform: /Wagepoint/i },
  { name: 'Rise People', payer: [/\bRise\s+People\b/i, /\bRisepeople\b/i], platform: /Rise/i },
  { name: 'Humi', payer: [/\bHumi\b/i], platform: /Prawn|Humi/i },
  { name: 'Nethris', payer: [/\bNethris\b/i], platform: /Nethris/i },
  { name: 'Desjardins Payroll (Employeur D)', payer: [/Employeur\s+D\b/i, /Desjardins\s+Paie/i, /\bDPS\s+Payroll\b/i] },
  { name: 'Paychex', payer: [/\bPaychex\b/i], platform: /Paychex/i },
  { name: 'Payment Evolution', payer: [/Payment\s+Evolution/i, /\bPaymentEvolution\b/i] },
  { name: 'Deluxe Payroll', payer: [/\bDeluxe\s+Payroll\b/i] },
  { name: 'Knit People', payer: [/\bKnit\s+People\b/i] },
  { name: 'QuickBooks / Intuit Payroll', payer: [/\bIntuit\b/i, /QuickBooks\s+Payroll/i], platform: /QuickBooks|Intuit/i },
  { name: 'Gusto', payer: [/\bGusto\b/i], platform: /Gusto/i },
  { name: 'Rippling', payer: [/\bRippling\b/i], platform: /Rippling/i },
]

export function detectPayrollProcessor(text: string): PayrollProcessor | null {
  if (!text) return null
  for (const p of PAYROLL_PROCESSORS) if (p.payer.some(re => re.test(text))) return p
  return null
}

const money = (s: string): number => Number(s.replace(/,/g, ''))
const MONEY = /\d{1,3}(?:,\d{3})*\.\d{2}/g
const DATE_TOKEN = String.raw`(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.?\s+\d{1,2}(?![,\d])`

export interface StatementTxn {
  month: string
  day: number
  desc: string
  amount: number | null
  balance: number | null
  /** known when the layout has separate withdrawal / deposit columns */
  direction?: 'in' | 'out' | null
  /** text after the last money figure — the payer / counterparty on Scotiabank's two-line layout */
  trailing: string
  raw: string
}

/** Production text extraction (pdf.js via unpdf, mergePages) joins a page
 *  into ONE line — there are no newlines to split on. Transactions are
 *  recovered by cutting at "Mon D" tokens instead ("May 15 Payroll dep.
 *  6,954.83 69,363.62 Osv-Payroll May 15 Misc. payment …"). A date followed
 *  by a comma or more digits ("May 1, 2026", "Mar 2026") is prose, not a
 *  transaction row. */
export function splitStatementTransactions(text: string): StatementTxn[] {
  if (!text) return []
  // TD-style rows carry the date at the END as "SEP03" and the balance after
  // it; OCR keeps them one per line ("E-TRANSFER 3,547.21 SEP03 26,683.44").
  const tdRows = parseTdStyleRows(text)
  if (tdRows.length >= 3) return tdRows
  const flat = text.replace(/\s+/g, ' ')
  const cut = new RegExp(String.raw`(?=\b${DATE_TOKEN}\b)`, 'g')
  const out: StatementTxn[] = []
  for (const chunk of flat.split(cut)) {
    const m = chunk.match(new RegExp(String.raw`^(${DATE_TOKEN.replace(String.raw`\s+\d{1,2}(?![,\d])`, '')})\.?\s+(\d{1,2})(?![,\d])\s*(.*)$`))
    if (!m) continue
    const rest = m[3]
    const monies = Array.from(rest.matchAll(MONEY))
    const amount = monies.length ? money(monies[0][0]) : null
    const balance = monies.length >= 2 ? money(monies[monies.length - 1][0]) : null
    const lastEnd = monies.length ? (monies[monies.length - 1].index! + monies[monies.length - 1][0].length) : 0
    const desc = monies.length ? rest.slice(0, monies[0].index!).trim() : rest.trim()
    const trailing = monies.length ? rest.slice(lastEnd).trim() : ''
    out.push({ month: m[1].replace('.', ''), day: Number(m[2]), desc, amount, balance, trailing: trailing.slice(0, 80), raw: chunk.trim().slice(0, 160) })
  }
  return out
}

const TD_ROW = /^(.*?)\s+(\d{1,3}(?:,\d{3})*\.\d{2})\s+([A-Z]{3})\s?(\d{2})(?:\s+(\d{1,3}(?:,\d{3})*\.\d{2}))?\s*$/
const MON = /^([A-Z]{3})\s?(\d{2})$/
const AMT = /^\d{1,3}(?:,\d{3})*\.\d{2}$/
const monthName = (m: string) => m[0] + m.slice(1).toLowerCase()

/** TD-style statements come out of OCR in three shapes:
 *   inline   "E-TRANSFER 3,547.21 SEP03 26,683.44"
 *   piped    "SEND E-TFR ***hjp | | 3,547.21 | AUG01 | 23,867.76"
 *   vertical "CHEQUE 00008-…" / "3,547.21" / "SEP30" / "25,919.86" (one field per line)
 *  The piped shape carries withdrawal / deposit columns, so direction is
 *  known; the others infer it from the running balance. */
function parseTdStyleRows(text: string): StatementTxn[] {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  const out: StatementTxn[] = []
  // piped
  const piped = lines.filter(l => (l.match(/\|/g) || []).length >= 3)
  if (piped.length >= 3) {
    for (const l of piped) {
      const cells = l.split('|').map(c => c.trim())
      if (cells.length < 4) continue
      const [desc, w, d, date, bal] = cells
      if (/^description$/i.test(desc)) continue
      const dm = (date || '').match(MON)
      if (/starting|opening/i.test(desc)) { out.push({ month: dm ? monthName(dm[1]) : '', day: dm ? Number(dm[2]) : 0, desc: 'Opening Balance', amount: bal && AMT.test(bal) ? money(bal) : null, balance: null, trailing: '', raw: l, direction: null }); continue }
      const amt = w && AMT.test(w) ? money(w) : d && AMT.test(d) ? money(d) : null
      if (amt === null) continue
      out.push({ month: dm ? monthName(dm[1]) : '', day: dm ? Number(dm[2]) : 0, desc, amount: amt, balance: bal && AMT.test(bal) ? money(bal) : null, trailing: '', raw: l.slice(0, 160), direction: w && AMT.test(w) ? 'out' : 'in' })
    }
    if (out.length >= 3) return out
    out.length = 0
  }
  // inline
  for (const line of lines) {
    const m = line.match(TD_ROW)
    if (!m) {
      const start = line.match(/^(STARTING|OPENING)\s+BALANCE\s+(\d{1,3}(?:,\d{3})*\.\d{2})$/i)
      if (start) out.push({ month: '', day: 0, desc: 'Opening Balance', amount: money(start[2]), balance: null, trailing: '', raw: line, direction: null })
      continue
    }
    out.push({ month: monthName(m[3]), day: Number(m[4]), desc: m[1].trim(), amount: money(m[2]), balance: m[5] ? money(m[5]) : null, trailing: '', raw: line.slice(0, 160), direction: null })
  }
  if (out.length >= 3) return out
  out.length = 0
  // vertical: description, amount, date, [balance]
  let desc: string | null = null
  let amt: number | null = null
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]
    if (/^(STARTING|OPENING)\s+BALANCE$/i.test(l)) { desc = 'Opening Balance'; continue }
    if (AMT.test(l)) {
      if (desc && amt === null) { amt = money(l); continue }
      // an amount right after a completed row is that row's balance
      const last = out[out.length - 1]
      if (last && last.balance === null && desc === null) { last.balance = money(l); continue }
      amt = money(l); continue
    }
    const dm = l.match(MON)
    if (dm) {
      if (desc) {
        if (desc === 'Opening Balance') out.push({ month: monthName(dm[1]), day: Number(dm[2]), desc, amount: amt, balance: null, trailing: '', raw: l, direction: null })
        else if (amt !== null) out.push({ month: monthName(dm[1]), day: Number(dm[2]), desc, amount: amt, balance: null, trailing: '', raw: `${desc} ${amt} ${l}`, direction: null })
      }
      desc = null; amt = null; continue
    }
    if (/^(description|withdrawals|deposits|date|balance)$/i.test(l)) continue
    // a description line (letters present)
    if (/[A-Za-z]{2,}/.test(l)) { desc = l; amt = null }
  }
  return out.length >= 3 ? out : []
}

export const PAYROLL_LABEL = /\b(payroll|pay\s*dep|direct\s+dep(?:osit)?|salary|paie|dep[oô]t\s+(?:de\s+)?(?:paie|salaire))\b/i

/** Payroll-labelled deposits on a statement: amount + the payer text printed
 *  with the row (Scotiabank prints the payer after the balance; other banks
 *  inline it in the description). */
export function extractPayrollDeposits(bankText: string): Array<{ amount: number; payer: string; line: string }> {
  const out: Array<{ amount: number; payer: string; line: string }> = []
  for (const t of splitStatementTransactions(bankText)) {
    if (!PAYROLL_LABEL.test(t.desc) || t.amount === null) continue
    if (!(t.amount >= 200 && t.amount < 200_000)) continue
    const inlinePayer = t.desc.replace(PAYROLL_LABEL, '').replace(/\bdep\.?\b/i, '').replace(/[^A-Za-z0-9 .&'-]/g, ' ').replace(/\s+/g, ' ').trim()
    const trailingPayer = t.trailing.replace(/\s+\d[\d ,.-]*$/, '').trim()
    const payer = (trailingPayer.length >= 3 ? trailingPayer : inlinePayer).slice(0, 60)
    out.push({ amount: t.amount, payer, line: `${t.month} ${t.day} ${t.desc} ${t.amount.toLocaleString('en-CA', { minimumFractionDigits: 2 })}`.slice(0, 120) })
  }
  return out
}

/** The bonus an employment/compensation letter states. Handles "30,418.41 CAD"
 *  and the European "30.418,41 CAD" the same letter's appendix used. */
export function extractStatedBonus(text: string): number | null {
  if (!text) return null
  const parse = (raw: string): number | null => {
    let s = raw.trim()
    if (/^\d{1,3}(?:\.\d{3})+,\d{2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.')
    else s = s.replace(/,/g, '')
    const v = Number(s)
    return isFinite(v) && v >= 500 && v <= 1_000_000 ? Math.round(v * 100) / 100 : null
  }
  const NUM = String.raw`(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?)`
  const patterns = [
    new RegExp(String.raw`total\s+bonus\s+payable\s*:?\s*(?:CAD|C\$|\$)?\s*${NUM}`, 'i'),
    new RegExp(String.raw`variable\s+(?:retribution|pay|compensation|remuneration)[^\d$]{0,80}(?:CAD|C\$|\$)?\s*${NUM}`, 'i'),
    new RegExp(String.raw`bonus\s+(?:of|:|payable|amount(?:s)?\s+to)\s*(?:CAD|C\$|\$)?\s*${NUM}`, 'i'),
    new RegExp(String.raw`(?:CAD|C\$|\$)?\s*${NUM}\s*(?:CAD)?\s*(?:gross\s+)?(?:annual\s+)?bonus`, 'i'),
  ]
  for (const re of patterns) {
    const m = text.match(re)
    if (m) { const v = parse(m[1]); if (v) return v }
  }
  return null
}

/** The YTD bonus line a stub prints ("Bonus 30,418.41"). */
export function extractStubBonusYtd(stubText: string): number | null {
  if (!stubText) return null
  const m = stubText.match(/\bBonus\b[^\d\n]{0,40}(\d{1,3}(?:,\d{3})*\.\d{2})/i)
  if (!m) return null
  const v = money(m[1])
  return v >= 100 && v <= 1_000_000 ? v : null
}

/** Recurring identical outgoing payment early in the month across statements —
 *  the shape of a rent payment. Needs a running-balance layout (the balance
 *  after the row is lower than before) so deposits are never mistaken. */
export function findRecurringMonthlyPayment(bankTexts: string[]): { amount: number; months: number; label: string } | null {
  const seen = new Map<number, { months: Set<string>; label: string }>()
  for (const text of bankTexts) {
    let prevBalance: number | null = null
    const open = (text || '').replace(/\s+/g, ' ').match(/Opening\s+Balance(?:\s+on\s+[A-Za-z]+\s+\d{1,2},?\s+\d{4})?\s+\$?(\d{1,3}(?:,\d{3})*\.\d{2})/i)
    if (open) prevBalance = money(open[1])
    for (const t of splitStatementTransactions(text)) {
      if (/opening\s+balance/i.test(t.desc)) { if (t.amount !== null) prevBalance = t.amount; continue }
      if (t.amount === null) continue
      let isOut: boolean
      if (t.direction) isOut = t.direction === 'out'
      else if (t.balance !== null) { isOut = prevBalance !== null && t.balance < prevBalance }
      else continue
      if (t.balance !== null) prevBalance = t.balance
      if (!isOut || t.day > 5 || t.amount < 800 || t.amount > 20_000) continue
      if (!/cheque|check|transfer|withdrawal|rent|pre-?auth|payment/i.test(t.desc)) continue
      // A mortgage, car-loan, card or savings autopay on the 1st has the
      // same shape; none of them is rent (review 2026-09-13).
      if (/mortgage|\bmtg\b|visa|mastercard|amex|credit\s*card|\bloan\b|insurance|savings|investment|rrsp|tfsa|line\s*of\s*credit|\bloc\b/i.test(t.desc)) continue
      const key = Math.round(t.amount * 100)
      const e = seen.get(key) || { months: new Set<string>(), label: t.desc.replace(/\s+\d[\d ]*$/, '').trim() }
      e.months.add(t.month)
      seen.set(key, e)
    }
  }
  let best: { amount: number; months: number; label: string } | null = null
  for (const [key, e] of seen) {
    if (e.months.size >= 2 && (!best || e.months.size > best.months)) best = { amount: key / 100, months: e.months.size, label: e.label }
  }
  return best
}

export interface StatementLiquidity {
  /** lowest running balance seen across all statements */
  min_balance: number | null
  /** closing balance of the latest statement in the set (by order given) */
  last_balance: number | null
  /** NSF / returned-item / overdraft-fee rows */
  nsf_count: number
  /** transaction rows with a running balance — 0 means the layout was not readable */
  rows: number
}

/** Liquidity read straight off running-balance statements: the lowest balance
 *  the account touched, and NSF / overdraft events. Deterministic, no model.
 *  Statements without a balance column yield rows=0 and nulls. */
export function analyzeStatementLiquidity(bankTexts: string[]): StatementLiquidity {
  // Per statement first: an empty savings account or a co-applicant's
  // account must not drag the floor to $0 (review 2026-09-13). The reserve
  // is the best account's lowest balance; NSF events and rows are summed.
  let best: { min: number; last: number | null; rows: number } | null = null
  let nsf = 0
  let rows = 0
  for (const text of bankTexts) {
    let min: number | null = null
    let last: number | null = null
    let myRows = 0
    const open = (text || '').replace(/\s+/g, ' ').match(/Opening\s+Balance(?:\s+on\s+[A-Za-z]+\s+\d{1,2},?\s+\d{4})?\s+\$?(\d{1,3}(?:,\d{3})*\.\d{2})/i)
    if (open) { const v = money(open[1]); min = min === null ? v : Math.min(min, v) }
    for (const t of splitStatementTransactions(text)) {
      if (/\b(NSF|non[- ]sufficient|returned\s+(?:item|cheque|payment)|overdraft\s+(?:fee|interest|charge)|chargeback)\b/i.test(t.desc)) nsf++
      if (/opening\s+balance/i.test(t.desc)) { if (t.amount !== null) min = min === null ? t.amount : Math.min(min, t.amount); continue }
      if (t.balance === null) continue
      myRows++
      min = min === null ? t.balance : Math.min(min, t.balance)
      last = t.balance
    }
    rows += myRows
    if (min !== null && (best === null || min > best.min)) best = { min, last, rows: myRows }
  }
  return { min_balance: best?.min ?? null, last_balance: best?.last ?? null, nsf_count: nsf, rows }
}

export interface PayrollReconcileFile {
  file_name: string
  file_kind: string
  text_density?: { text_sample: string }
  pdf_metadata?: { producer: string | null; creator: string | null }
  paystub_math?: { extraction: { employer_name: string | null; period_net: number | null; annual_salary: number | null } }
}

const kindHas = (kind: string, target: string) => kind.split(',').map(k => k.trim().toLowerCase()).includes(target)

function employerToken(name: string | null): string | null {
  if (!name) return null
  const skip = new Set(['THE', 'INC', 'LTD', 'LLC', 'CORP', 'CO', 'LIMITED', 'INCORPORATED', 'CORPORATION', 'GROUP', 'CANADA'])
  const words = name.toUpperCase().replace(/[^A-Z0-9\s]/g, ' ').split(/\s+/).filter(Boolean)
  return words.find(x => x.length >= 4 && !skip.has(x)) || words.find(x => !skip.has(x)) || null
}

/** Append INFO corroboration flags. Never emits suspicion — an absence here
 *  simply leaves the model's own reading in place. */
export function reconcilePayrollDeposits(perFile: PayrollReconcileFile[], flags: ForensicFlag[]): void {
  const banks = perFile.filter(pf => kindHas(pf.file_kind, 'bank_statement') && pf.text_density?.text_sample)
  const stubs = perFile.filter(pf => kindHas(pf.file_kind, 'pay_stub'))
  const letters = perFile.filter(pf => kindHas(pf.file_kind, 'employment_letter') || kindHas(pf.file_kind, 'offer_letter'))
  if (banks.length === 0) return

  const bankTexts = banks.map(b => b.text_density!.text_sample)
  const deposits = banks.flatMap(b => extractPayrollDeposits(b.text_density!.text_sample).map(d => ({ ...d, file: b.file_name })))
  const stubProducer = stubs.map(s => `${s.pdf_metadata?.producer || ''} ${s.pdf_metadata?.creator || ''}`).join(' | ')
  const employerName = stubs.map(s => s.paystub_math?.extraction.employer_name).find(Boolean) || null
  const nets = stubs.map(s => s.paystub_math?.extraction.period_net).filter((n): n is number => typeof n === 'number' && n > 0)
  const regularNet = nets.length ? nets.sort((a, b) => a - b)[Math.floor(nets.length / 2)] : null

  // 1) Payer is a recognised payroll processor.
  const payerHits = deposits.map(d => ({ d, p: detectPayrollProcessor(d.payer) })).filter(x => x.p)
  if (payerHits.length > 0) {
    const p = payerHits[0].p!
    const platformMatch = !!(p.platform && stubProducer && p.platform.test(stubProducer))
    const payers = Array.from(new Set(payerHits.map(x => x.d.payer))).slice(0, 3).join(' / ')
    flags.push({
      code: 'payroll_processor_recognized',
      severity: 'info',
      evidence_en: `${payerHits.length} payroll deposit(s) are paid by "${payers}" — ${p.name}, a payroll processing provider${employerName ? ` acting for the employer (${employerName})` : ''}.${platformMatch ? ` The pay stubs are rendered by the same platform (stub PDF producer/creator: "${stubProducer.slice(0, 80)}"), so payer and stubs come from one payroll pipeline.` : ''} A payer that differs from the employer's name is EXPECTED under outsourced payroll and is not an income-source mismatch.`,
      evidence_zh: `${payerHits.length} 笔工资入账的付款方为「${payers}」——即 ${p.name}，工资代发服务商${employerName ? `（代雇主 ${employerName} 发薪）` : ''}。${platformMatch ? `工资单本身也由同一平台生成（工资单 PDF 生成器：「${stubProducer.slice(0, 80)}」），付款方与工资单出自同一条发薪流水线。` : ''}外包发薪下付款方与雇主名称不同是正常现象，不构成「工资来源不符」。`,
    })
  }

  // 2) The employer itself appears as a counterparty (reimbursements etc.).
  const token = employerToken(employerName)
  if (token && token.length >= 4) {
    const hits = banks.filter(b => new RegExp(`\\b${token.slice(0, 8)}`, 'i').test(b.text_density!.text_sample))
    if (hits.length > 0) {
      flags.push({
        code: 'employer_counterparty_on_statement',
        severity: 'info',
        evidence_en: `The employer named on the pay stubs (${employerName}) appears as a counterparty on ${hits.length} bank statement(s) (${hits.map(h => h.file_name).join(', ')}) — typically expense reimbursements paid directly by the employer. Independent corroboration of the employment relationship.`,
        evidence_zh: `工资单上的雇主（${employerName}）在 ${hits.length} 份银行对账单（${hits.map(h => h.file_name).join('、')}）上以交易对手出现——通常是雇主直接支付的报销款。雇佣关系的独立佐证。`,
      })
    }
  }

  // 3) Bonus: letter ↔ stub YTD bonus line ↔ an off-cycle payroll deposit.
  const letterBonus = letters.map(l => extractStatedBonus(l.text_density?.text_sample || '')).find((v): v is number => v !== null) ?? null
  const stubBonus = stubs.map(s => extractStubBonusYtd(s.text_density?.text_sample || '')).find((v): v is number => v !== null) ?? null
  if (letterBonus && stubBonus && Math.abs(letterBonus - stubBonus) / letterBonus <= 0.01) {
    flags.push({
      code: 'cross_doc_bonus_corroborated',
      severity: 'info',
      evidence_en: `The bonus stated in the employment/compensation letter ($${letterBonus.toLocaleString()}) equals the YTD Bonus line on the pay stub ($${stubBonus.toLocaleString()}) to the cent. Two independent documents agree.`,
      evidence_zh: `雇佣/薪酬函所述奖金（$${letterBonus.toLocaleString()}）与工资单 YTD 奖金行（$${stubBonus.toLocaleString()}）分毫不差。两份独立文件互证。`,
    })
  }
  const bonus = letterBonus ?? stubBonus
  if (bonus && regularNet) {
    const offCycle = deposits.filter(d => d.amount >= regularNet * 1.5)
    for (const d of offCycle) {
      const extra = d.amount - regularNet
      const netFrac = extra / bonus
      // After-tax share of a lump-sum bonus in Ontario sits between ~45% (top
      // bracket) and ~75% (low bracket); one regular net + that share is the
      // deposit an employer's payroll run produces when the bonus is paid
      // with a regular period.
      if (netFrac >= 0.42 && netFrac <= 0.78) {
        flags.push({
          code: 'bonus_deposit_reconciled',
          severity: 'info',
          file: d.file,
          evidence_en: `Payroll deposit of $${d.amount.toLocaleString()} (${d.line}) = one regular net pay ($${regularNet.toLocaleString()}) + $${extra.toLocaleString()}, which is ${Math.round(netFrac * 100)}% of the $${bonus.toLocaleString()} gross bonus stated in the documents — the after-withholding value of that bonus. The larger deposit is the bonus payout, not an unexplained spike.`,
          evidence_zh: `工资入账 $${d.amount.toLocaleString()}（${d.line}）= 一期常规净薪 $${regularNet.toLocaleString()} + $${extra.toLocaleString()}，后者为文件所述税前奖金 $${bonus.toLocaleString()} 的 ${Math.round(netFrac * 100)}%，即扣税后的奖金实发。该笔较大入账是奖金发放，不是无法解释的异常。`,
        })
        break
      }
    }
  }

  // 3b) The stub says cheque, the bank shows e-Transfers of the same net —
  //     or the pay arrives by e-Transfer at all. Payroll systems pay by
  //     direct deposit under the employer's name; a personal e-Transfer of
  //     exactly the net figure is what accompanies a home-made stub.
  if (regularNet && stubs.length) {
    const stubText = stubs.map(s => s.text_density?.text_sample || '').join(' ')
    const stubSaysCheque = /\bcheque\s*(?:date|no|number|#)|\bpay\s*cheque\b|\bcheck\s*(?:date|no)/i.test(stubText)
    const inbound: Array<{ amount: number; method: string; where: string }> = []
    for (const b of banks) {
      let prev: number | null = null
      for (const t of splitStatementTransactions(b.text_density!.text_sample)) {
        if (/opening\s+balance/i.test(t.desc)) { if (t.amount !== null) prev = t.amount; continue }
        const isIn = t.direction ? t.direction === 'in' : (t.balance !== null && prev !== null && t.balance > prev)
        if (t.balance !== null) prev = t.balance
        if (!isIn || t.amount === null) continue
        if (Math.abs(t.amount - regularNet) > Math.max(1, regularNet * 0.01)) continue
        const method = /e-?transfer|e-?tfr|interac/i.test(t.desc) ? 'e-Transfer' : /cheque|chq/i.test(t.desc) ? 'cheque' : /payroll|pay\s*dep/i.test(t.desc) ? 'payroll' : 'deposit'
        inbound.push({ amount: t.amount, method, where: `${b.file_name}: ${t.month} ${t.day}` })
      }
    }
    const methods = Array.from(new Set(inbound.map(i => i.method)))
    const nonPayroll = inbound.filter(i => i.method !== 'payroll')
    if (nonPayroll.length && (methods.length > 1 || methods[0] === 'e-Transfer' || (stubSaysCheque && methods.includes('e-Transfer')))) {
      flags.push({
        code: 'pay_method_mismatch',
        severity: 'medium',
        evidence_en: `The net pay on the stubs ($${regularNet.toLocaleString()}) reaches the account as ${methods.join(' and ')} (${nonPayroll.slice(0, 3).map(i => `${i.where} ${i.method}`).join('; ')})${stubSaysCheque ? ' while the stub itself is laid out as a cheque' : ''}. Payroll systems pay by direct deposit under the employer's name; personal e-Transfers or cheques carrying exactly the net figure leave no payroll trail and are what accompanies a home-made stub. Ask who sends the money and for a payroll register or T4 from the employer.`,
        evidence_zh: `工资单上的净薪（$${regularNet.toLocaleString()}）以 ${methods.join(' 与 ')} 的方式到账（${nonPayroll.slice(0, 3).map(i => `${i.where} ${i.method}`).join('；')}）${stubSaysCheque ? '，而工资单本身按支票版式排印' : ''}。工资系统用雇主名义直存发薪；金额恰等于净薪的个人电子转账或支票没有工资系统痕迹，正是自制工资单配套的到账方式。请问清是谁付款，并向雇主索要工资登记册或 T4。`,
      })
    }
  }

  // 4) Rent-shaped recurring payment.
  const rent = findRecurringMonthlyPayment(bankTexts)
  if (rent) {
    flags.push({
      code: 'recurring_rent_like_payment',
      severity: 'info',
      evidence_en: `A $${rent.amount.toLocaleString()} outgoing "${rent.label}" recurs within the first days of ${rent.months} consecutive statement months — the shape of a current rent payment. Compare with the rent the applicant declares for their present address; on-time recurring rent is direct rental-history evidence.`,
      evidence_zh: `每月最初几天都有一笔 $${rent.amount.toLocaleString()} 的「${rent.label}」支出，连续 ${rent.months} 个月——符合当前房租的支付形态。请与申请人申报的现住址租金对照；按时的规律付租是租务历史的直接证据。`,
    })
  }
}
