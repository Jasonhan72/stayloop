// Tenant-side check of a rent-increase notice (Form N1) — V1.0 stage 2, 乙 #10
// (design/v1-scope-and-roadmap-2026-10.md; research A3③ N1). Pure function:
// the guideline, the 90-day rule and the N1 deadline all come from
// lib/ontario/rules (one source for both hats). It CHECKS and cites; it never
// declares a notice "invalid" — above-guideline increases can be lawful under
// an LTB-approved AGI (s.126) or the post-2018-11-15 exemption (s.6.1), and
// whether a notice is void is for the LTB. Every finding names the section.
import { guidelineFor, N1_NOTICE_DAYS, n1DeadlineFor } from '@/lib/ontario/rules'
import { daysBetween, isoDate, parseDateOnly, utcDateClamped } from '@/lib/dates'

export type Bi = { zh: string; en: string }

export type N1Input = {
  /** current monthly rent, dollars */
  currentRent: number
  /** rent stated on the notice, dollars */
  newRent: number
  /** date the increase takes effect (YYYY-MM-DD) */
  effectiveDate: string
  /** date the notice was given to the tenant (YYYY-MM-DD) */
  servedDate: string
  /** last rent increase (or tenancy start), YYYY-MM-DD — optional */
  lastIncreaseDate?: string | null
}

export type N1FindingCode =
  | 'within_guideline'
  | 'over_guideline'
  | 'guideline_unpublished'
  | 'notice_ok'
  | 'notice_short'
  | 'within_12_months'
  | 'twelve_months_ok'
  | 'decrease'

export type N1Finding = {
  code: N1FindingCode
  /** section cited, e.g. "RTA s.120" */
  statute: string
  /** ok = matches the rule · check = worth raising with the landlord / LTB · info = context */
  tone: 'ok' | 'check' | 'info'
  message: Bi
}

export type N1Check = {
  /** increase in percent, 2 decimals (negative = decrease) */
  pct: number
  /** guideline for the year the increase takes effect */
  guideline: number
  guidelineYear: number
  /** false when the province has not published that year yet (latest figure used) */
  published: boolean
  overGuideline: boolean
  /** days between service and the effective date */
  noticeDays: number
  noticeShort: boolean
  /** last day the notice could have been served for this effective date (s.116) */
  n1Deadline: string
  /** true when the increase takes effect less than 12 months after the last one (s.119) */
  within12Months: boolean
  /** earliest effective date that satisfies s.119, when lastIncreaseDate was given */
  earliestBy12Months: string | null
  findings: N1Finding[]
  links: { ltb: string; guideline: string; rules: string }
}

export const N1_LINKS = {
  ltb: 'https://tribunalsontario.ca/ltb/',
  guideline: 'https://www.ontario.ca/page/rent-increase-guideline',
  rules: '/rules',
} as const

const round2 = (n: number) => Math.round(n * 100) / 100

/** The check, or null when a number or date cannot be read. */
export function checkN1(input: N1Input): N1Check | null {
  const cur = Number(input.currentRent)
  const next = Number(input.newRent)
  const eff = parseDateOnly(input.effectiveDate)
  const served = parseDateOnly(input.servedDate)
  if (!Number.isFinite(cur) || !Number.isFinite(next) || cur <= 0 || next < 0 || !eff || !served) return null

  const pct = round2(((next - cur) / cur) * 100)
  const g = guidelineFor(isoDate(eff))
  const overGuideline = pct > g.pct + 1e-9
  const noticeDays = daysBetween(served, eff)
  const noticeShort = noticeDays < N1_NOTICE_DAYS
  const n1Deadline = n1DeadlineFor(isoDate(eff))

  const last = input.lastIncreaseDate ? parseDateOnly(input.lastIncreaseDate) : null
  const earliestBy12 = last ? utcDateClamped(last.getUTCFullYear() + 1, last.getUTCMonth(), last.getUTCDate()) : null
  const within12Months = !!(earliestBy12 && eff.getTime() < earliestBy12.getTime())

  const findings: N1Finding[] = []
  const pctText = `${pct > 0 ? '+' : ''}${pct.toFixed(2)}%`

  if (pct <= 0) {
    findings.push({
      code: 'decrease', statute: 'RTA s.120', tone: 'info',
      message: {
        zh: `通知上的租金没有上涨（${pctText}）。指导比例只约束涨租。`,
        en: `The notice does not raise the rent (${pctText}). The guideline only limits increases.`,
      },
    })
  } else if (overGuideline) {
    findings.push({
      code: 'over_guideline', statute: 'RTA s.120 · s.126 · s.6.1', tone: 'check',
      message: {
        zh: `涨幅 ${pctText} 超过 ${g.year} 年指导比例 ${g.pct}%，除非房东持有 LTB 批准的 AGI（s.126）或该单元属 2018-11-15 后首次入住的豁免（s.6.1）。可以向房东索取 AGI 的 LTB 命令编号，或向 LTB 咨询。`,
        en: `The increase of ${pctText} is above the ${g.year} guideline of ${g.pct}%, unless the landlord holds an LTB-approved AGI (s.126) or the unit is exempt as first occupied after 2018-11-15 (s.6.1). You can ask the landlord for the LTB order number, or ask the LTB.`,
      },
    })
  } else {
    findings.push({
      code: 'within_guideline', statute: 'RTA s.120', tone: 'ok',
      message: {
        zh: `涨幅 ${pctText} 在 ${g.year} 年指导比例 ${g.pct}% 以内。`,
        en: `The increase of ${pctText} is within the ${g.year} guideline of ${g.pct}%.`,
      },
    })
  }
  if (!g.published) {
    findings.push({
      code: 'guideline_unpublished', statute: 'RTA s.120(2)', tone: 'info',
      message: {
        zh: `省里还没有公布 ${g.year} 年的指导比例，这里先按最近公布的 ${g.pct}% 核对；公布后请再核一次。`,
        en: `Ontario has not published the ${g.year} guideline yet; this check uses the latest published figure (${g.pct}%). Re-check once it is announced.`,
      },
    })
  }

  if (noticeShort) {
    findings.push({
      code: 'notice_short', statute: 'RTA s.116(1)', tone: 'check',
      message: {
        zh: `通知期不足 ${N1_NOTICE_DAYS} 天：送达日到生效日只有 ${noticeDays} 天。按 s.116，生效于 ${isoDate(eff)} 的涨租最晚应在 ${n1Deadline} 送达。可以把这一点告诉房东，或向 LTB 咨询。`,
        en: `Less than ${N1_NOTICE_DAYS} days’ notice: ${noticeDays} days between service and the effective date. Under s.116 a notice for ${isoDate(eff)} had to be served by ${n1Deadline}. You can raise this with the landlord or ask the LTB.`,
      },
    })
  } else {
    findings.push({
      code: 'notice_ok', statute: 'RTA s.116(1)', tone: 'ok',
      message: {
        zh: `通知期 ${noticeDays} 天，满足至少 ${N1_NOTICE_DAYS} 天的要求（最晚送达日 ${n1Deadline}）。`,
        en: `${noticeDays} days’ notice meets the ${N1_NOTICE_DAYS}-day minimum (latest service date ${n1Deadline}).`,
      },
    })
  }

  if (earliestBy12) {
    if (within12Months) {
      findings.push({
        code: 'within_12_months', statute: 'RTA s.119(1)', tone: 'check',
        message: {
          zh: `距上一次涨租（${input.lastIncreaseDate}）不满 12 个月：按 s.119，下一次涨租最早可生效于 ${isoDate(earliestBy12)}。`,
          en: `Less than 12 months since the last increase (${input.lastIncreaseDate}): under s.119 the next increase can take effect no earlier than ${isoDate(earliestBy12)}.`,
        },
      })
    } else {
      findings.push({
        code: 'twelve_months_ok', statute: 'RTA s.119(1)', tone: 'ok',
        message: {
          zh: `距上一次涨租已满 12 个月。`,
          en: `At least 12 months since the last increase.`,
        },
      })
    }
  }

  return {
    pct,
    guideline: g.pct,
    guidelineYear: g.year,
    published: g.published,
    overGuideline,
    noticeDays,
    noticeShort,
    n1Deadline,
    within12Months,
    earliestBy12Months: earliestBy12 ? isoDate(earliestBy12) : null,
    findings,
    links: { ...N1_LINKS },
  }
}
