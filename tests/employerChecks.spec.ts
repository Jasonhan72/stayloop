import { describe, expect, it } from 'vitest'
import { employerExtraChecks, extractEmployerDomains, extractEmploymentStart, extractStatedCity, phoneRegion, registryStatusKind } from '@/lib/forensics/employer-checks'
import { partyNamesCompany } from '@/lib/screening/portalClient'

// 2026-09-16 — deep-check additions after the 6269 Ash St file: an
// "Inactive" registry row sat beside a green badge, and nothing looked at
// the employer's domain, contact path or litigation.
const LETTER = 'Globe Net International 104 Searle ave , Toronto ,Ontario ,M3H 4A7 24 Aug 2026 This letter is to verify that Nissim Maruaniy has been employed as a Web Developer at Globe Net International scince 23 June 2015. Email: hr@globenetint.com'

describe('registry status', () => {
  it('classifies the spellings registries actually print', () => {
    expect(registryStatusKind('Inactive')).toBe('inactive')
    expect(registryStatusKind('Dissolved')).toBe('inactive')
    expect(registryStatusKind('Active')).toBe('active')
    expect(registryStatusKind('In Existence')).toBe('active')
    expect(registryStatusKind(null)).toBe('unknown')
  })
  it('repairs a retyped year glyph ("20 I 5") and flags the artifact', () => {
    const t = 'has been employed as a Web Developer at Globe Net International scince 23 June 20 I 5. The position'
    expect(extractEmploymentStart(t)).toBe('2015-06-23')
    const r = employerExtraChecks({ employer_name: 'Globe Net International', doc_text: t, rdap: [{ domain: 'globenetint.com', registered: true, registration_date: '2020-11-09', expiration_date: null }] })
    expect(r.flags.map(f => f.code)).toContain('employer_letter_digit_glyph_artifact')
    expect(r.flags.map(f => f.code)).toContain('employer_domain_younger_than_employment')
  })
  it('an inactive employer is a critical flag and the employment start is read from the letter', () => {
    const r = employerExtraChecks({ employer_name: 'Globe Net International', company_status: 'Inactive', incorporation_date: '2005-05-11', company_registered_address: 'RICHMOND HILL, Ontario', doc_text: LETTER })
    expect(r.registry_status_kind).toBe('inactive')
    expect(r.employment_start).toBe('2015-06-23')
    expect(r.stated_city).toBe('Toronto')
    const codes = r.flags.map(f => f.code)
    expect(codes).toContain('employer_registry_inactive')
    expect(r.flags.find(f => f.code === 'employer_registry_inactive')?.severity).toBe('critical')
    expect(codes).toContain('employer_address_differs_from_registry')
  })
})

describe('domain, contact path, phone region', () => {
  it('extracts the employer domain and skips personal providers', () => {
    expect(extractEmployerDomains(LETTER).domains).toEqual(['globenetint.com'])
    expect(extractEmployerDomains('contact: hr.acme@gmail.com').personal_emails).toEqual(['hr.acme@gmail.com'])
  })
  it('a domain registered years after the claimed start is a question; an unregistered one is a high flag', () => {
    const young = employerExtraChecks({ employer_name: 'Globe Net International', doc_text: LETTER, rdap: [{ domain: 'globenetint.com', registered: true, registration_date: '2020-11-09', expiration_date: '2026-11-09' }] })
    expect(young.flags.map(f => f.code)).toContain('employer_domain_younger_than_employment')
    const dead = employerExtraChecks({ employer_name: 'X', doc_text: 'Email: hr@nosuchdomain-zzqq.com since 2019', rdap: [{ domain: 'nosuchdomain-zzqq.com', registered: false, registration_date: null, expiration_date: null }] })
    expect(dead.flags.find(f => f.code === 'employer_domain_unregistered')?.severity).toBe('high')
    const old = employerExtraChecks({ employer_name: 'X', doc_text: LETTER, rdap: [{ domain: 'globenetint.com', registered: true, registration_date: '2012-01-01', expiration_date: null }] })
    expect(old.flags.map(f => f.code)).not.toContain('employer_domain_younger_than_employment')
  })
  it('a personal mailbox as the only contact is flagged', () => {
    const r = employerExtraChecks({ employer_name: 'Acme', doc_text: 'Please contact John at acmehr@gmail.com' })
    expect(r.flags.map(f => f.code)).toContain('employer_contact_personal_email')
  })
  it('phone region vs stated city', () => {
    expect(phoneRegion('289-475-5273')).toMatch(/Hamilton/)
    expect(phoneRegion('416 555 0100')).toBe('Toronto')
    const r = employerExtraChecks({ employer_name: 'Acme', doc_text: LETTER, business_phone: '2894755273' })
    expect(r.flags.map(f => f.code)).toContain('employer_phone_region_differs')
    expect(extractStatedCity('123 Main St, Mississauga ON')).toBe('Mississauga')
  })
})

describe('employer litigation', () => {
  it('matches the portal party to the company by canonical tokens', () => {
    expect(partyNamesCompany('GLOBE NET INTERNATIONAL INC.', 'Globe Net International')).toBe(true)
    expect(partyNamesCompany('GLOBE NETWORK MEDIA GROUP', 'Globe Net International')).toBe(false)
  })
  it('cases as defendant / still open raise the flag to medium; none is a clean line', () => {
    const r = employerExtraChecks({ employer_name: 'Acme', litigation: { total: 2, cases: [{ title: 'SMITH v. ACME INC.', role: 'Defendant', filed: '2025-03-01', closed: false }, { title: 'ACME INC. v. JONES', role: 'Plaintiff', filed: '2024-01-01', closed: true }] } })
    const f = r.flags.find(x => x.code === 'employer_court_cases')!
    expect(f.severity).toBe('medium')
    expect(f.evidence_en).toMatch(/1 as defendant/)
    const clean = employerExtraChecks({ employer_name: 'Acme', litigation: { total: 0, cases: [] } })
    expect(clean.flags.map(x => x.code)).not.toContain('employer_court_cases')
    expect(clean.litigation?.total).toBe(0)
  })
})
