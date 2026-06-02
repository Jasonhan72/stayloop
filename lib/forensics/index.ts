// -----------------------------------------------------------------------------
// Stayloop Document Forensics — Orchestrator
//
// runForensics() is the single entry point called from the screen-score route.
// Given a list of files (URL + metadata) and applicant info, it:
//   1. Fetches each file's bytes once
//   2. Runs PDF metadata + text density checks (P0) in parallel per file
//   3. For pay stubs, calls haiku to extract numeric fields and runs math
//      consistency checks (P1)
//   4. Runs source-specific markers (P3)
//   5. Aggregates entity data across all files and runs cross-doc rules (P2)
//   6. Computes overall severity + forensics-derived hard gates
//
// All AI calls (haiku for paystub field extraction) require ANTHROPIC_API_KEY.
// If the key is missing or any individual file fails, we degrade gracefully:
// the file just gets fewer flags rather than aborting the whole report.
//
// 2026-06-02 — Image-PDF fingerprint re-run:
//   Source-specific checks (Equifax / TransUnion / bank fingerprints) used to
//   run only against PDF-extracted text. For scanned credit reports (e.g. a
//   user photographs their Equifax disclosure and uploads it as an image-only
//   PDF), the extracted text is essentially empty, so every Equifax marker
//   regex misses → `credit_report_no_bureau_markers` (high severity) fires →
//   credit_health zeroed even on a real bureau report.
//
//   We now keep the OCR text we already pay Haiku Vision to produce and feed
//   it BACK into checkSourceSpecific() as if it were extracted PDF text. If
//   the scan really is an Equifax / TransUnion report, the OCR'd text will
//   contain the bureau markers and the false-positive forge flag disappears.
//   Genuinely fabricated reports — which have no bureau markers in either
//   their PDF text OR their OCR text — still get flagged correctly.
// -----------------------------------------------------------------------------

import { checkPdfMetadata, readPdfMetadata } from './pdf-metadata'
import { checkTextDensity, readPdfTextDensity } from './pdf-text'
import { checkPaystubMath, extractPaystubFields } from './paystub-math'
import { checkSourceSpecific } from './source-specific'
import { runCrossDocChecks } from './cross-doc'
import { checkArmLength, canonicalizeEmployerName } from './arm-length'
import type { CompanyRegistryInfo } from './arm-length'
import { checkIdValidation } from './id-validation'
import { ocrImagePdf } from './image-ocr'
import type {
  ForensicFlag,
  ForensicsReport,
  ForensicsSeverity,
  PaystubExtraction,
  PerFileForensics,
  ArmLengthCheckResult,
  TextDensityResult,
} from './types'

export interface ForensicsInput {
  files: Array<{
    name: string
    kind: string
    mime: string
    /** signed URL good for at least 60s */
    signed_url: string
  }>
  applicant_name?: string
  applicant_phone?: string
  applicant_email?: string
  applicant_address?: string
  anthropic_api_key?: string
}

const HARD_GATE_RULES: Array<{
  gate: string
  /** Trigger mode: 'any' = gate fires if ANY trigger code is present;
   *  'all' = gate fires only if ALL trigger codes are present. */
  mode: 'any' | 'all'
  triggers: string[]
}> = [
  // pdf_is_screenshot fires only when image-PDF is COMBINED with a
  // screenshot-tool metadata signal. An image-only PDF on its own could
  // be a legitimate scan/photo — we don't hard-gate on that alone.
  { gate: 'pdf_is_screenshot', mode: 'all', triggers: ['pdf_pure_image', 'pdf_producer_consumer_tool'] },
  // Title literally says "screenshot/PNG" — this is conclusive regardless
  // of text density (could be text-over-image PDF from a "Save as PDF").
  { gate: 'pdf_is_screenshot', mode: 'any', triggers: ['pdf_title_indicates_image'] },
  { gate: 'paystub_math_impossible', mode: 'any', triggers: ['paystub_ytd_inflated', 'paystub_period_math_error'] },
  { gate: 'cross_doc_collision', mode: 'any', triggers: ['cross_doc_phone_collision'] },
  { gate: 'producer_consumer_tool', mode: 'any', triggers: ['pdf_producer_consumer_tool'] },
  // SIN with a failing Luhn checksum is mathematically fabricated — cannot
  // occur on a real government-issued SIN. Treat as identity_mismatch.
  { gate: 'identity_mismatch', mode: 'any', triggers: ['id_sin_invalid_checksum'] },
]

const SEVERITY_WEIGHT: Record<string, number> = {
  critical: 8,
  high: 4,
  medium: 2,
  low: 1,
}

/**
 * Main entry point. Always returns a report — never throws on individual file
 * failures (they're logged into per_file with empty results).
 */
export async function runForensics(input: ForensicsInput): Promise<ForensicsReport> {
  const startedAt = Date.now()
  const perFile: PerFileForensics[] = await Promise.all(
    input.files.map(f => analyzeFile(f, input.anthropic_api_key, input.applicant_name))
  )

  // Cross-doc step: collect text samples + paystub extractions
  const crossDocFiles = perFile.map(pf => ({
    name: pf.file_name,
    kind: pf.file_kind,
    text_sample: pf.text_density?.text_sample,
    paystub: pf.paystub_math?.extraction,
  }))
  const { result: crossDocResult, flags: crossDocFlags } = runCrossDocChecks({
    files: crossDocFiles,
    applicant_name: input.applicant_name,
    applicant_phone: input.applicant_phone,
    applicant_email: input.applicant_email,
    applicant_address: input.applicant_address,
  })

  // Aggregate
  const allFlags: ForensicFlag[] = []
  for (const pf of perFile) allFlags.push(...pf.flags)
  allFlags.push(...crossDocFlags)

  // Determine forensics-derived hard gates
  const flagCodes = new Set(allFlags.map(f => f.code))
  const hardGates: string[] = []
  for (const rule of HARD_GATE_RULES) {
    const match = rule.mode === 'all'
      ? rule.triggers.every(t => flagCodes.has(t))  // ALL must be present
      : rule.triggers.some(t => flagCodes.has(t))   // ANY is enough
    if (match && !hardGates.includes(rule.gate)) hardGates.push(rule.gate)
  }

  // Compute severity
  const severity = computeSeverity(allFlags, hardGates)

  return {
    per_file: perFile,
    cross_doc: crossDocResult,
    cross_doc_flags: crossDocFlags,
    all_flags: allFlags,
    hard_gates: hardGates,
    severity,
    elapsed_ms: Date.now() - startedAt,
    schema_version: 1,
  }
}

/**
 * `f.kind` may be a comma-joined list when one PDF bundle contains multiple
 * document kinds (e.g. "employment_letter,pay_stub,credit_report" for a
 * "Supporting Documents.pdf" packet). Helpers below split + query.
 */
function kindList(kind: string | undefined): string[] {
  return (kind || '').split(',').map(k => k.trim().toLowerCase()).filter(Boolean)
}
function kindIncludes(kind: string | undefined, target: string): boolean {
  return kindList(kind).includes(target)
}
/** Pick the strictest kind from a possibly-comma-joined value. The strictness
 *  ordering reflects which kind triggers the harshest forensics rules — when
 *  the bundle contains both a bank_statement and an employment_letter, treat
 *  the file as a bank_statement for metadata strictness checks. */
const STRICTNESS = ['credit_report', 'bank_statement', 'pay_stub', 'employment_letter', 'id_document', 'offer_letter', 'reference', 'other']
function strictestKind(kind: string | undefined): string {
  const list = kindList(kind)
  if (list.length === 0) return 'other'
  if (list.length === 1) return list[0]
  for (const s of STRICTNESS) {
    if (list.includes(s)) return s
  }
  return list[0]
}

async function analyzeFile(
  f: ForensicsInput['files'][number],
  apiKey?: string,
  applicantName?: string,
): Promise<PerFileForensics> {
  const startedAt = Date.now()
  // Use the strictest single kind for forensics rules that look up a
  // single kind via STRICT_KINDS.has(). The original (possibly multi-kind)
  // value is preserved on the file_kind output for downstream display.
  const canonicalKind = strictestKind(f.kind)
  const out: PerFileForensics = {
    file_name: f.name,
    file_kind: f.kind || 'other',
    mime: f.mime,
    flags: [],
    elapsed_ms: 0,
  }

  try {
    // Only PDFs get metadata + text density. Images get source-specific only.
    if (f.mime === 'application/pdf') {
      const bytes = await fetchBytes(f.signed_url)
      if (bytes) {
        // Run metadata + text in parallel
        const [meta, text] = await Promise.all([
          readPdfMetadata(bytes),
          readPdfTextDensity(bytes),
        ])
        if (meta) {
          out.pdf_metadata = meta
          out.flags.push(...checkPdfMetadata(meta, f.name, canonicalKind))
        }
        if (text) {
          const fileSize = meta?.file_size_bytes ?? bytes.byteLength
          out.text_density = text
          out.flags.push(...checkTextDensity(text, fileSize, f.name, canonicalKind))
        }

        // Image-only PDFs (mostly scanned IDs / passports / handwritten letters,
        // and crucially scanned credit reports / bank statements) have
        // effectively no extractable text. Run Haiku Vision OCR FIRST so the
        // recovered text can feed BOTH the source-specific fingerprint check
        // and downstream id-validation, cross-doc, and Sonnet scoring.
        //
        // Trigger threshold: text_density flagged is_likely_image_pdf, which
        // means < ~50 chars/page average.
        if (text?.is_likely_image_pdf && apiKey) {
          const ocrResult = await ocrImagePdf(f.signed_url, f.mime, apiKey)
          if (ocrResult) out.ocr = ocrResult
        }

        // Source-specific markers. If we have OCR text (because the PDF was
        // image-only), merge it into the text_sample before running the
        // fingerprint check — otherwise Equifax / TransUnion / bank fingerprints
        // would all miss on scanned reports, producing a false-positive
        // `credit_report_no_bureau_markers` and forcing credit_health to 0
        // even when the scan is genuine.
        //
        // We preserve the original text_density's is_likely_image_pdf flag so
        // other downstream checks still know this was a scan; we only enrich
        // the text_sample that source-specific looks at.
        const textForFingerprint: TextDensityResult | null = (text && out.ocr?.text)
          ? {
              ...text,
              text_sample: [text.text_sample || '', out.ocr.text]
                .filter(Boolean)
                .join('\n')
                .slice(0, 50_000), // matches the cap source-specific was already tuned for
            }
          : text
        const { result: src, flags: srcFlags } = checkSourceSpecific(meta, textForFingerprint, f.name, canonicalKind)
        out.source_specific = src
        out.flags.push(...srcFlags)

        // 2026-06-02 — Credit-report AI authenticity overrule.
        // The regex-based source-specific check was tuned on the B2B
        // Equifax disclosure layout. It MISSES consumer-portal downloads
        // (myEquifax, Borrowell, Credit Karma, TransUnion Direct) which
        // use different vocabulary ("Credit Score" vs "Risk Score",
        // "Account Information" vs "Trade Lines"). When the regex would
        // fire `credit_report_no_bureau_markers` on a credit_report file,
        // ask Haiku Vision to actually LOOK at the document. If the model
        // recognizes a genuine bureau report, suppress the false-positive
        // flag and emit a verified-authentic marker instead. If the model
        // can't confirm authenticity, keep the flag (or upgrade it to a
        // clearer one).
        if (kindIncludes(f.kind, 'credit_report') && apiKey
            && out.flags.some(fl => fl.code === 'credit_report_no_bureau_markers')) {
          const judgment = await judgeCreditReportAuthenticity(f.signed_url, f.mime, apiKey)
          if (judgment?.is_authentic) {
            // Suppress the regex false positive — AI confirmed it's a real
            // bureau report. Record the positive finding so the UI can show
            // "Equifax (verified by AI) — 720" instead of "score=0 / forged".
            out.flags = out.flags.filter(fl => fl.code !== 'credit_report_no_bureau_markers')
            out.flags.push({
              code: 'credit_report_ai_verified',
              severity: 'low',  // informational, not a risk signal
              file: f.name,
              evidence_en: `Credit report visually confirmed as a genuine ${judgment.bureau || 'Canadian bureau'} report${judgment.score_visible ? ` (score ${judgment.score_visible})` : ''}. Regex bureau-marker check missed it because this is a consumer-portal export with different vocabulary (e.g. "Credit Score" instead of "Risk Score").`,
              evidence_zh: `AI 视觉确认这是真实的 ${judgment.bureau || '加拿大征信局'} 信用报告${judgment.score_visible ? `（分数 ${judgment.score_visible}）` : ''}。正则没匹配是因为消费者版报告用词不同（如 "Credit Score" 而不是 "Risk Score"）。`,
            })
          } else if (judgment && judgment.is_authentic === false) {
            // AI explicitly judged this as NOT a genuine bureau report.
            // The AI's verdict is more authoritative than the regex —
            // SUPERSEDE the regex flag (remove `credit_report_no_bureau_markers`)
            // and use only the AI flag with its specific reasoning. This
            // prevents the UI from showing two stacked "this is fake" rows
            // that say the same thing.
            out.flags = out.flags.filter(fl => fl.code !== 'credit_report_no_bureau_markers')
            out.flags.push({
              code: 'credit_report_ai_judged_fake',
              severity: 'high',
              file: f.name,
              evidence_en: `Claude Vision concluded this is not a genuine credit bureau report. Reasoning: ${judgment.reasoning.slice(0, 300)}`,
              evidence_zh: `Claude Vision 判断这不是真实的征信局报告。原因：${judgment.reasoning.slice(0, 300)}`,
            })
          }
          // If judgment === null (API call failed / parse error), keep the
          // regex flag — better to over-flag than to silently let a fake
          // through.
        }

        // ID-number validation. Prefer OCR text (image-only ID scans) if
        // available, otherwise fall back to extracted PDF text. SIN Luhn,
        // Ontario DL surname-letter, OHIP format checks all run from this.
        const validationText = out.ocr?.text || text?.text_sample
        if (validationText) {
          const surname = applicantName
            ? applicantName.trim().split(/\s+/).pop()
            : undefined
          out.flags.push(
            ...checkIdValidation(validationText, f.name, canonicalKind, surname)
          )
        }
      }
    }

    // Image files (jpeg / png / heic — non-PDF) also need OCR for IDs.
    if (f.mime?.startsWith('image/') && apiKey) {
      const ocrResult = await ocrImagePdf(f.signed_url, f.mime, apiKey)
      if (ocrResult) {
        out.ocr = ocrResult
        const surname = applicantName
          ? applicantName.trim().split(/\s+/).pop()
          : undefined
        out.flags.push(
          ...checkIdValidation(ocrResult.text, f.name, canonicalKind, surname)
        )
        // Run source-specific on the OCR text for image uploads too.
        // A photo of a credit report should be fingerprinted the same way
        // a scanned PDF of one is.
        const syntheticText: TextDensityResult = {
          chars_per_page: ocrResult.text.length,
          page_count: 1,
          total_chars: ocrResult.text.length,
          is_likely_image_pdf: true,
          text_sample: ocrResult.text.slice(0, 50_000),
        } as TextDensityResult
        const { result: src, flags: srcFlags } = checkSourceSpecific(null, syntheticText, f.name, canonicalKind)
        out.source_specific = src
        out.flags.push(...srcFlags)

        // Same AI overrule as the PDF branch — apply to photographed
        // credit reports too. See note in PDF branch above.
        if (kindIncludes(f.kind, 'credit_report') && apiKey
            && out.flags.some(fl => fl.code === 'credit_report_no_bureau_markers')) {
          const judgment = await judgeCreditReportAuthenticity(f.signed_url, f.mime, apiKey)
          if (judgment?.is_authentic) {
            out.flags = out.flags.filter(fl => fl.code !== 'credit_report_no_bureau_markers')
            out.flags.push({
              code: 'credit_report_ai_verified',
              severity: 'low',
              file: f.name,
              evidence_en: `Credit report visually confirmed as a genuine ${judgment.bureau || 'Canadian bureau'} report${judgment.score_visible ? ` (score ${judgment.score_visible})` : ''}.`,
              evidence_zh: `AI 视觉确认这是真实的 ${judgment.bureau || '加拿大征信局'} 信用报告${judgment.score_visible ? `（分数 ${judgment.score_visible}）` : ''}。`,
            })
          } else if (judgment && judgment.is_authentic === false) {
            // AI's verdict supersedes the regex — strip the regex flag.
            out.flags = out.flags.filter(fl => fl.code !== 'credit_report_no_bureau_markers')
            out.flags.push({
              code: 'credit_report_ai_judged_fake',
              severity: 'high',
              file: f.name,
              evidence_en: `Claude Vision concluded this is not a genuine credit bureau report. Reasoning: ${judgment.reasoning.slice(0, 300)}`,
              evidence_zh: `Claude Vision 判断这不是真实的征信局报告。原因：${judgment.reasoning.slice(0, 300)}`,
            })
          }
        }
      }
    }

    // Paystub-only: extract numeric fields with haiku. Use kindIncludes so
    // bundled PDFs ("employment_letter,pay_stub,credit_report") still trigger
    // the paystub math check on the pay_stub portion.
    if (kindIncludes(f.kind, 'pay_stub') && apiKey) {
      const ext = await extractPaystubFields(f.signed_url, f.mime, apiKey)
      if (ext) {
        const { result: math, flags: mathFlags } = checkPaystubMath(ext, f.name)
        out.paystub_math = math
        out.flags.push(...mathFlags)
      }
    }

    // 2026-06-02 P2 — Cheap arm's-length signals (deterministic, no API call).
    // These run on every screening — the expensive corporate-registry lookups
    // remain gated behind the Pro "Deep Check" button. The cheap layer
    // catches the obvious sole-prop / shell-company cases that the AI prompt
    // can miss when the employer name is buried in pay-stub footer fine print.
    const employerName: string | undefined =
      out.paystub_math?.extraction.employer_name?.trim() || undefined
    if (employerName && applicantName) {
      const flags = checkCheapArmLength(employerName, applicantName, f.name)
      out.flags.push(...flags)
    }
  } catch (e) {
    // Per-file failures are non-fatal — record a low-severity flag and move on
    out.flags.push({
      code: 'forensics_error',
      severity: 'low',
      file: f.name,
      evidence_en: `Forensics analysis failed for this file: ${(e as Error).message?.slice(0, 200)}`,
      evidence_zh: `本文件取证分析失败：${(e as Error).message?.slice(0, 200)}`,
    })
  }

  out.elapsed_ms = Date.now() - startedAt
  return out
}

async function fetchBytes(url: string): Promise<Uint8Array | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return null
    const buf = await res.arrayBuffer()
    return new Uint8Array(buf)
  } catch {
    return null
  }
}

/**
 * Decide the overall severity tier from individual flags + which hard
 * gates triggered. Exported for unit testing — see
 * lib/forensics/__tests__/severity.test.ts.
 *
 * Tier semantics:
 *   - clean        : nothing or only one low/medium signal
 *   - suspicious   : enough small signals to warrant manual review
 *   - likely_fraud : either one hard gate, or strong cumulative signal
 *   - fraud        : two or more independent hard gates
 *
 * Critical-severity weights and the hard-gate counts are tuned by the
 * test fixtures — changes here must keep all severity.test.ts cases
 * passing or be paired with explicit fixture updates.
 */
export function computeSeverity(flags: ForensicFlag[], hardGates: string[]): ForensicsSeverity {
  if (hardGates.length >= 2) return 'fraud'
  if (hardGates.length === 1) return 'likely_fraud'
  const score = flags.reduce((sum, f) => sum + (SEVERITY_WEIGHT[f.severity] || 0), 0)
  if (score >= 12) return 'likely_fraud'
  if (score >= 4) return 'suspicious'
  return 'clean'
}

/**
 * Build the prompt section that gets injected into the Claude scoring call.
 * This converts the structured forensics report into a compact, AI-readable
 * "evidence already verified by the backend" block. Claude is instructed in
 * the system prompt to TRUST these findings (they're computed deterministically
 * by JS, not inferred from images) and to factor them into scoring.
 */
export function forensicsToPromptBlock(report: ForensicsReport): string {
  const lines: string[] = []
  lines.push(`FORENSICS REPORT (computed by Stayloop backend in ${report.elapsed_ms}ms — TRUST THESE FINDINGS, do not re-derive):`)
  lines.push(`Overall severity: ${report.severity.toUpperCase()}`)
  if (report.hard_gates.length > 0) {
    lines.push(`Forensics hard gates triggered: ${report.hard_gates.join(', ')}`)
  }
  lines.push('')

  for (const pf of report.per_file) {
    lines.push(`▶ ${pf.file_name} (kind=${pf.file_kind}):`)
    if (pf.pdf_metadata) {
      const m = pf.pdf_metadata
      lines.push(`    PDF: producer="${m.producer || ''}", creator="${m.creator || ''}", title="${m.title || ''}", pages=${m.page_count}, size=${Math.round(m.file_size_bytes / 1024)}KB`)
    }
    if (pf.text_density) {
      lines.push(`    Text density: ${pf.text_density.chars_per_page} chars/page (${pf.text_density.is_likely_image_pdf ? 'IMAGE-ONLY PDF' : 'has text'})`)
    }
    if (pf.paystub_math) {
      const e = pf.paystub_math.extraction
      const r = pf.paystub_math.ytd_ratio
      lines.push(`    Paystub: salary=$${e.annual_salary || '?'}, ytd_gross=$${e.ytd_gross || '?'}, ytd_ratio=${r ? r.toFixed(2) : '?'}x expected`)
    }
    if (pf.source_specific) {
      const s = pf.source_specific
      if (s.matched_bank) lines.push(`    Bank match: ${s.matched_bank} (producer whitelisted: ${s.bank_producer_whitelisted})`)
      if (s.equifax_authentic_markers !== null) lines.push(`    Equifax markers found: ${s.equifax_authentic_markers}`)
    }
    if (pf.flags.length > 0) {
      lines.push(`    Flags:`)
      for (const f of pf.flags) {
        lines.push(`      [${f.severity.toUpperCase()}] ${f.code} — ${f.evidence_en}`)
      }
    } else {
      lines.push(`    No forensics flags.`)
    }
  }

  if (report.cross_doc_flags.length > 0) {
    lines.push('')
    lines.push('▶ Cross-document checks:')
    for (const f of report.cross_doc_flags) {
      lines.push(`    [${f.severity.toUpperCase()}] ${f.code} — ${f.evidence_en}`)
    }
  }

  return lines.join('\n')
}

/**
 * 2026-06-02 P2 — Cheap arm-length checks that run on every screening.
 *
 * Two deterministic signals, no external API:
 *   • numbered_company       — employer is "1234567 Ontario Inc" pattern
 *   • employer_name_includes_applicant_surname — likely sole prop / family
 *
 * Common-surname downgrade: when the applicant surname is in the high-
 * frequency surname set (Wang / Smith / Lee / etc.) we DON'T fire the
 * surname-match flag, because a real "ABC Smith Consulting Inc." run by
 * an unrelated Smith family is plausible. The numbered-company flag is
 * independent of surname and always fires when the pattern matches.
 */
const ARM_NUMBERED_COMPANY_RE =
  /^\d{5,10}\s+(ontario|canada|québec|quebec|alberta|bc|british columbia)\s*(inc\.?|ltd\.?|corp\.?|limited|incorporated)?$/i

const ARM_COMMON_SURNAMES = new Set<string>([
  'wang','li','zhang','liu','chen','yang','huang','zhao','wu','zhou','xu','sun','ma','zhu','hu','guo','he','gao','lin','luo',
  'zheng','liang','xie','song','tang','han','feng','deng','cao','peng','xiao','pan','dong','yuan','jiang','cai','yu','du','ye',
  'cheng','wei','su','lu','ding','ren','shen','yao','zhong','wong','chan','cheung','ng','ho','lau','chow','leung','tsang','yip',
  'chiu','hung','fung','mok','tse','tam','poon','kwok','hsu','hsieh','kuo','chao','chou','tsai','kim','lee','park','choi','jung',
  'jeong','kang','cho','yoon','jang','lim','shin','oh','seo','moon','nam','baek','nguyen','tran','le','pham','hoang','huynh',
  'vo','vu','dang','bui','smith','jones','williams','brown','davis','miller','wilson','taylor','anderson','thomas','jackson',
  'white','harris','martin','thompson','garcia','martinez','robinson','clark','rodriguez','lewis','walker','hall','allen','young',
  'king','wright','scott','green','baker','adams','nelson','carter','mitchell','roberts','turner','phillips','campbell','parker',
  'evans','edwards','collins','morris','murphy','cook','morgan','bell','cooper','ward','rivera','lopez','gonzales','singh','kumar',
  'sharma','patel','shah','gupta','khan','ahmed','hassan','ali','ahmad','mohamed','mohammed','hussain','ibrahim',
])

function extractSurname(fullName: string): string {
  const cleaned = fullName.toLowerCase().replace(/[^a-z\s\-]/g, '').trim()
  const parts = cleaned.split(/\s+/).filter(Boolean)
  if (parts.length === 0) return ''
  return parts[parts.length - 1]
}

function employerHasSurname(employerName: string, surname: string): boolean {
  if (!surname || surname.length < 3) return false
  const normalized = employerName.toLowerCase().replace(/[^a-z\s]/g, ' ')
  const tokens = new Set(normalized.split(/\s+/).filter(Boolean))
  return tokens.has(surname)
}

function checkCheapArmLength(
  employerName: string,
  applicantName: string,
  fileName: string,
): ForensicFlag[] {
  const flags: ForensicFlag[] = []
  const surname = extractSurname(applicantName)

  if (ARM_NUMBERED_COMPANY_RE.test(employerName.trim())) {
    flags.push({
      code: 'arm_length_numbered_company',
      severity: 'medium',
      file: fileName,
      evidence_en: `Employer "${employerName}" is a numbered Ontario/Canada company. Statistically over-represented among sole proprietorships and shell entities — landlord should verify via OpenCorporates or request a business banking reference.`,
      evidence_zh: `雇主 "${employerName}" 是数字公司（如 1234567 Ontario Inc）。在个体户和空壳公司里比例偏高 — 建议房东通过 OpenCorporates 或商业银行 reference 核实。`,
    })
  }

  if (surname && !ARM_COMMON_SURNAMES.has(surname) && employerHasSurname(employerName, surname)) {
    flags.push({
      code: 'arm_length_surname_in_employer',
      severity: 'high',
      file: fileName,
      evidence_en: `Applicant's surname "${surname}" appears in the employer name "${employerName}". Likely a family business / sole proprietorship — self-issued income letters cannot be used as third-party verification.`,
      evidence_zh: `申请人的姓 "${surname}" 出现在雇主名称 "${employerName}" 中。可能是家族企业 / 个体户 — 自己开给自己的雇主信不能作为第三方收入验证。`,
    })
  }

  return flags
}

/**
 * Run deep arm's-length employment verification.
 * Called separately (not as part of default forensics) — triggered by
 * the "Deep Check" button in the UI. PRO users get this by default,
 * free users need to activate.
 *
 * Takes employer names (extracted from forensics cross_doc.entities.employers
 * or from AI scoring) and checks them against corporate registries.
 */
export async function runDeepCheck(input: {
  employer_names: string[]
  applicant_name: string
  applicant_address?: string
  applicant_phone?: string
  applicant_email?: string
  signatory_name?: string
  signatory_phone?: string
  /** true if cross_doc flagged HR-phone == applicant-phone collision */
  hr_phone_collision?: boolean
  /** optional cache-aware company lookup (Phase 3). */
  companyLookup?: (name: string) => Promise<CompanyRegistryInfo | null>
}): Promise<ArmLengthCheckResult[]> {
  if (!input.employer_names.length) return []

  // Phase 2: canonicalize-then-dedup. "ABC Consulting", "ABC Consulting Inc.",
  // "ABC CONSULTING LIMITED" all collapse to one lookup. The *display* form
  // kept in the result is the first variant we encountered so the UI stays
  // recognizable.
  const seen = new Set<string>()
  const unique: string[] = []
  for (const raw of input.employer_names) {
    if (typeof raw !== 'string' || raw.trim().length < 2) continue
    const canonical = canonicalizeEmployerName(raw) || raw.toLowerCase().trim()
    if (seen.has(canonical)) continue
    seen.add(canonical)
    unique.push(raw.trim())
    if (unique.length >= 3) break  // cap to 3 — Phase 3 adds a cache; for now limit fan-out
  }

  const results = await Promise.allSettled(
    unique.map(emp => checkArmLength(
      emp,
      input.applicant_name,
      input.applicant_address,
      input.signatory_name,
      {
        applicant_phone: input.applicant_phone,
        applicant_email: input.applicant_email,
        hr_phone_collision: input.hr_phone_collision,
        companyLookup: input.companyLookup,
      },
    ))
  )

  return results
    .filter((r): r is PromiseFulfilledResult<ArmLengthCheckResult> => r.status === 'fulfilled')
    .map(r => r.value)
}

// =============================================================================
// 2026-06-02 — AI-based credit-report authenticity judgment.
//
// The cheap regex check in `source-specific.ts` was tuned on B2B Equifax
// disclosures. It misses consumer-portal exports — myEquifax, Borrowell,
// Credit Karma (Canada), TransUnion Direct — which use different vocabulary:
//   "Credit Score" instead of "Risk Score"
//   "Account Information" instead of "Trade Lines"
//   "Inquiries" might appear without the "Last N Months" qualifier
//   Footer often omits "consumer.equifax.ca" / "CONSUMER USE ONLY"
//
// When the regex flags a credit_report file as `credit_report_no_bureau_markers`,
// we run THIS function to actually look at the document. Returns:
//   • is_authentic = true  → genuine bureau report; suppress the false flag.
//   • is_authentic = false → AI couldn't confirm; keep the flag.
//   • null                 → API call failed; keep the flag (default-flag-on
//                            is safer than letting a fake through).
//
// Cost ≈ $0.001 per check (Haiku, single file, ~1500-token output).
// Only fires when the cheap regex would have falsely accused the file —
// so most screenings (with regex-matching B2B disclosures) don't pay this cost.
// =============================================================================

export interface CreditReportJudgment {
  is_authentic: boolean
  bureau: 'Equifax' | 'TransUnion' | 'Borrowell' | 'Credit Karma' | 'Unknown' | null
  score_visible: number | null
  /** any obvious applicant-name match seen on the report header */
  applicant_name_on_report: string | null
  /** true when this is a free/consumer-tier score-only export (myEquifax,
   *  Borrowell, etc.) — used by the UI to render "Equifax — 763 (Free
   *  consumer tier; account details not included)" instead of treating
   *  the missing account list as suspicious. */
  is_score_only_consumer_export: boolean
  /** one short sentence explaining the call, citing the specific marker used */
  reasoning: string
  elapsed_ms: number
}

const CREDIT_REPORT_JUDGE_MODEL = 'claude-haiku-4-5'

const CREDIT_REPORT_JUDGE_PROMPT = `You are inspecting a document a Canadian rental applicant submitted, claiming it is a credit report. Decide whether the document is GENUINELY produced by a credit bureau — separately from whether the content is detailed or sparse.

────────────────────────────────────────────────────────────
GROUND TRUTH — these are the legitimate Canadian sources:
  • Equifax Canada (B2B "Consumer Disclosure" — full account history + score)
  • myEquifax (consumer self-serve at my.equifax.ca — free tier shows ONLY the score; paid tiers add details)
  • TransUnion Canada (B2B disclosure + consumer credit file)
  • Borrowell (consumer portal, shows Equifax data)
  • Credit Karma Canada (consumer portal, shows TransUnion data)

CRITICAL — distinguish AUTHENTICITY from COMPLETENESS:
  • AUTHENTIC = the document genuinely came out of a real bureau / consumer-portal.
  • COMPLETE  = the document contains full account history, balances, inquiries.
  Free-tier and consumer-portal products are AUTHENTIC even when they are NOT complete. A myEquifax score-only PDF is authentic. A Borrowell dashboard screenshot is authentic. They simply contain less detail than a B2B disclosure — that is the product, not a forgery.

CONCLUSIVE AUTHENTICITY MARKERS (any one of these is enough — return is_authentic=true):
  1. Visible URL footer/header from a real bureau or partner site:
       my.equifax.ca, consumer.equifax.ca, equifax.ca, equifax.com
       transunion.ca, tucca.transunion.ca, transunion.com
       borrowell.com, creditkarma.ca, creditkarma.com
  2. A clear "Equifax", "myEquifax", "TransUnion", "Borrowell", or "Credit Karma" logo (or wordmark with brand color/typography).
  3. An explicit attestation like "This is an Equifax credit score" or "Your TransUnion Consumer Credit File".
  4. A bureau-style score gauge / dial showing 300-900 with a numeric score in that range AND any bureau identifier nearby.
  5. A B2B-style structured layout (Personal Info → Accounts/Trade Lines → Inquiries → Public Records) with the bureau name in the header.

SIGNS OF FORGERY (return is_authentic=false ONLY when one of these clearly applies):
  • Text claims to be a credit report but ZERO bureau identifier of any kind (no logo, no URL, no brand wordmark, no attestation, no recognizable layout).
  • Obviously fabricated visual: mismatched fonts inside the same field, misaligned text overlaid on a background, anachronistic formatting (e.g. Comic Sans on a fake "Equifax letterhead").
  • Document is some OTHER kind of document repurposed (a Word doc, a screenshot of a different site, a paystub) labelled as a credit report.
  • Visible signs of edit: cut-and-paste artifacts, mismatched DPI between regions, score number digit-substituted with a different font.
  • Letterhead from a non-bureau entity (a bank's internal memo, a lawyer's letter) claiming to summarize a credit report.

DEFAULT RULE — when in doubt, return is_authentic=true. False accusation of forgery is far more costly than letting a sparse but real bureau export through. Reserve is_authentic=false for documents you would describe as "this is clearly not from a credit bureau" or "this has been edited".

Return ONLY this JSON object — no markdown, no prose:
{
  "is_authentic": true | false,
  "bureau": "Equifax" | "TransUnion" | "Borrowell" | "Credit Karma" | "Unknown" | null,
  "score_visible": <integer 300-900 or null>,
  "applicant_name_on_report": "<name as printed on the report header or null>",
  "is_score_only_consumer_export": true | false,
  "reasoning": "<one short sentence (<= 30 words) — cite the SPECIFIC marker you used (URL, logo, attestation, etc.) or the SPECIFIC forgery sign you observed>"
}`

async function judgeCreditReportAuthenticity(
  signedFileUrl: string,
  mime: string,
  apiKey: string,
): Promise<CreditReportJudgment | null> {
  if (!apiKey) return null
  const startedAt = Date.now()
  try {
    const content: any[] = []
    if (mime === 'application/pdf') {
      content.push({ type: 'document', source: { type: 'url', url: signedFileUrl } })
    } else if (mime?.startsWith('image/')) {
      content.push({ type: 'image', source: { type: 'url', url: signedFileUrl } })
    } else {
      return null
    }
    content.push({ type: 'text', text: CREDIT_REPORT_JUDGE_PROMPT })

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: CREDIT_REPORT_JUDGE_MODEL,
        max_tokens: 400,
        messages: [
          { role: 'user', content },
          { role: 'assistant', content: '{' },
        ],
      }),
      signal: AbortSignal.timeout(30_000),
    })

    if (!res.ok) {
      console.warn('[credit-report-judge] Haiku HTTP', res.status, await res.text().catch(() => ''))
      return null
    }
    const json: any = await res.json()
    const raw = json?.content?.[0]?.text || ''
    let candidate = raw.trim().replace(/^\`\`\`(?:json)?\s*/i, '').replace(/\`\`\`\s*$/i, '')
    const reassembled = candidate.startsWith('{') ? candidate : '{' + candidate
    const balanced = extractBalancedJsonInline(reassembled)
    if (!balanced) return null
    const cleaned = balanced.replace(/,(\s*[}\]])/g, '$1')
    try {
      const obj = JSON.parse(cleaned)
      const score = typeof obj.score_visible === 'number' && obj.score_visible >= 300 && obj.score_visible <= 900
        ? Math.round(obj.score_visible)
        : null
      const allowedBureaus = new Set(['Equifax', 'TransUnion', 'Borrowell', 'Credit Karma', 'Unknown'])
      const bureau = typeof obj.bureau === 'string' && allowedBureaus.has(obj.bureau)
        ? obj.bureau as CreditReportJudgment['bureau']
        : null
      return {
        is_authentic: obj.is_authentic === true,
        bureau,
        score_visible: score,
        applicant_name_on_report: typeof obj.applicant_name_on_report === 'string'
          ? obj.applicant_name_on_report
          : null,
        is_score_only_consumer_export: obj.is_score_only_consumer_export === true,
        reasoning: typeof obj.reasoning === 'string' ? obj.reasoning.slice(0, 500) : '',
        elapsed_ms: Date.now() - startedAt,
      }
    } catch {
      return null
    }
  } catch (e) {
    console.warn('[credit-report-judge] failed:', (e as Error)?.message)
    return null
  }
}

function extractBalancedJsonInline(s: string): string | null {
  const start = s.indexOf('{')
  if (start < 0) return null
  let depth = 0
  let inStr = false
  let escape = false
  for (let i = start; i < s.length; i++) {
    const c = s[i]
    if (escape) { escape = false; continue }
    if (c === '\\') { escape = true; continue }
    if (c === '"') { inStr = !inStr; continue }
    if (inStr) continue
    if (c === '{') depth++
    else if (c === '}') {
      depth--
      if (depth === 0) return s.slice(start, i + 1)
    }
  }
  return null
}

export type { ForensicsReport, ForensicFlag, PerFileForensics, ArmLengthCheckResult } from './types'
