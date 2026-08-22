// -----------------------------------------------------------------------------
// 2026-06-03 — Build hardening — defer unpdf import.
//
// PROBLEM
//   `unpdf` ships ~1.6 MB of un-minified JS (the bundled pdf.js engine).
//   Importing it at the top of this file causes EVERY edge route whose
//   import-graph reaches lib/forensics to bundle the entire engine. With
//   the latest agent-tools barrel, that included /api/agent/chat,
//   /api/screen-score and /api/deep-check — pushing each individual worker
//   close to the Cloudflare Workers 1 MiB compressed-bundle limit.
//
// FIX
//   Switch the top-level static import to a function-local dynamic import
//   inside readPdfTextDensity(). The pdf.js engine is only loaded when a
//   request actually needs to score a PDF — agent-chat turns that never
//   call run_pdf_forensics never pay the bundle/parse cost.
//
//   Turbopack code-splits the dynamic import into its own chunk, which
//   Cloudflare Pages loads on demand the first time the worker invokes
//   it. Subsequent calls inside the same warm worker reuse the cached
//   module reference.
//
// CONTRACT UNCHANGED
//   readPdfTextDensity / checkTextDensity exports are identical, just
//   async-loaded internally. Callers were already awaiting the function,
//   so the additional one-time module-load latency (~5 ms) is below the
//   PDF parse cost itself (~100-500 ms for real bank statements).
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

import type { ForensicFlag, TextDensityResult } from './types'

const STRICT_KINDS = new Set([
  'bank_statement',
  'credit_report',
  'pay_stub',
  'employment_letter',
])

// Cached dynamic-import promise so we only load the pdf.js engine once per
// warm worker. Subsequent calls re-await the resolved module.
let _unpdfPromise: Promise<typeof import('unpdf')> | null = null

// ---------------------------------------------------------------------------
// Edge-runtime polyfills for pdf.js.
//
// Production evidence (2026-08-21): 0 of 275 files in 45 days ever carried
// text_density. The admin diagnostic returned the real reason —
//   "Serverless PDF.js bundle could not be resolved: ReferenceError:
//    DOMMatrix is not defined"
// — pdf.js touches the browser's DOMMatrix (and Path2D/ImageData) at module
// load, which Cloudflare Workers do not provide. Text extraction itself never
// needs them (getTextContent works on plain transform arrays), so a small
// 2-D affine DOMMatrix plus inert Path2D/ImageData stand-ins are enough to
// let the bundle load. Installed only when the globals are missing.
// ---------------------------------------------------------------------------
// next-on-pages wraps every route chunk as `(self, globalThis, global) => …`
// and passes a per-route proxy, so `globalThis.DOMMatrix = …` lands on the
// proxy — while pdf.js's module-level `let x = new DOMMatrix` is a bare
// identifier resolved against the REAL V8 global, which never sees it
// (diagnosed 2026-08-21: the proxy reported DOMMatrix === 'function' and the
// bundle still threw "DOMMatrix is not defined"). The standard way to reach
// the real global without eval/Function (both disallowed in Workers) is the
// globalThis-proposal polyfill trick: a temporary Object.prototype getter
// whose `this` is the receiver of a bare-identifier lookup.
declare const __stayloop_real_global__: Record<string, unknown>
export function getRealGlobal(): Record<string, unknown> {
  const fallback = globalThis as unknown as Record<string, unknown>
  const key = '__stayloop_real_global__'
  try {
    Object.defineProperty(Object.prototype, key, { get() { return this }, configurable: true })
    try {
      const g = __stayloop_real_global__
      return (g && typeof g === 'object') ? g : fallback
    } finally {
      delete (Object.prototype as unknown as Record<string, unknown>)[key]
    }
  } catch {
    return fallback
  }
}

export function installPdfjsPolyfills(): void {
  installPdfjsPolyfillsOn(globalThis as unknown as Record<string, unknown>)
  const real = getRealGlobal()
  if (real !== (globalThis as unknown)) installPdfjsPolyfillsOn(real)
}

function installPdfjsPolyfillsOn(g: Record<string, unknown>): void {
  if (typeof g.DOMMatrix === 'undefined') {
    class DOMMatrixPolyfill {
      a = 1; b = 0; c = 0; d = 1; e = 0; f = 0
      constructor(init?: number[] | string | DOMMatrixPolyfill) {
        if (Array.isArray(init) && init.length >= 6) {
          const [a, b, c, d, e, f] = init.length === 16 ? [init[0], init[1], init[4], init[5], init[12], init[13]] : init
          this.a = a; this.b = b; this.c = c; this.d = d; this.e = e; this.f = f
        } else if (init && typeof init === 'object') {
          const m = init as DOMMatrixPolyfill
          this.a = m.a; this.b = m.b; this.c = m.c; this.d = m.d; this.e = m.e; this.f = m.f
        }
      }
      get is2D() { return true }
      get isIdentity() { return this.a === 1 && this.b === 0 && this.c === 0 && this.d === 1 && this.e === 0 && this.f === 0 }
      get m11() { return this.a } get m12() { return this.b } get m21() { return this.c } get m22() { return this.d } get m41() { return this.e } get m42() { return this.f }
      multiply(o: DOMMatrixPolyfill) {
        return new DOMMatrixPolyfill([
          this.a * o.a + this.c * o.b, this.b * o.a + this.d * o.b,
          this.a * o.c + this.c * o.d, this.b * o.c + this.d * o.d,
          this.a * o.e + this.c * o.f + this.e, this.b * o.e + this.d * o.f + this.f,
        ])
      }
      multiplySelf(o: DOMMatrixPolyfill) { const r = this.multiply(o); Object.assign(this, { a: r.a, b: r.b, c: r.c, d: r.d, e: r.e, f: r.f }); return this }
      preMultiplySelf(o: DOMMatrixPolyfill) { const r = o.multiply(this); Object.assign(this, { a: r.a, b: r.b, c: r.c, d: r.d, e: r.e, f: r.f }); return this }
      translate(tx = 0, ty = 0) { return this.multiply(new DOMMatrixPolyfill([1, 0, 0, 1, tx, ty])) }
      translateSelf(tx = 0, ty = 0) { return this.multiplySelf(new DOMMatrixPolyfill([1, 0, 0, 1, tx, ty])) }
      scale(sx = 1, sy = sx) { return this.multiply(new DOMMatrixPolyfill([sx, 0, 0, sy, 0, 0])) }
      scaleSelf(sx = 1, sy = sx) { return this.multiplySelf(new DOMMatrixPolyfill([sx, 0, 0, sy, 0, 0])) }
      inverse() {
        const det = this.a * this.d - this.b * this.c
        if (!det) return new DOMMatrixPolyfill([NaN, NaN, NaN, NaN, NaN, NaN])
        return new DOMMatrixPolyfill([this.d / det, -this.b / det, -this.c / det, this.a / det, (this.c * this.f - this.d * this.e) / det, (this.b * this.e - this.a * this.f) / det])
      }
      invertSelf() { const r = this.inverse(); Object.assign(this, { a: r.a, b: r.b, c: r.c, d: r.d, e: r.e, f: r.f }); return this }
      transformPoint(p: { x?: number; y?: number } = {}) { const x = p.x ?? 0, y = p.y ?? 0; return { x: this.a * x + this.c * y + this.e, y: this.b * x + this.d * y + this.f, z: 0, w: 1 } }
      toFloat32Array() { return new Float32Array([this.a, this.b, 0, 0, this.c, this.d, 0, 0, 0, 0, 1, 0, this.e, this.f, 0, 1]) }
      toFloat64Array() { return new Float64Array(this.toFloat32Array()) }
      toString() { return `matrix(${this.a}, ${this.b}, ${this.c}, ${this.d}, ${this.e}, ${this.f})` }
    }
    g.DOMMatrix = DOMMatrixPolyfill
  }
  if (typeof g.Path2D === 'undefined') {
    g.Path2D = class Path2DPolyfill { addPath() {} closePath() {} moveTo() {} lineTo() {} bezierCurveTo() {} quadraticCurveTo() {} arc() {} arcTo() {} ellipse() {} rect() {} roundRect() {} }
  }
  if (typeof g.ImageData === 'undefined') {
    g.ImageData = class ImageDataPolyfill {
      data: Uint8ClampedArray; width: number; height: number
      constructor(a: number | Uint8ClampedArray, b: number, c?: number) {
        if (typeof a === 'number') { this.width = a; this.height = b; this.data = new Uint8ClampedArray(a * b * 4) }
        else { this.data = a; this.width = b; this.height = c ?? (a.length / 4 / b) }
      }
    }
  }
}
/** The last extraction failure (message), for the admin diagnostic route —
 *  readPdfTextDensity itself stays silent so a pdf.js hiccup never fails a
 *  screening, but "silent" must not mean "invisible". */
export let lastTextExtractError: string | null = null
// Install at MODULE EVALUATION too: if the bundler inlines the pdf.js chunk
// so that it is evaluated at worker boot, the call-time install above would
// come too late. Top-level + call-time covers both shapes.
try { installPdfjsPolyfills() } catch { /* never fatal */ }

/** For the admin diagnostic route. */
export function pdfTextDebugInfo(): Record<string, unknown> {
  const g = globalThis as unknown as Record<string, unknown>
  const real = getRealGlobal()
  return {
    DOMMatrix: typeof g.DOMMatrix, Path2D: typeof g.Path2D, ImageData: typeof g.ImageData, OffscreenCanvas: typeof g.OffscreenCanvas,
    realGlobalIsGlobalThis: real === (globalThis as unknown),
    real_DOMMatrix: typeof real.DOMMatrix, real_Path2D: typeof real.Path2D, real_ImageData: typeof real.ImageData,
    lastError: lastTextExtractError,
  }
}

function loadUnpdf(): Promise<typeof import('unpdf')> {
  if (!_unpdfPromise) {
    installPdfjsPolyfills()
    _unpdfPromise = import('unpdf')
  }
  return _unpdfPromise
}

/**
 * Extract text from a PDF and compute density metrics. Returns null on
 * unparseable input.
 */
export async function readPdfTextDensity(
  bytes: ArrayBuffer | Uint8Array
): Promise<TextDensityResult | null> {
  try {
    const { extractText, getDocumentProxy } = await loadUnpdf()
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
      // Keep up to 50k chars so source-specific marker checks (Equifax,
      // TransUnion, bank names) can scan deep into bundled multi-document
      // PDFs where the relevant content sits past the cover page. Real
      // landlord-supplied "Supporting Documents.pdf" packets routinely have
      // the credit report start on page 6+ — a 2000-char sample never sees it.
      text_sample: text.slice(0, 50000),
    }
  } catch (e) {
    lastTextExtractError = `${(e as Error)?.name || 'Error'}: ${(e as Error)?.message || String(e)}`.slice(0, 400)
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
  kind: string,
  producer?: string,
  creator?: string,
): ForensicFlag[] {
  const flags: ForensicFlag[] = []
  const isStrict = STRICT_KINDS.has(kind)
  const sizePerPageKB = fileSizeBytes / density.page_count / 1024

  // ---------------------------------------------------------------------------
  // Rule 1: Pure image PDF. Before flagging, check if the producer is a
  // legitimate scan/print tool (iOS Notes, CamScanner, Print to PDF, etc.).
  // Scanned physical documents are common and NOT suspicious on their own.
  // Only flag if the producer is an editing tool or unknown.
  // ---------------------------------------------------------------------------
  const producerStr = `${producer || ''} ${creator || ''}`.toLowerCase()
  const isLegitScanTool = /quartz\s*pdfcontext|print\s*to\s*pdf|camscanner|adobe\s*scan|microsoft\s*lens|epson\s*scan|hp\s*scan|notes/i.test(producerStr)

  if (density.is_likely_image_pdf && isStrict && !isLegitScanTool) {
    // Image PDF from unknown/suspicious producer for a strict doc type
    flags.push({
      code: 'pdf_pure_image',
      severity: 'medium',
      file,
      evidence_en: `${kind} PDF contains only ${density.chars_per_page} chars/page (essentially zero extractable text). Authentic ${kind} PDFs are usually server-generated text PDFs with 1000+ chars/page. This file may be a scan/photo of a real document, or an image of a fabricated one — check PDF Producer metadata for confirmation.`,
      evidence_zh: `${zhKind(kind)}的 PDF 每页只有 ${density.chars_per_page} 个可提取字符（几乎为零）。真实的${zhKind(kind)}通常是服务器生成的文字 PDF，每页 1000+ 字符。此文件可能是真实文件的扫描/拍照，也可能是伪造文件的图片——需结合 PDF 生成工具元数据进一步判断。`,
    })
  }
  // If producer is a legitimate scan/print tool → no flag, even for image PDFs.
  // If not strict kind and not scan tool → also skip (low severity not useful).

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
