// Tool: search_ontario_portal
// Search Ontario Courts Public Portal (Civil & Small Claims Court).
// Stub for Sprint 1.

import type { CapabilityTool } from '../types'
import { registerTool } from '../registry'

interface SearchPortalInput {
  full_name: string
}

interface PortalMatch {
  caseNumber: string
  caseTitle: string
  caseCategory: string
  filedDate: string
  partyRole: string
  partyDisplayName: string
  closedFlag: boolean
  caseInstanceUUID?: string
  detailUrl?: string
}

interface SearchPortalOutput {
  matches: PortalMatch[]
  total_elements: number
  error?: string
}

const tool: CapabilityTool<SearchPortalInput, SearchPortalOutput> = {
  name: 'search_ontario_portal',
  version: '1.0.0',
  description:
    'Search Ontario Courts Public Portal (courts.ontario.ca) for the named person as a party in Civil and Small Claims Court cases. Uses tiered exact-match (10462) → swap (last-first reversed) → fuzzy fallback (300054), with surname-position validation to kill false positives like "XIONG YI" matching "ZHENG, YI XIONG". Returns case detail with direct portal URL. ' +
    '在安省法院公开门户搜索某人在 Civil/Small Claims 案件中的当事人记录。三级搜索 + 姓氏位置过滤防止误匹配。',
  inputSchema: {
    type: 'object',
    properties: {
      full_name: { type: 'string' },
    },
    required: ['full_name'],
  },
  needsApproval: false,
  handler: async (input, ctx) => {
    ctx.log?.('info', `search_ontario_portal stub called for "${input.full_name}"`)
    return {
      matches: [],
      total_elements: 0,
      error: 'sprint_1_stub: inline implementation pending Sprint 2',
    }
  },
}

registerTool(tool)
export default tool
