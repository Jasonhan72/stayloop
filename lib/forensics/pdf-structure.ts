// -----------------------------------------------------------------------------
// P0 — PDF Structural Analysis (Image DPI / Fonts / Date Gap)
//
// Three zero-cost checks derived from the PDF's internal object tree:
//   1. Image DPI: enumerate image XObjects, compute effective DPI (pixel width
//      divided by median page width in inches). Scans are 150-300 DPI; phone
//      screenshots are typically 72-110 DPI. Low DPI for a "bank statement"
//      image PDF = screenshot-of-a-screenshot signal.
//   2. Font diversity: count distinct BaseFont names. Real server-generated
//      PDFs use 1-3 fonts consistently. Copy-paste forgeries often end up
//      with 6+ fonts because different sources carry different embedded subsets.
//   3. Mod/creation date gap: if ModDate >> CreationDate (>1 hour), the PDF
//      was edited AFTER the original file was produced. Real bank PDFs get
//      CreationDate == ModDate at generation time. A non-trivial gap is a
//      reliable "edited later in a PDF editor" signal.
//
// All three are runnable on the bytes we already fetched; no extra network
// cost. Uses only pdf-lib internals (already a dep, edge-runtime compatible).
// -----------------------------------------------------------------------------

import { PDFDocument, PDFDict, PDFStream, PDFName, PDFNumber } from 'pdf-lib'
import type { ForensicFlag, PdfStructureResult } from './types'

const STRICT_KINDS = new Set([
  'bank_statement',
  'credit_report',
  'pay_stub',
  'employment_letter',
])

/**
 * Extract image DPI stats + font set + date gap from a PDF.
 * Returns null if the PDF can't be parsed.
 */
export async function readPdfStructure(
  bytes: ArrayBuffer | Uint8Array
): Promise<PdfStructureResult | null> {
  try {
    const buf = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
    const doc = await PDFDocument.load(buf, {
      ignoreEncryption: true,
      throwOnInvalidObject: false,
    })

    // Median page width in points (1 in = 72 pt). Median is robust to
    // outlier pages (e.g. one landscape cover page).
    const pageWidthsPts = doc.getPages().map(p => p.getWidth()).filter(w => w > 0)
    const medianWidthPts = pageWidthsPts.length ? median(pageWidthsPts) : 612
    const medianWidthInches = medianWidthPts / 72

    // Walk all indirect objects to find Image XObjects and Fonts.
    const imageDetails: Array<{ width: number; height: number }> = []
    const baseFonts = new Set<string>()
    let fontObjectCount = 0

    for (const [, obj] of doc.context.enumerateIndirectObjects()) {
      let dict: PDFDict | null = null
      if (obj instanceof PDFDict) dict = obj
      else if (obj instanceof PDFStream) dict = obj.dict
      if (!dict) continue

      const typeObj = dict.get(PDFName.Type)
      const typeName = typeObj instanceof PDFName ? typeObj.asString() : ''

      if (typeName === '/Font') {
        fontObjectCount++
        const baseFont = dict.get(PDFName.of('BaseFont'))
        if (baseFont instanceof PDFName) {
          // pdf-lib's asString() includes the leading slash. Also strip the
          // 6-char subset prefix "ABCDEF+FontName" that embedded subsets use.
          const fontName = baseFont.asString()
            .replace(/^\//, '')
            .replace(/^[A-Z]{6}\+/, '')
          if (fontName) baseFonts.add(fontName)
        }
      } else if (typeName === '/XObject') {
        const subtype = dict.get(PDFName.of('Subtype'))
        const subName = subtype instanceof PDFName ? subtype.asString() : ''
        if (subName === '/Image') {
          const w = dict.get(PDFName.of('Width'))
          const h = dict.get(PDFName.of('Height'))
          const width = w instanceof PDFNumber ? w.asNumber() : NaN
          const height = h instanceof PDFNumber ? h.asNumber() : NaN
          if (isFinite(width) && isFinite(height) && width > 1 && height > 1) {
            imageDetails.push({ width, height })
          }
        }
      }
    }

    // DPI estimate per image = pixel width / page width in inches.
    // This assumes the image roughly fills the page width, which is typical
    // for image-only PDFs (one big image per page). It's a lower bound — if
    // the image is cropped in, actual DPI is higher.
    const dpiEstimates = imageDetails
      .map(img => img.width / medianWidthInches)
      .filter(d => isFinite(d) && d > 0)

    const dpiStats = dpiEstimates.length > 0 ? {
      min: Math.round(Math.min(...dpiEstimates)),
      max: Math.round(Math.max(...dpiEstimates)),
      median: Math.round(median(dpiEstimates)),
    } : null

    // Largest image (by area) for evidence citations.
    const largestImage = imageDetails.length > 0
      ? imageDetails.reduce((a, b) =>
          a.width * a.height > b.width * b.height ? a : b
        )
      : null

    // Creation → Modification gap in hours.
    const creation = doc.getCreationDate()
    const mod = doc.getModificationDate()
    let modGapHours: number | null = null
    if (creation && mod) {
      modGapHours = (mod.getTime() - creation.getTime()) / (1000 * 60 * 60)
    }

    return {
      unique_fonts: baseFonts.size,
      fonts: [...baseFonts].slice(0, 20),
      font_object_count: fontObjectCount,
      image_count: imageDetails.length,
      dpi_stats: dpiStats,
      largest_image_px: largestImage,
      median_page_width_pts: Math.round(medianWidthPts),
      mod_creation_gap_hours: modGapHours,
    }
  } catch {
    return null
  }
}

/**
 * Apply structural heuristics. Returns low-to-medium severity flags only —
 * none of these trigger hard gates on their own; they augment the AI's
 * overall scoring via forensicsToPromptBlock().
 */
export function checkPdfStructure(
  s: PdfStructureResult,
  file: string,
  kind: string,
): ForensicFlag[] {
  const flags: ForensicFlag[] = []
  const isStrict = STRICT_KINDS.has(kind)

  // ---------------------------------------------------------------------------
  // Rule 1: Low-DPI embedded image for a strict document kind.
  //   < 110 DPI   -> screenshot-resolution, not a real scan
  //   110-150 DPI -> ambiguous, skip
  //   150+  DPI   -> consistent with flatbed or phone-camera scan
  // ---------------------------------------------------------------------------
  if (isStrict && s.dpi_stats && s.image_count > 0) {
    const dpi = s.dpi_stats.median
    if (dpi > 0 && dpi < 110) {
      const pxLabel = s.largest_image_px
        ? `${s.largest_image_px.width}x${s.largest_image_px.height}px`
        : ''
      const pageInches = Math.round((s.median_page_width_pts / 72) * 10) / 10
      flags.push({
        code: 'pdf_low_dpi_scan',
        severity: 'medium',
        file,
        evidence_en: `Embedded image in ${kind} PDF has effective ~${dpi} DPI (${pxLabel} on a ${pageInches}" page). Real scans are 150-300 DPI; this is screenshot-resolution (72-110 DPI), consistent with a re-exported screen capture rather than a flatbed or document scanner.`,
        evidence_zh: `${zhKind(kind)} PDF 的嵌入图片有效分辨率约 ${dpi} DPI（${pxLabel}，页面宽约 ${pageInches} 英寸）。真实扫描通常 150-300 DPI，此处属于屏幕截图级别（72-110 DPI），与重新导出的截图一致，不像是扫描仪或拍照文件。`,
      })
    }
  }

  // ---------------------------------------------------------------------------
  // Rule 2: High font diversity. Real server-generated PDFs use a small
  // consistent font set (often 2-4 fonts: headings, body, mono for numbers).
  // Copy-pasted forgeries accumulate fonts from each source document.
  // ---------------------------------------------------------------------------
  if (isStrict && s.unique_fonts >= 7) {
    const sample = s.fonts.slice(0, 8).join(', ')
    const sampleZh = s.fonts.slice(0, 8).join('、')
    flags.push({
      code: 'pdf_font_count_high',
      severity: 'low',
      file,
      evidence_en: `PDF uses ${s.unique_fonts} distinct fonts (${sample}${s.fonts.length > 8 ? ', ...' : ''}). Real ${kind} PDFs typically use 2-4 fonts. Many fonts often indicate content copy-pasted from multiple source documents.`,
      evidence_zh: `PDF 使用了 ${s.unique_fonts} 种不同字体（${sampleZh}${s.fonts.length > 8 ? '…' : ''}）。真实的${zhKind(kind)}通常只用 2-4 种字体。字体种类多通常意味着内容来自多个不同文件的拼贴。`,
    })
  }

  // ---------------------------------------------------------------------------
  // Rule 3: Modification date significantly after creation date.
  // Real server-generated PDFs have ModDate == CreationDate (or within seconds).
  // A gap of hours/days = the file was opened in an editor and re-saved.
  // ---------------------------------------------------------------------------
  if (isStrict && s.mod_creation_gap_hours !== null) {
    const gap = s.mod_creation_gap_hours
    if (gap > 24) {
      const days = Math.round(gap / 24)
      flags.push({
        code: 'pdf_modified_long_after',
        severity: 'medium',
        file,
        evidence_en: `PDF ModDate is ${Math.round(gap)}h after CreationDate (~${days} day${days === 1 ? '' : 's'}). Authentic ${kind} PDFs have matching timestamps (generated once, never edited). A ${days}-day gap indicates the file was opened in a PDF editor and re-saved after original generation.`,
        evidence_zh: `PDF 的修改时间比创建时间晚 ${Math.round(gap)} 小时（约 ${days} 天）。真实的${zhKind(kind)}创建后不会再修改，时间戳应一致。出现 ${days} 天的间隔说明文件被重新打开编辑后保存。`,
      })
    } else if (gap > 1) {
      const hours = Math.round(gap * 10) / 10
      flags.push({
        code: 'pdf_modified_after_creation',
        severity: 'low',
        file,
        evidence_en: `PDF was modified ${hours}h after creation. Authentic ${kind} PDFs are not typically re-saved after initial generation.`,
        evidence_zh: `PDF 在创建后 ${hours} 小时被修改。真实的${zhKind(kind)}通常生成后不会再次保存。`,
      })
    }
  }

  return flags
}

function median(arr: number[]): number {
  if (!arr.length) return 0
  const sorted = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2
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
