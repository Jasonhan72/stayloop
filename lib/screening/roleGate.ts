// Who may use tenant screening (user 2026-09-29:「租客筛选功能需要房东或者经纪的角色才可以使用」):
//   · an account that holds the landlord hat — a landlords row, the free, explicit opt-in at
//     /landlord/become (pages never grant it on load since 2026-09-24);
//   · a RECO agent whose registration is live (verified or renewal_due) — directly, no client
//     delegation needed (same day, user:「经纪可以直接筛选，这个本来就是经纪的工作，客户默认委托了
//     这个的」). A confirmed client delegation is optional: it records the screening under the
//     client too, so the landlord sees the report in their own account;
//   · anyone who can read a delegated screening (its parties, while the delegation is live — RLS);
//   · a Stayloop admin.
// A tenant-only account, or an agent whose registration is pending / expired, is sent elsewhere.
//
// Enforced at four points — the screenings insert trigger (guard_screening_role),
// /api/screen-score, /api/deep-check and /api/verify/create — and the pages route people
// the same way (/screening/app → /landlord/become for accounts that are neither, the agent rail
// for live agents, the /screening page's button splits by hat). No 'use client': the routes import it.
import type { SupabaseClient } from '@supabase/supabase-js'
import { isRegistrationLive } from '@/lib/agentProfile'

export type HatFlags = { landlord?: boolean; admin?: boolean; agent?: string | null } | null | undefined

/** `delegated` = the screening in question carries a client delegation the caller can read. */
export function mayScreen(hats: HatFlags, delegated: boolean): boolean {
  return !!(hats?.landlord || hats?.admin || isRegistrationLive(hats?.agent) || delegated)
}

export const SCREENING_ROLE_CODE = 'role_required'
/** The message the insert trigger raises (supabase-js surfaces it as the error message). */
export const SCREENING_ROLE_DB_ERROR = 'screening_requires_landlord_or_agent'
export const SCREENING_ROLE_MESSAGE = {
  zh: '租客筛查只对房东和经纪开放：房东请先开通房东身份（免费）；经纪在 RECO 注册核验通过后即可使用。',
  en: 'Tenant screening is for landlords and agents: landlords activate the landlord identity (free); agents can use it once their RECO registration is verified.',
}

/** The caller's hats through their own client (my_hats is SECURITY DEFINER and executable by authenticated). */
export async function callerHats(client: SupabaseClient): Promise<HatFlags> {
  const { data } = await client.rpc('my_hats')
  return (data ?? null) as HatFlags
}
