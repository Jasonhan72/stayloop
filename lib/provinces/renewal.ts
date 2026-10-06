// Renewal touchpoints outside Ontario (2026-10-06 · V0.7). The 90 / 60 / 30
// planner in lib/agent/renewalStages is built on Ontario's RTA (guideline A/B,
// the N1, month-to-month under s.38). A lease in another province gets the
// timing and wording of THAT province — and only what lib/provinces/rules has
// verified against the official source. Every number below is read out of
// the corresponding fact text (tests/provinceRenewal20261006.spec.ts checks
// each one appears there); every sentence a card shows is the fact itself.
// Ontario → every helper returns null, so callers keep their Ontario path.
// Pure data + date arithmetic, no I/O, no 'use client'.
import { isoDate, parseDateOnly, utcDateClamped } from '@/lib/dates'
import { normalizeProvince, provinceName, type NonOntarioCode, type ProvinceCode } from './detect'
import { rulesFor, type Bi, type Lang, type ProvinceRules } from './rules'

export type RenewalTiming = {
  code: NonOntarioCode
  /** The landlord's written step before the term ends (a rent increase or a renewal offer), named as the fact names it; null = the facts record no landlord step before a fixed term ends (Alberta). */
  step: Bi | null
  /** Months before the effective date (the day after the term ends) by which that step must be served. */
  noticeMonths: number | null
  /** Earliest the step may be served, in months before the effective date (Quebec: 6); null = no earliest date in the facts. */
  earliestMonths: number | null
}

// Each entry restates one clause of PROVINCE_RULES[code].rentIncrease / leaseEnd.
const TIMING: Record<NonOntarioCode, Omit<RenewalTiming, 'code'>> = {
  QC: { step: { zh: '书面修改通知（涨租或改条款）', en: 'written notice of modification (rent or terms)' }, noticeMonths: 3, earliestMonths: 6 },
  BC: { step: { zh: 'RTB-7 涨租通知', en: 'RTB-7 notice of rent increase' }, noticeMonths: 3, earliestMonths: null },
  AB: { step: null, noticeMonths: null, earliestMonths: null },
  MB: { step: { zh: '续约提议（涨租须附 Form 1A 通知）', en: 'renewal offer (with a Form 1A notice for any increase)' }, noticeMonths: 3, earliestMonths: null },
  SK: { step: { zh: '两个月意向通知', en: 'two-month notice of intention' }, noticeMonths: 2, earliestMonths: null },
  NS: { step: { zh: '涨租书面通知', en: 'written notice of rent increase' }, noticeMonths: 4, earliestMonths: null },
  NB: { step: { zh: '涨租书面通知', en: 'written notice of rent increase' }, noticeMonths: 6, earliestMonths: null },
  PE: { step: { zh: 'Form 8 涨租通知', en: 'Form 8 notice of rent increase' }, noticeMonths: 3, earliestMonths: null },
  NL: { step: { zh: '涨租书面通知', en: 'written notice of rent increase' }, noticeMonths: 6, earliestMonths: null },
  YT: { step: { zh: '涨租书面通知', en: 'written notice of rent increase' }, noticeMonths: 3, earliestMonths: null },
  NT: { step: { zh: '涨租书面通知', en: 'written notice of rent increase' }, noticeMonths: 3, earliestMonths: null },
  NU: { step: { zh: '涨租书面通知', en: 'written notice of rent increase' }, noticeMonths: 3, earliestMonths: null },
}

/** Timing for a province outside Ontario; null for Ontario / unknown (callers keep the Ontario planner). */
export function renewalTiming(code: ProvinceCode | string | null | undefined): RenewalTiming | null {
  const c = normalizeProvince(code)
  if (!c || c === 'ON') return null
  return { code: c, ...TIMING[c] }
}

/** The day after the term ends — when a renewal change takes effect. */
function effectiveDate(endDate: string): Date | null {
  const end = parseDateOnly(endDate)
  return end ? new Date(end.getTime() + 86_400_000) : null
}

/** `months` calendar months before `d` (same month-end clamping as the rent schedule: Mar 31 − 1 month = Feb 28). */
function monthsBefore(d: Date, months: number): Date {
  return utcDateClamped(d.getUTCFullYear(), d.getUTCMonth() - months, d.getUTCDate())
}

/** Latest service date for the landlord's written step before `endDate` (YYYY-MM-DD), or null when the province has no such step. */
export function provinceNoticeDeadline(code: ProvinceCode | string | null | undefined, endDate: string): string | null {
  const t = renewalTiming(code)
  const eff = effectiveDate(endDate)
  if (!t || !eff || t.noticeMonths == null) return null
  return isoDate(monthsBefore(eff, t.noticeMonths))
}

/** Earliest service date (Quebec: six months before), or null. */
export function provinceNoticeEarliest(code: ProvinceCode | string | null | undefined, endDate: string): string | null {
  const t = renewalTiming(code)
  const eff = effectiveDate(endDate)
  if (!t || !eff || t.earliestMonths == null) return null
  return isoDate(monthsBefore(eff, t.earliestMonths))
}

// A touchpoint card should appear with enough lead to act: a month before the
// deadline, never earlier than the province lets the notice be served, and
// never later than Ontario's 120-day window.
const ONTARIO_WINDOW_DAYS = 120
const DAYS_PER_MONTH = 31
/** Days before the term end at which the first province touchpoint is proposed. */
export function provinceWindowDays(code: ProvinceCode | string | null | undefined): number {
  const t = renewalTiming(code)
  if (!t) return ONTARIO_WINDOW_DAYS
  if (t.earliestMonths != null) return t.earliestMonths * DAYS_PER_MONTH
  if (t.noticeMonths != null) return Math.max(ONTARIO_WINDOW_DAYS, t.noticeMonths * DAYS_PER_MONTH + 30)
  return ONTARIO_WINDOW_DAYS
}
/** The widest window any province needs — the proactive scan's lease horizon. */
export const MAX_RENEWAL_WINDOW_DAYS = Math.max(ONTARIO_WINDOW_DAYS, ...(Object.keys(TIMING) as NonOntarioCode[]).map(provinceWindowDays))

const pick = (t: Bi, lang: Lang): string => (lang === 'zh' ? t.zh : t.en)

/** The province's own sentence on how a term ends and what each side must do (the leaseEnd fact), or null for Ontario. */
export function leaseEndFact(code: ProvinceCode | string | null | undefined, lang: Lang): string | null {
  const r = rulesFor(code)
  return r ? pick(r.leaseEnd, lang) : null
}

/** The province's own sentence on rent increases (the rentIncrease fact), or null for Ontario. */
export function rentIncreaseFact(code: ProvinceCode | string | null | undefined, lang: Lang): string | null {
  const r = rulesFor(code)
  return r ? pick(r.rentIncrease, lang) : null
}

export type ProvinceTouchpoint = {
  code: NonOntarioCode
  provinceName: string
  /** 「书面修改通知（涨租或改条款）最晚 2027-01-31 送达（最早 2026-10-31）」 or the no-step sentence. */
  stepLine: string
  noticeDeadline: string | null
  earliest: string | null
  rentIncrease: string
  leaseEnd: string
  tribunal: { name: string; url: string }
}

/** Everything a renewal card / rail headline outside Ontario may say, in one language. Null for Ontario. */
export function provinceTouchpoint(code: ProvinceCode | string | null | undefined, endDate: string, lang: Lang): ProvinceTouchpoint | null {
  const t = renewalTiming(code)
  const r: ProvinceRules | null = rulesFor(code)
  if (!t || !r) return null
  const deadline = provinceNoticeDeadline(code, endDate)
  const earliest = provinceNoticeEarliest(code, endDate)
  const name = provinceName(t.code, lang)
  let stepLine: string
  if (t.step && deadline) {
    stepLine = lang === 'zh'
      ? `${t.step.zh}最晚 ${deadline} 送达（到期前 ${t.noticeMonths} 个月）${earliest ? `，最早 ${earliest}` : ''}。`
      : `${t.step.en} must be served by ${deadline} (${t.noticeMonths} months before the term ends)${earliest ? `, and not before ${earliest}` : ''}.`
  } else {
    stepLine = lang === 'zh' ? '到期前没有房东必须送达的通知；要改租金或条款，须另签新约。' : 'No landlord notice is required before the term ends; a new rent or new terms need a new lease.'
  }
  return {
    code: t.code,
    provinceName: name,
    stepLine,
    noticeDeadline: deadline,
    earliest,
    rentIncrease: pick(r.rentIncrease, lang),
    leaseEnd: pick(r.leaseEnd, lang),
    tribunal: { name: pick(r.tribunal, lang), url: r.tribunal.url },
  }
}
