// -----------------------------------------------------------------------------
// Letter quality — the tells a human reads in ten seconds.
//
// 2026-09-12: an employment letter printed its own phone number two ways
// (416 4278441 in the header, 416 427 4881 in the body) and spelled "Human
// resourses"; the matching stubs said "Comunications Manager". Genuine HR
// letters and payroll stubs are generated from templates that do not drift
// like that. Deterministic, per document.
// -----------------------------------------------------------------------------

import type { ForensicFlag } from './types'

const MISSPELLINGS: Array<[RegExp, string]> = [
  [/\bresourses?\b/i, 'resources'], [/\bcomunications?\b/i, 'communications'], [/\brecieve[ds]?\b/i, 'receive'],
  [/\bmanagment\b/i, 'management'], [/\bseperate\b/i, 'separate'], [/\baddres\b|\badress\b/i, 'address'],
  [/\boccured\b/i, 'occurred'], [/\bwich\b/i, 'which'], [/\bbuisness\b/i, 'business'], [/\bsalery\b/i, 'salary'],
  [/\bpositon\b/i, 'position'], [/\baccomodation\b/i, 'accommodation'], [/\brefrence\b/i, 'reference'],
  [/\bsincerly\b/i, 'sincerely'], [/\bgaurantee\b/i, 'guarantee'], [/\bdefinately\b/i, 'definitely'],
  [/\bemploye\b/i, 'employee'], [/\bcompnay\b/i, 'company'], [/\bcurently\b/i, 'currently'], [/\bpermenant\b/i, 'permanent'],
  [/\bfull[- ]tiem\b/i, 'full-time'], [/\bconfrim\b/i, 'confirm'], [/\bdepartement\b/i, 'department'],
]

function phones(text: string): string[] {
  const out = new Set<string>()
  for (const m of (text || '').matchAll(/(?:\+?1[\s.-]?)?\(?([2-9]\d{2})\)?[\s.-]?(\d{3})[\s.-]?(\d{4})\b/g)) out.add(`${m[1]}${m[2]}${m[3]}`)
  return Array.from(out)
}

function editDistance1(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  const diff = [...a].map((c, i) => c !== b[i] ? i : -1).filter(i => i >= 0)
  if (diff.length === 1) return true
  if (diff.length === 2 && diff[1] === diff[0] + 1 && a[diff[0]] === b[diff[1]] && a[diff[1]] === b[diff[0]]) return true
  return false
}

/** One adjacent swap in `a`, then exactly one differing digit vs `b`. */
function swapPlusOne(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  for (let k = 0; k + 1 < a.length; k++) {
    if (a[k] === a[k + 1]) continue
    const sw = a.slice(0, k) + a[k + 1] + a[k] + a.slice(k + 2)
    let diff = 0
    for (let i = 0; i < sw.length; i++) if (sw[i] !== b[i]) diff++
    if (diff === 1) return true
  }
  return false
}

// Bilingual (Quebec / federal) stubs print French labels beside the English
// ones: "NO EMPLOYE / EMPLOYEE NO", "DEPARTEMENT / DEPARTMENT". An unaccented
// French word is not a misspelt English one (review 2026-09-19).
const FRENCH_LOOKALIKES = new Set(['employe', 'departement', 'adresse', 'addresse'])
const FRENCH_CONTEXT = /\b(?:paie|salaire|p[ée]riode|heures|taux|retenues|imp[ôo]t|brut|num[ée]ro|nom|pr[ée]nom|montant|cotisations?|f[ée]d[ée]ral|qu[ée]bec|rrq|rqap|date de|du \d|au \d)\b/gi
function isBilingualLabel(t: string, at: number, word: string, english: string): boolean {
  const eng = english.replace(/[^a-z]/gi, '').slice(0, 6)
  const after = t.slice(at + word.length, at + word.length + 30)
  const before = t.slice(Math.max(0, at - 30), at)
  if (new RegExp(`^[^/|\\n]{0,12}[/|][^/|\\n]{0,14}${eng}`, 'i').test(after)) return true
  if (new RegExp(`${eng}[^/|\\n]{0,14}[/|][^/|\\n]{0,12}$`, 'i').test(before)) return true
  if (FRENCH_LOOKALIKES.has(word.toLowerCase())) {
    if (/(?:\bn[o°º]\.?|\bnum[ée]ro(?: d['’])?|\bde l['’]|\bnom de l['’]|\bdu|\bau)\s*$/i.test(before)) return true
    const hits = new Set((t.match(FRENCH_CONTEXT) || []).map(x => x.toLowerCase()))
    if (hits.size >= 2) return true
  }
  return false
}

export function checkLetterQuality(text: string, file: string, kind: string): ForensicFlag[] {
  const flags: ForensicFlag[] = []
  const t = text || ''
  if (!t) return flags
  // 1. The letter's own phone number printed two ways.
  // Two numbers on the same exchange that differ in the last four digits,
  // and nothing else — "416 4278441" in the header, "416 427 4881" in the
  // body. A main line and a fax would be labelled; a letter typed by hand
  // drifts. One digit apart is near-certain; otherwise say which to verify.
  // A number labelled fax / télécopieur / direct / ext / cell is a second
  // line by design, not the main line printed two ways (review 2026-09-13).
  // Only a LABEL strips a number: "Fax:", "Direct line", "Ext.", "Cell:".
  // Bare "direct" / "cell" in prose ("reach me direct 416 427 4881") is
  // exactly the drifted number the rule exists for (review 2026-09-13
  // second pass).
  const PHONE = '(?:\\+?1[\\s.-]?)?\\(?[2-9]\\d{2}\\)?[\\s.-]?\\d{3}[\\s.-]?\\d{4}'
  // Review 2026-09-19: "T: 416-555-1000 F: 416-555-1001" is a labelled fax
  // (one digit apart → it read as MEDIUM), and a main line beside a
  // direct-dial on the same exchange is how every office PBX is numbered.
  // The rule now fires only on typing drift: one digit / one swap apart
  // (medium), or a swap plus one digit — the documented forged letter's
  // "416 4278441" vs "416 427 4881" (low). Two unrelated extensions on one
  // exchange (…1000 and …1234) say nothing.
  const unlabelled = t
    .replace(new RegExp(`\\b(?:fax|t[ée]l[ée]copieur|t[ée]l[ée]c\\.?|direct\\s*line|ext\\.?|extension)(?![A-Za-zÀ-ÿ])\\s*[:.#-]?\\s*${PHONE}`, 'gi'), ' ')
    .replace(new RegExp(`\\b(?:direct|cell(?:ular)?|mobile)\\s*[:#]\\s*${PHONE}`, 'gi'), ' ')
    .replace(new RegExp(`(?<![A-Za-z])F\\s*[:.]\\s*${PHONE}`, 'g'), ' ')
  const ph = phones(unlabelled)
  outer: for (let i = 0; i < ph.length; i++) for (let j = i + 1; j < ph.length; j++) {
    if (ph[i].slice(0, 6) === ph[j].slice(0, 6) && ph[i] !== ph[j]) {
      const close = editDistance1(ph[i], ph[j])
      if (!close && !swapPlusOne(ph[i], ph[j])) continue
      const fmt = (p: string) => `${p.slice(0, 3)}-${p.slice(3, 6)}-${p.slice(6)}`
      flags.push({ code: 'letter_phone_inconsistent', severity: close ? 'medium' : 'low', file,
        evidence_en: `The document prints its own contact number two different ways: ${fmt(ph[i])} and ${fmt(ph[j])}${close ? ' (one digit differs)' : ' (digits swapped and one changed)'}. A letterhead generated by the employer's system carries one number; a hand-edited letter drifts. Verify through a number found independently (registry, website), not one on the letter.`,
        evidence_zh: `文件里自己的联系电话有两种写法：${fmt(ph[i])} 与 ${fmt(ph[j])}${close ? '（一位数字不同）' : '（相邻两位对调且另有一位不同）'}。雇主系统生成的信头只有一个号码；手工改过的信才会前后不一。核实时请用独立来源（注册库、官网）的号码，不要用信上的。` })
      break outer
    }
  }
  // 2. Misspellings on a formal document.
  const found: string[] = []
  for (const [re, right] of MISSPELLINGS) {
    for (const m of t.matchAll(new RegExp(re.source, 'gi'))) {
      if (isBilingualLabel(t, m.index!, m[0], right)) continue
      found.push(`"${m[0]}" (${right})`)
      break
    }
  }
  if (found.length) {
    flags.push({ code: 'document_spelling_errors', severity: found.length >= 2 ? 'medium' : 'low', file,
      evidence_en: `${found.length} spelling error(s) on a ${kind.replace(/_/g, ' ')}: ${found.slice(0, 4).join(', ')}. HR templates and payroll software do not misspell their own field labels; typed-up documents do.`,
      evidence_zh: `${kind.includes('pay_stub') ? '工资单' : '信函'}上有 ${found.length} 处拼写错误：${found.slice(0, 4).join('、')}。HR 模板和工资软件不会拼错自己的栏目名，手打的文件才会。` })
  }
  return flags
}
