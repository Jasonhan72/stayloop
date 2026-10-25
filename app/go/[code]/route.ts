// GET /go/<code> — a listing's per-channel short link (分享包 v2, 2026-10-26).
// Counts the click (bump_share_link, service role) and sends the visitor to the
// Stayloop listing page with ?src=<channel>, so the landlord can see which
// channel brought people. Unknown or malformed codes go to /listings. Nothing
// about the visitor is stored beyond the counter; the hourly cap is per IP and
// fails open (a counter is not worth blocking a prospective tenant).
import { NextResponse } from 'next/server'
import { underHourlyLimit } from '@/lib/rateLimit'
import { SHARE_CODE_RE } from '@/lib/listings/sharePack'
import { adminClient, siteUrl } from '@/lib/listings/serverAuth'

const HEADERS = { 'Cache-Control': 'no-store' }

export async function GET(req: Request, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params
  const site = siteUrl()
  const fallback = NextResponse.redirect(`${site}/listings`, { status: 302, headers: HEADERS })
  if (!SHARE_CODE_RE.test(code || '')) return fallback
  const ip = req.headers.get('cf-connecting-ip') || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (!(await underHourlyLimit(`go:${ip}`, 600, true))) return fallback
  try {
    const { data } = await adminClient().rpc('bump_share_link', { p_code: code })
    const row = (Array.isArray(data) ? data[0] : data) as { slug: string | null; channel: string } | null | undefined
    if (!row?.slug) return fallback
    return NextResponse.redirect(`${site}/listings/${encodeURIComponent(row.slug)}?src=${encodeURIComponent(row.channel)}`, { status: 302, headers: HEADERS })
  } catch {
    return fallback
  }
}
