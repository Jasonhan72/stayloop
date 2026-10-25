// GET /api/listings/poster?code=<share code>&lang=zh|en — the QR poster of one
// listing (分享包 v2, 2026-10-26; drawing in lib/listings/poster.ts). Only the
// listing's owner can fetch it (the code alone is not a credential).
import { NextResponse } from 'next/server'
import { adminClient, callerOf, NO_STORE, ownedListing, siteUrl } from '@/lib/listings/serverAuth'
import { SHARE_CODE_RE, shortLink, type ShareChannel } from '@/lib/listings/shareChannels'
import { posterSvg, qrPath, type PosterListing } from '@/lib/listings/poster'

export async function GET(req: Request) {
  const user = await callerOf(req)
  if (!user) return NextResponse.json({ error: 'sign_in_required' }, { status: 401, headers: NO_STORE })
  const u = new URL(req.url)
  const code = u.searchParams.get('code') || ''
  const lang = u.searchParams.get('lang') === 'en' ? 'en' : 'zh'
  if (!SHARE_CODE_RE.test(code)) return NextResponse.json({ error: 'invalid_input' }, { status: 400, headers: NO_STORE })
  const svc = adminClient()
  const { data: link } = await svc.from('listing_share_links').select('listing_id, channel, code').eq('code', code).maybeSingle()
  if (!link) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: NO_STORE })
  const owned = await ownedListing(svc, user.id, (link as { listing_id: string }).listing_id)
  if (!owned) return NextResponse.json({ error: 'not_owner' }, { status: 403, headers: NO_STORE })
  const { data: l } = await svc.from('listings').select('address, unit, city, monthly_rent, bedrooms, bathrooms, sqft, property_type, available_date, is_test').eq('id', owned.id).maybeSingle()
  if (!l) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: NO_STORE })
  const url = shortLink(siteUrl(), (link as { code: string }).code)
  const svg = posterSvg(l as PosterListing, url, lang, await qrPath(url))
  const channel = (link as { channel: ShareChannel }).channel
  return new NextResponse(svg, {
    headers: { ...NO_STORE, 'Content-Type': 'image/svg+xml; charset=utf-8', 'Content-Disposition': `attachment; filename="stayloop-poster-${channel}-${code}.svg"` },
  })
}
