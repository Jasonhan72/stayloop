// Rental matters · server side (service role). The database derives the
// matter (ensure_matter); this module is the thin wrapper every writer uses
// so threads, audit rows and notifications carry the same id.
import type { SupabaseClient } from '@supabase/supabase-js'

export type MatterKind = 'listing' | 'application' | 'screening' | 'lease' | 'household' | 'work_order'

/** The matter of a row (created from its chain when missing). Null when the row has no chain yet. Never throws. */
export async function ensureMatter(admin: SupabaseClient, kind: MatterKind, refId: string): Promise<string | null> {
  try {
    const { data, error } = await admin.rpc('ensure_matter', { p_kind: kind, p_ref: refId })
    if (error) { console.warn('[matters] ensure_matter failed:', error.message); return null }
    return typeof data === 'string' && data ? data : null
  } catch (e) {
    console.warn('[matters] ensure_matter threw:', (e as Error).message)
    return null
  }
}

/** Map an audit matter reference (type + id) to the matter it belongs to. */
export async function matterOfRef(admin: SupabaseClient, matterType: string | null, matterId: string | null): Promise<string | null> {
  if (!matterType || !matterId) return null
  const kind: MatterKind | null = matterType === 'ticket' ? null : (['listing', 'application', 'screening', 'lease', 'household', 'work_order'] as const).includes(matterType as MatterKind) ? (matterType as MatterKind) : null
  if (!kind) return null
  return ensureMatter(admin, kind, matterId)
}

/** Thread kind → matter kind. */
export function matterKindOfThread(kind: 'work_order' | 'application' | 'tenancy' | 'dispute'): MatterKind {
  return kind === 'tenancy' ? 'household' : kind === 'dispute' ? 'work_order' : kind
}
