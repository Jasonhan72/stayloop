// 「留人让步 vs 空置成本」的算术 (2026-10-26 · report review batch 1 item 5a;
// design/ai-rebuild-report-review-2026-10-25.md). Pure: every number is one
// the landlord typed. Ontario context: a sitting tenant's increase stays
// within the guideline, so the only lever on turnover is whether to concede
// something to keep them — this compares that concession with what an empty
// unit costs. No market data, no model, no recommendation.
export const DAYS_PER_MONTH = 365 / 12 // 30.4167, the report's own convention

export type VacancyInput = {
  monthlyRent: number
  /** Days the unit is expected to sit empty between tenants. */
  vacantDays: number
  /** Cleaning, repairs, photos, listing fees — whatever turnover costs out of pocket. */
  turnoverCost: number
  /** What keeping the tenant would cost per month (a reduction, a waived increase, a perk). */
  concessionPerMonth: number
  /** Months the concession runs; 12 by default. */
  months?: number
}

export type VacancyOut = {
  perDay: number
  vacancy: number
  turnoverTotal: number
  concessionTotal: number
  /** turnoverTotal − concessionTotal: positive = turnover costs more than the concession. */
  difference: number
  /** Vacant days at which turnover and concession cost the same (null when the rent is 0). */
  breakEvenDays: number | null
}

const n = (v: unknown) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : 0)

export function vacancyCost(i: VacancyInput): VacancyOut {
  const rent = n(i.monthlyRent)
  const perDay = rent / DAYS_PER_MONTH
  const vacancy = perDay * n(i.vacantDays)
  const turnoverTotal = vacancy + n(i.turnoverCost)
  const concessionTotal = n(i.concessionPerMonth) * (i.months == null ? 12 : n(i.months))
  const breakEvenDays = perDay > 0 ? Math.max(0, (concessionTotal - n(i.turnoverCost)) / perDay) : null
  return { perDay, vacancy, turnoverTotal, concessionTotal, difference: turnoverTotal - concessionTotal, breakEvenDays }
}
