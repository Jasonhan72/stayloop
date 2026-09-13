// 2026-09-12 (Cipriani / Quiroga file): every income document was ~2 years
// old, one photo card had expired, the letter printed its phone two ways and
// misspelled "resourses", the stubs said "Comunications", the net pay reached
// the bank as e-Transfers and a cheque, the applicant's bureau file carried a
// collection agency under non-credit inquiries, and a co-applicant's 793 was
// credited to the applicant. None of it was flagged.
import { describe, expect, it } from 'vitest'
import { extractDates, documentAsOf, checkRecency } from '../lib/forensics/recency'
import { checkLetterQuality } from '../lib/forensics/letter-quality'
import { isCollectionAgency } from '../lib/screening/collectionAgencies'
import { reconcilePayrollDeposits } from '../lib/forensics/payroll-deposits'
import { scoreRubric } from '../lib/screening/rubric'
import type { ForensicFlag, PerFileForensics } from '../lib/forensics/types'

const pf = (file_name: string, file_kind: string, text: string, extra: Partial<PerFileForensics> = {}): PerFileForensics =>
  ({ file_name, file_kind, mime: 'application/pdf', flags: [], elapsed_ms: 0, text_density: { total_chars: text.length, page_count: 1, chars_per_page: text.length, is_likely_image_pdf: false, text_sample: text }, ...extra } as PerFileForensics)

describe('document dates', () => {
  it('reads the formats Canadian documents print', () => {
    expect(extractDates('DATE: Oct 20th 2024')).toContain('2024-10-20')
    expect(extractDates('Statement From To AUG 30/24 - SEP 27/24')).toEqual(['2024-08-30', '2024-09-27'])
    expect(extractDates('Updated on 10/25/2024')).toContain('2024-10-25')
    expect(extractDates('Wednesday 23 October 2024 22:50')).toContain('2024-10-23')
    expect(extractDates('Date issued Apr 9, 2024')).toContain('2024-04-09')
  })
  it('picks the right as-of per kind', () => {
    expect(documentAsOf(pf('s.pdf', 'bank_statement', 'TD Canada Trust Statement From To AUG 30/24 - SEP 27/24 CHEQUE 3,547.21 SEP03')).as_of).toBe('2024-09-27')
    expect(documentAsOf(pf('l.pdf', 'employment_letter', 'DATE: Oct 20th 2024 Green Life Group Inc. To Whom It May Concern')).as_of).toBe('2024-10-20')
    expect(documentAsOf(pf('cr.pdf', 'credit_report', 'the contents of your file as of Oct 23, 2024 . Blank areas')).as_of).toBe('2024-10-23')
    expect(documentAsOf(pf('id.pdf', 'id_document', '', { ocr: { text: 'Ontario Photo Card 4b EXP/EXP. 2026/06/11 DOB 1980/06/11', apparent_doc_type: 'photo card', apparent_name: null, visible_issuer: null, has_watermark: false, visible_dates: [], elapsed_ms: 1 } })).expiry).toBe('2026-06-11')
    expect(documentAsOf(pf('noa.pdf', 'other', 'Notice details Tax year 2023 Date issued Apr 9, 2024')).as_of).toBe('2024-04-09')
  })
  it('flags a two-year-old income package and an expired ID', () => {
    const files = [
      pf('stub.pdf', 'pay_stub', 'Pay Period: 2024-10-01 - 2024-10-31 Cheque Date: 2024-10-31', { paystub_math: { extraction: { pay_date: '2024-10-31' } as never, expected_ytd_gross: null, ytd_ratio: null, derived_period_gross: null, period_math_error_pct: null } }),
      pf('s.pdf', 'bank_statement', 'Statement From To SEP 30/24 - OCT 30/24'),
      pf('l.pdf', 'employment_letter', 'DATE: Oct 20th 2024'),
      pf('id.pdf', 'id_document', '', { ocr: { text: 'EXP/EXP. 2026/06/11', apparent_doc_type: 'photo card', apparent_name: null, visible_issuer: null, has_watermark: false, visible_dates: [], elapsed_ms: 1 } }),
      pf('id2.pdf', 'id_document', '', { ocr: { text: '4b EXP/EXP 2026/09/16', apparent_doc_type: 'licence', apparent_name: null, visible_issuer: null, has_watermark: false, visible_dates: [], elapsed_ms: 1 } }),
    ]
    const { result, crossFlags } = checkRecency(files, new Date('2026-09-12T12:00:00Z'))
    expect(result.income_docs_median_age_days).toBeGreaterThan(600)
    expect(files[0].flags.some(f => f.code === 'document_stale' && f.severity === 'high')).toBe(true)
    expect(files[3].flags.some(f => f.code === 'id_expired')).toBe(true)
    expect(files[4].flags.some(f => f.code === 'id_expiring_soon')).toBe(true)
    expect(crossFlags.some(f => f.code === 'income_package_stale' && f.severity === 'high')).toBe(true)
    expect(crossFlags.some(f => f.code === 'all_ids_expired')).toBe(false)
  })
  it('stays quiet for fresh documents', () => {
    const files = [pf('stub.pdf', 'pay_stub', 'Pay Period: 2026-08-16 - 2026-08-31', { paystub_math: { extraction: { pay_date: '2026-08-31' } as never, expected_ytd_gross: null, ytd_ratio: null, derived_period_gross: null, period_math_error_pct: null } })]
    const { crossFlags } = checkRecency(files, new Date('2026-09-12T12:00:00Z'))
    expect(files[0].flags).toHaveLength(0)
    expect(crossFlags).toHaveLength(0)
  })
})

describe('letter quality', () => {
  it('catches the phone printed two ways and the misspellings', () => {
    const f = checkLetterQuality('Green Life Group Inc. 66 North Queen st Toronto, ON, M8Z 2C4 416 4278441 Info@greenlifegroupinc.com ... contact us at 416 427 4881 ... Patricio Roman Hiring coordinator - Human resourses', 'letter.pdf', 'employment_letter')
    expect(f.some(x => x.code === 'letter_phone_inconsistent')).toBe(true)
    expect(f.find(x => x.code === 'document_spelling_errors')?.evidence_en).toMatch(/resourses/)
    expect(checkLetterQuality('Occupation Comunications Manager', 'stub.pdf', 'pay_stub').some(x => x.code === 'document_spelling_errors')).toBe(true)
    expect(checkLetterQuality('Contact 416-885-0833 or 416-885-0833. Human Resources.', 'ok.pdf', 'employment_letter')).toHaveLength(0)
  })
})

describe('collection agencies and pay method', () => {
  it('recognises agencies on a bureau file', () => {
    expect(isCollectionAgency('MJR CAPITAL SERVICES INC.')).toBe(true)
    expect(isCollectionAgency('CBV COLLECTION SERVICES')).toBe(true)
    expect(isCollectionAgency('CAPITAL ONE BANK (CANADA)')).toBe(false)
  })
  it('flags net pay arriving by e-Transfer and cheque on a cheque-style stub', () => {
    const flags: ForensicFlag[] = []
    reconcilePayrollDeposits([
      { file_name: 'stub.pdf', file_kind: 'pay_stub', text_density: { text_sample: 'Cheque Date: 2024-08-31 Net Pay 3,547.21' }, paystub_math: { extraction: { employer_name: 'GREEN LIFE GROUP INC.', period_net: 3547.21, annual_salary: 54000 } } },
      { file_name: 'aug.pdf', file_kind: 'bank_statement', text_density: { text_sample: 'Description | Withdrawals | Deposits | Date | Balance\nSTARTING BALANCE | | | JUL30 | 20,320.53\nSEND E-TFR ***hjp | | 3,547.21 | AUG01 | 23,867.76\nCOSTCO | 50.00 | | AUG10 | 23,817.76' } },
      { file_name: 'oct.pdf', file_kind: 'bank_statement', text_density: { text_sample: 'Description | Withdrawals | Deposits | Date | Balance\nSTARTING BALANCE | | | SEP30 | 25,919.86\nCHEQUE 00008-1140009239 | | 3,547.21 | OCT01 | 29,467.07\nSHELL | 92.61 | | OCT05 | 29,374.46' } },
    ], flags)
    const f = flags.find(x => x.code === 'pay_method_mismatch')
    expect(f).toBeTruthy()
    expect(f!.evidence_en).toMatch(/e-Transfer and cheque|cheque and e-Transfer/)
  })
})

describe('rubric: stale income documents', () => {
  it('cuts ability to pay when the evidence is over a year old', () => {
    const base = { monthly_rent: 2400, claimed_monthly_income: 12000, verified_monthly_income: 12000, credit: null, crossDoc: { income_corroboration: { verdict: 'corroborated', personal_payroll_seen: true } } as never, ltbCorroborated: 0, courtDefendantHits: 0, landlordRefs: 0, declaredAddresses: 0, documentKinds: ['pay_stub', 'bank_statement'], contradictions: [], forgedDocuments: 0, blankApplicationFields: 0, applicationSigned: null, creditReportAgeDays: null }
    const fresh = scoreRubric(base).dimensions.ability_to_pay
    const stale = scoreRubric({ ...base, incomeDocsAgeDays: 690 }).dimensions.ability_to_pay
    expect(stale).toBeLessThanOrEqual(fresh - 20)
  })
})

// Review 2026-09-13 — the false positives a careful reader found.
describe('recency and letter quality — false positives closed', () => {
  it('a Tel / Fax pair is not the same number printed two ways', () => {
    expect(checkLetterQuality('ACME Inc. Tel: 416-427-8400 Fax: 416-427-8401 To whom it may concern', 'l.pdf', 'employment_letter').some(f => f.code === 'letter_phone_inconsistent')).toBe(false)
    expect(checkLetterQuality('Contact 416 4278441 or 416 427 4881 for details', 'l.pdf', 'employment_letter').some(f => f.code === 'letter_phone_inconsistent')).toBe(true)
  })
  it('a letter dates from its "Date:" line, not from the hire date it mentions', () => {
    expect(documentAsOf(pf('l.pdf', 'employment_letter', 'Carlos has been employed with ACME since March 15, 2019 as an engineer. Date: September 1, 2026 Signed HR')).as_of).toBe('2026-09-01')
  })
  it('a statement period reads its END date', () => {
    expect(documentAsOf(pf('s.pdf', 'bank_statement', 'Statement period June 3, 2026 to July 2, 2026 Opening balance 1,000.00')).as_of).toBe('2026-07-02')
  })
  it('a prior-year NOA is what a lender asks for — never stale', () => {
    const noa = pf('noa.pdf', 'other', 'Notice of Assessment Tax year: 2024 Date issued Apr 9, 2025 Total income 84,000')
    checkRecency([noa], new Date('2026-09-13T12:00:00Z'))
    expect(noa.flags.some(f => f.code === 'document_stale')).toBe(false)
  })
  it('an ambiguous slash date takes the reading closest to today, never a future one', () => {
    const today = new Date().toISOString().slice(0, 10)
    const ds = extractDates('Pay Date 03/09/2026')
    expect(ds.length).toBe(1)
    expect(ds[0] <= today).toBe(true)
    expect(extractDates('Pay Date 25/08/2026')).toEqual(['2026-08-25'])
  })
})

// Review 2026-09-13 second pass.
describe('second-pass regressions', () => {
  it('"Start Date:" is not the letter date; an unlabelled letterhead date wins', () => {
    expect(documentAsOf(pf('l.pdf', 'employment_letter', 'ACME Inc. September 3, 2026 To whom it may concern: Carlos joined us. Start Date: January 6, 2025 Signed HR')).as_of).toBe('2026-09-03')
  })
  it('a drifted number introduced by bare "direct" is still caught; a labelled fax is not', () => {
    expect(checkLetterQuality('Green Life Group Inc. 416 4278441 … you can reach me direct 416 427 4881', 'l.pdf', 'employment_letter').some(f => f.code === 'letter_phone_inconsistent')).toBe(true)
    expect(checkLetterQuality('Tel 416 427 8441 Fax: 416 427 8442', 'l.pdf', 'employment_letter').some(f => f.code === 'letter_phone_inconsistent')).toBe(false)
  })
  it('a fee notice "apply to <date>" does not become the statement period end', () => {
    expect(documentAsOf(pf('s.pdf', 'bank_statement', 'Statement period May 1, 2026 to May 31, 2026 Closing Balance May 31, 2026 $5.00 Important: new fees apply to September 1, 2026')).as_of).toBe('2026-05-31')
  })
  it('one document prints one slash format: an unambiguous field decides the ambiguous ones', () => {
    expect(extractDates('Pay period 01/25/2026 - 02/07/2026 Pay Date 02/08/2026')).toEqual(['2026-01-25', '2026-02-07', '2026-02-08'])
    expect(extractDates('Période 25/01/2026 au 07/02/2026 Date de paie 08/02/2026')).toEqual(['2026-01-25', '2026-02-07', '2026-02-08'])
  })
})
