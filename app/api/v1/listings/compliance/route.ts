// POST /api/v1/listings/compliance — Ontario listing compliance, deterministic
// (Trust API plan §3.3). Free and anonymous: no PII goes in, only listing
// terms; findings cite rule ids from lib/ontario/rules.ts and link to /rules.
// Rate-limited per IP through the shared anonymous limiter.
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { checkListingCompliance, type ListingInput } from '@/lib/ontario/rules'
import { underHourlyLimit } from '@/lib/rateLimit'

export const runtime = 'edge'

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type,x-api-key', 'Access-Control-Allow-Methods': 'POST,OPTIONS' }

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}

export async function POST(req: Request) {
  const ip = (req.headers.get('cf-connecting-ip') || req.headers.get('x-forwarded-for') || 'unknown').split(',')[0].trim()
  if (!(await underHourlyLimit(`compliance:${ip}`, 120, true))) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429, headers: { ...CORS, 'Retry-After': '3600' } })
  }
  let body: ListingInput
  try { body = (await req.json()) as ListingInput } catch { return NextResponse.json({ error: 'invalid JSON body' }, { status: 400, headers: CORS }) }
  const input: ListingInput = {
    monthly_rent: num(body.monthly_rent),
    deposit: num(body.deposit),
    key_deposit: num(body.key_deposit),
    application_fee: num(body.application_fee),
    pets_allowed: typeof body.pets_allowed === 'string' ? body.pets_allowed.slice(0, 20) : null,
    title: typeof body.title === 'string' ? body.title.slice(0, 500) : null,
    description: typeof body.description === 'string' ? body.description.slice(0, 8000) : null,
    schedule_b: typeof body.schedule_b === 'string' ? body.schedule_b.slice(0, 8000) : null,
  }
  const { passed, findings } = checkListingCompliance(input)
  // Aggregate-only telemetry for the ROI metric; no listing text is stored.
  if (findings.length && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
      await admin.from('compliance_events').insert(findings.map((f) => ({ source: 'compliance_api', rule_id: f.rule, severity: f.severity, metadata: {} })))
    } catch { /* telemetry only */ }
  }
  return NextResponse.json({
    passed,
    findings: findings.map((f) => ({ rule: f.rule, statute: f.statute, severity: f.severity, message: f.message, url: `https://www.stayloop.ai/rules#${f.rule}` })),
    checked: ['RTA-106-deposit-cap', 'OREG516-17-key-deposit', 'RTA-14-no-pet-clause', 'RTA-134-no-fees'],
    boundary: 'Deterministic Ontario rules only (RTA / O. Reg. 516/06). Not legal advice. No personal data is accepted or stored.',
  }, { headers: CORS })
}

function num(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
