// The manual channels' paste-back (回流闭环, 2026-10-26; design/ai-rebuild-report-
// review-2026-10-25.md 第一批 3). The landlord posts on Kijiji / Marketplace / a
// group / 小红书 / Instagram / WeChat by hand (no API, and the terms of those
// sites forbid scripted posting), then records it here so Stayloop knows where
// the unit is advertised — and can list those places when the unit goes off
// market (TakedownNotice in the dashboard; the takedown_reminder card).
//
//   GET  ?listing_id=                                   → the caller's manual-channel rows
//   POST { listing_id, channel, action: 'posted', external_url?, note? }  record a post
//   POST { listing_id, channel, action: 'removed' }                        record the take-down
//
// MLS® stays on /api/listings/mls-handoff (it is a hand-off to an agent, not a post).
import { NextResponse } from 'next/server'
import { underHourlyLimit } from '@/lib/rateLimit'
import { stripNul } from '@/lib/screening/jsonSafe'
import { isPublicListingUrl, type SyndicationRow } from '@/lib/listings/syndication'
import { isPasteBackChannel, PASTE_BACK_CHANNELS } from '@/lib/listings/sharePack'
import { adminClient, callerOf, NO_STORE, ownedListing, ownerIdsOf, UUID_RE } from '@/lib/listings/serverAuth'

const ROW_COLS = 'id, listing_id, channel, status, external_id, external_url, agent_auth_id, client_id, thread_id, requested_by, note, posted_at, removed_at, created_at, updated_at'
const NOTE_MAX = 300

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
  const { data, error } = await svc.from('listing_syndications').select(ROW_COLS).in('listing_id', ids).in('channel', [...PASTE_BACK_CHANNELS]).order('updated_at', { ascending: false }).limit(500)
  if (error) return NextResponse.json({ error: 'read_failed' }, { status: 502, headers: NO_STORE })
  return NextResponse.json({ items: (data ?? []) as SyndicationRow[] }, { headers: NO_STORE })
}

export async function POST(req: Request) {
  const user = await callerOf(req)
  if (!user) return NextResponse.json({ error: 'sign_in_required' }, { status: 401, headers: NO_STORE })
  if (!(await underHourlyLimit(`syndications:${user.id}`, 120, false))) return NextResponse.json({ error: 'rate_limited' }, { status: 429, headers: { ...NO_STORE, 'Retry-After': '3600' } })
  const body = (await req.json().catch(() => null)) as { listing_id?: unknown; channel?: unknown; action?: unknown; external_url?: unknown; note?: unknown } | null
  const listingId = typeof body?.listing_id === 'string' ? body.listing_id : ''
  const action = body?.action === 'posted' || body?.action === 'removed' ? body.action : null
  if (!UUID_RE.test(listingId) || !action || !isPasteBackChannel(body?.channel)) return NextResponse.json({ error: 'invalid_input' }, { status: 400, headers: NO_STORE })
  const channel = body!.channel
  const svc = adminClient()
  const l = await ownedListing(svc, user.id, listingId)
  if (!l) return NextResponse.json({ error: 'not_owner' }, { status: 403, headers: NO_STORE })

  const { data: liveRows } = await svc.from('listing_syndications').select(ROW_COLS).eq('listing_id', l.id).eq('channel', channel).in('status', ['requested', 'posted']).limit(2)
  const live = ((liveRows ?? []) as SyndicationRow[])[0] ?? null
  const now = new Date().toISOString()

  if (action === 'removed') {
    if (!live) return NextResponse.json({ error: 'nothing_posted' }, { status: 409, headers: NO_STORE })
    const { data, error } = await svc.from('listing_syndications').update({ status: 'removed', removed_at: now }).eq('id', live.id).select(ROW_COLS).maybeSingle()
    if (error) return NextResponse.json({ error: 'write_failed' }, { status: 502, headers: NO_STORE })
    return NextResponse.json({ item: data }, { headers: NO_STORE })
  }

  const url = body?.external_url == null || body.external_url === '' ? null : body.external_url
  if (url !== null && !isPublicListingUrl(url)) return NextResponse.json({ error: 'invalid_url' }, { status: 400, headers: NO_STORE })
  const note = typeof body?.note === 'string' ? stripNul(body.note).trim().slice(0, NOTE_MAX) || null : null
  if (live) {
    const { data, error } = await svc.from('listing_syndications').update({ status: 'posted', external_url: url, note, posted_at: now, removed_at: null }).eq('id', live.id).select(ROW_COLS).maybeSingle()
    if (error) return NextResponse.json({ error: 'write_failed' }, { status: 502, headers: NO_STORE })
    return NextResponse.json({ item: data }, { headers: NO_STORE })
  }
  const { data, error } = await svc.from('listing_syndications')
    .insert({ listing_id: l.id, channel, status: 'posted', external_url: url, note, requested_by: user.id, posted_at: now })
    .select(ROW_COLS).maybeSingle()
  if (error) return NextResponse.json({ error: 'write_failed' }, { status: 502, headers: NO_STORE })
  return NextResponse.json({ item: data }, { headers: NO_STORE })
}
