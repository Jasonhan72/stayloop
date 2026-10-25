// Share links for the manual channels (分享包 v2, 2026-10-26).
//   GET  ?listing_id=            → the caller's links (all owned listings when no id), with click counts
//   POST { listing_id }          → makes sure every channel has a code for that listing, returns them
// Service role after the owner check; the API roles hold SELECT only. Codes are random
// (8 chars, no look-alikes) — they appear on posters and are read by people.
import { NextResponse } from 'next/server'
import { underHourlyLimit } from '@/lib/rateLimit'
import { randomShareCode, SHARE_CHANNELS, shortLink, type ShareChannel } from '@/lib/listings/sharePack'
import { adminClient, callerOf, NO_STORE, ownedListing, ownerIdsOf, siteUrl, UUID_RE } from '@/lib/listings/serverAuth'

export type ShareLinkItem = { listing_id: string; channel: ShareChannel; code: string; url: string; clicks: number; last_clicked_at: string | null }
const COLS = 'listing_id, channel, code, clicks, last_clicked_at'
type Row = { listing_id: string; channel: ShareChannel; code: string; clicks: number; last_clicked_at: string | null }

const toItem = (site: string, r: Row): ShareLinkItem => ({ ...r, url: shortLink(site, r.code) })

export async function GET(req: Request) {
  const user = await callerOf(req)
  if (!user) return NextResponse.json({ error: 'sign_in_required' }, { status: 401, headers: NO_STORE })
  const svc = adminClient()
  const listingId = new URL(req.url).searchParams.get('listing_id')
  let ids: string[]
  if (listingId) {
    const l = await ownedListing(svc, user.id, listingId)
    if (!l) return NextResponse.json({ error: 'not_owner' }, { status: 403, headers: NO_STORE })
    ids = [l.id]
  } else {
    const mine = await ownerIdsOf(svc, user.id)
    const { data } = await svc.from('listings').select('id').in('landlord_id', mine).limit(500)
    ids = ((data ?? []) as { id: string }[]).map((r) => r.id)
  }
  if (!ids.length) return NextResponse.json({ items: [] }, { headers: NO_STORE })
  const { data, error } = await svc.from('listing_share_links').select(COLS).in('listing_id', ids).limit(2000)
  if (error) return NextResponse.json({ error: 'read_failed' }, { status: 502, headers: NO_STORE })
  const site = siteUrl()
  return NextResponse.json({ items: ((data ?? []) as Row[]).map((r) => toItem(site, r)) }, { headers: NO_STORE })
}

export async function POST(req: Request) {
  const user = await callerOf(req)
  if (!user) return NextResponse.json({ error: 'sign_in_required' }, { status: 401, headers: NO_STORE })
  if (!(await underHourlyLimit(`share-links:${user.id}`, 120, false))) return NextResponse.json({ error: 'rate_limited' }, { status: 429, headers: { ...NO_STORE, 'Retry-After': '3600' } })
  const body = (await req.json().catch(() => null)) as { listing_id?: unknown } | null
  const listingId = typeof body?.listing_id === 'string' ? body.listing_id : ''
  if (!UUID_RE.test(listingId)) return NextResponse.json({ error: 'invalid_input' }, { status: 400, headers: NO_STORE })
  const svc = adminClient()
  const l = await ownedListing(svc, user.id, listingId)
  if (!l) return NextResponse.json({ error: 'not_owner' }, { status: 403, headers: NO_STORE })

  const { data: existing } = await svc.from('listing_share_links').select(COLS).eq('listing_id', l.id)
  const have = new Set(((existing ?? []) as Row[]).map((r) => r.channel))
  const missing = SHARE_CHANNELS.map((c) => c.key).filter((c) => !have.has(c))
  for (const channel of missing) {
    // A code collision is a 1-in-10^12 event; three tries is plenty.
    for (let attempt = 0; attempt < 3; attempt++) {
      const { error } = await svc.from('listing_share_links').insert({ listing_id: l.id, channel, code: randomShareCode(), created_by: user.id })
      if (!error) break
      if (error.code !== '23505') return NextResponse.json({ error: 'write_failed' }, { status: 502, headers: NO_STORE })
      // 23505 on (listing_id, channel) = someone else just made it; on code = retry.
      const { data: again } = await svc.from('listing_share_links').select('id').eq('listing_id', l.id).eq('channel', channel).maybeSingle()
      if (again) break
    }
  }
  const { data, error } = await svc.from('listing_share_links').select(COLS).eq('listing_id', l.id)
  if (error) return NextResponse.json({ error: 'read_failed' }, { status: 502, headers: NO_STORE })
  const site = siteUrl()
  return NextResponse.json({ items: ((data ?? []) as Row[]).map((r) => toItem(site, r)) }, { headers: NO_STORE })
}
