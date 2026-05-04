import { NextRequest, NextResponse } from 'next/server'

// Lightweight classification endpoint. Accepts up to 8 files via
// multipart/form-data and returns, for each file, an array of document
// kinds Claude actually saw inside it (a single PDF can legitimately
// contain several kinds — e.g. a "Rental Application Package" that
// bundles an ID scan, a paystub, and a bank statement).
//
// We intentionally keep this in its own route so the upload UI can
// light up category badges within a few seconds of drop, without
// waiting for full scoring.

export const runtime = 'edge'

const VALID_KINDS = [
  'employment_letter',
  'pay_stub',
  'bank_statement',
  'id_document',
  'credit_report',
  'offer_letter',
  'reference',
  'other',
] as const

type Kind = typeof VALID_KINDS[number]

const MAX_FILES_PER_BATCH = 5   // Keep each Claude call small to avoid timeouts
const MAX_BYTES = 8 * 1024 * 1024 // 8MB per file
const MAX_TOTAL_FILES = 20       // Absolute cap across all batches

async function toBase64(buf: ArrayBuffer): Promise<string> {
  const bytes = new Uint8Array(buf)
  // edge runtime supports btoa on binary strings up to ~1MB chunks
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

// Classify a single batch of files (up to MAX_FILES_PER_BATCH).
// Returns the raw parsed JSON from Claude.
async function classifyBatch(
  files: File[],
  startIndex: number,
  apiKey: string
): Promise<{
  files?: { index: number; kinds: string[] }[]
  applicant_name?: string | null
  monthly_rent?: number | null
}> {
  const contentBlocks: any[] = [
    {
      type: 'text',
      text: `You are a document classifier for a Canadian rental-screening tool.
For each file below, identify which document kind(s) it actually contains.
A single PDF MAY contain multiple kinds (e.g. a "Supporting Documents.pdf"
bundle that physically includes an ID scan + a paystub + a bank statement)
— list every kind whose ACTUAL CONTENT is physically present.

CRITICAL — only label a kind when the actual document content is in the file.
A document that REFERENCES or REQUIRES another doc type does NOT contain it.
Common false-positive cases to avoid:
- A lease / Agreement to Lease that requires the tenant to "provide a credit
  report, employment letter, paystub and ID" → label this as 'other' (or just
  the lease body). It is NOT id_document, employment_letter, pay_stub, or
  credit_report just because those words appear in the requirements clause.
- A rental application FORM with blank fields asking for income / employer
  / SIN → label as 'other'. It only becomes an id_document/pay_stub etc.
  when the actual scanned ID or paystub PDF has been merged into the file.
- A cover letter or letter of intent referencing a credit check → 'other'.

Per-kind requirements (ALL must be true to label that kind):
- id_document: a recognizable government ID image is visible (DL/passport/PR/
  health card photo, with name + DOB + ID number).
- employment_letter: a signed letter from an employer stating the applicant's
  position + salary + start date. NOT a generic offer template, not a request
  for an employment letter, not a clause in a lease.
- offer_letter: a job offer from a company with the applicant's name and
  the offered position/salary.
- pay_stub: an actual numeric pay-stub table with gross / net / YTD lines.
- bank_statement: an actual bank statement with account number, dated
  transaction list, and running balance.
- credit_report: an actual credit report with score (Equifax/TransUnion),
  trade lines, account history, or inquiries listed. Mere mention of "credit
  check required" does not count.
- reference: a signed reference letter from a previous landlord / employer
  with the applicant's name as the subject.
- other: anything not matching the above (leases, application forms, cover
  letters, generic templates, blank forms).

When in doubt between 'other' and a specific kind, choose 'other'.
Return EMPTY kinds array [] only if the file is unreadable; otherwise return
at least 'other'.

Valid kinds: ${VALID_KINDS.join(', ')}

ALSO extract — if visible in any uploaded document — the following fields.
Prefer rental application forms for these, then ID documents, then other sources.
- applicant_name: the candidate's full legal name
- monthly_rent: the monthly rent for the unit being applied to, in CAD (number only, no $ or commas). If you only see annual rent, divide by 12. If unknown, null.

Return ONLY this JSON (no markdown, no prose):
{
  "files": [ { "index": <0-based index>, "kinds": ["..."] }, ... ],
  "applicant_name": "<name or null>",
  "monthly_rent": <number or null>
}`,
    },
  ]

  for (let i = 0; i < files.length; i++) {
    const f = files[i]
    const globalIdx = startIndex + i
    if (f.size > MAX_BYTES) {
      contentBlocks.push({ type: 'text', text: `\nFILE #${globalIdx}: ${f.name} — skipped (too large, ${Math.round(f.size / 1024 / 1024)}MB)` })
      continue
    }
    const buf = await f.arrayBuffer()
    const b64 = await toBase64(buf)
    contentBlocks.push({ type: 'text', text: `\nFILE #${globalIdx}: ${f.name}` })
    if (f.type === 'application/pdf') {
      contentBlocks.push({
        type: 'document',
        source: { type: 'base64', media_type: 'application/pdf', data: b64 },
      })
    } else if (f.type.startsWith('image/')) {
      contentBlocks.push({
        type: 'image',
        source: { type: 'base64', media_type: f.type, data: b64 },
      })
    } else {
      contentBlocks.push({ type: 'text', text: `(unsupported mime: ${f.type})` })
    }
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    signal: AbortSignal.timeout(30_000), // 30s timeout per batch
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 800,
      system: 'You classify uploaded rental-application documents and extract a few header fields (applicant name, monthly rent). Output strictly the JSON schema requested. No markdown, no prose.',
      messages: [{ role: 'user', content: contentBlocks }],
    }),
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw new Error(`Classifier HTTP ${res.status}: ${errText.slice(0, 300)}`)
  }

  const aiData = (await res.json()) as { content?: Array<{ text: string }> }
  let text = aiData.content?.[0]?.text || '{}'
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()

  try {
    return JSON.parse(text)
  } catch {
    throw new Error(`Classifier parse error: ${text.slice(0, 200)}`)
  }
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'Classifier not configured' }, { status: 500 })
  }

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Expected multipart/form-data' }, { status: 400 })
  }

  const rawFiles = form.getAll('files').filter((x): x is File => x instanceof File)
  if (rawFiles.length === 0) {
    return NextResponse.json({ classifications: [] })
  }
  const files = rawFiles.slice(0, MAX_TOTAL_FILES)

  // Split files into batches to keep each Claude call payload small
  // and avoid edge-function timeouts / Anthropic payload limits.
  const batches: File[][] = []
  for (let i = 0; i < files.length; i += MAX_FILES_PER_BATCH) {
    batches.push(files.slice(i, i + MAX_FILES_PER_BATCH))
  }

  // Run batches in parallel (each is a separate Claude call)
  const batchResults = await Promise.allSettled(
    batches.map((batch, bi) => classifyBatch(batch, bi * MAX_FILES_PER_BATCH, apiKey))
  )

  // Merge results across batches
  const validKindSet = new Set<string>(VALID_KINDS)
  let applicantName: string | null = null
  let monthlyRent: number | null = null
  const allClassifications: { index: number; name: string; size: number; kinds: Kind[] }[] = []

  for (let bi = 0; bi < batches.length; bi++) {
    const batch = batches[bi]
    const batchStart = bi * MAX_FILES_PER_BATCH
    const result = batchResults[bi]

    if (result.status === 'fulfilled') {
      const parsed = result.value
      // Extract name/rent from the first batch that found them
      if (!applicantName && typeof parsed.applicant_name === 'string' && parsed.applicant_name.trim().length > 1) {
        applicantName = parsed.applicant_name.trim()
      }
      if (monthlyRent === null && typeof parsed.monthly_rent === 'number' && parsed.monthly_rent > 0 && parsed.monthly_rent < 100000) {
        monthlyRent = Math.round(parsed.monthly_rent)
      }
      for (let i = 0; i < batch.length; i++) {
        const globalIdx = batchStart + i
        const entry = parsed.files?.find(x => x.index === globalIdx)
        const kinds = Array.isArray(entry?.kinds)
          ? (entry!.kinds.filter(k => typeof k === 'string' && validKindSet.has(k)) as Kind[])
          : []
        allClassifications.push({ index: globalIdx, name: batch[i].name, size: batch[i].size, kinds })
      }
    } else {
      // Batch failed — still report files with empty kinds so the UI
      // doesn't show them as "unclassified forever". Filename-based
      // fallback on the frontend will handle the display.
      console.error(`[classify-files] batch ${bi} failed:`, result.reason?.message || result.reason)
      for (let i = 0; i < batch.length; i++) {
        allClassifications.push({ index: batchStart + i, name: batch[i].name, size: batch[i].size, kinds: [] })
      }
    }
  }

  return NextResponse.json({
    classifications: allClassifications,
    applicant_name: applicantName,
    monthly_rent: monthlyRent,
  })
}
