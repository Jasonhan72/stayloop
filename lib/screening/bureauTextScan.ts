// Deterministic reads of an Equifax / TransUnion consumer PDF's text that the
// model transcription is allowed to miss but the score is not (2026-09-16,
// 6269 Ash St: a Fido "Delinquencies 2023/05/16" box with a $125 past-due
// month was transcribed as 0/0/0). Pure functions; production text is flat.

export interface BureauTextScan {
  /** dates printed under a "Delinquencies" heading (YYYY-MM-DD) */
  delinquency_dates: string[]
  /** true when the file says "no delinquencies" for at least one account */
  says_no_delinquencies: boolean
}

export function scanBureauDelinquencies(text: string | null | undefined): BureauTextScan {
  const t = (text || '').replace(/\s+/g, ' ')
  const dates = new Set<string>()
  // "Delinquencies 2023/05/16" / "Delinquencies 2023-05-16 2024-01-02"; the
  // "You currently have no delinquencies" sentence is skipped by the
  // negative look-ahead on "You".
  // Equifax prints YYYY/MM/DD; TransUnion prints "Delinquency Date MM/DD/YYYY".
  const re = /Delinquenc(?:y|ies)(?:\s+dates?)?\s*:?\s+(?!You\b)((?:(?:(?:19|20)\d{2}[\/-]\d{2}[\/-]\d{2}|\d{2}[\/-]\d{2}[\/-](?:19|20)\d{2})\s*){1,6})/gi
  for (const m of t.matchAll(re)) {
    for (const d of m[1].match(/(?:19|20)\d{2}[\/-]\d{2}[\/-]\d{2}|\d{2}[\/-]\d{2}[\/-](?:19|20)\d{2}/g) || []) {
      const ymd = d.match(/^((?:19|20)\d{2})[\/-](\d{2})[\/-](\d{2})$/)
      const mdy = d.match(/^(\d{2})[\/-](\d{2})[\/-]((?:19|20)\d{2})$/)
      if (ymd) dates.add(`${ymd[1]}-${ymd[2]}-${ymd[3]}`)
      else if (mdy) dates.add(+mdy[1] <= 12 ? `${mdy[3]}-${mdy[1]}-${mdy[2]}` : `${mdy[3]}-${mdy[2]}-${mdy[1]}`)
    }
  }
  return {
    delinquency_dates: Array.from(dates).sort(),
    says_no_delinquencies: /no delinquencies on your credit file/i.test(t),
  }
}
