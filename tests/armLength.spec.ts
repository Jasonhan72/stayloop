import { describe, it, expect } from 'vitest'
import { pickBestCompanyMatch, canonicalizeEmployerName } from '../lib/forensics/arm-length'
import { nameMatches } from '../lib/forensics/bn-check'

const co = (name: string) => ({ name })

describe('pickBestCompanyMatch', () => {
  it('matches the same company regardless of legal suffix / case / punctuation', () => {
    expect(pickBestCompanyMatch('Northline Motors Inc.', [co('NORTHLINE MOTORS INC.')])?.name)
      .toBe('NORTHLINE MOTORS INC.')
    expect(pickBestCompanyMatch('NLMA Auto Inc.', [co('NLMA AUTO LTD')])?.name).toBe('NLMA AUTO LTD')
  })

  it('REJECTS a different company that only shares a generic word + suffix', () => {
    // The old scoring gave "ABC Auto Inc" vs "XYZ Auto Inc" 2/3 = 0.67 and
    // accepted it — a wrong-company match inside a fraud check.
    expect(pickBestCompanyMatch('ABC Auto Inc', [co('XYZ Auto Inc')])).toBeNull()
    expect(pickBestCompanyMatch('Northline Motors Inc', [co('Lakeside Motors Inc')])).toBeNull()
  })

  it('requires every target word to be present (no partial-name matches)', () => {
    expect(pickBestCompanyMatch('Northline Motors', [co('Northline Holdings')])).toBeNull()
  })

  it('rejects a candidate padded with unrelated words (precision floor)', () => {
    expect(pickBestCompanyMatch('Northline', [co('Northline Pacific Shipping Holdings International')]))
      .toBeNull()
    // ...but a modest extension is still the same business
    expect(pickBestCompanyMatch('Northline Motors', [co('Northline Motors Group')])?.name)
      .toBe('Northline Motors Group')
  })

  it('prefers the tightest name when several candidates contain the target', () => {
    const picked = pickBestCompanyMatch('Northline Motors', [
      co('Northline Motors Group Holdings'),
      co('Northline Motors Inc'),
      co('Northline Motors Leasing Group'),
    ])
    expect(picked?.name).toBe('Northline Motors Inc')
  })

  it('handles empty / junk input without throwing', () => {
    expect(pickBestCompanyMatch('', [co('Anything Inc')])).toBeNull()
    expect(pickBestCompanyMatch('Northline', [])).toBeNull()
    expect(pickBestCompanyMatch('Inc.', [co('Inc.')])).toBeNull()   // canonicalizes to empty
    expect(pickBestCompanyMatch('Northline', [{ name: undefined } as { name?: string }])).toBeNull()
  })
})

describe('canonicalizeEmployerName', () => {
  it('strips stacked legal suffixes and normalizes separators', () => {
    expect(canonicalizeEmployerName('Northline Motors Inc.')).toBe('northline motors')
    expect(canonicalizeEmployerName('NLMA AUTO INC.')).toBe('nlma auto')
    expect(canonicalizeEmployerName('Acme Holdings Co., Ltd.')).toBe('acme holdings')
  })
})

describe('BN name matching — must not clear a forged letter', () => {
  const m = (a: string, b: string) =>
    nameMatches(canonicalizeEmployerName(a), canonicalizeEmployerName(b))

  it('matches the same company across legal-suffix and word-order noise', () => {
    expect(m('Northline Motors Inc.', 'NORTHLINE MOTORS INC')).toBe(true)
    expect(m('NLMA Auto', 'NLMA Auto Sales Ltd.')).toBe(true)
    expect(m('Costco', 'Costco Wholesale Canada Ltd.')).toBe(true)
  })

  it('does NOT clear a BN registered to a different company', () => {
    // One shared industry word used to be enough, so a forged BN pointing at
    // any company with "Motors" in the name came back verified.
    expect(m('Northline Motors', 'Toronto Motors Leasing Inc.')).toBe(false)
    expect(m('Apex Consulting Group', 'Summit Consulting Partners')).toBe(false)
    expect(m('Costco', 'Cost Plus Holdings Inc.')).toBe(false)
  })
})

describe('employer canonicalization does not eat words', () => {
  it('only strips a legal suffix at a word boundary', () => {
    // Without the boundary, "Costco" collapsed to "cost" and "Visa Inc" to "vi",
    // which then matched unrelated companies.
    expect(canonicalizeEmployerName('Costco')).toBe('costco')
    expect(canonicalizeEmployerName('Cisco Systems')).toBe('cisco systems')
    expect(canonicalizeEmployerName('Visa Inc')).toBe('visa')
  })
})
import { checkArmLength } from '../lib/forensics/arm-length'

// The lookup deep-check actually has today: CBR/MRAS — company exists, but the
// registry publishes NO directors, and OpenCorporates has no token.
const cbrNorthline = async () => ({
  name: 'NORTHLINE MOTORS INC.',
  company_number: '1873411',
  jurisdiction: 'Ontario',
  incorporation_date: '2012-05-16',
  status: 'Active (incorporated)',
  registered_address: 'WOODBRIDGE, Ontario',
  company_type: 'ONTARIO BUSINESS CORP.',
  officers: [],
  registry_url: 'https://example.invalid',
  source: 'cbr_on',
})

describe("arm's-length: the case-21 letter, replayed", () => {
  // Employment letter signed "Sia Allas (Director/Owner)" for applicant
  // "Alaleh Allasvandi Toghian". Shipped verdict: clean. Three misses at once:
  // the client never sent the signatory, last-token surname equality failed on
  // a compound surname + truncated family variant, and the registry has no
  // directors to compare against — while rendering "clean" as if it had.
  it('flags the letter-asserted family ownership as high risk', async () => {
    const r = await checkArmLength(
      'Northline Motors Inc.',
      'Alaleh Allasvandi Toghian',
      undefined,
      'Sia Allas',
      { signatory_title: 'Director/Owner', companyLookup: cbrNorthline },
    )
    expect(r.arm_length_risk).toBe('high')
    expect(r.flags.some((f) => f.code === 'arm_length_signatory_owner_family')).toBe(true)
    expect(r.applicant_lastname_match).toBe(true)
  })

  it('surname relation handles compound surnames and truncated variants', async () => {
    // ALLAS (5 chars) is a prefix of ALLASVANDI, which is not the last token.
    const r = await checkArmLength(
      'Northline Motors Inc.', 'Alaleh Allasvandi Toghian', undefined, 'Siavash Allas',
      { companyLookup: cbrNorthline },
    )
    expect(r.applicant_lastname_match).toBe(true)
  })

  it('does not relate Park to Parker — the surname-substitution pair stays apart', async () => {
    // 4-char prefix is below the bar precisely because PARK/PARKER are
    // different surnames (documented in the LTB matching work).
    const r = await checkArmLength(
      'Acme Corp', 'David Park', undefined, 'Susan Parker',
      { companyLookup: cbrNorthline },
    )
    expect(r.applicant_lastname_match).toBe(false)
  })

  it('a registry without directors is disclosed, not silently clean', async () => {
    const r = await checkArmLength(
      'Northline Motors Inc.', 'Jane Doe', undefined, undefined,
      { companyLookup: cbrNorthline },
    )
    expect(r.flags.some((f) => f.code === 'arm_length_officers_unavailable')).toBe(true)
  })

  it('an unrelated signatory without an ownership title stays clean', async () => {
    const r = await checkArmLength(
      'Northline Motors Inc.', 'Alaleh Allasvandi Toghian', undefined, 'Marta Kowalski',
      { signatory_title: 'HR Manager', companyLookup: cbrNorthline },
    )
    expect(r.arm_length_risk).toBe('clean')
    expect(r.flags.some((f) => f.code === 'arm_length_signatory_owner_family')).toBe(false)
  })

  it('ownership title alone, without a family surname, does not fire the family flag', async () => {
    const r = await checkArmLength(
      'Northline Motors Inc.', 'Alaleh Allasvandi Toghian', undefined, 'John Ingrisilli',
      { signatory_title: 'Director/Owner', companyLookup: cbrNorthline },
    )
    expect(r.flags.some((f) => f.code === 'arm_length_signatory_owner_family')).toBe(false)
  })
})
