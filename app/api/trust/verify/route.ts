import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'edge'

const ALLOWED_SCOPES = new Set(['identity', 'income', 'bank', 'credit'])
const RATE_LIMIT_PER_MIN = 120

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * POST /api/trust/verify  — Trust API (handbook §08)
 *
 * Partners (banks / insurers / government) call this with a tenant's portable
 * Passport token. We return ONLY "verified + scope" — never raw documents or
 * full statements — and write an audit row for every call.
 *
 * Auth: `X-API-Key` header must match a valid partner key stored in
 * `trust_api_keys` (checked via service-role).
 *
 * Body: { token: string, scopes?: string[] }
 * Returns: { verified, tier, verified_fields, score, boundary, audited }
 */
export async function POST(req: NextRequest) {
  // --- Partner API key auth ---
  const apiKey = req.headers.get('x-api-key')
  if (!apiKey) {
    return NextResponse.json({ error: 'x-api-key header required' }, { status: 401 })
  }

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

  // Validate scopes against allowlist
  const rawScopes = body.scopes ?? ['identity', 'income', 'bank', 'credit']
  const validScopes = rawScopes.filter((s) => ALLOWED_SCOPES.has(s))
  if (rawScopes.length > 0 && validScopes.length === 0) {
    return NextResponse.json({ error: 'no valid scopes provided' }, { status: 400 })
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) {
    return NextResponse.json({ error: 'not configured' }, { status: 500 })
  }
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // Verify partner API key by hash — plaintext keys are never stored.
  const apiKeyHash = await sha256Hex(apiKey)
  const { data: partner } = await admin
    .from('trust_api_keys')
    .select('id, partner_name, active')
    .eq('api_key_hash', apiKeyHash)
    .eq('active', true)
    .maybeSingle()

  if (!partner) {
    return NextResponse.json({ error: 'invalid or inactive api key' }, { status: 403 })
  }

  // Per-key rate limit (fixed 1-minute window). FAIL CLOSED: if the counter
  // RPC errors, refusing one legitimate call is better than removing the
  // cap entirely for a trust product.
  const { data: rateCount, error: rateErr } = await admin.rpc('bump_trust_api_rate', { p_api_key_id: partner.id })
  if (rateErr) {
    console.error('[trust/verify] rate-limit RPC failed — failing closed:', rateErr.message)
    return NextResponse.json(
      { error: 'rate limiter unavailable — retry shortly' },
      { status: 503, headers: { 'Retry-After': '30' } },
    )
  }
  if (typeof rateCount === 'number' && rateCount > RATE_LIMIT_PER_MIN) {
    return NextResponse.json(
      { error: 'rate limit exceeded' },
      { status: 429, headers: { 'Retry-After': '60' } },
    )
  }

  const { data: passport } = await admin
    .from('rental_passports')
    .select('id, tier, id_verified, income_verified, bank_verified, credit_score')
    .eq('portable_token', token)
    .maybeSingle()

  if (!passport) {
    return NextResponse.json({ verified: false, error: 'token not found or revoked' }, { status: 404 })
  }

  // Only booleans + score band — never raw identity / income / statements.
  const requested = new Set(validScopes)
  const verified_fields: Record<string, boolean> = {}
  if (requested.has('identity')) verified_fields.identity = !!passport.id_verified
  if (requested.has('income')) verified_fields.income = !!passport.income_verified
  if (requested.has('bank')) verified_fields.bank = !!passport.bank_verified
  if (requested.has('credit')) verified_fields.credit = passport.credit_score != null

  // Audit every call (immutable activity log). `audited` in the response
  // must reflect reality — a partner relying on our audit trail must not be
  // told a failed insert succeeded.
  const { error: auditErr } = await admin.from('agent_audit_events').insert({
    actor_type: 'system',
    action: 'trust_api_verify',
    target_type: 'rental_passport',
    target_id: passport.id,
    metadata: { scopes: Array.from(requested), tier: passport.tier, partner_id: partner.id, partner_name: partner.partner_name },
  })
  if (auditErr) console.error('[trust/verify] audit insert failed:', auditErr.message)

  return NextResponse.json({
    verified: true,
    tier: passport.tier,
    verified_fields,
    boundary: 'no raw documents exposed — verified result + scope only',
    audited: !auditErr,
  })
}
