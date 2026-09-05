import { NextRequest, NextResponse } from 'next/server'
import { isVerifyToken } from '@/lib/verify/token'
import { adminClient, isExpired, loadRequest, toPublicView } from '@/lib/verify/store'
import { CONSENT_VERSION } from '@/lib/verify/consent'

export const runtime = 'edge'

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
    await admin.from('verification_requests').update({ consent, status: 'consented', updated_at: consent.accepted_at }).eq('id', row.id)
    return NextResponse.json(toPublicView({ ...row, consent, status: 'consented' }))
  } catch (err: any) {
    console.error('verify/consent error', err?.message || err)
    return NextResponse.json({ ok: false, error: 'internal' }, { status: 500 })
  }
}
