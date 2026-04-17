// -----------------------------------------------------------------------------
// P0 — PDF Text Density Forensics (Image-PDF detection)
//
// Real bank statements, credit reports, and pay stubs are TEXT PDFs generated
// server-side: they have rich extractable text (1000-10000 chars per page).
// Forged versions are typically image PDFs: someone screenshots a real
// document, edits it in Photoshop/Preview, then exports a single image-only
// PDF. These have ZERO extractable text — the "content" is just an embedded
// raster image.
//
// We use unpdf — an edge-runtime-compatible PDF text extractor specifically
// designed for Cloudflare Workers / Vercel Edge. It returns plain text per
// page; we sum total chars and compare to page count.
//
// Thresholds (calibrated against samples of real Canadian bank/credit PDFs):
//   < 50 chars/page  → almost certainly image-only PDF (FRAUD signal)
//   < 200 chars/page → suspicious for strict kinds
//   200-1000         → low text density, possibly forged
//   1000+            → normal text PDF
// -----------------------------------------------------------------------------

import { extractText, getDocumentProxy } from 'unpdf'
import type { ForensicFlag, TextDensityResult } from './types'

const STRICT_KINDS = new Set([
  'bank_statement',
  'credit_report',
  'pay_stub',
  'employment_letter',
])

/**
 * Extract text from a PDF and compute density metrics. Returns null on
 * unparseable input.
 */
export async function readPdfTextDensity(
  bytes: ArrayBuffer | Uint8Array
): Promise<TextDensityResult | null> {
  try {
    const buf = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
    const pdf = await getDocumentProxy(buf)
    const result = await extractText(pdf, { mergePages: true })

    // unpdf returns { totalPages, text } where text can be string or string[]
    const text = Array.isArray(result.text) ? result.text.join('\n') : (result.text || '')
    const pageCount = result.totalPages || 1
    const totalChars = text.length
    const charsPerPage = pageCount > 0 ? totalChars / pageCount : 0

    return {
      total_chars: totalChars,
      page_count: pageCount,
      chars_per_page: Math.round(charsPerPage),
      is_likely_image_pdf: charsPerPage < 50,
      text_sample: text.slice(0, 500),
    }
  } catch {
    return null
  }
}

/**
 * Apply text-density heuristics. The heaviest signal is "image-only PDF"
 * for a doc that claims to be a bank statement / credit report / paystub —
 * those are server-generated text PDFs in the real world.
 */
export function checkTextDensity(
  density: TextDensityResult,
  fileSizeBytes: number,
  file: string,
  kind: string
): ForensicFlag[] {
  const flags: ForensicFlag[] = []
  const isStrict = STRICT_KINDS.has(kind)
  const sizePerPageKB = fileSizeBytes / density.page_count / 1024

  // ---------------------------------------------------------------------------
  // Rule 1: Pure image PDF for a strict kind. Suspicious but NOT conclusive
  // on its own — the document could be a legitimate scan or photo of a real
  // document. Severity is MEDIUM. If the metadata also shows a screenshot
  // tool (Quartz, Preview, Photoshop) or the PDF title says "PNG/screenshot",
  // the combination triggers the hard gate `pdf_is_screenshot` in index.ts
  // which IS conclusive.
  // ---------------------------------------------------------------------------
  if (density.is_likely_image_pdf && isStrict) {
    flags.push({
      code: 'pdf_pure_image',
      severity: 'medium',
      file,
      evidence_en: `${kind} PDF contains only ${density.chars_per_page} chars/page (essentially zero extractable text). Authentic ${kind} PDFs are usually server-generated text PDFs with 1000+ chars/page. This file may be a scan/photo of a real document, or an image of a fabricated one — check PDF Producer metadata for confirmation.`,
      evidence_zh: `${zhKind(kind)}的 PDF 每页只有 ${density.chars_per_page} 个可提取字符（几乎为零）。真实的${zhKind(kind)}通常是服务器生成的文字 PDF，每页 1000+ 字符。此文件可能是真实文件的扫描/拍照，也可能是伪造文件的图片——需结合 PDF 生成工具元数据进一步判断。`,
    })
  } else if (density.is_likely_image_pdf) {
    // Not a strict kind, but still notable
    flags.push({
      code: 'pdf_pure_image_general',
      severity: 'low',
      file,
      evidence_en: `PDF contains essentially no extractable text (${density.chars_per_page} chars/page). This is an image-based PDF.`,
      evidence_zh: `PDF 几乎没有可提取文字（每页 ${density.chars_per_page} 字符），是图片型 PDF。`,
    })
  }

  // ---------------------------------------------------------------------------
  // Rule 2: Strict kind with low (but non-zero) text density. Could be a
  // partially-OCR'd forgery or a genuinely image-heavy doc — flag as medium.
  // ---------------------------------------------------------------------------
  if (isStrict && !density.is_likely_image_pdf && density.chars_per_page < 200) {
    flags.push({
      code: 'pdf_low_text_density',
      severity: 'medium',
      file,
      evidence_en: `${kind} PDF has only ${density.chars_per_page} extractable chars/page — well below the 1000+ chars/page typical of authentic ${kind} PDFs. Possible OCR forgery or scanned re-print.`,
      evidence_zh: `${zhKind(kind)}的 PDF 每页只有 ${density.chars_per_page} 个可提取字符——远低于真实${zhKind(kind)}通常的 1000+ 字符/页。可能是 OCR 伪造或扫描重印。`,
    })
  }

  // ---------------------------------------------------------------------------
  // Rule 3: Large file size + low text density = embedded high-res image.
  // Real text PDFs are tiny (10-50 KB/page); image PDFs are 100+ KB/page.
  // ---------------------------------------------------------------------------
  if (isStrict && sizePerPageKB > 150 && density.chars_per_page < 500) {
    flags.push({
      code: 'pdf_oversized_for_text',
      severity: 'medium',
      file,
      evidence_en: `PDF is ${Math.round(sizePerPageKB)} KB/page with only ${density.chars_per_page} chars/page. Authentic text-PDF ${kind} files are 10-50 KB/page. Large size + sparse text = embedded image.`,
      evidence_zh: `PDF 每页 ${Math.round(sizePerPageKB)} KB 但每页只有 ${density.chars_per_page} 字符。真实的文字型${zhKind(kind)} PDF 每页 10-50 KB。文件大且文字少 = 内嵌图片。`,
    })
  }

  return flags
}

function zhKind(kind: string): string {
  switch (kind) {
    case 'bank_statement': return '银行对账单'
    case 'credit_report': return '信用报告'
    case 'pay_stub': return '工资单'
    case 'employment_letter': return '雇佣证明信'
    case 'id_document': return '身份证件'
    case 'reference': return '推荐信'
    case 'offer_letter': return 'Offer Letter'
    default: return '官方文件'
  }
}
