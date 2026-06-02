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
//
// 2026-06-02 — Rent extraction hardening:
//   - Model bumped from Haiku to Sonnet for the lease-rent question.
//     Haiku was misreading multi-line lease tables ($4800 base rent +
//     $100 parking → was returning $1400, possibly grabbing the wrong
//     row). Sonnet costs more per call but the precision matters because
//     `monthly_rent` flows directly into income_to_rent (DTI) and the
//     affordability_severe hard gate.
//   - Prompt now explicitly enumerates the rent-vs-not-rent cases and
//     requires the model to return only the BASE monthly rent for the
//     unit, never a deposit / parking / total / annualized figure.

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

// Sonnet for the lease-rent extraction. Haiku misread "$4,800 base rent +
// $100 parking" lease tables as $1,400. Sonnet handles tabular lease forms
// (OREA Form 400/410, custom condo agreements) much more reliably and the
// rent number feeds directly into the affordability hard gate.
const CLASSIFIER_MODEL = 'claude-sonnet-4-5'

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
Prefer rental application forms / leases for these, then ID documents.
- applicant_name: the candidate's full legal name (string or null).
- monthly_rent: the BASE monthly rent for the unit being applied to, in CAD
  (integer dollars, no $ / commas / cents). See "Rent extraction" below for
  rules. If unknown or no lease/agreement present, return null.

────────────────────────────────────────────────────────────────────────
Rent extraction — read this carefully. Past versions of this classifier
have confused parking / deposit / last-month with the base rent and
returned the wrong number, breaking the downstream affordability check.

1. The number you return MUST be the BASE MONTHLY RENT for the unit.
   On Ontario OREA Form 410 / Form 400 leases this is the value next to
   "Rent of $___ per month" or "Monthly Rent". On condo agreements it is
   the "Base Rent" row, separate from parking / locker / utility add-ons.

2. EXCLUDE — never confuse these with base rent:
   • Security deposit / "last month's rent" deposit (usually labeled "deposit"
     or "first and last", and is a one-time amount equal to monthly rent,
     not a separate recurring fee — do NOT add it).
   • Key deposit, pet deposit, cleaning deposit.
   • Parking spot rent (usually $100–$300/mo, listed on a separate line).
   • Storage / locker rent.
   • Utility deposits or monthly utility allowances.
   • Maintenance fees / condo fees paid to the corporation.
   • Property tax breakdowns.
   • Annual figures: if the lease only states an annual rent, divide by 12
     and round to integer.

3. If the lease shows multiple monthly amounts (e.g. "Rent $4,800 + Parking
   $100 = Total $4,900"), return ONLY the base rent ($4,800), NEVER the
   total and NEVER the add-on.

4. If the document is a bank form, ID, paystub, credit report, or anything
   that is NOT a lease / rental agreement / tenancy agreement, the rent is
   NOT available from that document — return null. Only extract rent from
   files that actually contain a lease / agreement to lease.

5. If multiple lease documents are uploaded for the same unit, prefer the
   most recent signed lease.

6. Sanity bounds: Toronto residential rent is typically $1,200–$10,000/mo.
   If your extracted number falls outside $500–$25,000, return null instead
   (you almost certainly grabbed the wrong row).

7. Show your work in scratchpad if uncertain, but the final JSON must be
   strictly the schema below. Never guess.
────────────────────────────────────────────────────────────────────────

Return ONLY this JSON (no markdown, no prose):
{
  "files": [ { "index": <0-based index>, "kinds": ["..."] }, ... ],
  "applicant_name": "<name or null>",
  "monthly_rent": <integer or null>
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
    signal: AbortSignal.timeout(45_000), // 45s — Sonnet on PDFs is slower than Haiku
    body: JSON.stringify({
      model: CLASSIFIER_MODEL,
      max_tokens: 1500,
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
      // Sanity bound matches the model prompt: $500–$25,000. Anything outside
      // that range is almost certainly the wrong row from a lease table; we
      // discard rather than pass the bad value to affordability scoring.
      if (
        monthlyRent === null &&
        typeof parsed.monthly_rent === 'number' &&
        parsed.monthly_rent >= 500 &&
        parsed.monthly_rent <= 25000
      ) {
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
