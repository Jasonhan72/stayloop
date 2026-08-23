// Case 25 (2026-08-22) improvements: stub-stated pay frequency beats the
// model's guess; Humi stubs are a known payroll system; a Canva-exported
// application form is a verify signal, not a tampering gate; an employer name
// carrying the applicant's surname is flagged by the deep arm's-length check.
import { describe, expect, it } from 'vitest'
import { applyTextPayFrequency, inferPayFrequencyFromText } from '../lib/forensics/paystub-math'
import { employerNameCarriesSurname } from '../lib/forensics/arm-length'
import { checkSourceSpecific } from '../lib/forensics/source-specific'
import { checkPdfMetadata } from '../lib/forensics/pdf-metadata'

const HUMI_TEXT = 'Cashew 53 Sherwood Way Northwest Calgary AB T3R 1M7 Tahir Natha Pay Period Period Range Pay Date 14 of 24 2026-07-16 to 2026-07-31 2026-07-31 NET PAY 2,385.44 Gross Pay 3,125.00 39,756.74 This pay stub is non-negotiable. Powered by www.humi.ca.'

describe('pay frequency from the stub text', () => {
  it('reads "Pay Period 14 of 24" as semi-monthly and fixes a ×26 annualisation', () => {
    expect(inferPayFrequencyFromText(HUMI_TEXT)).toBe('semimonthly')
    expect(inferPayFrequencyFromText('Pay Period 3 of 26')).toBe('biweekly')
    expect(inferPayFrequencyFromText('Pay Frequency: Bi-Weekly')).toBe('biweekly')
    expect(inferPayFrequencyFromText('nothing here')).toBeNull()
    const ext: any = { annual_salary: 81250, period_gross: 3125, pay_frequency: 'biweekly', ytd_gross: 39756.74, pay_date: '2026-07-31' }
    applyTextPayFrequency(ext, HUMI_TEXT)
    expect(ext.pay_frequency).toBe('semimonthly')
    expect(ext.annual_salary).toBe(75000)
    // a correct extraction is left alone
    const ok: any = { annual_salary: 57500, period_gross: 2395.83, pay_frequency: 'semimonthly' }
    applyTextPayFrequency(ok, 'Pay Period 12 of 24')
    expect(ok.annual_salary).toBe(57500)
  })
})

describe('Humi (Prawn) is a known payroll system', () => {
  it('does not flag paystub_unknown_payroll_system for a Humi stub', () => {
    const meta: any = { producer: 'Prawn', creator: 'Prawn', file_size_bytes: 318000 }
    const text: any = { text_sample: HUMI_TEXT, total_chars: 860, page_count: 1, chars_per_page: 860, is_likely_image_pdf: false }
    const { flags } = checkSourceSpecific(meta, text, 'paystub.pdf', 'pay_stub')
    expect(flags.some(f => f.code === 'paystub_unknown_payroll_system')).toBe(false)
  })
})

describe('editing tool on a self-authored document', () => {
  it('emits the non-gating self-authored code for kind=other, the gating code for a pay stub', () => {
    const base: any = { producer: 'Canva', creator: 'Canva', author: 'Tahir Natha', title: 'form.pdf', creation_date: '2026-08-09T22:26:07Z', mod_date: '2026-08-09T22:26:07Z', file_size_bytes: 158000, page_count: 2 }
    const other = checkPdfMetadata(base, 'form.pdf', 'other')
    expect(other.some(f => f.code === 'pdf_producer_consumer_tool_selfauthored')).toBe(true)
    expect(other.some(f => f.code === 'pdf_producer_consumer_tool')).toBe(false)
    const stub = checkPdfMetadata(base, 'stub.pdf', 'pay_stub')
    expect(stub.some(f => f.code === 'pdf_producer_consumer_tool')).toBe(true)
  })
})

describe('employer name carries the applicant surname', () => {
  it('Natha Holdings Ltd. ↔ Tahir Natha; ignores boilerplate tokens and unrelated names', () => {
    expect(employerNameCarriesSurname('Natha Holdings Ltd.', 'Tahir Natha')).toBe(true)
    expect(employerNameCarriesSurname('NATHA HOLDINGS LTD.', 'Tahir Hanif Natha')).toBe(true)
    expect(employerNameCarriesSurname('Cashew Corp.', 'Tahir Natha')).toBe(false)
    expect(employerNameCarriesSurname('Holdings Inc', 'Jane Holdings')).toBe(false) // generic token
    expect(employerNameCarriesSurname('Wong Research', 'Tahir')).toBe(false)      // single-token applicant name
  })
})
