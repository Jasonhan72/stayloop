import { NextRequest, NextResponse } from 'next/server'
import { isVerifyToken } from '@/lib/verify/token'
import { adminClient, isExpired, loadRequest, toPublicView, writeStep } from '@/lib/verify/store'
import { flinksAccountsDetail, flinksAuthorize, flinksConfig, flinksToBankResult } from '@/lib/verify/providers/flinks'

export const runtime = 'edge'

// POST /api/verify/<token>/bank — { login_id } from Flinks Connect's REDIRECT
// event. Exchanges it server-side for 90 days of transactions and stores only
// the deterministic summary (masked accounts, holders, recurring deposits).
// Raw transactions never reach the database or the landlord.
export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params
  if (!isVerifyToken(token)) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 })
  const admin = adminClient()
  const row = await loadRequest(admin, token)
  if (!row) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 })
  if (isExpired(row)) return NextResponse.json({ ok: false, error: 'expired' }, { status: 410 })
  if (!row.consent) return NextResponse.json({ ok: false, error: 'consent_required' }, { status: 403 })
  const body = (await req.json().catch(() => ({}))) as { login_id?: string }
  const loginId = typeof body.login_id === 'string' && /^[0-9a-f-]{20,64}$/i.test(body.login_id) ? body.login_id : null
  if (!loginId) return NextResponse.json({ ok: false, error: 'login_id required' }, { status: 400 })

  const cfg = flinksConfig()
  try {
    await writeStep(admin, row, 'bank', { status: 'submitted', provider: 'flinks', session_id: loginId, sandbox: cfg.sandbox })
    const requestId = await flinksAuthorize(loginId)
    const detail = await flinksAccountsDetail(requestId)
    const result = flinksToBankResult(detail)
    const steps = await writeStep(admin, row, 'bank', {
      status: result.accounts.length ? 'verified' : 'failed',
      provider: 'flinks', session_id: loginId, sandbox: cfg.sandbox, result, error: null,
    })
    return NextResponse.json(toPublicView({ ...row, steps }))
  } catch (err: any) {
    const msg = String(err?.message || 'flinks error').slice(0, 200)
    console.error('verify/bank error', msg)
    const steps = await writeStep(admin, row, 'bank', { status: 'failed', provider: 'flinks', session_id: loginId, sandbox: cfg.sandbox, error: msg })
    return NextResponse.json({ ...toPublicView({ ...row, steps }), error: 'provider_error', detail: msg }, { status: 502 })
  }
}
