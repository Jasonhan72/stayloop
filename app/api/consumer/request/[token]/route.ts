// GET /api/consumer/request/<token> — the applicant's view of their request
// (V0.8 G19). Opening the link is the email verification: the first GET
// stamps email_verified_at. Returns status, masked email, matched screening
// summaries (id / date / landlord name / property — no content), disputes
// and the live identity alert. Invalid / expired / closed token → 404
// {error:'invalid_token'}; the response never says whether the token ever
// existed.
import { NextResponse } from 'next/server'
import { NO_STORE, adminClient, audit, loadRequestByToken, requestView } from '@/lib/consumer/server'

export const runtime = 'edge'

export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params
  const admin = adminClient()
  const request = await loadRequestByToken(admin, token)
  if (!request) return NextResponse.json({ error: 'invalid_token' }, { status: 404, headers: NO_STORE })
  if (!request.email_verified_at) {
    const at = new Date().toISOString()
    await admin.from('consumer_requests').update({ email_verified_at: at }).eq('id', request.id).is('email_verified_at', null)
    request.email_verified_at = at
    await audit(admin, 'consumer_email_verified', request, {})
  }
  return NextResponse.json(await requestView(admin, request), { headers: NO_STORE })
}
