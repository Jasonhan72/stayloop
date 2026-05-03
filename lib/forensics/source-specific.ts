// -----------------------------------------------------------------------------
// P3 — Source-Specific Fingerprints
//
// When a doc claims to be from a known source (Equifax, CIBC, RBC, TD, BMO,
// Scotiabank, ADP, Ceridian), we know what authentic versions look like.
// We check for source-specific markers in the extracted text and PDF
// metadata.
//
// This is the most powerful layer because it uses positive identification:
// "is this REALLY from Equifax?" rather than just "does this look fake?".
// Even if a forger spoofs the metadata, they have to also include the exact
// strings and visual layout markers that real reports contain.
//
// Note: Absence of these markers in a doc that claims to be from one of these
// sources is a strong negative signal. Presence does not prove authenticity
// (a determined forger could include the strings) — combine with metadata
// + image-PDF check for high confidence.
// -----------------------------------------------------------------------------

import type { ForensicFlag, PdfMetadataResult, SourceSpecificResult, TextDensityResult } from './types'

// ---- Equifax credit report markers ----
// Real Equifax PDFs (from consumer.equifax.ca download) contain these strings.
// Note: Don't reproduce long copyrighted blocks — short distinctive snippets
// are sufficient for fingerprinting and constitute fair use for fraud detection.
const EQUIFAX_MARKERS: RegExp[] = [
  /Equifax\s+Risk\s+Score/i,
  /Consumer\s+Disclosure/i,
  /\bBeacon\b\s*[®©™]?\s*\d/i,
  /Personal\s+Information[\s\S]*?Date\s+of\s+Birth/i,
  /Trade\s+Lines?/i,  // Equifax-specific terminology
  /Inquiries[\s\S]*?Last\s+\d+\s+Months/i,
  // Markers seen on the Chrome-printed consumer.equifax.ca PDFs that
  // landlords actually upload (these appear on every page header / footer
  // of real Equifax consumer disclosures):
  /Equifax\s+Canada/i,
  /EQUIFAX\s+REFERENCE/i,
  /consumer\.equifax\.ca/i,
  /Credit\s+Report\s+Request\s+Date/i,
  /CONSUMER\s+USE\s+ONLY/i,
]

// ---- TransUnion markers ----
// TransUnion is the second major Canadian credit bureau. Many landlords
// receive TransUnion reports instead of (or in addition to) Equifax, and
// some packets contain both bureaus. We accept either.
const TRANSUNION_MARKERS: RegExp[] = [
  /TransUnion/i,
  /Trans\s+Union/i,
  /VantageScore/i,
  /TUS\s+Score/i,
  /tucca\.transunion\.ca/i,
  /Consumer\s+Credit\s+File/i,
]

// ---- Bank statement markers ----
const BANK_MARKERS: Record<string, { producer: RegExp[]; text: RegExp[] }> = {
  CIBC: {
    producer: [/iText\s*[\d.]/i],
    text: [/CIBC\s+Account\s+Statement/i, /Canadian\s+Imperial\s+Bank\s+of\s+Commerce/i, /\bCIBC\b.*\b(Smart|Advantage|Pet[a-z]*)\s+Account\b/i],
  },
  RBC: {
    producer: [/Apache\s*FOP/i, /Adobe\s*PDF\s*Library/i],
    text: [/Royal\s+Bank\s+of\s+Canada/i, /RBC\s+Royal\s+Bank/i, /\bRBC\b.*\bSignature\b/i],
  },
  TD: {
    producer: [/Apache\s*FOP/i, /iText\s*[\d.]/i],
    text: [/TD\s+Canada\s+Trust/i, /Toronto[-\s]Dominion\s+Bank/i, /TD\s+Every\s+Day/i],
  },
  BMO: {
    producer: [/iText\s*[\d.]/i, /Apache\s*FOP/i],
    text: [/Bank\s+of\s+Montreal/i, /BMO\s+(Performance|Practical|Plus)/i],
  },
  Scotiabank: {
    producer: [/iText\s*[\d.]/i],
    text: [/Bank\s+of\s+Nova\s+Scotia/i, /Scotiabank/i, /Scotia\s+(One|Plus|Powerchequing)/i],
  },
  Tangerine: {
    producer: [/PDF/i],
    text: [/Tangerine\s+Bank/i, /tangerine\.ca/i],
  },
  'National Bank': {
    producer: [/iText|FOP/i],
    text: [/National\s+Bank\s+of\s+Canada/i, /Banque\s+Nationale/i],
  },
  Desjardins: {
    producer: [/PDF/i],
    text: [/Desjardins/i, /Caisse\s+Populaire/i],
  },
}

// ---- Payroll system markers ----
const PAYROLL_MARKERS: Record<string, { producer: RegExp[]; text: RegExp[] }> = {
  ADP: {
    producer: [/Crystal\s*Reports/i, /Apache\s*FOP/i],
    text: [/ADP\s+Canada/i, /\bADP\b.*Pay\s+Statement/i, /workforcenow/i],
  },
  Ceridian: {
    producer: [/Crystal\s*Reports/i, /Dayforce/i],
    text: [/Ceridian/i, /Dayforce/i, /Powerpay/i],
  },
  QuickBooks: {
    producer: [/QuickBooks/i, /Intuit/i],
    text: [/QuickBooks\s+Payroll/i, /Intuit/i],
  },
}

export function checkSourceSpecific(
  meta: PdfMetadataResult | null,
  text: TextDensityResult | null,
  file: string,
  kind: string
): { result: SourceSpecificResult; flags: ForensicFlag[] } {
  const flags: ForensicFlag[] = []
  const result: SourceSpecificResult = {
    equifax_authentic_markers: null,
    bank_producer_whitelisted: null,
    matched_bank: null,
  }

  const sample = text?.text_sample || ''
  const producer = `${meta?.producer || ''} ${meta?.creator || ''}`

  // ---- Credit report check (Equifax OR TransUnion) ----
  // Real Canadian credit reports come from one of two bureaus. Earlier rule
  // only accepted Equifax — that misfired on legitimate TransUnion reports
  // and on bundled "Supporting Documents.pdf" packets where the credit
  // report sits past page 6 (a 500-char text_sample never reached it).
  // We now scan up to 50k chars and accept either bureau's markers.
  if (kind === 'credit_report') {
    const equifaxHits = EQUIFAX_MARKERS.filter(re => re.test(sample)).length
    const transunionHits = TRANSUNION_MARKERS.filter(re => re.test(sample)).length
    const totalHits = equifaxHits + transunionHits
    result.equifax_authentic_markers = equifaxHits >= 2 || transunionHits >= 2
    if (totalHits === 0) {
      // No markers from either bureau — likely a fabricated credit report.
      // Severity stays high.
      flags.push({
        code: 'credit_report_no_bureau_markers',
        severity: 'high',
        file,
        evidence_en: `Document claims to be a credit report but contains no distinctive markers from either Equifax (Risk Score, Beacon, Trade Lines, Consumer Disclosure) or TransUnion (VantageScore, Consumer Credit File). Found 0 expected markers in the extracted text.`,
        evidence_zh: `文件声称是信用报告，但提取的文字里找不到 Equifax (Risk Score / Beacon / Trade Lines) 或 TransUnion (VantageScore / Consumer Credit File) 任一征信局的特征标记。0 个预期标记。`,
      })
    } else if (totalHits === 1) {
      // Exactly one marker — possibly a quoted reference rather than an
      // authentic report. Medium-severity informational flag.
      flags.push({
        code: 'credit_report_thin_bureau_markers',
        severity: 'medium',
        file,
        evidence_en: `Credit report contains only ${totalHits} bureau marker (Equifax: ${equifaxHits}, TransUnion: ${transunionHits}). Authentic disclosures usually contain multiple distinctive headers.`,
        evidence_zh: `信用报告仅找到 ${totalHits} 个征信局标记（Equifax: ${equifaxHits}, TransUnion: ${transunionHits}）。真实的信用披露通常包含多处特征标记。`,
      })
    }
  }

  // ---- Bank statement check ----
  if (kind === 'bank_statement') {
    let matched: string | null = null
    let matchScore = 0
    for (const [bank, markers] of Object.entries(BANK_MARKERS)) {
      const textHits = markers.text.filter(re => re.test(sample)).length
      if (textHits > matchScore) {
        matchScore = textHits
        matched = bank
      }
    }
    result.matched_bank = matched
    if (matched) {
      const expected = BANK_MARKERS[matched]
      const producerOk = expected.producer.some(re => re.test(producer))
      result.bank_producer_whitelisted = producerOk
      if (!producerOk && producer.trim().length > 0) {
        flags.push({
          code: 'bank_producer_mismatch',
          severity: 'high',
          file,
          evidence_en: `Bank statement text identifies the source as ${matched}, but PDF Producer="${meta?.producer || meta?.creator}" doesn't match ${matched}'s known PDF generator (${expected.producer.map(r => r.source).join(' or ')}). Statement may be re-saved or fabricated.`,
          evidence_zh: `银行对账单的文字识别为 ${matched}，但 PDF 生成工具="${meta?.producer || meta?.creator}" 与 ${matched} 已知的 PDF 生成器不匹配。可能是被重新保存或伪造。`,
        })
      }
    } else if (sample.length > 100) {
      // Has text but doesn't match any known bank
      flags.push({
        code: 'bank_statement_unknown_source',
        severity: 'medium',
        file,
        evidence_en: `Could not identify the originating bank from extracted text. Authentic Canadian bank statements always include the bank's full legal name and standard product identifiers.`,
        evidence_zh: `从提取的文字中无法识别银行来源。真实的加拿大银行对账单总会包含银行全称和标准产品名。`,
      })
    }
  }

  // ---- Payroll system check ----
  if (kind === 'pay_stub') {
    let matched: string | null = null
    for (const [system, markers] of Object.entries(PAYROLL_MARKERS)) {
      if (markers.text.some(re => re.test(sample)) || markers.producer.some(re => re.test(producer))) {
        matched = system
        break
      }
    }
    if (!matched && sample.length > 100) {
      // Many small employers run custom payroll, so this is just informational
      flags.push({
        code: 'paystub_unknown_payroll_system',
        severity: 'low',
        file,
        evidence_en: `Pay stub doesn't match common payroll providers (ADP, Ceridian, Dayforce, QuickBooks). Custom in-house payroll is plausible for small employers but warrants direct employer verification.`,
        evidence_zh: `工资单不属于常见工资系统（ADP、Ceridian、Dayforce、QuickBooks）。小公司用自建工资系统可能合理，但建议直接联系雇主核实。`,
      })
    }
  }

  return { result, flags }
}
