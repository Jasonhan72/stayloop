import { describe, expect, it } from 'vitest'
import { computeSeverity, isBankEntityName } from '../lib/forensics/index'
import { checkPdfMetadata } from '../lib/forensics/pdf-metadata'
import { checkSourceSpecific } from '../lib/forensics/source-specific'
import { checkRecency, documentAsOf, idExpiryFromText, isPrCardText } from '../lib/forensics/recency'
import { buildLandlordReadings, editDistance1, isProtectedStatusAsk, mergeModelReadings, readCreditReportFile, readIdDocument, readPayStub } from '../lib/forensics/landlord-reading'
import {
  applyBenignBackstops, isBrokerageTemplateClaim, isChildAgeRoundingClaim, isHoursWithinNormalVariance, isJobTitleWordingClaim,
  isPriorEmployerOnBureauClaim, isProtectedStatusClaim, isSameEntityNamingClaim, isTransposedAddressClaim,
} from '../lib/screening/coherenceReview'
import type { ForensicFlag, PerFileForensics, PdfMetadataResult } from '../lib/forensics/types'
import { scoreRubric, type RubricFacts } from '../lib/screening/rubric'
import { applyTextPayFrequency, frequencyFromPeriod } from '../lib/forensics/paystub-math'

// 2026-09-22 — case 28 (5168 Yonge St): a two-earner household with 723 /
// 767 credit, no delinquencies, renewed licences and a bank employer was
// scored 55 / "建议拒绝". Every block below is one thing the human read
// found and the module got wrong. Fixture values keep the shape of the
// case; no real identifiers.

const flag = (code: string, severity: ForensicFlag['severity']): ForensicFlag => ({ code, severity, evidence_en: code, evidence_zh: code })
const pf = (file_name: string, file_kind: string, text: string, extra: Partial<PerFileForensics> = {}): PerFileForensics =>
  ({ file_name, file_kind, mime: 'application/pdf', flags: [], elapsed_ms: 0, text_density: { total_chars: text.length, page_count: 1, chars_per_page: text.length, is_likely_image_pdf: false, text_sample: text }, ...extra } as PerFileForensics)
const meta = (o: Partial<PdfMetadataResult>): PdfMetadataResult => ({ title: null, author: null, subject: null, producer: null, creator: null, creation_date: null, modification_date: null, page_count: 1, file_size_bytes: 100_000, ...o })
const ocr = (text: string, apparent_name: string | null = null, apparent_doc_type = 'Ontario driver\'s licence') => ({ text, apparent_name, apparent_doc_type, visible_issuer: null, has_watermark: false, visible_dates: [], elapsed_ms: 1 })

describe('forensics severity — disclosures do not add up to fraud', () => {
  it('21 lows + 3 mediums with no hard gate is "suspicious", never "likely_fraud"', () => {
    const flags = [...Array.from({ length: 21 }, () => flag('pdf_producer_unknown', 'low')), flag('id_expired', 'medium'), flag('id_dl_surname_unverified', 'medium'), flag('arm_length_numbered_company', 'medium')]
    expect(computeSeverity(flags, [])).toBe('suspicious')
  })
  it('a high finding with mediums still reaches likely_fraud; a hard gate always does', () => {
    expect(computeSeverity([flag('pdf_reencrypted_after_edit', 'high'), flag('a', 'medium'), flag('b', 'medium'), flag('c', 'medium'), flag('d', 'medium')], [])).toBe('likely_fraud')
    expect(computeSeverity([], ['paystub_math_impossible'])).toBe('likely_fraud')
    expect(computeSeverity([flag('x', 'critical'), flag('y', 'high')], [])).toBe('likely_fraud')
  })
  it('the model\'s coherence items never count toward the forensic verdict', () => {
    expect(computeSeverity(Array.from({ length: 10 }, () => flag('coherence_cross_document', 'medium')), [])).toBe('clean')
  })
})

describe('producer / encryption / registry noise on genuine files', () => {
  it('a Dayforce portal printed through Chrome is a recognised payroll system (title carries the name)', () => {
    const m = meta({ producer: 'Skia/PDF m138', title: 'Earnings - Dayforce' })
    const text = { total_chars: 900, page_count: 1, chars_per_page: 900, is_likely_image_pdf: false, text_sample: 'Employer Name: KEB Hana Bank Canada Employee Name: Kim Pay Date: 8/31/2026 Pay Frequency: Semi-Monthly REGULAR $2,041.67 CPP $112.80 EI $33.28 Net Pay $1,642.11 Direct Deposit 004 19702 XXX5611 Page 1 of 1' }
    const { result, flags } = checkSourceSpecific(m, text, 'paystubs2.pdf', 'pay_stub')
    expect(result.matched_payroll).toBe('Ceridian')
    expect(flags.map(f => f.code)).not.toContain('paystub_unknown_payroll_system')
  })
  it('a Docusign envelope is encrypted by the platform — no note on a lease or an OREA form', () => {
    expect(checkPdfMetadata(meta({ producer: 'Docusign DMv10', encrypted: true, encrypt_dict_count: 1 }), 'Sch._B.pdf', 'lease').map(f => f.code)).not.toContain('pdf_encrypted')
    expect(checkPdfMetadata(meta({ producer: 'Docusign DMv10', encrypted: true, encrypt_dict_count: 1 }), 'Form 410.pdf', 'other').map(f => f.code)).not.toContain('pdf_encrypted')
    // a bureau report never comes through Docusign — the rule stays
    expect(checkPdfMetadata(meta({ producer: 'Docusign DMv10', encrypted: true, encrypt_dict_count: 1 }), 'equifax.pdf', 'credit_report').map(f => f.code)).toContain('pdf_encrypted')
    // an applicant-encrypted Word letter is still disclosed
    expect(checkPdfMetadata(meta({ producer: 'Microsoft® Word 2016', encrypted: true, encrypt_dict_count: 1 }), 'letter.pdf', 'employment_letter').map(f => f.code)).toContain('pdf_encrypted')
  })
  it('banks are Bank Act entities, not corporate-registry filings', () => {
    expect(isBankEntityName('KEB Hana Bank Canada')).toBe(true)
    expect(isBankEntityName('Meridian Credit Union')).toBe(true)
    expect(isBankEntityName('2201371 Ontario Inc.')).toBe(false)
    expect(isBankEntityName('Riverbank Foods Ltd')).toBe(false)
  })
})

describe('identity documents — expiry read from every label, PR cards are not identity failures', () => {
  const swapped = 'Ontario Driver\'s Licence YL HUJJUN 3 REAN DR UN902 Y4001 - 34708 - 11008 Expiry: 2024/12/18 Issue: 2026/10/08 DOB 1981/10/08 Ontario Temporary Driver\'s Licence Effective Date 2026/09/09 Date of Expiry 2026/12/08 Issue Date 2026/09/09'
  it('OCR that swaps the ISS/EXP columns and a temporary licence both resolve to the latest validity date', () => {
    expect(idExpiryFromText(swapped)).toBe('2026-12-08')
    expect(idExpiryFromText('Ontario Photo Card EXP/EXP 2026/06/11 ISS/DÉL 2021/06/11 DOB 1980/06/11')).toBe('2026-06-11')
    expect(idExpiryFromText('ISS/DÉL 2019/03/02 EXP/EXP 2024/03/02')).toBe('2024-03-02')
  })
  it('a licence renewed by temporary permit is not "expired 643 days ago"', () => {
    const doc = pf('Mr. Yi ID.jpg', 'id_document', '', { ocr: ocr(swapped, 'HUJJUN') })
    expect(documentAsOf(doc).expiry).toBe('2026-12-08')
    checkRecency([doc], new Date('2026-09-22T00:00:00Z'))
    expect(doc.flags.map(f => f.code)).not.toContain('id_expired')
  })
  it('an expired PR card is an info note, never counts toward "all IDs expired", and is not a question for the applicant', () => {
    const pr = pf('PRcard.jpg', 'id_document', '', { ocr: ocr('Canada Permanent Resident Card Carte de résident permanent KIM SUNKYOUNG Expiry/Expiration 24 AUG / AOÛT 26 ID No 9695-2826', 'KIM SUNKYOUNG', 'Canadian Permanent Resident Card') })
    const dl = pf('ID.jpg', 'id_document', '', { ocr: ocr('Ontario Driver\'s Licence KIM, SUNKYOUNG K4408-72708-26007 ISS 2024/12/23 EXP 2026/10/07 DOB 1982/10/07', 'KIM, SUNKYOUNG') })
    const { crossFlags } = checkRecency([pr, dl], new Date('2026-09-22T00:00:00Z'))
    expect(isPrCardText(pr.ocr!.text)).toBe(true)
    expect(pr.flags.map(f => `${f.code}:${f.severity}`)).toEqual(['pr_card_expired:info'])
    expect(crossFlags.map(f => f.code)).not.toContain('all_ids_expired')
    const reading = readIdDocument(pr.ocr, 'Sunkyoung Kim')
    expect(reading.bullets.some(b => b.zh.includes('PR 身份不随卡过期而失效'))).toBe(true)
    expect(reading.bullets.some(b => b.tone === 'warn' || b.tone === 'bad')).toBe(false)
    expect(isProtectedStatusAsk('是否有更新后的有效PR证明？')).toBe(true)
    expect(isProtectedStatusAsk('Is there a renewed PR card?')).toBe(true)
    expect(isProtectedStatusAsk('临牌对应的新卡是否已收到？')).toBe(false)
  })
  it('a co-applicant\'s licence whose OCR garbled one letter is still the co-applicant, not "does not match the applicant"', () => {
    expect(editDistance1('hujjun', 'huijun')).toBe(true)
    expect(editDistance1('nathali', 'nathalie')).toBe(true)
    expect(editDistance1('maria', 'mario')).toBe(true)
    expect(editDistance1('garcia', 'gracias')).toBe(false)
    const r = readIdDocument(ocr('YL HUJJUN 3 REAN DR', 'HUJJUN'), 'Sunkyoung Kim', ['Huijun Yi', 'Taeoh Yi'])
    expect(r.bullets.some(b => b.zh.includes('共同申请人') && b.tone === 'neutral')).toBe(true)
    expect(r.bullets.some(b => b.tone === 'bad')).toBe(false)
    // a genuinely different person still reads as a mismatch
    expect(readIdDocument(ocr('SMITH, JOHN', 'SMITH, JOHN'), 'Sunkyoung Kim', ['Huijun Yi']).bullets.some(b => b.tone === 'bad')).toBe(true)
  })
  it('model asks about immigration status are stripped from the landlord reading', () => {
    const doc = pf('PRcard.jpg', 'id_document', '')
    mergeModelReadings([doc], [{ file: 'PRcard.jpg', landlord_read_zh: ['PR 卡到期 2026-08-24'], ask_zh: '是否有更新后的有效PR证明？', ask_en: 'Is there a renewed PR card?' }])
    expect(doc.landlord_reading?.asks ?? []).toEqual([])
  })
})

describe('coherence backstops — wording is not a contradiction', () => {
  const A = (o: Partial<Parameters<typeof isJobTitleWordingClaim>[0]> & { id?: string }) => ({ id: 'A0', claim_zh: '', claim_en: '', evidence: [], severity: 'high' as const, category: 'cross_document', files: [], ...o })
  it('job-title synonyms (HR letter vs payroll stub) cap at low', () => {
    expect(isJobTitleWordingClaim(A({ claim_zh: '易先生职称在信与工资单不一致', evidence: ["'working as a Logistics Associate'", "'Occupation Warehouse Associate'"] }))).toBe(true)
    expect(isJobTitleWordingClaim(A({ claim_zh: '易先生雇主名称表述不一致', evidence: ['x'] }))).toBe(false)
  })
  it('a legal entity and its trade name are one employer', () => {
    expect(isSameEntityNamingClaim(A({ claim_zh: '易先生雇主名称表述不一致', evidence: ["'David Health International (c/o 2201371 Ontario Inc.)'", "'2201371 ONTARIO INC.'", "'2201371 Ontario Inc.(o/a David Health International)'"] }))).toBe(true)
    expect(isSameEntityNamingClaim(A({ claim_zh: '雇主名称不一致', evidence: ["'Acme Logistics Ltd.'", "'Beta Freight Corp.'"] }))).toBe(false)
  })
  it('a transposed street number on the same street is a typo, not a different address', () => {
    expect(isTransposedAddressClaim(A({ claim_zh: '金女士雇主地址一处写错楼号', evidence: ["'located at 4950 Yonge Street, Suite 103, Toronto, ON M2N 6K1.'", "'Business address Suite 103, 4590 Yonge St.'"] }))).toBe(true)
    expect(isTransposedAddressClaim(A({ claim_zh: '地址不一致', evidence: ["'4950 Yonge Street'", "'120 Bloor St'"] }))).toBe(false)
  })
  it('152–168 hours a month against "40 hours a week" is the calendar, not reduced hours', () => {
    expect(isHoursWithinNormalVariance(A({ claim_zh: '易先生工资单跑速低于雇佣信所称工时', evidence: ["'working 40 hours a week (5 days a week) since September 29, 2025, as a full-time employee and earning an hourly wage of $23.'", "'Hours 168:00 Rate 23.00 Current 3,864.00'", "'Hours 152:00 Rate 23.00 Current 3,496.00'"] }))).toBe(true)
    expect(isHoursWithinNormalVariance(A({ claim_zh: '工时不符', evidence: ["'40 hours a week'", "'Hours 25:00 Rate 23.00'"] }))).toBe(false)
  })
  it('PR-card expiry, citizenship and visas are protected grounds — dropped', () => {
    expect(isProtectedStatusClaim(A({ claim_zh: '两位PR卡已过期而驾照是近期续发' }))).toBe(true)
    expect(isProtectedStatusClaim(A({ claim_en: 'Work permit expires before the lease ends' }))).toBe(true)
    expect(isProtectedStatusClaim(A({ claim_zh: '在职信日期与工资单不符' }))).toBe(false)
  })
  it('sale wording on an OREA schedule is the brokerage\'s template', () => {
    expect(isBrokerageTemplateClaim(A({ category: 'format_provenance', files: ['Sch._B.pdf'], claim_zh: '附表B内容沿用买卖协议措辞而非租赁', evidence: ["'The Buyer and the Seller acknowledge'", "'sale of the property'"] }))).toBe(true)
    expect(isBrokerageTemplateClaim(A({ category: 'format_provenance', files: ['paystub.pdf'], claim_zh: '工资单版式与生成器一致', evidence: ["'paystub_4_20260817'"] }))).toBe(false)
  })
  it('a child written as 4 whose card says born 2023 is Korean-age rounding', () => {
    expect(isChildAgeRoundingClaim(A({ claim_zh: '子女年龄申请表写4岁而PR卡显示3岁', evidence: ["'Taeoh 4 years old'", "'Date of Birth 09 JUN 2023'"] }))).toBe(true)
    expect(isChildAgeRoundingClaim(A({ claim_zh: '子女年龄不符', evidence: ["'child 12 years old'", "'Date of Birth 2023-06-09'"] }))).toBe(false)
  })
  it('the bureau\'s employer line naming the application\'s previous job is consistent', () => {
    const docs = [
      { file: 'Yi Equifax.pdf', kind: 'credit_report', key_facts: { employer: 'GTS SERVICES', employers_listed: ['GTS SERVICES'] } },
      { file: 'Form 410.pdf', kind: 'application_form', key_facts: { employer: 'Hana Bank Canada', employers_listed: ['Hana Bank Canada', 'David Health International', 'Bakery Gateau', 'GTS Services'] } },
    ]
    const a = A({ severity: 'medium', claim_zh: '易先生信用档现雇主与申请现雇主不同', evidence: ["'Employment Type Current GTS SERVICES'", "'Employer David Health International'"] })
    expect(isPriorEmployerOnBureauClaim(a, docs)).toBe(true)
    expect(isPriorEmployerOnBureauClaim(a, [docs[0], { ...docs[1], key_facts: { employers_listed: ['Hana Bank Canada', 'David Health International'] } }])).toBe(false)
  })
  it('applyBenignBackstops: the case-28 list leaves one real question (the bureau name) and lows', () => {
    const list = [
      A({ id: 'A1', claim_zh: '金女士雇主地址一处写错楼号', evidence: ["'located at 4950 Yonge Street, Suite 103'", "'Business address Suite 103, 4590 Yonge St.'"] }),
      A({ id: 'A2', claim_zh: '金女士姓名在信用报告与其余文件不一致', evidence: ["'Current Name SU A KIM'", "'RE: Sunkyoung Kim'"] }),
      A({ id: 'A3', claim_zh: '易先生职称在信与工资单不一致', evidence: ["'working as a Logistics Associate'", "'Occupation Warehouse Associate'"] }),
      A({ id: 'A4', severity: 'medium', claim_zh: '易先生雇主名称表述不一致', evidence: ["'David Health International (c/o 2201371 Ontario Inc.)'", "'2201371 ONTARIO INC.'"] }),
      A({ id: 'A5', severity: 'low', claim_zh: '两位PR卡已过期而驾照是近期续发', evidence: ["'Expiry/Expiration 24 AUG / AOÛT 26'"] }),
    ] as never[]
    const out = applyBenignBackstops(list as never, [])
    expect(out.map((a: { id: string; severity: string }) => `${a.id}:${a.severity}`)).toEqual(['A2:high', 'A3:low', 'A4:low'])
  })
})

describe('landlord reading — attribution and wording', () => {
  const credit = { subject_name: 'SU A KIM', source_file: 'Ms. Kim Equifax.pdf', bureau: 'Equifax', credit_score: 723, report_date: '2026/07/10', tradelines: [{ creditor: 'TD CREDIT CARDS', type: 'Revolving', date_opened: '2024/11/27', balance: 276, credit_limit: 4000, past_due: 0, payment_status: 'R1', late_30_60_90: '0/0/0' }], collections: [], bankruptcies: [], inquiries: [], total_debt: 352, monthly_debt_payments: 86 }
  it('with two bureau reports the transcription attaches to its own source file; the other is "check separately"', () => {
    const kim = pf('Ms. Kim Equifax.pdf', 'credit_report', 'EQUIFAX Current Name SU A KIM Score 723')
    const yi = pf('Mr. Yi Equifax.pdf', 'credit_report', 'EQUIFAX Current Name HUIJUN YI Score 767', { ocr: { ...ocr('', 'HUIJUN YI'), text: '' } })
    buildLandlordReadings([kim, yi], { applicantName: 'Sunkyoung Kim', monthlyRent: 2680, claimedMonthlyIncome: 4083, creditReport: credit as never, monthlyIncomeForCredit: 4083, householdMonthlyIncome: 8069 })
    expect(kim.landlord_reading?.bullets.some(b => b.zh.includes('信用分 723'))).toBe(true)
    expect(yi.landlord_reading?.bullets.some(b => b.zh.includes('信用分 723'))).toBe(false)
    expect(yi.landlord_reading?.bullets.some(b => b.zh.includes('请单独核对'))).toBe(true)
  })
  it('debt service is shown against household income, with no lender 44% rule', () => {
    const r = readCreditReportFile(credit as never, 4083, 2680, 8069)
    const line = r.bullets.find(b => b.zh.includes('每月固定债务还款'))!
    expect(line.zh).toContain('占家庭毛收入 34%')
    expect(line.zh).not.toContain('44%')
    expect(line.en).not.toMatch(/lenders cap/)
    expect(line.tone).toBe('neutral')
  })
  it('overtime hours on a salaried stub do not make it part-time', () => {
    const r = readPayStub({ employer_name: 'KEB Hana Bank Canada', pay_frequency: 'semimonthly', period_gross: 2267.82, period_net: 1810.69, hours_worked: 6, hourly_rate: null, annual_salary: 49000, ytd_gross: 27639.65 } as never, 'OT HRS 6.00 REGULAR $2,041.67', 0.82, null)
    expect(r.bullets.some(b => b.zh.includes('兼职'))).toBe(false)
    const hourly = readPayStub({ employer_name: 'Shop', pay_frequency: 'biweekly', period_gross: 640, period_net: 590, hours_worked: 32, hourly_rate: 20 } as never, 'Cashier', 1, null)
    expect(hourly.bullets.some(b => b.zh.includes('兼职'))).toBe(true)
  })
})

describe('rubric — documented income without a bank trail', () => {
  const base: RubricFacts = {
    monthly_rent: 2680, claimed_monthly_income: 7579, verified_monthly_income: null,
    credit: { bureau: 'Equifax', credit_score: 723, monthly_debt_payments: 86, report_date: '2026-07-10', tradelines: [{ type: 'Revolving', creditor: 'TD', balance: 276, credit_limit: 4000, past_due: 0, payment_status: 'R1', date_opened: '2024/11/27', late_30_60_90: '0/0/0' }], collections: [], bankruptcies: [], inquiries: [] } as never,
    crossDoc: { income_corroboration: { verdict: 'uncorroborated', personal_payroll_seen: false, claimed_monthly: 8069, observed_pattern: 'no statements', detail: '' } } as never,
    ltbCorroborated: 0, courtDefendantHits: 0, landlordRefs: 2, declaredAddresses: 2,
    documentKinds: ['lease', 'employment_letter', 'pay_stub', 'id_document', 'credit_report', 'other'],
    contradictions: [], contradictionDetails: [], forgedDocuments: 0, blankApplicationFields: 0, applicationSigned: null, creditReportAgeDays: 74,
    corroborations: ['employer_registry_active', 'paystub_period_deductions_verified'], identityConsistent: true,
  }
  it('two or more reconciling payroll-system stubs score 50, not the bare-claim 35', () => {
    const claim = scoreRubric(base)
    expect(claim.hits.find(h => h.dim === 'ability_to_pay')?.code).toBe('income_unverified')
    expect(claim.dimensions.ability_to_pay).toBe(35)
    const documented = scoreRubric({ ...base, payrollStubsConsistent: 3 })
    expect(documented.hits.find(h => h.dim === 'ability_to_pay')?.code).toBe('income_documented_no_bank_trail')
    expect(documented.dimensions.ability_to_pay).toBe(50)
    // one stub is not a pattern
    expect(scoreRubric({ ...base, payrollStubsConsistent: 1 }).dimensions.ability_to_pay).toBe(35)
    // a corroborated figure still outranks it
    const verified = scoreRubric({ ...base, verified_monthly_income: 7579, payrollStubsConsistent: 3 })
    expect(verified.dimensions.ability_to_pay).toBeGreaterThanOrEqual(70)
  })
})

describe('pay frequency from the period dates', () => {
  it('a 1st-to-31st period is monthly whatever the model guessed; 14 days stays with the model', () => {
    expect(frequencyFromPeriod('2026-08-01', '2026-08-31')).toBe('monthly')
    expect(frequencyFromPeriod('2026-02-01', '2026-02-28')).toBe('monthly')
    expect(frequencyFromPeriod('2026-08-03', '2026-08-09')).toBe('weekly')
    expect(frequencyFromPeriod('2026-08-01', '2026-08-15')).toBeNull()
    expect(frequencyFromPeriod('2026-08-03', '2026-08-16')).toBeNull()
    // case 28 re-run: two monthly stubs in one photo → "semimonthly" → $83,904 annualised
    const ext = { pay_period_start: '2026-08-01', pay_period_end: '2026-08-31', pay_frequency: 'semimonthly', period_gross: 3496, annual_salary: 83904, hourly_rate: 23, hours_worked: 152 } as never
    const out = applyTextPayFrequency(ext, 'Pay Period 08/01/2026 - 08/31/2026 Hours 152:00 Rate 23.00')
    expect(out.pay_frequency).toBe('monthly')
    expect(out.annual_salary).toBe(41952)
  })
})
