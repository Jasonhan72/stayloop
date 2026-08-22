// Case 24 (2026-08-21) regression guards: the checks two external reviewers
// applied by eye and our pipeline did not — a file's own timestamps against
// the date the document prints for itself, and a credit report's tradeline
// ages against the applicant's date of birth.
import { describe, expect, it } from 'vitest'
import { extractDocumentDate, checkDocumentDateConsistency } from '../lib/forensics/date-consistency'
import { checkTradelineAges } from '../lib/screening/creditAge'

describe('extractDocumentDate', () => {
  it('reads an ADP-style PAYMENT DATE: YYYYMMDD', () => {
    expect(extractDocumentDate('pay_stub', 'NEWERA HEALTH INC.\nPAYMENT DATE: 20260703\nPAY END DATE : 20260627')).toBe('2026-07-03')
  })
  it('reads a long-form letter date with ordinal', () => {
    expect(extractDocumentDate('employment_letter', 'www.newerahealthinc.com\n\nAugust 3rd, 2026\n\nRe: Employment Verification')).toBe('2026-08-03')
    expect(extractDocumentDate('employment_letter', 'Dated this 3 August 2026')).toBe('2026-08-03')
  })
  it('reads a credit report Request Date / as of', () => {
    expect(extractDocumentDate('credit_report', 'a copy of your personal credit file as of 2026/05/27 follows')).toBe('2026-05-27')
    expect(extractDocumentDate('credit_report', 'Credit Report   Request Date 2026/03/27')).toBe('2026-03-27')
  })
  it('refuses ambiguous numeric dates and unknown kinds', () => {
    expect(extractDocumentDate('employment_letter', 'Date: 03/04/2026')).toBeNull()
    expect(extractDocumentDate('other', 'August 3rd, 2026')).toBeNull()
  })
})

describe('checkDocumentDateConsistency', () => {
  it('flags a 2026 pay stub whose PDF was created in 2023 (template reuse) — case 24', () => {
    const flags = checkDocumentDateConsistency({
      kind: 'pay_stub', file: 'stub.pdf',
      creation_date: '2023-08-10T20:22:58Z', modification_date: '2026-08-13T17:28:54Z', document_date: '2026-07-03',
    })
    expect(flags.some(f => f.code === 'pdf_created_before_document_date' && f.severity === 'high')).toBe(true)
    expect(flags.some(f => f.code === 'pdf_modified_long_after_creation')).toBe(true)
  })
  it('flags a 2026 letter created in 2024', () => {
    const flags = checkDocumentDateConsistency({
      kind: 'employment_letter', file: 'letter.pdf',
      creation_date: '2024-12-12T05:33:30Z', modification_date: '2026-08-15T13:38:06Z', document_date: '2026-08-03',
    })
    expect(flags.some(f => f.code === 'pdf_created_before_document_date')).toBe(true)
    // letters are legitimately re-saved; the revision rule is financial-only
    expect(flags.some(f => f.code === 'pdf_modified_long_after_creation')).toBe(false)
  })
  it('does NOT flag payroll pre-generation a few days before the pay date', () => {
    const flags = checkDocumentDateConsistency({
      kind: 'pay_stub', file: 'stub.pdf',
      creation_date: '2026-06-30T09:00:00Z', modification_date: '2026-06-30T09:00:00Z', document_date: '2026-07-03',
    })
    expect(flags).toHaveLength(0)
  })
  it('flags a credit report revised months after it was generated', () => {
    const flags = checkDocumentDateConsistency({
      kind: 'credit_report', file: 'eq.pdf',
      creation_date: '2026-03-27T00:30:05Z', modification_date: '2026-08-13T17:34:32Z', document_date: '2026-05-27',
    })
    expect(flags.some(f => f.code === 'pdf_modified_long_after_creation')).toBe(true)
  })
  it('stays silent when either date is missing', () => {
    expect(checkDocumentDateConsistency({ kind: 'pay_stub', file: 'x', creation_date: null, modification_date: null, document_date: '2026-07-03' })).toHaveLength(0)
    expect(checkDocumentDateConsistency({ kind: 'pay_stub', file: 'x', creation_date: '2023-08-10T00:00:00Z', modification_date: null, document_date: null })).toHaveLength(0)
  })
})

describe('checkTradelineAges', () => {
  const tl = [
    { creditor: 'ROGERS COMMUNICATION', date_opened: '2005/08/05' },
    { creditor: 'CITI CARDS HOME DEP', date_opened: '2015/01/02' },
    { creditor: 'HONDA FINANCE INC', date_opened: '2016/08/31' },
    { creditor: 'CAPITAL ONE BANK', date_opened: '2018/05/22' },
    { creditor: 'CIBC CARD SERVICES', date_opened: '2024/06/13' },
  ]
  it('case 24: four accounts opened at ages 2, 11, 13 and 15 are impossible', () => {
    const r = checkTradelineAges(tl, '2003-02-27')
    expect(r.impossible.map(x => x.age).sort((a, b) => a - b)).toEqual([2, 11, 13, 15])
    expect(r.underage).toHaveLength(0)
  })
  it('a masked bureau DOB (year only) is enough', () => {
    const r = checkTradelineAges(tl, '2003')
    expect(r.impossible).toHaveLength(4)
  })
  it('16–17 as Individual is underage; Joint/Authorized at 16–17 is not', () => {
    const r = checkTradelineAges([
      { creditor: 'A', date_opened: '2020/03/01', responsibility: 'Individual' },
      { creditor: 'B', date_opened: '2020/03/01', responsibility: 'Authorized User' },
    ], '2003-02-27')
    expect(r.underage.map(x => x.creditor)).toEqual(['A'])
    expect(r.impossible).toHaveLength(0)
  })
  it('an adult history produces nothing', () => {
    const r = checkTradelineAges(tl, '1985-06-01')
    expect(r.impossible).toHaveLength(0)
    expect(r.underage).toHaveLength(0)
  })
  it('no DOB → no verdict (never guesses)', () => {
    const r = checkTradelineAges(tl, null)
    expect(r.impossible).toHaveLength(0)
  })
})
