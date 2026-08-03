import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseCanliiIndexItems, searchCanliiViaIndex } from '../lib/screening/canliiIndex'

// Shape of a Custom Search JSON response, cut down to what the parser reads.
const cse = (items: Array<{ title?: string; link?: string; snippet?: string }>) => ({ items })

describe('CanLII web-index search — parsing', () => {
  it('keeps only canlii.org decision pages', () => {
    const out = parseCanliiIndexItems(cse([
      { title: 'park v Gao, 2025 ONLTB 43947', link: 'https://www.canlii.org/en/on/onltb/doc/2025/2025onltb43947/2025onltb43947.html', snippet: 'David park (the Landlord) applied…' },
      // Search/browse/legislation pages the index also holds — not decisions.
      { title: 'Search results', link: 'https://www.canlii.org/en/search/?text=x', snippet: '' },
      { title: 'RTA', link: 'https://www.canlii.org/en/on/laws/stat/so-2006-c-17/latest/', snippet: '' },
      // Another host entirely.
      { title: 'copycat', link: 'https://not-canlii.example/en/on/onltb/doc/2025/x/x.html', snippet: '' },
    ]))
    expect(out).toHaveLength(1)
    expect(out[0].title).toContain('ONLTB 43947')
  })

  it('dedupes the bilingual twin of the same decision', () => {
    const out = parseCanliiIndexItems(cse([
      { title: 'en', link: 'https://www.canlii.org/en/on/onltb/doc/2025/2025onltb1/2025onltb1.html', snippet: '' },
      { title: 'fr', link: 'https://www.canlii.org/fr/on/onltb/doc/2025/2025onltb1/2025onltb1.html', snippet: '' },
    ]))
    expect(out).toHaveLength(1)
  })

  it('survives garbage without throwing', () => {
    expect(parseCanliiIndexItems(null)).toEqual([])
    expect(parseCanliiIndexItems({})).toEqual([])
    expect(parseCanliiIndexItems(cse([{ link: 'not a url' }, {}]))).toEqual([])
  })

  it('caps the list', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({
      title: `t${i}`, link: `https://www.canlii.org/en/on/onltb/doc/2025/2025onltb${i}/2025onltb${i}.html`, snippet: '',
    }))
    expect(parseCanliiIndexItems(cse(many)).length).toBeLessThanOrEqual(10)
  })
})

describe('CanLII web-index search — the mention/party wall', () => {
  it('a mention structurally cannot reach countDebtRelevantHits', () => {
    // countDebtRelevantHits(records) counts only rows with nameInTitle set and
    // a databaseId in its allow-set. A CanliiIndexMatch carries neither field,
    // so even if index results were mis-wired into courtDetail.records, the
    // count stays zero. This test pins that shape.
    const out = parseCanliiIndexItems(cse([
      { title: 't', link: 'https://www.canlii.org/en/on/onltb/doc/2025/2025onltb1/2025onltb1.html', snippet: 's' },
    ]))
    expect(Object.keys(out[0]).sort()).toEqual(['snippet', 'title', 'url'])
  })

  it('index results are wired as hitKind mention, outside total_hits and records', () => {
    // The wall in source form: the route must attach index results as
    // indexRecords with hitKind 'mention', and must never push them into
    // courtDetail.records (the scored path) or add them to total_hits.
    const src = readFileSync(new URL('../app/api/screen-score/route.ts', import.meta.url), 'utf8')
    expect(src).toContain("hitKind: 'mention'")
    expect(src).toContain('indexRecords: idx.matches')
    expect(src).not.toMatch(/records\.push\([^)]*idx\./)
    expect(src).not.toMatch(/total_hits[^=\n]*(\+=|\+[^+])[^\n]*idx\./)
  })
})

describe('CanLII web-index search — degradation', () => {
  it('reports unconfigured without fetching when the keys are absent', async () => {
    const hadKey = process.env.GOOGLE_CSE_KEY
    const hadCx = process.env.GOOGLE_CSE_CX
    delete process.env.GOOGLE_CSE_KEY
    delete process.env.GOOGLE_CSE_CX
    try {
      let fetched = false
      const r = await searchCanliiViaIndex('David Park', (async () => { fetched = true; throw new Error('no') }) as unknown as typeof fetch)
      expect(r.status).toBe('unconfigured')
      expect(fetched).toBe(false)
    } finally {
      if (hadKey) process.env.GOOGLE_CSE_KEY = hadKey
      if (hadCx) process.env.GOOGLE_CSE_CX = hadCx
    }
  })

  it('refuses a single-token name and reports errors instead of throwing', async () => {
    process.env.GOOGLE_CSE_KEY = 'k'
    process.env.GOOGLE_CSE_CX = 'c'
    try {
      const single = await searchCanliiViaIndex('Chen', (async () => { throw new Error('must not fetch') }) as unknown as typeof fetch)
      expect(single.status).toBe('error')

      const failing = await searchCanliiViaIndex('David Park', (async () => { throw new Error('boom') }) as unknown as typeof fetch)
      expect(failing.status).toBe('error')

      const http = await searchCanliiViaIndex('David Park', (async () => new Response('quota', { status: 429 })) as unknown as typeof fetch)
      expect(http).toEqual({ status: 'error', reason: 'cse http 429' })
    } finally {
      delete process.env.GOOGLE_CSE_KEY
      delete process.env.GOOGLE_CSE_CX
    }
  })

  it('parses a successful response end to end', async () => {
    process.env.GOOGLE_CSE_KEY = 'k'
    process.env.GOOGLE_CSE_CX = 'c'
    try {
      const r = await searchCanliiViaIndex('David Park', (async () =>
        new Response(JSON.stringify(cse([
          { title: 'park v Gao', link: 'https://www.canlii.org/en/on/onltb/doc/2025/2025onltb43947/2025onltb43947.html', snippet: 'x' },
        ])), { status: 200 })) as unknown as typeof fetch)
      expect(r.status).toBe('ok')
      if (r.status === 'ok') expect(r.matches).toHaveLength(1)
    } finally {
      delete process.env.GOOGLE_CSE_KEY
      delete process.env.GOOGLE_CSE_CX
    }
  })
})
