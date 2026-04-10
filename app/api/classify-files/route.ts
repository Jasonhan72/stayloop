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

const MAX_FILES = 8
const MAX_BYTES = 10 * 1024 * 1024 // 10MB per file

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
  const files = rawFiles.slice(0, MAX_FILES)

  // Build content blocks for a single Claude call. Each file is
  // introduced by a text marker "FILE #<i>:" so Claude can reference
  // it unambiguously in its JSON response.
  const contentBlocks: any[] = [
    {
      type: 'text',
      text: `You are a document classifier for a Canadian rental-screening tool.
For each file below, identify which document kind(s) it actually contains.
A single PDF MAY contain multiple kinds (e.g. a rental application package
bundling an ID, a paystub and a bank statement) — list every kind you see.

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
    if (f.size > MAX_BYTES) {
      contentBlocks.push({ type: 'text', text: `\nFILE #${i}: ${f.name} — skipped (too large)` })
      continue
    }
    const buf = await f.arrayBuffer()
    const b64 = await toBase64(buf)
    contentBlocks.push({ type: 'text', text: `\nFILE #${i}: ${f.name}` })
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
      'anthropic-version': '2024-10-22',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5',
      max_tokens: 800,
      system: 'You classify uploaded rental-application documents and extract a few header fields (applicant name, monthly rent). Output strictly the JSON schema requested. No markdown, no prose.',
      messages: [{ role: 'user', content: contentBlocks }],
    }),
  })

  if (!res.ok) {
    const errText = await res.text()
    return NextResponse.json({ error: `Classifier error: ${errText.slice(0, 600)}` }, { status: 500 })
  }

  const aiData = (await res.json()) as { content?: Array<{ text: string }> }
  let text = aiData.content?.[0]?.text || '{}'
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()

  let parsed: {
    files?: { index: number; kinds: string[] }[]
    applicant_name?: string | null
    monthly_rent?: number | null
  } = {}
  try {
    parsed = JSON.parse(text)
  } catch {
    return NextResponse.json({ error: 'Classifier parse error', raw: text }, { status: 500 })
  }

  const validKindSet = new Set<string>(VALID_KINDS)
  const classifications = files.map((f, i) => {
    const entry = parsed.files?.find(x => x.index === i)
    const kinds = Array.isArray(entry?.kinds)
      ? (entry!.kinds.filter(k => typeof k === 'string' && validKindSet.has(k)) as Kind[])
      : []
    return { index: i, name: f.name, size: f.size, kinds }
  })

  const applicantName =
    typeof parsed.applicant_name === 'string' && parsed.applicant_name.trim().length > 1
      ? parsed.applicant_name.trim()
      : null
  const monthlyRent =
    typeof parsed.monthly_rent === 'number' && parsed.monthly_rent > 0 && parsed.monthly_rent < 100000
      ? Math.round(parsed.monthly_rent)
      : null

  return NextResponse.json({
    classifications,
    applicant_name: applicantName,
    monthly_rent: monthlyRent,
  })
}
