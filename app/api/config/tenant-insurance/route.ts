// Public read of the tenant-insurance referral config.
//
// app_config is admin-only under RLS, so the browser cannot read it directly;
// this route reads via the service role and exposes ONLY the three whitelisted
// fields. No row / disabled / malformed config ⇒ { enabled: false } and the
// frontend hides the card entirely.
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'edge'

export async function GET() {
  const disabled = NextResponse.json(
    { enabled: false },
    { headers: { 'cache-control': 'public, max-age=300' } }
  )
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) return disabled
    const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
    const { data, error } = await sb
      .from('app_config')
      .select('value')
      .eq('key', 'tenant_insurance_referral')
      .maybeSingle()
    if (error || !data?.value || typeof data.value !== 'object') return disabled

    const v = data.value as Record<string, unknown>
    const partnerName = typeof v.partner_name === 'string' ? v.partner_name.trim() : ''
    const link = typeof v.url === 'string' ? v.url.trim() : ''
    if (v.enabled !== true || !partnerName || !/^https?:\/\//i.test(link)) return disabled

    return NextResponse.json(
      { enabled: true, partner_name: partnerName.slice(0, 80), url: link.slice(0, 500) },
      { headers: { 'cache-control': 'public, max-age=300' } }
    )
  } catch {
    return disabled
  }
}
