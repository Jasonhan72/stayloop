// -----------------------------------------------------------------------------
// P1 — Benford's Law + Trailing Digit Distribution Analysis
//
// Benford's Law: in naturally occurring financial data, the leading digit d
// appears with probability log10(1 + 1/d). Digit 1 appears ~30.1% of the
// time, digit 9 only ~4.6%. Fabricated numbers tend toward uniform or
// round-number distributions because humans are bad at simulating this.
//
// Trailing digit analysis: real bank transactions end in varied cents
// (.17, .83, .42). Forged amounts disproportionately end in .00 or .50
// because forgers pick "clean" numbers.
//
// Both checks are pure JS, zero cost, and run on extracted text from
// bank statements and pay stubs.
// -----------------------------------------------------------------------------

import type { ForensicFlag } from './types'

const STRICT_KINDS = new Set(['bank_statement', 'pay_stub'])

const BENFORD_EXPECTED = [0, 0.301, 0.176, 0.125, 0.097, 0.079, 0.067, 0.058, 0.051, 0.046]

export interface BenfordResult {
  sample_size: number
  leading_digit_distribution: number[]
  chi_squared: number | null
  trailing_round_pct: number | null
  trailing_sample_size: number
}

export function checkBenford(
  textSample: string,
  fileName: string,
  kind: string,
): { result: BenfordResult; flags: ForensicFlag[] } {
  const flags: ForensicFlag[] = []
  const isStrict = STRICT_KINDS.has(kind)

  const amounts = extractMonetaryAmounts(textSample)
  const trailingAmounts = amounts.filter(a => a >= 1)

  // --- Leading digit distribution (Benford's Law) ---
  // Deduplicate identical amounts first: statements dominated by recurring
  // identical entries (rent, payroll, subscriptions) repeat one leading
  // digit many times for a single underlying fact — Benford applies to
  // independent amounts, not to one amount echoed 12 times.
  const leadingDigits = Array.from(new Set(amounts.filter(a => a >= 10)))
    .map(a => firstSignificantDigit(a))
    .filter((d): d is number => d !== null)

  const distribution = new Array(10).fill(0)
  for (const d of leadingDigits) distribution[d]++

  const sampleSize = leadingDigits.length
  let chiSquared: number | null = null

  // n >= 100, not 30: the chi-squared approximation needs expected counts of
  // at least ~5 in every cell, and the rarest leading digit (9) has expected
  // frequency 4.6% — at n=30 that cell expects 1.4 and the printed p-values
  // are fiction. ~110 amounts is the honest floor.
  if (sampleSize >= 100 && isStrict) {
    chiSquared = 0
    for (let d = 1; d <= 9; d++) {
      const observed = distribution[d] / sampleSize
      const expected = BENFORD_EXPECTED[d]
      chiSquared += ((observed - expected) ** 2) / expected
    }
    chiSquared *= sampleSize

    // Chi-squared critical value for df=8, alpha=0.01 is 20.09
    // alpha=0.001 is 26.12
    if (chiSquared > 26.12) {
      flags.push({
        code: 'benford_violation',
        severity: 'high',
        file: fileName,
        evidence_en: `${sampleSize} monetary amounts show a leading-digit distribution that severely violates Benford's Law (χ²=${chiSquared.toFixed(1)}, p<0.001). Natural financial data follows Benford's distribution — this deviation strongly suggests the numbers were manually fabricated.`,
        evidence_zh: `${sampleSize} 个金额的首位数字分布严重违反本福特定律（χ²=${chiSquared.toFixed(1)}，p<0.001）。真实财务数据遵循本福特分布——这种偏离强烈暗示数字是人为编造的。`,
      })
    } else if (chiSquared > 20.09) {
      flags.push({
        code: 'benford_anomaly',
        severity: 'medium',
        file: fileName,
        evidence_en: `${sampleSize} monetary amounts show a leading-digit distribution that deviates from Benford's Law (χ²=${chiSquared.toFixed(1)}, p<0.01). Could indicate fabricated transaction amounts.`,
        evidence_zh: `${sampleSize} 个金额的首位数字分布偏离本福特定律（χ²=${chiSquared.toFixed(1)}，p<0.01）。可能表明交易金额是伪造的。`,
      })
    }
  }

  // --- Trailing digit analysis ---
  let trailingRoundPct: number | null = null
  const trailingSampleSize = trailingAmounts.length

  if (trailingSampleSize >= 15 && isStrict) {
    const roundCount = trailingAmounts.filter(a => {
      const cents = Math.round((a % 1) * 100)
      return cents === 0 || cents === 50
    }).length

    trailingRoundPct = roundCount / trailingSampleSize

    // In real bank data, ~12-18% of amounts end in .00 or .50
    // (rent, subscriptions, round transfers). Above 60% is suspicious.
    if (trailingRoundPct > 0.70) {
      flags.push({
        // medium, not high: e-transfer-heavy accounts (students, cash-based
        // workers, rent+utilities-only accounts) are legitimately dominated
        // by round amounts — this is corroborating, not conclusive.
        code: 'trailing_digits_too_round',
        severity: 'medium',
        file: fileName,
        evidence_en: `${Math.round(trailingRoundPct * 100)}% of ${trailingSampleSize} transaction amounts end in .00 or .50 (expected ~15%). Forgers strongly favor round numbers — real bank transactions have varied cents values.`,
        evidence_zh: `${trailingSampleSize} 笔交易中 ${Math.round(trailingRoundPct * 100)}% 的金额以 .00 或 .50 结尾（预期约 15%）。伪造者偏好整数——真实银行交易的分位值是多样的。`,
      })
    } else if (trailingRoundPct > 0.55) {
      flags.push({
        code: 'trailing_digits_round_anomaly',
        severity: 'medium',
        file: fileName,
        evidence_en: `${Math.round(trailingRoundPct * 100)}% of ${trailingSampleSize} transaction amounts end in .00 or .50 (expected ~15%). Higher than normal — could indicate some fabricated entries.`,
        evidence_zh: `${trailingSampleSize} 笔交易中 ${Math.round(trailingRoundPct * 100)}% 的金额以 .00 或 .50 结尾（预期约 15%）。高于正常水平——可能部分条目是伪造的。`,
      })
    }
  }

  const result: BenfordResult = {
    sample_size: sampleSize,
    leading_digit_distribution: distribution,
    chi_squared: chiSquared,
    trailing_round_pct: trailingRoundPct,
    trailing_sample_size: trailingSampleSize,
  }

  return { result, flags }
}

function extractMonetaryAmounts(text: string): number[] {
  if (!text) return []
  const amounts: number[] = []
  // Match $1,234.56 or 1234.56 patterns (with optional $ and commas)
  for (const m of text.matchAll(/\$?\s*(\d{1,3}(?:,\d{3})*\.\d{2}|\d+\.\d{2})\b/g)) {
    const n = Number(m[1].replace(/,/g, ''))
    // Filter to plausible transaction range: $1 to $999,999
    if (isFinite(n) && n >= 1 && n < 1_000_000) amounts.push(n)
  }
  return amounts
}

function firstSignificantDigit(n: number): number | null {
  if (n <= 0) return null
  const s = Math.abs(n).toExponential()
  const d = parseInt(s[0], 10)
  return d >= 1 && d <= 9 ? d : null
}
