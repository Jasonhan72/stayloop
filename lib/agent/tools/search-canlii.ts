// -----------------------------------------------------------------------------
// Tool: search_canlii
// -----------------------------------------------------------------------------
// Search CanLII (Canadian Legal Information Institute) for a person's name
// appearing in case titles across all Ontario databases (LTB, Small Claims,
// Superior Court, Court of Appeal, Human Rights Tribunal, etc.).
//
// Free public-record. CANLII_API_KEY env var must be set.
// -----------------------------------------------------------------------------

import type { CapabilityTool } from '../types'
import { registerTool } from '../registry'

interface SearchInput {
  full_name: string
  /** Restrict to specific Ontario database codes (e.g. ['onltb', 'onscsm']). Empty = all. */
  database_ids?: string[]
}

interface CanLIIMatch {
  databaseId: string
  databaseName: string
  caseId: string
  title: string
  citation: string
  url: string
  nameInTitle: boolean
}

interface SearchOutput {
  total_hits: number
  party_hits: number
  matches: CanLIIMatch[]
  databases_searched: number
  error?: string
}

interface CanLIIDatabase {
  databaseId: string
  jurisdiction: string
  name: string
}

// Hard-coded priority Ontario databases — always queried even if list-API fails.
const PRIORITY_DBS: CanLIIDatabase[] = [
  { databaseId: 'onltb', jurisdiction: 'on', name: 'Landlord and Tenant Board' },
  { databaseId: 'onscsm', jurisdiction: 'on', name: 'Small Claims Court' },
  { databaseId: 'onsc', jurisdiction: 'on', name: 'Superior Court of Justice' },
  { databaseId: 'onscdc', jurisdiction: 'on', name: 'Divisional Court' },
  { databaseId: 'onca', jurisdiction: 'on', name: 'Court of Appeal' },
  { databaseId: 'onhrt', jurisdiction: 'on', name: 'Human Rights Tribunal' },
  { databaseId: 'oncj', jurisdiction: 'on', name: 'Ontario Court of Justice' },
]

function isValidFullName(name: string): boolean {
  const trimmed = name.trim()
  if (!trimmed) return false
  const cjkChars = (trimmed.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || []).length
  if (cjkChars >= 2) return true
  const words = trimmed.split(/\s+/).filter((w) => w.length >= 2)
  return words.length >= 2
}

/**
 * Strict check: is the tenant's full name in the case title?
 *   - CJK: exact substring (no spaces)
 *   - Latin: ALL parts must appear in title (word-boundary match)
 */
function nameMatchesTitle(searchName: string, caseTitle: string): boolean {
  const titleLower = caseTitle.toLowerCase()
  const fullLower = searchName.toLowerCase().trim()
  const cjkChars = (fullLower.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || []).length
  if (cjkChars >= 2) {
    return titleLower.includes(fullLower.replace(/\s/g, ''))
  }
  const parts = fullLower.split(/\s+/).filter((p) => p.length >= 2)
  if (parts.length < 2) return false
  return parts.every((part) => new RegExp(`\\b${part}\\b`, 'i').test(titleLower))
}

async function searchSingleDb(
  fullName: string,
  db: CanLIIDatabase,
  apiKey: string,
): Promise<CanLIIMatch[]> {
  try {
    const url =
      `https://api.canlii.org/v1/caseBrowse/en/${db.databaseId}/` +
      `?api_key=${apiKey}` +
      `&resultCount=10&offset=0` +
      `&publishedBefore=2026-12-31&publishedAfter=2015-01-01` +
      `&fullText=${encodeURIComponent(`"${fullName}"`)}`
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) })
    if (!res.ok) return []
    const data = (await res.json()) as {
      cases?: Array<{ databaseId: string; caseId: { en: string }; title: string; citation: string }>
    }
    const cases = data.cases || []
    const matches = await Promise.all(
      cases.map(async (c) => {
        const cid = c.caseId?.en || ''
        const dbId = c.databaseId || db.databaseId
        let caseUrl = `https://www.canlii.org/en/on/${dbId}/`
        if (cid) {
          // Best-effort short URL via case metadata; fallback to constructed
          try {
            const metaRes = await fetch(
              `https://api.canlii.org/v1/caseBrowse/en/${dbId}/${cid}?api_key=${apiKey}`,
              { signal: AbortSignal.timeout(4000) },
            )
            if (metaRes.ok) {
              const meta = (await metaRes.json()) as { url?: string }
              caseUrl =
                meta.url ||
                `https://www.canlii.org/en/on/${dbId}/doc/${cid.slice(0, 4)}/${cid}/${cid}.html`
            } else {
              caseUrl = `https://www.canlii.org/en/on/${dbId}/doc/${cid.slice(0, 4)}/${cid}/${cid}.html`
            }
          } catch {
            caseUrl = `https://www.canlii.org/en/on/${dbId}/doc/${cid.slice(0, 4)}/${cid}/${cid}.html`
          }
        }
        return {
          title: c.title,
          citation: c.citation,
          databaseId: dbId,
          databaseName: db.name,
          caseId: cid,
          url: caseUrl,
          nameInTitle: nameMatchesTitle(fullName, c.title),
        }
      }),
    )
    return matches.filter((m) => m.nameInTitle)
  } catch {
    return []
  }
}

const tool: CapabilityTool<SearchInput, SearchOutput> = {
  name: 'search_canlii',
  version: '2.0.0',
  description:
    'Search CanLII (Canadian Legal Information Institute) across Ontario databases (LTB, Small Claims, Superior Court, Court of Appeal, Human Rights Tribunal, etc.) for cases where the named person appears as a party in the case title. Free public records. Returns matches strictly filtered to "name appears in title" (party hits) — bare full-text matches without title presence are NOT returned. ' +
    '在 CanLII 多个安省数据库（LTB、小额法庭、高等法院、上诉法院、人权法庭等）查询当事人姓名出现在 case title 中的案件。仅返回 party hits，不返回纯全文命中。',
  inputSchema: {
    type: 'object',
    properties: {
      full_name: { type: 'string' },
      database_ids: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional list of CanLII Ontario database codes (e.g. onltb, onscsm). Empty = all priority DBs.',
      },
    },
    required: ['full_name'],
  },
  needsApproval: false,
  handler: async (input) => {
    if (!isValidFullName(input.full_name)) {
      return {
        total_hits: 0,
        party_hits: 0,
        matches: [],
        databases_searched: 0,
        error: 'invalid_name',
      }
    }
    const apiKey = process.env.CANLII_API_KEY
    if (!apiKey) {
      return {
        total_hits: 0,
        party_hits: 0,
        matches: [],
        databases_searched: 0,
        error: 'no_api_key',
      }
    }

    const filter = input.database_ids && input.database_ids.length > 0
      ? new Set(input.database_ids.map((d) => d.toLowerCase()))
      : null
    const dbs = filter
      ? PRIORITY_DBS.filter((db) => filter.has(db.databaseId))
      : PRIORITY_DBS

    const allMatches = (await Promise.all(
      dbs.map((db) => searchSingleDb(input.full_name, db, apiKey)),
    )).flat()

    return {
      total_hits: allMatches.length,
      party_hits: allMatches.filter((m) => m.nameInTitle).length,
      matches: allMatches,
      databases_searched: dbs.length,
    }
  },
}

registerTool(tool)
export default tool
