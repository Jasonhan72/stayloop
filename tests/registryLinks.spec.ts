import { describe, it, expect } from 'vitest'
import { registryLinks, inferProvince } from '../lib/forensics/registry-links'

describe('registryLinks', () => {
  it('defaults to Ontario and pre-fills the OpenCorporates search', () => {
    const l = registryLinks('Northline Motors Inc.')
    expect(l.openCorporatesUrl).toBe('https://opencorporates.com/companies/ca_on?q=Northline%20Motors%20Inc.')
    expect(l.officialLabelEn).toContain('Ontario')
    expect(l.officialUrl).toMatch(/^https:\/\/www\.ontario\.ca\//)
  })

  it('scopes the OpenCorporates jurisdiction to the given province', () => {
    expect(registryLinks('Acme Ltd', 'BC').openCorporatesUrl).toContain('/companies/ca_bc?q=')
    expect(registryLinks('Acme Ltd', 'QC').officialLabelEn).toContain('REQ')
  })

  it('url-encodes names and tolerates empty input', () => {
    expect(registryLinks('A & B / Co').openCorporatesUrl).toContain('q=A%20%26%20B%20%2F%20Co')
    expect(registryLinks('   ').openCorporatesUrl).toBe('https://opencorporates.com/companies/ca_on?q=')
  })

  it('falls back to Ontario for an unknown province code', () => {
    // @ts-expect-error intentional bad input
    expect(registryLinks('X', 'ZZ').openCorporatesUrl).toContain('/companies/ca_on?q=X')
  })
})

describe('inferProvince', () => {
  it('reads an explicit province token out of a free-text address', () => {
    expect(inferProvince('4342 Steeles Ave W, Woodbridge, ON L4L 7H3')).toBe('ON')
    expect(inferProvince('1055 W Georgia St, Vancouver, BC')).toBe('BC')
    expect(inferProvince('Montreal, Quebec')).toBe('QC')
  })
  it('returns null when no province is present', () => {
    expect(inferProvince('')).toBeNull()
    expect(inferProvince(null)).toBeNull()
    expect(inferProvince('123 Main Street')).toBeNull()
  })
})
