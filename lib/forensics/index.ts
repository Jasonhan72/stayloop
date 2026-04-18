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
// -----------------------------------------------------------------------------

import { checkPdfMetadata, readPdfMetadata } from './pdf-metadata'
import { checkTextDensity, readPdfTextDensity } from './pdf-text'
import { checkPaystubMath, extractPaystubFields } from './paystub-math'
import { checkSourceSpecific } from './source-specific'
import { runCrossDocChecks } from './cross-doc'
import { checkArmLength } from './arm-length'
import type {
  ForensicFlag,
  ForensicsReport,
  ForensicsSeverity,
  PaystubExtraction,
  PerFileForensics,
  ArmLengthCheckResult,
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
    input.files.map(f => analyzeFile(f, input.anthropic_api_key))
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

async function analyzeFile(
  f: ForensicsInput['files'][number],
  apiKey?: string
): Promise<PerFileForensics> {
  const startedAt = Date.now()
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
          out.flags.push(...checkPdfMetadata(meta, f.name, f.kind))
        }
        if (text) {
          const fileSize = meta?.file_size_bytes ?? bytes.byteLength
          out.text_density = text
          out.flags.push(...checkTextDensity(text, fileSize, f.name, f.kind))
        }
        // Source-specific markers
        const { result: src, flags: srcFlags } = checkSourceSpecific(meta, text, f.name, f.kind)
        out.source_specific = src
        out.flags.push(...srcFlags)
      }
    }

    // Paystub-only: extract numeric fields with haiku
    if (f.kind === 'pay_stub' && apiKey) {
      const ext = await extractPaystubFields(f.signed_url, f.mime, apiKey)
      if (ext) {
        const { result: math, flags: mathFlags } = checkPaystubMath(ext, f.name)
        out.paystub_math = math
        out.flags.push(...mathFlags)
      }
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

function computeSeverity(flags: ForensicFlag[], hardGates: string[]): ForensicsSeverity {
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
  signatory_name?: string
}): Promise<ArmLengthCheckResult[]> {
  if (!input.employer_names.length) return []

  // Deduplicate employer names (case-insensitive)
  const seen = new Set<string>()
  const unique = input.employer_names.filter(n => {
    const key = n.toLowerCase().trim()
    if (seen.has(key) || key.length < 2) return false
    seen.add(key)
    return true
  })

  const results = await Promise.allSettled(
    unique.map(emp => checkArmLength(
      emp,
      input.applicant_name,
      input.applicant_address,
      input.signatory_name,
    ))
  )

  return results
    .filter((r): r is PromiseFulfilledResult<ArmLengthCheckResult> => r.status === 'fulfilled')
    .map(r => r.value)
}

export type { ForensicsReport, ForensicFlag, PerFileForensics, ArmLengthCheckResult } from './types'
