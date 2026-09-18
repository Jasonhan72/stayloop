import { describe, expect, it } from 'vitest'
import { scanBureauDelinquencies } from '@/lib/screening/bureauTextScan'
import { checkResidenceTimeline, footprintFromFacts, looksCanadian, looksForeign, parsePeriod } from '@/lib/screening/residenceTimeline'

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
    expect(looksCanadian('5639 Montrose Rd, Niagara Falls, ON')).toBe(true)
    expect(looksCanadian('11a Akhsarova st , apt 73')).toBe(false)
    // Review 2026-09-16: a bare street is not "abroad" (the schema only asks
    // for `address`); a foreign namesake city is not Canadian.
    expect(looksCanadian('6269 Ash St')).toBe(false)
    expect(looksForeign('6269 Ash St')).toBe(false)
    expect(looksCanadian('Kingston 6, Jamaica')).toBe(false)
    expect(looksCanadian('London NW1 6XE, UK')).toBe(false)
    expect(looksForeign('London NW1 6XE, UK')).toBe(true)
    expect(looksForeign('120 Main St, Buffalo, NY 14201')).toBe(true)
  })
  it('review 2026-09-16: a street-only Canadian address with a full Canadian footprint is not a contradiction', () => {
    const footprint = footprintFromFacts({ tradelines: [{ creditor: 'TD VISA', date_opened: '2019/04/01' }, { creditor: 'ROGERS', date_opened: '2021/02/01' }], inquiries: [{ date: '2025/03/01', creditor: 'CERTN', hard: false }] })
    expect(checkResidenceTimeline({ residences: [{ address: '6269 Ash St', period: '2016 to 2026', landlord_name: 'Jane Owner' }], applicantNames: ['Sam Lee'], footprint })).toEqual([])
    // with the applicant's own "moving back to Canada" it is
    expect(checkResidenceTimeline({ residences: [{ address: '6269 Ash St', period: '2016 to 2026', landlord_name: 'Jane Owner' }], vacating_reason: 'moving back to Canada', applicantNames: ['Sam Lee'], footprint }).map(f => f.code)).toContain('cross_doc_residence_timeline_contradiction')
  })
  it('review 2026-09-16: one fact is one event; two kinds of evidence are required', () => {
    // a tradeline open month duplicated on the coherence list = 1 event
    const fp = footprintFromFacts({ tradelines: [{ creditor: 'TD', date_opened: '2022-03' }], bureauAddressDates: [{ date: '2022-03-01', label: 'address reported' }] })
    expect(checkResidenceTimeline({ residences: [{ address: 'Tel Aviv, Israel', period: '2016 to 2026' }], applicantNames: ['Sam Lee'], footprint: fp })).toEqual([])
    // two accounts, one kind → still no contradiction; account + inquiry → yes
    const twoAccounts = footprintFromFacts({ tradelines: [{ creditor: 'TD', date_opened: '2022-03-01' }, { creditor: 'RBC', date_opened: '2023-05-01' }] })
    expect(checkResidenceTimeline({ residences: [{ address: 'Tel Aviv, Israel', period: '2016 to 2026' }], applicantNames: ['Sam Lee'], footprint: twoAccounts })).toEqual([])
    const mixed = footprintFromFacts({ tradelines: [{ creditor: 'TD', date_opened: '2022-03-01' }], inquiries: [{ date: '2023-05-01', creditor: 'YARDI', hard: false }] })
    expect(checkResidenceTimeline({ residences: [{ address: 'Tel Aviv, Israel', period: '2016 to 2026' }], applicantNames: ['Sam Lee'], footprint: mixed }).map(f => f.code)).toContain('cross_doc_residence_timeline_contradiction')
  })
  it('review 2026-09-16: self-landlord needs name containment, and the route can inject its own matcher', () => {
    const fp = footprintFromFacts({})
    expect(checkResidenceTimeline({ residences: [{ address: '1 A St, Toronto, ON', period: '2020 to 2024', landlord_name: 'Jose Garcia Lopez' }], applicantNames: ['Maria Garcia Lopez'], footprint: fp })).toEqual([])
    expect(checkResidenceTimeline({ residences: [{ address: '1 A St, Toronto, ON', period: '2020 to 2024', landlord_name: 'Garcia Lopez' }], applicantNames: ['Maria Garcia Lopez'], footprint: fp }).map(f => f.code)).toContain('cross_doc_landlord_is_applicant')
    expect(checkResidenceTimeline({ residences: [{ address: '1 A St, Toronto, ON', period: '2020 to 2024', landlord_name: 'Anyone' }], applicantNames: ['Sam Lee'], footprint: fp, isSelf: () => true }).map(f => f.code)).toContain('cross_doc_landlord_is_applicant')
  })
  it('review 2026-09-16: unit numbers are not years; months are read', () => {
    const p = parsePeriod('Unit 2010, since 2016', new Date('2026-09-16T00:00:00Z'))!
    expect(p.start).toBe('2016-01-01')
    const q = parsePeriod('Sept 2024 - Mar 2025', new Date('2026-09-16T00:00:00Z'))!
    expect(q.start).toBe('2024-09-01'); expect(q.end).toBe('2025-03-28')
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

import { readPdfMetadata } from '@/lib/forensics/pdf-metadata'

describe('PDF metadata follows the latest incremental revision', () => {
  it('reads the ModDate of the last copy of the Info object, not the first', async () => {
    const pdf = [
      '%PDF-1.4',
      '5 0 obj << /Producer (macOS Quartz PDFContext) /Creator (Preview) /CreationDate (D:20260320182216Z) /ModDate (D:20260529051729-04\'00\') >> endobj',
      'trailer << /Info 5 0 R >>',
      '%%EOF',
      '5 0 obj << /Producer (macOS Quartz PDFContext) /Creator (Preview) /CreationDate (D:20260320182216Z) /ModDate (D:20260906205913-04\'00\') >> endobj',
      'trailer << /Info 5 0 R >>',
      '%%EOF',
    ].join('\n')
    const meta = await readPdfMetadata(new TextEncoder().encode(pdf))
    expect(meta?.modification_date?.slice(0, 10)).toBe('2026-09-06')
    expect(meta?.creation_date?.slice(0, 10)).toBe('2026-03-20')
  })
})

// Review 2026-09-16 (slice A): thresholds, ordering, bureau layouts.
describe('review 2026-09-16 — screening pipeline', () => {
  it('TransUnion "Delinquency Date MM/DD/YYYY" is read; Equifax YMD still is', () => {
    expect(scanBureauDelinquencies('Delinquency Date 05/16/2023').delinquency_dates).toEqual(['2023-05-16'])
    expect(scanBureauDelinquencies('Delinquencies 2023/05/16').delinquency_dates).toEqual(['2023-05-16'])
  })
  it('an hourly letter is compared by rate, not by 2,080-hour annualisation', () => {
    const flags: { code: string }[] = []
    const stub = (hourly: number | null, annual: number) => ({ file_name: 'stub.pdf', file_kind: 'pay_stub', text_density: { text_sample: 'ACME INC' }, paystub_math: { extraction: { employer_name: 'Acme Inc', annual_salary: annual, hourly_rate: hourly } }, flags: [] })
    const letter = { file_name: 'letter.pdf', file_kind: 'employment_letter', text_density: { text_sample: 'Acme Inc confirms Sam Lee earns $30.00 per hour.' }, flags: [] }
    reconcileIncomeAcrossDocs([letter, stub(30, 54_600)] as never, flags as never)
    expect(flags.map(f => f.code)).toContain('cross_doc_income_corroborated')
    flags.length = 0
    reconcileIncomeAcrossDocs([letter, stub(null, 54_600)] as never, flags as never)
    expect(flags.map(f => f.code)).not.toContain('cross_doc_income_mismatch')
  })
  it('salaried: 3–15% is a question, ≥15% a contradiction', () => {
    const flags: { code: string }[] = []
    const stub = (annual: number) => ({ file_name: 'stub.pdf', file_kind: 'pay_stub', text_density: { text_sample: 'ACME INC' }, paystub_math: { extraction: { employer_name: 'Acme Inc', annual_salary: annual, hourly_rate: null } }, flags: [] })
    const letter = { file_name: 'letter.pdf', file_kind: 'employment_letter', text_density: { text_sample: 'Acme Inc: annual salary of $80,000.' }, flags: [] }
    reconcileIncomeAcrossDocs([letter, stub(90_000)] as never, flags as never)
    expect(flags.map(f => f.code)).toContain('cross_doc_income_near_match')
    flags.length = 0
    reconcileIncomeAcrossDocs([letter, stub(100_000)] as never, flags as never)
    expect(flags.map(f => f.code)).toContain('cross_doc_income_mismatch')
  })
  it('a generator-titled stub does not also get "metadata stripped"', () => {
    const flags = checkPdfMetadata({ title: 'paystub_4_20260817160120', producer: null, creator: null, author: null, subject: null, creation_date: null, modification_date: null } as never, 'stub.pdf', 'pay_stub')
    const codes = flags.map(f => f.code)
    expect(codes).toContain('paystub_generator_signature')
    expect(codes).not.toContain('pdf_metadata_stripped')
  })
})

// Review 2026-09-17 — module replay findings.
import { clampMemories } from '@/lib/agent/turnHelpers'
describe('review 2026-09-17 — agent input clamps and guardrail', () => {
  it('memory label and object values are clamped', () => {
    const [m] = clampMemories([{ key: 'k', label: 'x'.repeat(5000), value: { big: 'y'.repeat(5000) } }])
    expect((m.label as string).length).toBe(80)
    expect(typeof m.value === "string" ? m.value.length : JSON.stringify(m.value).length).toBeLessThanOrEqual(500)
  })
})
