// Knowledge base · section-level diff between two versions of a document (pure).
// Chunks are keyed by section ref (statutes) or heading path + ordinal (guides); the diff names what was
// added, removed and changed so the review queue can say「s. 116 与 s. 126 有改动」instead of「文件变了」.
export type DiffChunk = { section_ref: string | null; heading_path: string[]; ord: number; text: string }
export type SectionDiff = { added: string[]; removed: string[]; changed: string[] }

const keyOf = (c: DiffChunk) => (c.section_ref ? `s.${c.section_ref.replace(/\s*\(\d+\/\d+\)$/, '')}` : `${c.heading_path.join(' › ') || '·'}`)
const norm = (t: string) => t.replace(/\s+/g, ' ').trim()

export function diffSections(oldChunks: DiffChunk[], newChunks: DiffChunk[]): SectionDiff {
  const group = (chunks: DiffChunk[]) => {
    const m = new Map<string, string[]>()
    for (const c of [...chunks].sort((a, b) => a.ord - b.ord)) {
      const k = keyOf(c)
      m.set(k, [...(m.get(k) || []), norm(c.text)])
    }
    return m
  }
  const a = group(oldChunks), b = group(newChunks)
  const added: string[] = [], removed: string[] = [], changed: string[] = []
  for (const k of b.keys()) if (!a.has(k)) added.push(k)
  for (const k of a.keys()) if (!b.has(k)) removed.push(k)
  for (const [k, texts] of a) if (b.has(k) && b.get(k)!.join('\n') !== texts.join('\n')) changed.push(k)
  return { added, removed, changed }
}

/** 's.116' → '116' for the rule map; guide keys pass through. */
export function sectionNumbers(keys: string[]): string[] {
  return keys.map((k) => k.replace(/^s\./, ''))
}
