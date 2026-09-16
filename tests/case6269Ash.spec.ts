import { describe, expect, it } from 'vitest'
import { scanBureauDelinquencies } from '@/lib/screening/bureauTextScan'
import { checkResidenceTimeline, footprintFromFacts, looksCanadian, parsePeriod } from '@/lib/screening/residenceTimeline'

// 2026-09-16 — one real file read by hand against the module (6269 Ash St).
// Every assertion here is a fact the human reader found and the pipeline
// missed. Fixture values are synthetic but keep the shape of the case.

describe('bureau text scan — delinquency dates the transcription dropped', () => {
  it('reads a "Delinquencies <date>" box and ignores the "no delinquencies" sentence', () => {
    const flat = 'CIBC CARD SERVICES ... Delinquencies You currently have no delinquencies on your credit file. FIDO ... Months Reviewed 46 Delinquencies 2023/05/16 Payment History 05/2023 $562 N/A $125'
    const r = scanBureauDelinquencies(flat)
    expect(r.delinquency_dates).toEqual(['2023-05-16'])
    expect(r.says_no_delinquencies).toBe(true)
  })
  it('returns nothing for a clean file', () => {
    expect(scanBureauDelinquencies('Delinquencies You currently have no delinquencies on your credit file.').delinquency_dates).toEqual([])
  })
})

describe('residence timeline vs Canadian footprint', () => {
  it('recognises Canadian addresses by postal code, province or city', () => {
    expect(looksCanadian('118-9325 Yonge St, Richmond Hill, ON L4C 0A8')).toBe(true)
    expect(looksCanadian('5639 Montrose Rd Niagara Falls')).toBe(true)
    expect(looksCanadian('11a Akhsarova st , apt 73')).toBe(false)
  })
  it('parses "2016 to 2026" as a period ending today', () => {
    const p = parsePeriod('2016 to 2026', new Date('2026-09-16T00:00:00Z'))!
    expect(p.start).toBe('2016-01-01')
    expect(p.end).toBe('2026-09-16')
  })
  it('flags a decade "abroad" that overlaps cards, rental-screening inquiries and a licence in Canada', () => {
    const footprint = footprintFromFacts({
      tradelines: [{ creditor: 'CIBC CARD SERVICES', date_opened: '2021/01/12' }, { creditor: 'CIBC CARD SERVICES', date_opened: '2022/09/14' }, { creditor: 'CAPITAL ONE BANK', date_opened: '2026/06/24' }],
      inquiries: [{ date: '2025/10/01', creditor: 'YARDI CANADA LTD.', hard: false }, { date: '2026/06/24', creditor: 'CAP ONE', hard: true }, { date: '2026/07/24', creditor: 'EQUIFAX PERSONAL SOL', hard: false }],
      bureauAddressDates: [{ date: '2022-12-01', label: 'address reported on the credit file' }],
      licenceIssued: '2022-11-03',
    })
    expect(footprint.map(f => f.kind)).toContain('rental_screening_inquiry')
    expect(footprint.map(f => f.kind)).toContain('licence_issued')
    // soft self-pulls are not footprint
    expect(footprint.some(f => /EQUIFAX PERSONAL/.test(f.label))).toBe(false)

    const flags = checkResidenceTimeline({
      residences: [{ address: '11a Akhsarova st , apt 73', period: '2016 to 2026', landlord_name: 'Nissim Maruaniy', landlord_phone: '4162733961' }],
      vacating_reason: 'moving back to Canada',
      applicantNames: ['Nissim Maruaniy', 'NISSIM MARUANIY'],
      footprint,
      today: new Date('2026-09-16T00:00:00Z'),
    })
    const codes = flags.map(f => f.code)
    expect(codes).toContain('cross_doc_residence_timeline_contradiction')
    expect(codes).toContain('cross_doc_landlord_is_applicant')
    const tl = flags.find(f => f.code === 'cross_doc_residence_timeline_contradiction')!
    expect(tl.severity).toBe('high')
    expect(tl.evidence_en).toMatch(/YARDI/)
    expect(tl.evidence_en).toMatch(/moving back to Canada/)
  })
  it('does not flag a Canadian residence, a short foreign stay, or an unrelated landlord', () => {
    const footprint = footprintFromFacts({ tradelines: [{ creditor: 'RBC', date_opened: '2024/01/01' }], inquiries: [{ date: '2025/03/01', creditor: 'CERTN', hard: false }] })
    expect(checkResidenceTimeline({ residences: [{ address: '12 Main St, Toronto ON', period: '2019 to 2026', landlord_name: 'Mary Wong' }], applicantNames: ['Sam Lee'], footprint })).toEqual([])
    expect(checkResidenceTimeline({ residences: [{ address: 'Rue de Rivoli 5, Paris', period: '2025 to 2026', landlord_name: 'Jean Dupont' }], applicantNames: ['Sam Lee'], footprint, today: new Date('2026-09-16T00:00:00Z') })).toEqual([])
  })
})

import { checkPdfMetadata } from '@/lib/forensics/pdf-metadata'
import { reconcileIncomeAcrossDocs } from '@/lib/forensics/cross-doc'

describe('pay-stub generator signature and income corroboration threshold', () => {
  it('a "paystub_4_<timestamp>" title with no producer is a generator export (forgery-indicating)', () => {
    const flags = checkPdfMetadata({ title: 'paystub_4_20260817160120', author: null, subject: null, producer: null, creator: null, creation_date: '2026-08-17T16:01:20Z', modification_date: '2026-08-17T16:01:20Z' } as never, 'paystub_4_20260807.pdf', 'pay_stub')
    const gen = flags.find(f => f.code === 'paystub_generator_signature')
    expect(gen?.severity).toBe('high')
    // a real payroll export with a producer is untouched
    const ok = checkPdfMetadata({ title: 'Pay Statement 2026-08-07', author: null, subject: null, producer: 'Workday', creator: 'Workday', creation_date: '2026-08-07T00:00:00Z', modification_date: '2026-08-07T00:00:00Z' } as never, 'stub.pdf', 'pay_stub')
    expect(ok.some(f => f.code === 'paystub_generator_signature')).toBe(false)
  })
  it('$96,000 letter vs $104,000 stubs is a near-match question, not a corroboration', () => {
    const mk = (annual: number) => {
      const flags: { code: string; severity: string }[] = []
      reconcileIncomeAcrossDocs([
        { file_name: 'letter.pdf', file_kind: 'employment_letter', text_density: { text_sample: 'Globe Net International ... his current salary is $96,000 per year.' }, flags: [] },
        { file_name: 'stub.pdf', file_kind: 'pay_stub', text_density: { text_sample: 'Globe Net International EARNINGS STATEMENT' }, flags: [], paystub_math: { extraction: { employer_name: 'Globe Net International', annual_salary: annual, pay_date: '2026-08-07', ytd_gross: 64000, period_gross: 4000, pay_frequency: 'biweekly' } } },
      ] as never, flags as never)
      return flags.map(f => f.code)
    }
    expect(mk(104000)).toContain('cross_doc_income_near_match')
    expect(mk(104000)).not.toContain('cross_doc_income_corroborated')
    expect(mk(96500)).toContain('cross_doc_income_corroborated')
    expect(mk(120000)).toContain('cross_doc_income_mismatch')
  })
})
