// -----------------------------------------------------------------------------
// P0 — PDF Internal Structure Fingerprinting
//
// Goes beyond Producer/Creator strings to detect forgery tools by their
// structural signatures inside the raw PDF byte stream.
//
// pdf-lib (github.com/Hopding/pdf-lib) — the tool flagged in the user's
// screening — leaves multiple fingerprints that persist even when the
// Producer metadata string is spoofed:
//
//   1. pdf-lib embeds its version in /Info, /ModDate trailer, and sometimes
//      in stream comments. Searching raw bytes for "pdf-lib" catches this.
//   2. pdf-lib uses a characteristic object-numbering pattern and always
//      writes a specific cross-reference structure.
//   3. Multiple %%EOF markers indicate incremental updates — the original
//      PDF was modified in-place (common with pdf-lib "edit existing PDF").
//   4. Embedded font analysis: pdf-lib defaults to a small set of standard
//      fonts. Real bank/payroll PDFs use enterprise fonts (Helvetica variants,
//      proprietary typefaces).
//
// All checks are pure byte/string scanning — no external calls, edge-safe.
// -----------------------------------------------------------------------------

import { PDFDocument, PDFName, PDFDict, PDFArray, PDFRef } from 'pdf-lib'
import type { ForensicFlag } from './types'

// Documents where pdf-lib is suspicious IF the content doesn't match a known
// enterprise system. Banks never use pdf-lib, but modern SaaS payroll systems
// (Workday, Gusto, Rippling, BambooHR) DO — so pay_stub requires a content
// check before flagging. Credit bureaus are the sharper trap: Equifax
// Canada's own consumer portal renders its download PDF client-side with
// pdf-lib (verified 2026-08 against known-genuine consumer downloads across
// separate applicants and dates — every one carries Producer "pdf-lib"), so
// for credit_report the producer string cannot distinguish a real download
// from a fabricated one. See CONSUMER_BUREAU_PORTAL_MARKERS below.
const FINANCIAL_KINDS = new Set([
  'bank_statement',
  'credit_report',
  'pay_stub',
])

// Documents where pdf-lib is PLAUSIBLE — HR departments, law firms, real
// estate platforms (dotloop, Lone Wolf) legitimately use JS PDF libraries
// to fill templates. pdf-lib here is informational, not a fraud signal.
const TEMPLATE_KINDS = new Set([
  'employment_letter',
  'offer_letter',
  'lease',
  'other',
  'reference',
])

// Enterprise payroll/HR/fintech systems known to use pdf-lib or similar JS
// PDF rendering in their server-side pipeline. When ANY of these markers
// appear in the document text, pdf-lib is the system's own rendering tool —
// not a forgery signal.
const ENTERPRISE_SYSTEM_MARKERS: Array<{ name: string; patterns: RegExp[] }> = [
  { name: 'Workday', patterns: [/\bWorkday\b/i, /\bWD\s*\d+\b/, /Workday\s+(?:Inc|Payroll)/i] },
  // ADP's logo on stubs is an image, not text — so also match the AutoPay
  // pipeline's metadata fingerprints, which live in the raw Info dict bytes:
  // Producer "PDFOUT vX.X by Xenos, inc." and Title "AutoPay output documents".
  { name: 'ADP', patterns: [/\bADP\b.*(?:Pay|Stub|Statement)/i, /ADP\s+(?:TotalSource|Workforce|Run)\b/i, /Automatic\s+Data\s+Processing/i, /PDFOUT.*Xenos/i, /AutoPay\s+output\s+documents/i] },
  { name: 'Ceridian/Dayforce', patterns: [/\bCeridian\b/i, /\bDayforce\b/i, /\bPowerpay\b/i] },
  { name: 'Gusto', patterns: [/\bGusto\b.*(?:Pay|Stub)/i, /gusto\.com/i] },
  { name: 'Paychex', patterns: [/\bPaychex\b/i, /paychex\.com/i] },
  { name: 'BambooHR', patterns: [/\bBambooHR\b/i, /bamboohr\.com/i] },
  { name: 'Rippling', patterns: [/\bRippling\b/i, /rippling\.com/i] },
  { name: 'Paycom', patterns: [/\bPaycom\b/i, /paycom\.com/i] },
  { name: 'UKG/Kronos', patterns: [/\bUKG\b.*(?:Pro|Ready|Kronos)/i, /\bKronos\b/i, /\bUltimate\s+Software\b/i] },
  { name: 'Wave', patterns: [/\bWave\s+(?:Payroll|Financial)\b/i, /waveapps\.com/i] },
  { name: 'Sage', patterns: [/\bSage\s+(?:Payroll|50|300)\b/i] },
  { name: 'QuickBooks', patterns: [/\bQuickBooks\b.*(?:Pay|roll)/i, /\bIntuit\s+Payroll\b/i] },
  { name: 'Xero', patterns: [/\bXero\b.*(?:Pay|roll)/i] },
  { name: 'Toast', patterns: [/\bToast\b.*(?:Pay|roll)/i, /toasttab\.com/i] },
  { name: 'Square', patterns: [/\bSquare\s+Payroll\b/i, /squareup\.com/i] },
]

function detectEnterpriseSystem(textContent: string): string | null {
  if (!textContent) return null
  for (const sys of ENTERPRISE_SYSTEM_MARKERS) {
    if (sys.patterns.some(p => p.test(textContent))) return sys.name
  }
  return null
}

// Consumer credit-bureau portals whose GENUINE download PDFs are rendered
// client-side by JS libraries. A pdf-lib Producer on a credit_report matching
// one of these is the portal's own rendering tool — flagging it as a
// fabrication tool would fail every real Equifax consumer download (and did:
// two genuine co-applicant reports were hard-gated as batch forgery).
// A marker match does NOT verify authenticity — anyone can type these strings
// into a fake — it only means the producer signal is uninformative here, so
// authenticity rests on the content checks (source fingerprint, cross-doc,
// tradeline consistency). ≥2 distinct markers required so a stray bureau
// mention elsewhere in a document doesn't qualify.
const CONSUMER_BUREAU_PORTAL_MARKERS: Array<{ name: string; patterns: RegExp[] }> = [
  {
    name: 'Equifax Canada consumer portal',
    patterns: [
      /consumer\.equifax\.ca/i,
      /Equifax\s+Canada\s+Co\b/i,
      /EQUIFAX\s+REFERENCE\s+NUMBER/i,
      /equifax\.ca\/personal\/dispute-credit-report/i,
    ],
  },
  {
    name: 'TransUnion Canada consumer portal',
    patterns: [
      /transunion\.ca/i,
      /TransUnion\s+(?:of\s+)?Canada/i,
      /Consumer\s+Disclosure/i,
    ],
  },
]

function detectConsumerBureauPortal(textContent: string): string | null {
  if (!textContent) return null
  for (const portal of CONSUMER_BUREAU_PORTAL_MARKERS) {
    const hits = portal.patterns.filter(rx => rx.test(textContent)).length
    if (hits >= 2) return portal.name
  }
  return null
}

export interface PdfStructureResult {
  has_pdflib_marker: boolean
  pdflib_version: string | null
  eof_count: number
  has_incremental_updates: boolean
  embedded_font_names: string[]
  font_count: number
  has_mixed_font_families: boolean
  creation_tool_fingerprint: string | null
  enterprise_system: string | null
}

export async function checkPdfStructure(
  bytes: Uint8Array,
  fileName: string,
  kind: string,
  textContent?: string,
  /**
   * Producer/Creator strings the metadata pass already parsed. This closes the
   * blind spot that let a pdf-lib-generated "Equifax" credit report through
   * with zero flags: pdf-lib saves with object streams by default, so its
   * Producer string sits inside a Flate-compressed stream where the raw-byte
   * scan below cannot see it — while the metadata check, which CAN see it,
   * lists /pdf-lib/i as "recognized" and stays silent, deferring to this
   * check. Each pass held half the truth. The parsed metadata is the
   * authoritative source; the byte scan remains as the fallback for files
   * whose metadata was stripped.
   */
  metadataProducer?: string | null,
): Promise<{ result: PdfStructureResult; flags: ForensicFlag[] }> {
  const flags: ForensicFlag[] = []
  const isFinancial = FINANCIAL_KINDS.has(kind)
  const isTemplate = TEMPLATE_KINDS.has(kind)

  // Scan raw bytes early — needed for both pdf-lib detection and enterprise
  // system identification. Enterprise systems often embed their name in custom
  // PDF metadata fields (e.g. Workday's "Created By(Workday UI Server)") or
  // SDK copyright notices, which appear in raw bytes but NOT in visible text.
  const rawText = scanRawBytes(bytes)
  const enterpriseSystem =
    (textContent ? detectEnterpriseSystem(textContent) : null) ||
    detectEnterpriseSystem(rawText)

  let doc: PDFDocument
  try {
    doc = await PDFDocument.load(bytes, {
      ignoreEncryption: true,
      throwOnInvalidObject: false,
      updateMetadata: false,
    })
  } catch {
    return {
      result: {
        has_pdflib_marker: false,
        pdflib_version: null,
        eof_count: 0,
        has_incremental_updates: false,
        embedded_font_names: [],
        font_count: 0,
        has_mixed_font_families: false,
        creation_tool_fingerprint: null,
        enterprise_system: null,
      },
      flags,
    }
  }

  // --- 1. pdf-lib markers: parsed metadata first, raw bytes as fallback ---
  // The metadata Producer is what actually catches a default pdf-lib save
  // (object streams compress the Info dict out of the byte scan's sight).
  const producerScan = `${metadataProducer || ''} ${rawText}`
  const pdflibMatch = producerScan.match(/(?:pdf-lib|jsPDF|pdfmake)(?:\s*(?:version\s*)?(\d+\.\d+\.\d+))?/i)
  const hasPdflibMarker = pdflibMatch !== null
  const pdflibVersion = pdflibMatch?.[1] || null

  // Also check for other forgery-tool byte markers
  const toolFingerprint = detectToolFingerprint(rawText)

  // Portal detection runs on visible text AND raw bytes — the reference
  // number and dispute URL sit in the page text, which the caller passes as
  // textContent when text extraction succeeded.
  const bureauPortal = kind === 'credit_report'
    ? detectConsumerBureauPortal(`${textContent || ''}\n${rawText}`)
    : null

  if (hasPdflibMarker) {
    if (kind === 'credit_report' && bureauPortal) {
      // pdf-lib on a credit report whose content matches a consumer-bureau
      // portal fingerprint: that portal's genuine downloads ARE pdf-lib
      // renders, so the producer proves nothing either way. Disclose, don't
      // penalize — content-level checks carry the authenticity question.
      flags.push({
        code: 'pdf_structure_pdflib_bureau_portal',
        severity: 'info',
        file: fileName,
        evidence_en: `PDF Producer is pdf-lib${pdflibVersion ? ` v${pdflibVersion}` : ''} and the content matches the ${bureauPortal} fingerprint. That portal's genuine consumer downloads are rendered client-side with pdf-lib, so the producer string cannot distinguish a real download from a fabricated one — authenticity rests on the content checks (source fingerprint, cross-document consistency, tradeline data).`,
        evidence_zh: `PDF 生成器为 pdf-lib${pdflibVersion ? ` v${pdflibVersion}` : ''}，且内容匹配 ${bureauPortal} 指纹。该门户的真实消费者下载版报告本身就是用 pdf-lib 在浏览器端渲染的，因此生成器字段无法区分真件与伪造件——真伪判断依赖内容级检查（来源指纹、跨文档一致性、账户数据）。`,
      })
    } else if (isFinancial && enterpriseSystem) {
      // pdf-lib detected BUT the document content contains markers from a
      // known enterprise system (Workday, ADP, Gusto, etc.) that legitimately
      // uses JS PDF rendering. Not a forgery signal — informational only.
      flags.push({
        code: 'pdf_structure_pdflib_enterprise',
        severity: 'low',
        file: fileName,
        evidence_en: `PDF uses pdf-lib${pdflibVersion ? ` v${pdflibVersion}` : ''} but document content matches ${enterpriseSystem} — a known enterprise payroll/HR system that uses JavaScript-based PDF rendering. This is expected and not a forgery signal.`,
        evidence_zh: `PDF 使用 pdf-lib${pdflibVersion ? ` v${pdflibVersion}` : ''}，但文件内容匹配 ${enterpriseSystem}——一个已知使用 JavaScript PDF 渲染的企业工资/人事系统。这是正常的，不是伪造信号。`,
      })
    } else if (isFinancial) {
      // Financial doc with pdf-lib and NO enterprise system markers —
      // banks and credit bureaus never use pdf-lib. For pay stubs, only
      // flag if no known payroll system is detected in the content.
      flags.push({
        code: 'pdf_structure_pdflib_detected',
        severity: 'high',
        file: fileName,
        evidence_en: `PDF internal byte stream contains "pdf-lib"${pdflibVersion ? ` v${pdflibVersion}` : ''} marker and no known enterprise system was identified in the content. pdf-lib is a JavaScript PDF-creation library — legitimate ${zhKindEn(kind)} from banks or payroll systems would contain recognizable system branding.`,
        evidence_zh: `PDF 内部字节流包含 "pdf-lib"${pdflibVersion ? ` v${pdflibVersion}` : ''} 标记，且文件内容中未识别到已知企业系统。pdf-lib 是 JavaScript PDF 生成库——合法的${zhKind(kind)}来自银行或工资系统时会包含可识别的系统标识。`,
      })
    }
    // For employment_letter, offer_letter, lease, OREA forms etc. —
    // pdf-lib is legitimate (HR tools, real estate platforms like dotloop/
    // Lone Wolf use JS PDF libs to fill form templates). No flag.
  }

  // --- 2. Multiple %%EOF markers = incremental updates ---
  const eofCount = countEofMarkers(bytes)
  const hasIncrementalUpdates = eofCount > 1

  if (hasIncrementalUpdates && isFinancial) {
    flags.push({
      code: 'pdf_incremental_update',
      severity: 'medium',
      file: fileName,
      evidence_en: `PDF contains ${eofCount} %%EOF markers, indicating ${eofCount - 1} incremental update(s). The original PDF was modified after initial creation — official documents are generated once and never modified.`,
      evidence_zh: `PDF 包含 ${eofCount} 个 %%EOF 标记，说明文件在初始创建后被修改了 ${eofCount - 1} 次。官方文件都是一次性生成的，不会被后续修改。`,
    })
  }

  // --- 3. Embedded font analysis ---
  const fontNames = extractFontNames(doc)
  const fontCount = fontNames.length
  const hasMixedFamilies = detectMixedFontFamilies(fontNames, kind)

  if (fontCount > 8 && isFinancial) {
    flags.push({
      code: 'pdf_excessive_fonts',
      severity: 'medium',
      file: fileName,
      evidence_en: `PDF embeds ${fontCount} distinct fonts (${fontNames.slice(0, 5).join(', ')}${fontCount > 5 ? '...' : ''}). Authentic ${zhKindEn(kind)} typically use 1-3 enterprise fonts. Excessive font diversity suggests manual assembly from multiple sources.`,
      evidence_zh: `PDF 嵌入了 ${fontCount} 种不同字体（${fontNames.slice(0, 5).join('、')}${fontCount > 5 ? '...' : ''}）。真实的${zhKind(kind)}通常只用 1-3 种企业字体。字体过多说明文件可能是从多个来源拼凑的。`,
    })
  }

  if (hasMixedFamilies && isFinancial) {
    flags.push({
      code: 'pdf_mixed_font_families',
      severity: 'medium',
      file: fileName,
      evidence_en: `PDF mixes system/consumer fonts with enterprise fonts. Authentic ${zhKindEn(kind)} use a consistent font family from a single generation pipeline.`,
      evidence_zh: `PDF 混用了系统/消费级字体和企业字体。真实的${zhKind(kind)}使用来自单一生成管线的统一字体系列。`,
    })
  }

  // --- 4. pdf-lib generates a very specific font set ---
  const pdflibFontSignature = fontNames.some(f =>
    /^(Helvetica|Courier|TimesRoman|Symbol|ZapfDingbats)$/i.test(f)
  ) && fontNames.length <= 3 && !fontNames.some(f =>
    /Arial|Calibri|Verdana|Tahoma|Segoe/i.test(f)
  )

  // ADP's native Xenos pipeline outputs exactly this shape — non-embedded
  // Base-14 Helvetica only — so the heuristic is known-wrong when the doc
  // matches a recognized enterprise system.
  if (pdflibFontSignature && isFinancial && !hasPdflibMarker && !enterpriseSystem) {
    flags.push({
      code: 'pdf_pdflib_font_signature',
      severity: 'low',
      file: fileName,
      evidence_en: `PDF uses only PDF base fonts (${fontNames.join(', ')}) — characteristic of pdf-lib or similar programmatic generators. Real ${zhKindEn(kind)} embed proprietary or system fonts from their generation server.`,
      evidence_zh: `PDF 仅使用 PDF 基础字体（${fontNames.join('、')}）——这是 pdf-lib 等程序化生成器的特征。真实的${zhKind(kind)}会嵌入其生成服务器上的专有或系统字体。`,
    })
  }

  const result: PdfStructureResult = {
    has_pdflib_marker: hasPdflibMarker,
    pdflib_version: pdflibVersion,
    eof_count: eofCount,
    has_incremental_updates: hasIncrementalUpdates,
    embedded_font_names: fontNames,
    font_count: fontCount,
    has_mixed_font_families: hasMixedFamilies,
    creation_tool_fingerprint: toolFingerprint,
    enterprise_system: enterpriseSystem,
  }

  return { result, flags }
}

function scanRawBytes(bytes: Uint8Array): string {
  const decoder = new TextDecoder('ascii', { fatal: false })
  const chunkSize = 64 * 1024
  const scanEnd = Math.min(bytes.byteLength, 512 * 1024)
  const chunks: string[] = []
  // Scan first 512KB — tool markers are in headers, trailers, and Info dicts
  for (let offset = 0; offset < scanEnd; offset += chunkSize) {
    chunks.push(decoder.decode(bytes.slice(offset, Math.min(offset + chunkSize, scanEnd))))
  }
  // Also scan the last 16KB (trailer area)
  if (bytes.byteLength > scanEnd) {
    const tailStart = Math.max(0, bytes.byteLength - 16384)
    chunks.push(decoder.decode(bytes.slice(tailStart)))
  }
  return chunks.join('')
}

function countEofMarkers(bytes: Uint8Array): number {
  const decoder = new TextDecoder('ascii', { fatal: false })
  const text = decoder.decode(bytes)
  const matches = text.match(/%%EOF/g)
  return matches ? matches.length : 0
}

function detectToolFingerprint(rawText: string): string | null {
  // Check for known forgery/creation tool byte signatures beyond Producer
  if (/pdf-lib/i.test(rawText)) return 'pdf-lib'
  if (/jsPDF/i.test(rawText)) return 'jsPDF'
  if (/pdfmake/i.test(rawText)) return 'pdfmake'
  if (/puppeteer/i.test(rawText)) return 'puppeteer'
  if (/wkhtmltopdf/i.test(rawText)) return 'wkhtmltopdf'
  if (/PhantomJS/i.test(rawText)) return 'PhantomJS'
  return null
}

function extractFontNames(doc: PDFDocument): string[] {
  const fontNames = new Set<string>()
  try {
    const pages = doc.getPages()
    for (const page of pages) {
      const resources = page.node.get(PDFName.of('Resources'))
      if (!(resources instanceof PDFDict)) continue
      const fonts = resources.get(PDFName.of('Font'))
      if (!(fonts instanceof PDFDict)) continue

      const fontEntries = fonts.entries()
      for (const [, fontRef] of fontEntries) {
        try {
          let fontDict: PDFDict | null = null
          if (fontRef instanceof PDFDict) {
            fontDict = fontRef
          } else if (fontRef instanceof PDFRef) {
            const resolved = doc.context.lookup(fontRef)
            if (resolved instanceof PDFDict) fontDict = resolved
          }
          if (!fontDict) continue

          const baseFont = fontDict.get(PDFName.of('BaseFont'))
          if (baseFont instanceof PDFName) {
            let name = baseFont.decodeText()
            // Strip subset prefix (e.g. "ABCDEF+ArialMT" → "ArialMT")
            name = name.replace(/^[A-Z]{6}\+/, '')
            // Strip common suffixes for grouping
            name = name.replace(/[-,](Bold|Italic|Regular|Light|Medium|BoldItalic|Oblique)$/i, '')
            fontNames.add(name)
          }
        } catch {
          // Skip unreadable font entries
        }
      }
    }
  } catch {
    // Non-fatal — return whatever we found
  }
  return Array.from(fontNames).sort()
}

const CONSUMER_FONTS = new Set([
  'arial', 'calibri', 'cambria', 'comicsansms', 'consolas', 'georgia',
  'impact', 'lucidaconsole', 'lucidasans', 'palatino', 'segoeui',
  'tahoma', 'trebuchetms', 'verdana', 'wingdings',
])

const ENTERPRISE_FONTS = new Set([
  'helvetica', 'helveticaneue', 'courier', 'timesnewroman', 'timesroman',
  'arial', 'myriadpro', 'frutiger', 'futura', 'garamond', 'gillsans',
  'optima', 'univers', 'dinpro', 'roboto', 'opensans', 'lato',
])

function detectMixedFontFamilies(fontNames: string[], kind: string): boolean {
  if (fontNames.length < 2) return false

  const normalized = fontNames.map(f => f.toLowerCase().replace(/[^a-z]/g, ''))
  let hasConsumer = false
  let hasEnterprise = false

  for (const f of normalized) {
    if (CONSUMER_FONTS.has(f)) hasConsumer = true
    if (ENTERPRISE_FONTS.has(f)) hasEnterprise = true
  }

  // Only flag if we see BOTH consumer-only fonts AND enterprise fonts
  // in bank/credit/pay docs where the generation pipeline should be uniform
  return hasConsumer && hasEnterprise && (kind === 'bank_statement' || kind === 'credit_report' || kind === 'pay_stub')
}

function zhKind(kind: string): string {
  switch (kind) {
    case 'bank_statement': return '银行对账单'
    case 'credit_report': return '信用报告'
    case 'pay_stub': return '工资单'
    case 'employment_letter': return '雇佣证明信'
    default: return '官方文件'
  }
}

function zhKindEn(kind: string): string {
  switch (kind) {
    case 'bank_statement': return 'bank statements'
    case 'credit_report': return 'credit reports'
    case 'pay_stub': return 'pay stubs'
    case 'employment_letter': return 'employment letters'
    default: return 'official documents'
  }
}
