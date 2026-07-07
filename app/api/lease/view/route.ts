// /api/lease/view?token= — token-capability read of a lease document.
// The token is the tenant's PERMANENT access: it works before signing (to
// review), and forever after (to view / download the executed agreement).
// Only document content is returned — never internal ids beyond the lease's
// own, never the landlord's account identifiers.
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'edge'

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get('token')?.trim()
  if (!token || token.length < 32) return NextResponse.json({ error: 'invalid token' }, { status: 400 })

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
  const { data: lease } = await admin
    .from('lease_documents')
    .select('id, form_type, status, terms, tenant_name, unit_label, monthly_rent, start_date, end_date, landlord_signature, tenant_signature, signed_at, sent_at')
    .eq('sign_token', token)
    .maybeSingle()
  if (!lease) return NextResponse.json({ error: 'not found' }, { status: 404 })

  return NextResponse.json({ lease })
}
