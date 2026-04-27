// -----------------------------------------------------------------------------
// Tool: classify_files
// -----------------------------------------------------------------------------
// Classify uploaded documents into rental-screening kinds (id_document,
// pay_stub, employment_letter, bank_statement, credit_report, t4, noa,
// reference_letter, lease, other). Also extracts the applicant name and
// monthly rent if visible on any of the documents.
//
// Implementation: directly calls Claude Haiku with each file as a document
// content block (URL or base64). No dependency on the legacy
// /api/classify-files HTTP route — the tool is fully self-contained so an
// agent can call it without going back through the route layer.
// -----------------------------------------------------------------------------

import type { CapabilityTool } from '../types'
import { registerTool } from '../registry'

const HAIKU_MODEL = 'claude-haiku-4-5'
const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages'

const VALID_KINDS = [
  'id_document',
  'application_form',
  'pay_stub',
  'employment_letter',
  't4',
  'noa',
  'bank_statement',
  'credit_report',
  'reference_letter',
  'lease',
  'other',
] as const

const MAX_FILES_PER_BATCH = 5

interface ClassifyInput {
  files: Array<{
    path: string
    name: string
    mime: string
    size?: number
  }>
}

interface ClassifyOutput {
  classifications: Array<{
    name: string
    kinds: string[]
    confidence: number
  }>
  applicant_name: string | null
  monthly_rent: number | null
  errors: string[]
}

const CLASSIFY_PROMPT = `You are a document classifier for a Canadian rental screening tool.

For each file, identify which document kind(s) it contains. A single PDF may contain multiple kinds (e.g. a rental application package bundling an ID + paystub + bank statement) — list every kind you see.

Valid kinds: ${VALID_KINDS.join(', ')}

ALSO extract — if visible in any uploaded document — the following fields. Prefer rental application forms first, then ID documents, then other sources.
- applicant_name: the applicant's full legal name as printed
- monthly_rent: monthly rent for the unit (CAD, number only). If only annual is shown, divide by 12. null if unknown.

Return ONLY this JSON (no markdown, no prose):
{
  "files": [ { "index": <0-based index>, "kinds": ["..."], "confidence": <0..1> }, ... ],
  "applicant_name": "<name or null>",
  "monthly_rent": <number or null>
}`

async function classifyBatch(
  signed: Array<{ url: string; mime: string; name: string }>,
  apiKey: string,
): Promise<{
  files?: Array<{ index: number; kinds: string[]; confidence?: number }>
  applicant_name?: string | null
  monthly_rent?: number | null
}> {
  const content: any[] = [{ type: 'text', text: CLASSIFY_PROMPT }]
  for (let i = 0; i < signed.length; i++) {
    const f = signed[i]
    if (f.mime === 'application/pdf') {
      content.push({ type: 'text', text: `\nFile #${i}: ${f.name}` })
      content.push({ type: 'document', source: { type: 'url', url: f.url } })
    } else if (f.mime.startsWith('image/')) {
      content.push({ type: 'text', text: `\nFile #${i}: ${f.name}` })
      content.push({ type: 'image', source: { type: 'url', url: f.url } })
    }
  }

  const res = await fetch(ANTHROPIC_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: HAIKU_MODEL,
      max_tokens: 1500,
      messages: [
        { role: 'user', content },
        { role: 'assistant', content: '{' },
      ],
    }),
    signal: AbortSignal.timeout(40_000),
  })
  if (!res.ok) throw new Error(`haiku_${res.status}`)
  const json: any = await res.json()
  const raw = (json?.content?.[0]?.text || '').trim()
  const text = raw.startsWith('{') ? raw : '{' + raw
  // Defensive: balanced-brace extraction
  const braceMatch = extractBalancedJson(text)
  if (!braceMatch) throw new Error('no_json')
  return JSON.parse(braceMatch.replace(/,(\s*[}\]])/g, '$1'))
}

function extractBalancedJson(s: string): string | null {
  const start = s.indexOf('{')
  if (start < 0) return null
  let depth = 0
  let inStr = false
  let escape = false
  for (let i = start; i < s.length; i++) {
    const c = s[i]
    if (escape) {
      escape = false
      continue
    }
    if (c === '\\') {
      escape = true
      continue
    }
    if (c === '"') {
      inStr = !inStr
      continue
    }
    if (inStr) continue
    if (c === '{') depth++
    else if (c === '}') {
      depth--
      if (depth === 0) return s.slice(start, i + 1)
    }
  }
  return null
}

const tool: CapabilityTool<ClassifyInput, ClassifyOutput> = {
  name: 'classify_files',
  version: '2.0.0',
  description:
    `Classify each uploaded file into one or more Canadian rental-screening document kinds and extract the applicant name + monthly rent when visible. Use this as the FIRST step in any screening workflow — other tools depend on knowing which file is the ID, which is the pay stub, etc. Valid kinds: ${VALID_KINDS.join(', ')}. ` +
    `对每个上传文件分类（驾照/工资单/雇佣信/T4/NOA/银行流水/信用报告/推荐信/租约等），并尽量抽取申请人姓名和月租金。是 screening 流程的第一步。`,
  inputSchema: {
    type: 'object',
    properties: {
      files: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Supabase Storage path under tenant-files bucket' },
            name: { type: 'string' },
            mime: { type: 'string' },
            size: { type: 'integer' },
          },
          required: ['path', 'name', 'mime'],
        },
      },
    },
    required: ['files'],
  },
  needsApproval: false,
  handler: async (input, ctx) => {
    if (!ctx.anthropicApiKey) {
      return {
        classifications: input.files.map((f) => ({ name: f.name, kinds: ['other'], confidence: 0 })),
        applicant_name: null,
        monthly_rent: null,
        errors: ['no_api_key'],
      }
    }

    // Sign URLs
    const signed = await Promise.all(
      input.files.map(async (f) => {
        const { data } = await ctx.supabaseAdmin.storage
          .from('tenant-files')
          .createSignedUrl(f.path, 600)
        return data?.signedUrl
          ? { url: data.signedUrl, mime: f.mime, name: f.name, idx: input.files.indexOf(f) }
          : null
      }),
    )
    const usable = signed.filter((s): s is NonNullable<typeof s> => !!s)

    if (usable.length === 0) {
      return {
        classifications: [],
        applicant_name: null,
        monthly_rent: null,
        errors: ['no_signed_urls'],
      }
    }

    // Batch classify (Haiku has tight per-call file count tolerance)
    const errors: string[] = []
    const fileResults: Map<string, { kinds: string[]; confidence: number }> = new Map()
    let applicantName: string | null = null
    let monthlyRent: number | null = null

    for (let i = 0; i < usable.length; i += MAX_FILES_PER_BATCH) {
      const batch = usable.slice(i, i + MAX_FILES_PER_BATCH)
      try {
        const result = await classifyBatch(batch, ctx.anthropicApiKey)
        if (result.applicant_name && !applicantName) applicantName = result.applicant_name
        if (typeof result.monthly_rent === 'number' && !monthlyRent) monthlyRent = result.monthly_rent
        for (const r of result.files || []) {
          const item = batch[r.index]
          if (item) {
            const kinds = r.kinds.filter((k) => (VALID_KINDS as readonly string[]).includes(k))
            fileResults.set(item.name, {
              kinds: kinds.length > 0 ? kinds : ['other'],
              confidence: r.confidence ?? 0.7,
            })
          }
        }
      } catch (e: any) {
        errors.push(`batch_${i}: ${e?.message?.slice(0, 100) || 'failed'}`)
        // Mark unclassified files as 'other' so downstream still has a kind
        for (const item of batch) {
          if (!fileResults.has(item.name)) {
            fileResults.set(item.name, { kinds: ['other'], confidence: 0 })
          }
        }
      }
    }

    return {
      classifications: input.files.map((f) => ({
        name: f.name,
        kinds: fileResults.get(f.name)?.kinds || ['other'],
        confidence: fileResults.get(f.name)?.confidence ?? 0,
      })),
      applicant_name: applicantName,
      monthly_rent: monthlyRent,
      errors,
    }
  },
}

registerTool(tool)
export default tool
