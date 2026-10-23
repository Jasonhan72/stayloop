// V0.8 第二项 · 第 3 / 4 步 (2026-10-22): MLS® hand-off between a landlord and a Stayloop-verified
// agent, and the manual share line (copy + photos). Rules this file keeps:
//   • MLS is a HAND-OFF: the agent types the number and link in; nothing reads MLS (PropTx 2026-10-13).
//   • All writes are service role behind POST /api/listings/mls-handoff; API roles get SELECT only.
//   • Each request mails the agent → rate limit fails CLOSED; the agent must have a live registration.
//   • Two-step confirmations in page, no window.confirm; the public page shows the posted row via the
//     listing route, not a grant.
//   • The share post is built only from the listing's own fields and always ends with the listing link.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  allowedActions, isMlsNumber, isPublicListingUrl, latestMls, liveMls, STATUS_LABEL, type SyndicationRow,
} from '@/lib/listings/syndication'
import { buildSharePost, photoFileName } from '@/lib/listings/shareCopy'

const read = (p: string) => readFileSync(p, 'utf8')
const code = (p: string) => read(p).split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')

const row = (over: Partial<SyndicationRow>): SyndicationRow => ({
  id: 'r1', listing_id: 'L1', channel: 'mls', status: 'requested', external_id: null, external_url: null, agent_auth_id: 'A', client_id: null, thread_id: null,
  requested_by: 'U', note: null, posted_at: null, removed_at: null, created_at: '2026-10-22T00:00:00Z', updated_at: '2026-10-22T00:00:00Z', ...over,
})

describe('syndication lib', () => {
  it('MLS® number: 3–40 letters / digits / dashes', () => {
    expect(isMlsNumber('C1234567')).toBe(true)
    expect(isMlsNumber('W-12')).toBe(true)
    expect(isMlsNumber('ab')).toBe(false)
    expect(isMlsNumber('C 123')).toBe(false)
    expect(isMlsNumber('x'.repeat(41))).toBe(false)
    expect(isMlsNumber(123)).toBe(false)
  })
  it('public link: https only, no credentials, ≤500', () => {
    expect(isPublicListingUrl('https://www.realtor.ca/real-estate/123/x')).toBe(true)
    expect(isPublicListingUrl('http://example.com/x')).toBe(false)
    expect(isPublicListingUrl('https://user:pw@example.com/x')).toBe(false)
    expect(isPublicListingUrl('javascript:alert(1)')).toBe(false)
    expect(isPublicListingUrl('https://e.com/' + 'a'.repeat(500))).toBe(false)
  })
  it('transitions: agent posts or declines a request; either side removes; nothing after a terminal state', () => {
    expect(allowedActions(row({ status: 'requested' }), 'agent')).toEqual(['posted', 'declined'])
    expect(allowedActions(row({ status: 'requested' }), 'landlord')).toEqual(['removed'])
    expect(allowedActions(row({ status: 'posted' }), 'agent')).toEqual(['removed'])
    expect(allowedActions(row({ status: 'posted' }), 'landlord')).toEqual(['removed'])
    for (const s of ['declined', 'removed', 'failed'] as const) {
      expect(allowedActions(row({ status: s }), 'agent')).toEqual([])
      expect(allowedActions(row({ status: s }), 'landlord')).toEqual([])
    }
  })
  it('liveMls / latestMls pick the right row per listing', () => {
    const rows = [
      row({ id: 'old', status: 'declined', updated_at: '2026-10-01T00:00:00Z' }),
      row({ id: 'new', status: 'requested', updated_at: '2026-10-20T00:00:00Z' }),
      row({ id: 'other', listing_id: 'L2', status: 'posted' }),
    ]
    expect(liveMls(rows, 'L1')?.id).toBe('new')
    expect(latestMls(rows, 'L1')?.id).toBe('new')
    expect(liveMls([rows[0]], 'L1')).toBeNull()
    expect(latestMls([rows[0]], 'L1')?.id).toBe('old')
    expect(liveMls(rows, 'L3')).toBeNull()
  })
  it('every status has both labels and none says 背调 or promises MLS data', () => {
    for (const v of Object.values(STATUS_LABEL)) {
      expect(v.zh.length).toBeGreaterThan(0); expect(v.en.length).toBeGreaterThan(0)
      expect(v.zh).not.toMatch(/背调/)
    }
  })
})

describe('route: service-role writes, live registration, fail-closed limits', () => {
  const src = code('app/api/listings/mls-handoff/route.ts')
  it('every transition is checked against allowedActions and the update is status-guarded (no lost race)', () => {
    expect(src).toMatch(/allowedActions\(row, side\)\.includes\(action\)/)
    expect(src).toMatch(/\.update\(patch\)\.eq\('id', id\)\.eq\('status', row\.status\)/)
  })
  it('request path: owner check, no imports, live RECO registration, one live row, fail-closed limits', () => {
    expect(src).toMatch(/mine\.includes\(listing\.landlord_id\)/)
    expect(src).toMatch(/listing\.source === 'realtor'/)
    expect(src).toMatch(/isRegistrationLive\(agent\.status\)/)
    expect(src).toMatch(/\.in\('status', \['requested', 'posted'\]\)/)
    expect(src).toMatch(/underHourlyLimit\(`mls-handoff:u:\$\{user\.id\}`, 5, false\)/)
    expect(src).toMatch(/underHourlyLimit\(`mls-handoff:a:\$\{agentId\}`, 30, false\)/)
  })
  it('posted path validates the number and the https link; nothing fetches MLS', () => {
    expect(src).toMatch(/isMlsNumber\(externalId\)/)
    expect(src).toMatch(/isPublicListingUrl\(externalUrl\)/)
    expect(src).not.toMatch(/fetch\(/)
    expect(src).not.toMatch(/realtor\.ca|propertysearch|torontomls/i)
  })
  it('the public listing route exposes a posted row with the agent’s registered name and brokerage only', () => {
    const r = code('app/api/listings/[slug]/route.ts')
    expect(r).toMatch(/\.eq\('channel', 'mls'\)\.eq\('status', 'posted'\)/)
    expect(r).toMatch(/select\('legal_name, brokerage_name, public_profile, profile_slug'\)/)
    expect(r).toMatch(/similar, mls \}/)
  })
  it('the public-profile contact route shares the client helper (one agent_clients row per agent + email)', () => {
    const c = code('app/api/agents/[slug]/contact/route.ts')
    expect(c).toMatch(/connectAgentClient\(/)
    expect(c).not.toMatch(/ilikeExact/)
  })
})

describe('migration: SELECT only for API roles, one live row per listing + channel', () => {
  const sql = read('supabase/migrations/20261022_listing_syndications.sql')
  it('grants', () => {
    expect(sql).toMatch(/revoke all on public\.listing_syndications from public, anon, authenticated, service_role;/)
    expect(sql).toMatch(/grant select on public\.listing_syndications to authenticated;/)
    expect(sql).not.toMatch(/grant (insert|update|delete)[^;]*to authenticated/)
    expect(sql).not.toMatch(/to anon;/)
  })
  it('partial unique index on live rows; read policy names the agent, the requester, the owner and admins', () => {
    expect(sql).toMatch(/create unique index if not exists listing_syndications_live_uniq[\s\S]*where status in \('requested','posted'\)/)
    expect(sql).toMatch(/agent_auth_id = auth\.uid\(\)/)
    expect(sql).toMatch(/requested_by = auth\.uid\(\)/)
    expect(sql).toMatch(/ld\.auth_id = auth\.uid\(\)/)
    expect(sql).toMatch(/public\.is_stayloop_admin\(\)/)
  })
})

describe('UI: two-step confirmations, pick mode, placement', () => {
  it('no native confirm / alert in the new components', () => {
    for (const p of ['components/listings/MlsHandoff.tsx', 'components/agent/MlsHandoffBoard.tsx', 'components/listings/SharePostPanel.tsx']) {
      const s = code(p)
      expect(s, p).not.toMatch(/window\.confirm|window\.alert|\balert\(|\bconfirm\(/)
    }
    expect(code('components/listings/MlsHandoff.tsx')).toMatch(/data-testid="mls-handoff-confirm"/)
    expect(code('components/agent/MlsHandoffBoard.tsx')).toMatch(/data-testid="mls-decline-confirm"/)
    expect(code('components/agent/MlsHandoffBoard.tsx')).toMatch(/data-testid="mls-remove-confirm"/)
  })
  it('AgentPicker pick mode replaces email / phone with the one action', () => {
    const s = code('components/AgentPicker.tsx')
    expect(s).toMatch(/\{!pick && a\.business_email &&/)
    expect(s).toMatch(/\{!pick && a\.business_phone &&/)
    expect(s).toMatch(/data-testid="agent-pick"/)
  })
  it('mounted where it belongs: dashboard (both views), listing owner box, agent clients page', () => {
    const d = code('app/dashboard/page.tsx')
    expect(d.match(/<MlsHandoff /g)?.length).toBe(2)
    expect(d.match(/data-testid="share-post-open"/g)?.length).toBe(2)
    expect(d).toMatch(/<SharePostPanel/)
    const l = code('app/listings/[slug]/page.tsx')
    expect(l).toMatch(/data-testid="listing-mls-posted"/)
    expect(l).toMatch(/<MlsHandoff zh=\{zh\}/)
    // Gated workspace pages render only liveSlot until the agent opts into the sample — the board must be in both.
    expect(code('app/agent/clients/page.tsx').match(/<MlsHandoffBoard zh=\{zh\} \/>/g)?.length).toBe(2)
  })
  it('the agent’s 5-tab rule is untouched (no new tab for the hand-off board)', () => {
    expect(code('app/agent/clients/page.tsx')).not.toMatch(/href="\/agent\/mls/)
  })
})

describe('share post (manual line)', () => {
  const facts = { address: '28 Avondale Ave', unit: '1204', city: 'Toronto', monthly_rent: 2450, bedrooms: 1, bathrooms: 1, sqft: 620, property_type: 'condo', title: '北约克一卧公寓', description: '采光好，近地铁。\n\nBright one-bedroom near the subway.', amenities: ['gym', 'parking'], utilities_included: ['water'], available_date: '2026-12-01' }
  it('uses only the listing’s own fields and ends with the listing link, in the asked language', () => {
    const zh = buildSharePost(facts, 'zh', 'https://www.stayloop.ai/listings/x')
    expect(zh).toMatch(/^北约克一卧公寓/)
    expect(zh).toMatch(/租金 \$2,450\/月/)
    expect(zh).toMatch(/1 卧 · 1 卫 · 620 sqft · 公寓/)
    expect(zh).toMatch(/采光好，近地铁。/)
    expect(zh).not.toMatch(/Bright one-bedroom/)
    expect(zh.trim().endsWith('https://www.stayloop.ai/listings/x')).toBe(true)
    const en = buildSharePost(facts, 'en', 'https://www.stayloop.ai/listings/x')
    expect(en).toMatch(/Bright one-bedroom/)
    expect(en).not.toMatch(/采光好/)
    expect(en).toMatch(/Viewings, questions and applications: https:\/\/www\.stayloop\.ai\/listings\/x$/)
  })
  it('a test listing is labelled first; nothing is invented when fields are missing', () => {
    const t = buildSharePost({ address: '1 Main St', is_test: true }, 'zh', 'https://s/l')
    expect(t.split('\n')[0]).toBe('【测试房源 · 非实际房源】')
    expect(t).not.toMatch(/租金|卧|设施|可入住/)
  })
  it('a bilingual title keeps the asked half; amenity codes become labels', () => {
    const f = { address: '1 Main St', title: '北约克一卧公寓 · 落地窗 / Modern 1BR at Yonge', amenities: ['large_windows', 'concierge'] }
    const zh = buildSharePost(f, 'zh', 'https://s/l')
    expect(zh.split('\n')[0]).toBe('北约克一卧公寓 · 落地窗')
    expect(zh).not.toMatch(/large_windows/)
    expect(zh).toMatch(/设施：.*窗/)
    expect(buildSharePost(f, 'en', 'https://s/l').split('\n')[0]).toBe('Modern 1BR at Yonge')
  })
  it('photo file names are safe and numbered', () => {
    expect(photoFileName('28 Avondale Ave #1204', 0, 'https://x/y/photo.JPEG?x=1')).toBe('28-Avondale-Ave-1204-01.jpg')
    expect(photoFileName('', 11, 'https://x/y/photo')).toBe('listing-12.jpg')
  })
})
