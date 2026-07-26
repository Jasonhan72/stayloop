import { describe, it, expect } from 'vitest'
import { pickBestCompanyMatch, canonicalizeEmployerName } from '../lib/forensics/arm-length'

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
