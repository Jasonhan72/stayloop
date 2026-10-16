// Applicant pack — how fresh a document is (V1.0 阶段 4 · 乙 #7 · G13, 2026-10-16).
// Pure. The thresholds are what landlords ask for in practice, not law:
//   paystub / bank_statement  > 90 days aging · > 180 stale
//   employment_letter         > 180 · > 365
//   credit_report             > 90 · > 180
//   id                        by its expiry date (as_of): expired = stale; expiring
//                             within 30 days = aging (a renewal is in order)
//   reference / other         not judged (always fresh)
// `date` is the document's own date (as_of) when the applicant gave one, else the
// upload time; `days` is how old it is today (for an ID: days past expiry, negative
// while it is still valid).
import type { ProfileFileKind } from './types'

export type FreshnessState = 'fresh' | 'aging' | 'stale'

export type Freshness = { days: number; state: FreshnessState; suggestZh: string; suggestEn: string }

const DAY_MS = 86_400_000

function toUtcDay(d: string | Date): number | null {
  if (d instanceof Date) return Number.isFinite(d.getTime()) ? Math.floor(d.getTime() / DAY_MS) : null
  const s = String(d || '').trim()
  if (!s) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  if (m) return Math.floor(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / DAY_MS)
  const t = Date.parse(s)
  return Number.isFinite(t) ? Math.floor(t / DAY_MS) : null
}

const THRESHOLDS: Partial<Record<ProfileFileKind, { aging: number; stale: number }>> = {
  paystub: { aging: 90, stale: 180 },
  bank_statement: { aging: 90, stale: 180 },
  employment_letter: { aging: 180, stale: 365 },
  credit_report: { aging: 90, stale: 180 },
}

const KIND_ZH: Record<ProfileFileKind, string> = {
  id: '证件', paystub: '工资单', bank_statement: '对账单', employment_letter: '在职信', credit_report: '信用报告', reference: '推荐信', other: '文件',
}
const KIND_EN: Record<ProfileFileKind, string> = {
  id: 'ID', paystub: 'pay stub', bank_statement: 'statement', employment_letter: 'employment letter', credit_report: 'credit report', reference: 'reference', other: 'file',
}

/** Thresholds, exported for the pages' hints. */
export function freshnessThresholds(kind: ProfileFileKind): { aging: number; stale: number } | null {
  return THRESHOLDS[kind] ?? null
}

/**
 * `freshness(kind, asOf ?? uploaded_at, today)`. Callers pass the as_of date when
 * the applicant gave one (the document's own date; for an ID its expiry), else
 * the upload time. A missing or unparseable date reads as fresh with days = 0.
 */
export function freshness(kind: ProfileFileKind, date: string | Date | null | undefined, today: Date = new Date()): Freshness {
  const t = toUtcDay(today)
  const d = date == null ? null : toUtcDay(date)
  if (t === null || d === null) return { days: 0, state: 'fresh', suggestZh: '', suggestEn: '' }
  const days = t - d

  if (kind === 'id') {
    // days > 0 means the expiry date is in the past.
    if (days > 0) return { days, state: 'stale', suggestZh: `证件已于 ${days} 天前过期，请上传有效证件`, suggestEn: `This ID expired ${days} day${days === 1 ? '' : 's'} ago — upload a valid one` }
    if (days >= -30) return { days, state: 'aging', suggestZh: `证件 ${-days} 天内到期，续期后请更新`, suggestEn: `This ID expires in ${-days} day${-days === 1 ? '' : 's'} — update it once renewed` }
    return { days, state: 'fresh', suggestZh: '', suggestEn: '' }
  }

  const th = THRESHOLDS[kind]
  if (!th) return { days: Math.max(0, days), state: 'fresh', suggestZh: '', suggestEn: '' }
  const age = Math.max(0, days)
  if (age > th.stale) {
    return {
      days: age,
      state: 'stale',
      suggestZh: `${KIND_ZH[kind]}已有 ${age} 天，房东通常要最近 ${th.aging} 天内的，请换成新的`,
      suggestEn: `This ${KIND_EN[kind]} is ${age} days old; landlords usually want one from the last ${th.aging} days — replace it`,
    }
  }
  if (age > th.aging) {
    return {
      days: age,
      state: 'aging',
      suggestZh: `${KIND_ZH[kind]}已有 ${age} 天，申请前最好换成最近的`,
      suggestEn: `This ${KIND_EN[kind]} is ${age} days old — best to replace it with a recent one before applying`,
    }
  }
  return { days: age, state: 'fresh', suggestZh: '', suggestEn: '' }
}

/** The worst state across a set of files (for a summary badge). */
export function worstFreshness(states: FreshnessState[]): FreshnessState {
  if (states.includes('stale')) return 'stale'
  if (states.includes('aging')) return 'aging'
  return 'fresh'
}
