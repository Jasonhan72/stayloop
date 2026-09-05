import { NextRequest, NextResponse } from 'next/server'
import { veriffParseDecision, veriffVerifySignature } from '@/lib/verify/providers/veriff'
import { adminClient, loadRequest, writeStep } from '@/lib/verify/store'
import { isVerifyToken } from '@/lib/verify/token'

export const runtime = 'edge'

// POST /api/verify/webhook/veriff — decision webhook. Authenticated by
// X-HMAC-SIGNATURE (HMAC-SHA256 of the raw body with the shared secret).
// vendorData carries our verify token. Veriff retries for a week until 200,
// and writes are idempotent (fixed values), so no ledger is needed here.
export async function POST(req: NextRequest) {
  const raw = await req.text()
  const ok = await veriffVerifySignature(raw, req.headers.get('x-hmac-signature'))
  if (!ok) return NextResponse.json({ error: 'invalid signature' }, { status: 401 })
  let payload: unknown
  try { payload = JSON.parse(raw) } catch { return NextResponse.json({ error: 'bad json' }, { status: 400 }) }
  const parsed = veriffParseDecision(payload as Parameters<typeof veriffParseDecision>[0])
  // Events without a decision (e.g. "started" events) are acknowledged and ignored.
  if (!parsed || !parsed.vendorData || !isVerifyToken(parsed.vendorData)) return NextResponse.json({ received: true })
  try {
    const admin = adminClient()
    const row = await loadRequest(admin, parsed.vendorData)
    if (!row) return NextResponse.json({ received: true })
    const d = parsed.result.decision
    const status = d === 'approved' ? 'verified' : d === 'declined' || d === 'expired' || d === 'abandoned' ? 'failed' : 'submitted'
    await writeStep(admin, row, 'id', { status, provider: 'veriff', session_id: parsed.sessionId, sandbox: false, result: parsed.result })
    return NextResponse.json({ received: true })
  } catch (err: any) {
    console.error('veriff webhook error', err?.message || err)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}
