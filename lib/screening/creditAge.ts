// -----------------------------------------------------------------------------
// Credit-report tradeline ages vs the applicant's date of birth.
//
// Case 24 (2026-08-21): an applicant born in 2003 uploaded an Equifax report
// listing a Rogers account opened 2005 (age 2), a Citi card opened 2015 (11),
// a Honda loan 2016 (13) and a Capital One card 2018 (15) — all "Individual".
// Two external reviewers caught it instantly; our pipeline transcribed every
// tradeline, displayed the open dates next to the applicant's DOB-verified
// licence, and never compared the two. A minor cannot open an individual
// credit account in Canada (provincial age of majority, 18/19), so each such
// line means the report belongs to someone else, has been merged, or has been
// edited — any of which disqualifies it as evidence.
//
// Pure function — unit-tested in tests/creditAge.spec.ts.
// -----------------------------------------------------------------------------

export interface TradelineForAge {
  creditor?: string | null
  type?: string | null
  date_opened?: string | null
  /** "Individual" | "Joint" | "Authorized" | … — as transcribed, if present. */
  responsibility?: string | null
}

export interface TradelineAgeResult {
  /** opened at age < 16 — impossible for any responsibility type */
  impossible: Array<{ creditor: string; opened: string; age: number }>
  /** opened at 16–17 as an Individual account — implausible, verify */
  underage: Array<{ creditor: string; opened: string; age: number }>
  /** tradelines whose open date could not be parsed (not counted either way) */
  unparsed: number
}

/** First 4-digit year in an open-date string ("2016/08/31", "08/2016", "2016-08"). */
function yearOf(s: string | null | undefined): number | null {
  const m = (s || '').match(/\b((?:19|20)\d{2})\b/)
  return m ? Number(m[1]) : null
}
function monthOf(s: string | null | undefined): number | null {
  const m = (s || '').match(/\b(?:19|20)\d{2}[\/\-.](\d{1,2})/) || (s || '').match(/\b(\d{1,2})[\/\-.](?:19|20)\d{2}\b/)
  const v = m ? Number(m[1]) : NaN
  return v >= 1 && v <= 12 ? v : null
}

/**
 * @param dob ISO "YYYY-MM-DD" or partial "YYYY" / "YYYY-MM" — the masked
 *        bureau DOB ("2003-xx-27") and the Ontario-DL-decoded DOB both work.
 */
export function checkTradelineAges(tradelines: TradelineForAge[], dob: string | null | undefined): TradelineAgeResult {
  const out: TradelineAgeResult = { impossible: [], underage: [], unparsed: 0 }
  const dobYear = yearOf(dob)
  if (!dobYear) return out
  const dobMonth = monthOf(dob)
  for (const t of tradelines || []) {
    const y = yearOf(t.date_opened)
    if (!y) { out.unparsed++; continue }
    const m = monthOf(t.date_opened)
    // Age in whole years at opening, conservative toward OLDER (a month-less
    // date is treated as December; a month-less DOB as January) so a borderline
    // case is never called underage by rounding.
    let age = y - dobYear
    if (dobMonth && m && m < dobMonth) age -= 1
    const resp = (t.responsibility || '').toLowerCase()
    const shared = /joint|authori[sz]ed|co-?signer|supplementary|secondary/.test(resp)
    const row = { creditor: (t.creditor || '').trim() || '(unnamed)', opened: (t.date_opened || '').trim(), age }
    if (age < 16) out.impossible.push(row)
    else if (age < 18 && !shared) out.underage.push(row)
  }
  return out
}
