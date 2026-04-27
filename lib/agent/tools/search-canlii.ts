// Tool: search_canlii
// Search CanLII (all Ontario databases) for a person's name as a party.
// Stub for Sprint 1 — extracts logic from /api/screen-score in Sprint 2.

import type { CapabilityTool } from '../types'
import { registerTool } from '../registry'

interface SearchCanLIIInput {
  full_name: string
  /** Optional: limit to specific Ontario database codes. Default = all. */
  database_ids?: string[]
}

interface CanLIIMatch {
  databaseId: string
  databaseName: string
  caseId: string
  title: string
  citation: string
  url: string | null
  decisionDate: string | null
  nameInTitle: boolean
}

interface SearchCanLIIOutput {
  total_hits: number
  party_hits: number  // hits where name explicitly appears in case title
  matches: CanLIIMatch[]
  databases_searched: number
  error?: string
}

const tool: CapabilityTool<SearchCanLIIInput, SearchCanLIIOutput> = {
  name: 'search_canlii',
  version: '1.0.0',
  description:
    'Search CanLII (Canadian Legal Information Institute) across all Ontario databases (LTB, Small Claims, Superior Court, Court of Appeal, etc.) for a person\'s name appearing in case titles. Free, public-record. Returns matched cases with database, title, citation, decision date. Filters strictly to "name in case title" (party hits) — bare full-text matches without title presence are not returned. ' +
    '在 CanLII 所有安省数据库中查询姓名作为当事人出现的案件。仅返回名字明确出现在 case title 中的"party hits"。',
  inputSchema: {
    type: 'object',
    properties: {
      full_name: {
        type: 'string',
        description: 'Full legal name to search. CJK names supported (exact substring), Latin names (all parts must appear in title).',
      },
      database_ids: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional list of CanLII database codes (onltb, onscsm, onsc, etc.). Default = all Ontario.',
      },
    },
    required: ['full_name'],
  },
  needsApproval: false,
  handler: async (input, ctx) => {
    // Sprint 1: stub. Sprint 2 will inline the CanLII calls from
    // app/api/screen-score/route.ts so this tool is fully self-contained.
    // For now, the legacy screen-score route still drives CanLII and the
    // result is read from the screening row.
    ctx.log?.('info', `search_canlii stub called for "${input.full_name}"`)
    return {
      total_hits: 0,
      party_hits: 0,
      matches: [],
      databases_searched: 0,
      error: 'sprint_1_stub: inline implementation pending Sprint 2',
    }
  },
}

registerTool(tool)
export default tool
