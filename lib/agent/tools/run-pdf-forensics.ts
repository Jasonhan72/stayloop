// Tool: run_pdf_forensics
// Wraps lib/forensics/runForensics into the agent tool registry.

import type { CapabilityTool } from '../types'
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

const tool: CapabilityTool<RunForensicsInput, any> = {
  name: 'run_pdf_forensics',
  version: '1.0.0',
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
    // Sign URLs first
    const signed = await Promise.all(
      input.files.map(async (f) => {
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
      return { error: 'no_signed_urls' }
    }
    const report = await runForensics({
      files: usable,
      applicant_name: input.applicant_name,
      applicant_phone: input.applicant_phone,
      applicant_email: input.applicant_email,
      applicant_address: input.applicant_address,
      anthropic_api_key: ctx.anthropicApiKey,
    })
    return report
  },
}

registerTool(tool)
export default tool
