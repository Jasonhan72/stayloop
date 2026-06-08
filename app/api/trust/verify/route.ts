import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'edge'

/**
 * POST /api/trust/verify  — Trust API (handbook §08)
 *
 * Partners (banks / insurers / government) call this with a tenant's portable
 * Passport token. We return ONLY "verified + scope" — never raw documents or
 * full statements — and write an audit row for every call.
 *
 * Body: { token: string, scopes?: string[] }
 * Returns: { verified, tier, verified_fields, score, boundary, audited }
 */
export async function POST(req: NextRequest) {
  let body: { token?: string; scopes?: string[] }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  const token = body.token
  if (!token || typeof token !== 'string') {
    return NextResponse.json({ error: 'token required' }, { status: 400 })
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) {
    return NextResponse.json({ error: 'not configured' }, { status: 500 })
  }
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: passport } = await admin
    .from('rental_passports')
    .select('id, tier, id_verified, income_verified, bank_verified, credit_score')
    .eq('portable_token', token)
    .maybeSingle()

  if (!passport) {
    return NextResponse.json({ verified: false, error: 'token not found or revoked' }, { status: 404 })
  }

  // Only booleans + score band — never raw identity / income / statements.
  const requested = new Set(body.scopes ?? ['identity', 'income', 'bank', 'credit'])
  const verified_fields: Record<string, boolean> = {}
  if (requested.has('identity')) verified_fields.identity = !!passport.id_verified
  if (requested.has('income')) verified_fields.income = !!passport.income_verified
  if (requested.has('bank')) verified_fields.bank = !!passport.bank_verified
  if (requested.has('credit')) verified_fields.credit = passport.credit_score != null

  // Audit every call (immutable activity log).
  await admin.from('audit_events').insert({
    actor_type: 'system',
    action: 'trust_api_verify',
    resource_type: 'rental_passport',
    resource_id: passport.id,
    metadata: { scopes: Array.from(requested), tier: passport.tier },
  })

  return NextResponse.json({
    verified: true,
    tier: passport.tier,
    verified_fields,
    boundary: 'no raw documents exposed — verified result + scope only',
    audited: true,
  })
}
