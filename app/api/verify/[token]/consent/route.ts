import { NextRequest, NextResponse } from 'next/server'
import { isVerifyToken } from '@/lib/verify/token'
import { adminClient, isExpired, loadRequest, toPublicView } from '@/lib/verify/store'
import { CONSENT_VERSION } from '@/lib/verify/consent'
import { createClient } from '@supabase/supabase-js'


// POST /api/verify/<token>/consent — { typed_name, version, accepted: true }
// Records meaningful consent BEFORE any provider is launched. Stored with the
// version actually shown; re-consent is required if the version changes.
export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params
  if (!isVerifyToken(token)) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 })
  try {
    const admin = adminClient()
    const row = await loadRequest(admin, token)
    if (!row) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 })
    if (isExpired(row)) return NextResponse.json({ ok: false, error: 'expired' }, { status: 410 })
    const body = (await req.json().catch(() => ({}))) as { typed_name?: string; version?: string; accepted?: boolean }
    const name = (body.typed_name || '').toString().trim()
    if (body.accepted !== true || name.length < 2 || name.length > 120) {
      return NextResponse.json({ ok: false, error: 'consent_incomplete' }, { status: 400 })
    }
    if (body.version !== CONSENT_VERSION) return NextResponse.json({ ok: false, error: 'consent_version' }, { status: 409 })
    const consent = {
      version: CONSENT_VERSION,
      accepted_at: new Date().toISOString(),
      typed_name: name,
      ua: (req.headers.get('user-agent') || '').slice(0, 200),
    }
    // Whose verification is this? The request names an address the landlord typed, which proves
    // nothing. When the person consenting is signed in to the account that owns that address
    // (a confirmed email), the request is bound to that account, and only bound requests show up
    // in a passport (code review 2026-11-15, S2-9). No session, or another account: not bound —
    // the screening still gets the result, the passport does not.
    const tenantAuthId = await consentingAccount(req, (row as { tenant_email?: string | null }).tenant_email)
    await admin.from('verification_requests').update({ consent, status: 'consented', updated_at: consent.accepted_at, ...(tenantAuthId ? { tenant_auth_id: tenantAuthId } : {}) }).eq('id', row.id)
    return NextResponse.json(toPublicView({ ...row, consent, status: 'consented' }))
  } catch (err: any) {
    console.error('verify/consent error', err?.message || err)
    return NextResponse.json({ ok: false, error: 'internal' }, { status: 500 })
  }
}

/** The signed-in account consenting, when its confirmed email is the address the request names. */
async function consentingAccount(req: NextRequest, tenantEmail: string | null | undefined): Promise<string | null> {
  const want = (tenantEmail || '').trim().toLowerCase()
  const authHeader = (req.headers.get('authorization') || '').replace(/[^\x20-\x7E]/g, '').trim()
  if (!want || !authHeader) return null
  try {
    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false, autoRefreshToken: false } })
    const { data } = await sb.auth.getUser()
    const u = data?.user
    if (!u || u.is_anonymous || !u.email_confirmed_at) return null
    return (u.email || '').trim().toLowerCase() === want ? u.id : null
  } catch {
    return null
  }
}
