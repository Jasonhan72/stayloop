import { NextRequest, NextResponse } from 'next/server'
import { isVerifyToken } from '@/lib/verify/token'
import { adminClient, loadRequest, toPublicView } from '@/lib/verify/store'

export const runtime = 'edge'

// GET /api/verify/<token> — sanitized state for the public page. The token is
// the credential; nothing here identifies the landlord account or screening.
export async function GET(_req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params
  if (!isVerifyToken(token)) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 })
  try {
    const row = await loadRequest(adminClient(), token)
    if (!row) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 })
    return NextResponse.json(toPublicView(row), { headers: { 'Cache-Control': 'no-store' } })
  } catch (err: any) {
    console.error('verify/get error', err?.message || err)
    return NextResponse.json({ ok: false, error: 'internal' }, { status: 500 })
  }
}
