// "May this landlord run Pro-level checks on this screening?" — one answer
// for deep-check, applicant verification and anything else that costs us
// per use. Pro/Team subscription, a screening already unlocked, or a prepaid
// credit the consume_unlock_credit RPC spends atomically.
import type { SupabaseClient } from '@supabase/supabase-js'
import { pickLandlordRow } from './subscriptionState'

export async function hasProAccess(
  rls: SupabaseClient,
  userId: string,
  screeningId: string | null,
): Promise<{ ok: boolean; via: 'plan' | 'unlocked' | 'credit' | null }> {
  const { data: rows } = await rls
    .from('landlords')
    .select('id, auth_id, plan')
    .or(`id.eq.${userId},auth_id.eq.${userId}`)
  const landlord = pickLandlordRow(rows, userId)
  const plan = (landlord?.plan as string | undefined) || 'free'
  if (plan === 'pro' || plan === 'team') return { ok: true, via: 'plan' }
  if (!screeningId) return { ok: false, via: null }
  const { data: s } = await rls.from('screenings').select('unlocked_at').eq('id', screeningId).maybeSingle()
  if (s?.unlocked_at) return { ok: true, via: 'unlocked' }
  const { data: spent } = await rls.rpc('consume_unlock_credit', { p_screening_id: screeningId })
  if (spent === true) return { ok: true, via: 'credit' }
  return { ok: false, via: null }
}
