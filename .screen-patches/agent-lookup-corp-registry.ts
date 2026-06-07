// -----------------------------------------------------------------------------
// 2026-06-02 — Code review §7 P1 — Runtime input validation. Hand-rolled
// type guard runs at the top of the handler; throws a descriptive Error
// on bad input so the agent loop surfaces a tool error and the LLM can
// self-correct. Avoids pulling Zod into the edge bundle.
// -----------------------------------------------------------------------------
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

// §7 P1 — validator. Throws on bad shape; the message format mirrors the
// other agent tools so the agent loop's error renderer is consistent.
function validateLookupCorpInput(input: unknown): asserts input is LookupCorpInput {
  if (!input || typeof input !== 'object') {
    throw new Error('lookup_corp_registry: input must be an object')
  }
  const i = input as Record<string, unknown>
  if (typeof i.company_name !== 'string' || i.company_name.length === 0) {
    throw new Error('lookup_corp_registry: input.company_name must be a non-empty string')
  }
  if (i.company_name.length > 500) {
    throw new Error(
      `lookup_corp_registry: input.company_name is ${i.company_name.length} chars (max 500)`,
    )
  }
  if (i.min_similarity !== undefined) {
    if (typeof i.min_similarity !== 'number') {
      throw new Error('lookup_corp_registry: input.min_similarity must be a number when present')
    }
    if (i.min_similarity < 0.3 || i.min_similarity > 1.0) {
      throw new Error(
        `lookup_corp_registry: input.min_similarity must be between 0.3 and 1.0 (got ${i.min_similarity})`,
      )
    }
  }
}

const tool: CapabilityTool<LookupCorpInput, { found: boolean; matches: CorpResult[] }> = {
  name: 'lookup_corp_registry',
  // Bumped from 1.0.0 to mark the validation addition for the audit log.
  version: '1.1.0',
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
    // §7 P1 — validate first.
    validateLookupCorpInput(input)

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
    const rows = (Array.isArray(data) ? data : []) as Array<Record<string, unknown>>
    const matches: CorpResult[] = rows.slice(0, 5).map((r) => ({
      corp_number: (r.corp_number as string | null) ?? null,
      jurisdiction: (r.jurisdiction as string | null) ?? null,
      display_name: (r.display_name as string | null) ?? null,
      status: (r.status as string | null) ?? null,
      is_active: (r.is_active as boolean | null) ?? null,
      entity_type: (r.entity_type as string | null) ?? null,
      incorporation_date: (r.incorporation_date as string | null) ?? null,
      business_number: (r.business_number as string | null) ?? null,
      similarity: (r.similarity as number | null) ?? null,
      registry_url: r.corp_number
        ? `https://ised-isde.canada.ca/cc/lgcy/cc/corporation/${r.corp_number as string}`
        : null,
    }))
    return { found: matches.length > 0, matches }
  },
}

registerTool(tool)
export default tool
