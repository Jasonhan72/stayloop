#!/usr/bin/env -S npx tsx
// Knowledge base · retrieval eval (design/rag-knowledge-base-plan-2026-10-27.md §4).
//   ./node_modules/.bin/tsx scripts/kb/eval.ts [--k=5] [--verbose]
// For every golden question: trigger decision + hit@k against the expected passages (source key +
// section ref, or source key + a phrase in the heading / body). Prints a table and the overall rate.
// Items with an empty `expect` assert that retrieval does NOT trigger. Exit 1 when hit@k < 0.7.
import { readFileSync } from 'node:fs'
import { kbSearch } from '../../lib/kb/search'
import { KB_DEFAULTS } from '../../lib/kb/config'
import { shouldRetrieve } from '../../lib/kb/trigger'

// Credentials: process env (CI), else .env.local (a developer by hand) — CI has no .env.local.
try {
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) { const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '').trim() }
} catch { /* CI */ }
const args = process.argv.slice(2)
const K = Number(args.find((a) => a.startsWith('--k='))?.slice(4) || 5)
const verbose = args.includes('--verbose')

type Item = { id: string; role: string; q: string; expect: [string, string][]; must: string[] }
const golden = JSON.parse(readFileSync('design/kb-golden-set-2026-10-27.json', 'utf8')) as { items: Item[] }

async function main() {
  let scored = 0, hits = 0, triggerOk = 0
  const rows: string[] = []
  for (const it of golden.items) {
    const trig = shouldRetrieve(it.q)
    if (!it.expect.length) { const ok = !trig; triggerOk += ok ? 1 : 0; rows.push(`${ok ? 'ok ' : 'BAD'}  trigger=${trig}  ${it.id}`); continue }
    if (!trig) { scored++; rows.push(`MISS  (no trigger)  ${it.id}`); continue }
    const r = await kbSearch(it.q, { ...KB_DEFAULTS, enabled: true, topK: K }, {})
    scored++
    const top = r.hits.slice(0, K)
    const matched = it.expect.filter(([key, ref]) => top.some((h) => h.source_key === key && (
      (h.section_ref || '').replace(/\s*\(\d+\/\d+\)$/, '') === ref ||
      (!/^\d/.test(ref) && (`${h.heading_path.join(' ')} ${h.body}`).toLowerCase().includes(ref.toLowerCase()))
    )))
    const ok = matched.length > 0
    hits += ok ? 1 : 0
    rows.push(`${ok ? 'hit ' : 'MISS'}  ${String(r.ms).padStart(4)}ms  ${it.id.padEnd(28)}  got: ${top.map((h) => `${h.source_key}${h.section_ref ? ' s.' + h.section_ref : ''}`).join(' | ')}`)
    if (verbose && !ok) for (const h of top) console.log(`        ${h.score.toFixed(4)} ${h.source_key} ${h.section_ref ?? '-'} ${h.heading_path.slice(-1)[0]} | ${h.body.slice(0, 100)}`)
  }
  console.log(rows.join('\n'))
  const rate = scored ? hits / scored : 0
  console.log(`\nhit@${K}: ${hits}/${scored} = ${(rate * 100).toFixed(0)}% · no-retrieval items correct: ${triggerOk}/${golden.items.filter((i) => !i.expect.length).length}`)
  process.exit(rate >= 0.7 ? 0 : 1)
}
main()
