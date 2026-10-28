// Knowledge base · the prompt block, the citation check and the reference list (pure, no I/O).
//   kbPromptBlock(): the 【参考资料】 block with [K1]… numbered passages, under a character budget.
//   checkCitations(): every section / guideline number the reply cites must appear in the passages it
//     was given; a number it invented is rewritten to「具体条文以官方页面为准」and flagged (design §8 ⑦).
//   referenceList(): the [K]s the reply actually used → the sources shown under the reply.
import type { KbHit } from './search'

export type KbReference = { n: number; title: string; ref: string | null; url: string; date: string | null; inForce: boolean }

const PASSAGE_MAX = 1400

export function kbPromptBlock(hits: KbHit[], lang: 'zh' | 'en', maxChars = 6000): string {
  if (!hits.length) return ''
  const zh = lang === 'zh'
  const head = zh
    ? '\n\n【参考资料】下面是与这个问题相关的官方原文段落（Stayloop 知识库检索，按相关度排列，每段有编号）。规则：\n' +
      '- 引用条文、指南或表格时，只能引用这些段落里出现的条号 / 编号，并在该句末尾标注来源编号，写成 [K1] 这样；\n' +
      '- 参考资料没有覆盖的点不要编条款号，写「具体条文以官方页面为准」；\n' +
      '- 标注「尚未生效」的段落只能说「从生效日起会…」；\n' +
      '- 原文是英文，用用户的语言转述，不要整段照抄。\n'
    : '\n\n[REFERENCE PASSAGES] Official text retrieved for this question (Stayloop knowledge base, most relevant first, numbered). Rules:\n' +
      '- Cite only section / guideline / form numbers that appear in these passages, and mark the sentence with its number like [K1];\n' +
      '- For anything the passages do not cover, do not invent a section number — say the exact provision is on the official page;\n' +
      '- A passage marked "not yet in force" may only be described as what will apply from its in-force date;\n' +
      '- Paraphrase in the user\'s language; do not paste whole passages.\n'
  let used = head.length
  const lines: string[] = [head]
  hits.forEach((h, i) => {
    const date = h.consolidated_date ? (zh ? `合并至 ${h.consolidated_date}` : `consolidated ${h.consolidated_date}`) : ''
    const ref = h.section_ref ? `s. ${h.section_ref}` : (h.heading_path.slice(-1)[0] || '')
    const force = h.in_force ? '' : zh ? ' · 尚未生效' : ' · not yet in force'
    const body = h.body.length > PASSAGE_MAX ? h.body.slice(0, PASSAGE_MAX) + '…' : h.body
    const block = `[K${i + 1}] ${h.title} · ${ref}${date ? ` · ${date}` : ''}${force} · ${h.url}\n${body}\n`
    if (used + block.length > maxChars) return
    lines.push(block); used += block.length
  })
  return lines.length > 1 ? lines.join('\n') : ''
}

/** Section numbers mentioned anywhere in the passages (their own refs + cross-references like "section 126"). */
export function allowedSections(hits: KbHit[]): Set<string> {
  const out = new Set<string>()
  for (const h of hits) {
    if (h.section_ref) out.add(h.section_ref.replace(/\s*\(\d+\/\d+\)$/, ''))
    for (const m of h.body.matchAll(/\b(?:sections?|subsections?|s\.|ss\.)\s*(\d+(?:\.\d+)?)/gi)) out.add(m[1])
  }
  return out
}
export function allowedGuidelines(hits: KbHit[]): Set<string> {
  const out = new Set<string>()
  for (const h of hits) for (const m of `${h.title} ${h.heading_path.join(' ')} ${h.body}`.matchAll(/(?:Interpretation )?Guideline\s*(\d{1,2})\b/gi)) out.add(m[1])
  return out
}

// What counts as a statute citation in the reply (conservative on purpose: a bare "第 3 条" may be a lease clause).
const SECTION_CITE = /(RTA|Residential Tenancies Act|《?住宅租赁法》?|租赁法|the Act)\s*(?:的)?\s*(?:s\.|ss\.|section|第)\s*(\d+(?:\.\d+)?)\s*(?:条)?|\bs\.\s?(\d+(?:\.\d+)?)\b|\bsection\s+(\d+(?:\.\d+)?)\b/gi
const GUIDELINE_CITE = /(?:Interpretation Guideline|解释指南|指南)\s*(\d{1,2})\b/gi

export type CitationCheck = { reply: string; invented: string[] }

/** Rewrite invented section / guideline numbers; keep the rest untouched. Pure. */
export function checkCitations(reply: string, hits: KbHit[], lang: 'zh' | 'en'): CitationCheck {
  if (!hits.length) return { reply, invented: [] }
  const secs = allowedSections(hits)
  const guides = allowedGuidelines(hits)
  const invented: string[] = []
  const fallback = lang === 'zh' ? '相关条文（具体条号以官方页面为准）' : 'the relevant provision (the exact section is on the official page)'
  let out = reply.replace(SECTION_CITE, (m, _act, n1, n2, n3) => {
    const n = n1 || n2 || n3
    if (!n || secs.has(n)) return m
    invented.push(`s.${n}`)
    return fallback
  })
  out = out.replace(GUIDELINE_CITE, (m, n) => {
    if (guides.has(n)) return m
    invented.push(`guideline ${n}`)
    return lang === 'zh' ? 'LTB 解释指南（编号以官方页面为准）' : 'an LTB Interpretation Guideline (number on the official page)'
  })
  return { reply: out, invented }
}

/** "RTA s. 116" / "O. Reg. 516/06 s. 12" / "LTB 解释指南 14" — the short name a receipt line uses. */
export function shortSourceLabel(title: string, ref: string | null, lang: 'zh' | 'en'): string {
  const zh = lang === 'zh'
  let name = title
  const reg = title.match(/^O\. Reg\. (\S+)/)
  const ig = title.match(/^LTB Interpretation Guideline (\d+)/)
  if (/^Residential Tenancies Act/i.test(title)) name = 'RTA'
  else if (reg) name = `O. Reg. ${reg[1]}`
  else if (ig) name = zh ? `LTB 解释指南 ${ig[1]}` : `LTB Guideline ${ig[1]}`
  else if (/^LTB Rules of Procedure/.test(title)) name = zh ? 'LTB 程序规则' : 'LTB Rules'
  else if (/standard lease/i.test(title)) name = zh ? '标准租约指南' : 'Standard lease guide'
  else if (/Rent increase guideline/i.test(title)) name = zh ? '租金指导比例公告' : 'Rent increase guideline'
  else if (/^OHRC/.test(title)) name = zh ? 'OHRC 租房人权政策' : 'OHRC rental housing policy'
  else if (/RentSafeTO/.test(title)) name = 'RentSafeTO'
  const r = ref ? ref.replace(/^s\. /, '').replace(/\s*\(\d+\/\d+\)$/, '') : ''
  // only a bare section number joins the name — a guide's heading ("83(4)-(5) - Compensation…") does not
  return r && /^\d+(\.\d+)*$/.test(r) ? `${name} s. ${r}` : name
}

/** The receipt line: the cited references if any, else the top passages. */
export function kbReceiptLine(hits: KbHit[], refs: KbReference[], lang: 'zh' | 'en'): { zh: string; en: string } {
  const pick = refs.length ? refs.map((r) => ({ title: r.title, ref: r.ref })) : hits.slice(0, 3).map((h) => ({ title: h.title, ref: h.section_ref }))
  const uniq = (l: 'zh' | 'en') => Array.from(new Set(pick.map((p) => shortSourceLabel(p.title, p.ref, l)))).slice(0, 4)
  void lang
  return { zh: `查了法规原文：${uniq('zh').join('、')}`, en: `Checked the law text: ${uniq('en').join(', ')}` }
}

/** [K3] / [K1, K3] / [K1、K2] markers → [3] / [1, 2]; the references the reply used, in first-use order.
 *  Unused passages are not listed; a number outside the passage list is dropped. */
const MARK_RE = /(\s*)\[\s*K\s*(\d{1,2})((?:\s*[,，、;；]\s*K?\s*\d{1,2})*)\s*\]/g
export function referenceList(reply: string, hits: KbHit[]): { reply: string; refs: KbReference[] } {
  const order: number[] = []
  const nums = (first: string, rest: string) => [first, ...(rest.match(/\d{1,2}/g) || [])].map(Number)
  for (const m of reply.matchAll(MARK_RE)) for (const k of nums(m[2], m[3])) if (k >= 1 && k <= hits.length && !order.includes(k)) order.push(k)
  // site test 2026-10-28 (I-D4): two passages of one section (s.106 (1/2) and (2/2)) are one reference, not [1] and [2]
  const refOf = (h: KbHit) => ({ title: h.title, ref: h.section_ref ? `s. ${h.section_ref.replace(/\s*\(\d+\/\d+\)$/, '')}` : (h.heading_path.slice(-1)[0] || null), url: h.url.replace(/#.*$/, '') })
  const keyOf = (h: KbHit) => { const r = refOf(h); return `${r.title}|${r.ref}|${r.url}` }
  const refs: KbReference[] = []
  const numberOf = new Map<number, number>()   // hit index (1-based) → reference number
  for (const k of order) {
    const h = hits[k - 1]
    const key = keyOf(h)
    const existing = refs.find((r) => `${r.title}|${r.ref}|${r.url.replace(/#.*$/, '')}` === key)
    if (existing) { numberOf.set(k, existing.n); continue }
    const r = refOf(h)
    refs.push({ n: refs.length + 1, title: r.title, ref: r.ref, url: h.url, date: h.consolidated_date, inForce: h.in_force })
    numberOf.set(k, refs.length)
  }
  const text = reply.replace(MARK_RE, (m, ws: string, first: string, rest: string) => {
    const ns = nums(first, rest).map((k) => numberOf.get(k)).filter((n): n is number => typeof n === 'number')
    return ns.length ? `${ws ? ' ' : ''}[${Array.from(new Set(ns)).join(', ')}]` : ''
  })
  return { reply: text, refs }
}
