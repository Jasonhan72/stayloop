// Provider reviews — pure rules shared by the review form and tests
// (provider_reviews: one per party per work order, within 14 days of acceptance).
export const REVIEW_WINDOW_DAYS = 14

/** Still inside the 14-day window after acceptance? (null acceptance → false) */
export function reviewWindowOpen(acceptedAt: string | null | undefined, now: Date = new Date()): boolean {
  if (!acceptedAt) return false
  const t = new Date(acceptedAt).getTime()
  if (!Number.isFinite(t)) return false
  return now.getTime() - t < REVIEW_WINDOW_DAYS * 86_400_000
}
