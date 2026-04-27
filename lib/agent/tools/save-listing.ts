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

    const row = {
      landlord_id: landlord.id,
      title: input.listing.title_zh || input.listing.title_en || 'Untitled listing',
      description: input.listing.description_zh || input.listing.description_en || '',
      address: input.listing.address || null,
      city: input.listing.city || null,
      province: input.listing.province || null,
      postal_code: input.listing.postal_code || null,
      monthly_rent: input.listing.monthly_rent || null,
      bedrooms: input.listing.bedrooms || null,
      bathrooms: input.listing.bathrooms || null,
      status: input.status || 'draft',
      // Source kind is informational; some listings tables have this column,
      // some don't. Try to insert; ignore extra-column errors via best-effort.
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

registerTool(tool)
export default tool
