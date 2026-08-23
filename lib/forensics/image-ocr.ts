// -----------------------------------------------------------------------------
// Image-only PDF OCR (Haiku)
//
// When a PDF has effectively no extractable text (text_density.is_likely_image_pdf
// === true), we send it through Haiku Vision to recover the printed content.
// This is essential for ID documents — driver's licenses, passports, health
// cards are almost always uploaded as photo-of-card scans with zero PDF text.
//
// The OCR result is consumed by:
//   - id-validation.ts (SIN / DL / OHIP format + surname checks)
//   - cross-doc.ts (entity extraction across documents)
//   - Sonnet scoring prompt (via forensicsToPromptBlock)
//
// Cost: ~$0.001 per image, ~30s timeout. Failures degrade gracefully — null
// result means downstream checks fall back to text_density.text_sample.
// -----------------------------------------------------------------------------

import { DEFAULT_MODELS, getModel, getModelDef, getModelDefAsync } from '../modelConfig'
import { llmChat, type ChatContentBlock } from '../llmChat'
import type { LlmUsageMeta } from '../llmUsage'
import type { OcrResult } from './types'

const OCR_PROMPT = `You are running OCR on a Canadian rental-application document that is likely an image-only PDF (a scan or photo). Extract ALL visible text verbatim plus a small set of structured fields.

Return ONLY a JSON object — no markdown, no prose.

{
  "text": string,                 // ALL printed text, verbatim, line-broken with \\n. Cap at 5000 chars.
  "apparent_doc_type": string,    // e.g. "Ontario driver's licence", "Canadian passport biopage", "Ontario health card", "pay stub", "bank statement", "employment letter", "T4", "NOA", "credit report", "lease application", or "unknown"
  "apparent_name": string | null, // The cardholder / applicant name as printed
  "visible_issuer": string | null,// Issuing authority (e.g. "Service Ontario", "Government of Canada", bank name, employer name)
  "has_watermark": boolean,       // True if you see anti-tamper watermarks, holograms, security patterns
  "visible_dates": string[]       // Any dates visible (issue, expiry, DOB, period start/end), as printed
}

Be exhaustive on the "text" field — include numbers, addresses, license numbers, SIN-like sequences. Real ID documents have lots of small print; capture it all.`

/**
 * OCR an image-only PDF (or image file) via Haiku. Returns null on failure.
 */
export async function ocrImagePdf(
  signedFileUrl: string,
  mime: string,
  apiKey: string,
  usageMeta?: LlmUsageMeta,
): Promise<OcrResult | null> {
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
    content.push({ type: 'text', text: OCR_PROMPT })

    // Admin-configurable model slot (60s cache) — see lib/modelConfig.ts.
    // llmChat handles provider differences: assistant-prefill "{" on Haiku,
    // JSON mode elsewhere; documents/images converted per provider.
    const def = (await getModelDefAsync(await getModel('forensics'))) ?? getModelDef(DEFAULT_MODELS.forensics)!
    if (!apiKey && def.provider === 'anthropic') return null
    let raw = ''
    let stopReason: string | undefined
    try {
      const out = await llmChat({
        model: def,
        system: 'You are a document OCR engine. Output strictly the JSON requested — no markdown, no prose.',
        messages: [{ role: 'user', content: content as ChatContentBlock[] }],
        // Bumped from 2500 to 4000: a dense Canadian passport biopage + visa
        // pages can yield 1500+ tokens of OCR text alone. With the prompt
        // overhead + JSON wrapper, 2500 was hitting the cap mid-output
        // and causing parseOcrOutput to silently return null.
        maxTokens: 4000,
        prefillJson: true,
        signal: AbortSignal.timeout(30_000),
        meta: { ...(usageMeta || {}), slot: 'forensics' },
      })
      raw = out.text
      stopReason = out.stopReason
    } catch (e) {
      console.warn('[image-ocr] model call failed', def.id, (e as Error)?.message)
      return null
    }
    const parsed = parseOcrOutput(raw)
    if (!parsed) {
      // Most common cause of failure: stop_reason='max_tokens' truncated the
      // JSON mid-string, so JSON.parse fails. Surface this so we can tune.
      if (stopReason === 'max_tokens') {
        console.warn('[image-ocr] hit max_tokens; OCR output truncated and JSON unparseable')
      } else {
        console.warn('[image-ocr] could not parse OCR output, raw len=', raw.length)
      }
      return null
    }
    return {
      ...parsed,
      elapsed_ms: Date.now() - startedAt,
    }
  } catch (e) {
    console.warn('[image-ocr] failed:', (e as Error)?.message)
    return null
  }
}

/**
 * Parse the OCR JSON the model emits. When prefill was used, the caller has
 * already re-added the leading "{" — here we just balance + clean.
 */
function parseOcrOutput(raw: string): Omit<OcrResult, 'elapsed_ms'> | null {
  let candidate = raw.trim()
  if (!candidate) return null
  // Strip code fences just in case
  candidate = candidate.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '')

  // Find the FIRST top-level balanced { ... } respecting string escapes.
  const balanced = extractBalancedJson(candidate)
  if (!balanced) return null

  try {
    // Drop trailing commas commonly emitted by LLMs
    const cleaned = balanced.replace(/,(\s*[}\]])/g, '$1')
    const obj = JSON.parse(cleaned)
    return {
      text: typeof obj.text === 'string' ? obj.text.slice(0, 5000) : '',
      apparent_doc_type: typeof obj.apparent_doc_type === 'string' ? obj.apparent_doc_type : 'unknown',
      apparent_name: typeof obj.apparent_name === 'string' ? obj.apparent_name : null,
      visible_issuer: typeof obj.visible_issuer === 'string' ? obj.visible_issuer : null,
      has_watermark: typeof obj.has_watermark === 'boolean' ? obj.has_watermark : false,
      visible_dates: Array.isArray(obj.visible_dates) ? obj.visible_dates.filter((d: unknown): d is string => typeof d === 'string') : [],
    }
  } catch (e) {
    console.warn('[image-ocr] JSON parse failed:', (e as Error)?.message)
    return null
  }
}

function extractBalancedJson(s: string): string | null {
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
