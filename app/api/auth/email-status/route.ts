import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { underHourlyLimit } from '@/lib/rateLimit'
import { normalizeLookupEmail, toEmailStatus } from '@/lib/auth/emailStatus'

export const runtime = 'edge'

/**
 * POST /api/auth/email-status  { email } → { exists, password, google }
 *
 * The homepage sign-in's first step (2026-09-29): an existing password
 * account goes to the password step, a new email to create-account, a
 * Google-only account is offered Google. The user accepted that this tells a
 * visitor whether an address is registered; what keeps it from becoming a
 * bulk-enumeration service is the limits below. Both fail CLOSED — with no
 * limiter there is no answer, and the card falls back to the manual path.
 * The answer is three booleans (auth_email_status(), service role only).
 */
const PER_IP = 30
const GLOBAL = 1500

const NO_STORE = { 'Cache-Control': 'no-store' }

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400, headers: NO_STORE })
  }
  const email = normalizeLookupEmail((body as { email?: unknown } | null)?.email)
  if (!email) return NextResponse.json({ error: 'invalid_email' }, { status: 400, headers: NO_STORE })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) return NextResponse.json({ error: 'unavailable' }, { status: 503, headers: NO_STORE })

  const ip =
    req.headers.get('cf-connecting-ip') ||
    (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() ||
    'unknown'
  // One round trip: the lookup runs alongside the two limiters, and its answer
  // is only returned when both allow it.
  const svc = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const [mine, everyone, lookup] = await Promise.all([
    underHourlyLimit(`email-status:${ip}`, PER_IP, false),
    underHourlyLimit('email-status:global', GLOBAL, false),
    svc.rpc('auth_email_status', { p_email: email }),
  ])
  if (!mine || !everyone) return NextResponse.json({ error: 'rate_limited' }, { status: 429, headers: NO_STORE })
  if (lookup.error) return NextResponse.json({ error: 'unavailable' }, { status: 503, headers: NO_STORE })
  return NextResponse.json(toEmailStatus(lookup.data), { headers: NO_STORE })
}
