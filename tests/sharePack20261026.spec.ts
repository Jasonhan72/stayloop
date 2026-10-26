// 分享包 v2 + 回流闭环 (2026-10-26 · report review batch 1 items 2 / 3,
// design/ai-rebuild-report-review-2026-10-25.md). Rules this file keeps:
//   • every piece of copy is built from the listing's own fields and ends with
//     that channel's own link; the classifieds' titles respect their limits
//   • the short-link redirect counts through one locked function and never
//     stores the visitor; routes are owner-checked, service-role, no-store
//   • manual channels only: MLS® never goes through the paste-back route
//   • the take-down card is executable (it closes the rows) and the sweep
//     raises one per off-market listing; nothing is posted by script anywhere
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { buildSharePack, SHARE_CHANNELS, shortTitle } from '@/lib/listings/sharePack'
import { isPasteBackChannel, PASTE_BACK_CHANNELS, randomShareCode, SHARE_CHANNEL_KEYS, SHARE_CODE_RE, shortLink } from '@/lib/listings/shareChannels'
import { buildSharePost, type ShareFacts } from '@/lib/listings/shareCopy'
import { posterSvg } from '@/lib/listings/poster'
import { EXECUTABLE_ACTION_TYPES } from '@/lib/agent/approval-engine'

const read = (p: string) => readFileSync(p, 'utf8')
const code = (p: string) => read(p).split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')

const facts: ShareFacts = {
  address: '88 Harbour St', unit: '1201', city: 'Toronto', monthly_rent: 2650, bedrooms: 1, bathrooms: 1, sqft: 580, property_type: 'condo',
  title: '湖景一居 / Lakeview 1BR', description: '南向湖景，步行到联合车站。\n\nSouth-facing lake view, walk to Union Station.',
  available_date: '2026-12-01', amenities: ['in_unit_laundry', 'gym'], utilities_included: ['water'], pet_policy: null, is_test: false,
}
const links = Object.fromEntries(SHARE_CHANNEL_KEYS.map((c) => [c, `https://www.stayloop.ai/go/${c.slice(0, 2)}abcd12`]))

describe('share channels + codes', () => {
  it('eight channels, six of them paste-back; MLS is never one', () => {
    expect(SHARE_CHANNELS.map((c) => c.key)).toEqual(SHARE_CHANNEL_KEYS)
    expect([...PASTE_BACK_CHANNELS]).toEqual(['wechat', 'xiaohongshu', 'facebook_group', 'facebook_marketplace', 'kijiji', 'instagram'])
    expect(isPasteBackChannel('mls')).toBe(false)
    expect(isPasteBackChannel('poster')).toBe(false)
    expect(isPasteBackChannel('kijiji')).toBe(true)
  })
  it('codes are 8 chars without look-alikes and the short link is /go/<code>', () => {
    for (let i = 0; i < 50; i++) {
      const c = randomShareCode()
      expect(c).toMatch(SHARE_CODE_RE)
      expect(c).not.toMatch(/[01ol]/)
    }
    expect(shortLink('https://www.stayloop.ai/', 'abcd2345')).toBe('https://www.stayloop.ai/go/abcd2345')
  })
})

describe('buildSharePack', () => {
  it('one piece per channel, each ending with its own link and nothing invented', () => {
    for (const lang of ['zh', 'en'] as const) {
      const pack = buildSharePack(facts, lang, links, 'https://www.stayloop.ai/listings/x')
      expect(pack.map((p) => p.channel)).toEqual(SHARE_CHANNEL_KEYS)
      for (const p of pack) {
        expect(p.body, `${lang} ${p.channel}`).toContain(links[p.channel])
        expect(p.link).toBe(links[p.channel])
        expect(p.body).not.toMatch(/泳池|pool|parking|车位/i) // not in the facts
      }
    }
  })
  it('falls back to the listing url when a channel has no code yet', () => {
    const pack = buildSharePack(facts, 'zh', {}, 'https://www.stayloop.ai/listings/x')
    for (const p of pack) expect(p.body).toContain('https://www.stayloop.ai/listings/x')
  })
  it('titles fit the classifieds: 小红书 ≤ 20, Kijiji ≤ 64, Marketplace ≤ 100', () => {
    const pack = buildSharePack(facts, 'zh', links, 'https://s/l')
    const len = (s: string) => Array.from(s).length
    expect(len(pack.find((p) => p.channel === 'xiaohongshu')!.title)).toBeLessThanOrEqual(20)
    expect(len(pack.find((p) => p.channel === 'kijiji')!.title)).toBeLessThanOrEqual(64)
    expect(len(pack.find((p) => p.channel === 'facebook_marketplace')!.title)).toBeLessThanOrEqual(100)
    expect(len(shortTitle({ ...facts, city: 'A very long neighbourhood name that goes on and on' }, 'en', 64))).toBeLessThanOrEqual(64)
  })
  it('the WeChat / group / Marketplace bodies are the v1 post (same facts, same order), with their links', () => {
    const pack = buildSharePack(facts, 'zh', links, 'https://s/l')
    expect(pack.find((p) => p.channel === 'wechat')!.body).toBe(buildSharePost(facts, 'zh', links.wechat))
    expect(pack.find((p) => p.channel === 'facebook_group')!.body).toBe(buildSharePost(facts, 'zh', links.facebook_group))
  })
  it('a test listing is marked in every piece; hashtags only on 小红书 / Instagram', () => {
    const pack = buildSharePack({ ...facts, is_test: true }, 'zh', links, 'https://s/l')
    for (const p of pack) if (p.channel !== 'poster') expect(p.body, p.channel).toContain('测试房源')
    expect(pack.find((p) => p.channel === 'xiaohongshu')!.body).toContain('#多伦多租房')
    expect(pack.find((p) => p.channel === 'instagram')!.body).toContain('#TorontoRentals'.replace('TorontoRentals', 'Toronto租房'))
    expect(pack.find((p) => p.channel === 'kijiji')!.body).not.toContain('#')
    expect(pack.find((p) => p.channel === 'reply')!.body).not.toContain('#')
  })
  it('the reply template says the conversation moves into Stayloop and carries the address', () => {
    const r = buildSharePack(facts, 'zh', links, 'https://s/l').find((p) => p.channel === 'reply')!
    expect(r.body).toContain('88 Harbour St')
    expect(r.body).toContain(links.reply)
    expect(r.hint.zh).toContain('记录')
  })
  it('plain copy, no scripted posting promised', () => {
    const all = JSON.stringify(SHARE_CHANNELS) + JSON.stringify(buildSharePack(facts, 'zh', links, 'https://s/l'))
    for (const bad of ['背调', '法律协助', '助手', '实时挂牌', '一键发布到']) expect(all).not.toContain(bad)
  })
})

describe('poster', () => {
  it('draws only public listing facts and the short link; escapes text', () => {
    const svg = posterSvg({ address: '1 <King> St', unit: '5', city: 'Toronto', monthly_rent: 2100, bedrooms: 2, bathrooms: 1, sqft: null, property_type: 'condo', available_date: '2026-11-01', is_test: true }, 'https://www.stayloop.ai/go/abcd2345', 'zh', { d: 'M0 0h1', n: 25 })
    expect(svg).toContain('1 &lt;King&gt; St')
    expect(svg).toContain('$2,100')
    expect(svg).toContain('2 卧 · 1 卫 · 公寓')
    expect(svg).toContain('测试房源')
    expect(svg).toContain('https://www.stayloop.ai/go/abcd2345')
    expect(svg).toContain('scale(17.6)')
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="1080" height="1350"/)
  })
})

describe('routes + data', () => {
  it('migration: links table is SELECT-only for the API roles, the bump function is service-role only, Marketplace joins the channels', () => {
    const m = read('supabase/migrations/20261026_listing_share_links.sql')
    expect(m).toContain('revoke all on public.listing_share_links from public, anon, authenticated, service_role')
    expect(m).toContain('grant select on public.listing_share_links to authenticated')
    expect(m).toContain('revoke execute on function public.bump_share_link(text) from public, anon, authenticated')
    expect(m).toContain('grant execute on function public.bump_share_link(text) to service_role')
    expect(m).toContain("'facebook_marketplace'")
    expect(m).toMatch(/unique \(listing_id, channel\)/)
  })
  it('/go/<code>: one rpc, redirect with ?src=, no-store, fails open, never stores the visitor', () => {
    const s = code('app/go/[code]/route.ts')
    expect(s).toContain("rpc('bump_share_link'")
    // review 2026-10-27: link previews and HEAD are redirected without counting
    expect(s).toContain('export async function HEAD(')
    expect(s).toContain("isPreviewFetch(req.method, req.headers.get('user-agent'))")
    expect(s).not.toMatch(/export (const|function) (?!GET|HEAD|POST|OPTIONS)/)
    expect(s).toContain('resolveNoCount(code)')
    expect(s).toContain('?src=')
    expect(s).toContain("'Cache-Control': 'no-store'")
    expect(s).toContain('underHourlyLimit(`go:${ip}`, 600, true)')
    expect(s).not.toMatch(/\.insert\(|referer/i) // the user-agent is read to skip previews, never stored
  })
  it('share-links / syndications / poster: signed-in owner only, service role after the check', () => {
    for (const p of ['app/api/listings/share-links/route.ts', 'app/api/listings/syndications/route.ts', 'app/api/listings/poster/route.ts']) {
      const s = code(p)
      expect(s, p).toContain('callerOf(req)')
      expect(s, p).toContain('ownedListing(')
      expect(s, p).toContain('NO_STORE')
    }
    const syn = code('app/api/listings/syndications/route.ts')
    expect(syn).toContain('isPasteBackChannel(body?.channel)')
    expect(syn).toContain('isPublicListingUrl(url)')
    expect(syn).toContain("status: 'removed', removed_at")
    expect(code('app/api/listings/share-links/route.ts')).toContain('randomShareCode()')
    expect(code('app/api/listings/poster/route.ts')).toContain('posterSvg(')
  })
  it('channel constants live in an import-free module (route handlers must not import client code)', () => {
    const s = read('lib/listings/shareChannels.ts')
    expect(s).not.toMatch(/^import /m)
    expect(s).not.toContain("'use client'")
  })
})

describe('short-link preview detection (review 2026-10-27)', () => {
  it('HEAD and known preview fetchers do not count; a phone browser does', async () => {
    const { isPreviewFetch } = await import('@/lib/listings/previewFetch')
    expect(isPreviewFetch('HEAD', 'Mozilla/5.0 (iPhone)')).toBe(true)
    expect(isPreviewFetch('GET', 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)')).toBe(true)
    expect(isPreviewFetch('GET', 'WhatsApp/2.23.20.0 A')).toBe(true)
    expect(isPreviewFetch('GET', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 MicroMessenger/8.0.44')).toBe(false)
    expect(isPreviewFetch('GET', 'Mozilla/5.0 (Linux; Android 14) Chrome/120 Mobile Safari/537.36')).toBe(false)
    expect(isPreviewFetch('GET', null)).toBe(false)
  })
})

describe('take-down loop', () => {
  it('takedown_reminder is executable, acknowledged-only in chat copy, and closes the rows', () => {
    expect(EXECUTABLE_ACTION_TYPES).toContain('takedown_reminder')
    expect(code('lib/agent/chatCopy.ts')).toContain("'takedown_reminder'")
    const ex = code('app/api/agent/execute/route.ts')
    expect(ex).toContain("case 'takedown_reminder':")
    expect(ex).toContain('async function executeTakedownReminder(')
    expect(ex).toContain("update({ status: 'removed', removed_at")
    expect(ex).toContain("expireCard(admin, action.id, { reason: 'nothing_posted'")
    expect(read('lib/agent/ideas.ts')).toContain('executed_takedown_reminder')
  })
  it('the daily sweep raises one card per off-market listing with hand-posted ads, deduped while pending', () => {
    const sw = code('lib/listings/takedownSweep.ts')
    expect(sw).toContain('export async function runTakedownSweep(')
    expect(sw).toContain("eq('action_type', TAKEDOWN_ACTION_TYPE).eq('status', 'pending')")
    expect(sw).toContain('if (pendingFor.has(l.id)) continue')
    expect(sw).toContain('attachMainThread(admin, inserts)')
    expect(sw).toContain("l.status === 'archived' || l.status === 'rented'")
    // review 2026-10-27: a profile with no auth id is skipped, never carded under its profile id
    expect(sw).toContain('authIds.has(l.landlord_id) ? l.landlord_id : null')
    expect(sw).toContain('if (!userId) { unresolved++; continue }')
    const p = code('app/api/agent/proactive/route.ts')
    expect(p).toContain('const takedown = await runTakedownSweep(admin)')
    expect(p).toContain('{ ...summary, takedown }')
  })
  it('the dashboard mounts the notice under both listing views and passes the listing id to the panel', () => {
    const d = code('app/dashboard/page.tsx')
    expect(d.match(/<TakedownNotice /g)?.length).toBe(2)
    expect(d).toContain('listingId={sharing.id}')
    expect(d.match(/data-testid="share-post-open"/g)?.length).toBe(2)
  })
  it('the panel: a tab per channel, paste-back only on paste-back channels, no native dialogs', () => {
    const s = code('components/listings/SharePostPanel.tsx')
    expect(s).toContain('data-testid={`share-channel-${c.key}`}')
    expect(s).toContain('data-testid="share-post-text"')
    expect(s).toContain('isPasteBackChannel(channel) && (')
    expect(s).toContain("fetch('/api/listings/share-links', { method: 'POST'")
    expect(s).not.toMatch(/window\.confirm|window\.alert|\balert\(|\bconfirm\(/)
    expect(code('components/listings/TakedownNotice.tsx')).toContain('if (active || !posted.length) return null')
    expect(code('components/listings/TakedownNotice.tsx')).not.toMatch(/useEffect|fetch\(`\/api\/listings\/syndications\?/)
    expect(code('app/dashboard/page.tsx')).toContain("fetch('/api/listings/syndications', { headers: h })")
  })
})
