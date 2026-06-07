// -----------------------------------------------------------------------------
// 2026-06-02 — Code review §7 P1 — Runtime input validation. The audit
// brief listed `write-listing` but the actual file in the tree is
// `save-listing.ts` (the tool name is `save_listing`); same tool, this
// patch targets it. Hand-rolled validator runs at the top of the handler
// so bad LLM-supplied shape becomes a tool error block the LLM can
// recover from, instead of a 500 from supabase.from('listings').insert().
// Avoids Zod to keep the edge bundle small.
// -----------------------------------------------------------------------------
// Tool: save_listing
// -----------------------------------------------------------------------------
// Persist a structured listing to the listings table. Returns the new
// listing id. Service-role write, since the agent runs server-side.
// -----------------------------------------------------------------------------

import type { CapabilityTool } from '../types'
import { registerTool } from '../registry'

interface SaveInput {
  /** From import_listing output. */
  listing: {
    title_en?: string | null
    title_zh?: string | null
    description_en?: string | null
    description_zh?: string | null
    address?: string | null
    city?: string | null
    province?: string | null
    postal_code?: string | null
    monthly_rent?: number | null
    bedrooms?: number | null
    bathrooms?: number | null
    sqft?: number | null
    parking?: string | null
    utilities_included?: string[]
    pet_policy?: string | null
    available_date?: string | null
    mls_number?: string | null
    images?: string[]
    amenities?: string[]
    year_built?: number | null
    broker_name?: string | null
    broker_phone?: string | null
    brokerage?: string | null
  }
  /** 'manual' | 'mls_pdf' | 'realtor_url' | 'kijiji_url' | 'ai_assisted' */
  source: string
  /** Original source URL (when source is a URL). Persisted on the row. */
  source_url?: string
  /** 'draft' | 'active' — default draft. */
  status?: 'draft' | 'active'
}

interface SaveOutput {
  success: boolean
  listing_id: string | null
  error?: string
}

// §7 P1 — validator for save_listing.
//
// We type-check at the boundary; values beyond required keys are not
// rejected (extra keys are harmless because we explicitly cherry-pick
// fields into `row` below).
function validateSaveInput(input: unknown): asserts input is SaveInput {
  if (!input || typeof input !== 'object') {
    throw new Error('save_listing: input must be an object')
  }
  const i = input as Record<string, unknown>
  if (!i.listing || typeof i.listing !== 'object' || Array.isArray(i.listing)) {
    throw new Error('save_listing: input.listing must be an object')
  }
  if (typeof i.source !== 'string' || i.source.length === 0) {
    throw new Error('save_listing: input.source must be a non-empty string')
  }
  if (i.source_url !== undefined && typeof i.source_url !== 'string') {
    throw new Error('save_listing: input.source_url must be a string when present')
  }
  if (i.status !== undefined && i.status !== 'draft' && i.status !== 'active') {
    throw new Error(`save_listing: input.status must be 'draft' | 'active' (got ${JSON.stringify(i.status)})`)
  }
  // Spot-check the listing fields that go straight into a typed DB column.
  // We don't validate every optional field — the row builder below uses ??
  // fallbacks for everything — but the few that COULD trip Postgres if
  // they're not the right primitive type are checked here.
  const l = i.listing as Record<string, unknown>
  for (const k of ['monthly_rent', 'bedrooms', 'bathrooms', 'sqft', 'year_built'] as const) {
    if (l[k] !== undefined && l[k] !== null && typeof l[k] !== 'number') {
      throw new Error(`save_listing: input.listing.${k} must be a number | null when present`)
    }
  }
  for (const k of ['utilities_included', 'images', 'amenities'] as const) {
    if (l[k] !== undefined && !Array.isArray(l[k])) {
      throw new Error(`save_listing: input.listing.${k} must be an array when present`)
    }
  }
}

const tool: CapabilityTool<SaveInput, SaveOutput> = {
  name: 'save_listing',
  // Bumped from 1.0.0 to mark the validation addition.
  version: '1.1.0',
  description:
    'Persist a structured listing to the database for the current user (landlord or agent). Returns the new listing id. ' +
    '把结构化房源存入数据库（归当前 landlord 或 agent 名下）。',
  inputSchema: {
    type: 'object',
    properties: {
      listing: { type: 'object' },
      source: { type: 'string' },
      status: { type: 'string', enum: ['draft', 'active'] },
    },
    required: ['listing', 'source'],
  },
  // Mutation — but listing creation is benign and immediately useful, so
  // we keep needsApproval=false. Truly destructive ops (delete listing,
  // post to external sites) would need approval.
  needsApproval: false,
  handler: async (input, ctx) => {
    // §7 P1 — validate LLM-supplied shape before any DB write.
    validateSaveInput(input)

    // Look up the landlord row for this user (matches /api/screen-score pattern)
    const { data: landlord } = await ctx.supabaseAdmin
      .from('landlords')
      .select('id')
      .eq('auth_id', ctx.userId)
      .maybeSingle()

    if (!landlord) {
      return { success: false, listing_id: null, error: 'no_landlord_profile' }
    }

    // The listings table requires NOT NULL on address, monthly_rent, slug.
    // Provide robust fallbacks: an "Untitled draft" placeholder address,
    // 0 rent (clearly placeholder), and a generated unique slug. The user
    // can edit the draft later before publishing.
    const slug = generateSlug(input.listing)
    const status = input.status || 'draft'

    const row = {
      landlord_id: landlord.id,
      title: input.listing.title_zh || input.listing.title_en || 'Untitled listing',
      description: input.listing.description_zh || input.listing.description_en || '',
      address: input.listing.address || 'Untitled draft',
      city: input.listing.city || 'Toronto',
      province: input.listing.province || 'ON',
      postal_code: input.listing.postal_code || null,
      monthly_rent: input.listing.monthly_rent ?? 0,
      bedrooms: input.listing.bedrooms ?? null,
      bathrooms: input.listing.bathrooms ?? null,
      sqft: input.listing.sqft ?? null,
      parking: input.listing.parking ?? null,
      utilities_included: Array.isArray(input.listing.utilities_included) ? input.listing.utilities_included : [],
      pet_policy: input.listing.pet_policy ?? null,
      mls_number: input.listing.mls_number ?? null,
      year_built: input.listing.year_built ?? null,
      broker_name: input.listing.broker_name ?? null,
      broker_phone: input.listing.broker_phone ?? null,
      brokerage: input.listing.brokerage ?? null,
      images: Array.isArray(input.listing.images) ? input.listing.images : [],
      amenities: Array.isArray(input.listing.amenities) ? input.listing.amenities : [],
      source_url: input.source_url ?? null,
      slug,
      status,
      // is_active mirrors status: drafts aren't visible publicly, actives are.
      // The portfolio page filters on this so we keep them in lockstep.
      is_active: status === 'active',
      published_at: status === 'active' ? new Date().toISOString() : null,
    }

    const { data, error } = await ctx.supabaseAdmin
      .from('listings')
      .insert(row)
      .select('id')
      .single()

    if (error || !data) {
      return { success: false, listing_id: null, error: error?.message || 'insert_failed' }
    }
    return { success: true, listing_id: data.id }
  },
}

/**
 * Build a URL-safe unique slug from the listing fields. Falls back to a
 * timestamp-suffixed random ID when the address isn't usable yet.
 *
 *   "88 Harbour St Unit 3305" + Toronto → "88-harbour-st-unit-3305-toronto-q5x7d"
 *   (no address)                          → "draft-1714939200000-q5x7d"
 *
 * The 5-char random suffix prevents collisions when two landlords add similar
 * properties at the same time.
 */
function generateSlug(listing: SaveInput['listing']): string {
  const base = (listing.address || '')
    + (listing.city ? ` ${listing.city}` : '')
  const cleaned = base
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\x00-\x7F]/g, '')   // strip non-ascii (Chinese chars, accents)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  const suffix = Math.random().toString(36).slice(2, 7)
  if (!cleaned) return `draft-${Date.now()}-${suffix}`
  return `${cleaned}-${suffix}`
}

registerTool(tool)
export default tool
