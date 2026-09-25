// Services marketplace P2 (V0.6, 2026-09-24) — the landlord's dispatch policy.
// Pure functions; the server (lib/marketplace/server.ts) loads the rows and
// acts on the decisions. No money moves here: payment stays offline.
//
//   mode 'suggest'         → today's behavior: a dispatch suggestion card
//   mode 'auto_emergency'  → urgent tickets are sent to the top candidate at
//                            once (heat / water / gas / locks cannot wait for
//                            the landlord to open the app); the rest: a card
//   mode 'auto_all'        → every ticket goes to the top candidate
//
// Emergency pre-authorisation: the landlord may approve, in advance, an
// emergency quote up to a cap. The quote still has to be > 0 and the CPA 10%
// rule still binds the invoice to it; non-emergency quotes always need a click.
import type { Trade } from './trades'

export type DispatchMode = 'suggest' | 'auto_emergency' | 'auto_all'
export const DISPATCH_MODES: readonly DispatchMode[] = ['suggest', 'auto_emergency', 'auto_all']
export const EMERGENCY_CAP_MAX = 2000

export type DispatchPolicy = {
  mode: DispatchMode
  emergency_auto_approve: boolean
  emergency_cap: number
  /** trade → provider id the landlord wants tried first */
  preferred: Partial<Record<Trade, string>>
}

export const DEFAULT_POLICY: DispatchPolicy = { mode: 'suggest', emergency_auto_approve: false, emergency_cap: 500, preferred: {} }

export function normalizePolicy(row: Partial<Record<keyof DispatchPolicy, unknown>> | null | undefined): DispatchPolicy {
  if (!row) return { ...DEFAULT_POLICY, preferred: {} }
  const mode = (DISPATCH_MODES as readonly string[]).includes(String(row.mode)) ? (row.mode as DispatchMode) : 'suggest'
  const capNum = Number(row.emergency_cap)
  const cap = Number.isFinite(capNum) ? Math.min(Math.max(Math.round(capNum), 0), EMERGENCY_CAP_MAX) : DEFAULT_POLICY.emergency_cap
  const preferred: Partial<Record<Trade, string>> = {}
  if (row.preferred && typeof row.preferred === 'object') {
    for (const [k, v] of Object.entries(row.preferred as Record<string, unknown>)) if (typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v)) preferred[k as Trade] = v
  }
  return { mode, emergency_auto_approve: row.emergency_auto_approve === true, emergency_cap: cap, preferred }
}

export type Candidate = {
  provider_id: string
  name: string
  /** jobs this landlord has sent this provider that ended accepted / paid / closed */
  landlordJobsDone?: number
  /** average overall rating across all reviews (1–5), null when none */
  rating?: number | null
  reviews?: number
  /** offers accepted ÷ offers received, null when < 3 offers */
  acceptRate?: number | null
}

/** Preferred first, then the landlord's own track record, then ratings (need ≥2 reviews to count), then acceptance, then name. */
export function rankCandidates(cands: Candidate[], preferredId?: string | null): Candidate[] {
  const score = (c: Candidate) => [
    c.provider_id === preferredId ? 1 : 0,
    c.landlordJobsDone ?? 0,
    (c.reviews ?? 0) >= 2 && c.rating != null ? c.rating : 0,
    c.acceptRate ?? 0,
  ]
  return [...cands].sort((a, b) => {
    const sa = score(a), sb = score(b)
    for (let i = 0; i < sa.length; i++) if (sa[i] !== sb[i]) return sb[i] - sa[i]
    return a.name.localeCompare(b.name)
  })
}

/** Why a candidate is on top — shown on the card / in the audit so an automatic choice is explainable. */
export function rankReason(c: Candidate, preferredId: string | null | undefined, zh = true): string {
  if (c.provider_id === preferredId) return zh ? '你设为该工种首选' : 'your preferred provider for this trade'
  if ((c.landlordJobsDone ?? 0) > 0) return zh ? `你以前派过 ${c.landlordJobsDone} 单并验收` : `${c.landlordJobsDone} past job(s) you accepted`
  if ((c.reviews ?? 0) >= 2 && c.rating != null) return zh ? `评分 ${c.rating.toFixed(1)}（${c.reviews} 条）` : `rated ${c.rating.toFixed(1)} (${c.reviews} reviews)`
  return zh ? '资质有效、覆盖该区域' : 'credentials valid, serves the area'
}

export function shouldAutoDispatch(policy: DispatchPolicy, emergency: boolean, candidates: number): boolean {
  if (candidates < 1) return false
  return policy.mode === 'auto_all' || (policy.mode === 'auto_emergency' && emergency)
}

export function shouldAutoApprove(policy: DispatchPolicy, wo: { emergency: boolean; quote_amount: number | null }): boolean {
  if (!wo.emergency || !policy.emergency_auto_approve) return false
  const amt = Number(wo.quote_amount)
  return Number.isFinite(amt) && amt > 0 && amt <= policy.emergency_cap
}
