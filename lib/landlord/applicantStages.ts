// Landlord applicant queue, grouped by where each application is in the
// flow (proposal 2026-09-23 §3.2 · landlord): 待筛查 → 已评分待决定 → 已决定.
// The score is information inside a row, never the grouping key — a
// threshold-based grouping is the pattern OHRC's rental policy warns
// against, and the earlier "推荐审批 / 不达标" buckets were exactly that.
export type ApplicantStage = 'unscreened' | 'scored' | 'decided'

export function applicantStage(row: { status: string | null; ai_score: number | null; decision_notified_at?: string | null; screened_at?: string | null }): ApplicantStage {
  if (row.status === 'approved' || row.status === 'declined' || row.decision_notified_at) return 'decided'
  if (row.ai_score != null) return 'scored'
  return 'unscreened'
}

export const STAGE_SECTIONS: { stage: ApplicantStage; label: { zh: string; en: string }; hint: { zh: string; en: string }; tone: 'warn' | 'ok' | 'neutral' }[] = [
  { stage: 'unscreened', label: { zh: '待筛查', en: 'To screen' }, hint: { zh: '打开申请 → 一键筛查（材料已在申请里）', en: 'Open the application → screen on one click (documents are attached)' }, tone: 'warn' },
  { stage: 'scored', label: { zh: '已评分 · 待你决定', en: 'Scored · your decision' }, hint: { zh: '评分仅供参考；录取或婉拒都由你决定并发通知', en: 'The score is information only; you decide and the notice goes out on approval' }, tone: 'ok' },
  { stage: 'decided', label: { zh: '已决定', en: 'Decided' }, hint: { zh: '通知已发出；录取的可从申请起草租约', en: 'Notice sent; draft the lease from an approved application' }, tone: 'neutral' },
]
