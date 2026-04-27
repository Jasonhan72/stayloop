// Tool: lookup_bn
// Reverse-lookup a Canada Revenue Agency Business Number against the
// federal corporate registry to verify the registered company name.

import type { CapabilityTool } from '../types'
import { registerTool } from '../registry'

interface LookupBnInput {
  /** 9-digit BN core (RT/RP suffix optional and ignored for lookup). */
  business_number: string
}

interface LookupBnOutput {
  found: boolean
  bn: string
  registered_name: string | null
  registered_jurisdiction: string | null
  is_active: boolean | null
  incorporation_date: string | null
}

const tool: CapabilityTool<LookupBnInput, LookupBnOutput> = {
  name: 'lookup_bn',
  version: '1.0.0',
  description:
    'Reverse-lookup a CRA Business Number (9-digit core, e.g. 123456789) against the federal corporate registry. Returns the registered company name + jurisdiction + active status. Critical for verifying employment letters: if the letter prints a BN that resolves to a DIFFERENT company than the claimed employer, that is a strong forgery signal. ' +
    '反查 CRA 商业编号 (9 位)。返回联邦注册的公司名 + 状态。如果雇佣信印的 BN 对应的公司与声称雇主不同，是伪造的强信号。',
  inputSchema: {
    type: 'object',
    properties: {
      business_number: {
        type: 'string',
        pattern: '^\\d{9}',
        description: '9-digit CRA Business Number. RT/RP/RC suffix is optional and ignored.',
      },
    },
    required: ['business_number'],
  },
  needsApproval: false,
  handler: async (input, ctx) => {
    const bn = (input.business_number || '').replace(/\D/g, '').slice(0, 9)
    if (bn.length !== 9) {
      return {
        found: false,
        bn,
        registered_name: null,
        registered_jurisdiction: null,
        is_active: null,
        incorporation_date: null,
      }
    }
    const { data, error } = await ctx.supabaseAdmin.rpc('lookup_corp_by_bn', { bn })
    if (error) {
      ctx.log?.('warn', `lookup_corp_by_bn error: ${error.message}`)
      return {
        found: false,
        bn,
        registered_name: null,
        registered_jurisdiction: null,
        is_active: null,
        incorporation_date: null,
      }
    }
    const rows = Array.isArray(data) ? data : []
    if (rows.length === 0) {
      return {
        found: false,
        bn,
        registered_name: null,
        registered_jurisdiction: null,
        is_active: null,
        incorporation_date: null,
      }
    }
    // Prefer active corp when multiple rows resolve to same BN
    const best = rows.find((r: any) => r.is_active === true) || rows[0]
    return {
      found: true,
      bn,
      registered_name: best.display_name ?? null,
      registered_jurisdiction: best.jurisdiction ?? null,
      is_active: best.is_active ?? null,
      incorporation_date: best.incorporation_date ?? null,
    }
  },
}

registerTool(tool)
export default tool
