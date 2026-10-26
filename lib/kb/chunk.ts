// Knowledge base · chunking (2026-10-27, design/rag-knowledge-base-plan-2026-10-27.md §3).
// Pure functions, no I/O: the ingest script feeds them fetched HTML, the tests feed them fixtures.
//   • chunkElaws(): an e-Laws consolidated act / regulation (the JSON `content` of
//     /laws/api/v2/legislation/en/doc-search/<statute|regulation>/<alias>) → one chunk per section,
//     long sections split at subsection boundaries. Section number = section_ref ("116"), heading
//     path = [Part, group heading, section headnote]. "Y"-classed paragraphs are not yet in force.
//   • chunkHtmlGuide(): a government guide page (LTB interpretation guideline, standard-lease guide,
//     OHRC policy, city page) → blocks split at h2/h3, capped by size at paragraph boundaries.
// Text is plain: tags stripped, entities decoded, amendment citations ("2006, c. 17, s. 1.") dropped.

export type Chunk = {
  ord: number
  headingPath: string[]
  sectionRef: string | null
  text: string
  inForce: boolean
  tokens: number
  /** e-Laws section anchor ("BK123") for a deep link; null for guide pages. */
  anchor: string | null
}

export const CHUNK_MAX_CHARS = 2400
export const CHUNK_MIN_CHARS = 80

/** ~4 chars per token for English statute text; CJK counts ~1.5 chars per token. */
export function approxTokens(text: string): number {
  const cjk = (text.match(/[㐀-鿿]/g) || []).length
  const rest = text.length - cjk
  return Math.ceil(rest / 4 + cjk / 1.5)
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#160': ' ', '#8217': '’', '#8216': '‘', '#8220': '“', '#8221': '”', '#8211': '–', '#8212': '—' }
export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    const k = e.toLowerCase()
    if (ENTITIES[k]) return ENTITIES[k]
    if (k.startsWith('#x')) return String.fromCodePoint(parseInt(k.slice(2), 16))
    if (k.startsWith('#')) return String.fromCodePoint(parseInt(k.slice(1), 10))
    return m
  })
}

/** Tags → text, whitespace collapsed. */
export function stripTags(html: string): string {
  return decodeEntities(html.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/[\s ]+/g, ' ').trim()
}

const CITATION_RE = /<span class="citation">[\s\S]*?(?=<\/p>)/g

function titleCase(s: string): string {
  return s.toLowerCase().replace(/(^|\s)(\S)/g, (m, sp: string, ch: string) => sp + ch.toUpperCase()).replace(/\bPart ([ivxlc]+)\b/i, (m, n: string) => `Part ${n.toUpperCase()}`)
}

/** Split a long text into ≤ maxChars pieces at line boundaries (lines joined by \n). */
export function splitAtLines(lines: string[], maxChars = CHUNK_MAX_CHARS): string[] {
  const out: string[] = []
  let cur: string[] = []
  let len = 0
  for (const line of lines) {
    if (cur.length && len + line.length + 1 > maxChars) { out.push(cur.join('\n')); cur = []; len = 0 }
    // A single oversize line (a 3,000-char definition list) is cut at sentence ends.
    if (line.length > maxChars) {
      for (const piece of line.match(new RegExp(`[\\s\\S]{1,${maxChars}}(?:(?<=[.;:])\\s|$)`, 'g')) || [line]) { out.push(piece.trim()) }
      continue
    }
    cur.push(line); len += line.length + 1
  }
  if (cur.length) out.push(cur.join('\n'))
  return out.filter((t) => t.trim().length > 0)
}

type ElawsSection = { ref: string | null; headnote: string | null; lines: string[]; inForce: boolean; part: string | null; heading: string | null; anchor: string | null }

const SKIP_CLASS = /^(TOC|YTOC|table|Ytable|toc\b|MsoNormal|footnoteLeft|line\b|parawindt|comment|shorttitle|chapter|regnumber|regtitle|version)/i
const BODY_CLASS = /^(Y)?(subsection|paragraph|subpara|subsubpara|clause|subclause|subsubclause|definition|Pnote|note|subdefinition|ruleb|rule)$/i

/** e-Laws consolidated act / regulation → section chunks. */
export function chunkElaws(contentHtml: string, maxChars = CHUNK_MAX_CHARS): Chunk[] {
  const cleaned = contentHtml.replace(CITATION_RE, '')
  const re = /<p\b[^>]*class="([^"]*)"[^>]*>([\s\S]*?)<\/p>/g
  const sections: ElawsSection[] = []
  let part: string | null = null
  let heading: string | null = null
  let pendingHeadnote: string | null = null
  let cur: ElawsSection | null = null
  let m: RegExpExecArray | null
  while ((m = re.exec(cleaned))) {
    const cls = m[1].trim()
    const text = stripTags(m[2])
    if (!text) continue
    if (SKIP_CLASS.test(cls)) continue
    if (/^partnum$/i.test(cls)) { part = titleCase(text.replace(/\s+/g, ' ')); heading = null; cur = null; continue }
    if (/^heading[1-3]$/i.test(cls)) { heading = text; continue }
    if (/^Y?headnote$/i.test(cls)) { pendingHeadnote = text; continue }
    if (/^Y?section$/i.test(cls)) {
      const num = text.match(/^(\d+(?:\.\d+)*)\s+/)
      const anchor = m[2].match(/<a name="(BK\d+)"/)?.[1] ?? null
      cur = { ref: num ? num[1] : null, headnote: pendingHeadnote, lines: [num ? text.slice(num[0].length) : text], inForce: !/^Y/.test(cls), part, heading, anchor }
      sections.push(cur)
      pendingHeadnote = null
      continue
    }
    if (BODY_CLASS.test(cls)) {
      if (!cur) continue // preamble paragraphs before section 1 (definitions header etc.)
      if (pendingHeadnote) { cur.lines.push(`— ${pendingHeadnote}`); pendingHeadnote = null }
      cur.lines.push(text)
      continue
    }
    // unknown class: keep as body if a section is open
    if (cur) cur.lines.push(text)
  }
  const out: Chunk[] = []
  for (const s of sections) {
    const headingPath = [s.part, s.heading, s.headnote].filter((x): x is string => !!x)
    const pieces = splitAtLines(s.lines, maxChars)
    pieces.forEach((text, i) => {
      if (text.length < CHUNK_MIN_CHARS && pieces.length === 1 && !s.ref) return
      out.push({ ord: out.length, headingPath, sectionRef: s.ref ? (pieces.length > 1 ? `${s.ref} (${i + 1}/${pieces.length})` : s.ref) : null, text, inForce: s.inForce, tokens: approxTokens(text), anchor: s.anchor })
    })
  }
  return out
}

/** The main content of a government guide page, as [heading-level, text] rows in document order.
 *  Block tags become line breaks (text that sits directly in a <div> or <section> counts too — the LTB
 *  Rules page keeps most rule text that way); headings keep their level. */
export function guideRows(html: string): { level: number; text: string }[] {
  let body = html
  const main = body.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i) || body.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i) || body.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)
  if (main) body = main[1]
  body = body.replace(/<(script|style|nav|header|footer|aside|noscript|form|svg|button|select)\b[\s\S]*?<\/\1>/gi, ' ')
  body = body.replace(/<!--[\s\S]*?-->/g, ' ')
  body = body.replace(/<h([1-4])\b[^>]*>([\s\S]*?)<\/h\1>/gi, (m, l: string, inner: string) => `\n\u0001${l}\u0002${stripTags(inner)}\n`)
  body = body.replace(/<\/?(?:p|div|section|article|li|ul|ol|td|th|tr|table|thead|tbody|dt|dd|dl|blockquote|br|hr|details|summary|figure|figcaption|h[5-6])\b[^>]*>/gi, '\n')
  const text = decodeEntities(body.replace(/<[^>]+>/g, ' '))
  const rows: { level: number; text: string }[] = []
  for (const raw of text.split('\n')) {
    const line = raw.replace(/[\s\u00a0]+/g, ' ').trim()
    if (!line) continue
    const h = line.match(/^\u0001([1-4])\u0002(.*)$/)
    if (h) { if (h[2].trim()) rows.push({ level: Number(h[1]), text: h[2].trim() }); continue }
    if (line.length < 3) continue
    rows.push({ level: 0, text: line })
  }
  return rows
}

/** Guide page → chunks split at h2/h3 (h4 stays inside), capped at maxChars. */
export function chunkHtmlGuide(html: string, docTitle: string, maxChars = CHUNK_MAX_CHARS): Chunk[] {
  const rows = guideRows(html)
  type Block = { path: string[]; lines: string[] }
  const blocks: Block[] = []
  let h1: string | null = null, h2: string | null = null, h3: string | null = null
  let cur: Block | null = null
  const open = () => { cur = { path: [h1 || docTitle, h2, h3].filter((x): x is string => !!x), lines: [] }; blocks.push(cur) }
  for (const r of rows) {
    if (r.level === 1) { h1 = r.text; h2 = null; h3 = null; cur = null; continue }
    if (r.level === 2) { h2 = r.text; h3 = null; cur = null; continue }
    if (r.level === 3) { h3 = r.text; cur = null; continue }
    if (r.level === 4) { if (!cur) open(); cur!.lines.push(`— ${r.text}`); continue }
    if (!cur) open()
    cur!.lines.push(r.text)
  }
  const out: Chunk[] = []
  for (const b of blocks) {
    for (const text of splitAtLines(b.lines, maxChars)) {
      if (text.length < CHUNK_MIN_CHARS) continue
      out.push({ ord: out.length, headingPath: b.path, sectionRef: null, text, inForce: true, tokens: approxTokens(text), anchor: null })
    }
  }
  return out
}
