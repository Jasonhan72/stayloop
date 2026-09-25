// Pick the screening summary in the UI language (three-role test report
// 2026-09-24, SL-L-06: pages read the English-only ai_summary column in the
// Chinese UI). Falls back to the other language only when the row has none.
export type SummaryRow = { ai_summary?: string | null; ai_summary_en?: string | null; ai_summary_zh?: string | null } | null | undefined

export function summaryFor(row: SummaryRow, zh: boolean): string {
  if (!row) return ''
  const en = row.ai_summary_en || row.ai_summary || ''
  const cn = row.ai_summary_zh || ''
  return (zh ? cn || en : en || cn).trim()
}
