import { NextRequest, NextResponse } from 'next/server'
import { isVerifyToken } from '@/lib/verify/token'
import { adminClient, isExpired, loadRequest, toPublicView } from '@/lib/verify/store'
import { flinksApi } from '@/lib/verify/providers/flinks'
import { pollBankRead } from '@/lib/verify/bankFlow'
import { underVerifyLimits } from '@/lib/verify/limits'


// POST /api/verify/<token>/bank/poll — one more GetAccountsDetailAsync step for a
// bank read that answered 202 (B6, 2026-10-19). The page calls it every 5 s while
// steps.bank is 'submitted' (about 10 minutes); after that, or with the tab closed,
// /api/cron/verify-sweep carries on hourly until BANK_READ_TIMEOUT_MS (2 h).
export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params
  if (!isVerifyToken(token)) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 })
  if (!(await underVerifyLimits('bank-poll', token, req.headers))) return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429, headers: { 'Retry-After': '600' } })
  const admin = adminClient()
  const row = await loadRequest(admin, token)
  if (!row) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 })
  if (!row.consent) return NextResponse.json({ ok: false, error: 'consent_required' }, { status: 403 })
  // An expired link still finishes a read already under way — only new connects are refused.
  if (isExpired(row) && row.steps?.bank?.status !== 'submitted') return NextResponse.json({ ok: false, error: 'expired' }, { status: 410 })

  const out = await pollBankRead(admin, flinksApi, row)
  const fresh = (await loadRequest(admin, token)) || row
  return NextResponse.json({
    ...toPublicView(fresh),
    bank_state: out.state,
    ...(out.state === 'failed' ? { error: 'provider_error', error_code: out.code } : {}),
  })
}
