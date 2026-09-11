// Regression guards from the 2026-09-11 Scotiabank case: three GENUINE
// Scotiabank chequing statements (downloaded from online banking in one
// sitting) were hard-gated as forgery by three rules that misread the
// bank's statement engine as a person's desktop tool:
//   1. Scotiabank's producer whitelist only knew iText — its archive is
//      rendered by Crawford Technologies PRO ("CrawfordTech PDF Driver",
//      Creator "PRO HLCAPI"); Scotiabank is a listed CrawfordTech customer
//      and the same fingerprint sits on genuine CIBC statements in prod.
//   2. Author "Pro API" (the engine's own stamp) matched the personal-name
//      regex.
//   3. Three statements created 2 minutes apart were "batch forgery" —
//      on-demand rendering stamps CreationDate at download time.
// Plus: penny-perfect deposit == paystub net was called suspicious; direct
// deposit is exactly the net figure, so it corroborates instead.
import { describe, expect, it } from 'vitest'
import { checkSourceSpecific, detectStatementEngine } from '../lib/forensics/source-specific'
import { checkPdfMetadata } from '../lib/forensics/pdf-metadata'
import { checkTimestampClustering, runCrossDocChecks } from '../lib/forensics/cross-doc'
import type { PdfMetadataResult, TextDensityResult } from '../lib/forensics/types'

const SCOTIA_META: PdfMetadataResult = {
  title: 'PRO Document',
  author: 'Pro API',
  subject: '',
  producer: 'CrawfordTech PDF Driver Version 5.1 64 Bit Build ID 7361 on March 09, 2022 at 20:00:30',
  creator: 'PRO HLCAPI',
  creation_date: '2026-06-08T21:38:42Z',
  modification_date: '2026-06-08T21:38:42Z',
  page_count: 2,
  file_size_bytes: 89_000,
} as PdfMetadataResult

const SCOTIA_TEXT: TextDensityResult = {
  total_chars: 2781,
  page_count: 2,
  chars_per_page: 1391,
  is_likely_image_pdf: false,
  text_sample: 'Scotiabank  Preferred Package  Statement of account  The Bank of Nova Scotia  MR CARLOS RODRIGUEZ and PATRICIA PEREIRA PEREZ  May 1 to May 30 2026',
}

describe('bank statement composition engines', () => {
  it('recognises CrawfordTech PRO from producer or creator', () => {
    expect(detectStatementEngine('CrawfordTech PDF Driver Version 5.1')).toBe('CrawfordTech PRO')
    expect(detectStatementEngine('PRO HLCAPI')).toBe('CrawfordTech PRO')
    expect(detectStatementEngine('iText 7.1.9 ©2000-2020 iText Group NV')).toBeNull()
    expect(detectStatementEngine('Microsoft: Print To PDF')).toBeNull()
  })

  it('does NOT flag a Scotiabank statement rendered by CrawfordTech as a producer mismatch', () => {
    const { result, flags } = checkSourceSpecific(SCOTIA_META, SCOTIA_TEXT, 'MAY 2026 CRR.pdf', 'bank_statement')
    expect(result.matched_bank).toBe('Scotiabank')
    expect(result.bank_producer_whitelisted).toBe(true)
    expect(result.statement_engine).toBe('CrawfordTech PRO')
    expect(flags.some(f => f.code === 'bank_producer_mismatch')).toBe(false)
  })

  it('still flags a Scotiabank statement written by a desktop tool', () => {
    const meta = { ...SCOTIA_META, producer: 'macOS Version 14.5 (Build 23F79) Quartz PDFContext', creator: 'Preview', author: '' }
    const { result, flags } = checkSourceSpecific(meta, SCOTIA_TEXT, 'fake.pdf', 'bank_statement')
    expect(result.statement_engine).toBeNull()
    expect(flags.some(f => f.code === 'bank_producer_mismatch')).toBe(true)
  })
})

describe('pdf_author_personal', () => {
  it('does not treat a product stamp like "Pro API" as a personal author', () => {
    const flags = checkPdfMetadata(SCOTIA_META, 'MAY 2026 CRR.pdf', 'bank_statement')
    expect(flags.some(f => f.code === 'pdf_author_personal')).toBe(false)
    expect(flags.some(f => f.code === 'pdf_producer_unknown')).toBe(false)
  })

  it('still flags a real personal name on a financial document (case 24)', () => {
    const meta = { ...SCOTIA_META, author: 'Johnson Osei.', producer: 'Crystal Reports', creator: 'Crystal Reports' }
    const flags = checkPdfMetadata(meta, 'stub.pdf', 'pay_stub')
    expect(flags.some(f => f.code === 'pdf_author_personal')).toBe(true)
  })
})

describe('timestamp clustering', () => {
  const three = (engine: string | null) => [
    { file_name: 'MAY 2026 CRR.pdf', file_kind: 'bank_statement', creation_date: '2026-06-08T21:38:42Z', enterprise_system: engine },
    { file_name: 'APRIL 2026 CRR.pdf', file_kind: 'bank_statement', creation_date: '2026-06-08T21:40:14Z', enterprise_system: engine },
    { file_name: 'MARCH 2026 CRR.pdf', file_kind: 'bank_statement', creation_date: '2026-06-08T21:40:39Z', enterprise_system: engine },
  ]
  it('exempts statements rendered by the bank\'s own engine when downloaded in one sitting', () => {
    const flags = checkTimestampClustering(three('CrawfordTech PRO (Scotiabank statement engine)'))
    expect(flags.some(f => f.code === 'timestamp_batch_creation')).toBe(false)
  })
  it('still flags the same cluster when no portal origin is known', () => {
    const flags = checkTimestampClustering(three(null))
    expect(flags.some(f => f.code === 'timestamp_batch_creation')).toBe(true)
  })
})

describe('deposits vs paystub net', () => {
  it('reads a penny-perfect match as corroboration, not suspicion', () => {
    const { result, flags } = runCrossDocChecks({
      files: [
        { name: 'Paystub#1.pdf', kind: 'pay_stub', paystub: { period_net: 6954.83 } as never },
        { name: 'Paystub#2.pdf', kind: 'pay_stub', paystub: { period_net: 6954.83 } as never },
        { name: 'MAY 2026 CRR.pdf', kind: 'bank_statement', text_sample: 'May 15 Payroll dep. 6,954.83 Osv-Payroll  May 29 Payroll dep. 6,954.83 Osv Solutions Canada Inc' },
      ],
    })
    expect(result.deposit_paystub_perfect_match).toBe(true)
    expect(flags.some(f => f.code === 'deposits_too_clean')).toBe(false)
    const corroboration = flags.find(f => f.code === 'deposits_match_paystub_net')
    expect(corroboration?.severity).toBe('info')
  })
})
