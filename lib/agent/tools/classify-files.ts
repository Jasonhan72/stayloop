// -----------------------------------------------------------------------------
// Tool: classify_files
// -----------------------------------------------------------------------------
// Reference implementation showing the canonical pattern for wrapping an
// existing capability as a CapabilityTool. Subsequent tools follow the same
// shape: { name, version, description, inputSchema, outputSchema?, handler }
// + a top-level registerTool() call so the registry is populated on import.
//
// This tool currently stubs out to the existing /api/classify-files behavior.
// In Sprint 2 we'll inline the Haiku call here so tools are fully decoupled
// from the legacy route handlers.
// -----------------------------------------------------------------------------

import type { CapabilityTool, ToolContext } from '../types'
import { registerTool } from '../registry'

interface ClassifyFilesInput {
  /** Array of files (already uploaded to Supabase Storage). */
  files: Array<{
    /** Storage path under the `tenant-files` bucket. */
    path: string
    /** Original filename (used for extension-based MIME inference). */
    name: string
    /** Detected MIME type. */
    mime: string
    /** File size in bytes. */
    size?: number
  }>
}

interface ClassifyFilesOutput {
  /** Per-file detected document kinds. The same file can have multiple kinds
   *  if its content is mixed (e.g. an "application_form" with embedded
   *  "id_document" pages). */
  classifications: Array<{
    name: string
    kinds: string[]
    confidence: number
    /** When extraction is confident enough, surface the applicant name. */
    extracted_name?: string
  }>
  /** Best-guess applicant full name across all files. */
  applicant_name: string | null
}

const KINDS_REFERENCE = `Common document kinds (snake_case):
  - id_document        Government ID (DL, passport, PR card, health card)
  - application_form   Lease/rental application
  - pay_stub           Single pay period statement
  - employment_letter  Verification of employment letter
  - t4                 Canadian T4 tax slip
  - noa                Notice of Assessment from CRA
  - bank_statement     Bank account monthly statement
  - credit_report      Equifax/TransUnion credit bureau report
  - reference_letter   Former-landlord reference
  - lease              Existing or proposed lease document
  - other              Anything not matching above`

const tool: CapabilityTool<ClassifyFilesInput, ClassifyFilesOutput> = {
  name: 'classify_files',
  version: '1.0.0',
  description:
    `Classify each uploaded file into one or more rental-screening document kinds and extract the applicant's name when visible. Use this as the first step in any screening workflow. ` +
    `对每个上传文件分类（驾照/工资单/雇佣信/T4/NOA/银行流水/信用报告/推荐信/租约等）并尽量抽取申请人姓名。是 screening 流程的第一步。\n\n${KINDS_REFERENCE}`,
  inputSchema: {
    type: 'object',
    properties: {
      files: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Supabase Storage path' },
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
  outputSchema: {
    type: 'object',
    properties: {
      classifications: { type: 'array' },
      applicant_name: { type: ['string', 'null'] },
    },
  },
  needsApproval: false,
  handler: async (input, ctx) => {
    // Generate signed URLs for the legacy /api/classify-files route so we
    // can call it server-to-server. In Sprint 2 we'll inline the Haiku
    // classification here and remove this dependency.
    const signedFiles = await Promise.all(
      input.files.map(async (f) => {
        const { data } = await ctx.supabaseAdmin.storage
          .from('tenant-files')
          .createSignedUrl(f.path, 600)
        return {
          name: f.name,
          mime: f.mime,
          size: f.size,
          signedUrl: data?.signedUrl,
        }
      }),
    )

    const failed = signedFiles.filter((f) => !f.signedUrl)
    if (failed.length === input.files.length) {
      return {
        classifications: [],
        applicant_name: null,
      }
    }

    // Stub: fan out per-file using the existing classify-files HTTP handler.
    // We don't have a direct internal entry point yet; for Sprint 1 the
    // handler returns an empty classification and the caller (Logic agent
    // or screen-score) falls back to the existing pipeline. Sprint 2
    // replaces this with inline Haiku.
    return {
      classifications: signedFiles.map((f) => ({
        name: f.name,
        kinds: ['other'],
        confidence: 0,
      })),
      applicant_name: null,
    }
  },
}

registerTool(tool)

export default tool
