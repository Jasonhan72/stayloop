// Who may use tenant screening (user 2026-09-29:「租客筛选功能需要房东或者经纪的角色才可以使用」):
//   · an account that holds the landlord hat — a landlords row, the free, explicit opt-in at
//     /landlord/become (pages never grant it on load since 2026-09-24);
//   · a RECO agent working on a client's screening under that client's delegation — the
//     delegation exists only for a live registration, is validated when the row is created
//     (guard_screening_delegation) and RLS lets the agent read the row only while it is live;
//   · a Stayloop admin.
// A tenant-only account is sent to its own door (the passport) instead.
//
// Enforced at four points — the screenings insert trigger (guard_screening_role),
// /api/screen-score, /api/deep-check and /api/verify/create — and the pages route people
// the same way (/screening/app → /landlord/become, the agent rail needs a live delegation,
// the /screening page's button splits by hat). No 'use client': the routes import it.
import type { SupabaseClient } from '@supabase/supabase-js'

export type HatFlags = { landlord?: boolean; admin?: boolean } | null | undefined

/** `delegated` = the screening in question carries a client delegation the caller can read. */
export function mayScreen(hats: HatFlags, delegated: boolean): boolean {
  return !!(hats?.landlord || hats?.admin || delegated)
}

export const SCREENING_ROLE_CODE = 'role_required'
/** The message the insert trigger raises (supabase-js surfaces it as the error message). */
export const SCREENING_ROLE_DB_ERROR = 'screening_requires_landlord_or_agent'
export const SCREENING_ROLE_MESSAGE = {
  zh: '租客筛查只对房东开放：请先开通房东身份（免费）；经纪请从客户表、在客户确认的委托下发起。',
  en: 'Tenant screening is for landlords: activate the landlord identity (free); agents start from the client table, under a delegation the client has confirmed.',
}

/** The caller's hats through their own client (my_hats is SECURITY DEFINER and executable by authenticated). */
export async function callerHats(client: SupabaseClient): Promise<HatFlags> {
  const { data } = await client.rpc('my_hats')
  return (data ?? null) as HatFlags
}
