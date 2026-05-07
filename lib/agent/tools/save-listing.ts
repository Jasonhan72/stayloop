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
    parking?: string | null
    utilities_included?: string[]
    pet_policy?: string | null
    available_date?: string | null
    mls_number?: string | null
  }
  /** 'manual' | 'mls_pdf' | 'realtor_url' | 'kijiji_url' | 'ai_assisted' */
  source: string
  /** 'draft' | 'active' — default draft. */
  status?: 'draft' | 'active'
}

interface SaveOutput {
  success: boolean
  listing_id: string | null
  error?: string
}

const tool: CapabilityTool<SaveInput, SaveOutput> = {
  name: 'save_listing',
  version: '1.0.0',
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
      slug,
      status,
      // is_active mirrors status: drafts aren't visible publicly, actives are.
      // The portfolio page filters on this so we keep them in lockstep.
      is_active: status === 'active',
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
