// Regression guards from case 23 (2026-08-20): two GENUINE co-applicant
// Equifax consumer downloads were hard-gated as forgery by two rules whose
// premises were empirically wrong:
//   1. "credit bureaus never use pdf-lib" — Equifax Canada's consumer portal
//      renders its download PDFs client-side WITH pdf-lib (verified against a
//      known-genuine download from a separate applicant and date).
//   2. timestamp clustering treated two credit reports created 42s apart as
//      batch forgery — but credit reports are point-in-time snapshots;
//      co-applicants downloading their own reports in one sitting is the
//      expected honest behavior.
import { describe, expect, it } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { checkPdfStructure } from '../lib/forensics/pdf-structure'
import { checkTimestampClustering } from '../lib/forensics/cross-doc'

// A minimal pdf-lib-produced PDF — same Producer fingerprint shape as a real
// Equifax consumer download (pdf-lib writes itself into Producer/Creator).
async function makePdflibPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.addPage([595.28, 841.89])
  return doc.save()
}

const EQUIFAX_PORTAL_TEXT = [
  'Equifax Canada Co.',
  'www.consumer.equifax.ca',
  'RE: EQUIFAX REFERENCE NUMBER: 4334684448',
  'Further to your request, a copy of your personal credit file as of 2026/07/25 follows:',
  'https://www.equifax.ca/personal/dispute-credit-report',
].join('\n')

describe('pdf-structure: pdf-lib on credit reports', () => {
  it('does NOT raise a high flag when content matches the Equifax consumer-portal fingerprint', async () => {
    const bytes = await makePdflibPdf()
    const { flags } = await checkPdfStructure(
      bytes, 'efx-creditreport_20260725.pdf', 'credit_report',
      EQUIFAX_PORTAL_TEXT, 'pdf-lib (https://github.com/Hopding/pdf-lib)',
    )
    expect(flags.some(f => f.code === 'pdf_structure_pdflib_detected')).toBe(false)
    const disclosure = flags.find(f => f.code === 'pdf_structure_pdflib_bureau_portal')
    expect(disclosure).toBeDefined()
    expect(disclosure!.severity).toBe('info')
    // The disclosure must NOT claim the document is verified authentic —
    // only that the producer signal is uninformative for this portal.
    expect(disclosure!.evidence_en).toMatch(/cannot distinguish/i)
  })

  it('still raises the high flag when a pdf-lib credit report lacks bureau-portal markers', async () => {
    const bytes = await makePdflibPdf()
    const { flags } = await checkPdfStructure(
      bytes, 'credit-report.pdf', 'credit_report',
      'Credit Report for JOHN DOE\nScore: 800\nAccounts in good standing.',
      'pdf-lib (https://github.com/Hopding/pdf-lib)',
    )
    expect(flags.some(f => f.code === 'pdf_structure_pdflib_detected')).toBe(true)
  })

  it('a single stray bureau mention does not qualify as a portal fingerprint', async () => {
    const bytes = await makePdflibPdf()
    const { flags } = await checkPdfStructure(
      bytes, 'credit-report.pdf', 'credit_report',
      'Credit Report\nYou can also order your file from Equifax Canada Co. by mail.',
      'pdf-lib (https://github.com/Hopding/pdf-lib)',
    )
    expect(flags.some(f => f.code === 'pdf_structure_pdflib_detected')).toBe(true)
    expect(flags.some(f => f.code === 'pdf_structure_pdflib_bureau_portal')).toBe(false)
  })

  it('bank statements with pdf-lib keep the high flag (portal carve-out is credit_report only)', async () => {
    const bytes = await makePdflibPdf()
    const { flags } = await checkPdfStructure(
      bytes, 'statement.pdf', 'bank_statement',
      EQUIFAX_PORTAL_TEXT, 'pdf-lib (https://github.com/Hopding/pdf-lib)',
    )
    expect(flags.some(f => f.code === 'pdf_structure_pdflib_detected')).toBe(true)
  })
})

describe('timestamp clustering: credit reports are point-in-time documents', () => {
  it('two credit reports created 42s apart do NOT flag (co-applicants download together)', () => {
    const flags = checkTimestampClustering([
      { file_name: 'efx-a.pdf', file_kind: 'credit_report', creation_date: '2026-07-25T14:29:12Z' },
      { file_name: 'efx-b.pdf', file_kind: 'credit_report', creation_date: '2026-07-25T14:29:54Z' },
    ])
    expect(flags.filter(f => f.code === 'timestamp_batch_creation')).toHaveLength(0)
  })

  it('pay stubs batch-created within minutes still flag', () => {
    const flags = checkTimestampClustering([
      { file_name: 'stub-march.pdf', file_kind: 'pay_stub', creation_date: '2026-07-25T14:29:12Z' },
      { file_name: 'stub-april.pdf', file_kind: 'pay_stub', creation_date: '2026-07-25T14:30:02Z' },
      { file_name: 'stub-may.pdf', file_kind: 'pay_stub', creation_date: '2026-07-25T14:31:44Z' },
    ])
    expect(flags.some(f => f.code === 'timestamp_batch_creation')).toBe(true)
  })

  it('credit reports mixed in do not drag pay stubs into a cluster they alone would not form', () => {
    const flags = checkTimestampClustering([
      { file_name: 'efx-a.pdf', file_kind: 'credit_report', creation_date: '2026-07-25T14:29:12Z' },
      { file_name: 'stub.pdf', file_kind: 'pay_stub', creation_date: '2026-07-25T14:30:00Z' },
    ])
    expect(flags.filter(f => f.code === 'timestamp_batch_creation')).toHaveLength(0)
  })
})
