import { NextRequest, NextResponse } from 'next/server'

// Lightweight classification endpoint. Accepts up to MAX_TOTAL_FILES via
// multipart/form-data and returns, for each file, an array of document
// kinds Claude actually saw inside it (a single PDF can legitimately
// contain several kinds — e.g. a "Rental Application Package" that
// bundles an ID scan, a paystub, and a bank statement).
//
// We intentionally keep this in its own route so the upload UI can
// light up category badges within a few seconds of drop, without
// waiting for full scoring.
//
// 2026-06-02 (v3) — Lease classification + per-file rent extraction.
//   Background: the production "$1,400 / $4,400 instead of $4,800" bug
//   wasn't a Haiku-precision issue — it was a structural classification
//   gap. The classifier had NO 'lease' kind. Form 400 / Agreement to Lease
//   / Residential Tenancy Agreement got bucketed as 'other'. With no
//   lease-tagged anchor, the (former, top-level) monthly_rent field would
//   grab whatever rent-shaped number Sonnet noticed first — sometimes
//   from a paystub's "rent allowance" line, sometimes from an
//   application form's "current rent" field, sometimes from leftover
//   AcroForm draft data inside the lease itself.
//
//   This version:
//     • Adds 'lease' to VALID_KINDS and teaches the classifier what counts.
//     • Splits rent extraction PER-FILE: each file in files[] gets its
//       own optional rent_amount + rent_label_seen (the exact label text
//       found near the number). Non-lease files MUST return rent_amount=null.
//     • The server-side merge picks the rent ONLY from lease-classified
//       files. When multiple leases are present, it prefers the highest
//       value among them (deposits and stale-form-data values are usually
//       smaller than or equal to the actual base rent, and rents trend
//       upward at renewal — picking max gives the right answer in the
//       common cases without needing to parse dates).
//     • The prompt explicitly warns about PDF AcroForm leftover draft
//       data (e.g. an earlier version of a Form 400 that was overwritten
//       to a new rent — the text stream may still contain the old number).

export const runtime = 'edge'

const VALID_KINDS = [
  'lease',                // NEW — Form 400 / Agreement to Lease / Residential Tenancy Agreement / Standard Form
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

// Sonnet for rent extraction. The lease-table rent extraction problem
// (multi-row tables, AcroForm leftover values, parking add-ons) is where
// Haiku falls down — Sonnet's larger context window for visual layout
// and label proximity reasoning is worth the cost.
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

// Per-file output shape returned by the model
interface PerFileExtraction {
  index: number
  kinds: string[]
  /** integer dollars, only set when this file is a lease */
  rent_amount: number | null
  /** the exact label text found next to the rent number (for debugging) */
  rent_label_seen: string | null
}

// Classify a single batch of files (up to MAX_FILES_PER_BATCH).
async function classifyBatch(
  files: File[],
  startIndex: number,
  apiKey: string
): Promise<{
  files: PerFileExtraction[]
  applicant_name: string | null
  employers_visible: string[]
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
- A lease that requires the tenant to "provide a credit report, employment
  letter, paystub and ID" → label as 'lease' (this is a lease body), NOT
  id_document / employment_letter / pay_stub / credit_report just because
  those words appear in the requirements clause.
- A rental application FORM with blank fields asking for income / employer
  / SIN → label as 'other'. It only becomes an id_document/pay_stub etc.
  when the actual scanned ID or paystub PDF has been merged into the file.
- A cover letter or letter of intent referencing a credit check → 'other'.

────────────────────────────────────────────────────────────────────────
CLASSIFICATION RULES — be DECISIVE based on what you actually see in the
file. Look at the rendered visual content (header logos, form numbers,
section titles, signatures, table layouts), not just the filename.

Anti-bias: DO NOT default to 'other' just because you are uncertain.
Pick the specific kind that best matches the visual evidence. 'other' is
ONLY for documents that genuinely don't fit any specific kind below
(e.g. cover letters, a generic "rental application" form, a deposit
receipt, a banking customer-identity certificate, a vehicle/insurance
registration). If a file matches ≥ 50% of the signals listed for a
specific kind, label it as that kind.
────────────────────────────────────────────────────────────────────────

- lease: any document in the residential lease / tenancy agreement family.
  Strong visual signals (any 1 is enough):
    • Letterhead / header / footer says "Agreement to Lease", "Residential
      Tenancy Agreement", "Ontario Standard Lease", "Residential Tenancies
      Act, 2006", "OREA Form 400", "OREA Form 401", "OREA Form 410",
      "Form 400", "Form 410", or a Schedule A/B/C labeled "Agreement to
      Lease - Residential".
    • Has the OREA / Ontario Real Estate Association logo or "CREA
      REALTOR®" trademark notice in header/footer.
    • Numbered sections like "1. PREMISES", "2. TERM OF LEASE", "3. RENT",
      "4. DEPOSIT AND PREPAID RENT", "5. USE", "6. SERVICES AND COSTS".
    • Tenant and Landlord names + "the said Landlord" / "the said Tenant"
      legalese.
    • "monthly...the sum of ___ Dollars (CDN$) ___" rent clause.
  A signed, unsigned, or blank OREA form ALL count as lease. Any addendum
  / schedule attached to the lease ALSO counts as lease.

- id_document: a recognizable government photo ID is visible (driver's
  license, passport biopage, PR card, health card, Status Card). Has
  name + DOB + an ID number printed on the card itself. The image of
  the card is the evidence — typed-out "ID: G1234..." in a form body
  is NOT enough.

- employment_letter: a signed letter ON EMPLOYER LETTERHEAD stating the
  applicant's position + salary + start date + employment status
  (full-time / part-time / permanent). Includes a contact person at the
  employer (HR or manager).

- offer_letter: a job offer letter from a company with the applicant's
  name, position offered, start date, and offered compensation.

- pay_stub: a numeric pay-period statement with gross / net / YTD lines,
  deductions (CPP / EI / income tax), pay date, employer name. Visual
  layout = a table with rows for earnings, deductions, totals.

- bank_statement: a periodic bank account statement with account number,
  date range, transaction list (dated debits/credits), opening + closing
  balance. Bank name in header. NOT a "bank confirmation of identity"
  certificate (those are 'other').

- credit_report: a credit-bureau output. Can be:
    • Full B2B disclosure: score + trade lines + inquiries + public
      records + personal info, with "Equifax", "TransUnion" branding.
    • Consumer-tier export (myEquifax / Borrowell / Credit Karma):
      score gauge in 300-900 range with bureau wordmark/logo + the
      attestation "This is an Equifax credit score" / equivalent + a
      consumer-portal URL footer like my.equifax.ca/score.
  Either form is a credit_report.

- reference: a SIGNED letter from a previous landlord OR an
  employer/coworker testifying about the applicant's character /
  reliability / payment behavior. Strong signals for a landlord-
  reference letter (THIS IS A COMMON FILE THAT KEEPS LANDING AS 'other'):
    • Filename or letterhead like "Landlord Reference", "Reference Letter",
      "To Whom It May Concern" — and the body discusses a tenancy.
    • The PREVIOUS LANDLORD's name + contact info as the signatory.
    • Names the applicant as the previous TENANT.
    • Mentions a previous rental address.
    • Talks about tenancy dates, monthly rent paid, payment punctuality,
      property condition on move-out.
  Any letter matching ≥ 2 of these is a reference (NOT 'other').

- other: ONLY for documents that genuinely don't fit any of the kinds
  above. Examples that are legitimately 'other':
    • A cover letter / letter of intent
    • A blank rental application form
    • A deposit receipt or eTransfer screenshot
    • A vehicle / business / insurance registration
    • A banking "Confirmation of Identity" or "Personal Certificate of
      Identity" (PCI/ISC) — these verify identity for the bank, not for
      the landlord; they are not an id_document by themselves
    • Generic templates with no specific applicant content

Return EMPTY kinds array [] only if the file is unreadable; otherwise
return at least one kind. Prefer 'other' over [] when the file is
readable but doesn't match any specific kind.

Valid kinds: ${VALID_KINDS.join(', ')}

ALSO extract — for EACH file individually — these fields and embed them
into the per-file entry in the files[] array:

  rent_amount        | integer or null. The BASE MONTHLY RENT for the unit, in CAD
                     | (integer dollars, no $ / commas / cents). ONLY set if THIS
                     | file's "kinds" includes "lease". For non-lease files this
                     | MUST be null even if a rent-shaped number is visible.
  rent_label_seen    | string or null. The EXACT TEXT of the label printed
                     | immediately next to the rent number you picked
                     | (e.g. "monthly...the sum of", "Monthly Rent", "Base Rent",
                     | "月租", "Rent per month"). null if rent_amount is null.

ALSO at the top level:
  applicant_name     | the candidate's full legal name (string or null).
                     | Prefer values from a lease's TENANT field, then ID
                     | documents, then employment letters.

  employers_visible  | string[] (may be empty). EVERY employer or own-business
                     | company name visible anywhere in the uploaded files.
                     | Pull from these sources, in this priority order:
                     |   1. employment_letter — the company name on letterhead
                     |   2. pay_stub — the employer name printed at top
                     |   3. business / corporate registration documents that
                     |      list the applicant as Owner / Director / Officer
                     |      (this catches self-employed applicants who don't
                     |      have a paystub but have a registered company)
                     |   4. bank_statement — recurring "payroll" or "salary"
                     |      deposit lines often show the employer's name
                     |   5. lease — the "Employer" field if filled in
                     |   6. offer_letter — the offering company's name
                     | Include the FULL legal company name as printed (e.g.
                     | "ABC Consulting Inc.", "1234567 Ontario Inc.") — keep
                     | suffixes like Inc/Ltd/Corp/Limited. Deduplicate by
                     | canonical name (strip case + suffix). Cap at 3 entries
                     | (most-cited first). Return [] if nothing visible.

────────────────────────────────────────────────────────────────────────
Rent extraction — read this carefully. Past versions have grabbed parking,
deposits, leftover AcroForm draft values, or numbers from non-lease files,
returning the wrong rent and breaking the downstream affordability check.

1. **Only from lease files.** rent_amount must be null on every file whose
   kinds doesn't include "lease". Even if a paystub mentions "$1,400 rent
   allowance" or an application form has "current rent $4,400", you must
   NOT put those numbers in rent_amount. They are not the lease rent.

2. **Read the RENDERED page, not the raw text stream.** Ontario lease PDFs
   are often AcroForm (fillable PDF) documents. When a real estate agent
   revises rent during negotiation (e.g. from $5,050 down to $4,800), the
   PDF text stream often still contains the OLD value alongside the new
   one. You may see BOTH "5,050" and "4,800" inside the same Section 3.
   Look at the rendered/visible value (what's actually displayed on the
   typeset form line under "RENT: ... the sum of ___ Dollars (CDN$) ___").
   The visible number is the final agreed rent. Ignore stale values.

3. **Anchor to the label.** The rent number must sit immediately next to
   a label that means "this is the recurring monthly rent". Acceptable
   labels (case-insensitive):
     • "Monthly Rent", "Rent per month", "Rent: $", "Base Rent", "月租",
       "月租金", "每月租金"
     • In OREA Form 400 specifically: "3. RENT: The Tenant will pay to
       the said Landlord monthly and every month during the said term
       of the lease the sum of $___"
   Record the exact label text in rent_label_seen.

4. **EXCLUDE — never confuse with base rent:**
   • Section 4 "DEPOSIT AND PREPAID RENT" amount (typically equal to
     first + last month's rent, i.e. ~2× monthly rent). On a $4,800
     lease this row shows $9,600 — do NOT return $9,600.
   • Security deposit, "last month's rent" deposit considered alone,
     pet/key/cleaning deposit.
   • Parking spot rent (usually $100–$300/mo, separate line).
   • Storage / locker rent.
   • Utility deposits or monthly utility allowances.
   • Maintenance fees / condo fees paid to the corporation.
   • Annual figures: divide by 12 and round to integer ONLY if no
     monthly figure is available.

5. **Multiple monthly amounts in same lease** (e.g. "Rent $4,800 + Parking
   $100 = Total $4,900"): return ONLY the base rent ($4,800).

6. **Annual rent**: if the lease only states an annual figure, divide by
   12 and round to integer.

7. **Sanity bounds**: Toronto residential rent is typically $1,200–$10,000/mo.
   If your extracted number falls outside $500–$25,000, return null
   instead (you almost certainly grabbed the wrong row).

8. Never guess.
────────────────────────────────────────────────────────────────────────

Return ONLY this JSON (no markdown, no prose):
{
  "files": [
    {
      "index": <0-based index>,
      "kinds": ["..."],
      "rent_amount": <integer or null>,
      "rent_label_seen": "<exact label string or null>"
    },
    ...
  ],
  "applicant_name": "<name or null>",
  "employers_visible": ["<full legal company name>", ...]
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
    signal: AbortSignal.timeout(60_000), // 60s — Sonnet on multiple PDFs takes time
    body: JSON.stringify({
      model: CLASSIFIER_MODEL,
      max_tokens: 2500, // bumped — per-file output is more verbose now
      system: 'You classify uploaded rental-application documents and extract per-file rent + a top-level applicant name. Output strictly the JSON schema requested. No markdown, no prose.',
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
    const parsed = JSON.parse(text) as {
      files?: Array<{
        index?: number
        kinds?: string[]
        rent_amount?: number | null
        rent_label_seen?: string | null
      }>
      applicant_name?: string | null
      employers_visible?: string[]
    }
    return {
      files: Array.isArray(parsed.files)
        ? parsed.files.map(f => ({
            index: typeof f.index === 'number' ? f.index : -1,
            kinds: Array.isArray(f.kinds) ? f.kinds.filter((k): k is string => typeof k === 'string') : [],
            rent_amount: typeof f.rent_amount === 'number' ? f.rent_amount : null,
            rent_label_seen: typeof f.rent_label_seen === 'string' ? f.rent_label_seen : null,
          }))
        : [],
      applicant_name: typeof parsed.applicant_name === 'string' && parsed.applicant_name.trim().length > 1
        ? parsed.applicant_name.trim()
        : null,
      employers_visible: Array.isArray(parsed.employers_visible)
        ? parsed.employers_visible.filter((s): s is string => typeof s === 'string' && s.trim().length > 1).map(s => s.trim()).slice(0, 3)
        : [],
    }
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
  const employersAcc: string[] = []   // dedup of all employers_visible across batches
  const allClassifications: {
    index: number
    name: string
    size: number
    kinds: Kind[]
    rent_amount: number | null
    rent_label_seen: string | null
  }[] = []

  for (let bi = 0; bi < batches.length; bi++) {
    const batch = batches[bi]
    const batchStart = bi * MAX_FILES_PER_BATCH
    const result = batchResults[bi]

    if (result.status === 'fulfilled') {
      const parsed = result.value
      if (!applicantName && parsed.applicant_name) {
        applicantName = parsed.applicant_name
      }
      // Merge employers_visible across batches with canonical dedup so
      // "ABC Consulting" / "ABC Consulting Inc." / "ABC CONSULTING LIMITED"
      // collapse to one entry (preserve the first form seen for display).
      for (const emp of parsed.employers_visible || []) {
        const canonical = emp
          .toLowerCase()
          .replace(/\s*[,.]?\s*(incorporated|incorporée|corporation|corp|company|co|limited|limitée|ltée|ltd|inc|llc|llp|lp|pc|plc|gmbh|ag|sa)\s*\.?\s*$/i, '')
          .trim()
        const isDup = employersAcc.some(seen => {
          const s = seen
            .toLowerCase()
            .replace(/\s*[,.]?\s*(incorporated|incorporée|corporation|corp|company|co|limited|limitée|ltée|ltd|inc|llc|llp|lp|pc|plc|gmbh|ag|sa)\s*\.?\s*$/i, '')
            .trim()
          return s === canonical
        })
        if (!isDup) employersAcc.push(emp)
        if (employersAcc.length >= 3) break  // mirror Sonnet's cap
      }
      for (let i = 0; i < batch.length; i++) {
        const globalIdx = batchStart + i
        const entry = parsed.files.find(x => x.index === globalIdx)
        const kinds = entry?.kinds
          ? (entry.kinds.filter(k => validKindSet.has(k)) as Kind[])
          : []
        allClassifications.push({
          index: globalIdx,
          name: batch[i].name,
          size: batch[i].size,
          kinds,
          rent_amount: entry?.rent_amount ?? null,
          rent_label_seen: entry?.rent_label_seen ?? null,
        })
      }
    } else {
      // Batch failed — still report files with empty kinds so the UI
      // doesn't show them as "unclassified forever". Filename-based
      // fallback on the frontend will handle the display.
      console.error(`[classify-files] batch ${bi} failed:`, result.reason?.message || result.reason)
      for (let i = 0; i < batch.length; i++) {
        allClassifications.push({
          index: batchStart + i,
          name: batch[i].name,
          size: batch[i].size,
          kinds: [],
          rent_amount: null,
          rent_label_seen: null,
        })
      }
    }
  }

  // ---- Decide the top-level monthly_rent ----
  // Only rent values from files classified as 'lease' are eligible. This
  // is the structural fix for the "rent grabbed from the wrong file" bug:
  // non-lease files can't influence the chosen rent regardless of what
  // rent-shaped number Sonnet noticed in them.
  const leaseRents = allClassifications
    .filter(c => c.kinds.includes('lease' as Kind))
    .map(c => c.rent_amount)
    .filter((v): v is number => typeof v === 'number' && v >= 500 && v <= 25000)

  // When multiple leases are present (renewal + original, or current +
  // proposed), pick the largest. Rents trend upward at renewal, deposits
  // and stale-form-data leftovers tend to be smaller, so max is the
  // right tiebreaker for the common cases.
  let monthlyRent: number | null = null
  if (leaseRents.length > 0) {
    monthlyRent = Math.round(Math.max(...leaseRents))
  }

  return NextResponse.json({
    classifications: allClassifications,
    applicant_name: applicantName,
    monthly_rent: monthlyRent,
    // 2026-06-02 — Employers visible in ANY uploaded document, not just
    // paystubs / employment letters. Lets the downstream Arm's Length
    // check auto-run for self-employed applicants who only have a
    // business registration. Empty array when nothing visible — the UI
    // then falls back to its manual-input card.
    employers_visible: employersAcc,
  })
}
