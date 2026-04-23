// -----------------------------------------------------------------------------
// P2 — Haiku Vision OCR for image-only PDFs
//
// When a PDF's text density is < 50 chars/page (see pdf-text.ts), we can't
// use extractable text to verify its content. These are typically:
//   1. Legitimate scanned/photographed documents (OK)
//   2. Re-exported screenshots with edits (fraud)
//   3. Fabricated PDFs built from scratch in image editors (fraud)
//
// Layer 2 calls Haiku Vision to OCR the document and return:
//   - The raw visible text (so Layer 3 / Sonnet can evaluate authenticity)
//   - A one-line summary of what kind of document it appears to be
//   - The primary name on the document (for cross-check with applicant_name)
//
// We stay on Haiku-4-5 ($0.001/image) rather than Sonnet — the scoring step
// still uses Sonnet, and it will consume this OCR output as input. Haiku is
// extracting structured facts; Sonnet is making the judgment call.
//
// Matches the extractPaystubFields pattern in paystub-math.ts:
//   - direct HTTP to api.anthropic.com (edge-runtime compat, no SDK)
//   - url source (no base64 blowup)
//   - prefilled JSON start for deterministic output
// -----------------------------------------------------------------------------

import type { OcrResult } from './types'

const HAIKU_MODEL = 'claude-haiku-4-5'

const OCR_PROMPT = `You are OCRing a document that was uploaded as an image-PDF (embedded bitmap, no extractable text). Return ONLY a JSON object — no markdown, no prose.

Fields:
{
  "text": string,  // ALL visible text in reading order, line breaks preserved. Do NOT summarize; transcribe verbatim. Cap at 5000 chars.
  "apparent_doc_type": string or null,  // short phrase, e.g. "TD bank account statement", "ADP pay stub", "employment verification letter", "Equifax credit report", "Ontario driver's license". Null if unclear.
  "apparent_name": string or null,  // the primary person's name printed on the document (account holder / employee / licensee), null if not visible
  "visible_issuer": string or null,  // institution name visible on the doc, e.g. "TD Canada Trust", "ADP Canada Co.", null if unclear
  "has_watermark": boolean,  // true if any watermark/security pattern is visible
  "visible_dates": string[]  // ISO dates (YYYY-MM-DD) or "YYYY-MM" visible on the document; max 5
}`

/**
 * OCR an image-only PDF or an image file with Haiku Vision.
 * Returns null on any API failure — the caller treats OCR as optional.
 */
export async function ocrImagePdf(
  signedFileUrl: string,
  mime: string,
  apiKey: string,
): Promise<OcrResult | null> {
  const startedAt = Date.now()
  try {
    const content: Array<Record<string, unknown>> = []
    if (mime === 'application/pdf') {
      content.push({ type: 'document', source: { type: 'url', url: signedFileUrl } })
    } else if (mime?.startsWith('image/')) {
      content.push({ type: 'image', source: { type: 'url', url: signedFileUrl } })
    } else {
      return null
    }
    content.push({ type: 'text', text: OCR_PROMPT })

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: HAIKU_MODEL,
        max_tokens: 2500,  // allow ~5000 chars of OCR text + fields
        messages: [
          { role: 'user', content },
          { role: 'assistant', content: '{' },  // prefill JSON start
        ],
      }),
      signal: AbortSignal.timeout(30000),
    })
    if (!res.ok) return null
    const data = await res.json() as { content?: Array<{ text?: string }> }
    const raw = '{' + (data.content?.[0]?.text || '')
    const parsed = parseOcrOutput(raw)
    if (!parsed) return null
    return {
      ...parsed,
      elapsed_ms: Date.now() - startedAt,
    }
  } catch {
    return null
  }
}

function parseOcrOutput(raw: string): Omit<OcrResult, 'elapsed_ms'> | null {
  try {
    // Strip code fences if the model added them despite instructions.
    let t = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '')
    const start = t.indexOf('{')
    if (start < 0) return null

    // Find balanced top-level object, respecting string escapes.
    let depth = 0
    let end = -1
    let inStr = false
    let esc = false
    for (let i = start; i < t.length; i++) {
      const ch = t[i]
      if (inStr) {
        if (esc) esc = false
        else if (ch === '\\') esc = true
        else if (ch === '"') inStr = false
      } else {
        if (ch === '"') inStr = true
        else if (ch === '{') depth++
        else if (ch === '}') { depth--; if (depth === 0) { end = i; break } }
      }
    }
    if (end < 0) return null

    const body = t.slice(start, end + 1).replace(/,(\s*[}\]])/g, '$1')
    const obj = JSON.parse(body)

    const text = typeof obj.text === 'string' ? obj.text.slice(0, 5000) : ''
    return {
      text,
      apparent_doc_type: typeof obj.apparent_doc_type === 'string' && obj.apparent_doc_type.trim()
        ? obj.apparent_doc_type.trim()
        : null,
      apparent_name: typeof obj.apparent_name === 'string' && obj.apparent_name.trim()
        ? obj.apparent_name.trim()
        : null,
      visible_issuer: typeof obj.visible_issuer === 'string' && obj.visible_issuer.trim()
        ? obj.visible_issuer.trim()
        : null,
      has_watermark: obj.has_watermark === true,
      visible_dates: Array.isArray(obj.visible_dates)
        ? obj.visible_dates.filter((d: unknown) => typeof d === 'string').slice(0, 5) as string[]
        : [],
    }
  } catch {
    return null
  }
}
