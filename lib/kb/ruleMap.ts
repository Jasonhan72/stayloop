// Knowledge base · which rules in lib/ontario/rules.ts rest on a given source section (pure).
// A rule's `statute` reads like 'RTA s.106(2)', 'O. Reg. 516/06 s.17(1)', 'O. Reg. 9/18', 'OHRC …',
// 'City of Toronto …'. A change in a source section → the rules that cite that section; a change
// anywhere in a source with no section cited (O. Reg. 9/18, OHRC, Toronto) → every rule citing it.
import { ONTARIO_RULES, type Rule } from '@/lib/ontario/rules'

export type StatuteRef = { sourceKeys: string[]; section: string | null }

/** 'RTA s.106(2)' → { sourceKeys: ['on-rta-2006'], section: '106' } ; 'O. Reg. 9/18' → whole regulation. */
export function parseStatute(statute: string): StatuteRef | null {
  const s = statute.trim()
  const sec = s.match(/\bs\.\s*(\d+(?:\.\d+)*)/)?.[1] ?? null
  if (/^RTA\b/.test(s)) return { sourceKeys: ['on-rta-2006'], section: sec }
  if (/^O\. Reg\. 516\/06/.test(s)) return { sourceKeys: ['on-reg-516-06'], section: sec }
  if (/^O\. Reg\. 517\/06/.test(s)) return { sourceKeys: ['on-reg-517-06'], section: sec }
  if (/^O\. Reg\. 9\/18/.test(s)) return { sourceKeys: ['on-reg-9-18'], section: sec }
  if (/^OHRC/.test(s)) return { sourceKeys: ['ohrc-rental-housing-policy', 'ohrc-policy-iii', 'ohrc-policy-v'], section: null }
  if (/^City of Toronto/.test(s)) return { sourceKeys: ['toronto-renovictions-bylaw'], section: null }
  if (/^LTB/.test(s)) return { sourceKeys: ['ltb-rules-of-procedure'], section: null }
  return null
}

/** Section refs of a chunk ('126 (2/5)' → '126'). */
export function baseSection(ref: string | null | undefined): string | null {
  if (!ref) return null
  return ref.replace(/\s*\(\d+\/\d+\)$/, '').trim() || null
}

/** Rule ids whose statute cites one of the changed sections of this source (or the source at all when the
 *  rule cites no section / the change has no section refs). Order = rules table order, no duplicates. */
export function rulesAffectedBy(sourceKey: string, changedSections: string[], rules: readonly Rule[] = ONTARIO_RULES): string[] {
  const changed = new Set(changedSections.map((x) => baseSection(x)).filter((x): x is string => !!x))
  const out: string[] = []
  for (const r of rules) {
    const ref = parseStatute(r.statute)
    if (!ref || !ref.sourceKeys.includes(sourceKey)) continue
    const hit = !ref.section || changed.size === 0 || changed.has(ref.section)
    if (hit && !out.includes(r.id)) out.push(r.id)
  }
  return out
}
