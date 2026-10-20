import { NextRequest, NextResponse } from 'next/server'
import { isVerifyToken } from '@/lib/verify/token'
import { adminClient, isExpired, loadRequest, toPublicView } from '@/lib/verify/store'
import { flinksApi } from '@/lib/verify/providers/flinks'
import { startBankRead } from '@/lib/verify/bankFlow'
import { underVerifyLimits } from '@/lib/verify/limits'
import { isFlinksLoginId } from '@/lib/verify/bankMessage'


// POST /api/verify/<token>/bank — { login_id } from Flinks Connect's REDIRECT
// event. Exchanges it server-side for 90 days of transactions and stores only
// the deterministic summary (masked accounts, holders, recurring deposits).
// Raw transactions never reach the database or the landlord, and the loginId
// is deleted at Flinks once the summary is stored (lib/verify/bankFlow.ts).
// A slow bank answers { bank_state: 'reading' }; the page then polls /bank/poll.
export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params
  if (!isVerifyToken(token)) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 })
  if (!(await underVerifyLimits('bank', token, req.headers))) return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429, headers: { 'Retry-After': '3600' } })
  const admin = adminClient()
  const row = await loadRequest(admin, token)
  if (!row) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 })
  if (isExpired(row)) return NextResponse.json({ ok: false, error: 'expired' }, { status: 410 })
  if (!row.consent) return NextResponse.json({ ok: false, error: 'consent_required' }, { status: 403 })
  const body = (await req.json().catch(() => ({}))) as { login_id?: string }
  const loginId = isFlinksLoginId(body.login_id) ? body.login_id : null
  if (!loginId) return NextResponse.json({ ok: false, error: 'login_id required' }, { status: 400 })

  const out = await startBankRead(admin, flinksApi, row, loginId)
  const fresh = (await loadRequest(admin, token)) || row
  return NextResponse.json({
    ...toPublicView(fresh),
    bank_state: out.state,
    ...(out.state === 'failed' ? { error: 'provider_error', error_code: out.code } : {}),
  }, { status: out.state === 'failed' ? 502 : 200 })
}
