import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// Illegal-deposit copy has now been removed from this repo three separate
// times — it keeps coming back because it reads like normal landlord practice.
// RTA s.105 allows exactly ONE rent deposit, capped at one rent period; s.106
// caps a key deposit at replacement cost; a pet or damage deposit is illegal in
// Ontario outright, and s.14 voids no-pet clauses. So rather than fix each
// occurrence again, scan the source for the shape of the claim.
//
// The hard part is that the guardrail and the lease clause-checker must contain
// these exact terms in order to catch them, and correct copy has to be able to
// say "pet deposits are illegal". So a line only counts as a violation when it
// names the illegal thing WITHOUT saying it is unlawful — mentioning is fine,
// offering is not.

const ROOTS = ['app', 'lib', 'components']
const LEGAL_CONTEXT =
  /(违法|不合法|无效|不允许|禁止收|不构成|不属于|s\.\s?\d{1,3}|RTA|illegal|unlawful|void|banned|bans|not a |never a |prohibit)/i

function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) sourceFiles(p, acc)
    else if (/\.(ts|tsx)$/.test(e.name) && !e.name.endsWith('.spec.ts')) acc.push(p)
  }
  return acc
}

const FILES = ROOTS.flatMap((r) => sourceFiles(r))

function scan(re: RegExp): string[] {
  const hits: string[] = []
  for (const f of FILES) {
    const lines = readFileSync(f, 'utf8').split('\n')
    lines.forEach((line, i) => {
      if (re.test(line) && !LEGAL_CONTEXT.test(line)) hits.push(`${f}:${i + 1}: ${line.trim()}`)
    })
  }
  return hits
}

describe('Ontario RTA — copy that would put a landlord in breach', () => {
  it('scans a real corpus (guards against the scan silently matching nothing)', () => {
    expect(FILES.length).toBeGreaterThan(100)
  })

  it('never quotes a price for a pet or damage deposit', () => {
    // A dollar figure is what turns a mention into an offer.
    const hits = scan(
      /(pet|damage|宠物|损坏)[^\n]{0,24}(deposit|押金)[^\n]{0,24}\$\d|\$\d[^\n]{0,24}(pet|damage|宠物|损坏)[^\n]{0,16}(deposit|押金)/i,
    )
    expect(hits, `illegal deposit offered:\n${hits.join('\n')}`).toEqual([])
  })

  it('never states the rent-cap exemption as a year-built test', () => {
    // The exemption (s.6.1) turns on first residential occupancy after
    // 2018-11-15, not on when the building went up — and it never makes "any
    // increase" lawful, since an N1 served 90 days ahead is still required.
    const hits = scan(/2018\s*年?\s*(后|之后)\s*(建|建成)|built\s+(post|after)[- ]?2018|任何涨幅合法|any increase is legal/i)
    expect(hits, `wrong exemption test:\n${hits.join('\n')}`).toEqual([])
  })

  it('never presents a no-pet clause as enforceable', () => {
    const hits = scan(
      /(禁止养宠|不(允许|得|可)养宠)[^\n]{0,24}(有效|可执行|已写入)|no[- ]pets? clause[^\n]{0,24}(enforceable|binding)/i,
    )
    expect(hits, `s.14 makes these void:\n${hits.join('\n')}`).toEqual([])
  })
})
