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


// Per-isolate memo (code review 2026-11-15, S3-11): this is an anonymous endpoint with no
// limiter, and each call was one service-role read. The value changes when an admin edits the
// rules, so five minutes of staleness — the same as the browser cache header — is fine.
const MEMO_MS = 5 * 60_000
let memo: { at: number; grace: number } | null = null

export async function GET() {
  const headers = { 'cache-control': 'public, max-age=300' }
  const base = { credential_grace_days: 0, grace_kinds: GRACE_ELIGIBLE_KINDS, quote_hours_default: QUOTE_HOURS_DEFAULT, quote_hours_min: QUOTE_HOURS_MIN, quote_hours_max: QUOTE_HOURS_MAX }
  try {
    if (memo && Date.now() - memo.at < MEMO_MS) return NextResponse.json({ ...base, credential_grace_days: memo.grace }, { headers })
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) return NextResponse.json(base, { headers })
    const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
    const { data, error } = await sb.from('app_config').select('value').eq('key', 'marketplace').maybeSingle()
    // A failed read is not the admin's value: answer with the defaults, remember nothing.
    if (error) return NextResponse.json(base, { headers })
    const v = (data?.value && typeof data.value === 'object' ? data.value : {}) as Record<string, unknown>
    const grace = clampGraceDays(v.credential_grace_days)
    memo = { at: Date.now(), grace }
    return NextResponse.json({ ...base, credential_grace_days: grace }, { headers })
  } catch {
    return NextResponse.json(base, { headers })
  }
}
