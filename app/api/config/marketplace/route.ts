// Public read of the marketplace rules an admin can set (节点 3 2026-09-26).
//
// app_config is admin-only under RLS; the browser pages that compute
// credential coverage (onboarding, jobs, the landlord directory, the dispatch
// modal) read the grace days here so their chips agree with the server's
// eligibility rule. Nothing else from the row is exposed.
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { clampGraceDays, GRACE_ELIGIBLE_KINDS } from '@/lib/marketplace/trades'
import { QUOTE_HOURS_DEFAULT, QUOTE_HOURS_MAX, QUOTE_HOURS_MIN } from '@/lib/marketplace/sla'

export const runtime = 'edge'

export async function GET() {
  const headers = { 'cache-control': 'public, max-age=300' }
  const base = { credential_grace_days: 0, grace_kinds: GRACE_ELIGIBLE_KINDS, quote_hours_default: QUOTE_HOURS_DEFAULT, quote_hours_min: QUOTE_HOURS_MIN, quote_hours_max: QUOTE_HOURS_MAX }
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) return NextResponse.json(base, { headers })
    const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
    const { data } = await sb.from('app_config').select('value').eq('key', 'marketplace').maybeSingle()
    const v = (data?.value && typeof data.value === 'object' ? data.value : {}) as Record<string, unknown>
    return NextResponse.json({ ...base, credential_grace_days: clampGraceDays(v.credential_grace_days) }, { headers })
  } catch {
    return NextResponse.json(base, { headers })
  }
}
