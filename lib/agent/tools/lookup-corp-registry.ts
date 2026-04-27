// Tool: lookup_corp_registry
// Fuzzy-search the local CA federal corporate registry by company name.

import type { CapabilityTool } from '../types'
import { registerTool } from '../registry'
import { canonicalizeEmployerName } from '../../forensics/arm-length'

interface LookupCorpInput {
  company_name: string
  /** Trigram similarity threshold. Default 0.7 — proven to balance recall and false-positive rate on real Canadian employers. */
  min_similarity?: number
}

interface CorpResult {
  corp_number: string | null
  jurisdiction: string | null
  display_name: string | null
  status: string | null
  is_active: boolean | null
  entity_type: string | null
  incorporation_date: string | null
  business_number: string | null
  similarity: number | null
  registry_url: string | null
}

const tool: CapabilityTool<LookupCorpInput, { found: boolean; matches: CorpResult[] }> = {
  name: 'lookup_corp_registry',
  version: '1.0.0',
  description:
    'Look up a company name in the Canadian federal corporate registry (Corporations Canada open data, ~184k corporations, OGL-Canada license). Returns up to 5 trigram-matched candidates with corp number, status, incorporation date, registered address, BN. Limited to federal CBCA/NFP/COOP/BOTA — does NOT include Ontario-only registrations or financial institutions (banks, broker-dealers). A miss does NOT mean the company is fake. ' +
    '在加拿大联邦公司注册数据库中按名称查询。命中返回最多 5 个候选。仅含联邦注册公司，不含 Ontario 省级或受金融监管机构。未命中不代表公司虚假。',
  inputSchema: {
    type: 'object',
    properties: {
      company_name: {
        type: 'string',
        description: 'Company name to search. Will be canonicalized internally (suffixes stripped).',
      },
      min_similarity: {
        type: 'number',
        minimum: 0.3,
        maximum: 1.0,
        description: 'Trigram similarity threshold. Default 0.7. Lower → more false positives.',
      },
    },
    required: ['company_name'],
  },
  needsApproval: false,
  handler: async (input, ctx) => {
    const canonical = canonicalizeEmployerName(input.company_name)
    if (!canonical || canonical.length < 2) {
      return { found: false, matches: [] }
    }
    const minSim = input.min_similarity ?? 0.7
    const { data, error } = await ctx.supabaseAdmin.rpc('search_corp_registry', {
      q: canonical,
      min_sim: minSim,
    })
    if (error) {
      ctx.log?.('warn', `search_corp_registry error: ${error.message}`)
      return { found: false, matches: [] }
    }
    const rows = (Array.isArray(data) ? data : []) as any[]
    const matches: CorpResult[] = rows.slice(0, 5).map((r) => ({
      corp_number: r.corp_number ?? null,
      jurisdiction: r.jurisdiction ?? null,
      display_name: r.display_name ?? null,
      status: r.status ?? null,
      is_active: r.is_active ?? null,
      entity_type: r.entity_type ?? null,
      incorporation_date: r.incorporation_date ?? null,
      business_number: r.business_number ?? null,
      similarity: r.similarity ?? null,
      registry_url: r.corp_number
        ? `https://ised-isde.canada.ca/cc/lgcy/cc/corporation/${r.corp_number}`
        : null,
    }))
    return { found: matches.length > 0, matches }
  },
}

registerTool(tool)
export default tool
