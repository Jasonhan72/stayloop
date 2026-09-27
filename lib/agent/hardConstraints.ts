// Hard constraints for a home search (节点 1 · 可信, 2026-09-26).
//
// The model fills `search` from the current message; the budget / bedrooms /
// pets the person stated in an EARLIER turn live in memories, and when this
// message does not repeat them the model may leave max_price empty — then
// nothing filters and a $13,800 house sits in a $2,800 search (external
// review 2026-09-26). This layer is deterministic and runs before the search:
//
//   • the message wins (an explicit "预算 3000" / "no limit" this turn),
//   • otherwise the remembered value applies,
//   • the model can only tighten a constraint, never loosen or drop it.
//
// Pure; the turn route calls applyHardConstraints() and appends the note.
import type { MemoryItem } from './types'

export type HardConstraints = {
  max_price: number | null
  min_beds: number | null
  pets: boolean | null
  /** Which constraints came from memory rather than this message / the model. */
  from_memory: ('max_price' | 'min_beds' | 'pets')[]
  /** The person said "no limit" in this message: never apply a remembered cap. */
  no_budget_limit: boolean
}

const NUM = String.raw`\$?\s*([0-9]{1,2}(?:,[0-9]{3})+|[0-9]{3,5})(?:\s*(k|K|千))?`
const BUDGET_RES: RegExp[] = [
  new RegExp(String.raw`(?:预算|budget)[^0-9$]{0,12}${NUM}`, 'i'),
  new RegExp(String.raw`(?:under|below|max(?:imum)?|up to|不超过|以内|以下|最多|不高于)[^0-9$]{0,6}${NUM}`, 'i'),
  new RegExp(String.raw`${NUM}\s*(?:以内|以下|封顶|左右|上下|or less|max\b|a month|/\s*mo(?:nth)?)`, 'i'),
  new RegExp(String.raw`(?:租金|月租|rent)[^0-9$]{0,8}${NUM}`, 'i'),
]
const NO_LIMIT_RE = /预算不限|不限预算|没有预算(?:限制)?|no (?:budget )?limit|no max|any budget|budget(?:'s| is)? (?:not an issue|open|flexible)/i
const BEDS_RES: RegExp[] = [
  /(\d)\s*(?:居室?|房(?![东主客])|卧|睡房|bed(?:room)?s?\b|\s*br\b)/i,
  /(?:^|[^a-z])(one|two|three|four|一|两|二|三|四)\s*(?:居室?|房(?![东主客])|卧|bed(?:room)?s?\b)/i,
]
const WORD_NUM: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, '一': 1, '两': 2, '二': 2, '三': 3, '四': 4 }
const STUDIO_RE = /studio|开间|单间|bachelor/i
const PETS_YES_RE = /(?:养|有|带)(?:了|着)?(?:一|两|三|\d+)?(?:只|条)?(?:猫|狗|宠物)|(?:with|have|has|got) (?:a |my |two |2 )?(?:cat|dog|pet)/i
const PETS_NO_RE = /不养(?:猫|狗|宠物)|没有?宠物|无宠物|no pets?/i

function toNumber(raw: string, k?: string): number | null {
  const n = Number(raw.replace(/,/g, ''))
  if (!isFinite(n) || n <= 0) return null
  const v = k ? n * 1000 : n
  // Monthly rents in Ontario live between a room and a mansion; anything else is not a budget.
  return v >= 400 && v <= 60000 ? Math.round(v) : null
}

/** Budget stated in this message, or null. */
export function budgetFromText(text: string): number | null {
  for (const re of BUDGET_RES) {
    const m = re.exec(text)
    if (m) {
      const v = toNumber(m[1], m[2])
      if (v) return v
    }
  }
  return null
}

/** Bedrooms stated in this message (0 = studio), or null. */
export function bedsFromText(text: string): number | null {
  if (STUDIO_RE.test(text)) return 0
  for (const re of BEDS_RES) {
    const m = re.exec(text)
    if (m) {
      const v = /^\d$/.test(m[1]) ? Number(m[1]) : WORD_NUM[m[1].toLowerCase()]
      if (v != null && v >= 0 && v <= 6) return v
    }
  }
  return null
}

export function petsFromText(text: string): boolean | null {
  if (PETS_NO_RE.test(text)) return false
  if (PETS_YES_RE.test(text)) return true
  return null
}

const BUDGET_KEY_RE = /budget|max_price|price_cap|price_limit|预算|租金上限|rent_cap|monthly_budget/i
const BEDS_KEY_RE = /bed(room)?s?|min_beds|居室|户型|房间数/i
const PETS_KEY_RE = /\bpets?\b|has_pet|宠物|养猫|养狗/i

function memNumber(v: unknown): number | null {
  if (typeof v === 'number') return toNumber(String(v))
  if (typeof v === 'string') return budgetFromText(v) ?? (/^\$?\s*[0-9,]+\s*$/.test(v.trim()) ? toNumber(v.replace(/[$\s]/g, '')) : null)
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>
    for (const k of ['max', 'max_price', 'upper', 'limit', 'budget', 'value', 'amount']) if (o[k] != null) return memNumber(o[k])
  }
  return null
}

/** The remembered budget (max monthly rent), if any memory carries one. */
export function budgetFromMemories(memories: MemoryItem[]): number | null {
  for (const m of memories) {
    if (!BUDGET_KEY_RE.test(`${m.key} ${m.label ?? ''}`)) continue
    const v = memNumber(m.value)
    if (v) return v
  }
  return null
}

export function bedsFromMemories(memories: MemoryItem[]): number | null {
  for (const m of memories) {
    if (!BEDS_KEY_RE.test(`${m.key} ${m.label ?? ''}`) || BUDGET_KEY_RE.test(m.key)) continue
    if (typeof m.value === 'number' && m.value >= 0 && m.value <= 6) return m.value
    if (typeof m.value === 'string') { const b = bedsFromText(m.value); if (b != null) return b }
  }
  return null
}

export function petsFromMemories(memories: MemoryItem[]): boolean | null {
  for (const m of memories) {
    if (!PETS_KEY_RE.test(`${m.key} ${m.label ?? ''}`)) continue
    if (typeof m.value === 'boolean') return m.value
    if (typeof m.value === 'string') { const p = petsFromText(m.value); if (p != null) return p; if (/^(yes|true|有|是)$/i.test(m.value.trim())) return true; if (/^(no|false|无|否)$/i.test(m.value.trim())) return false }
  }
  return null
}

export type SearchLike = { max_price?: number | null; min_beds?: number | null; pets?: boolean | null }

/**
 * Merge the deterministic constraints into the model's search object.
 * Message > memory; the model may tighten (a lower cap, more bedrooms) but
 * never loosen or drop a constraint the person stated.
 */
export function applyHardConstraints(message: string, memories: MemoryItem[], search: SearchLike): { search: SearchLike; constraints: HardConstraints } {
  const noLimit = NO_LIMIT_RE.test(message)
  const msgBudget = noLimit ? null : budgetFromText(message)
  const memBudget = noLimit ? null : budgetFromMemories(memories)
  const modelBudget = typeof search.max_price === 'number' && search.max_price > 0 ? search.max_price : null
  const from_memory: HardConstraints['from_memory'] = []
  let max_price: number | null
  if (msgBudget) max_price = modelBudget && modelBudget < msgBudget ? modelBudget : msgBudget
  else if (modelBudget) max_price = memBudget && memBudget < modelBudget && !noLimit ? memBudget : modelBudget
  else if (memBudget) { max_price = memBudget; from_memory.push('max_price') }
  else max_price = null

  const msgBeds = bedsFromText(message)
  const modelBeds = typeof search.min_beds === 'number' ? search.min_beds : null
  const memBeds = bedsFromMemories(memories)
  let min_beds: number | null
  if (msgBeds != null) min_beds = modelBeds != null && modelBeds > msgBeds ? modelBeds : msgBeds
  else if (modelBeds != null) min_beds = modelBeds
  else if (memBeds != null) { min_beds = memBeds; from_memory.push('min_beds') }
  else min_beds = null

  const msgPets = petsFromText(message)
  const modelPets = typeof search.pets === 'boolean' ? search.pets : null
  const memPets = petsFromMemories(memories)
  let pets: boolean | null
  if (msgPets != null) pets = msgPets
  else if (modelPets != null) pets = modelPets
  else if (memPets === true) { pets = true; from_memory.push('pets') }
  else pets = null

  return { search: { ...search, max_price, min_beds: min_beds && min_beds > 0 ? min_beds : search.min_beds ?? null, pets }, constraints: { max_price, min_beds, pets, from_memory, no_budget_limit: noLimit } }
}

/** One deterministic line the route appends to the reply — the system, not the model, says what was filtered. */
export function constraintsNote(c: HardConstraints, zh: boolean, overBudget: number): string {
  const parts: string[] = []
  if (c.max_price) parts.push(zh ? `预算 ≤ $${c.max_price.toLocaleString()}` : `budget ≤ $${c.max_price.toLocaleString()}`)
  if (c.min_beds != null && c.min_beds > 0) parts.push(zh ? `${c.min_beds} 房以上` : `${c.min_beds}+ bedrooms`)
  if (c.pets) parts.push(zh ? '允许宠物' : 'pets allowed')
  if (!parts.length) return ''
  const mem = c.from_memory.length
    ? (zh ? `（${c.from_memory.map((k) => (k === 'max_price' ? '预算' : k === 'min_beds' ? '户型' : '宠物')).join(' / ')}来自你之前告诉我的，要改就直接说）` : ` (${c.from_memory.map((k) => (k === 'max_price' ? 'budget' : k === 'min_beds' ? 'bedrooms' : 'pets')).join(' / ')} from what you told me earlier — say so to change it)`)
    : ''
  const over = overBudget > 0
    ? (zh ? `；另有 ${overBudget} 套超预算未列，想看就说` : `; ${overBudget} over-budget listings were left out — ask to see them`)
    : ''
  return zh ? `\n\n（已按 ${parts.join(' · ')} 过滤${mem}${over}）` : `\n\n(Filtered by ${parts.join(' · ')}${mem}${over})`
}
