// A scan is a scan. When an image-only PDF has been OCR'd and the recovered
// text identifies the issuer (bank fingerprint, bureau markers, CRA notice…),
// the metadata-only notes that exist to catch a re-saved or image-assembled
// file — "producer not whitelisted", "big file, no text", "unusually short"
// — are describing the scanner, not the document. They come off and one
// info line says what the OCR found. Metadata that proves editing (consumer
// image tools, incremental updates) is untouched.
import type { ForensicFlag, OcrResult, SourceSpecificResult } from './types'

const SCAN_ONLY_CODES = new Set(['pdf_oversized_for_text', 'pdf_unusually_short', 'pdf_producer_unknown'])

const KIND_HINTS: Record<string, RegExp> = {
  bank_statement: /statement|account|bank|banque|relev/i,
  credit_report: /credit\s*(report|file|score)|equifax|transunion|bureau/i,
  pay_stub: /pay\s*(stub|slip|statement)|earnings|payslip/i,
  employment_letter: /employment|letter|offer/i,
  id_document: /licen[cs]e|passport|permanent\s+resident|health\s+card|photo\s+card|identity/i,
  other: /notice\s+of\s+assessment|t4|cra|revenue/i,
}

export function reconcileScanFlags(flags: ForensicFlag[], file: string, kind: string, ocr: OcrResult | null | undefined, src: SourceSpecificResult | null | undefined): ForensicFlag[] {
  if (!ocr || (ocr.text || '').length < 200) return flags
  const issuer =
    (src?.matched_bank ? `${src.matched_bank} statement` : null) ??
    (src?.equifax_authentic_markers === true ? 'credit bureau report' : null) ??
    (ocr.visible_issuer && KIND_HINTS[kind]?.test(`${ocr.apparent_doc_type} ${ocr.visible_issuer}`) ? `${ocr.apparent_doc_type} (${ocr.visible_issuer})` : null) ??
    (KIND_HINTS[kind]?.test(ocr.apparent_doc_type || '') ? ocr.apparent_doc_type : null)
  if (!issuer) return flags
  const kept = flags.filter(f => !SCAN_ONLY_CODES.has(f.code))
  if (kept.length === flags.length) return flags
  kept.push({
    code: 'scan_content_recognized',
    severity: 'info',
    file,
    evidence_en: `Image-only PDF; OCR recovered ${ocr.text.length} characters and identifies it as a ${issuer}. File-size and producer notes that only apply to text PDFs were withdrawn; the content was checked like any other document. Structure-level forensics (fonts, incremental saves) do not apply to a scan.`,
    evidence_zh: `图片型 PDF；OCR 读出 ${ocr.text.length} 个字符，内容识别为 ${issuer}。只适用于文字型 PDF 的文件大小 / 生成器提示已撤销，内容按正常文件核对。扫描件不适用结构层取证（字体、增量保存）。`,
  })
  return kept
}
