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
import { isPreviewFetch } from '@/lib/listings/previewFetch'

const HEADERS = { 'Cache-Control': 'no-store' }
/** Where a code points, without counting. */
async function resolveNoCount(code: string): Promise<{ slug: string | null; channel: string } | null> {
  const { data } = await adminClient().from('listing_share_links').select('channel, listing:listings(slug)').eq('code', code).maybeSingle()
  const row = data as { channel: string; listing: { slug: string | null } | { slug: string | null }[] | null } | null
  if (!row) return null
  const l = Array.isArray(row.listing) ? row.listing[0] : row.listing
  return { slug: l?.slug ?? null, channel: row.channel }
}

export async function GET(req: Request, ctx: { params: Promise<{ code: string }> }) {
  return handle(req, ctx)
}
export async function HEAD(req: Request, ctx: { params: Promise<{ code: string }> }) {
  return handle(req, ctx)
}

async function handle(req: Request, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params
  const site = siteUrl()
  const fallback = NextResponse.redirect(`${site}/listings`, { status: 302, headers: HEADERS })
  if (!SHARE_CODE_RE.test(code || '')) return fallback
  const ip = req.headers.get('cf-connecting-ip') || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (!(await underHourlyLimit(`go:${ip}`, 600, true))) return fallback
  try {
    let row: { slug: string | null; channel: string } | null | undefined
    if (isPreviewFetch(req.method, req.headers.get('user-agent'))) {
      row = await resolveNoCount(code)
    } else {
      const { data } = await adminClient().rpc('bump_share_link', { p_code: code })
      row = (Array.isArray(data) ? data[0] : data) as { slug: string | null; channel: string } | null | undefined
    }
    if (!row?.slug) return fallback
    return NextResponse.redirect(`${site}/listings/${encodeURIComponent(row.slug)}?src=${encodeURIComponent(row.channel)}`, { status: 302, headers: HEADERS })
  } catch {
    return fallback
  }
}
