// Which extracted names deserve their own court / LTB search.
//
// 2026-09-11: the model's extracted_names carried every person in the file —
// the HR signatory, two prior landlords, the listing broker, a second
// agent — and each got a full Ontario Courts Portal + LTB pass. A 2017
// small-claims case where one of the LANDLORDS was the plaintiff then showed
// on the applicant's summary as "1 record found" in red. Landlords and
// agents are not screened here; only the applicant and co-applicants are.
//
// Rule: a supplemental name is searched only when an identity document (or
// the application's applicant section) carries it, and never when it belongs
// to a known third party (letter signatory, declared landlords, brokerage
// contacts). Pure; unit-tested.

export function normalizeName(name: string): string[] {
  return name
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z一-鿿\s'-]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length >= 2)
    .sort()
}

/** Same person: identical token set after accent-stripping and reordering
 *  ("REGUEIRO RODRIGUEZ CARLOS" ≡ "Carlos Regueiro Rodríguez"). */
export function sameName(a: string, b: string): boolean {
  const x = normalizeName(a), y = normalizeName(b)
  return x.length > 0 && x.length === y.length && x.every((t, i) => t === y[i])
}

/** Loose: one name's tokens are all contained in the other's (a two-token ID
 *  name inside a three-token application name, or vice versa). */
export function nameCovers(a: string, b: string): boolean {
  const x = new Set(normalizeName(a)), y = normalizeName(b)
  if (y.length < 2 || x.size < 2) return false
  const small = y.length <= x.size ? y : Array.from(x)
  const big = y.length <= x.size ? x : new Set(y)
  return small.every(t => big.has(t))
}

export interface CoApplicantContext {
  /** names printed on identity documents / the applicant section of the form */
  idDocNames: string[]
  /** names known to belong to third parties: letter signatory, declared landlords, brokerage contacts */
  thirdPartyNames: string[]
}

export function selectCoApplicantNames(extracted: string[], primary: string, ctx: CoApplicantContext): { searched: string[]; dropped: Array<{ name: string; reason: 'primary' | 'third_party' | 'not_on_id' | 'invalid' }> } {
  const searched: string[] = []
  const dropped: Array<{ name: string; reason: 'primary' | 'third_party' | 'not_on_id' | 'invalid' }> = []
  for (const raw of extracted) {
    const name = (raw || '').trim()
    if (normalizeName(name).length < 2) { dropped.push({ name, reason: 'invalid' }); continue }
    if (sameName(name, primary) || nameCovers(name, primary)) { dropped.push({ name, reason: 'primary' }); continue }
    if (ctx.thirdPartyNames.some(t => sameName(t, name) || nameCovers(t, name))) { dropped.push({ name, reason: 'third_party' }); continue }
    if (ctx.idDocNames.length > 0 && !ctx.idDocNames.some(t => sameName(t, name) || nameCovers(t, name))) { dropped.push({ name, reason: 'not_on_id' }); continue }
    if (searched.some(s => sameName(s, name))) continue
    searched.push(name)
  }
  return { searched, dropped }
}
