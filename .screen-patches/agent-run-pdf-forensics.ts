// -----------------------------------------------------------------------------
// 2026-06-02 — Code review §7 P1 — Runtime input validation. Hand-rolled
// type guard runs at the top of the handler before any storage call;
// throws a descriptive Error on bad input so the agent loop can surface
// the failure as a tool error and let the LLM self-correct. We avoid Zod
// here because pulling it in bumps the edge bundle by ~80 KB.
// -----------------------------------------------------------------------------
// 2026-06-02 — Code review Top 10 #2 — Path-traversal hardening for
// agent run_pdf_forensics tool: only sign storage paths the calling
// userId owns via screenings.files[].path or applications on the user's
// listings.
// -----------------------------------------------------------------------------
// Tool: run_pdf_forensics
// Wraps lib/forensics/runForensics into the agent tool registry.

import type { CapabilityTool, ToolContext } from '../types'
import { registerTool } from '../registry'
import { runForensics } from '../../forensics'

interface RunForensicsInput {
  files: Array<{
    name: string
    kind: string
    mime: string
    /** Supabase Storage path under tenant-files bucket. */
    path: string
  }>
  applicant_name?: string
  applicant_phone?: string
  applicant_email?: string
  applicant_address?: string
}

// -----------------------------------------------------------------------------
// resolveCallerOwnedPaths — security hardening for LLM-supplied storage paths
// -----------------------------------------------------------------------------
// Identical contract to lib/agent/tools/classify-files.ts. We re-declare it
// inline here rather than introducing a new shared util — the agent/tools
// layer intentionally keeps each tool self-contained (one tool ≙ one file)
// so that registry surgery stays local and the bundle tree-shakes cleanly.
async function resolveCallerOwnedPaths(
  ctx: ToolContext,
  requested: string[],
): Promise<Set<string>> {
  const allowed = new Set<string>()
  if (requested.length === 0) return allowed

  const { data: landlord, error: llErr } = await ctx.supabaseAdmin
    .from('landlords')
    .select('id')
    .eq('auth_id', ctx.userId)
    .maybeSingle()
  if (llErr || !landlord?.id) return allowed
  const landlordId = landlord.id as string

  const { data: screenings } = await ctx.supabaseAdmin
    .from('screenings')
    .select('files')
    .eq('landlord_id', landlordId)
  if (Array.isArray(screenings)) {
    for (const row of screenings) {
      const files = Array.isArray(row?.files) ? row.files : []
      for (const f of files) {
        if (f && typeof f === 'object' && typeof (f as { path?: unknown }).path === 'string') {
          allowed.add((f as { path: string }).path)
        }
      }
    }
  }

  const { data: listings } = await ctx.supabaseAdmin
    .from('listings')
    .select('id')
    .eq('landlord_id', landlordId)
  const listingIds = Array.isArray(listings)
    ? listings.map((l: { id: string }) => l.id).filter((id): id is string => typeof id === 'string')
    : []
  if (listingIds.length > 0) {
    const { data: apps } = await ctx.supabaseAdmin
      .from('applications')
      .select('files')
      .in('listing_id', listingIds)
    if (Array.isArray(apps)) {
      for (const row of apps) {
        const files = Array.isArray(row?.files) ? row.files : []
        for (const f of files) {
          if (
            f &&
            typeof f === 'object' &&
            typeof (f as { path?: unknown }).path === 'string'
          ) {
            allowed.add((f as { path: string }).path)
          }
        }
      }
    }
  }

  const intersection = new Set<string>()
  for (const p of requested) {
    if (allowed.has(p)) intersection.add(p)
  }
  return intersection
}

// §7 P1 — validate RunForensicsInput. Throws descriptive Error on failure.
function validateForensicsInput(input: unknown): asserts input is RunForensicsInput {
  if (!input || typeof input !== 'object') {
    throw new Error('run_pdf_forensics: input must be an object')
  }
  const i = input as Record<string, unknown>
  if (!Array.isArray(i.files)) {
    throw new Error('run_pdf_forensics: input.files must be an array')
  }
  if (i.files.length === 0) {
    throw new Error('run_pdf_forensics: input.files must contain at least one file')
  }
  if (i.files.length > 50) {
    throw new Error(`run_pdf_forensics: input.files contained ${i.files.length} entries (max 50)`)
  }
  for (let n = 0; n < i.files.length; n++) {
    const f = i.files[n]
    if (!f || typeof f !== 'object') {
      throw new Error(`run_pdf_forensics: input.files[${n}] must be an object`)
    }
    const r = f as Record<string, unknown>
    for (const k of ['name', 'kind', 'mime', 'path'] as const) {
      if (typeof r[k] !== 'string' || (r[k] as string).length === 0) {
        throw new Error(`run_pdf_forensics: input.files[${n}].${k} must be a non-empty string`)
      }
    }
  }
  // Optional applicant_* fields — if present, must be strings.
  for (const k of ['applicant_name', 'applicant_phone', 'applicant_email', 'applicant_address'] as const) {
    if (i[k] !== undefined && typeof i[k] !== 'string') {
      throw new Error(`run_pdf_forensics: input.${k} must be a string when present`)
    }
  }
}

const tool: CapabilityTool<RunForensicsInput, unknown> = {
  name: 'run_pdf_forensics',
  version: '1.2.0',
  description:
    'Run the full deterministic forensics pipeline on uploaded files: PDF metadata classification, text density, image-only OCR, paystub math consistency, source-specific markers (Equifax / bank Producer whitelist), cross-document entity extraction, ID number format validation. Returns per-file flags + cross-doc flags + computed hard gates + overall severity. Heuristic + math; not AI judgment. ' +
    '运行确定性取证管道：PDF 元数据、文本密度、图片型 PDF 的 OCR、工资单数学一致性、来源特定标记、跨文档实体抽取、ID 号格式校验。返回 flags + 硬门槛 + 严重度。',
  inputSchema: {
    type: 'object',
    properties: {
      files: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            kind: { type: 'string' },
            mime: { type: 'string' },
            path: { type: 'string' },
          },
          required: ['name', 'kind', 'mime', 'path'],
        },
      },
      applicant_name: { type: 'string' },
      applicant_phone: { type: 'string' },
      applicant_email: { type: 'string' },
      applicant_address: { type: 'string' },
    },
    required: ['files'],
  },
  needsApproval: false,
  handler: async (input, ctx) => {
    // §7 P1 — validate LLM-supplied shape before anything else runs.
    validateForensicsInput(input)

    // Ownership check — restrict the LLM-supplied paths to ones the caller
    // actually owns. Prevents prompt-injection from running forensics over
    // (and exfiltrating signed URLs of) other tenants' documents.
    const requestedPaths = input.files.map((f) => f.path)
    const allowedPaths = await resolveCallerOwnedPaths(ctx, requestedPaths)
    const filtered = input.files.filter((f) => allowedPaths.has(f.path))
    const deniedCount = input.files.length - filtered.length

    // Sign URLs first (owned paths only)
    const signed = await Promise.all(
      filtered.map(async (f) => {
        const { data } = await ctx.supabaseAdmin.storage
          .from('tenant-files')
          .createSignedUrl(f.path, 600)
        return {
          name: f.name,
          kind: f.kind,
          mime: f.mime,
          signed_url: data?.signedUrl || '',
        }
      }),
    )
    const usable = signed.filter((s) => s.signed_url)
    if (usable.length === 0) {
      return {
        error: 'no_signed_urls',
        denied_unauthorized_paths: deniedCount > 0 ? deniedCount : undefined,
      }
    }
    const report = await runForensics({
      files: usable,
      applicant_name: input.applicant_name,
      applicant_phone: input.applicant_phone,
      applicant_email: input.applicant_email,
      applicant_address: input.applicant_address,
      anthropic_api_key: ctx.anthropicApiKey,
    })
    if (deniedCount > 0) {
      // Stamp the denial count onto the report so downstream UI can show
      // a "we ignored N paths that didn't belong to you" line if needed.
      // ForensicsReport is an object; spread is safe.
      return { ...(report as object), denied_unauthorized_paths: deniedCount }
    }
    return report
  },
}

registerTool(tool)
export default tool
