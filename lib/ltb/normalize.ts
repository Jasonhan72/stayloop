// Normalisation shared by the LTB ingest and the LTB lookup.
//
// These two must agree character for character. If ingest strips a hyphen and
// the query does not, "Tina-Louise Freiburger" is in the table and unfindable —
// a silent false negative, which in screening is the failure you never see.
// So both sides import from here; nothing re-implements it.

/** Uppercase, accent-stripped, punctuation-free, single-spaced. */
export function normalizeName(raw: string): string {
  return (raw || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // combining accents
    .toUpperCase()
    .replace(/['’`.]/g, '') // O'BRIEN → OBRIEN, ST. → ST
    .replace(/[^A-Z0-9\s-]/g, ' ')
    .replace(/-/g, ' ') // TINA-LOUISE → TINA LOUISE
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Tokens sorted, so word order stops mattering: an order printed
 * "WANG SARAH" still matches an application that says "Sarah Wang".
 */
export function nameKey(raw: string): string {
  return normalizeName(raw).split(' ').filter(Boolean).sort().join(' ')
}

/**
 * Placeholders the LTB uses when a party is not individually named. These are
 * not people, and matching an applicant against them would be a pure false
 * positive — "CURRENT TENANT" alone appears on 176 orders.
 */
const PLACEHOLDER = new Set([
  'CURRENT TENANT', 'TENANT', 'TENANTS', 'CURRENT TENANTS', 'OCCUPANT', 'OCCUPANTS',
  'UNKNOWN', 'UNKNOWN TENANT', 'JOHN DOE', 'JANE DOE', 'ALL OCCUPANTS', 'THE TENANT',
])

export function isPlaceholderName(norm: string): boolean {
  if (PLACEHOLDER.has(norm)) return true
  // Rows where the name column is filler like ". ." or "… …".
  if (!/[A-Z]{2}/.test(norm)) return true
  return false
}

/**
 * A person needs at least two name tokens to be searchable. A single token
 * ("Chen") would match thousands of unrelated people, which is exactly the
 * namesake problem this whole module exists to avoid.
 */
export function isSearchableName(norm: string): boolean {
  const parts = norm.split(' ').filter((p) => p.length >= 2)
  return parts.length >= 2 && norm.length >= 5 && !isPlaceholderName(norm)
}

/**
 * Split an LTB party cell into individual people.
 *
 * The catalogue packs co-respondents into one cell — 13,384 of 40,844 orders
 * use " and ", 2,215 use commas, and one bulk building application carries 853
 * names. Splitting is what makes "was this person on an order" answerable at
 * all.
 */
export function splitPartyNames(cell: string | null | undefined): string[] {
  if (!cell) return []
  // Collapse runs of whitespace FIRST, and do not split on them: the
  // catalogue's real delimiters are " and ", commas, semicolons and "&".
  // Splitting on double spaces turned a data-entry "SARAH  WANG" into two
  // single tokens, both then dropped as unsearchable — the person silently
  // never entered the table (the hardest-to-see false negative).
  return cell
    .replace(/\s+/g, ' ')
    .replace(/\s+and\s+/gi, ',')
    .split(/[;,&]/)
    .map((p) => p.trim())
    .filter(Boolean)
}

export interface AddressParts {
  /** A1A1A1, no space — present on 98.6% of orders. */
  postal: string | null
  streetNo: string | null
  /** "<street-number> <first street word>", e.g. "111 BELMONT". */
  key: string | null
}

/**
 * Pull the comparable parts out of an address.
 *
 * Catalogue addresses look like "1002-111 BELMONT DR, LONDON, ON N6J4X9" —
 * unit-street, city, province, postal. Applicant-declared addresses (from the
 * OREA 410 the screening already parses) are free text and much messier, so we
 * only compare the parts that survive both: the postal code, and street number
 * plus the first word of the street name.
 */
export function addressParts(raw: string | null | undefined): AddressParts {
  const s = (raw || '').toUpperCase().replace(/\s+/g, ' ').trim()
  if (!s) return { postal: null, streetNo: null, key: null }

  const pc = s.match(/([A-Z]\d[A-Z])\s?(\d[A-Z]\d)/)
  const postal = pc ? `${pc[1]}${pc[2]}` : null

  // Take the street segment before the first comma, drop any unit prefix
  // ("1002-111 BELMONT DR" → "111 BELMONT DR"; "UNIT 5 - 20 KING" → "20 KING").
  const head = s.split(',')[0].replace(/^(APT|UNIT|SUITE|#)\s*[A-Z0-9]+\s*[-–]?\s*/i, '')
  const m = head.match(/(?:^|\s|-)(\d+[A-Z]?)\s+([A-Z][A-Z0-9]*)/)
  const streetNo = m ? m[1] : null
  const key = m ? `${m[1]} ${m[2]}` : null

  return { postal, streetNo, key }
}

/** Application codes ("L1;L2" / "L1, L2") → ['L1','L2']. */
export function splitApplicationCodes(raw: string | null | undefined): string[] {
  return (raw || '')
    .toUpperCase()
    .split(/[;,\s]+/)
    .map((c) => c.trim())
    .filter((c) => /^[A-Z]\d{1,2}$/.test(c))
}

/**
 * The CSV wraps the PDF link in an Excel formula:
 *   =HYPERLINK("https://…/Order.pdf","View file")
 * Left as-is it is both unusable as a URL and a formula-injection payload if it
 * ever reaches a spreadsheet export.
 */
export function unwrapHyperlink(raw: string | null | undefined): string | null {
  const s = (raw || '').trim()
  if (!s) return null
  const m = s.match(/^=HYPERLINK\(\s*"([^"]+)"/i)
  const url = m ? m[1] : s
  return /^https?:\/\//i.test(url) ? url : null
}

/** L = landlord brought it (tenant is respondent); T = the tenant brought it.
 *
 * Fails CLOSED: only an explicit L-type classifies the tenant as respondent —
 * the risk side that can eventually gate a screening. A blank or unrecognised
 * application type must never default a tenant onto the risk side (red line ①
 * inversion: a tenant-filed T2 with a blank type cell would have read as a
 * landlord application naming them). Unknown types read as tenant-applicant,
 * which is neutral context and never scored. */
export function partySide(applicationType: string, role: string): 'respondent' | 'applicant' | 'coop' {
  const t = (applicationType || '').toUpperCase().trim()
  const tenantSide = role === 'tenant' || role === 'former_tenant' || role === 'sub_tenant' || role === 'occupant'
  if (t.startsWith('C')) return 'coop'
  if (t.startsWith('L')) return tenantSide ? 'respondent' : 'applicant'
  // 'T', blank, and anything unrecognised: tenant side reads as applicant.
  return tenantSide ? 'applicant' : 'respondent'
}
