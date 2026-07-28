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
