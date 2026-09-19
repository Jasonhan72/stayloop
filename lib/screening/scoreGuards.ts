// Small pure guards used by app/api/screen-score (review 2026-09-19).
// Kept out of the route so they can be unit-tested without the edge runtime.

/** Sections that carry the negative signal and are emitted LAST by the model. */
export const REQUIRED_SCORE_SECTIONS = [
  'scores', 'flags', 'hard_gates_triggered', 'compliance_audit',
  'sub_coverage', 'action_items', 'summary_zh', 'summary_en',
] as const

/**
 * Which integrity-bearing sections are absent from an output that did NOT end
 * cleanly. "Not cleanly" is a max_tokens stop OR a stream that closed without
 * its stop event (dropped connection): in both cases the salvage parser closes
 * the open brackets and every field the model had not reached is simply gone —
 * a report that reads clean because the connection died. A clean stop returns
 * [] regardless of what the model chose to omit (other validators handle that).
 */
export function missingRequiredSections(
  parsed: Record<string, unknown> | null | undefined,
  end: { stopReason?: string | null; sawMessageStop: boolean },
): string[] {
  const unclean = end.stopReason === 'max_tokens' || !end.sawMessageStop
  if (!unclean) return []
  const p = parsed && typeof parsed === 'object' ? parsed : {}
  return REQUIRED_SCORE_SECTIONS.filter(k => (p as Record<string, unknown>)[k] === undefined)
}

/** Model-supplied flag lists: keep strings only. A non-Anthropic model once
 *  returned objects, and `flag.startsWith` threw the whole run. */
export function stringFlags(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.length > 0) : []
}

function latinTokens(s: string | null | undefined): string[] {
  return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(t => t.length >= 2)
}

/**
 * Does an ID document name the applicant?  true / false / null (no verdict).
 *
 * The landlord-typed name may be blank (11/185 production rows), a single
 * token ("Xiaoming") or CJK ("王小明") while the ID prints "WANG XIAOMING".
 * None of those can be compared token-for-token, and "cannot compare" must
 * never read as "inconsistent" (−20 and an identity cap of 40). With fewer
 * than two Latin tokens the model-extracted name stands in; if that is not
 * comparable either there is no verdict.
 */
export function identityNameVerdict(args: {
  idDocNames: string[]
  applicantName: string | null | undefined
  extractedName?: string | null
  matches: (idName: string, applicant: string) => boolean
}): boolean | null {
  const ids = (args.idDocNames || []).filter(n => typeof n === 'string' && n.trim().length > 0)
  if (ids.length === 0) return null
  const candidates = [args.applicantName, args.extractedName]
    .filter((n): n is string => typeof n === 'string' && latinTokens(n).length >= 2)
  if (candidates.length === 0) return null
  // The typed name is compared first; the extracted name only stands in when
  // the typed one is not comparable.
  const ref = candidates[0]
  return ids.some(n => args.matches(n, ref))
}

/** Lowest cap among the triggered gates (100 = uncapped). Computed at the
 *  point of use: gates are pushed by several later checks. */
export function gateCapFor(hardGates: string[], caps: Record<string, number>): number {
  return hardGates.length > 0 ? Math.min(...hardGates.map(g => (Object.prototype.hasOwnProperty.call(caps, g) ? caps[g] : 100))) : 100
}

/** The parenthetical that closes the rental-history court sentence. Strong
 *  respondent-side portal records ARE counted (hard gate) — saying "name-only,
 *  not scored" next to a capped score contradicted the report's own gate. */
export function courtHistoryQualifier(strongRespondentCount: number, nameOnlyCount: number): { zh: string; en: string } {
  if (strongRespondentCount > 0) {
    const restZh = nameOnlyCount > 0 ? `；另 ${nameOnlyCount} 条仅姓名匹配，未计入评分，须先核实是否同一人` : ''
    const restEn = nameOnlyCount > 0 ? `; ${nameOnlyCount} further name-only match(es) are not scored — verify identity first` : ''
    return {
      zh: `其中 ${strongRespondentCount} 条为全名匹配（三个及以上姓名词一致）且申请人为被告 / 债务人 / 被申请人方，已通过硬门槛计入评分；立案不等于判决结果，请向申请人逐件核实${restZh}`,
      en: `${strongRespondentCount} are full-name matches (three or more name tokens) with the applicant on the defendant / debtor / respondent side and are counted through a hard gate; a filing is not an outcome — ask the applicant about each case${restEn}`,
    }
  }
  return {
    zh: '仅姓名匹配——门户不含生日/地址，须先核实是否同一人，未计入评分',
    en: 'name-only matches — the portal carries no DOB/address; verify identity before drawing conclusions. Not scored.',
  }
}
