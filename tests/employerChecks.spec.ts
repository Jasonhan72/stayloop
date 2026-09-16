import { describe, expect, it } from 'vitest'
import { classifyGazetteSection, dissolutionReason, employerExtraChecks, extractEmployerDomains, extractEmploymentStart, extractStatedCity, gazetteLookup, padOntarioNumber, parseGazettePage, phoneRegion, registryStatusKind } from '@/lib/forensics/employer-checks'
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

// 2026-09-16 — why is the employer "Inactive"? The registry does not say;
// the Ontario Gazette does. Fixture = the shape r.jina.ai returns for
// ontario.ca/document/ontario-gazette-volume-148-issue-08-february-21-2015/government-notices-respecting-corporations
describe('Ontario Gazette dissolution reason', () => {
  const ISSUE_NOV = 'https://www.ontario.ca/document/ontario-gazette-volume-147-issue-45-november-8-2014/government-notices-respecting-corporations-0'
  const ISSUE_FEB = 'https://www.ontario.ca/document/ontario-gazette-volume-148-issue-08-february-21-2015/government-notices-respecting-corporations'
  const NOV = [
    'Government Notices Respecting Corporations', '',
    'Notice of Default in Complying with the Corporations Tax Act', '',
    'The Director has been notified by the Minister of Finance that the following corporations are in default in complying with the Corporations Tax Act.', '',
    'FORECAST BUSINESS SERVICES INC.', '', '\t', '', '002130434', '', '', '', '2014-10-18', '', '\t', '',
    'GLOBE NET INTERNATIONAL INC.', '', '\t', '', '002072032', '', '', '', '2014-10-18', '', '\t', '',
    'INDOOR COMFORT CONTRACTORS LIMITED', '', '\t', '', '000710329', '', '', '', '2014-10-18',
  ].join('\n')
  const FEB = [
    'Government Notices Respecting Corporations', '',
    'Notice of Default in Complying with the Corporations Tax Act', '',
    'SOME OTHER CORP.', '', '002999999', '', '﻿2015-01-26', '',
    'Cancellation of Certificate of Incorporation (Corporations Tax Act Defaulters)', '',
    'NOTICE IS HEREBY GIVEN that by orders under subsection 241(4) of the Business Corporations Act, the certificates of incorporation of the corporations named hereunder have been cancelled...', '',
    'GLOBE NET INTERNATIONAL INC.', '', '\t', '', '002072032', '', '', '', '﻿2015-01-26', '', '\t', '',
    'GLOBE NET INTERNATIONAL INC.', '', '\t', '', '009999999', '', '', '', '﻿2015-01-26', // same name, other number: ignored
  ].join('\n')

  it('classifies the Gazette section headings', () => {
    expect(classifyGazetteSection('Notice of Default in Complying with the Corporations Tax Act')).toBe('tax_default_notice')
    expect(classifyGazetteSection('Cancellation of Certificate of Incorporation (Corporations Tax Act Defaulters)')).toBe('tax_default_cancellation')
    expect(classifyGazetteSection('Cancellation of Certificate of Incorporation (Corporations Information Act Defaulters)')).toBe('cia_cancellation')
    expect(classifyGazetteSection('Certificate of Dissolution')).toBe('voluntary_dissolution')
    expect(classifyGazetteSection('Order for Revival')).toBe('revival')
  })
  it('finds the company under its section, by name + zero-padded number, with the date cell', () => {
    const nov = parseGazettePage(NOV, ISSUE_NOV, 'GLOBE NET INTERNATIONAL INC.', '2072032')
    expect(nov).toHaveLength(1)
    expect(nov[0]).toMatchObject({ kind: 'tax_default_notice', date: '2014-10-18' })
    const feb = parseGazettePage(FEB, ISSUE_FEB, 'Globe Net International Inc', '002072032')
    expect(feb).toHaveLength(1)
    expect(feb[0]).toMatchObject({ kind: 'tax_default_cancellation', date: '2015-01-26' })
    expect(feb[0].issue).toMatch(/Volume 148 Issue 08/)
    expect(padOntarioNumber('2072032')).toBe('002072032')
  })
  it('gazetteLookup reads only ontario.ca Gazette hits and merges the notices in date order', async () => {
    const webSearch = async () => [
      { title: 'Ontario Gazette Volume 148 Issue 08', snippet: 'Globe Net International Inc. 002072032. 2015-01-26', link: ISSUE_FEB.replace('https:', 'http:') },
      { title: 'Government Notices Respecting Corporations', snippet: 'Globe Net International Inc. 002072032. 2014-10-18', link: ISSUE_NOV },
      { title: 'About Us - Globe Net International', snippet: 'in business for 26 years', link: 'http://globenetint.com/AboutUs.html' },
    ]
    const reads: string[] = []
    const webRead = async (u: string) => { reads.push(u); return u === ISSUE_FEB ? FEB : u === ISSUE_NOV ? NOV : '' }
    const notices = await gazetteLookup('GLOBE NET INTERNATIONAL INC.', '2072032', webSearch, webRead)
    expect(reads.every(u => u.startsWith('https://www.ontario.ca/'))).toBe(true)
    expect(notices.map(n => `${n.kind}@${n.date}`)).toEqual(['tax_default_notice@2014-10-18', 'tax_default_cancellation@2015-01-26'])
  })
  it('a tax-default cancellation is critical; employment claimed after the cancellation is spelled out; a revival cancels the flag', () => {
    const gazette = [
      { kind: 'tax_default_notice' as const, date: '2014-10-18', heading: 'Notice of Default in Complying with the Corporations Tax Act', issue: 'Volume 147 Issue 45', url: ISSUE_NOV },
      { kind: 'tax_default_cancellation' as const, date: '2015-01-26', heading: 'Cancellation of Certificate of Incorporation (Corporations Tax Act Defaulters)', issue: 'Volume 148 Issue 08', url: ISSUE_FEB },
    ]
    const r = employerExtraChecks({ employer_name: 'Globe Net International', company_status: 'Inactive', incorporation_date: '2005-05-11', doc_text: LETTER, gazette })
    const f = r.flags.find(x => x.code === 'employer_dissolved_tax_default')!
    expect(f.severity).toBe('critical')
    expect(f.evidence_en).toMatch(/employment from 2015-06-23, 5 months after/)
    expect(f.evidence_en).toMatch(/notice of default dated 2014-10-18/)
    expect(f.evidence_en).toMatch(/not a conviction/)
    expect(r.dissolution_reason).toMatch(/^2015-01-26 certificate cancelled — Corporations Tax Act defaulter/)
    expect(dissolutionReason(gazette, true)).toMatch(/2015-01-26 因《公司税法》违约被注销/)
    const revived = employerExtraChecks({ employer_name: 'Globe Net International', company_status: 'Active', gazette: [...gazette, { kind: 'revival', date: '2016-03-01', heading: 'Order for Revival', issue: 'Volume 149 Issue 10', url: ISSUE_FEB }] })
    expect(revived.flags.map(x => x.code)).not.toContain('employer_dissolved_tax_default')
    const noticeOnly = employerExtraChecks({ employer_name: 'Acme', company_status: 'Inactive', gazette: [gazette[0]] })
    expect(noticeOnly.flags.find(x => x.code === 'employer_tax_default_notice')?.severity).toBe('high')
  })
})
