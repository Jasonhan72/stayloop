// Outside-channel records for a listing (V0.8 第二项 · 第 3 / 4 步, 2026-10-22).
// Client-safe: types, labels and the input checks shared by the route, the
// landlord's dashboard line and the agent's hand-off board.
//
// The MLS® channel is a HAND-OFF, not an integration: the landlord asks a
// Stayloop-verified agent, the agent lists the unit in their own brokerage system
// and writes back only the MLS® number and the public link. No MLS data enters
// Stayloop (PropTx 2026-10-13); Stayloop does not dispatch, charges nothing and
// takes no part in the trade (2026-09-13).

export type SyndicationChannel = 'mls' | 'facebook_page' | 'instagram' | 'kijiji' | 'rentsync' | 'wechat' | 'xiaohongshu' | 'facebook_group' | 'facebook_marketplace' | 'other'
export type SyndicationStatus = 'requested' | 'posted' | 'declined' | 'removed' | 'failed'

export type SyndicationRow = {
  id: string
  listing_id: string
  channel: SyndicationChannel
  status: SyndicationStatus
  external_id: string | null
  external_url: string | null
  agent_auth_id: string | null
  client_id: string | null
  thread_id: string | null
  requested_by: string | null
  note: string | null
  posted_at: string | null
  removed_at: string | null
  created_at: string
  updated_at: string
}

/** What GET /api/listings/mls-handoff returns: the row plus the two names each side needs. */
export type HandoffItem = SyndicationRow & {
  listing: { id: string; slug: string | null; address: string; unit: string | null; city: string | null; is_active: boolean } | null
  agent: { name: string; brokerage: string; slug: string | null } | null
  /** The caller's side on this row (an agent-landlord may hold both; the row names one). */
  mine: 'landlord' | 'agent'
}

/** The public page's view of a posted MLS® hand-off (no ids, no landlord). */
export type PublicMlsListing = { external_id: string | null; external_url: string | null; agent: { name: string; brokerage: string; slug: string | null } }

export type HandoffAction = 'request' | 'posted' | 'declined' | 'removed'

export const MLS_NUMBER_RE = /^[A-Za-z0-9-]{3,40}$/
export const HANDOFF_NOTE_MAX = 500
export const HANDOFF_MESSAGE_MAX = 1500

export function isMlsNumber(v: unknown): v is string {
  return typeof v === 'string' && MLS_NUMBER_RE.test(v.trim())
}

/** The public link the agent writes back: https only, ≤500 chars, no credentials in it. */
export function isPublicListingUrl(v: unknown): v is string {
  if (typeof v !== 'string' || v.length > 500) return false
  try {
    const u = new URL(v)
    return u.protocol === 'https:' && !u.username && !u.password && !!u.hostname
  } catch { return false }
}

export const STATUS_LABEL: Record<SyndicationStatus, { zh: string; en: string }> = {
  requested: { zh: '待经纪挂牌', en: 'Awaiting the agent' },
  posted: { zh: '已挂牌', en: 'Listed' },
  declined: { zh: '经纪未承接', en: 'Agent declined' },
  removed: { zh: '已撤下', en: 'Taken down' },
  failed: { zh: '失败', en: 'Failed' },
}

export const STATUS_TONE: Record<SyndicationStatus, 'ok' | 'pending' | 'warn' | 'neutral' | 'danger'> = {
  requested: 'pending', posted: 'ok', declined: 'warn', removed: 'neutral', failed: 'danger',
}

/** Which transitions each side may make. The route enforces the same table. */
export function allowedActions(row: Pick<SyndicationRow, 'status'>, side: 'landlord' | 'agent'): HandoffAction[] {
  if (row.status === 'requested') return side === 'agent' ? ['posted', 'declined'] : ['removed']
  if (row.status === 'posted') return ['removed']
  return []
}

/** A listing's live MLS® row (requested or posted), if any. */
export function liveMls(rows: SyndicationRow[] | null | undefined, listingId: string): SyndicationRow | null {
  return (rows ?? []).find((r) => r.listing_id === listingId && r.channel === 'mls' && (r.status === 'requested' || r.status === 'posted')) ?? null
}

/** The most recent MLS® row for a listing of any status (so a declined one is still explained once). */
export function latestMls(rows: SyndicationRow[] | null | undefined, listingId: string): SyndicationRow | null {
  const mine = (rows ?? []).filter((r) => r.listing_id === listingId && r.channel === 'mls').sort((a, b) => b.updated_at.localeCompare(a.updated_at))
  return mine[0] ?? null
}
