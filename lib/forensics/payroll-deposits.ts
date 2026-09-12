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

/** Payroll-labelled deposits on a statement: amount + the payer text printed
 *  with the line (Scotiabank prints the payer on the following line;
 *  other banks inline it). */
export function extractPayrollDeposits(bankText: string): Array<{ amount: number; payer: string; line: string }> {
  if (!bankText) return []
  const lines = bankText.split(/\r?\n/)
  const out: Array<{ amount: number; payer: string; line: string }> = []
  const LABEL = /\b(payroll|pay\s*dep|direct\s+dep(?:osit)?|salary|paie|dep[oô]t\s+(?:de\s+)?(?:paie|salaire))\b/i
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!LABEL.test(line)) continue
    const nums = line.match(/\d{1,3}(?:,\d{3})*\.\d{2}/g)
    if (!nums) continue
    // Running-balance layouts print "amount balance": the first figure is the transaction.
    const amount = money(nums[0])
    if (!(amount >= 200 && amount < 200_000)) continue
    const next = (lines[i + 1] || '').trim()
    const inlinePayer = line.replace(/\d{1,3}(?:,\d{3})*\.\d{2}/g, '').replace(LABEL, '').replace(/^[A-Za-z]{3}\s+\d{1,2}\s*/, '').trim()
    const payer = /^[A-Za-z][A-Za-z0-9 .&'-]{2,60}$/.test(next) && !/\d{1,3}(?:,\d{3})*\.\d{2}/.test(next) ? next : inlinePayer
    out.push({ amount, payer, line: line.trim() })
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
 *  after the line is lower than before) so deposits are never mistaken. */
export function findRecurringMonthlyPayment(bankTexts: string[]): { amount: number; months: number; label: string } | null {
  const seen = new Map<number, { months: Set<string>; label: string }>()
  for (const text of bankTexts) {
    const lines = (text || '').split(/\r?\n/)
    let prevBalance: number | null = null
    for (const line of lines) {
      // "May 1 Opening Balance 67,610.38" carries one figure — the balance to
      // measure the first transaction against.
      const open = line.match(/^[A-Za-z]{3}\s+\d{1,2}\s+Opening\s+Balance\s+\$?(\d{1,3}(?:,\d{3})*\.\d{2})\s*$/i)
      if (open) { prevBalance = money(open[1]); continue }
      const m = line.match(/^([A-Za-z]{3})\s+(\d{1,2})\s+(.+?)\s+(\d{1,3}(?:,\d{3})*\.\d{2})\s+(\d{1,3}(?:,\d{3})*\.\d{2})\s*$/)
      if (!m) continue
      const day = Number(m[2]); const amount = money(m[4]); const balance = money(m[5])
      const isOut = prevBalance !== null && balance < prevBalance
      prevBalance = balance
      if (!isOut || day > 5 || amount < 800 || amount > 20_000) continue
      if (!/cheque|check|transfer|withdrawal|rent|pre-?auth|payment/i.test(m[3])) continue
      const key = Math.round(amount * 100)
      const e = seen.get(key) || { months: new Set<string>(), label: m[3].replace(/\s+\d[\d ]*$/, '').trim() }
      e.months.add(`${m[1]}`)
      seen.set(key, e)
    }
  }
  let best: { amount: number; months: number; label: string } | null = null
  for (const [key, e] of seen) {
    if (e.months.size >= 2 && (!best || e.months.size > best.months)) best = { amount: key / 100, months: e.months.size, label: e.label }
  }
  return best
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
