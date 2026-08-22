// Encrypted-PDF metadata recovery (case 24): five of six uploaded documents
// were AES-256 encrypted with an EMPTY user password — pdf-lib threw, the raw
// byte scan saw ciphertext, every metadata rule silently passed. The fixtures
// were written by pypdf with user_password='' (owner password set) and carry
// known Producer/Author/dates; readPdfMetadata must recover them for all three
// standard-security-handler generations still in the wild.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { readPdfMetadata, checkPdfMetadata } from '../lib/forensics/pdf-metadata'
import { findEncryptInfos, computeFileKey, md5, rc4 } from '../lib/forensics/pdf-decrypt'

const fixture = (name: string) => new Uint8Array(readFileSync(`tests/fixtures/${name}`))

describe('primitives', () => {
  it('md5 matches RFC 1321 vectors', () => {
    const hex = (b: Uint8Array) => Array.from(b).map(x => x.toString(16).padStart(2, '0')).join('')
    expect(hex(md5(new Uint8Array(0)))).toBe('d41d8cd98f00b204e9800998ecf8427e')
    expect(hex(md5(new TextEncoder().encode('abc')))).toBe('900150983cd24fb0d6963f7d28e17f72')
  })
  it('rc4 round-trips', () => {
    const key = new TextEncoder().encode('Key'), pt = new TextEncoder().encode('Plaintext')
    expect(Array.from(rc4(key, rc4(key, pt)))).toEqual(Array.from(pt))
  })
})

describe.each([
  ['enc-rc4-128.pdf', 3],
  ['enc-aes-128.pdf', 4],
  ['enc-aes-256.pdf', 6],
])('%s (R%i, empty user password)', (name, r) => {
  it('is recognised as encrypted and the empty password yields a file key', async () => {
    const infos = findEncryptInfos(fixture(name))
    expect(infos.length).toBeGreaterThanOrEqual(1)
    expect(infos[0].r).toBe(r)
    const key = await computeFileKey(infos[0])
    expect(key).not.toBeNull()
  })
  it('readPdfMetadata recovers the real Producer/Author/dates', async () => {
    const meta = await readPdfMetadata(fixture(name))
    expect(meta).not.toBeNull()
    expect(meta!.encrypted).toBe(true)
    expect(meta!.producer).toBe('FixtureForge 9.9')
    expect(meta!.author).toBe('Johnson Osei.')
    expect(meta!.creator).toContain('Excel')
    expect(meta!.creation_date?.slice(0, 10)).toBe('2023-08-10')
    expect(meta!.modification_date?.slice(0, 10)).toBe('2026-08-13')
  })
  it('the recovered metadata drives the case-24 rules on a pay stub', async () => {
    const meta = await readPdfMetadata(fixture(name))
    const flags = checkPdfMetadata(meta!, name, 'pay_stub')
    const codes = flags.map(f => f.code)
    expect(codes).toContain('pdf_encrypted')               // protection added by the handler, not payroll
    expect(codes).toContain('pdf_author_personal')         // "Johnson Osei."
    expect(codes).toContain('pdf_title_office_source')     // "Microsoft Word - template.docx"
    expect(codes).toContain('pdf_producer_paystub_doc_tool') // Excel on a pay stub
    expect(codes).not.toContain('pdf_metadata_stripped')
    expect(codes).not.toContain('pdf_parse_failed')        // encryption explains the strict-parser failure
  })
})

describe('readPdfTextDensity never detaches the caller\'s bytes', () => {
  it('input stays intact after extraction (pdf.js transfers the buffer it is given)', async () => {
    const { readPdfTextDensity } = await import('@/lib/forensics/pdf-text')
    const { PDFDocument, StandardFonts } = await import('pdf-lib')
    const doc = await PDFDocument.create()
    const page = doc.addPage([300, 200])
    page.drawText('hello forensics', { x: 20, y: 100, size: 18, font: await doc.embedFont(StandardFonts.Helvetica) })
    const bytes = await doc.save()
    const before = bytes.byteLength
    const d = await readPdfTextDensity(bytes)
    expect(d?.total_chars).toBeGreaterThan(0)
    expect(bytes.byteLength).toBe(before)
    expect(bytes[0]).toBe(0x25) // '%PDF' still there
  })
})
