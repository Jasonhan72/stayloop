// -----------------------------------------------------------------------------
// Landlord reading — what each uploaded document tells a landlord or agent.
//
// The per-file cards used to list only technical facts (PDF producer, text
// density, YTD ratio). What a landlord actually wants from a bank statement
// is: who is paid into it and how often, is the rent already being paid, is
// there money left at month end, are there NSFs, payday lenders, casinos,
// collection agencies, unexplained lump sums. From a credit report: is anyone
// unpaid right now, how much goes to debt each month, how long is the file.
// From a pay stub: employer, frequency, take-home, whether deductions look
// like a real payroll, garnishments. This module writes those readings
// deterministically from the extracted text and structured facts, in the
// language of SingleKey / TransUnion tenant reports and bank underwriting
// (payroll match, deposit regularity, NSF pattern, large deposits over 50%
// of monthly income, reserves in months, undisclosed creditors).
//
// Tone: good / neutral / warn / bad. Every bullet cites the figure it read.
// A model-written reading (coherence pass) is merged in afterwards, marked
// source 'model'.
// -----------------------------------------------------------------------------

import type { LandlordReading, ReadingBullet, PerFileForensics, PaystubExtraction, OcrResult } from './types'
import type { CreditReport } from '../screening-types'
import { splitStatementTransactions, extractPayrollDeposits, detectPayrollProcessor, findRecurringMonthlyPayment, analyzeStatementLiquidity } from './payroll-deposits'
import { analyzeCreditReport } from '../screening/creditAnalysis'

const money = (n: number) => '$' + Math.round(n).toLocaleString('en-CA')
const b = (zh: string, en: string, tone: ReadingBullet['tone'] = 'neutral'): ReadingBullet => ({ zh, en, tone, source: 'measured' })

// Merchants and counterparties that change how a landlord reads a statement.
const PAYDAY_RE = /\b(money\s*mart|cash\s*money|easy\s*financial|easyfinancial|fairstone|goeasy|lendcare|cash\s*4\s*you|cashmax|speedy\s*cash|icash|nyble|bree\b|lendified|mogo|spring\s*financial|payday|cash\s*advance|loan\s*express|focus\s*cash)/i
const GAMBLING_RE = /\b(olg\b|proline|casino|bet365|betmgm|draftkings|fanduel|thescore\s*bet|pokerstars|sports\s*interaction|betway|bet99|888\s*poker|playnow|lottery|lotto|slots?\b|bingo)/i
const CRYPTO_RE = /\b(shakepay|newton\b|coinbase|binance|kraken|bitbuy|ndax|crypto|bitcoin|wealthsimple\s*crypto|coinsquare)/i
const COLLECTION_RE = /\b(collection|cbv\b|global\s*credit|metcredit|financial\s*debt\s*recovery|fdr\b|d\s*&\s*a\s*collection|credit\s*bureau\s*services|allied\s*international|garnish)/i
const GOVT_INCOME_RE = /\b(canada\s*(child\s*benefit|ccb|fed|federal)|ei\s*(benefit|canada)|employment\s*insurance|odsp|ontario\s*works|cpp\b|oas\b|gst\/?hst|trillium|cra\b|service\s*canada|government\s*of\s*canada|gouvernement)/i
const ETRANSFER_RE = /\b(e-?transfer|interac|e-?tfr|etransfer)\b/i
const CARD_PAYMENT_RE = /\b(credit\s*card|visa|mastercard|amex|pc\s*transfer\s*to\s*credit|payment\s*to\s*(td\s*)?visa)/i
const MORTGAGE_RE = /\b(mortgage|mtg\b|hypoth)/i
const AUTO_RE = /\b(lease|auto|toyota|honda|kia|hyundai|ford|gm\s*financial|nissan|vw\s*credit|bmw|mercedes|cdlsi|dealer)/i

export interface ReadingContext {
  monthlyRent: number | null
  claimedMonthlyIncome: number | null
  applicantName?: string | null
  /** net pay per period from the stubs — to recognise salary arriving by e-Transfer */
  stubNetPays?: number[]
}

// When a layout has neither a deposit column nor a usable running balance
// (the first row of a vertical OCR dump), the description still says which
// way the money went.
const IN_LABEL = /\b(deposit|dep\b|payroll|pay\b|cheque|chq|transfer\s+from|refund|credit\s+memo|rebate|cash\s+back)\b|\b(e-?transfer|e-?tfr|interac)\b(?!.*\b(send|sent|to)\b)/i
const OUT_LABEL = /\b(withdraw|w\/d|purchase|payment|fee|send|sent|debit|atm\s+w|bill|pos\b|interest\s+charge)\b/i
function inferDirection(t: { desc: string; direction?: 'in' | 'out' | null; balance: number | null }, prevBal: number | null): 'in' | 'out' | null {
  if (t.direction) return t.direction
  if (t.balance !== null && prevBal !== null) return t.balance > prevBal ? 'in' : t.balance < prevBal ? 'out' : null
  if (/^send\b/i.test(t.desc)) return 'out'
  if (IN_LABEL.test(t.desc)) return 'in'
  if (OUT_LABEL.test(t.desc)) return 'out'
  return null
}

export function readBankStatement(text: string, ctx: ReadingContext, ocrOnly: boolean): LandlordReading {
  const bullets: ReadingBullet[] = []
  const asks: LandlordReading['asks'] = []
  const flat = (text || '').replace(/\s+/g, ' ')
  // Row parsing needs the original line breaks for TD-style layouts.
  const txns = splitStatementTransactions(text || '')
  const withBalance = txns.filter(t => t.balance !== null)

  // Holder block: the words between the title (MR / MRS / MISS …) and the
  // first digit of the address. Two different names = joint; the same name
  // printed twice (TD prints the mailing line and the account line) is one
  // holder.
  const holder = flat.match(/\b(?:MR|MRS|MS|MISS|DR)\.?\s+([A-Z][A-Z' -]{3,80}?)\s+\d/)
  let joint = /\b(?:and|&)\s+[A-Z][A-Z' -]{3,}\s+\d/.test(flat)
  if (!joint && holder) {
    const toks = holder[1].split(/\s+/).filter(t => t.length >= 2 && !/^(MR|MRS|MS|MISS|DR)$/.test(t))
    joint = toks.length >= 5 && new Set(toks).size === toks.length
  }
  if (joint) bullets.push(b('联名账户：户名下有两个人，入账和支出都是两个人共用的，不能全算申请人本人的。', 'Joint account: two holders are named, so deposits and spending belong to both — not all of it is the applicant\'s.', 'neutral'))

  // Income deposits
  const payroll = extractPayrollDeposits(text || '')
  if (payroll.length) {
    const total = payroll.reduce((s, d) => s + d.amount, 0)
    const payers = Array.from(new Set(payroll.map(d => d.payer).filter(Boolean)))
    const proc = payers.map(p => detectPayrollProcessor(p)).find(Boolean)
    bullets.push(b(
      `工资入账 ${payroll.length} 笔，合计 ${money(total)}，付款方「${payers.slice(0, 2).join(' / ') || '未标明'}」${proc ? `（${proc.name.split(' — ')[0]}，工资代发商）` : ''}。`,
      `${payroll.length} payroll deposit(s) totalling ${money(total)} from "${payers.slice(0, 2).join(' / ') || 'unnamed'}"${proc ? ` (${proc.name.split(' — ')[0]}, a payroll processor)` : ''}.`,
      'good'))
    if (ctx.claimedMonthlyIncome && withBalance.length) {
      const months = Math.max(1, new Set(txns.map(t => t.month)).size)
      const perMonth = total / months
      const ratio = perMonth / ctx.claimedMonthlyIncome
      if (ratio < 0.45) bullets.push(b(`按月折算的工资入账约 ${money(perMonth)}，只有申报月收入 ${money(ctx.claimedMonthlyIncome)} 的 ${Math.round(ratio * 100)}%——差额去了哪个账户？`, `Payroll works out to ~${money(perMonth)}/month, only ${Math.round(ratio * 100)}% of the ${money(ctx.claimedMonthlyIncome)} claimed — where does the rest land?`, 'warn'))
      else bullets.push(b(`按月折算的工资入账约 ${money(perMonth)}，与申报月收入 ${money(ctx.claimedMonthlyIncome)} 相符（税后到手）。`, `Payroll works out to ~${money(perMonth)}/month against ${money(ctx.claimedMonthlyIncome)} claimed (net of tax) — consistent.`, 'good'))
    }
  } else if (txns.length > 0) {
    // Salary arriving as an Interac e-Transfer (amount equal to the stub's
    // net pay) is not a payroll deposit: no employer name, no CRA trail, and
    // exactly what a home-made stub is paired with. Say so, ask who sent it.
    const nets = (ctx.stubNetPays || []).filter(n => n > 0)
    // inbound = deposit column, or the running balance went up
    let prevBal: number | null = null
    const inbound: typeof txns = []
    for (const t of txns) {
      if (/opening\s+balance/i.test(t.desc)) { if (t.amount !== null) prevBal = t.amount; continue }
      const isIn = inferDirection(t, prevBal) === 'in'
      if (t.balance !== null) prevBal = t.balance
      if (isIn && t.amount !== null) inbound.push(t)
    }
    const netMatch = inbound.find(t => nets.some(n => Math.abs(t.amount! - n) <= Math.max(1, n * 0.01)))
    if (netMatch) {
      const how = /cheque|chq/i.test(netMatch.desc) ? ['支票存入', 'a cheque deposit'] : ETRANSFER_RE.test(netMatch.desc) ? ['Interac 电子转账', 'an Interac e-Transfer'] : ['普通存款', 'a plain deposit']
      bullets.push(b(`工资以${how[0]}形式到账（${netMatch.month} ${netMatch.day} 日 ${money(netMatch.amount!)}，与工资单到手金额一致），不是雇主工资直存——看不到付款方，也没有工资系统痕迹；请核实汇款人是谁。`, `Pay arrives as ${how[1]} (${netMatch.month} ${netMatch.day}, ${money(netMatch.amount!)}, equal to the stub's net) rather than a payroll deposit — no employer name, no payroll trail; find out who sends it.`, 'warn'))
      asks.push({ zh: `${money(netMatch.amount!)} 那笔入账是谁付的？为什么雇主不用工资直存？`, en: `Who pays the ${money(netMatch.amount!)} deposit, and why is pay not a direct payroll deposit?` })
    } else {
      bullets.push(b('对账单里没有标为工资的入账——收入靠什么进账，需要申请人解释。', 'No deposit is labelled payroll — ask how income actually arrives.', 'warn'))
      asks.push({ zh: '这个账户没有工资入账，工资打到哪个账户？请提供那个账户的对账单。', en: 'No payroll lands here — which account receives pay? Provide that account\'s statement.' })
    }
  }
  const govt = txns.filter(t => t.amount !== null && GOVT_INCOME_RE.test(`${t.desc} ${t.trailing}`) && t.balance !== null)
  if (govt.length) bullets.push(b(`有 ${govt.length} 笔政府款项（福利 / 退税 / 补贴类）入账。`, `${govt.length} government deposit(s) (benefits / refunds).`, 'neutral'))
  const etIn = txns.filter(t => ETRANSFER_RE.test(t.desc) && t.balance !== null && t.amount !== null)
  if (etIn.length >= 6) bullets.push(b(`Interac 电子转账频繁（${etIn.length} 笔）——个人间转账多，若其中有固定收款，可能是未申报的收入或借款。`, `${etIn.length} Interac e-Transfers — frequent person-to-person movement; recurring inbound ones may be undeclared income or loans.`, 'neutral'))

  // Large deposits (bank rule: > 50% of monthly income needs sourcing)
  if (ctx.claimedMonthlyIncome && withBalance.length) {
    const large = [] as string[]
    let prev: number | null = null
    const nets = (ctx.stubNetPays || []).filter(n => n > 0)
    for (const t of txns) {
      if (/opening\s+balance/i.test(t.desc)) { if (t.amount !== null) prev = t.amount; continue }
      const isIn = inferDirection(t, prev) === 'in'
      if (t.balance !== null) prev = t.balance
      const isPay = /payroll|pay\s*dep|salary/i.test(t.desc) || (t.amount !== null && nets.some(n => Math.abs(t.amount! - n) <= Math.max(1, n * 0.01)))
      if (isIn && t.amount && t.amount > ctx.claimedMonthlyIncome * 0.5 && !isPay) large.push(`${t.month} ${t.day} ${money(t.amount)}（${(t.desc + ' ' + t.trailing).trim().slice(0, 40)}）`)
    }
    if (large.length) {
      bullets.push(b(`大额非工资入账 ${large.length} 笔：${large.slice(0, 3).join('；')}。银行审贷惯例：超过月收入一半的入账要说明来源。`, `${large.length} large non-payroll deposit(s): ${large.slice(0, 3).join('; ')}. Lender convention: anything over half a month's income needs a source.`, 'warn'))
      asks.push({ zh: `请说明 ${large[0]} 这笔入账的来源。`, en: `Please explain the source of ${large[0]}.` })
    }
  }

  // Rent and other obligations
  const rent = findRecurringMonthlyPayment([text || ''])
  if (rent) {
    const vs = ctx.monthlyRent ? (rent.amount >= ctx.monthlyRent * 0.95 ? `不低于申请的 ${money(ctx.monthlyRent)}` : `低于申请的 ${money(ctx.monthlyRent)}`) : ''
    bullets.push(b(`每月月初固定支出 ${money(rent.amount)}（${rent.label}），连续 ${rent.months} 个月——形态像现租${vs ? '，' + vs : ''}。`, `A ${money(rent.amount)} "${rent.label}" goes out early each month, ${rent.months} months running — looks like current rent${ctx.monthlyRent ? (rent.amount >= ctx.monthlyRent * 0.95 ? `, at or above the ${money(ctx.monthlyRent)} applied for` : `, below the ${money(ctx.monthlyRent)} applied for`) : ''}.`, ctx.monthlyRent && rent.amount >= ctx.monthlyRent * 0.95 ? 'good' : 'neutral'))
  } else {
    // One statement month cannot show recurrence — look for a single
    // rent-shaped payment in the first days of the month instead.
    let prev: number | null = null
    let candidate: { amount: number; label: string; day: number } | null = null
    const openRow = txns.find(t => /opening\s+balance/i.test(t.desc) && t.amount !== null)
    if (openRow) prev = openRow.amount
    for (const t of txns) {
      if (/opening\s+balance/i.test(t.desc)) continue
      const dir = inferDirection(t, prev)
      if (t.balance !== null) prev = t.balance
      if (dir === null) continue
      const isOut = dir === 'out'
      if (isOut && t.day <= 5 && t.amount && t.amount >= 800 && t.amount <= 20_000 && /cheque|check|transfer|withdrawal|rent|pre-?auth|payment/i.test(t.desc)) { candidate = { amount: t.amount, label: t.desc.replace(/\s+\d[\d ]*$/, '').trim(), day: t.day }; break }
    }
    if (candidate) {
      bullets.push(b(`${candidate.day} 日有一笔 ${money(candidate.amount)} 支出（${candidate.label}）——像是当月房租${ctx.monthlyRent ? (candidate.amount >= ctx.monthlyRent * 0.95 ? `，不低于申请的 ${money(ctx.monthlyRent)}` : `，低于申请的 ${money(ctx.monthlyRent)}`) : ''}；只有一个月，请对照上月对账单确认。`, `A ${money(candidate.amount)} "${candidate.label}" on day ${candidate.day} looks like this month's rent${ctx.monthlyRent ? (candidate.amount >= ctx.monthlyRent * 0.95 ? `, at or above the ${money(ctx.monthlyRent)} applied for` : `, below the ${money(ctx.monthlyRent)} applied for`) : ''}; one month only — confirm with the previous statement.`, 'neutral'))
    } else if (txns.length > 0) {
      bullets.push(b('看不到固定的房租支出——要么现住免租（家人处），要么房租从别的账户或现金付。', 'No recurring rent-sized payment — either living rent-free or paying from another account / in cash.', 'neutral'))
      asks.push({ zh: '目前的房租从哪个账户支付？', en: 'Which account pays the current rent?' })
    }
  }
  const mortgage = txns.filter(t => MORTGAGE_RE.test(t.desc) && t.amount).length
  if (mortgage) bullets.push(b(`有按揭还款记录（${mortgage} 笔）——申请人可能有自住或出租房产，问清楚。`, `${mortgage} mortgage payment(s) — the applicant may own property; ask.`, 'neutral'))
  const auto = txns.filter(t => AUTO_RE.test(`${t.desc} ${t.trailing}`) && t.amount && t.balance !== null).length
  if (auto) bullets.push(b(`车贷 / 车租还款 ${auto} 笔。`, `${auto} auto loan / lease payment(s).`, 'neutral'))
  const card = txns.filter(t => CARD_PAYMENT_RE.test(`${t.desc} ${t.trailing}`) && t.amount)
  if (card.length) {
    const sum = card.reduce((s, t) => s + (t.amount || 0), 0)
    bullets.push(b(`信用卡还款 ${card.length} 笔，合计 ${money(sum)}。`, `${card.length} credit-card payment(s) totalling ${money(sum)}.`, 'neutral'))
  }

  // Risk merchants
  const payday = txns.filter(t => PAYDAY_RE.test(`${t.desc} ${t.trailing}`))
  if (payday.length) { bullets.push(b(`高息 / 发薪日贷款机构往来 ${payday.length} 笔（${Array.from(new Set(payday.map(t => (t.desc + ' ' + t.trailing).match(PAYDAY_RE)?.[0]))).slice(0, 3).join('、')}）——银行审贷视为现金流紧张的强信号。`, `${payday.length} transaction(s) with payday / high-cost lenders (${Array.from(new Set(payday.map(t => (t.desc + ' ' + t.trailing).match(PAYDAY_RE)?.[0]))).slice(0, 3).join(', ')}) — lenders read this as cash-flow stress.`, 'bad')); asks.push({ zh: '发薪日贷款是否已结清？目前还有多少欠款？', en: 'Is the payday loan repaid? What is still owed?' }) }
  const gambling = txns.filter(t => GAMBLING_RE.test(`${t.desc} ${t.trailing}`))
  if (gambling.length) { const sum = gambling.reduce((s, t) => s + (t.amount || 0), 0); bullets.push(b(`博彩 / 彩票类支出 ${gambling.length} 笔，合计 ${money(sum)}。`, `${gambling.length} gambling / lottery transaction(s) totalling ${money(sum)}.`, gambling.length >= 3 ? 'bad' : 'warn')) }
  const remit = txns.filter(t => /\b(remitly|wise\b|western\s*union|moneygram|xoom|ria\b|paysend|worldremit)\b/i.test(`${t.desc} ${t.trailing}`))
  if (remit.length) bullets.push(b(`国际汇款 ${remit.length} 笔（${Array.from(new Set(remit.map(t => t.desc.split(' ')[0]))).slice(0, 2).join('、')}）——有海外汇款义务，是每月固定支出的一部分。`, `${remit.length} international remittance(s) (${Array.from(new Set(remit.map(t => t.desc.split(' ')[0]))).slice(0, 2).join(', ')}) — money sent abroad is part of the monthly outgoings.`, 'neutral'))
  const crypto = txns.filter(t => CRYPTO_RE.test(`${t.desc} ${t.trailing}`))
  if (crypto.length) bullets.push(b(`加密货币交易所往来 ${crypto.length} 笔——余额可能有一部分在交易所里，波动大。`, `${crypto.length} crypto-exchange transfer(s) — part of the money may sit on an exchange and swing in value.`, 'neutral'))
  const collections = txns.filter(t => COLLECTION_RE.test(`${t.desc} ${t.trailing}`))
  if (collections.length) bullets.push(b(`有向催收机构 / 扣押付款 ${collections.length} 笔——有未结清的欠款在被追讨。`, `${collections.length} payment(s) to a collection agency / garnishment — a debt is being pursued.`, 'bad'))

  // Balances and NSF
  const liq = analyzeStatementLiquidity([text || ''])
  if (liq.rows > 0) {
    const first = withBalance[0]?.balance ?? null
    const last = liq.last_balance
    const trend = first != null && last != null ? (last > first * 1.05 ? '上升' : last < first * 0.95 ? '下降' : '持平') : ''
    const months = ctx.monthlyRent && liq.min_balance != null ? liq.min_balance / ctx.monthlyRent : null
    bullets.push(b(
      `期内最低余额 ${money(liq.min_balance ?? 0)}${months != null ? `，相当于 ${months.toFixed(1)} 个月申请租金` : ''}；期末 ${money(last ?? 0)}${trend ? `，余额${trend}` : ''}。`,
      `Lowest balance ${money(liq.min_balance ?? 0)}${months != null ? ` = ${months.toFixed(1)} months of the rent applied for` : ''}; closing ${money(last ?? 0)}${trend ? `, trend ${trend === '上升' ? 'up' : trend === '下降' ? 'down' : 'flat'}` : ''}.`,
      months == null ? 'neutral' : months >= 3 ? 'good' : months < 1 ? 'warn' : 'neutral'))
    if (liq.nsf_count > 0) { bullets.push(b(`NSF / 退票 / 透支费 ${liq.nsf_count} 次——账户经常见底。`, `${liq.nsf_count} NSF / returned-item / overdraft charge(s) — the account runs dry.`, liq.nsf_count >= 2 ? 'bad' : 'warn')); asks.push({ zh: 'NSF 发生在什么情况下？之后是否补足？', en: 'What caused the NSF, and was it covered afterwards?' }) }
    else bullets.push(b('期内没有 NSF、退票或透支费。', 'No NSF, returned items or overdraft charges in the period.', 'good'))
  } else if (ocrOnly) {
    bullets.push(b('扫描件，未能逐笔解析余额列；以上按 OCR 文字判断，逐笔金额请对照原件。', 'Scanned statement; the balance column could not be parsed row by row — readings above come from OCR text, check amounts against the original.', 'neutral'))
  }
  return { bullets, asks }
}

export function readPayStub(ext: PaystubExtraction | null | undefined, text: string, ytdRatio: number | null | undefined, oneOffYtd: number | null | undefined): LandlordReading {
  const bullets: ReadingBullet[] = []
  const asks: LandlordReading['asks'] = []
  if (!ext) return { bullets, asks }
  const freqZh: Record<string, string> = { weekly: '每周', biweekly: '双周', semimonthly: '半月', monthly: '每月' }
  if (ext.employer_name) bullets.push(b(`雇主：${ext.employer_name}${ext.pay_frequency ? `，${freqZh[ext.pay_frequency] || ext.pay_frequency}发薪` : ''}${ext.pay_date ? `，最近一期 ${ext.pay_date}` : ''}。`, `Employer ${ext.employer_name}${ext.pay_frequency ? `, paid ${ext.pay_frequency}` : ''}${ext.pay_date ? `, latest period ${ext.pay_date}` : ''}.`, 'neutral'))
  if (ext.period_gross && ext.period_net) {
    const ppy = ({ weekly: 52, biweekly: 26, semimonthly: 24, monthly: 12 } as Record<string, number>)[ext.pay_frequency || ''] || null
    const netMonthly = ppy ? ext.period_net * ppy / 12 : null
    bullets.push(b(`本期毛收入 ${money(ext.period_gross)}，到手 ${money(ext.period_net)}${netMonthly ? `，折合每月到手约 ${money(netMonthly)}` : ''}——房租能否从到手收入里付得出，看这个数。`, `Period gross ${money(ext.period_gross)}, take-home ${money(ext.period_net)}${netMonthly ? ` ≈ ${money(netMonthly)}/month net` : ''} — the figure rent actually comes out of.`, 'neutral'))
  }
  if (ext.annual_salary) bullets.push(b(`年化基本工资 ${money(ext.annual_salary)}（按单期毛收入 × 期数）。`, `Annualised base ${money(ext.annual_salary)} (period gross × periods).`, 'neutral'))
  if (typeof ytdRatio === 'number') {
    if (ytdRatio >= 0.8 && ytdRatio <= 1.2) bullets.push(b('年初至今累计与年薪进度吻合——不是只做了一两期的新员工，也没有虚报。', 'Year-to-date matches the salary run-rate — not a brand-new hire, nothing inflated.', 'good'))
    else if (ytdRatio > 1.2 && oneOffYtd) bullets.push(b(`年初至今高于常规进度，工资单列明了 ${money(oneOffYtd)} 的奖金 / 一次性收入——是真实收入但不稳定，评估租金承受力时以基本工资为准。`, `YTD runs above the base run-rate; the stub itemises ${money(oneOffYtd)} of bonus / one-off pay — real income but not recurring; judge affordability on base pay.`, 'neutral'))
    else if (ytdRatio < 0.5) { bullets.push(b('年初至今累计明显低于年薪进度——可能是今年新入职、休假或收入不稳定。', 'YTD is well below the salary run-rate — a new hire this year, leave, or unstable earnings.', 'warn')); asks.push({ zh: '入职日期是什么时候？', en: 'What was the start date?' }) }
  }
  if (/garnish|saisie|family\s*responsibility|FRO\b|child\s*support|maintenance\s*enforcement/i.test(text)) { bullets.push(b('⚠ 工资单上有工资扣押 / 家庭责任办公室扣款——有法院或政府强制执行的债务。', 'Wage garnishment / Family Responsibility Office deduction on the stub — a court- or government-enforced obligation.', 'bad')) }
  if (/RRSP|pension|group\s*(health|benefit|insurance)|dental|LTD|life\s*insurance|union\s*dues/i.test(text)) bullets.push(b('有福利 / 退休金 / 工会扣款——正式受雇员工的特征，不是合同工或自开的单子。', 'Benefits / pension / union deductions present — the profile of a regular employee, not a contractor or a home-made stub.', 'good'))
  if (ext.hours_worked && ext.pay_frequency) {
    const weeks = ({ weekly: 1, biweekly: 2, semimonthly: 2.17, monthly: 4.33 } as Record<string, number>)[ext.pay_frequency] || 2
    const perWeek = ext.hours_worked / weeks
    if (perWeek < 25) bullets.push(b(`本期工时折合每周约 ${perWeek.toFixed(0)} 小时——兼职，收入随排班浮动。`, `Hours work out to ~${perWeek.toFixed(0)}/week — part-time; income moves with the schedule.`, 'warn'))
  }
  return { bullets, asks }
}

export function readCreditReportFile(cr: CreditReport | null | undefined, monthlyIncome: number | null, monthlyRent: number | null): LandlordReading {
  const bullets: ReadingBullet[] = []
  const asks: LandlordReading['asks'] = []
  if (!cr) return { bullets, asks }
  const a = analyzeCreditReport(cr as never, { monthlyIncome: monthlyIncome ?? undefined })
  if (cr.credit_score != null) {
    const band = cr.credit_score >= 760 ? ['优秀', 'excellent'] : cr.credit_score >= 725 ? ['很好', 'very good'] : cr.credit_score >= 660 ? ['良好', 'good'] : cr.credit_score >= 560 ? ['一般', 'fair'] : ['差', 'poor']
    bullets.push(b(`信用分 ${cr.credit_score}（${band[0]}）${cr.report_date ? `，报告日期 ${cr.report_date}` : ''}。`, `Score ${cr.credit_score} (${band[1]})${cr.report_date ? `, dated ${cr.report_date}` : ''}.`, cr.credit_score >= 660 ? 'good' : cr.credit_score >= 560 ? 'neutral' : 'bad'))
  }
  if (a) {
    if (a.totalPastDue > 0) { bullets.push(b(`当前逾期 ${money(a.totalPastDue)}，涉及 ${a.delinquent.length} 个账户——现在就有账没按时付。`, `${money(a.totalPastDue)} currently past due across ${a.delinquent.length} account(s) — bills are going unpaid right now.`, 'bad')); asks.push({ zh: `${a.delinquent[0]?.creditor || '逾期账户'} 的逾期是什么情况？`, en: `What is the story on the ${a.delinquent[0]?.creditor || 'past-due account'}?` }) }
    else if (a.delinquent.length) bullets.push(b(`有 ${a.delinquent.length} 个账户有迟付记录，目前无逾期。`, `${a.delinquent.length} account(s) show late payments; nothing past due now.`, 'warn'))
    else bullets.push(b('所有账户按时付款，无逾期、无催收。', 'Every account paid as agreed — no past-due, no collections.', 'good'))
    const rev = a.categories.find(c => c.key === 'revolving')
    if (a.revolvingUtilization != null) bullets.push(b(`信用卡使用率 ${Math.round(a.revolvingUtilization * 100)}%${rev ? `（欠 ${money(rev.balance ?? 0)} / 额度 ${money(rev.limit ?? 0)}）` : ''}${a.revolvingUtilization > 1 ? '——已超出额度，卡刷爆了' : a.revolvingUtilization >= 0.75 ? '——接近刷满，现金紧' : a.revolvingUtilization <= 0.3 ? '——健康' : ''}。`, `Revolving utilisation ${Math.round(a.revolvingUtilization * 100)}%${rev ? ` (${money(rev.balance ?? 0)} of ${money(rev.limit ?? 0)})` : ''}${a.revolvingUtilization > 1 ? ' — over the limit' : a.revolvingUtilization >= 0.75 ? ' — near the limit, cash is tight' : a.revolvingUtilization <= 0.3 ? ' — healthy' : ''}.`, a.revolvingUtilization > 1 ? 'bad' : a.revolvingUtilization >= 0.75 ? 'warn' : 'neutral'))
    if (cr.monthly_debt_payments) {
      const total = cr.monthly_debt_payments + (monthlyRent || 0)
      const share = monthlyIncome ? total / monthlyIncome : null
      bullets.push(b(`每月固定债务还款 ${money(cr.monthly_debt_payments)}${monthlyRent ? `，加上申请租金 ${money(monthlyRent)} 共 ${money(total)}` : ''}${share != null ? `，占毛收入 ${Math.round(share * 100)}%（银行口径 44% 为上限）` : ''}。`, `Monthly debt service ${money(cr.monthly_debt_payments)}${monthlyRent ? ` + rent ${money(monthlyRent)} = ${money(total)}` : ''}${share != null ? `, ${Math.round(share * 100)}% of gross income (lenders cap total debt service near 44%)` : ''}.`, share != null && share > 0.44 ? 'bad' : share != null && share > 0.35 ? 'warn' : 'good'))
    }
    if (a.hardInquiries12mo != null) bullets.push(b(`近 12 个月硬查询 ${a.hardInquiries12mo} 次${a.hardInquiries12mo >= 5 ? '——在密集申请信贷' : ''}。`, `${a.hardInquiries12mo} hard inquiries in 12 months${a.hardInquiries12mo >= 5 ? ' — actively seeking credit' : ''}.`, a.hardInquiries12mo >= 5 ? 'warn' : 'neutral'))
  }
  if ((cr.collections || []).length) bullets.push(b(`催收记录 ${cr.collections!.length} 条${cr.collections!.some(c => (c.balance || 0) > 0) ? '，有未结清' : '（已结清）'}。`, `${cr.collections!.length} collection(s)${cr.collections!.some(c => (c.balance || 0) > 0) ? ', some unpaid' : ' (settled)'}.`, cr.collections!.some(c => (c.balance || 0) > 0) ? 'bad' : 'warn'))
  if ((cr.bankruptcies || []).length) bullets.push(b(`破产 / 消费者提案记录 ${cr.bankruptcies!.length} 条。`, `${cr.bankruptcies!.length} bankruptcy / consumer proposal record(s).`, 'bad'))
  const n = (cr.tradelines || []).length
  if (n) {
    const opened = (cr.tradelines || []).map(t => String(t.date_opened || '')).filter(Boolean).sort()[0]
    bullets.push(b(`共 ${n} 个信贷账户${opened ? `，最早开户 ${opened}` : ''}${n < 2 ? '——档案很薄，分数参考价值有限' : ''}。`, `${n} tradeline(s)${opened ? `, oldest opened ${opened}` : ''}${n < 2 ? ' — a thin file; the score carries little weight' : ''}.`, n < 2 ? 'warn' : 'neutral'))
  }
  if (cr.employment?.current) bullets.push(b(`征信档案上的雇主：${cr.employment.current}——与申请表对照。`, `Employer on the bureau file: ${cr.employment.current} — compare with the application.`, 'neutral'))
  return { bullets, asks }
}

export function readIdDocument(ocr: OcrResult | null | undefined, applicantName: string | null | undefined, coApplicants: string[] = []): LandlordReading {
  const bullets: ReadingBullet[] = []
  const asks: LandlordReading['asks'] = []
  if (!ocr) return { bullets, asks }
  const t = ocr.text || ''
  if (ocr.apparent_doc_type && ocr.apparent_doc_type !== 'unknown') bullets.push(b(`证件类型：${ocr.apparent_doc_type}${ocr.visible_issuer ? `（${ocr.visible_issuer}）` : ''}。`, `Document: ${ocr.apparent_doc_type}${ocr.visible_issuer ? ` (${ocr.visible_issuer})` : ''}.`, 'neutral'))
  const exp = t.match(/(?:EXP|EXPIRY|EXPIRES|Expiration)[^\d]{0,12}(\d{4}[-/]\d{2}[-/]\d{2}|\d{2}\s+[A-Z]{3}\s*\/?\s*[A-Z]{0,4}\s*\d{2,4})/i)
  if (exp) {
    const d = exp[1]
    const iso = d.match(/^(\d{4})[-/](\d{2})[-/](\d{2})$/)
    const expired = iso ? new Date(`${iso[1]}-${iso[2]}-${iso[3]}T00:00:00Z`).getTime() < Date.now() : false
    bullets.push(b(`有效期至 ${d}${expired ? '——已过期' : ''}。`, `Expires ${d}${expired ? ' — EXPIRED' : ''}.`, expired ? 'warn' : 'neutral'))
  }
  if (ocr.apparent_name && applicantName) {
    const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().split(/[^a-z]+/).filter(x => x.length >= 2).sort().join(' ')
    const matches = (n: string) => norm(ocr.apparent_name!) === norm(n) || norm(n).split(' ').every(tok => norm(ocr.apparent_name!).includes(tok))
    if (matches(applicantName)) bullets.push(b(`证件姓名「${ocr.apparent_name}」与申请人一致。`, `Name on ID "${ocr.apparent_name}" matches the applicant.`, 'good'))
    else {
      const co = coApplicants.find(matches)
      if (co) bullets.push(b(`证件属于共同申请人「${ocr.apparent_name}」。`, `ID belongs to co-applicant "${ocr.apparent_name}".`, 'neutral'))
      else bullets.push(b(`证件姓名「${ocr.apparent_name}」与申请人「${applicantName}」不一致——核对。`, `Name on ID "${ocr.apparent_name}" differs from "${applicantName}" — check.`, 'bad'))
    }
  }
  const addr = t.match(/\d{1,6}\s+[A-Z][A-Z .'-]{2,30}\b(?:RD|ROAD|ST|STREET|AVE|AVENUE|BLVD|DR|DRIVE|CRES|WAY|CT|COURT|LANE|PL|PLACE|TRAIL|GATEWAY)\b[^\n]{0,40}/i)
  if (addr) bullets.push(b(`证件地址：${addr[0].trim().slice(0, 60)}——与申请表现住址对照（驾照地址常常没更新）。`, `Address on ID: ${addr[0].trim().slice(0, 60)} — compare with the application (licence addresses often lag).`, 'neutral'))
  return { bullets, asks }
}

export function readEmploymentLetter(text: string): LandlordReading {
  const bullets: ReadingBullet[] = []
  const asks: LandlordReading['asks'] = []
  const t = (text || '').replace(/\s+/g, ' ')
  const title = t.match(/\b(?:position|title|role)\s*(?:of|:|held)?\s*([A-Z][A-Za-z&/ -]{2,40}?)(?=[.,;]|\s+(?:at|with|in|since|effective|based)\b)/)
  const start = t.match(/\b(?:since|start(?:ed|ing)?(?:\s+date)?|commenc\w+(?:\s+on)?|employed\s+(?:with\s+us\s+)?(?:since|from)|hired\s+on|joined\s+(?:us\s+)?(?:on|in))\s*:?\s*([A-Z][a-z]+\s+\d{1,2},?\s+\d{4}|\d{4}-\d{2}-\d{2}|[A-Z][a-z]+\s+\d{4})/)
  // Phrases only: "Contract Awards" in a bonus table is not a contract job.
  const type = t.match(/\b((?:permanent|full[- ]time|part[- ]time)\s+(?:employee|position|employment|basis|staff)|(?:on\s+a\s+)?(?:contract|temporary|casual|seasonal)\s+(?:basis|position|employee|employment|term)|fixed[- ]term|probation(?:ary)?\s+period|currently\s+on\s+probation)\b/i)
  if (title) bullets.push(b(`职位：${title[1].trim()}。`, `Position: ${title[1].trim()}.`, 'neutral'))
  if (start) bullets.push(b(`入职：${start[1]}。`, `Employed since ${start[1]}.`, 'neutral'))
  if (type) bullets.push(b(`雇佣性质：${type[1]}${/contract|temporary|casual|seasonal|probation/i.test(type[1]) ? '——非长期职位，收入的持续性要问' : ''}。`, `Employment type: ${type[1]}${/contract|temporary|casual|seasonal|probation/i.test(type[1]) ? ' — not permanent; ask how long it runs' : ''}.`, /contract|temporary|casual|seasonal|probation/i.test(type[1]) ? 'warn' : 'good'))
  const contact = t.match(/([\w.+-]+@[\w-]+\.[\w.]+)/)
  if (contact) {
    const free = /gmail|yahoo|hotmail|outlook|icloud|proton/i.test(contact[1])
    bullets.push(b(`联系邮箱 ${contact[1]}${free ? '——免费邮箱，不是公司域名，核实时请打公司总机' : '——公司域名，可据此核实'}。`, `Contact ${contact[1]}${free ? ' — a free mailbox, not a company domain; verify through the company switchboard' : ' — company domain, usable for verification'}.`, free ? 'warn' : 'good'))
  }
  if (/compensation\s+statement|salary\s+conditions|variable\s+(pay|retribution)|bonus\s+pay\s*out/i.test(t) && !/confirm|verif|this\s+(letter|is)\s+to\s+(confirm|certify)|to\s+whom\s+it\s+may\s+concern/i.test(t)) {
    bullets.push(b('这是薪酬通知 / 调薪函，不是在职证明——没有职位、入职日期和 HR 联系方式；建议另要一封在职证明。', 'This is a compensation notice, not an employment confirmation — no title, start date or HR contact; ask for a proper letter.', 'neutral'))
    asks.push({ zh: '请提供公司 HR 出具的在职证明（职位、入职日期、薪资、联系电话）。', en: 'Please provide an HR employment letter (title, start date, salary, phone).' })
  }
  return { bullets, asks }
}

export function readTaxDocument(text: string, claimedMonthly: number | null, isT4 = false): LandlordReading {
  const bullets: ReadingBullet[] = []
  const t = (text || '').replace(/\s+/g, ' ')
  const year = t.match(/\b(?:tax\s+year|year)\s*[:]?\s*(20\d{2})\b/i)?.[1] || t.match(/\b(20\d{2})\b/)?.[1]
  if (isT4 && !/total\s+income|line\s*15000|employment\s+income|box\s*14/i.test(t)) {
    // A T4 slip's text carries box values without labels ("306841 97" is
    // box 14 printed as dollars and cents); employment income is the largest.
    const vals = Array.from(t.matchAll(/\b(\d{4,7})\s(\d{2})\b/g)).map(m => Number(`${m[1]}.${m[2]}`)).filter(v => v >= 5000 && v < 3_000_000)
    if (vals.length) {
      const annual = Math.max(...vals)
      const vsClaim = claimedMonthly ? annual / (claimedMonthly * 12) : null
      bullets.push(b(`${year ? year + ' 年' : ''}T4 就业收入约 ${money(annual)}${vsClaim != null ? `，为申报年收入的 ${Math.round(vsClaim * 100)}%${vsClaim < 0.7 ? '——比现在申报的低不少，问是否换了工作或加薪' : ''}` : ''}。雇主出具、报给 CRA 的数字，比工资单更难伪造。`, `${year ? year + ' ' : ''}T4 employment income ≈ ${money(annual)}${vsClaim != null ? `, ${Math.round(vsClaim * 100)}% of the annualised claim${vsClaim < 0.7 ? ' — well below what is claimed now; ask about a job change or raise' : ''}` : ''}. Employer-issued and filed with CRA — harder to fake than a stub.`, vsClaim != null && vsClaim < 0.7 ? 'warn' : 'good'))
      return { bullets, asks: [] }
    }
  }
  // "Total income 15000 58,420.00" / "Box 14 306841 97" — the first money-
  // shaped token after the label that is not the line number itself.
  const after = t.match(/(?:total\s+income|line\s*15000|employment\s+income|box\s*14)\s*[:]?\s*(?:15000\s+)?([\s\S]{0,40})/i)?.[1] || ''
  const tok = after.match(/\d{1,3}(?:,\d{3})+(?:\.\d{2})?|\d{4,7}\.\d{2}|\d{4,7}\s\d{2}\b/)?.[0]
  if (tok) {
    const v = /\s\d{2}$/.test(tok) ? Number(tok.replace(/\s(\d{2})$/, '.$1')) : Number(tok.replace(/,/g, ''))
    const annual = isFinite(v) && v >= 1000 ? v : null
    if (annual) {
      const vsClaim = claimedMonthly ? annual / (claimedMonthly * 12) : null
      bullets.push(b(`${year ? year + ' 年' : ''}税务申报 / T4 总收入 ${money(annual)}${vsClaim != null ? `，为申报年收入的 ${Math.round(vsClaim * 100)}%${vsClaim < 0.7 ? '——比现在申报的低不少，问是否换了工作或加薪' : ''}` : ''}。CRA 文件是第三方出具的，比工资单更难伪造。`, `${year ? year + ' ' : ''}tax filing / T4 income ${money(annual)}${vsClaim != null ? `, ${Math.round(vsClaim * 100)}% of the annualised claim${vsClaim < 0.7 ? ' — well below what is claimed now; ask about a job change or raise' : ''}` : ''}. CRA-issued, harder to fake than a stub.`, vsClaim != null && vsClaim < 0.7 ? 'warn' : 'good'))
    }
  }
  if (/balance\s+owing|amount\s+due|you\s+owe/i.test(t) && !/refund/i.test(t)) bullets.push(b('通知书显示有应缴税款余额。', 'The notice shows a balance owing.', 'neutral'))
  return { bullets, asks: [] }
}

export function readApplicationForm(app: { applying_rent?: number | null; prev_residences?: Array<{ address?: string; period?: string; landlord_name?: string; landlord_phone?: string }>; vacating_reason?: string | null; vehicles?: string[]; blank_sections?: string[] } | null | undefined): LandlordReading {
  const bullets: ReadingBullet[] = []
  const asks: LandlordReading['asks'] = []
  if (!app) return { bullets, asks }
  const prev = app.prev_residences || []
  const withPhone = prev.filter(p => p.landlord_name && p.landlord_phone)
  if (prev.length) bullets.push(b(`申报 ${prev.length} 处住址，${withPhone.length} 处有房东姓名和电话——${withPhone.length ? '可以直接打' : '没有可联系的前房东'}。`, `${prev.length} residence(s) declared, ${withPhone.length} with a landlord name and phone — ${withPhone.length ? 'callable' : 'no reachable prior landlord'}.`, withPhone.length ? 'good' : 'warn'))
  for (const p of withPhone.slice(0, 2)) asks.push({ zh: `致电 ${p.landlord_name}（${p.landlord_phone}）核实 ${p.period || ''} 的租住与付款记录。`, en: `Call ${p.landlord_name} (${p.landlord_phone}) to confirm the ${p.period || ''} tenancy and payment record.` })
  if (app.vacating_reason) {
    const r = app.vacating_reason
    const n12 = /personal\s+use|landlord.*(moving|own\s+use)|sold|sale|renovat|demoli/i.test(r)
    bullets.push(b(`搬离原因：「${r.slice(0, 60)}」${n12 ? '——房东方原因（自住 / 出售 / 装修），不是租客违约' : ''}。`, `Reason for leaving: "${r.slice(0, 60)}"${n12 ? ' — landlord-side (own use / sale / renovation), not a tenant default' : ''}.`, n12 ? 'good' : 'neutral'))
  }
  if ((app.blank_sections || []).length) bullets.push(b(`留空栏目：${app.blank_sections!.slice(0, 5).join('、')}。`, `Left blank: ${app.blank_sections!.slice(0, 5).join(', ')}.`, 'neutral'))
  return { bullets, asks }
}

const kindHas = (kind: string, k: string) => (kind || '').split(',').map(x => x.trim()).includes(k)

/** Attach a landlord reading to every per-file entry. */
export function buildLandlordReadings(perFile: PerFileForensics[], ctx: ReadingContext & { creditReport?: CreditReport | null; applicationSummary?: Parameters<typeof readApplicationForm>[0]; monthlyIncomeForCredit?: number | null; coApplicants?: string[] }): void {
  const nameTok = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().split(/[^a-z]+/).filter(x => x.length >= 3)
  const applicantTokens = nameTok(ctx.applicantName || '')
  const creditFiles = perFile.filter(pf => kindHas(pf.file_kind || '', 'credit_report'))
  // With several bureau reports in the file (co-applicants), the transcribed
  // one is the primary applicant's: attach its reading to the file that
  // carries their name and label the others.
  const primaryCredit = creditFiles.length <= 1 ? creditFiles[0] : creditFiles.find(pf => {
    const t = `${pf.text_density?.text_sample || ''} ${pf.ocr?.text || ''} ${pf.ocr?.apparent_name || ''}`.toLowerCase()
    return applicantTokens.length >= 2 && applicantTokens.filter(tok => t.includes(tok)).length >= 2
  })
  const stubNetPays = perFile.map(pf => pf.paystub_math?.extraction.period_net).filter((n): n is number => typeof n === 'number' && n > 0)
  const ctxWithNets = { ...ctx, stubNetPays }
  for (const pf of perFile) {
    const kind = pf.file_kind || ''
    const name = pf.file_name || ''
    const text = pf.text_density?.text_sample || pf.ocr?.text || ''
    const ocrOnly = !!pf.text_density?.is_likely_image_pdf
    let r: LandlordReading | null = null
    if (kindHas(kind, 'bank_statement')) r = readBankStatement(text, ctxWithNets, ocrOnly)
    else if (kindHas(kind, 'pay_stub')) r = readPayStub(pf.paystub_math?.extraction, text, pf.paystub_math?.ytd_ratio, pf.paystub_math?.one_off_ytd)
    else if (kindHas(kind, 'credit_report')) {
      if (!primaryCredit || pf === primaryCredit) r = readCreditReportFile(ctx.creditReport, ctx.monthlyIncomeForCredit ?? ctx.claimedMonthlyIncome, ctx.monthlyRent)
      else {
        const who = (pf.ocr?.apparent_name || '').trim()
        r = { bullets: [b(`${who ? `「${who}」` : '共同申请人'}的信用报告——本报告只转录主申请人的报告，这一份请单独核对分数、逾期与催收。`, `${who ? `"${who}"` : "A co-applicant"}'s bureau report — only the primary applicant's report is transcribed here; check this one's score, past-due and collections separately.`, 'neutral')], asks: [] }
      }
    }
    else if (kindHas(kind, 'id_document')) r = readIdDocument(pf.ocr, ctx.applicantName, ctx.coApplicants || [])
    else if (kindHas(kind, 'employment_letter') || kindHas(kind, 'offer_letter')) r = readEmploymentLetter(text)
    else if (/notice\s+of\s+assessment|statement\s+of\s+remuneration|revenue\s+agency/i.test(text) || /\bNOA\b|\bT4\b|assessment/i.test(name)) r = readTaxDocument(text, ctx.claimedMonthlyIncome, /\bT4\b/i.test(name))
    else if ((/rental\s+application|application\s+to\s+rent|form\s+410/i.test(text) || /application/i.test(name)) && ctx.applicationSummary) r = readApplicationForm(ctx.applicationSummary)
    if (r && (r.bullets.length || r.asks.length)) pf.landlord_reading = r
  }
}

/** Merge the coherence pass's per-document reading (source 'model'). */
export function mergeModelReadings(perFile: PerFileForensics[], docs: Array<{ file: string; landlord_read_zh?: string[]; landlord_read_en?: string[]; ask_zh?: string | null; ask_en?: string | null }>): void {
  for (const d of docs) {
    const pf = perFile.find(p => p.file_name === d.file) || perFile.find(p => p.file_name.toLowerCase() === (d.file || '').toLowerCase())
    if (!pf) continue
    const zh = d.landlord_read_zh || [], en = d.landlord_read_en || []
    const n = Math.max(zh.length, en.length)
    if (!pf.landlord_reading) pf.landlord_reading = { bullets: [], asks: [] }
    for (let i = 0; i < n; i++) {
      const z = zh[i] || en[i] || '', e = en[i] || zh[i] || ''
      if (!z) continue
      // skip near-duplicates of a measured bullet
      const key = z.replace(/[\d$,.%\s]/g, '').slice(0, 24)
      if (pf.landlord_reading.bullets.some(x => x.zh.replace(/[\d$,.%\s]/g, '').slice(0, 24) === key)) continue
      pf.landlord_reading.bullets.push({ zh: z, en: e, tone: /⚠|不一致|异常|风险|逾期|欠|催收|no\b.*match|mismatch|overdue|collection|risk/i.test(z + ' ' + e) ? 'warn' : 'neutral', source: 'model' })
    }
    if (d.ask_zh || d.ask_en) pf.landlord_reading.asks.push({ zh: d.ask_zh || d.ask_en || '', en: d.ask_en || d.ask_zh || '' })
  }
}
