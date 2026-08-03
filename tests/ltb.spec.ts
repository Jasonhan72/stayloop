import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  addressParts, isSearchableName, nameKey, normalizeName, partySide,
  splitApplicationCodes, splitPartyNames, unwrapHyperlink,
} from '../lib/ltb/normalize'
import { describeCodes, searchLtbOrders, summarizeLtb } from '../lib/ltb/search'

// A fake RPC standing in for search_ltb_orders. The SQL matching is verified
// against production separately; what these tests pin is the classification
// layer, where a mistake means a real applicant is wrongly penalised.
function rpcReturning(rows: unknown[]) {
  return async () => ({ data: rows, error: null })
}

const order = (over: Record<string, unknown> = {}) => ({
  file_number: 'LTB-L-000001-26',
  document_id: 'DOC-1',
  order_date: '2026-03-12',
  application_codes: ['L1'],
  application_type: 'L',
  document_type: 'Order',
  party_side: 'respondent',
  role: 'tenant',
  person_name: 'Sarah Wang',
  unit_address: '1002-111 BELMONT DR, LONDON, ON N6J4X9',
  order_pdf_url: 'https://example.invalid/order.pdf',
  match_kind: 'exact',
  similarity: 1,
  address_match: false,
  ...over,
})

describe('LTB normalisation — ingest and query must agree exactly', () => {
  it('strips accents, apostrophes and hyphens the same way on both sides', () => {
    expect(normalizeName('Zoë Bäcker-Dupré')).toBe('ZOE BACKER DUPRE')
    expect(normalizeName("O'Brien St. John")).toBe('OBRIEN ST JOHN')
    // A hyphen surviving on one side only would make this person unfindable.
    expect(normalizeName('Tina-Louise Freiburger')).toBe('TINA LOUISE FREIBURGER')
  })

  it('makes name order irrelevant', () => {
    expect(nameKey('Sarah Wang')).toBe(nameKey('WANG SARAH'))
  })

  it('splits the packed party cells the catalogue actually ships', () => {
    // 13,384 of 40,844 orders join co-respondents with " and ".
    expect(splitPartyNames('Stephen Ben Ochigba and  Chisom Isabella Ochigba'))
      .toEqual(['Stephen Ben Ochigba', 'Chisom Isabella Ochigba'])
    expect(splitPartyNames('ADRIENNE TIMAR, AGNES FARRELL, AIREN REID')).toHaveLength(3)
  })

  it('rejects placeholders and single tokens as unsearchable', () => {
    // "CURRENT TENANT" alone appears on 176 orders; matching anyone to it
    // would be a pure false positive.
    expect(isSearchableName('CURRENT TENANT')).toBe(false)
    expect(isSearchableName('CHEN')).toBe(false)
    expect(isSearchableName('SARAH WANG')).toBe(true)
  })

  it('extracts the comparable parts of an address', () => {
    expect(addressParts('1002-111 BELMONT DR, LONDON, ON N6J4X9'))
      .toEqual({ postal: 'N6J4X9', streetNo: '111', key: '111 BELMONT' })
  })

  it('unwraps the Excel formula the CSV ships its PDF links in', () => {
    // Left as-is this is both an unusable URL and a formula-injection payload.
    expect(unwrapHyperlink('=HYPERLINK("https://x/Order.pdf","View file")')).toBe('https://x/Order.pdf')
    expect(unwrapHyperlink('not a url')).toBeNull()
  })

  it('derives which side of the application a person is on', () => {
    expect(partySide('L', 'tenant')).toBe('respondent') // landlord filed against them
    expect(partySide('T', 'tenant')).toBe('applicant') // they filed
    expect(partySide('L', 'landlord')).toBe('applicant')
  })

  it('parses combined application codes', () => {
    expect(splitApplicationCodes('L1;L2')).toEqual(['L1', 'L2'])
  })
})

describe('LTB classification — the rules that protect the applicant', () => {
  it('never treats a tenant-filed application as a negative', async () => {
    // T1/T2/T5/T6 are the tenant asserting RTA rights. Scoring these down is
    // reprisal by proxy — the single most important rule in this module.
    const r = await searchLtbOrders(
      rpcReturning([order({ application_type: 'T', application_codes: ['T6'], party_side: 'applicant' })]),
      'Sarah Wang',
    )
    expect(r.as_respondent).toHaveLength(0)
    expect(r.as_applicant).toHaveLength(1)
    expect(r.corroborated).toHaveLength(0)
    expect(summarizeLtb(r, 'en')).toMatch(/No LTB order/i)
  })

  it('drops rows where the match is a LANDLORD who shares the name', async () => {
    // The catalogue's landlord column shares a name space with tenants; a
    // landlord named David Park says nothing about an applicant named David Park.
    const r = await searchLtbOrders(
      rpcReturning([order({ role: 'landlord', party_side: 'applicant', person_name: 'David Park' })]),
      'David Park',
    )
    expect(r.as_respondent).toHaveLength(0)
    expect(r.as_applicant).toHaveLength(0)
  })

  it('does not corroborate a name-only hit', async () => {
    const r = await searchLtbOrders(rpcReturning([order({ address_match: false })]), 'Sarah Wang')
    expect(r.as_respondent).toHaveLength(1)
    expect(r.corroborated).toHaveLength(0)
    expect(summarizeLtb(r, 'en')).toMatch(/namesake/i)
    expect(summarizeLtb(r, 'zh')).toMatch(/同名/)
  })

  it('corroborates only when an address the applicant declared lines up', async () => {
    const r = await searchLtbOrders(rpcReturning([order({ address_match: true })]), 'Sarah Wang')
    expect(r.corroborated).toHaveLength(1)
  })

  it('refuses to search a single-token name', async () => {
    const r = await searchLtbOrders(rpcReturning([order()]), 'Chen')
    expect(r.status).toBe('skipped')
    expect(r.as_respondent).toHaveLength(0)
  })

  it('states an order issued, never an outcome', async () => {
    // The catalogue has no disposition field. "Evicted" / "owes rent" would be
    // fabrication, in either language.
    for (const addressMatch of [true, false]) {
      const r = await searchLtbOrders(rpcReturning([order({ address_match: addressMatch })]), 'Sarah Wang')
      for (const lang of ['en', 'zh'] as const) {
        const text = summarizeLtb(r, lang)
        expect(text).not.toMatch(/evicted|eviction order granted|判定|已被驱逐|确认欠款/i)
        expect(text).toMatch(/outcome|判决结果/i)
      }
    }
  })

  it('reports both languages — no English fallback in the Chinese summary', async () => {
    for (const name of ['Chen', 'Sarah Wang']) {
      const r = await searchLtbOrders(rpcReturning([order()]), name)
      expect(summarizeLtb(r, 'zh')).not.toMatch(/[a-z]{5,}/)
    }
  })

  it('survives an RPC failure without failing the screening', async () => {
    const r = await searchLtbOrders(async () => ({ data: null, error: { message: 'boom' } }), 'Sarah Wang')
    expect(r.status).toBe('unavailable')
    expect(r.as_respondent).toEqual([])
  })

  it('explains what each application code alleges, in both languages', () => {
    expect(describeCodes(['L1'], 'en')).toMatch(/Non-payment of rent/)
    expect(describeCodes(['L1'], 'zh')).toMatch(/欠租/)
  })
})

describe('CanLII cannot be searched by name — regression guard', () => {
  it('no CanLII name/full-text query is constructed anywhere', async () => {
    // CanLII's API documents exactly these filters for caseBrowse:
    // publishedBefore/After, modifiedBefore/After, changedBefore/After,
    // decisionDateBefore/After. There is no fullText and no party search.
    // Passing one is silently ignored, and the endpoint returns that database's
    // most recent decisions — the same ones for every applicant. Verified live:
    // no fullText, a real applicant name, and "zzqqxx9988nonsense" all returned
    // byte-identical results.
    //
    // That shipped as "✓ 无记录 / CLEAR" for every applicant who ever ran a
    // screening, including one with a live LTB eviction.
    const { execSync } = await import('node:child_process')
    let hits = ''
    try {
      hits = execSync(
        `git grep -nI "fullText" -- 'app/**' 'lib/**' ':!**/*.spec.ts'`,
        { cwd: process.cwd(), encoding: 'utf8' },
      )
    } catch {
      hits = '' // git grep exits 1 when there are no matches
    }
    const offending = hits
      .split('\n')
      .filter(Boolean)
      .filter((line) => {
        // "path:lineno:code" — keep only lines whose CODE (not a comment
        // explaining why this is banned) constructs the parameter.
        const code = line.split(':').slice(2).join(':').trim()
        return code && !code.startsWith('//') && !code.startsWith('*') && !code.startsWith('/*')
      })
    expect(offending, `CanLII fullText is inert — these would silently return unrelated cases:\n${offending.join('\n')}`).toEqual([])
  })
})

describe('the court page reports what was searched, not a fixed list', () => {
  // /screening/[id]/ltb used to render eight databases — LTB, CanLII, OSB,
  // Small Claims, Construction Lien, PPSA, CRA, OHRT — each with a green check
  // and a literal 0, under "All queried · Federal + Ontario coverage". Five had
  // never been queried by this product at all. And `hasRecords` was
  // `Array.isArray(court_records_detail)`, which is an object, so the page
  // printed "0 HITS · CLEAN" on every screening regardless of the result.
  //
  // Same failure as the CanLII guard above, one layer up: an assertion of due
  // diligence that no search backs.
  const page = readFileSync(
    new URL('../app/screening/[id]/ltb/page.tsx', import.meta.url),
    'utf8',
  )
  const code = page
    .split('\n')
    .filter((l) => {
      const t = l.trim()
      return t && !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*')
    })
    .join('\n')

  it('does not name sources the product never queries', () => {
    for (const src of ['OSB', 'PPSA', 'Construction Lien', 'Superintendent of Bankruptcy']) {
      expect(code, `the page names ${src}, which nothing in this codebase searches`).not.toContain(src)
    }
  })

  it('renders the recorded per-source results instead of a constant', () => {
    expect(code).toContain('court_records_detail')
    expect(code).toContain('ltb_check')
    // The old bug in one line: an object can never be an array, so the branch
    // reading "records found" was dead and the clean branch always won.
    expect(code).not.toMatch(/Array\.isArray\(\s*court\s*\)/)
  })
})
