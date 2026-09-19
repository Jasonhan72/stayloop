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

// Review 2026-09-16 (slice B): false positives on legitimate employers.
import { dateBefore, extractEmploymentStartDetailed, phoneOutsideCity, rdapLookup, registrableDomain } from '@/lib/forensics/employer-checks'
describe('review 2026-09-16 — employer checks', () => {
  it('an amalgamated / continued corporation that is Active is not dead', () => {
    expect(registryStatusKind('Active (New Amalgamated)')).toBe('active')
    expect(registryStatusKind('Active - Amalgamated')).toBe('active')
    expect(registryStatusKind('Discontinued')).toBe('unknown')
    // review 2026-09-19: an amalgamated corporation continues under its successor — not "cannot be issuing pay"
    expect(registryStatusKind('Inactive - Amalgamated')).toBe('unknown')
    expect(registryStatusKind('Not in good standing')).toBe('inactive')
  })
  it('"since 2015" is a year, not January 1: it cannot predate a 2015-03-10 incorporation', () => {
    const d = extractEmploymentStartDetailed('has been employed since 2015 as a clerk.')!
    expect(d).toEqual({ date: '2015-01-01', precision: 'year' })
    expect(dateBefore(d.date, d.precision, '2015-03-10')).toBe(false)
    const m = extractEmploymentStartDetailed('employed since June 2015.')!
    expect(m.precision).toBe('month'); expect(dateBefore(m.date, m.precision, '2015-06-15')).toBe(false)
    expect(extractEmploymentStartDetailed('Start date: 23/06/2015')).toEqual({ date: '2015-06-23', precision: 'day' })
    expect(extractEmploymentStartDetailed('Start date: 06/23/2015')).toEqual({ date: '2015-06-23', precision: 'day' })
    expect(extractEmploymentStartDetailed('Start date: 06/03/2015')!.precision).toBe('year')
    const r = employerExtraChecks({ employer_name: 'Acme', doc_text: 'employed since 2015', incorporation_date: '2015-03-10' })
    expect(r.flags.map(f => f.code)).not.toContain('employer_employment_predates_incorporation')
  })
  it('"effective" (a salary change) does not beat "since" (the start)', () => {
    expect(extractEmploymentStart('His salary, effective January 1, 2026, is $80,000. He has been employed since March 2, 2015.')).toBe('2015-03-02')
  })
  it('a personal mailbox beside a company domain is not "the only contact"; letterhead city is read in context', () => {
    const r = employerExtraChecks({ employer_name: 'Acme', doc_text: 'Contact hr@acme.com or john.hr@gmail.com', rdap: [] })
    expect(r.flags.map(f => f.code)).not.toContain('employer_contact_personal_email')
    expect(extractStatedCity('Acme Ltd, 100 Main St, Mississauga, ON L5B 1A1. Employee: Sam Lee, 5 King St, Toronto ON M5H 1A1')).toBe('Mississauga')
    expect(extractStatedCity('123 Hamilton Rd, London, ON N6A 1A1')).toBe('London')
    expect(extractStatedCity('Signed, Regina Smith, HR')).toBeNull()
  })
  it('phone region: 905 in Mississauga and 416 in North York are local', () => {
    expect(phoneOutsideCity('905-555-0100', 'Mississauga')).toBe(false)
    expect(phoneOutsideCity('416-555-0100', 'North York')).toBe(false)
    expect(phoneOutsideCity('613-555-0100', 'Toronto')).toBe(true)
    expect(phoneOutsideCity('1-800-555-0100', 'Toronto')).toBe(false)
    const r = employerExtraChecks({ employer_name: 'Acme', doc_text: 'Acme Inc, 1 Bay St, Mississauga, ON L5B 1A1. To whom it may concern: employed since 2015', business_phone: '905-555-0100' })
    expect(r.flags.map(f => f.code)).not.toContain('employer_phone_region_differs')
  })
  it('RDAP: subdomains reduce to the registrable name; 403 / bare 404 are unknown, an RDAP error document is unregistered', async () => {
    expect(registrableDomain('wd5.myworkday.com')).toBe('myworkday.com')
    expect(registrableDomain('cra-arc.gc.ca')).toBe('cra-arc.gc.ca')
    const mk = (status: number, body?: unknown) => (async () => ({ status, ok: status >= 200 && status < 300, json: async () => { if (body === undefined) throw new Error('no json'); return body } })) as unknown as typeof fetch
    expect(await rdapLookup('acme.com', mk(403))).toBeNull()
    expect(await rdapLookup('yahoo.co.jp', mk(404))).toBeNull()
    expect((await rdapLookup('nosuchdomain-xyz.com', mk(404, { errorCode: 404, title: 'Not Found' })))?.registered).toBe(false)
    expect((await rdapLookup('mail.acme.com', mk(200, { events: [{ eventAction: 'registration', eventDate: '2010-01-02T00:00:00Z' }] })))).toMatchObject({ domain: 'acme.com', registered: true, registration_date: '2010-01-02' })
  })
  it('portal party must be the same legal name, not a superset', () => {
    expect(partyNamesCompany('ABC CONSTRUCTION MANAGEMENT INC.', 'ABC Construction')).toBe(false)
    expect(partyNamesCompany('RBC DOMINION SECURITIES INC.', 'RBC')).toBe(false)
    expect(partyNamesCompany('GLOBE NET INTERNATIONAL INC.', 'Globe Net International')).toBe(true)
    expect(partyNamesCompany('ACME GROUP INC.', 'Acme Inc')).toBe(true)
  })
  it('a revival only cancels a dissolution it postdates; the glyph artifact needs a date context', () => {
    const cancel = { kind: 'tax_default_cancellation' as const, date: '2020-01-26', heading: 'Cancellation of Certificate of Incorporation (Corporations Tax Act Defaulters)', issue: 'Volume 153 Issue 05', url: 'https://www.ontario.ca/document/x' }
    const oldRevival = { kind: 'revival' as const, date: '2016-03-01', heading: 'Order for Revival', issue: 'Volume 149 Issue 10', url: 'https://www.ontario.ca/document/y' }
    expect(employerExtraChecks({ employer_name: 'Acme', company_status: 'Inactive', gazette: [oldRevival, cancel] }).flags.map(f => f.code)).toContain('employer_dissolved_tax_default')
    expect(employerExtraChecks({ employer_name: 'Acme', company_status: 'Active', gazette: [cancel, { ...oldRevival, date: '2021-01-01' }] }).flags.map(f => f.code)).not.toContain('employer_dissolved_tax_default')
    expect(employerExtraChecks({ employer_name: 'Acme', doc_text: 'Unit 205 l 10 King St, Rate 20 l 5 per hour' }).flags.map(f => f.code)).not.toContain('employer_letter_digit_glyph_artifact')
    expect(employerExtraChecks({ employer_name: 'Acme', doc_text: 'employed since 23 June 20 I 5.' }).flags.map(f => f.code)).toContain('employer_letter_digit_glyph_artifact')
  })
  it('gazette hits are read only from ontario.ca', async () => {
    const reads: string[] = []
    const notices = await gazetteLookup('ACME INC.', '1234567', async () => [{ title: 'x', snippet: 'Acme Inc. 001234567', link: 'http://evil.example/p?ref=ontario.ca/document/ontario-gazette-volume-1' }], async (u) => { reads.push(u); return '' })
    expect(reads).toEqual([]); expect(notices).toEqual([])
  })
})
