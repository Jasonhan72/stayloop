import { hasUsablePhotos } from './listingVisibility'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { DraftListing } from '@/lib/agent/types'
import { splitAddress, streetKey } from '@/lib/lease/householdMatch'
import {
  PROVINCE_CODES, checkListingComplianceFor, effectiveProvince, normalizeProvince, petBanAllowed, provinceFromPostal, provinceName,
  provinceTokenIn, rulesFor, type Bi, type Lang, type ProvinceCode, type ProvinceInput,
} from '@/lib/provinces'

// Form input for buildListingRow. Same shape as DraftListing, but the wizard
// path passes parseInt(...) || null for numeric fields, so those allow null.
// `province` is what the landlord confirmed on the form (a code or any spelling
// normalizeProvince knows); `postal_code` is used only to detect the province.
export type ListingFormInput = Omit<DraftListing, 'monthly_rent' | 'sqft' | 'deposit' | 'year_built'> & {
  monthly_rent: number | null
  sqft?: number | null
  deposit?: number | null
  year_built?: number | null
  province?: string | null
  postal_code?: string | null
}

export const LISTING_PUBLISH_MSG = {
  landlordNotFound: { zh: '未找到房东档案，请先完成注册', en: 'Landlord profile not found' },
  duplicate: { zh: '该地址已有相同房源，请勿重复发布', en: 'A listing at this address already exists' },
  noPhotos: { zh: '至少需要 1 张照片才能发布：没有照片的房源不会出现在任何公开页面。', en: 'At least one photo is required — listings without photos are never shown publicly.' },
}

// Realtor.ca-sourced listings display immediately with a source badge;
// everything else waits for Stayloop verification (DB default 'pending').
export function computeListingSource(form: Pick<ListingFormInput, 'mls_number' | 'source_url'>): 'realtor' | 'stayloop' {
  return form.mls_number || /realtor\.ca/i.test(form.source_url || '') ? 'realtor' : 'stayloop'
}

export function makeListingSlug(address: string): string {
  return address.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') + '-' + Date.now().toString(36)
}

// Dual-ID: RLS requires landlords.id (profileId), not auth.uid().
//
// Self-heals a missing profile rather than returning null. The landlords row is
// created lazily by useLandlord()/useUser() → claim_landlord(), which only runs
// on workspace pages; a user who signs up and publishes from the agent chat or
// the listing wizard without visiting one had no row, and both call sites turned
// that into a hard "未找到房东档案，请先完成注册" with no way forward. Same defect
// class as the Upgrade button, which was dead for 45 of 96 accounts.
//
// claim_landlord() is SECURITY DEFINER and idempotent — returns an existing row,
// claims a pre-seeded one matching the email, or inserts a free/landlord row.
export async function resolveLandlordId(client: SupabaseClient, authUserId: string): Promise<string | null> {
  const { data } = await client
    .from('landlords')
    .select('id')
    // Match either column: the documented invariant is that legacy rows are
    // keyed by profileId. (All 52 production rows currently carry auth_id, but
    // the query should not depend on that staying true.)
    .or(`id.eq.${authUserId},auth_id.eq.${authUserId}`)
    .limit(1)
    .maybeSingle()
  if (data?.id) return data.id

  const { data: claimed } = await client.rpc('claim_landlord')
  const row = Array.isArray(claimed) ? claimed[0] : claimed
  if (row && typeof row === 'object' && 'id' in row) {
    return (row as { id: string }).id ?? null
  }
  return null
}

type BuildListingRowOpts = {
  landlordId: string
  slug: string
  photos?: string[]
  // Wizard path: slim field set only — no title/status/published_at/source/photo fields
  slim?: boolean
}

// ── Province (2026-10-02) ───────────────────────────────────────────────────
// Every row used to be written with a hard-coded Ontario province, so the
// Montréal listing ("1569 rue St-Hubert, Montréal, QC, H2L 3Z1") was stored as
// Ontario and its page showed Ontario's rules (user: 「外省的要查外省的法规，不要
// 用安省的法规和说法」). The row now carries the province the landlord confirmed on
// the form, else what the address says (postal code > province token > city;
// lib/provinces/detect). Province is not a trust field: guard_listing_trust_fields
// does not send a listing back to review when it changes.

/** The province a new / edited row is written with. */
export function listingFormProvince(form: { province?: string | null; address?: string | null; city?: string | null; postal_code?: string | null }): ProvinceCode {
  return normalizeProvince(form.province) ?? detectListingProvince(form.address, form.city, form.postal_code)
}

/** The province the typed address points to (ON when nothing says otherwise). The forms pass
 *  no city while the city field still holds its untouched "Toronto" default, so a "Montréal"
 *  in the address is not outvoted by it. */
export function detectListingProvince(address: string | null | undefined, city?: string | null, postal?: string | null): ProvinceCode {
  return effectiveProvince({ address, city, postal_code: postal })
}

/** What the address itself states about the province — a postal code or an explicit province
 *  token — or null. The listing page reads this before the stored province, so the forms warn
 *  when the landlord's choice disagrees with it. */
export function addressProvinceEvidence(address: string | null | undefined, city?: string | null, postal?: string | null): ProvinceCode | null {
  return provinceFromPostal(postal) ?? provinceFromPostal(address) ?? provinceFromPostal(city) ?? provinceTokenIn(address) ?? provinceTokenIn(city)
}

const POSTAL_IN_SEGMENT_RE = /\b[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z][ -]?\d[ABCEGHJ-NPRSTV-Z]\d\b/gi

/** The city part of a typed address — "1569 rue St-Hubert, Montréal, QC, H2L 3Z1" → "Montréal";
 *  null when the address has no separate city segment. Used only for a listing outside Ontario
 *  whose city field was left empty (or at its Toronto default). */
export function cityFromAddress(address: string | null | undefined): string | null {
  const parts = String(address ?? '').split(',').map((x) => x.trim()).filter(Boolean)
  if (parts.length < 2) return null
  const rest = parts.slice(1).map((seg) => {
    let t = seg.replace(POSTAL_IN_SEGMENT_RE, ' ').replace(/\s+/g, ' ').trim()
    if (!t || /^canada$/i.test(t) || normalizeProvince(t)) return ''
    // "Montréal QC" → "Montréal" (upper-case abbreviations only; "Ville de Québec" stays whole)
    const m = t.match(/^(.+?)\s+([A-Z][A-Z.]{1,5})$/)
    if (m && normalizeProvince(m[2])) t = m[1].trim()
    return t
  }).filter(Boolean)
  return rest.length ? rest[rest.length - 1] : null
}

/** The 13 provinces and territories for the forms' select, named in the UI language. */
export function provinceOptions(lang: Lang): { value: ProvinceCode; label: string }[] {
  return PROVINCE_CODES.map((c) => ({ value: c, label: provinceName(c, lang) }))
}

// ── Lease-term guidance outside Ontario (2026-10-02) ────────────────────────
// Ontario keeps its RTA wording in the forms (unchanged). Everything below is null for
// Ontario and, elsewhere, only the verified facts in lib/provinces/rules.ts — no Ontario
// statute, body or term; a topic with no verified fact says nothing.

const pickBi = (t: Bi, lang: Lang) => (lang === 'zh' ? t.zh : t.en)

/** The citation at the end of a verified fact sentence: "…（《魁北克民法典》第 1904、1893 条）。"
 *  → "《魁北克民法典》第 1904、1893 条"; "…(Residential Tenancy Act, ss. 19(1), 20)." → its inside. */
export function factCitation(text: string): string | null {
  const s = text.trim().replace(/[。.]$/, '')
  const close = s.endsWith('）') ? '）' : s.endsWith(')') ? ')' : null
  if (!close) return null
  const open = close === '）' ? '（' : '('
  let depth = 0
  for (let i = s.length - 1; i >= 0; i--) {
    if (s[i] === close) depth++
    else if (s[i] === open && --depth === 0) return s.slice(i + 1, s.length - 1).trim() || null
  }
  return null
}

const withCite = (label: string, fact: Bi, lang: Lang) => {
  const c = factCitation(pickBi(fact, lang))
  return c ? (lang === 'zh' ? `${label}（${c}）` : `${label} (${c})`) : label
}

const DEPOSIT_RULE_RE = /-(no-deposit|deposit-cap|no-key-deposit)$/

/** The deposit rule for a listing outside Ontario (its verified fact sentence) and what is
 *  wrong with the amount entered, if anything. Null for Ontario. */
export function depositGuidanceFor(code: ProvinceInput, rent: number | null | undefined, deposit: number | null | undefined, lang: Lang): { rule: string; problems: string[] } | null {
  const r = rulesFor(code)
  if (!r) return null
  const { findings } = checkListingComplianceFor(r.code, { monthly_rent: rent ?? null, deposit: deposit ?? null })
  return { rule: pickBi(r.deposit, lang), problems: findings.filter((f) => DEPOSIT_RULE_RE.test(f.rule)).map((f) => f.message[lang]) }
}

/** The pet rule for a listing outside Ontario: its verified sentence (null where none was
 *  verified — Nunavut) and whether the form may offer 「不允许」 (only where a ban is allowed).
 *  Null for Ontario. */
export function petGuidanceFor(code: ProvinceInput, lang: Lang): { note: string | null; banOption: boolean } | null {
  const r = rulesFor(code)
  if (!r) return null
  return { note: r.petBanAllowed ? pickBi(r.petBanAllowed, lang) : null, banOption: petBanAllowed(r.code) === true }
}

const MONTHS: Record<string, Bi> = {
  '0.5': { zh: '半个月', en: 'half a month’s' },
  '0.75': { zh: '四分之三个月', en: 'three quarters of a month’s' },
  '1': { zh: '一个月', en: 'one month’s' },
}

export type ListingCheckItem = { key: string; label: string; rules: string[] }

/** The publish wizard's pre-publish checks for a listing outside Ontario, one line per topic the
 *  province's facts cover; a line fails when checkListingComplianceFor returns one of its rules.
 *  Null for Ontario (the wizard keeps its RTA lines). */
export function listingCheckItemsFor(code: ProvinceInput, lang: Lang): ListingCheckItem[] | null {
  const r = rulesFor(code)
  if (!r) return null
  const c = r.code
  const zh = lang === 'zh'
  const items: ListingCheckItem[] = []
  const months = MONTHS[String(r.deposit.maxMonths)]
  items.push({
    key: 'deposit',
    rules: [`${c}-no-deposit`, 'QC-CCQ-1904-no-deposit', `${c}-deposit-cap`, `${c}-no-key-deposit`],
    label: withCite(
      !r.deposit.allowed ? (zh ? '不收任何押金' : 'No deposit of any kind')
        : months ? (zh ? `押金不超过${months.zh}租金` : `Deposit within ${months.en} rent`)
        : (zh ? '押金在法定上限以内' : 'Deposit within the legal cap'),
      r.deposit, lang,
    ),
  })
  const k = r.keyOrOtherDeposits
  const extras: Bi[] = []
  if (r.deposit.allowed && !r.petDeposit.allowed) extras.push({ zh: '宠物押金', en: 'pet deposit' })
  // "Damage deposit" is the everyday name of the security deposit outside Quebec — only a cleaning deposit is a separate one.
  if (r.deposit.allowed && !(k.allowed && k.key === 'counts_toward_deposit')) extras.push({ zh: '清洁押金', en: 'cleaning deposit' })
  if (r.petFee && !r.petFee.allowed) extras.push({ zh: '宠物费', en: 'pet fee' })
  if (extras.length) {
    items.push({
      key: 'extra_deposits',
      rules: [`${c}-no-pet-deposit`, `${c}-no-cleaning-deposit`, `${c}-no-pet-fee`, 'QC-CCQ-1904-no-pet-fee'],
      label: zh ? `文案里没有${extras.map((x) => x.zh).join(' / ')}` : `No ${extras.map((x) => x.en).join(' / ')} in the copy`,
    })
  }
  if (r.advanceRent.lastMonth === 'prohibited') {
    items.push({
      key: 'last_month',
      rules: ['QC-CCQ-1904-advance-rent', `${c}-no-last-month-rent`],
      label: withCite(zh ? '文案里没有预收最后一个月租金' : 'No prepaid last month’s rent in the copy', r.advanceRent, lang),
    })
  }
  const fee = r.applicationFee
  if (fee && (fee.allowed === false || c === 'QC')) {
    items.push({
      key: 'application_fee',
      rules: [`${c}-no-application-fee`, 'QC-application-fee'],
      label: withCite(
        fee.allowed === false ? (zh ? '文案里没有申请费 / 筛查费' : 'No application / screening fee in the copy') : (zh ? '文案里没有申请费' : 'No application fee in the copy'),
        fee, lang,
      ),
    })
  }
  return items
}

// Never include verification_status / verified_at / source overrides beyond
// computeListingSource — the DB trigger guard_listing_trust_fields owns those.
export function buildListingRow(form: ListingFormInput, opts: BuildListingRowOpts) {
  const province = listingFormProvince(form)
  if (opts.slim) {
    return {
      landlord_id: opts.landlordId,
      address: form.address,
      unit: form.unit || null,
      city: form.city,
      province,
      monthly_rent: form.monthly_rent,
      bedrooms: form.bedrooms,
      bathrooms: form.bathrooms,
      property_type: form.property_type,
      sqft: form.sqft ?? null,
      deposit: form.deposit ?? null,
      year_built: form.year_built ?? null,
      amenities: form.amenities,
      // Lease terms the wizard now collects (fix list 2026-09-22, SL-LL-004)
      lease_term: form.lease_term ?? null,
      pets_allowed: form.pets_allowed ?? null,
      smoking_policy: form.smoking_policy ?? null,
      furnished: form.furnished ?? null,
      utilities_included: form.utilities_included ?? [],
      // Landlord-reviewed copy from the wizard's last step (SL-L-03); absent → address / none.
      ...(form.title ? { title: form.title } : {}),
      ...(form.description ? { description: form.description } : {}),
      images: opts.photos ?? [],
      slug: opts.slug,
      is_active: true,
    }
  }
  const photos = opts.photos ?? []
  return {
    landlord_id: opts.landlordId,
    address: form.address,
    unit: form.unit || null,
    // The Toronto default is for Ontario rows only; elsewhere the city comes from the address.
    city: form.city || (province === 'ON' ? 'Toronto' : cityFromAddress(form.address)),
    province,
    monthly_rent: form.monthly_rent,
    bedrooms: form.bedrooms ?? null,
    bathrooms: form.bathrooms ?? null,
    sqft: form.sqft ?? null,
    available_date: form.available_date || null,
    title: form.title || form.address,
    description: form.description || null,
    parking: form.parking || null,
    pet_policy: form.pet_policy || null,
    amenities: form.amenities || [],
    has_den: form.has_den ?? false,
    property_type: form.property_type || 'condo',
    ownership_title: form.ownership_title ?? null,
    year_built: form.year_built ?? null,
    storeys: form.storeys ?? null,
    sqft_max: form.sqft_max ?? null,
    bedrooms_above_grade: form.bedrooms_above_grade ?? null,
    bedrooms_below_grade: form.bedrooms_below_grade ?? null,
    bathrooms_half: form.bathrooms_half ?? null,
    furnished: form.furnished ?? null,
    pets_allowed: form.pets_allowed ?? null,
    heating_type: form.heating_type ?? null,
    heating_fuel: form.heating_fuel ?? null,
    cooling: form.cooling ?? null,
    basement_type: form.basement_type ?? null,
    exterior_finish: form.exterior_finish ?? null,
    land_size: form.land_size ?? null,
    appliances: form.appliances ?? null,
    building_features: form.building_features ?? null,
    parking_spaces: form.parking_spaces ?? null,
    maintenance_fee: form.maintenance_fee ?? null,
    management_company: form.management_company ?? null,
    cross_streets: form.cross_streets ?? null,
    deposit: form.deposit ?? null,
    lease_term: form.lease_term ?? null,
    smoking_policy: form.smoking_policy ?? null,
    utilities_included: form.utilities_included ?? [],
    virtual_tour_url: form.virtual_tour_url ?? null,
    mls_number: form.mls_number ?? null,
    source_url: form.source_url ?? null,
    source: computeListingSource(form),
    neighborhood: form.neighborhood || null,
    slug: opts.slug,
    status: 'active',
    is_active: true,
    published_at: new Date().toISOString(),
    images: photos.length ? photos : [],
    photo_count: photos.length || 0,
  }
}

export type ListingRow = Record<string, unknown> & {
  landlord_id: string
  address: string
  unit: string | null
  slug: string
}

// The landlord's own earlier listing at the same address + unit (sweep 2026-10-01).
// The dup check used to answer only "a duplicate exists" — after the landlord had
// filled in all five wizard steps — and it counted archived (deleted) rows that no
// page shows, so a unit that was rented and deleted could never be listed again.
// Now the existing row comes back, so the caller can offer to bring it back.
export type ExistingListing = {
  id: string; slug: string | null; unit: string | null; status: string | null; is_active: boolean; archived: boolean
  /** Public only once verified (or a Realtor.ca import) — "on the market" is not "live". */
  verification_status?: string | null; source?: string | null
}

export type PublishListingResult =
  | { slug: string; error: null; existing?: undefined }
  | { slug: null; error: string; existing?: ExistingListing }

/** Unit numbers as people type them: "#1203", "Unit 1203", "1203" are the same unit. */
export function normalizeListingUnit(unit: string | null | undefined): string {
  return String(unit ?? '')
    .toLowerCase()
    .replace(/\b(unit|suite|ste|apt|apartment|no)\b\.?/g, ' ')
    .replace(/[^a-z0-9]/g, '')
    .replace(/^0+(?=\d)/, '')
}

/** LIKE wildcards in a typed address must match literally. */
export function escapeIlike(s: string): string {
  return s.replace(/[\\%_]/g, (m) => '\\' + m)
}

/**
 * Pick the landlord's existing row for this address (rows already filtered to
 * the same landlord + address). Same unit wins; a new listing WITHOUT a unit
 * also collides with any unit at that address (it was re-posted under a
 * unit-less address and duplicated the apartment). Live rows first, then
 * off-market, then archived.
 */
export function pickExistingListing<R extends { id: string; slug?: string | null; unit: string | null; status?: string | null; is_active?: boolean | null; verification_status?: string | null; source?: string | null }>(rows: R[], unit: string | null | undefined): ExistingListing | null {
  const want = normalizeListingUnit(unit)
  const same = rows.filter((r) => (want ? normalizeListingUnit(r.unit) === want : true))
  if (!same.length) return null
  const rank = (r: R) => (r.status === 'archived' ? 2 : r.is_active === false ? 1 : 0)
  const sorted = [...same].sort((a, b) => rank(a) - rank(b) || (normalizeListingUnit(a.unit) === want ? -1 : 0) - (normalizeListingUnit(b.unit) === want ? -1 : 0))
  const r = sorted[0]
  return {
    id: r.id, slug: r.slug ?? null, unit: r.unit ?? null, status: r.status ?? null,
    is_active: r.is_active !== false && r.status !== 'archived', archived: r.status === 'archived',
    verification_status: r.verification_status ?? null, source: r.source ?? null,
  }
}

type ListingAddressRow = { id: string; slug: string | null; address: string | null; unit: string | null; status: string | null; is_active: boolean | null; verification_status?: string | null; source?: string | null }

/**
 * The landlord's rows for the same property as typed — compared the way the e-sign
 * route compares tenancies (lib/lease/householdMatch): "28 Avondale Avenue" is
 * "28 Avondale Ave", and a unit folded into the address ("1203 - 28 Avondale Ave")
 * is that unit. A retyped address used to miss the old row and create a second listing.
 */
export function matchExistingListing(rows: ListingAddressRow[], address: string, unit: string | null | undefined): ExistingListing | null {
  const typed = splitAddress(address, unit)
  const typedKey = streetKey(typed.street)
  const exact = (address || '').trim().toLowerCase()
  const same = rows
    .filter((r) => {
      const rowKey = streetKey(splitAddress(r.address, r.unit).street)
      return typedKey && rowKey ? typedKey === rowKey : String(r.address ?? '').trim().toLowerCase() === exact
    })
    .map((r) => ({ ...r, unit: splitAddress(r.address, r.unit).unit || null }))
  return pickExistingListing(same, typed.unit)
}

export async function findExistingListing(client: SupabaseClient, landlordId: string, address: string, unit: string | null | undefined): Promise<ExistingListing | null> {
  const a = (address || '').trim()
  if (!a) return null
  // Narrow by house number in SQL, decide in JS (abbreviations, folded units).
  const number = (streetKey(splitAddress(a, unit).street) || '').split(' ')[0]
  const { data } = await client
    .from('listings')
    .select('id, slug, address, unit, status, is_active, verification_status, source')
    .eq('landlord_id', landlordId)
    .ilike('address', number ? `%${escapeIlike(number)}%` : escapeIlike(a))
    .limit(200)
  return matchExistingListing((data ?? []) as ListingAddressRow[], a, unit)
}

export function existingListingMessage(e: ExistingListing, zh: boolean, typedUnit?: string | null): string {
  const unitNote = !normalizeListingUnit(typedUnit) && e.unit
    ? (zh ? `（单元 ${e.unit}；如果这是同一地址的另一个单元，请填写单元号）` : ` (unit ${e.unit}; if this is a different unit at the same address, add the unit number)`)
    : ''
  if (e.archived) return (zh ? '你之前删除过这套房源，它还保留着照片和价格记录。可以把它恢复上架，不用重新发布。' : 'You deleted this listing earlier; it still has its photos and price history. Bring it back instead of publishing it again.') + unitNote
  if (!e.is_active) return (zh ? '这套房源已经在你的账号里（目前下架）。可以把它重新上架，不用重新发布。' : 'This listing is already on your account (currently off market). Relist it instead of publishing it again.') + unitNote
  // On the market is not public: a landlord's own listing waits for Stayloop review first.
  if (e.verification_status === 'verified' || e.source === 'realtor') {
    return (zh ? LISTING_PUBLISH_MSG.duplicate.zh + '。它目前在架、公开可见，可以直接去编辑。' : LISTING_PUBLISH_MSG.duplicate.en + '. It is live and public; edit it instead.') + unitNote
  }
  return (zh ? '这套房源已经在你的账号里（已上架，等待 Stayloop 审核，通过后才公开），不用重新发布；要修改可以直接去编辑。' : 'This listing is already on your account (listed, waiting for Stayloop review before it is public). No need to publish it again; edit it instead.') + unitNote
}

// Dup-check + insert. selectSlug re-reads the slug from the inserted row
// (wizard path); otherwise the row's own slug is returned without a select.
export async function publishListing(
  client: SupabaseClient,
  row: ListingRow,
  opts: { zh: boolean; selectSlug?: boolean },
): Promise<PublishListingResult> {
  if (!hasUsablePhotos((row as { images?: unknown }).images)) {
    return { slug: null, error: opts.zh ? LISTING_PUBLISH_MSG.noPhotos.zh : LISTING_PUBLISH_MSG.noPhotos.en }
  }
  const existing = await findExistingListing(client, row.landlord_id, row.address, row.unit)
  if (existing) {
    return { slug: null, error: existingListingMessage(existing, opts.zh, row.unit), existing }
  }
  if (opts.selectSlug) {
    const { data, error } = await client.from('listings').insert(row).select('slug').single()
    if (error) return { slug: null, error: error.message }
    return { slug: data?.slug || '', error: null }
  }
  const { error } = await client.from('listings').insert(row)
  if (error) return { slug: null, error: error.message }
  return { slug: row.slug, error: null }
}

// ── Updating a listing the landlord already has (2026-09-30) ────────────────
// The AI's rewrite card for an owned listing updates that row in place, writing
// ONLY the fields the AI changed (draft.changed_fields) and the photos if the
// landlord changed them on the card — never the whole snapshot (review
// 2026-09-30). It refuses when the listing changed since the card was drafted
// (listings.updated_at), so an old card in a chat thread cannot revert later
// edits. Trust fields stay with the DB (guard_listing_trust_fields: a changed
// rent / layout sends a verified listing back to review) — the result says so.
export const LISTING_EDIT_DRAFT_PREFIX = 'stayloop-listing-edit-draft:'

const PATCHABLE: (keyof DraftListing)[] = [
  'title', 'description', 'monthly_rent', 'bedrooms', 'bathrooms', 'sqft', 'available_date', 'parking', 'pet_policy', 'amenities', 'has_den',
  'deposit', 'lease_term', 'pets_allowed', 'smoking_policy', 'furnished', 'utilities_included', 'parking_spaces',
]

export function buildListingPatch(form: DraftListing, photos: string[] | null, fields: string[]): Record<string, unknown> {
  const keep = (v: unknown) => v !== undefined && v !== null && !(typeof v === 'string' && v.trim() === '')
  const patch: Record<string, unknown> = {}
  for (const k of PATCHABLE) if (fields.includes(k) && keep(form[k])) patch[k] = form[k]
  if (photos) { patch.images = photos; patch.photo_count = photos.length }
  return patch
}

export type UpdatedListingRow = { slug: string | null; is_active: boolean; verification_status: string | null; source: string | null; status?: string | null; updated_at?: string | null }

export type ListingUpdateResult =
  | { error: null; stale: false; row: UpdatedListingRow }
  | { error: string; stale: boolean; row: null }

const STALE_MSG = {
  card: { zh: '这套房源在这张卡片生成之后被改过，为免覆盖新的修改，没有更新。请让 AI 助理按现在的内容重新生成，或去编辑页修改。', en: 'This listing changed after the card was made; to avoid overwriting newer edits nothing was updated. Ask your AI Agent again, or edit the listing directly.' },
  editor: { zh: '这套房源在你打开编辑页之后被改过（可能在另一个标签页或 AI 助理的卡片上），为免覆盖新的修改，这次没有保存。请重新载入后再改。', en: 'This listing changed after you opened the editor (in another tab or from an AI Agent card); to avoid overwriting those changes nothing was saved. Reload, then edit again.' },
}

export async function updateListing(client: SupabaseClient, id: string, patch: Record<string, unknown>, opts: { zh: boolean; expectedUpdatedAt?: string | null; context?: 'card' | 'editor' }): Promise<ListingUpdateResult> {
  if ('images' in patch && !hasUsablePhotos(patch.images)) return { error: opts.zh ? LISTING_PUBLISH_MSG.noPhotos.zh : LISTING_PUBLISH_MSG.noPhotos.en, stale: false, row: null }
  if (Object.keys(patch).length === 0) return { error: opts.context === 'editor' ? (opts.zh ? '没有改动，不需要保存。' : 'Nothing changed — nothing to save.') : (opts.zh ? '这张卡片相对现在的房源没有改动。' : 'This card has no changes against the current listing.'), stale: false, row: null }
  let q = client.from('listings').update(patch).eq('id', id)
  if (opts.expectedUpdatedAt) q = q.eq('updated_at', opts.expectedUpdatedAt)
  const { data, error } = await q.select('slug, is_active, verification_status, source, status, updated_at')
  if (error) return { error: error.message, stale: false, row: null }
  if (!data || data.length === 0) {
    // Tell "changed since" apart from "not yours / gone".
    const { data: still } = await client.from('listings').select('id').eq('id', id).maybeSingle()
    const m = STALE_MSG[opts.context ?? 'card']
    return still
      ? { error: opts.zh ? m.zh : m.en, stale: true, row: null }
      : { error: opts.zh ? '没能更新：这套房源不在你的账号下，或已被删除。' : 'Could not update: this listing is not on your account, or it was deleted.', stale: false, row: null }
  }
  const r = data[0] as UpdatedListingRow
  return { error: null, stale: false, row: r }
}

/** What is true after a write — the DB may have sent a verified listing back to review. */
export function listingStateAfterSave(row: { is_active: boolean; verification_status: string | null; source: string | null; status?: string | null }): 'live' | 'review' | 'off' {
  if (!row.is_active || row.status === 'archived') return 'off'
  return row.verification_status === 'verified' || row.source === 'realtor' ? 'live' : 'review'
}

export function listingSaveOutcomeText(state: 'live' | 'review' | 'off', zh: boolean): string {
  if (state === 'off') return zh ? '已保存；这套房源目前是下架状态，公开页面看不到。' : 'Saved. The listing is off market and not shown publicly.'
  if (state === 'live') return zh ? '已保存，已在房源页生效。' : 'Saved and live on the listing page.'
  return zh ? '已保存；房源在等 Stayloop 审核（改了地址、租金或户型的已认证房源会回到审核），通过后公开。' : 'Saved. The listing is waiting for Stayloop review (a verified listing whose address, rent or layout changed goes back to review); it is public once approved.'
}

/**
 * Bring an off-market or deleted (archived) listing back with what the landlord
 * just entered in the wizard: the row keeps its id, slug, photos history and
 * price history instead of a second listing for the same unit.
 */
export async function relistExisting(client: SupabaseClient, existing: ExistingListing, row: ListingRow, opts: { zh: boolean }): Promise<ListingUpdateResult> {
  // Identity stays: same landlord, same slug (links already shared), same address + unit.
  const KEEP = new Set(['landlord_id', 'slug', 'address', 'unit'])
  const content = Object.fromEntries(Object.entries(row).filter(([k]) => !KEEP.has(k)))
  const patch: Record<string, unknown> = { ...content, is_active: true, status: 'active', published_at: new Date().toISOString() }
  return updateListing(client, existing.id, patch, { zh: opts.zh, context: 'editor' })
}

/** Ordered field-by-field diff of two plain snapshots (arrays / objects by value). */
export function changedKeys(before: Record<string, unknown>, after: Record<string, unknown>): string[] {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)])
  return [...keys].filter((k) => JSON.stringify(before[k] ?? null) !== JSON.stringify(after[k] ?? null))
}

/** A stash / card made against an older version of the row than the one now loaded. */
export function isStaleBase(base: string | null | undefined, current: string | null | undefined): boolean {
  if (!base || !current) return true
  if (base === current) return false
  const a = Date.parse(base), b = Date.parse(current)
  return Number.isNaN(a) || Number.isNaN(b) || a !== b
}

// ── New-listing drafts round-tripping between a chat card and the draft editor ──
// One slot per user × card (sweep 2026-10-01): a single global key leaked the
// last-edited draft into every new-draft card in the thread (and across accounts
// on one browser), and an edit saved in the editor never reached the card. The
// card key is derived from the card's original draft (the chat thread stores it
// unchanged), so the card and the editor agree on it without the chat passing ids.
export const DRAFT_SLOT_PREFIX = 'stayloop-draft-listing:'
export const DRAFT_DONE_PREFIX = 'stayloop-draft-listing-done:'
export const LEGACY_DRAFT_KEY = 'stayloop-draft-listing'
const MAX_DRAFT_SLOTS = 3
const MAX_DONE_MARKERS = 100

// Same answer before and after a JSON round-trip (the thread / localStorage copy of the
// card): JSON drops undefined-valued keys, so they must not count here either.
function stableJson(v: unknown): string {
  if (Array.isArray(v)) return '[' + v.map(stableJson).join(',') + ']'
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>
    return '{' + Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => JSON.stringify(k) + ':' + stableJson(o[k])).join(',') + '}'
  }
  return JSON.stringify(v ?? null)
}

export function draftCardKey(d: DraftListing): string {
  // Photos are data URLs (megabytes) — summarised, not hashed whole.
  const images = (d.images ?? []).map((s) => `${String(s).length}:${String(s).slice(-24)}`)
  const src = stableJson({ ...d, images })
  let h = 0x811c9dc5
  for (let i = 0; i < src.length; i++) { h ^= src.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0 }
  return h.toString(16).padStart(8, '0') + src.length.toString(36)
}

export const draftSlotKey = (uid: string, cardKey: string) => `${DRAFT_SLOT_PREFIX}${uid}:${cardKey}`
export const draftDoneKey = (uid: string, cardKey: string) => `${DRAFT_DONE_PREFIX}${uid}:${cardKey}`

export type DraftDone = { kind: 'published' | 'updated'; at: string; slug: string | null; address: string; unit: string | null; source?: string | null; listing_id?: string | null; row?: UpdatedListingRow | null }

type KV = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>

function keysWithPrefix(store: KV, prefix: string): string[] {
  const out: string[] = []
  for (let i = 0; i < store.length; i++) { const k = store.key(i); if (k && k.startsWith(prefix)) out.push(k) }
  return out
}

function pruneOldest(store: KV, prefix: string, keep: number, except: string) {
  const ks = keysWithPrefix(store, prefix).filter((k) => k !== except)
  const dated = ks.map((k) => { let at = 0; try { at = Date.parse(JSON.parse(store.getItem(k) || '{}').at || '') || 0 } catch {} return { k, at } })
  dated.sort((a, b) => b.at - a.at)
  for (const { k } of dated.slice(keep)) store.removeItem(k)
}

export function readDraftSlot(store: KV, uid: string, cardKey: string): DraftListing | null {
  try {
    const raw = store.getItem(draftSlotKey(uid, cardKey))
    if (!raw) return null
    const v = JSON.parse(raw) as { at?: string; draft?: DraftListing }
    return v && v.draft && typeof v.draft.address === 'string' ? v.draft : null
  } catch { return null }
}

/** false = the browser refused it (usually photos over the quota) even after pruning older slots. */
export function saveDraftSlot(store: KV, uid: string, cardKey: string, draft: DraftListing): boolean {
  const key = draftSlotKey(uid, cardKey)
  const value = JSON.stringify({ at: new Date().toISOString(), draft })
  try {
    pruneOldest(store, `${DRAFT_SLOT_PREFIX}${uid}:`, MAX_DRAFT_SLOTS - 1, key)
    store.setItem(key, value)
    return true
  } catch {
    try {
      for (const k of keysWithPrefix(store, `${DRAFT_SLOT_PREFIX}${uid}:`)) if (k !== key) store.removeItem(k)
      store.setItem(key, value)
      return true
    } catch { return false }
  }
}

export function readDraftDone(store: KV, uid: string, cardKey: string): DraftDone | null {
  try {
    const raw = store.getItem(draftDoneKey(uid, cardKey))
    const v = raw ? (JSON.parse(raw) as DraftDone) : null
    return v && (v.kind === 'published' || v.kind === 'updated') ? v : null
  } catch { return null }
}

/** Record that this card's listing went out, so the card renders as done after a reload. */
export function markDraftDone(store: KV, uid: string, cardKey: string, done: Omit<DraftDone, 'at'>): void {
  try {
    store.removeItem(draftSlotKey(uid, cardKey))
    const key = draftDoneKey(uid, cardKey)
    pruneOldest(store, `${DRAFT_DONE_PREFIX}${uid}:`, MAX_DONE_MARKERS - 1, key)
    store.setItem(key, JSON.stringify({ ...done, at: new Date().toISOString() }))
  } catch { /* storage unavailable: the card falls back to its in-memory state */ }
}
