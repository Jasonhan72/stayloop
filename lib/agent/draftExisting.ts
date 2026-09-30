// A draft that rewrites a listing the landlord already has (2026-09-30 · user:
// "对话框里要求修改房源说明等，生成的卡片里没有了图片；我要的是生成了修改的卡片后，
// 可以直接点击发布，或者点击编辑手动编辑一些").
//
// The model returns a fresh draft_listing for "rewrite my listing's copy": no id,
// no photos, and only the fields it bothered to repeat. The server matches the
// draft to the landlord's own listing and builds:
//   · a DISPLAY draft — the stored listing with the model's changes applied, so the
//     card shows the real photos and facts;
//   · `changed_fields` — the only fields 更新房源 may write. The stored row stays the
//     truth for everything else (review 2026-09-30: writing the whole snapshot let an
//     old card revert later edits and copy one unit's rent / photos onto another).
// Rules: copy (title / description) is the model's when it gives one; amenities are
// the stored list plus the model's additions (the prompt only shows the model the
// first ten); hard facts (rent / beds / baths / size) and the other structured terms
// change only when the user's own message says so, in context ("租金 2600", "2 房");
// address / unit / neighbourhood / city / type never change here; photos stay the
// listing's own unless the user asked to replace them and the turn brought new ones.
// Pure — tests/draftExisting20260930.spec.ts.
import type { DraftListing } from './types'
import { sameProperty } from './draftReconcile'

export type OwnedListingRow = Record<string, unknown> & { id: string; address: string | null; unit: string | null; slug: string | null }

export const normUnit = (u: unknown) => String(u ?? '').toLowerCase().replace(/#|\s|unit|apt|suite|ph(?=\d)/g, '')

/** "1105 - 203 COLLEGE STREET" → { unit: '1105', street: '203 COLLEGE STREET' }. Stored rows fold the unit in too. */
export function splitUnit(address: string | null | undefined): { unit: string | null; street: string } {
  const a = String(address ?? '').trim()
  const m = a.match(/^\s*#?\s*([a-z]{0,2}\d{1,5}[a-z]?)\s*[-–]\s*(\d.*)$/i)
  return m ? { unit: m[1], street: m[2] } : { unit: null, street: a }
}
const rowUnit = (r: OwnedListingRow) => normUnit(r.unit) || normUnit(splitUnit(r.address).unit)

/**
 * The landlord's listing this draft is about, or null. The unit must agree on both
 * sides — a draft without a unit only matches a listing without one (a new listing
 * in the same building must never become an update of the landlord's other unit).
 */
export function matchOwnedListing(draft: Pick<DraftListing, 'address' | 'unit'>, rows: OwnedListingRow[]): OwnedListingRow | null {
  const d = splitUnit(draft.address)
  const want = normUnit(draft.unit) || normUnit(d.unit)
  const hits = rows.filter((r) => r.address && sameProperty(d.street, splitUnit(r.address).street) && rowUnit(r) === want)
  return hits.length === 1 ? hits[0] : null
}

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v : undefined)
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() && Number.isFinite(Number(v)) ? Number(v) : undefined)
const arr = (v: unknown) => (Array.isArray(v) && v.length ? (v as unknown[]).map(String) : undefined)
const bool = (v: unknown) => (typeof v === 'boolean' ? v : undefined)

/** The stored listing as a draft (what the card shows for fields the AI did not change). */
export function rowToDraft(r: Record<string, unknown>): DraftListing {
  const split = splitUnit(r.address as string)
  return {
    title: str(r.title), address: String(r.address ?? ''), unit: str(r.unit) ?? (split.unit || undefined), city: str(r.city), neighborhood: str(r.neighborhood),
    monthly_rent: num(r.monthly_rent) ?? 0, bedrooms: num(r.bedrooms), bathrooms: num(r.bathrooms), sqft: num(r.sqft),
    available_date: str(r.available_date), description: str(r.description), parking: str(r.parking), pet_policy: str(r.pet_policy),
    amenities: arr(r.amenities), has_den: bool(r.has_den), property_type: str(r.property_type), images: arr(r.images),
    ownership_title: str(r.ownership_title), bedrooms_above_grade: num(r.bedrooms_above_grade), bedrooms_below_grade: num(r.bedrooms_below_grade),
    bathrooms_half: num(r.bathrooms_half), sqft_max: num(r.sqft_max), storeys: num(r.storeys), land_size: str(r.land_size),
    heating_type: str(r.heating_type), heating_fuel: str(r.heating_fuel), cooling: str(r.cooling), basement_type: str(r.basement_type),
    exterior_finish: str(r.exterior_finish), appliances: arr(r.appliances), building_features: arr(r.building_features),
    pets_allowed: str(r.pets_allowed), parking_spaces: num(r.parking_spaces), maintenance_fee: num(r.maintenance_fee),
    management_company: str(r.management_company), cross_streets: str(r.cross_streets), furnished: bool(r.furnished),
    deposit: num(r.deposit), lease_term: str(r.lease_term), smoking_policy: str(r.smoking_policy), utilities_included: arr(r.utilities_included),
    virtual_tour_url: str(r.virtual_tour_url), year_built: num(r.year_built), mls_number: str(r.mls_number), source_url: str(r.source_url),
  }
}

// A number the user actually said for this field — in context, not any matching digit ("步行 2 分钟" is not "2 房").
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
function saidNumber(message: string, field: 'monthly_rent' | 'bedrooms' | 'bathrooms' | 'sqft' | 'deposit', value: number): boolean {
  const m = message.toLowerCase().replace(/,/g, '')
  const v = esc(String(value).replace(/\.0+$/, ''))
  const pats: Record<typeof field, RegExp[]> = {
    monthly_rent: [new RegExp(`(\\$|租金|月租|房租|rent|租)\\s*[^\\d\\n]{0,6}${v}(?!\\d)`), new RegExp(`(?<!\\d)${v}\\s*(/月|/mo|每月|一个月|加元|刀|块|per month|a month)`)],
    deposit: [new RegExp(`(押金|deposit)\\s*[^\\d\\n]{0,6}${v}(?!\\d)`)],
    bedrooms: [new RegExp(`(?<![\\d.])${v}\\s*(房|卧|室|间卧|bed|br|bdr|bedroom)`)],
    bathrooms: [new RegExp(`(?<![\\d.])${v}\\s*(浴|卫|厕|bath|ba\\b)`)],
    sqft: [new RegExp(`(?<![\\d.])${v}\\s*(sqft|sq ft|sf|尺|平方英尺|平尺|square)`)],
  }
  return pats[field].some((re) => re.test(m))
}
// Structured terms change only when the user's message is about that topic.
const TOPIC: Partial<Record<keyof DraftListing, RegExp>> = {
  pets_allowed: /宠物|猫|狗|pet|cat|dog/i,
  pet_policy: /宠物|猫|狗|pet|cat|dog/i,
  smoking_policy: /吸烟|抽烟|smok/i,
  lease_term: /租期|月租约|短租|长租|lease term|month.to.month|\d+\s*个月|\d+\s*months?/i,
  utilities_included: /水电|暖气|燃气|网络|包水|包电|utilit|hydro|heat|internet|water/i,
  furnished: /家具|furnish/i,
  parking: /车位|停车|parking/i,
  parking_spaces: /车位|停车|parking/i,
  available_date: /入住|起租|available|move.in|可租/i,
  has_den: /den|书房/i,
}
const PHOTO_WORDS = /照片|图片|相片|photo|picture|image/i
const REMOVE_WORDS = /删|去掉|移除|拿掉|remove|delete|drop/i

/** The display draft (stored listing + the AI's changes) and the list of fields 更新房源 may write. */
export function mergeWithExisting(row: OwnedListingRow, modelDraft: DraftListing, message: string, turnImages: string[] = []): DraftListing {
  const base = rowToDraft(row)
  const out: DraftListing = { ...base }
  const changed: string[] = []
  const take = (k: keyof DraftListing, v: unknown) => { (out as Record<string, unknown>)[k] = v; if (JSON.stringify(v) !== JSON.stringify((base as Record<string, unknown>)[k])) changed.push(k) }
  // copy
  for (const k of ['title', 'description'] as const) if (str(modelDraft[k]) && modelDraft[k] !== base[k]) take(k, modelDraft[k])
  // amenities: stored ∪ new, unless the user asked to remove some
  if (modelDraft.amenities?.length) {
    const next = REMOVE_WORDS.test(message) ? modelDraft.amenities : Array.from(new Set([...(base.amenities ?? []), ...modelDraft.amenities]))
    if (JSON.stringify(next) !== JSON.stringify(base.amenities ?? [])) take('amenities', next)
  }
  // hard facts: only what the user said
  for (const k of ['monthly_rent', 'bedrooms', 'bathrooms', 'sqft', 'deposit'] as const) {
    const v = modelDraft[k]
    if (typeof v === 'number' && Number.isFinite(v) && v !== base[k] && saidNumber(message, k, v)) take(k, v)
  }
  // other structured terms: only when the message is about that topic
  for (const [k, re] of Object.entries(TOPIC) as [keyof DraftListing, RegExp][]) {
    const v = modelDraft[k]
    if (v === undefined || v === null || (typeof v === 'string' && !v.trim()) || (Array.isArray(v) && !v.length)) continue
    if (re.test(message) && JSON.stringify(v) !== JSON.stringify(base[k])) take(k, v)
  }
  // photos: the listing's own, unless the user asked to replace them and the turn brought new ones
  out.images = base.images
  if (turnImages.length && PHOTO_WORDS.test(message)) take('images', turnImages)
  out.listing_id = row.id
  out.listing_slug = row.slug ?? undefined
  out.listing_active = row.is_active !== false
  out.base_updated_at = typeof row.updated_at === 'string' ? row.updated_at : undefined
  out.changed_fields = changed
  return out
}
