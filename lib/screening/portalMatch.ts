// Ontario Courts Portal party matching — pure, unit-tested.
//
// 2026-09-12: two real records were missed by the old "every query token
// must appear verbatim + one token must equal the record surname" rule:
//   · "QUIROGA, LEONARDO" (5 defendant-side cases) for the query
//     "LEONARDO ALFREDO QUIROGA" — the court omitted the middle name;
//   · "NATHALI, CRISTINE CIPRIANI CAMPINS" (debtor, open) for the query
//     "NATHALIE CIPRIANI CAMPINS" — the clerk dropped one letter.
// A clerk's spelling and a missing middle name must not hide a record; a
// surname buried inside someone else's given name still must not create one
// ("XIONG YI" vs "ZHENG, YI XIONG").

export function nameTokens(s: string): string[] {
  return (s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z\s,]/g, ' ')
    .split(/[\s,]+/)
    .filter(t => t.length >= 2)
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  const m = a.length, n = b.length
  if (!m) return n
  if (!n) return m
  let prev = Array.from({ length: n + 1 }, (_, j) => j)
  for (let i = 1; i <= m; i++) {
    const cur = [i]
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    prev = cur
  }
  return prev[n]
}

/** Exact, or one clerical slip on a token of five letters or more (one
 *  edit, or one of them missing the other's last letter). */
export function tokensMatch(a: string, b: string): { match: boolean; exact: boolean; substituted: boolean } {
  if (a === b) return { match: true, exact: true, substituted: false }
  if (a.length >= 5 && b.length >= 5) {
    // A dropped / extra letter (NATHALI ~ NATHALIE) is a clerk's slip; a
    // swapped letter (MARIA ~ MARIO) is usually another person.
    if (levenshtein(a, b) <= 1) return { match: true, exact: false, substituted: a.length === b.length }
  }
  return { match: false, exact: false, substituted: false }
}

export interface PortalPartyMatch {
  match: boolean
  /** strong = three or more tokens of the query line up (middle name or both
   *  surnames included); name_only = first name + surname only */
  confidence: 'strong' | 'name_only'
  matched: number
  fuzzy: boolean
  reason: string
}

/** The record's surname tokens: the part of the portal sortName before the
 *  comma ("QUIROGA, LEONARDO ALFREDO" → ["quiroga"]), else the last token. */
function recordSurnameTokens(displayName: string, sortName: string): string[] {
  const sn = (sortName || '').trim()
  if (sn.includes(',')) {
    const t = nameTokens(sn.split(',')[0])
    if (t.length) return t
  }
  const t = nameTokens(displayName)
  return t.length ? [t[t.length - 1]] : []
}

export function matchPortalParty(queryName: string, displayName: string, sortName: string): PortalPartyMatch {
  const q = nameTokens(queryName)
  const no = (reason: string): PortalPartyMatch => ({ match: false, confidence: 'name_only', matched: 0, fuzzy: false, reason })
  if (q.length < 2) return no('query needs a first name and a surname')
  const r = Array.from(new Set([...nameTokens(displayName), ...nameTokens(sortName)]))
  if (r.length === 0) return no('record has no name')

  let matched = 0
  let fuzzy = false
  let fuzzyCount = 0
  let substituted = false
  const missing: number[] = []
  q.forEach((qt, i) => {
    let hit = false
    for (const rt of r) {
      const m = tokensMatch(qt, rt)
      if (m.match) { hit = true; if (!m.exact) { fuzzy = true; fuzzyCount++ } if (m.substituted) substituted = true; break }
    }
    if (hit) matched++
    else missing.push(i)
  })

  // The first name must be there.
  if (missing.includes(0)) return no('first name not on record')
  // At most one token may be missing, and only a middle name or the second
  // of two surnames — never the first name, never the only surname.
  if (missing.length > 1) return no(`${missing.length} query tokens absent`)
  if (q.length === 2 && missing.length === 1) return no('surname not on record')

  // The record's surname must be one of the query's surname tokens (the
  // last two), tolerantly — this is what stops "XIONG YI" ≈ "ZHENG, YI XIONG".
  // Exception: when EVERY token of a three-plus-token query lines up, the
  // person is identified whatever the clerk filed as the surname
  // ("NATHALI, CRISTINE CIPRIANI CAMPINS" was sorted under the first name).
  const surnameCandidates = q.slice(-2)
  const recSur = recordSurnameTokens(displayName, sortName)
  const surnameOk = recSur.some(rs => surnameCandidates.some(qs => tokensMatch(qs, rs).match))
  const allTokensLineUp = q.length >= 3 && missing.length === 0
  if (!surnameOk && !allTokensLineUp) return no(`record surname "${recSur.join(' ')}" is not the query surname`)

  // Review 2026-09-13: with one clerical edit allowed, MARIO JOSE GARCIA
  // lined up with MARIA JOSE GARCIA as strong (three tokens, one edit) and
  // strong is an auto-decline. A substituted letter is strong only with
  // four tokens; a dropped letter (NATHALI CIPRIANI CAMPINS) still is —
  // otherwise the record is shown and flagged, never gated.
  const confidence: PortalPartyMatch['confidence'] = q.length >= 3 && matched >= 3 && fuzzyCount <= 1 && (!substituted || matched >= 4) ? 'strong' : 'name_only'
  return { match: true, confidence, matched, fuzzy, reason: `${matched}/${q.length} tokens${fuzzy ? ' (one clerical variant)' : ''}` }
}

export function isRespondentSide(role: string | undefined): boolean {
  const r = (role || '').toLowerCase()
  return r.includes('defendant') || r.includes('debtor') || r.includes('respondent')
}

/** The portal queries worth running for a name, in order. Every one runs and
 *  the matches are merged: the first tier that hit used to end the search,
 *  so "QUIROGA, LEONARDO ALFREDO" (one exact hit) hid the five cases filed
 *  under "QUIROGA, LEONARDO". */
export function planPortalQueries(normalizedName: string): Array<{ name: string; type: '10462' | '300054'; swapped: boolean }> {
  const parts = normalizedName.split(' ').filter(p => p.length >= 2)
  const plan: Array<{ name: string; type: '10462' | '300054'; swapped: boolean }> = []
  const seen = new Set<string>()
  const add = (name: string, type: '10462' | '300054', swapped = false) => {
    const k = `${type}:${name}`
    if (name && !seen.has(k)) { seen.add(k); plan.push({ name, type, swapped }) }
  }
  add(normalizedName, '10462')
  if (parts.length >= 2) {
    add([parts[parts.length - 1], ...parts.slice(0, -1)].join(' '), '10462', true)
    add([...parts].reverse().join(' '), '10462', true)
  }
  if (parts.length >= 3) {
    // Courts often file first + last only; Hispanic names may be filed
    // under either surname.
    add(`${parts[0]} ${parts[parts.length - 1]}`, '10462')
    add(`${parts[0]} ${parts[parts.length - 2]}`, '10462')
  }
  add(normalizedName, '300054')
  if (parts.length >= 3) add(parts.slice(-2).join(' '), '300054')
  return plan
}

export function portalMatchKey(caseNumber: string, partyDisplayName: string): string {
  return `${caseNumber}|${(partyDisplayName || '').toLowerCase().replace(/\s+/g, ' ').trim()}`
}

const PARTY_NOISE = new Set(['et', 'al', 'v', 'vs', 'the', 'and', 'of', 'inc', 'ltd', 'limited', 'corp', 'corporation', 'company', 'bank', 'canada', 'canadian', 'ontario', 'trust', 'finance', 'financial', 'credit', 'services', 'branch', 'estate', 'group', 'holdings', 'imperial', 'commerce', 'capital', 'one', 'home', 'royal', 'toronto', 'dominion', 'nova', 'scotia', 'montreal', 'national'])

/** Distinctive party surnames in a case title ("UMANA v. CZUPAJLO et al" → umana, czupajlo). */
export function caseTitleParties(title: string): Set<string> {
  return new Set(nameTokens(title).filter(t => t.length >= 5 && !PARTY_NOISE.has(t)))
}

/** A name-only match that shares a co-party with a strong match of the same
 *  person is the same litigant: "QUIROGA, LEONARDO" in "CANADIAN IMPERIAL
 *  BANK OF COMMERCE v. CZUPAJLO et al" next to "QUIROGA, LEONARDO ALFREDO" in
 *  "UMANA v. CZUPAJLO et al". Upgraded in place; returns the count. */
export function corroborateByCoParties<T extends { caseTitle: string; matchConfidence?: 'strong' | 'name_only' }>(matches: T[], queryName = ''): number {
  // The applicant's own tokens are not a "shared co-party": "PATEL v.
  // QUIROGA" and "HOME TRUST v. QUIROGA" share only the surname being
  // searched (review 2026-09-13).
  const own = new Set(nameTokens(queryName))
  const parties = (title: string) => Array.from(caseTitleParties(title)).filter(p => !own.has(p) && !Array.from(own).some(o => tokensMatch(o, p).match))
  const strongParties = new Set<string>()
  for (const m of matches) if (m.matchConfidence === 'strong') for (const p of parties(m.caseTitle)) strongParties.add(p)
  if (strongParties.size === 0) return 0
  let upgraded = 0
  for (const m of matches) {
    if (m.matchConfidence === 'strong') continue
    const shared = parties(m.caseTitle).filter(p => strongParties.has(p))
    if (shared.length > 0) { m.matchConfidence = 'strong'; upgraded++ }
  }
  return upgraded
}
