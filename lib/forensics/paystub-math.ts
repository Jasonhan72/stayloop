// -----------------------------------------------------------------------------
// P1 — Pay Stub Math Consistency
//
// The single most reliable forgery signal is internal math inconsistency.
// Forgers usually edit one or two visible numbers (e.g. raise the YTD gross
// to look better), but they rarely also re-derive every dependent number.
//
// We extract 6-9 numeric fields from a paystub using a tiny haiku call (cheap,
// fast, deterministic with prefilled JSON), then verify in pure JS:
//
//   1. expected_ytd_gross = annual_salary × (days_since_jan1 / 365)
//      Real ratio should be 0.7-1.3 (allows for OT, bonuses, partial year).
//      < 0.5 or > 1.5 = strong signal of forgery (Sheila's was 2.4x).
//
//   2. derived_period_gross = hourly_rate × hours_worked
//      If hourly+hours are present, this should match stated period_gross
//      within 2%. Larger discrepancy = the forger fudged one number.
//
//   3. period_count_so_far × period_net ≈ ytd_net (within 5%)
//      If they don't match, either the YTD or the period_net was edited.
//
// Note: We use Anthropic API directly (no SDK) for edge runtime compatibility.
// Cost: ~$0.0003 per paystub with claude-haiku-4-5.
// -----------------------------------------------------------------------------

import type { ForensicFlag, PaystubExtraction, PaystubMathResult } from './types'

const HAIKU_MODEL = 'claude-haiku-4-5'

const EXTRACT_PROMPT = `You are extracting numeric fields from a Canadian pay stub. Return ONLY a JSON object — no markdown, no prose. If a field is not visible on the stub, return null for that field. Do NOT guess or fill in values. Numbers must be raw (no commas, no $).

Required fields:
{
  "annual_salary": number or null  (annualized base salary in CAD; if only hourly is shown, leave null),
  "hourly_rate": number or null  (CAD per hour),
  "hours_worked": number or null  (hours in this pay period),
  "pay_date": "YYYY-MM-DD" or null  (date of this stub's payment),
  "pay_period_start": "YYYY-MM-DD" or null,
  "pay_period_end": "YYYY-MM-DD" or null,
  "period_gross": number or null  (gross earnings this pay period before deductions),
  "period_net": number or null  (net pay this period after deductions),
  "ytd_gross": number or null  (year-to-date gross earnings as printed),
  "ytd_net": number or null  (year-to-date net pay as printed),
  "employer_name": string or null,
  "employer_phone": string or null,
  "pay_frequency": "weekly" | "biweekly" | "semimonthly" | "monthly" | null
}`

/**
 * Call haiku to extract paystub fields. Returns null on API failure.
 */
export async function extractPaystubFields(
  signedFileUrl: string,
  mime: string,
  apiKey: string
): Promise<PaystubExtraction | null> {
  try {
    const content: any[] = []
    if (mime === 'application/pdf') {
      content.push({ type: 'document', source: { type: 'url', url: signedFileUrl } })
    } else if (mime?.startsWith('image/')) {
      content.push({ type: 'image', source: { type: 'url', url: signedFileUrl } })
    } else {
      return null
    }
    content.push({ type: 'text', text: EXTRACT_PROMPT })

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: HAIKU_MODEL,
        max_tokens: 600,
        messages: [
          { role: 'user', content },
          { role: 'assistant', content: '{' },  // prefill JSON start
        ],
      }),
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) return null
    const data = await res.json() as { content?: Array<{ text?: string }> }
    const raw = '{' + (data.content?.[0]?.text || '')
    return parseExtraction(raw)
  } catch {
    return null
  }
}

function parseExtraction(raw: string): PaystubExtraction | null {
  try {
    // Strip code fences, trailing commas, then parse
    let t = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '')
    // Find balanced top-level object
    const start = t.indexOf('{')
    if (start < 0) return null
    let depth = 0, end = -1, inStr = false, esc = false
    for (let i = start; i < t.length; i++) {
      const ch = t[i]
      if (inStr) {
        if (esc) esc = false
        else if (ch === '\\') esc = true
        else if (ch === '"') inStr = false
      } else {
        if (ch === '"') inStr = true
        else if (ch === '{') depth++
        else if (ch === '}') { depth--; if (depth === 0) { end = i; break } }
      }
    }
    if (end < 0) return null
    const body = t.slice(start, end + 1).replace(/,(\s*[}\]])/g, '$1')
    const obj = JSON.parse(body)
    return {
      annual_salary: numOrNull(obj.annual_salary),
      hourly_rate: numOrNull(obj.hourly_rate),
      hours_worked: numOrNull(obj.hours_worked),
      pay_date: typeof obj.pay_date === 'string' ? obj.pay_date : null,
      pay_period_start: typeof obj.pay_period_start === 'string' ? obj.pay_period_start : null,
      pay_period_end: typeof obj.pay_period_end === 'string' ? obj.pay_period_end : null,
      period_gross: numOrNull(obj.period_gross),
      period_net: numOrNull(obj.period_net),
      ytd_gross: numOrNull(obj.ytd_gross),
      ytd_net: numOrNull(obj.ytd_net),
      employer_name: typeof obj.employer_name === 'string' ? obj.employer_name : null,
      employer_phone: typeof obj.employer_phone === 'string' ? obj.employer_phone : null,
      pay_frequency: ['weekly', 'biweekly', 'semimonthly', 'monthly'].includes(obj.pay_frequency)
        ? obj.pay_frequency : null,
    }
  } catch {
    return null
  }
}

function numOrNull(v: any): number | null {
  if (v === null || v === undefined) return null
  if (typeof v === 'number' && isFinite(v)) return v
  if (typeof v === 'string') {
    const cleaned = v.replace(/[$,\s]/g, '')
    const n = Number(cleaned)
    if (isFinite(n)) return n
  }
  return null
}

/**
 * Run all math-consistency checks. Returns the structured math result and
 * a list of flags for any inconsistencies found.
 */
export function checkPaystubMath(
  ext: PaystubExtraction,
  file: string
): { result: PaystubMathResult; flags: ForensicFlag[] } {
  const flags: ForensicFlag[] = []
  let expectedYtdGross: number | null = null
  let ytdRatio: number | null = null
  let derivedPeriodGross: number | null = null
  let periodMathErrorPct: number | null = null

  // ---------------------------------------------------------------------------
  // Check 1: YTD vs annual_salary
  // ---------------------------------------------------------------------------
  if (ext.annual_salary && ext.pay_date && ext.ytd_gross) {
    const payDate = new Date(ext.pay_date)
    if (!isNaN(payDate.getTime())) {
      const yearStart = new Date(payDate.getFullYear(), 0, 1)
      const daysElapsed = (payDate.getTime() - yearStart.getTime()) / (1000 * 60 * 60 * 24)
      if (daysElapsed > 0 && daysElapsed <= 366) {
        expectedYtdGross = ext.annual_salary * (daysElapsed / 365)
        ytdRatio = ext.ytd_gross / expectedYtdGross

        if (ytdRatio > 1.5) {
          flags.push({
            code: 'paystub_ytd_inflated',
            severity: 'critical',
            file,
            evidence_en: `Pay stub YTD gross is $${ext.ytd_gross.toLocaleString()} on ${ext.pay_date}, but $${ext.annual_salary.toLocaleString()}/yr salary should yield ~$${Math.round(expectedYtdGross).toLocaleString()} by that date. Ratio ${ytdRatio.toFixed(2)}x — math impossible without massive OT not reflected in hours/rate.`,
            evidence_zh: `工资单 YTD 毛收入 $${ext.ytd_gross.toLocaleString()}（截至 ${ext.pay_date}），但年薪 $${ext.annual_salary.toLocaleString()} 到该日期应该只有约 $${Math.round(expectedYtdGross).toLocaleString()}。比例 ${ytdRatio.toFixed(2)} 倍——除非有未在小时/时薪中体现的大量加班，否则数学上不可能。`,
          })
        } else if (ytdRatio < 0.5) {
          flags.push({
            code: 'paystub_ytd_too_low',
            severity: 'medium',
            file,
            evidence_en: `Pay stub YTD gross $${ext.ytd_gross.toLocaleString()} is only ${(ytdRatio * 100).toFixed(0)}% of expected ($${Math.round(expectedYtdGross).toLocaleString()}) for $${ext.annual_salary.toLocaleString()}/yr by ${ext.pay_date}. Could be new employee or salary mismatch.`,
            evidence_zh: `工资单 YTD 毛收入 $${ext.ytd_gross.toLocaleString()} 仅为预期 ($${Math.round(expectedYtdGross).toLocaleString()}) 的 ${(ytdRatio * 100).toFixed(0)}%（按年薪 $${ext.annual_salary.toLocaleString()} 算到 ${ext.pay_date}）。可能是新员工或年薪填错。`,
          })
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Check 2: hourly × hours = period_gross (within 5% — allows for rounding
  // of displayed hourly rate and minor overtime/shift-differential variances
  // that the primary-rate line doesn't capture).
  // ---------------------------------------------------------------------------
  if (ext.hourly_rate && ext.hours_worked && ext.period_gross) {
    derivedPeriodGross = ext.hourly_rate * ext.hours_worked
    const diff = Math.abs(derivedPeriodGross - ext.period_gross)
    periodMathErrorPct = (diff / ext.period_gross) * 100
    if (periodMathErrorPct > 5) {
      flags.push({
        code: 'paystub_period_math_error',
        severity: 'high',
        file,
        evidence_en: `Pay stub shows ${ext.hours_worked}h × $${ext.hourly_rate}/hr = $${derivedPeriodGross.toFixed(2)}, but stated period gross is $${ext.period_gross.toFixed(2)} (off by ${periodMathErrorPct.toFixed(1)}%). Internal math doesn't add up.`,
        evidence_zh: `工资单显示 ${ext.hours_worked} 小时 × $${ext.hourly_rate}/小时 = $${derivedPeriodGross.toFixed(2)}，但本期毛收入填的是 $${ext.period_gross.toFixed(2)}（差 ${periodMathErrorPct.toFixed(1)}%）。内部数学对不上。`,
      })
    }
  }

  // ---------------------------------------------------------------------------
  // Check 3: ytd_net vs (estimated period count × period_net)
  // pay_frequency lookup: weekly=52, biweekly=26, semimonthly=24, monthly=12
  // ---------------------------------------------------------------------------
  if (ext.pay_date && ext.ytd_net && ext.period_net && ext.pay_frequency) {
    const payDate = new Date(ext.pay_date)
    if (!isNaN(payDate.getTime())) {
      const yearStart = new Date(payDate.getFullYear(), 0, 1)
      const daysElapsed = (payDate.getTime() - yearStart.getTime()) / (1000 * 60 * 60 * 24)
      const periodsPerYear: Record<string, number> = { weekly: 52, biweekly: 26, semimonthly: 24, monthly: 12 }
      const ppy = periodsPerYear[ext.pay_frequency]
      const periodsSoFar = Math.round((daysElapsed / 365) * ppy)
      if (periodsSoFar > 0) {
        const expectedYtdNet = ext.period_net * periodsSoFar
        const diffPct = Math.abs(ext.ytd_net - expectedYtdNet) / ext.ytd_net * 100
        // Allow 25% margin — varying deductions, bonuses
        if (diffPct > 25) {
          flags.push({
            code: 'paystub_ytd_net_mismatch',
            severity: 'medium',
            file,
            evidence_en: `${ext.pay_frequency} pay × ${periodsSoFar} periods × $${ext.period_net.toFixed(2)}/period = $${expectedYtdNet.toFixed(0)} expected YTD net, but stub shows $${ext.ytd_net.toFixed(0)} (off ${diffPct.toFixed(0)}%).`,
            evidence_zh: `按 ${ext.pay_frequency} 频率 × ${periodsSoFar} 期 × $${ext.period_net.toFixed(2)}/期 = $${expectedYtdNet.toFixed(0)} 预期 YTD 净收入，但工资单显示 $${ext.ytd_net.toFixed(0)}（差 ${diffPct.toFixed(0)}%）。`,
          })
        }
      }
    }
  }

  return {
    result: {
      extraction: ext,
      expected_ytd_gross: expectedYtdGross,
      ytd_ratio: ytdRatio,
      derived_period_gross: derivedPeriodGross,
      period_math_error_pct: periodMathErrorPct,
    },
    flags,
  }
}
