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
// Cost: ~$0.0003 per paystub on the default forensics model (Haiku-class).
// The model comes from the admin-configurable 'forensics' slot
// (lib/modelConfig.ts) — assistant-prefill is dropped automatically on
// models that reject it (everything in the whitelist except Haiku 4.5).
// -----------------------------------------------------------------------------

import { getModel, supportsAssistantPrefill } from '../modelConfig'
import type { ForensicFlag, PaystubExtraction, PaystubMathResult } from './types'

const EXTRACT_PROMPT = `You are extracting numeric fields from a Canadian pay stub. Return ONLY a JSON object — no markdown, no prose. If a field is not visible on the stub, return null for that field. Do NOT guess or fill in values. Numbers must be raw (no commas, no $).

CRITICAL — when the file contains MULTIPLE pay stubs:
- Many "Supporting Documents" PDFs bundle 2-3 consecutive pay stubs in one file. Extract ONLY from the SINGLE MOST RECENT stub (latest pay_date).
- The most recent stub's YTD already contains all earlier earnings — do NOT sum YTD across stubs. Do NOT pick an older stub.
- pay_date should be the latest pay date you see; ytd_gross/ytd_net should be the YTD shown on THAT same stub, not a sum across stubs.

CRITICAL — derive annual_salary from period × pay_frequency when not stated:
- Many Canadian pay stubs print "Pay Rate: $X" where X is the per-PERIOD amount (semi-monthly, bi-weekly, monthly), NOT an hourly rate or annual salary. Pay Frequency is shown separately.
- If the stub shows "Pay Rate: $4554.17" + "Pay Frequency: Semi-Monthly", annual_salary = 4554.17 × 24 = 109300. Set annual_salary explicitly even if the stub doesn't say "/year".
- Periods per year: weekly=52, biweekly=26, semimonthly=24, monthly=12.
- Only set hourly_rate when you can clearly read a per-hour figure ($15-$100) and the rate explicitly says "/hour" or "/hr".

CRITICAL — annual vs hourly disambiguation:
- A "Pay Rate" $200+ with no "/hr" suffix is per-period, not hourly. Convert via pay_frequency.
- Magnitude alone NEVER makes a rate annual. High earners have per-PERIOD rates of $10,000+ (e.g. $240,000/yr paid semi-monthly = $10,000/period). Treat a rate as annual ONLY when it is explicitly marked /yr, /year, "Annual" or "Annually", OR when it is 10x+ the period gross.
- Litmus test: Pay Rate ≈ period_gross → it is the per-period rate, annualize via pay_frequency. Pay Rate ≈ 12-52 × period_gross → it is annual.
- The "Hours" column on a salaried stub is informational; it does NOT make the worker hourly.

CRITICAL — ytd_gross is CASH base salary, NOT the "Earnings" total row:
- Workday/Ceridian/ADP stubs show an "Earnings" header row that AGGREGATES Regular + employer pension match (PSPCan, RPBCan, RRSP ER Match) + taxable benefits + bonuses. That total is INFLATED relative to the cash actually paid.
- ytd_gross should be the SPECIFIC CASH base-salary YTD line, labelled one of: "Regular", "RegPay", "RegPay/PaieOrd", "Base Pay", "Salary", "Reg Pay". Do NOT use the "Earnings" or "Total Earnings" row when a Regular line exists below it.
- If the stub only shows "Earnings" with no Regular breakdown, subtract any visible employer pension match (PSPCan, RPBCan, RRSP ER Match) and Taxable Benefits from it before reporting.
- Cash bonuses, RSU vests (EIP Bonus), commissions, PTO and Sick Pay paid at regular rate ARE cash income — include them. Employer pension match + taxable benefits (life/health imputed value) are NOT cash income — exclude them.
- Sanity check: ytd_gross / annual_salary should approximately equal (days_since_jan1 / 365). If your extraction gives a ratio above 1.5x, you almost certainly grabbed the inflated Earnings TOTAL — re-read the stub and pick the Regular/Salary line instead.

Examples:
- "Account Specialist  $60,000.00/year  86.67  $2,500.00" → annual_salary=60000, hourly_rate=null, hours_worked=86.67, period_gross=2500
- "Cashier  $18.50/hour  80  $1,480.00" → annual_salary=null, hourly_rate=18.50, hours_worked=80, period_gross=1480
- "Software Engineer  $95,000/yr  N/A  $3,653.85" → annual_salary=95000, hourly_rate=null, hours_worked=null, period_gross=3653.85
- "Audit Analyst Sr  Pay Rate $4554.17  Semi-Monthly" → annual_salary=109300, hourly_rate=null, period_gross=4554.17, pay_frequency=semimonthly
- "Director  Pay Rate $10,000.00  Semi-Monthly  Regular $10,000.00" → annual_salary=240000, period_gross=10000, pay_frequency=semimonthly (the $10,000 is the PER-PERIOD rate of a high earner, NOT an annual salary)
- Workday stub showing "Earnings ... 568.75 $53,693" then "RegPay/PaieOrd 568.75 $31,879" then "PSPCan/RPBCan $21,813" then "Taxable Benefits $3,006" → ytd_gross=31879 (the RegPay line, NOT the Earnings total — the Earnings total is RegPay + employer pension match + benefits and overstates cash)
- Workday stub showing "Earnings ... 720 $61,487" then "Regular $42,752" then "PTO $7,657" then "Sick Pay $1,730" then "EIP Bonus $9,346" then "Taxable Benefits $1,823" → ytd_gross=61487 - 1823 = 59664 (Earnings total minus only the Taxable Benefits; PTO/Sick/Bonus are real cash income; this employer has no employer pension match line under Earnings)

STATUTORY DEDUCTIONS — extract employee-side CPP/EI when visible:
- Deduction lines are labelled CPP / QPP (Canada/Quebec Pension Plan), CPP2 ("CPP2", "Second CPP", "CPP Additional"), EI ("EI", "Employment Insurance").
- Extract the EMPLOYEE contribution (not employer portion), both this period's amount and the YTD column.
- A BLANK current-period CPP/EI cell next to a non-zero YTD usually means the annual maximum was already reached — report the YTD as printed and leave the period field null. Do NOT treat the blank as suspicious.

Required fields:
{
  "annual_salary": number or null  (annualized base CASH salary in CAD; for salaried roles, Pay Rate × pay_frequency periods),
  "hourly_rate": number or null  (CAD per hour; ONLY when stub explicitly shows /hour or /hr),
  "hours_worked": number or null  (hours in this pay period),
  "pay_date": "YYYY-MM-DD" or null  (date of this stub's payment — most recent if multi-stub bundle),
  "pay_period_start": "YYYY-MM-DD" or null,
  "pay_period_end": "YYYY-MM-DD" or null,
  "period_gross": number or null  (cash gross earnings this pay period — Regular + cash bonuses, NOT pension match or benefits),
  "period_net": number or null  (net pay this period after deductions),
  "ytd_gross": number or null  (year-to-date CASH gross earnings — Regular + cash bonuses + PTO + Sick Pay; EXCLUDE employer pension match like PSPCan/RPBCan/RRSP ER Match and EXCLUDE Taxable Benefits),
  "ytd_net": number or null  (year-to-date net pay as printed),
  "employer_name": string or null,
  "employer_phone": string or null,
  "pay_frequency": "weekly" | "biweekly" | "semimonthly" | "monthly" | null,
  "cpp_ytd": number or null  (YTD employee CPP/QPP contribution),
  "cpp2_ytd": number or null  (YTD employee CPP2 / second additional CPP),
  "ei_ytd": number or null  (YTD employee EI premium),
  "cpp_period": number or null  (this period's employee CPP/QPP; null if blank),
  "ei_period": number or null  (this period's employee EI; null if blank)
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

    // Admin-configurable model slot (60s cache) — see lib/modelConfig.ts.
    // Prefill JSON start only on models that still accept assistant-prefill.
    const model = await getModel('forensics')
    const prefill = supportsAssistantPrefill(model)
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 800,
        messages: prefill
          ? [
              { role: 'user', content },
              { role: 'assistant', content: '{' },  // prefill JSON start
            ]
          : [{ role: 'user', content }],
      }),
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) return null
    const data = await res.json() as { content?: Array<{ text?: string }> }
    // Re-add the prefilled "{" only when we actually prefilled it.
    const raw = (prefill ? '{' : '') + (data.content?.[0]?.text || '')
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
      cpp_ytd: numOrNull(obj.cpp_ytd),
      cpp2_ytd: numOrNull(obj.cpp2_ytd),
      ei_ytd: numOrNull(obj.ei_ytd),
      cpp_period: numOrNull(obj.cpp_period),
      ei_period: numOrNull(obj.ei_period),
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
/**
 * Defense in depth: even with a clear extraction prompt, Haiku sometimes
 * mis-buckets an annual salary into the hourly_rate field (e.g. it sees
 * "$60,000.00/year" and writes hourly_rate=60000 instead of annual_salary=60000).
 *
 * No real Canadian hourly rate exceeds $200/hr on a normal pay stub, so we
 * treat any hourly_rate above that threshold as a misclassification and
 * recover gracefully:
 *   - hourly_rate ≥ 10,000 → almost certainly an annual salary; reclassify
 *     into annual_salary (only if annual_salary is empty so we don't clobber
 *     a correctly-extracted value)
 *   - 200 < hourly_rate < 10,000 → unusual / extraction noise; drop the
 *     hourly_rate so the period-math check skips silently rather than
 *     emitting a bogus error
 */
const PERIODS_PER_YEAR: Record<string, number> = {
  weekly: 52, biweekly: 26, semimonthly: 24, monthly: 12,
}

function normalizeExtraction(ext: PaystubExtraction): PaystubExtraction {
  if (ext.hourly_rate && ext.hourly_rate > 200) {
    if (ext.hourly_rate >= 10_000) {
      if (!ext.annual_salary) ext.annual_salary = ext.hourly_rate
    }
    ext.hourly_rate = null
  }
  // An "annual_salary" that equals the single-period gross is a misread
  // per-period pay rate (a real annual salary can never equal one period's
  // pay). High earners hit this: $240k/yr semi-monthly prints as
  // "Pay Rate $10,000" and gets extracted as annual_salary=10000.
  // Annualize via the stated frequency.
  if (ext.annual_salary && ext.period_gross && ext.pay_frequency) {
    const r = ext.annual_salary / ext.period_gross
    if (r >= 0.85 && r <= 1.15) {
      ext.annual_salary = Math.round(ext.period_gross * PERIODS_PER_YEAR[ext.pay_frequency] * 100) / 100
    }
  }
  return ext
}

export function checkPaystubMath(
  extInput: PaystubExtraction,
  file: string
): { result: PaystubMathResult; flags: ForensicFlag[] } {
  const ext = normalizeExtraction(extInput)
  const flags: ForensicFlag[] = []
  let expectedYtdGross: number | null = null
  let ytdRatio: number | null = null
  let derivedPeriodGross: number | null = null
  let periodMathErrorPct: number | null = null

  // ---------------------------------------------------------------------------
  // Check 1: YTD vs annual_salary
  // ---------------------------------------------------------------------------
  if (ext.annual_salary && ext.pay_date && ext.ytd_gross) {
    // Pure-UTC day-of-year. new Date('YYYY-MM-DD') is UTC-parsed but
    // getFullYear()/local-Date construction are LOCAL — the mix makes a
    // Jan 1 pay date compute against the WRONG year in non-UTC runtimes
    // (dev vs Cloudflare-edge disagreement).
    const dm = ext.pay_date.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (dm) {
      const daysElapsed = (Date.UTC(+dm[1], +dm[2] - 1, +dm[3]) - Date.UTC(+dm[1], 0, 1)) / 86_400_000
      if (daysElapsed > 0 && daysElapsed <= 366) {
        expectedYtdGross = ext.annual_salary * (daysElapsed / 365)
        ytdRatio = ext.ytd_gross / expectedYtdGross

        // Self-diagnosis before flagging: a ratio that lands on a standard
        // pay-periods-per-year count (12/24/26/52) means "annual_salary" was
        // actually the PER-PERIOD rate (e.g. $10,000 semi-monthly = $240k/yr
        // misread as $10k/yr → ratio ≈ 24). Reinterpret and recompute; only
        // accept the rescue if it lands in the healthy band — a genuine
        // forgery inflated by exactly 24x that ALSO stays self-consistent
        // would read identically to a legitimate stub anyway.
        // Corroboration requirement: when period_gross is visible it must
        // itself equal the misread "annual" figure (proving that figure is a
        // per-period amount). Without it, a stub whose period_gross is
        // consistent with the claimed annual salary (e.g. $416.67 × 24 =
        // $10k/yr) but whose YTD is inflated 24x is a REAL forgery — the
        // rescue must not fire there.
        const periodCorroborates =
          ext.period_gross === null ||
          (ext.period_gross >= ext.annual_salary * 0.85 && ext.period_gross <= ext.annual_salary * 1.15)
        if (ytdRatio > 2.5 && periodCorroborates) {
          const candidates = ext.pay_frequency
            ? [PERIODS_PER_YEAR[ext.pay_frequency]]
            : Object.values(PERIODS_PER_YEAR)
          for (const ppy of candidates) {
            if (Math.abs(ytdRatio - ppy) / ppy <= 0.15) {
              const rescuedAnnual = ext.annual_salary * ppy
              const rescuedExpected = rescuedAnnual * (daysElapsed / 365)
              const rescuedRatio = ext.ytd_gross / rescuedExpected
              if (rescuedRatio >= 0.5 && rescuedRatio <= 1.5) {
                flags.push({
                  code: 'paystub_rate_reclassified',
                  severity: 'info',  // a successful self-consistency rescue — weighs 0
                  file,
                  evidence_en: `Extracted "annual salary" $${ext.annual_salary.toLocaleString()} produced a YTD ratio of ${ytdRatio.toFixed(2)}x — matching ${ppy} pay periods/year. Reinterpreted as a per-period rate: annualized salary $${rescuedAnnual.toLocaleString()}, YTD ratio ${rescuedRatio.toFixed(2)}x (consistent).`,
                  evidence_zh: `提取到的"年薪" $${ext.annual_salary.toLocaleString()} 得出 YTD 比例 ${ytdRatio.toFixed(2)} 倍——恰好等于每年 ${ppy} 个发薪期。已重新判定为单期薪资：年化 $${rescuedAnnual.toLocaleString()}，YTD 比例 ${rescuedRatio.toFixed(2)} 倍（自洽）。`,
                })
                ext.annual_salary = rescuedAnnual
                expectedYtdGross = rescuedExpected
                ytdRatio = rescuedRatio
                break
              }
            }
          }
        }

        if (ytdRatio > 2.5) {
          // Truly impossible — even with massive overtime / bonuses, exceeding
          // 2.5× the linear pro-rata is hard to explain. Critical.
          flags.push({
            code: 'paystub_ytd_inflated',
            severity: 'critical',
            file,
            evidence_en: `Pay stub YTD gross is $${ext.ytd_gross.toLocaleString()} on ${ext.pay_date}, but $${ext.annual_salary.toLocaleString()}/yr salary should yield ~$${Math.round(expectedYtdGross).toLocaleString()} by that date. Ratio ${ytdRatio.toFixed(2)}x — math impossible without massive OT not reflected in hours/rate.`,
            evidence_zh: `工资单 YTD 毛收入 $${ext.ytd_gross.toLocaleString()}（截至 ${ext.pay_date}），但年薪 $${ext.annual_salary.toLocaleString()} 到该日期应该只有约 $${Math.round(expectedYtdGross).toLocaleString()}。比例 ${ytdRatio.toFixed(2)} 倍——除非有未在小时/时薪中体现的大量加班，否则数学上不可能。`,
          })
        } else if (ytdRatio > 1.5) {
          // 1.5×–2.5× over expected. Could be real (sign-on bonus, RSU vest,
          // year-end commission, large overtime, retroactive raise) OR could
          // be the AI extracting ytd_gross from the wrong row of a multi-stub
          // bundle. Flag as medium-severity informational, not critical.
          flags.push({
            code: 'paystub_ytd_above_pro_rata',
            severity: 'medium',
            file,
            evidence_en: `Pay stub YTD gross is $${ext.ytd_gross.toLocaleString()} on ${ext.pay_date} (${ytdRatio.toFixed(2)}x the linear pro-rata of $${Math.round(expectedYtdGross).toLocaleString()} for $${ext.annual_salary.toLocaleString()}/yr). Could be a sign-on bonus, vested RSU/equity, retroactive raise, or year-end commission. Verify with the source pay stub.`,
            evidence_zh: `工资单 YTD 毛收入 $${ext.ytd_gross.toLocaleString()}（截至 ${ext.pay_date}），是按年薪 $${ext.annual_salary.toLocaleString()} 线性计算 $${Math.round(expectedYtdGross).toLocaleString()} 的 ${ytdRatio.toFixed(2)} 倍。可能是入职 bonus、RSU 兑现、年终佣金或追溯加薪 —— 建议人工核对原件。`,
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
    // Two tiers: only >15% reaches the gating code. The 5–15% band is real
    // on genuine stubs — hours_worked often includes OT hours while
    // hourly_rate is the base rate, so the 1.5× premium alone breaks 5%
    // once OT passes ~12.5% of hours (80h reg + 10h OT: 5.3% off). A
    // likely_fraud verdict needs math that overtime cannot explain.
    if (periodMathErrorPct > 15) {
      flags.push({
        code: 'paystub_period_math_error',
        severity: 'high',
        file,
        evidence_en: `Pay stub shows ${ext.hours_worked}h × $${ext.hourly_rate}/hr = $${derivedPeriodGross.toFixed(2)}, but stated period gross is $${ext.period_gross.toFixed(2)} (off by ${periodMathErrorPct.toFixed(1)}%). Internal math doesn't add up beyond what overtime premiums could explain.`,
        evidence_zh: `工资单显示 ${ext.hours_worked} 小时 × $${ext.hourly_rate}/小时 = $${derivedPeriodGross.toFixed(2)}，但本期毛收入填的是 $${ext.period_gross.toFixed(2)}（差 ${periodMathErrorPct.toFixed(1)}%）。差距超出加班费溢价所能解释的范围，内部数学对不上。`,
      })
    } else if (periodMathErrorPct > 5) {
      flags.push({
        code: 'paystub_period_math_variance',
        severity: 'medium',
        file,
        evidence_en: `Pay stub shows ${ext.hours_worked}h × $${ext.hourly_rate}/hr = $${derivedPeriodGross.toFixed(2)} vs stated period gross $${ext.period_gross.toFixed(2)} (${periodMathErrorPct.toFixed(1)}% apart). Consistent with overtime/shift premiums on the base rate — verify against a second stub rather than treating as forgery.`,
        evidence_zh: `工资单显示 ${ext.hours_worked} 小时 × $${ext.hourly_rate}/小时 = $${derivedPeriodGross.toFixed(2)}，与本期毛收入 $${ext.period_gross.toFixed(2)} 相差 ${periodMathErrorPct.toFixed(1)}%。与基础时薪之外的加班/轮班溢价一致——建议用第二张工资单核对，而非按伪造处理。`,
      })
    }
  }

  // ---------------------------------------------------------------------------
  // Check 3: ytd_net vs (estimated period count × period_net)
  //
  // This is a noisy supplementary check. period_net is base-only (Regular line)
  // for that ONE pay period; ytd_net legitimately includes bonuses, RSU vests,
  // commissions, retro-pay, vacation buyouts — all of which inflate ytd_net
  // ABOVE periods_so_far × period_net without indicating fraud.
  //
  // Therefore:
  //   1. SKIP the check entirely when Check 1 (ytd_gross vs annual_salary
  //      pro-rata) is in the healthy 0.6–1.6 band. The gross math anchored
  //      against annual_salary is the authoritative income-consistency check;
  //      if that's healthy, ytd_net being higher than naive multiplication is
  //      just a real bonus/RSU and shouldn't trigger a noisy flag.
  //   2. When Check 1 is unavailable or unhealthy, only fire when actual
  //      ytd_net is materially BELOW expected (suggests period_net was
  //      inflated without re-deriving ytd_net — the classic forgery shape).
  //      ytd_net materially ABOVE expected is the bonus/RSU shape and is
  //      not, on its own, a forgery signal.
  //   3. Because ytd_net legitimately ramps with bonuses, an "above" gap
  //      gets flagged only when it's extreme (≥80%) AND the gross check
  //      isn't in the healthy band.
  //
  // pay_frequency lookup: weekly=52, biweekly=26, semimonthly=24, monthly=12
  // ---------------------------------------------------------------------------
  const grossHealthy = ytdRatio !== null && ytdRatio >= 0.6 && ytdRatio <= 1.6
  if (!grossHealthy && ext.pay_date && ext.ytd_net && ext.period_net && ext.pay_frequency) {
    const dm3 = ext.pay_date.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (dm3) {
      const daysElapsed = (Date.UTC(+dm3[1], +dm3[2] - 1, +dm3[3]) - Date.UTC(+dm3[1], 0, 1)) / 86_400_000
      const periodsPerYear: Record<string, number> = { weekly: 52, biweekly: 26, semimonthly: 24, monthly: 12 }
      const ppy = periodsPerYear[ext.pay_frequency]
      const periodsSoFar = Math.round((daysElapsed / 365) * ppy)
      if (periodsSoFar > 0) {
        const expectedYtdNet = ext.period_net * periodsSoFar
        const ratio = ext.ytd_net / expectedYtdNet
        const diffPct = Math.abs(ext.ytd_net - expectedYtdNet) / ext.ytd_net * 100
        // Asymmetric thresholds:
        //   below 0.75 → suspicious (period_net inflated, ytd_net not updated)
        //   above 1.80 → only suspicious when EXTREME and gross also unhealthy
        const farBelow = ratio < 0.75
        const wildlyAbove = ratio > 1.80
        if (farBelow || wildlyAbove) {
          flags.push({
            code: 'paystub_ytd_net_mismatch',
            severity: 'medium',
            file,
            evidence_en: `${ext.pay_frequency} pay × ${periodsSoFar} periods × $${ext.period_net.toFixed(2)}/period = $${expectedYtdNet.toFixed(0)} expected YTD net, but stub shows $${ext.ytd_net.toFixed(0)} (${farBelow ? 'short by' : 'over by'} ${diffPct.toFixed(0)}%).`,
            evidence_zh: `按 ${ext.pay_frequency} 频率 × ${periodsSoFar} 期 × $${ext.period_net.toFixed(2)}/期 = $${expectedYtdNet.toFixed(0)} 预期 YTD 净收入，但工资单显示 $${ext.ytd_net.toFixed(0)}（${farBelow ? '少' : '多'} ${diffPct.toFixed(0)}%）。`,
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
