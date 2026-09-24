import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { checkDocumentDateConsistency, extractDocumentDate } from '@/lib/forensics/date-consistency'
import { employerExtraChecks, extractEmployerDomains, extractEmploymentStart, extractEmploymentStartDetailed, federalStatusText, registryStatusKind } from '@/lib/forensics/employer-checks'
import { extractStatedAnnualSalary, runCrossDocChecks } from '@/lib/forensics/cross-doc'
import { checkLetterQuality } from '@/lib/forensics/letter-quality'
import { collapseRuns } from '@/lib/forensics/pdf-text'
import { readEmploymentLetter } from '@/lib/forensics/landlord-reading'
import { analyzeStatementLiquidity, extractStatedBonus } from '@/lib/forensics/payroll-deposits'
import { checkBenford } from '@/lib/forensics/benford'
import { declaredLocalityTokens, orderCityTokens, searchLtbOrders } from '@/lib/ltb/search'
import { checkCreditPullIdentity } from '@/lib/verify/identityMatch'
import { findRecurringDeposits, isPayrollLike, summarizeBank } from '@/lib/verify/income'

// Review 2026-09-19 — forensics / deep-check / LTB / verification slice.
// Every case here failed before the fix it guards.
const src = (p: string) => readFileSync(p, 'utf8')

// ---------------------------------------------------------------- 1
describe('1 · deep-check requires a session even inside the free window', () => {
  afterEach(() => { vi.useRealTimers() })
  it('an unauthenticated POST during the internal test month is 401, not a free run', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-09-20T12:00:00Z'))
    const { POST } = await import('@/app/api/deep-check/route')
    const res = await POST(new Request('https://www.stayloop.ai/api/deep-check', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ employer_names: ['Acme Inc'], applicant_name: 'Sam Lee' }),
    }))
    expect(res.status).toBe(401)
  }, 120_000) // the route import is heavy; on a swapping 8 GB machine it took 33 s (2026-09-24)
  it('the gate authenticates before it consults the free window, and caps per user', () => {
    const s = src('app/api/deep-check/route.ts')
    const gate = s.slice(s.indexOf('async function enforceProGate'))
    const iUser = gate.indexOf('auth.getUser()')
    const iWindow = gate.indexOf('inInternalTestWindow()')
    const iLimit = gate.indexOf('underHourlyLimit(`deep-check:${userData.user.id}`, 20, true)')
    expect(iUser).toBeGreaterThan(0)
    expect(iLimit).toBeGreaterThan(iUser)
    expect(iWindow).toBeGreaterThan(iLimit)
    expect(gate.slice(iLimit, iWindow)).toMatch(/429/)
  })
})

// ---------------------------------------------------------------- 2
describe('2 · a future-event date inside a letter is not the letter\'s own date', () => {
  it('offer letter written June 10 with a September 1 start date', () => {
    const t = 'ACME Logistics Inc. 100 Main St, Mississauga, ON L5B 1A1 June 10, 2026 Dear Sam Lee, We are pleased to offer you the position of Analyst. Your start date will be September 1, 2026. Your annual base salary will be $92,000. Sincerely, HR'
    expect(extractDocumentDate('offer_letter', t)).toBe('2026-06-10')
    const flags = checkDocumentDateConsistency({ kind: 'offer_letter', file: 'offer.pdf', creation_date: '2026-06-10T14:00:00Z', modification_date: null, document_date: extractDocumentDate('offer_letter', t) })
    expect(flags.map(f => f.code)).not.toContain('pdf_created_before_document_date')
  })
  it('"effective September 1" salary change and a review date far down the letter', () => {
    const filler = 'This letter confirms the terms of employment that apply to the role described below. '.repeat(6)
    const t = `ACME Inc. ${filler} June 10, 2026 Your salary increased to $90,000 effective September 1, 2026. Your next performance review is scheduled for September 15, 2026. Please sign by September 5, 2026.`
    expect(extractDocumentDate('employment_letter', t)).toBe('2026-06-10')
  })
  it('the forged 6269 Ash St letter (file created in March, letter dated late August) is still caught', () => {
    const t = 'Globe Net International 104 Searle ave , Toronto ,Ontario ,M3H 4A7 24 Aug 2026 This letter is to verify that Nissim Maruaniy has been employed as a Web Developer at Globe Net International scince 23 June 2015.'
    const d = extractDocumentDate('employment_letter', t)
    expect(d).toBe('2026-08-24')
    const flags = checkDocumentDateConsistency({ kind: 'employment_letter', file: 'loe.pdf', creation_date: '2026-03-20T18:22:16Z', modification_date: null, document_date: d })
    expect(flags.some(f => f.code === 'pdf_created_before_document_date' && f.severity === 'high')).toBe(true)
  })
  it('a letter whose date sits at the bottom is still read', () => {
    const body = 'To whom it may concern, this confirms that Sam Lee works here full time in good standing. '.repeat(6)
    expect(extractDocumentDate('employment_letter', `ACME Inc. ${body} Dated this 3 August 2026`)).toBe('2026-08-03')
  })
})

// ---------------------------------------------------------------- 3
describe('3 · LTB address corroboration needs the whole city, as whole words', () => {
  const rpc = (rows: unknown[]) => async () => ({ data: rows, error: null })
  const order = (over: Record<string, unknown> = {}) => ({
    file_number: 'LTB-L-000001-26', document_id: 'DOC-1', order_date: '2026-03-12', application_codes: ['L1'], application_type: 'L',
    document_type: 'Order', party_side: 'respondent', role: 'tenant', person_name: 'Sarah Wang', unit_address: '25 KING STREET W, ST CATHARINES, ON',
    order_pdf_url: 'https://example.invalid/o.pdf', match_kind: 'exact', similarity: 1, address_match: true, ...over,
  })
  it('"ST" of ST CATHARINES inside "25 King St W, Toronto" does not corroborate', async () => {
    const r = await searchLtbOrders(rpc([order()]), 'Sarah Wang', ['25 King St W, Toronto, ON'])
    expect(r.as_respondent).toHaveLength(1)
    expect(r.corroborated).toHaveLength(0)
  })
  it('NORTH YORK vs "King St North, Waterloo"; YORK / EAST / PORT fragments', async () => {
    const ny = order({ unit_address: '25 KING ST, NORTH YORK, ON' })
    expect((await searchLtbOrders(rpc([ny]), 'Sarah Wang', ['25 King St North, Waterloo ON'])).corroborated).toHaveLength(0)
    const york = order({ unit_address: '25 KING ST, YORK, ON' })
    expect((await searchLtbOrders(rpc([york]), 'Sarah Wang', ['25 King St, New York Mills'])).corroborated).toHaveLength(0)
    const east = order({ unit_address: '25 KING ST, EAST GWILLIMBURY, ON' })
    expect((await searchLtbOrders(rpc([east]), 'Sarah Wang', ['25 King St East, Hamilton'])).corroborated).toHaveLength(0)
    const port = order({ unit_address: '25 KING ST, PORT HOPE, ON' })
    expect((await searchLtbOrders(rpc([port]), 'Sarah Wang', ['25 King St, Port Colborne ON'])).corroborated).toHaveLength(0)
  })
  it('the real city still corroborates — with or without commas, "St." or "Saint"', async () => {
    expect((await searchLtbOrders(rpc([order()]), 'Sarah Wang', ['25 King Street West, St. Catharines ON'])).corroborated).toHaveLength(1)
    expect((await searchLtbOrders(rpc([order()]), 'Sarah Wang', ['25 King St W Saint Catharines'])).corroborated).toHaveLength(1)
    const ny = order({ unit_address: '4-25 KING ST, NORTH YORK, ON M2N 1A1' })
    expect(orderCityTokens('UNIT 4, 25 KING ST, NORTH YORK, ON M2N 1A1')).toEqual(['NORTH', 'YORK'])
    expect((await searchLtbOrders(rpc([ny]), 'Sarah Wang', ['4-25 King St, North York, Ontario, Canada'])).corroborated).toHaveLength(1)
    expect(declaredLocalityTokens('25 King St W, Toronto, ON', '25 KING')).toEqual(['TORONTO', 'ON'])
  })
  it('subset record "MICHAEL PARK" is not "David Michael Park"; "DAVID PARK" still is', async () => {
    const michael = order({ person_name: 'MICHAEL PARK', match_kind: 'subset' })
    expect((await searchLtbOrders(rpc([michael]), 'David Michael Park')).as_respondent).toHaveLength(0)
    const david = order({ person_name: 'DAVID PARK', match_kind: 'subset' })
    expect((await searchLtbOrders(rpc([david]), 'David Michael Park')).as_respondent).toHaveLength(1)
    // Record with MORE tokens than the query is unaffected.
    const longer = order({ person_name: 'DAVID MICHAEL JAMES PARK', match_kind: 'subset' })
    expect((await searchLtbOrders(rpc([longer]), 'Michael Park')).as_respondent).toHaveLength(1)
  })
})

// ---------------------------------------------------------------- 4
describe('4 · federal registry status codes are text before they are classified', () => {
  it('maps Corporations Canada codes', () => {
    expect(federalStatusText('1', true)).toBe('Active')
    expect(registryStatusKind(federalStatusText('11', false))).toBe('inactive')
    expect(registryStatusKind(federalStatusText('10', false))).toBe('inactive')
    expect(registryStatusKind(federalStatusText('9', false))).toBe('inactive')
    expect(registryStatusKind(federalStatusText('1', true))).toBe('active')
    expect(registryStatusKind(federalStatusText('7', false))).toBe('inactive')   // unknown code: the row's is_active decides
    expect(registryStatusKind(federalStatusText(null, true))).toBe('active')
    expect(federalStatusText(null, null)).toBeNull()
    expect(federalStatusText('Active', true)).toBe('Active')
  })
  it('a dissolved federal employer is flagged, not shown clean with "11"', () => {
    const r = employerExtraChecks({ employer_name: 'Acme Federal Inc', company_status: federalStatusText('11', false), doc_text: '' })
    expect(r.registry_status_kind).toBe('inactive')
    expect(r.flags.map(f => f.code)).toContain('employer_registry_inactive')
    expect(src('app/api/deep-check/route.ts')).toMatch(/status: federalStatusText\(r\.status, r\.is_active\)/)
  })
})

// ---------------------------------------------------------------- 5
describe('5 · employment start: every occurrence is tried, marketing "since" is skipped', () => {
  it('"Proudly serving the GTA since 1985 … joined us on March 3, 2021"', () => {
    const t = 'Maple Plumbing Ltd. Proudly serving the GTA since 1985. This confirms that Sam Lee joined us on March 3, 2021 as a technician.'
    expect(extractEmploymentStart(t)).toBe('2021-03-03')
    const r = employerExtraChecks({ employer_name: 'Maple Plumbing Ltd', doc_text: t, incorporation_date: '1990-05-01' })
    expect(r.flags.map(f => f.code)).not.toContain('employer_employment_predates_incorporation')
  })
  it('an unparseable first window does not end the search', () => {
    expect(extractEmploymentStartDetailed('Sam started as a junior analyst in our Toronto office; he has been with us since March 2019.')).toEqual({ date: '2019-03-01', precision: 'month' })
    expect(extractEmploymentStart('We are delighted you will start with the team. Start Date: July 13, 2026. Salary: $80,000.')).toBe('2026-07-13')
  })
  it('the forged letter\'s misspelt "scince" still reads', () => {
    expect(extractEmploymentStart('has been employed as a Web Developer at Globe Net International scince 23 June 2015.')).toBe('2015-06-23')
  })
})

// ---------------------------------------------------------------- 6
describe('6 · stated salary: explicit annual beats an allowance quoted per month', () => {
  it('"annual base salary will be $92,000 … car allowance of $1,600 per month"', () => {
    expect(extractStatedAnnualSalary('Your annual base salary will be $92,000, plus a car allowance of $1,600 per month.')).toBe(92_000)
  })
  it('allowance / overtime figures are skipped, real monthly and hourly pay still annualise', () => {
    expect(extractStatedAnnualSalary('You will receive a car allowance of $1,600 per month. Your base pay is $6,000 per month.')).toBe(72_000)
    expect(extractStatedAnnualSalary('Overtime is paid at $45.00 per hour. Regular rate: $30.00 per hour.')).toBe(62_400)
    expect(extractStatedAnnualSalary('salary of $25,000 per month')).toBe(300_000)
    expect(extractStatedAnnualSalary('base salary of $85,000')).toBe(85_000)
  })
})

// ---------------------------------------------------------------- 7
describe('7 · amalgamated / continued corporations are not "dead"', () => {
  it('classifier', () => {
    expect(registryStatusKind('Inactive (Amalgamated)')).toBe('unknown')
    expect(registryStatusKind('Inactive - Discontinued (continued to Ontario)')).toBe('unknown')
    expect(registryStatusKind('Active (New Amalgamated)')).toBe('active')
    expect(registryStatusKind('Dissolved')).toBe('inactive')
    expect(registryStatusKind('Inactive')).toBe('inactive')
    const r = employerExtraChecks({ employer_name: 'Acme', company_status: 'Inactive (Amalgamated)', doc_text: '' })
    expect(r.flags.map(f => f.code)).not.toContain('employer_registry_inactive')
  })
  it('the base forensics pass uses the same classifier (no private dead-regex)', () => {
    const s = src('lib/forensics/index.ts')
    expect(s).toMatch(/registryStatusKind\(status\)/)
    expect(s).not.toMatch(/discontinu\|amalgamat/)
  })
})

// ---------------------------------------------------------------- 8
describe('8 · credit pull identity binding', () => {
  const typed = (first: string, last: string, dob = '1990-05-14') => ({ first_name: first, last_name: last, date_of_birth: dob })
  it('one shared token is not a match', () => {
    const v = checkCreditPullIdentity({ provider: 'equifax', typed: typed('Maria', 'Lopez'), verifiedId: { first_name: 'Maria', last_name: 'Garcia', date_of_birth: '1990-05-14' } })
    expect(v).toMatchObject({ ok: false, error: 'identity_mismatch' })
  })
  it('order / accents / extra verified names are fine; the DOB must equal Veriff\'s', () => {
    const id = { first_name: 'María José', last_name: 'García López', date_of_birth: '1990-05-14' }
    expect(checkCreditPullIdentity({ provider: 'equifax', typed: typed('Garcia', 'Maria'), verifiedId: id }).ok).toBe(true)
    expect(checkCreditPullIdentity({ provider: 'equifax', typed: typed('Maria', 'Garcia', '1991-05-14'), verifiedId: id })).toMatchObject({ ok: false, error: 'identity_mismatch' })
    expect(checkCreditPullIdentity({ provider: 'equifax', typed: typed('Maria', 'Garcia'), verifiedId: { ...id, date_of_birth: null } }).ok).toBe(true)
  })
  it('a real provider needs a verified identity; only mock may fall back to the consent signature', () => {
    expect(checkCreditPullIdentity({ provider: 'equifax', typed: typed('Sam', 'Lee'), verifiedId: null, consentName: 'Sam Lee', landlordNamedApplicant: 'Sam Lee' })).toMatchObject({ ok: false, error: 'identity_required' })
    expect(checkCreditPullIdentity({ provider: 'mock', typed: typed('Sam', 'Lee'), verifiedId: null, consentName: 'Sam Lee', landlordNamedApplicant: 'Sam Lee' }).ok).toBe(true)
    expect(checkCreditPullIdentity({ provider: 'mock', typed: typed('Sam', 'Park'), verifiedId: null, consentName: 'Sam Lee' }).ok).toBe(false)
    expect(src('app/api/verify/[token]/credit/route.ts')).toMatch(/checkCreditPullIdentity\(/)
  })
})

// ---------------------------------------------------------------- 9
describe('9 · letter quality: labelled fax, PBX direct-dials, bilingual labels', () => {
  const codes = (t: string, kind = 'employment_letter') => checkLetterQuality(t, 'l.pdf', kind).map(f => f.code)
  it('"T: … F: …" one digit apart is a fax line', () => {
    expect(codes('ACME Inc. T: 416-555-1000 F: 416-555-1001 To whom it may concern')).not.toContain('letter_phone_inconsistent')
    expect(codes('ACME Inc. Tél. 514-555-1000 Téléc. 514-555-1001')).not.toContain('letter_phone_inconsistent')
  })
  it('a main line and a direct-dial on one exchange say nothing', () => {
    expect(codes('ACME Inc. 416-555-1000. You may reach me at 416-555-1234.')).not.toContain('letter_phone_inconsistent')
  })
  it('the documented forged letter still flags, and a one-digit drift is medium', () => {
    expect(codes('Contact 416 4278441 or 416 427 4881 for details')).toContain('letter_phone_inconsistent')
    expect(checkLetterQuality('Call 416-427-8441 … or 416-427-8442', 'l.pdf', 'employment_letter').find(f => f.code === 'letter_phone_inconsistent')?.severity).toBe('medium')
  })
  it('bilingual stub labels are not misspellings; an English letter with "employe" still is', () => {
    expect(codes('NO EMPLOYE / EMPLOYEE NO 00123 DEPARTEMENT / DEPARTMENT Finance', 'pay_stub')).not.toContain('document_spelling_errors')
    expect(codes('EMPLOYEE NO / NO EMPLOYE 00123', 'pay_stub')).not.toContain('document_spelling_errors')
    expect(codes('Période de paie 2026-08-01 Taux 30,00 Heures 80 Departement Finance', 'pay_stub')).not.toContain('document_spelling_errors')
    expect(codes('This employe has worked in our Human resourses team')).toContain('document_spelling_errors')
  })
})

// ---------------------------------------------------------------- 10
describe('10 · payroll hints are whole words; own-money and personal e-transfers are not payroll', () => {
  const monthly = (description: string, amount: number, n = 3) => Array.from({ length: n }, (_, i) => ({ date: `2026-0${6 + i}-03`, description, credit: amount, debit: null }))
  it('WEI / TODD / SAVINGS do not feed payroll_monthly_estimate', () => {
    for (const d of ['E-TRANSFER FROM WEI', 'E-TRANSFER TODD', 'TRANSFER FROM SAVINGS', 'TFR FROM 1234567 CHEQUING']) {
      const r = summarizeBank([{ holder_name: 'Sam Lee', transactions: monthly(d, 1500) }], 'Test Bank')
      expect(r.payroll_monthly_estimate, d).toBeNull()
    }
  })
  it('real payroll / government labels still count', () => {
    for (const d of ['PAYROLL DEP ACME CORP', 'DIRECT DEPOSIT ACME', 'EI CANADA', 'GOVT CANADA CPP', 'CANADA OAS', 'ADP PAY ACME']) {
      const rec = findRecurringDeposits(monthly(d, 1500, 2))
      expect(rec.length, d).toBe(1)
      expect(isPayrollLike(rec[0]), d).toBe(true)
    }
    // unlabelled, salary-sized, 3+ times, not an e-transfer → still payroll-like
    const cheque = findRecurringDeposits(monthly('MOBILE CHEQUE DEPOSIT ACME ROOFING', 2400, 3))
    expect(isPayrollLike(cheque[0])).toBe(true)
  })
})

// ---------------------------------------------------------------- 11
describe('11 · ReDoS guard: collapseRuns', () => {
  it('cuts single-class runs to 200 and leaves ordinary text alone', () => {
    expect(collapseRuns('7'.repeat(50_000)).length).toBe(200)
    expect(collapseRuns(' '.repeat(50_000)).length).toBe(200)
    expect(collapseRuns('.'.repeat(50_000)).length).toBe(200)
    expect(collapseRuns('x'.repeat(50_000)).length).toBe(200)
    const normal = 'ACME Inc.\nTotal ........................ $1,234.56\nhr@acme.com  416-555-1000'
    expect(collapseRuns(normal)).toBe(normal)
    expect(collapseRuns('a\n\n\n\nb')).toBe('a\n\n\n\nb')
  })
  it('each reader finishes < 500 ms on adversarial text after collapseRuns', () => {
    const inputs = ['7'.repeat(50_000), 'a'.repeat(50_000), '.'.repeat(50_000), ' '.repeat(50_000), 'x'.repeat(50_000), 'abcdefghij'.repeat(5_000), 'a.b'.repeat(16_000)]
    for (const raw of inputs) {
      const t = collapseRuns(raw)
      const timed: Array<[string, () => unknown]> = [
        ['runCrossDocChecks', () => runCrossDocChecks({ files: [{ name: 'a.pdf', kind: 'bank_statement', text_sample: t }, { name: 'b.pdf', kind: 'employment_letter', text_sample: t }] })],
        ['extractEmployerDomains', () => extractEmployerDomains(t)],
        ['readEmploymentLetter', () => readEmploymentLetter(t)],
        ['extractStatedBonus', () => extractStatedBonus(t)],
        ['analyzeStatementLiquidity', () => analyzeStatementLiquidity([t])],
        ['checkBenford', () => checkBenford(t, 'a.pdf', 'bank_statement')],
      ]
      for (const [name, fn] of timed) {
        const t0 = Date.now(); fn()
        expect(Date.now() - t0, `${name} on ${raw.slice(0, 6)}…`).toBeLessThan(500)
      }
    }
  })
  it('both text sources pass through it', () => {
    expect(src('lib/forensics/pdf-text.ts')).toMatch(/collapseRuns\(stripNul\(/)
    expect((src('lib/forensics/index.ts').match(/collapseRuns\(/g) || []).length).toBeGreaterThanOrEqual(2)
  })
})

// ---------------------------------------------------------------- 12
describe('12 · ingest scripts fail loudly', () => {
  it('corp registry: a failed extract or 0 rows is a failure, not "Done"', () => {
    const s = src('scripts/ingest-ca-corp-registry.mjs')
    expect(s).not.toMatch(/— skipping`/)
    expect(s).toMatch(/failedExtracts\.length > 0\) \{\s*throw new Error/)
    expect(s).toMatch(/totalRows === 0\) \{\s*throw new Error/)
    expect(s.indexOf('totalRows === 0')).toBeLessThan(s.indexOf('[ingest] Done.'))
  })
  it('LTB: res.ok, size comparison and a mandatory run id', () => {
    const s = src('scripts/ltb_ingest.mjs')
    expect(s).toMatch(/if \(!dl\.ok\) throw/)
    expect(s).toMatch(/bytes\.byteLength < want \* 0\.95/)
    expect(s).toMatch(/Number\(res\.size\)/)
    expect(s).toMatch(/if \(runId == null\) throw/)
    expect(s).not.toMatch(/await \(await fetch\(res\.url\)\)\.text\(\)/)
  })
})
