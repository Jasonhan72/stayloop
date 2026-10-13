// Quick publish (2026-10-13, V0.8 item 2 step 1): the landlord gives three
// things — address, rent, photos — and a vision model reads the photos for the
// rest. Everything here is deterministic: the prompt, the vocabulary the model
// may answer with, and the parser that refuses anything outside it. The model
// never answers policy questions (pets / smoking / utilities / lease term /
// deposit): those are asked of the landlord, because they are not visible in a
// photo and inventing them is exactly what sanitizeDraftListing exists to stop.

export const QUICK_PHOTO_MAX = 12
/** Photos sent to the model (the rest are stored but not read). */
export const QUICK_VISION_PHOTOS = 8
/** Per-photo cap on the base64 payload the route accepts (~1.5 MB raw). */
export const QUICK_PHOTO_MAX_B64 = 2_100_000

export const PROPERTY_TYPES = ['condo', 'apartment', 'house', 'townhouse', 'basement', 'room'] as const
export type QuickPropertyType = (typeof PROPERTY_TYPES)[number]

/** Amenity ids the model may name — the wizard's ids plus what a photo can actually show. */
export const AMENITY_VOCAB: { id: string; zh: string; en: string }[] = [
  { id: 'in_unit_laundry', zh: '套内洗衣', en: 'In-unit laundry' },
  { id: 'dishwasher', zh: '洗碗机', en: 'Dishwasher' },
  { id: 'ss_appliances', zh: '不锈钢厨电', en: 'Stainless-steel appliances' },
  { id: 'central_ac', zh: '中央空调', en: 'Central A/C' },
  { id: 'balcony', zh: '阳台', en: 'Balcony' },
  { id: 'hardwood', zh: '木地板', en: 'Hardwood floors' },
  { id: 'large_windows', zh: '落地窗 / 大窗', en: 'Floor-to-ceiling / large windows' },
  { id: 'walk_in_closet', zh: '步入式衣柜', en: 'Walk-in closet' },
  { id: 'ensuite_bath', zh: '主卧独立卫浴', en: 'Ensuite bathroom' },
  { id: 'parking', zh: '车位', en: 'Parking' },
  { id: 'storage', zh: '储物间', en: 'Storage locker' },
  { id: 'gym', zh: '健身房', en: 'Gym' },
  { id: 'pool', zh: '泳池', en: 'Pool' },
  { id: 'concierge', zh: '大堂礼宾', en: 'Concierge' },
  { id: 'rooftop', zh: '屋顶露台', en: 'Rooftop terrace' },
  { id: 'view', zh: '景观', en: 'View' },
]
const AMENITY_IDS = new Set(AMENITY_VOCAB.map((a) => a.id))

export type QuickDraftGuess = {
  property_type: QuickPropertyType | null
  bedrooms: number | null
  bathrooms: number | null
  has_den: boolean | null
  furnished: 'yes' | 'no' | null
  amenities: string[]
  /** Rough size, labelled an estimate everywhere it is shown; the landlord must accept it explicitly. */
  sqft_estimate: number | null
  /** Which photo makes the best cover (index into the photos sent). */
  cover_index: number | null
  /** One or two neutral sentences about what the photos show (no numbers, no claims about policy). */
  notes_zh: string
  notes_en: string
  /** 0–1 per field, as the model reported it; missing → 0. */
  confidence: Partial<Record<'property_type' | 'bedrooms' | 'bathrooms' | 'furnished' | 'sqft_estimate', number>>
}

export function quickDraftSystemPrompt(): string {
  return [
    'You read photos of a rental unit for a landlord who is about to publish it. Answer ONLY with the JSON object described below. No prose, no markdown.',
    'Rules: report only what is visible in the photos; when something is not visible answer null (or an empty list). Never guess policies — pets, smoking, utilities, lease term, deposit — they are not in the JSON and the landlord answers them.',
    'Do not count rooms twice when the same room appears in several photos. A bed in a living room does not make a bedroom. A den is a small windowless room or nook, not a bedroom.',
    'sqft_estimate: a rough whole-number estimate of the unit size, only when the photos give enough context (several rooms visible); otherwise null. It will be shown as an estimate.',
    `amenities: only ids from this list that are clearly visible: ${AMENITY_VOCAB.map((a) => a.id).join(', ')}.`,
    `property_type: one of ${PROPERTY_TYPES.join(' | ')} or null.`,
    'JSON: {"property_type": string|null, "bedrooms": int|null, "bathrooms": number|null, "has_den": bool|null, "furnished": "yes"|"no"|null, "amenities": string[], "sqft_estimate": int|null, "cover_index": int|null, "notes_zh": string, "notes_en": string, "confidence": {"property_type": 0-1, "bedrooms": 0-1, "bathrooms": 0-1, "furnished": 0-1, "sqft_estimate": 0-1}}',
    'notes_zh / notes_en: one or two neutral sentences describing what the photos show (light, condition, finishes). No numbers, no superlatives, nothing about neighbours or who lives there.',
  ].join('\n')
}

export function quickDraftUserText(ctx: { address: string; unit?: string | null; city?: string | null; province?: string | null; monthly_rent: number | null; photoCount: number }): string {
  const where = [ctx.address, ctx.unit ? `unit ${ctx.unit}` : '', ctx.city || '', ctx.province || ''].filter(Boolean).join(', ')
  return `Unit at ${where}. Asking rent ${ctx.monthly_rent ? `$${ctx.monthly_rent}/month` : 'not given'}. ${ctx.photoCount} photo(s) follow, in the landlord's order. Return the JSON only.`
}

const clampInt = (v: unknown, lo: number, hi: number): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
  if (!Number.isFinite(n)) return null
  const r = Math.round(n)
  return r < lo || r > hi ? null : r
}
const clampHalf = (v: unknown, lo: number, hi: number): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
  if (!Number.isFinite(n)) return null
  const r = Math.round(n * 2) / 2
  return r < lo || r > hi ? null : r
}
const conf = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0)
const sentence = (v: unknown, max = 240): string => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '')

/** Parses the model's text into a guess, discarding anything outside the vocabulary. Never throws. */
export function parseQuickDraftGuess(text: string, photoCount: number): QuickDraftGuess {
  const empty: QuickDraftGuess = { property_type: null, bedrooms: null, bathrooms: null, has_den: null, furnished: null, amenities: [], sqft_estimate: null, cover_index: null, notes_zh: '', notes_en: '', confidence: {} }
  let j: Record<string, unknown>
  try {
    const cleaned = (text || '').replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
    const start = cleaned.indexOf('{')
    const end = cleaned.lastIndexOf('}')
    j = JSON.parse(start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned) as Record<string, unknown>
  } catch {
    return empty
  }
  if (!j || typeof j !== 'object') return empty
  const pt = typeof j.property_type === 'string' ? j.property_type.toLowerCase().trim() : ''
  const c = (j.confidence && typeof j.confidence === 'object' ? j.confidence : {}) as Record<string, unknown>
  const amen = Array.isArray(j.amenities) ? [...new Set(j.amenities.filter((a): a is string => typeof a === 'string').map((a) => a.toLowerCase().trim()).filter((a) => AMENITY_IDS.has(a)))] : []
  const cover = clampInt(j.cover_index, 0, Math.max(0, photoCount - 1))
  return {
    property_type: (PROPERTY_TYPES as readonly string[]).includes(pt) ? (pt as QuickPropertyType) : null,
    bedrooms: clampInt(j.bedrooms, 0, 10),
    bathrooms: clampHalf(j.bathrooms, 0.5, 10),
    has_den: typeof j.has_den === 'boolean' ? j.has_den : null,
    furnished: j.furnished === 'yes' || j.furnished === 'no' ? j.furnished : null,
    amenities: amen,
    sqft_estimate: clampInt(j.sqft_estimate, 150, 10_000),
    cover_index: cover,
    notes_zh: sentence(j.notes_zh),
    notes_en: sentence(j.notes_en),
    confidence: { property_type: conf(c.property_type), bedrooms: conf(c.bedrooms), bathrooms: conf(c.bathrooms), furnished: conf(c.furnished), sqft_estimate: conf(c.sqft_estimate) },
  }
}

/** Validates one photo payload the route accepts: a data URL of a jpeg / png / webp under the size cap. */
export function parsePhotoDataUrl(s: unknown): { media_type: string; data: string } | null {
  if (typeof s !== 'string') return null
  const m = s.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/)
  if (!m) return null
  if (m[2].length > QUICK_PHOTO_MAX_B64) return null
  return { media_type: m[1], data: m[2] }
}
