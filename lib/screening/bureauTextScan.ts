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
  const re = /Delinquenc(?:y|ies)\s+(?!You\b)((?:(?:19|20)\d{2}[\/-]\d{2}[\/-]\d{2}\s*){1,6})/gi
  for (const m of t.matchAll(re)) {
    for (const d of m[1].match(/(?:19|20)\d{2}[\/-]\d{2}[\/-]\d{2}/g) || []) dates.add(d.replace(/\//g, '-'))
  }
  return {
    delinquency_dates: Array.from(dates).sort(),
    says_no_delinquencies: /no delinquencies on your credit file/i.test(t),
  }
}
