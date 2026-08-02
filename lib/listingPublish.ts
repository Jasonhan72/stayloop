import type { SupabaseClient } from '@supabase/supabase-js'
import type { DraftListing } from '@/lib/agent/types'

// Form input for buildListingRow. Same shape as DraftListing, but the wizard
// path passes parseInt(...) || null for numeric fields, so those allow null.
export type ListingFormInput = Omit<DraftListing, 'monthly_rent' | 'sqft' | 'deposit' | 'year_built'> & {
  monthly_rent: number | null
  sqft?: number | null
  deposit?: number | null
  year_built?: number | null
}

export const LISTING_PUBLISH_MSG = {
  landlordNotFound: { zh: '未找到房东档案，请先完成注册', en: 'Landlord profile not found' },
  duplicate: { zh: '该地址已有相同房源，请勿重复发布', en: 'A listing at this address already exists' },
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

// Never include verification_status / verified_at / source overrides beyond
// computeListingSource — the DB trigger guard_listing_trust_fields owns those.
export function buildListingRow(form: ListingFormInput, opts: BuildListingRowOpts) {
  if (opts.slim) {
    return {
      landlord_id: opts.landlordId,
      address: form.address,
      unit: form.unit || null,
      city: form.city,
      province: 'ON',
      monthly_rent: form.monthly_rent,
      bedrooms: form.bedrooms,
      bathrooms: form.bathrooms,
      property_type: form.property_type,
      sqft: form.sqft ?? null,
      deposit: form.deposit ?? null,
      year_built: form.year_built ?? null,
      amenities: form.amenities,
      slug: opts.slug,
      is_active: true,
    }
  }
  const photos = opts.photos ?? []
  return {
    landlord_id: opts.landlordId,
    address: form.address,
    unit: form.unit || null,
    city: form.city || 'Toronto',
    province: 'ON',
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

export type PublishListingResult = { slug: string; error: null } | { slug: null; error: string }

// Dup-check + insert. selectSlug re-reads the slug from the inserted row
// (wizard path); otherwise the row's own slug is returned without a select.
export async function publishListing(
  client: SupabaseClient,
  row: ListingRow,
  opts: { zh: boolean; selectSlug?: boolean },
): Promise<PublishListingResult> {
  let dupQ = client.from('listings').select('id', { count: 'exact', head: true }).eq('landlord_id', row.landlord_id).ilike('address', row.address)
  if (row.unit) dupQ = dupQ.eq('unit', row.unit)
  else dupQ = dupQ.is('unit', null)
  const { count: dupCount } = await dupQ
  if (dupCount && dupCount > 0) {
    return { slug: null, error: opts.zh ? LISTING_PUBLISH_MSG.duplicate.zh : LISTING_PUBLISH_MSG.duplicate.en }
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
