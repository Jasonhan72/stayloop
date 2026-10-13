// CRA_MODE switch (2026-10-12): registered (default) keeps every lookup;
// tool mode skips public-record lookups about the applicant and closes the
// partner screening API. See design/cra-compliance-without-registration-2026-10.md.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { craMode, personalRecordLookupsAllowed, craToolSkipQuery, CRA_TOOL_SKIP_NOTE_EN } from '@/lib/compliance/craMode'
import { courtNoteZh } from '@/lib/screening/localize'

const read = (p: string) => readFileSync(p, 'utf8')

describe('craMode module', () => {
  it('defaults to registered (current behaviour) and only "tool" switches it', () => {
    expect(craMode({})).toBe('registered')
    expect(craMode({ CRA_MODE: 'registered' })).toBe('registered')
    expect(craMode({ CRA_MODE: 'TOOL ' })).toBe('tool')
    expect(craMode({ CRA_MODE: 'anything-else' })).toBe('registered')
    expect(personalRecordLookupsAllowed({})).toBe(true)
    expect(personalRecordLookupsAllowed({ CRA_MODE: 'tool' })).toBe(false)
  })
  it('the production env does not pin a mode in the build (server env only)', () => {
    expect(process.env.CRA_MODE ?? '').not.toBe('tool')
  })
  it('skip rows are "skipped" (never counted as clear) and carry the plain-language note', () => {
    const q = craToolSkipQuery('LTB Order Catalogue — Ontario Open Data', 'https://data.ontario.ca/dataset/ltb-order-catalogue')
    expect(q.status).toBe('skipped')
    expect(q.hits).toBeNull()
    expect(q.note).toBe(CRA_TOOL_SKIP_NOTE_EN)
    expect(q.url).toContain('data.ontario.ca')
    expect(courtNoteZh(q.note)).toMatch(/未检索.*消费者报告法.*申请人自查/)
  })
})

describe('gates are wired at every personal-record lookup', () => {
  const score = read('app/api/screen-score/route.ts')
  it('court portal / CanLII, primary LTB and supplemental LTB all check the mode', () => {
    expect((score.match(/personalRecordLookupsAllowed\(\)/g) || []).length).toBeGreaterThanOrEqual(3)
    // the court-check function skips before any portal / index call
    const fn = score.slice(score.indexOf('async function runCourtRecordCheck'), score.indexOf('searchCanliiViaIndex(', score.indexOf('async function runCourtRecordCheck')))
    expect(fn).toContain('personalRecordLookupsAllowed()')
    // both LTB call sites sit after a gate
    const ltbCalls = [...score.matchAll(/searchLtbOrders\(\n/g)].map((m) => m.index!)
    expect(ltbCalls.length).toBe(2)
    for (const i of ltbCalls) expect(score.slice(i - 1200, i)).toContain('personalRecordLookupsAllowed()')
    expect(score).toContain('cra_mode: craMode()')
  })
  it('deep-check only passes the web party search in registered mode', () => {
    const deep = read('app/api/deep-check/route.ts')
    expect(deep).toContain('webSearch: personalRecordLookupsAllowed() ? makeWebIndexSearch() : undefined')
    // the Gazette lookup is about the company and stays on
    expect(deep).toMatch(/gazetteLookup\([^\n]*makeWebIndexSearch\(\)/)
  })
  it('the partner screening API closes in tool mode', () => {
    const v1 = read('app/api/v1/screen/route.ts')
    expect(v1).toContain("error: 'cra_mode_tool'")
    expect(v1).toContain('status: 503')
  })
  it('.env.example documents the switch', () => {
    expect(read('.env.example')).toContain('CRA_MODE=registered')
  })
})
