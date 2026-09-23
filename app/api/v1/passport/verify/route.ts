// POST /api/v1/passport/verify — applicant-presented verification (Trust API
// plan §3.2–3.3). A partner holding an API key sends the token the applicant
// gave them; we answer with conclusions only, per scope the applicant opted
// into (passport_share_tokens.api_scopes), never files, never PII beyond
// what the applicant chose. Every call is audited and the applicant is told.
//
// Backing data (all applicant-authorised or counterparty-confirmed):
//   identity / bank / credit → verification_requests.steps for requests
//                              addressed to the applicant's login email
//   tenancy                  → leases behind a verified household or a
//                              fully e-signed lease (same rule as /p/<token>)
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { notifyUser } from '@/lib/push/notify'

export const runtime = 'edge'

const SCOPES = ['identity', 'bank', 'credit', 'tenancy'] as const
type Scope = (typeof SCOPES)[number]

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

const BOUNDARY = {
  zh: 'Stayloop 不是《消费者报告法》意义上的报告机构。本响应只包含申请人本人授权分享的核验结论，不含文件；申请人可随时撤销 token。依据 s.10(7)，申请人有权在 60 天内索取不利决定所依据信息的性质与来源。',
  en: 'Stayloop is not a consumer reporting agency under the Consumer Reporting Act. This response contains only conclusions the applicant chose to share — no documents — and the applicant can revoke the token at any time. Under s.10(7) the applicant may, within 60 days, ask for the nature and source of information behind an adverse decision.',
}

export async function POST(req: Request) {
  const apiKey = req.headers.get('x-api-key')
  if (!apiKey) return NextResponse.json({ error: 'x-api-key header required' }, { status: 401 })
  let body: { token?: string; scopes?: string[] }
  try { body = (await req.json()) as typeof body } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }) }
  const token = typeof body.token === 'string' ? body.token.trim() : ''
  if (!/^[A-Za-z0-9_-]{32,}$/.test(token)) return NextResponse.json({ error: 'token required' }, { status: 400 })
  const requested = (Array.isArray(body.scopes) && body.scopes.length ? body.scopes : [...SCOPES]).filter((s): s is Scope => (SCOPES as readonly string[]).includes(s))
  if (!requested.length) return NextResponse.json({ error: 'no valid scopes' }, { status: 400 })

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: partner } = await admin.from('trust_api_keys').select('id, partner_name, active').eq('api_key_hash', await sha256Hex(apiKey)).eq('active', true).maybeSingle()
  if (!partner) return NextResponse.json({ error: 'invalid or inactive api key' }, { status: 403 })
  const { data: rateCount, error: rateErr } = await admin.rpc('bump_trust_api_rate', { p_api_key_id: partner.id })
  if (rateErr) return NextResponse.json({ error: 'rate limiter unavailable — retry shortly' }, { status: 503, headers: { 'Retry-After': '30' } })
  if (typeof rateCount === 'number' && rateCount > 120) return NextResponse.json({ error: 'rate limit exceeded' }, { status: 429, headers: { 'Retry-After': '60' } })
  await admin.from('trust_api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', partner.id)

  const { data: tok } = await admin.from('passport_share_tokens').select('token, tenant_user_id, expires_at, revoked_at, api_scopes').eq('token', token).maybeSingle()
  if (!tok || tok.revoked_at || new Date(tok.expires_at) < new Date()) return NextResponse.json({ verified: false, error: 'token not found, expired or revoked' }, { status: 404 })
  const allowed = new Set<string>(Array.isArray(tok.api_scopes) ? tok.api_scopes : [])
  if (!allowed.size) return NextResponse.json({ verified: false, error: 'the applicant has not enabled API access for this token' }, { status: 403 })
  const scopes = requested.filter((s) => allowed.has(s))
  if (!scopes.length) return NextResponse.json({ verified: false, error: 'none of the requested scopes are shared by the applicant', shared_scopes: Array.from(allowed) }, { status: 403 })

  const { data: u } = await admin.auth.admin.getUserById(tok.tenant_user_id as string)
  const email = (u?.user?.email || '').toLowerCase()
  const out: Record<string, unknown> = {}

  if (email && (scopes.includes('identity') || scopes.includes('bank') || scopes.includes('credit'))) {
    const { data: reqs } = await admin.from('verification_requests').select('steps, updated_at, status').eq('tenant_email', email).in('status', ['consented', 'complete']).order('updated_at', { ascending: false }).limit(5)
    type Step = { status?: string; provider?: string; sandbox?: boolean; result?: Record<string, unknown>; updated_at?: string }
    const pick = (k: 'id' | 'bank' | 'credit'): Step | null => {
      for (const r of reqs ?? []) {
        const st = (r.steps as Record<string, Step> | null)?.[k]
        if (st && st.status === 'verified' && !st.sandbox) return st
      }
      return null
    }
    if (scopes.includes('identity')) { const s = pick('id'); out.identity = s ? { verified: true, provider: s.provider ?? 'veriff', verified_at: s.updated_at ?? null } : { verified: false } }
    if (scopes.includes('bank')) { const s = pick('bank'); const r = (s?.result || {}) as { payroll_monthly_estimate?: number; nsf_count?: number }; out.bank = s ? { verified: true, provider: s.provider ?? 'flinks', payroll_monthly_estimate: r.payroll_monthly_estimate ?? null, nsf_count_90d: r.nsf_count ?? null, verified_at: s.updated_at ?? null } : { verified: false } }
    if (scopes.includes('credit')) { const s = pick('credit'); const r = (s?.result || {}) as { score?: number; delinquent?: boolean }; const band = typeof r.score === 'number' ? (r.score >= 760 ? '760+' : r.score >= 700 ? '700-759' : r.score >= 640 ? '640-699' : r.score >= 560 ? '560-639' : '300-559') : null; out.credit = s ? { verified: true, provider: s.provider ?? 'equifax', score_band: band, delinquent: r.delinquent ?? null, verified_at: s.updated_at ?? null } : { verified: false } }
  }

  if (scopes.includes('tenancy') && email) {
    const { data: confirmed } = await admin.from('households').select('current_lease_id').eq('verified', true).not('current_lease_id', 'is', null).limit(500)
    const confirmedIds = new Set((confirmed ?? []).map((h) => h.current_lease_id as string))
    const { data: leases } = await admin.from('lease_documents').select('id, status, signed_at, landlord_signature, tenant_signature, start_date, end_date').eq('tenant_email', email).limit(20)
    const good = (leases ?? []).filter((l) => confirmedIds.has(l.id as string) || (l.status === 'signed_both' && !!l.signed_at && !!l.landlord_signature && !!l.tenant_signature))
    const ids = good.map((l) => l.id as string)
    let paid = 0, late = 0
    if (ids.length) {
      const { data: pays } = await admin.from('rent_payments').select('status').in('lease_id', ids).in('status', ['paid', 'late']).limit(60)
      for (const p of pays ?? []) { if (p.status === 'paid') paid++; else late++ }
    }
    out.tenancy = { confirmed_tenancies: good.length, rent_records: { paid, late }, note: 'Only counterparty-confirmed tenancies count (verified household or fully e-signed lease).' }
  }

  await admin.from('agent_audit_events').insert({ actor_id: tok.tenant_user_id, actor_type: 'system', action: 'trust_api_passport_verify', target_type: 'passport_share_token', metadata: { scopes, partner_id: partner.id, partner_name: partner.partner_name } })
  void notifyUser(admin, tok.tenant_user_id as string, { kind: 'event', title: '你的护照被查看了 / Your passport was checked', body: `${partner.partner_name} · ${scopes.join(', ')}`, url: '/tenant/passport' })

  return NextResponse.json({ verified: true, scopes, ...out, issued_by: 'applicant', boundary: BOUNDARY, audited: true })
}
