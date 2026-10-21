// @vitest-environment jsdom
// 2026-10-10 · TRREB / PropTx readiness (MLS Rules Art. 8): the ten items the user asked to fix
// before the data-agreement email. Each assertion names the rule it serves.
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import React from 'react'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { only, textOf } from './helpers/dom'

const read = (p: string) => readFileSync(p, 'utf8')
const listPage = read('app/listings/page.tsx')
const search = read('app/api/listings/search/route.ts')
const detailPage = read('app/listings/[slug]/page.tsx')
const terms = read('lib/legal/terms.ts')
const termsPage = read('app/terms/page.tsx')
const privacy = read('app/privacy/page.tsx')
const migration = read('supabase/migrations/20261010_listings_anon_readonly.sql')

describe('8.26 listing brokerage shown prominently', () => {
  it('browse cards and the detail title carry the listing brokerage at listing-fact size', () => {
    // the browse page reads through /api/listings/search; the brokerage is among the card columns there
    expect(search).toContain('brokerage,display_address,display_avm')
    // 2026-10-13: Realtor.ca imports are archived; a legacy row without a brokerage falls back to the landlord-direct label
    expect(listPage).toMatch(/data-testid="card-brokerage"[\s\S]{0,400}l\.brokerage \|\| \(zh \? '房东直租' : 'Direct from landlord'\)/)
    expect(listPage).toMatch(/data-testid="card-brokerage"/)
    expect(listPage).toMatch(/fontSize: 13, color: '#3F3F46', marginTop: 4 \}\} data-testid="card-brokerage"/)
    expect(detailPage).toMatch(/data-testid="listing-brokerage-line"/)
    expect(detailPage).toMatch(/text-\[15px\] text-body-2" data-testid="listing-brokerage-line"/)
    // contact card (8.26 / 8.23): the brokerage is the heading; no「挂牌经纪」placeholder person, no blank avatar
    expect(detailPage).toContain('data-testid="listing-contact-brokerage"')
    expect(detailPage).not.toContain("zh ? '挂牌经纪' : 'Listing agent'")
  })
})

describe('8.25 / 8.07 reliability notice + copyright on every listing page', () => {
  it('both pages render ListingDataNotice and the text says deemed reliable / not guaranteed', () => {
    expect(listPage).toContain('<ListingDataNotice zh={zh} className="col-span-full mt-2 mb-16 lg:mb-0" />')
    expect(detailPage).toContain('<ListingDataNotice zh={zh} />')
    const notice = read('lib/listings/dataNotice.ts')
    expect(notice).toMatch(/被认为可靠，但不保证准确/)
    expect(notice).toMatch(/deemed reliable but is not guaranteed accurate/)
    // 2026-10-13: no MLS feed, no Realtor.ca reads — the notice names landlords as the only source and carries no MLS line
    expect(notice).toMatch(/来源：房东在 Stayloop 直接发布的房源/)
    expect(notice).toMatch(/Sources: listings published directly by landlords on Stayloop/)
    expect(notice.replace(/^\/\/.*$/gm, '')).not.toMatch(/MLS|Realtor\.ca|SPONSOR/)
    expect(read('components/listings/ListingDataNotice.tsx')).toContain('data-testid="listing-data-notice"')
  })
})

describe('8.24 content not altered; additions labelled', () => {
  it('a machine-translated description carries a visible AI-translation label and a show-original toggle', () => {
    const d = read('components/listing/ListingDescription.tsx')
    expect(d).toContain('data-testid="description-translation-note"')
    expect(d).toMatch(/'AI 翻译' : 'AI translation'/)
    expect(d).toMatch(/显示原文/)
  })
})

describe('8.28 / 8.29 sources labelled and searched separately', () => {
  it('the browse page has a source filter, groups by source, and labels each group', () => {
    expect(listPage).toContain("type SourceKey = 'all' | 'stayloop' | 'realtor'")
    expect(listPage).toContain('data-testid="listings-source-filter"')
    // 2026-10-13: the Realtor.ca option only shows while a legacy realtor row is in the result set
    expect(listPage).toContain(".filter((k) => k !== 'realtor' || sourceFilter === 'realtor' || pageItems.some((l) => sourceOf(l) === 'realtor'))")
    expect(listPage).toMatch(/data-testid=\{`listings-group-\$\{g\.key\}`\}/)
    expect(search).toContain("if (source !== 'all') q = source === 'realtor' ? q.eq('source', 'realtor') : q.neq('source', 'realtor')")
    expect(listPage).toContain("if (sourceFilter !== 'all') qs.set('source', sourceFilter)")
  })
})

describe('8.27 at most 100 listings per inquiry', () => {
  it('the browse page paginates at 100 and shows a pager', () => {
    expect(listPage).toContain('const PAGE_SIZE = 100')
    expect(listPage).toContain('data-testid="listings-pager"')
    // 2026-10-11: enforced on the server — ≤100 rows per response, pages via `page`, never the whole table
    expect(search).toContain('export const PAGE_SIZE = 100')
    expect(search).toContain('.range(from, from + PAGE_SIZE + 9)')
    expect(search).toContain('rows.slice(0, PAGE_SIZE)')
    expect(listPage).not.toContain(".from('listings')")
    expect(listPage).toContain("fetch(`/api/listings/search?${qs.toString()}`")
  })
})

describe('8.13 anti-scraping: anon is read-only on listings', () => {
  it('the migration revokes every write privilege from anon and keeps select', () => {
    expect(migration).toMatch(/revoke insert, update, delete, truncate, references, trigger on public\.listings from anon;/)
    expect(migration).not.toMatch(/revoke select/)
  })
})

describe('8.09–8.11 terms of use', () => {
  it('eight listing-data clauses (2026-10-13: no MLS feed, so no 8.09(a) customer-relationship clause): personal use, bona fide interest, no copying, no AI, no scraping, ownership, audit access, no fee / no representation agreement', () => {
    // 2026-10-16 (V1.0 stage 5): version bumped for the API usage rules (API_CLAUSES, tests/v1stage5_docsTerms.spec.tsx);
    // the listing-data block itself still has eight clauses
    expect(terms).toContain("export const TERMS_VERSION = '2026-10-16'")
    const listingBlock = terms.slice(terms.indexOf('export const LISTING_DATA_CLAUSES'), terms.indexOf('export const API_CLAUSES'))
    const clauses = listingBlock.match(/^\s+zh: '/gm) || []
    expect(clauses.length).toBe(8)
    for (const needle of ['非商业用途', '真实的租赁、购买或出售意向', '转授权', 'AI 系统', '抓取', '版权属于其来源', '发布房源的房东与挂牌方', '核查', '不产生任何费用', '代表协议']) expect(terms).toContain(needle)
    for (const needle of ['non-commercial', 'bona fide interest', 'sublicense', 'AI system', 'Scraping', 'copyright', 'landlords and listing parties who publish them', 'verify compliance', 'no fee', 'representation']) expect(terms).toContain(needle)
    for (const gone of ['经纪-消费者（客户）关系', 'TRREB 会员经纪', 'broker-consumer (customer) relationship', '房地产协会、MLS® 系统及其会员', 'MLS® systems and their members']) expect(terms).not.toContain(gone)
    // the /terms intro no longer claims an MLS licence or Realtor.ca as a source
    expect(termsPage).not.toMatch(/Realtor\.ca|MLS®/)
    expect(termsPage).toContain('data-testid="terms-listing-data"')
    expect(termsPage).toContain('LISTING_DATA_CLAUSES.map')
    expect(termsPage).toContain('TERMS_VERSION')
    expect(termsPage).not.toContain('2026-05-09')
    // 2026-10-10 user: the operator is the newly registered Stayloop Inc.
    expect(termsPage).toContain('Stayloop 由 Stayloop Inc. 运营')
    expect(termsPage).not.toContain('Stayloop Technologies')
  })
  it('sign-up requires the checkbox and stores the accepted version with the account', () => {
    const card = read('components/home/LoginCard.tsx')
    const hook = read('lib/auth/useLoginForm.ts')
    expect(card).toContain('data-testid="signup-terms"')
    expect(card).toContain('disabled={f.loading || !f.fullName.trim() || !f.password || !f.password2 || !f.agreeTerms}')
    // 8.05(b): the member must hold each consumer's name — asked at sign-up and stored with the account
    expect(card).toContain('data-testid="signup-name"')
    expect(hook).toContain("full_name: fullName.trim().slice(0, 80)")
    expect(hook).toContain('...passwordStampMetadata()')
    expect(card).not.toContain('创建即表示你同意')
    expect(hook).toContain('data: { ...termsAcceptanceMetadata()')
    expect(hook).toMatch(/if \(!agreeTerms\) \{/)
  })
  it('the consent gate is mounted site-wide and writes metadata + an audit row', () => {
    expect(read('app/layout.tsx')).toContain('<TermsConsentGate />')
    const gate = read('components/legal/TermsConsentGate.tsx')
    expect(gate).toContain('supabase.auth.updateUser({ data: meta })')
    expect(gate).toContain("action: 'terms_accepted'")
    expect(gate).toMatch(/EXEMPT = \['\/terms', '\/privacy', '\/login', '\/register', '\/auth\/'\]/)
    expect(read('lib/agent/ideas.ts')).toContain('terms_accepted:')
  })
})

describe('8.19 privacy policy names association audits', () => {
  it('privacy has the 3b section and a new date', () => {
    expect(privacy).toContain('3b · 房源数据与合规审计')
    expect(privacy).toMatch(/用于审计或法律目的/)
    expect(privacy).toMatch(/for auditing or legal purposes/)
    expect(privacy).toContain('2026-10-10')
  })
})

describe('8.12 sponsoring member slot removed (2026-10-13) · 8.13 view audit trail', () => {
  it('the detail page has no sponsor card and no env-driven sponsor config, and still logs a listing_viewed audit row for signed-in viewers', () => {
    expect(detailPage).not.toContain('listing-sponsor-member')
    expect(detailPage).not.toContain('SPONSOR_MEMBER')
    expect(read('lib/listings/dataNotice.ts')).not.toContain('NEXT_PUBLIC_MLS_SPONSOR')
    expect(read('lib/listings/dataNotice.ts')).not.toContain('MLS_ATTRIBUTION')
    expect(detailPage).toContain("action: 'listing_viewed'")
    expect(detailPage).toMatch(/if \(auth\.loading \|\| !auth\.user \|\| !listing\?\.id \|\| viewedRef\.current === listing\.id\) return/)
    expect(read('lib/agent/ideas.ts')).toContain('listing_viewed:')
  })
})

// ── Consent gate behaviour (renders in jsdom) ──────────────────────────────────
const updateUser = vi.fn(async () => ({ error: null }))
const insert = vi.fn(async () => ({ error: null }))
let authState: { loading: boolean; user: { id: string; user_metadata: Record<string, unknown> } | null } = { loading: false, user: null }
let path = '/listings'
vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => React.createElement('a', { href, ...rest }, children) }))
vi.mock('next/navigation', () => ({ usePathname: () => path }))
vi.mock('@/lib/useAuth', () => ({ useAuth: () => ({ ...authState, signOut: async () => {}, setRole: () => {} }) }))
vi.mock('@/lib/i18n', () => ({ useT: () => ({ lang: 'zh', t: (_k: string, f: string) => f }) }))
vi.mock('@/lib/supabase', () => ({ getSupabaseBrowser: () => ({ auth: { updateUser }, from: () => ({ insert }) }), supabase: { auth: {} } }))
import TermsConsentGate from '../components/legal/TermsConsentGate'
import { TERMS_VERSION } from '../lib/legal/terms'

const byTestId = <E extends HTMLElement = HTMLElement>(root: HTMLElement, id: string) => only<E>(root, `[data-testid="${id}"]`)

describe('TermsConsentGate', () => {
  afterEach(() => { cleanup(); updateUser.mockClear(); insert.mockClear(); path = '/listings' })
  it('renders nothing for anonymous visitors and for accounts on the current version', () => {
    authState = { loading: false, user: null }
    let r = render(<TermsConsentGate />)
    expect(r.container.innerHTML).toBe('')
    authState = { loading: false, user: { id: 'u1', user_metadata: { terms_version: TERMS_VERSION } } }
    r = render(<TermsConsentGate />)
    expect(r.container.innerHTML).toBe('')
  })
  it('blocks an account without the current version, stays hidden on /terms, and accepts only after the checkbox', async () => {
    authState = { loading: false, user: { id: 'u1', user_metadata: {} } }
    path = '/terms'
    let r = render(<TermsConsentGate />)
    expect(r.container.innerHTML).toBe('')
    path = '/listings'
    r = render(<TermsConsentGate />)
    expect(textOf(r.container)).toContain('房源信息的使用规则')
    const accept = byTestId<HTMLButtonElement>(r.container, 'terms-gate-accept')
    expect(accept.disabled).toBe(true)
    // 8.05(b): an account without a name on record is asked for one here
    const nameInput = byTestId(r.container, 'terms-gate-name')
    fireEvent.change(nameInput, { target: { value: 'Mia Chen' } })
    const box = byTestId(r.container, 'terms-gate-checkbox')
    fireEvent.click(box)
    expect(byTestId<HTMLButtonElement>(r.container, 'terms-gate-accept').disabled).toBe(false)
    await act(async () => { fireEvent.click(byTestId(r.container, 'terms-gate-accept')) })
    expect(updateUser).toHaveBeenCalledTimes(1)
    const arg = (updateUser.mock.calls as unknown as Array<[{ data: { terms_version: string; terms_accepted_at: string } }]>)[0][0]
    expect(arg.data.terms_version).toBe(TERMS_VERSION)
    expect((arg.data as unknown as { full_name: string }).full_name).toBe('Mia Chen')
    expect(insert).toHaveBeenCalledTimes(1)
    expect(r.container.innerHTML).toBe('')
  })
})

// ── 2026-10-11 second pass against Art. 8 ─────────────────────────────────────
describe('8.05(b) confirmation email · 8.06 password age · 8.13 search audit · 8.16 corrections channel', () => {
  it('a confirmation email route exists, is JWT-gated, sends once per version and is triggered by the gate', () => {
    const route = readFileSync('app/api/legal/terms-confirmation/route.ts', 'utf8')
    expect(route).toContain("if (meta.terms_version !== TERMS_VERSION) return NextResponse.json({ error: 'terms_not_accepted' }, { status: 409 })")
    expect(route).toContain("if (meta.terms_confirm_sent_version === TERMS_VERSION) return NextResponse.json({ ok: true, already: true })")
    expect(route).toContain('terms_confirm_sent_version: TERMS_VERSION')
    expect(route).toContain("action: 'terms_confirmation_emailed', target_type: 'account', target_id: user.id")
    const gate = readFileSync('components/legal/TermsConsentGate.tsx', 'utf8')
    expect(gate).toContain("fetch('/api/legal/terms-confirmation'")
    expect(gate).toContain('data-testid="terms-gate-name"')
    // agent_audit_events.target_id is uuid — a version string there fails silently (found in prod 2026-10-11)
    expect(gate).toContain("action: 'terms_accepted', targetType: 'account', targetId: auth.user.id")
  })
  it('passwords expire after 90 days for password accounts only; every password write stamps the clock', () => {
    const terms = readFileSync('lib/legal/terms.ts', 'utf8')
    expect(terms).toContain('export const PASSWORD_MAX_AGE_DAYS = 90')
    expect(readFileSync('app/layout.tsx', 'utf8')).toContain('<PasswordAgeGate />')
    expect(readFileSync('app/auth/reset-password/page.tsx', 'utf8')).toContain('updateUser({ password: pw, data: passwordStampMetadata() })')
    expect(readFileSync('app/admin/layout.tsx', 'utf8')).toContain('...passwordStampMetadata()')
    expect(readFileSync('components/legal/PasswordAgeGate.tsx', 'utf8')).toContain('updateUser({ password: pw, data: passwordStampMetadata() })')
  })
  it('signed-in searches are logged; the notice names a 48-hour corrections channel; privacy states the record-keeping', () => {
    expect(listPage).toContain("action: 'listings_searched'")
    expect(readFileSync('lib/listings/dataNotice.ts', 'utf8')).toMatch(/48 小时内更正或移除/)
    expect(readFileSync('components/listings/ListingDataNotice.tsx', 'utf8')).toContain('data-testid="listing-data-corrections"')
    expect(privacy).toContain('至少保留 180 天')
    expect(privacy).toContain('每 90 天需要更新一次密码')
  })
})

describe('password-age helpers', () => {
  it('no stamp → not expired (the gate sets one); 90+ days → expired; Google-only accounts never expire', async () => {
    const { passwordExpired, passwordAgeDays, usesPassword, accountName } = await import('../lib/legal/terms')
    const pwUser = (days: number | null) => ({ identities: [{ provider: 'email' }], user_metadata: days == null ? {} : { password_changed_at: new Date(Date.now() - days * 86_400_000).toISOString() } })
    expect(passwordAgeDays(pwUser(null))).toBeNull()
    expect(passwordExpired(pwUser(null))).toBe(false)
    expect(passwordExpired(pwUser(89))).toBe(false)
    expect(passwordExpired(pwUser(90))).toBe(true)
    expect(usesPassword({ identities: [{ provider: 'google' }], user_metadata: {} })).toBe(false)
    expect(passwordExpired({ identities: [{ provider: 'google' }], user_metadata: { password_changed_at: '2020-01-01T00:00:00Z' } })).toBe(false)
    expect(accountName({ user_metadata: { full_name: ' Mia Chen ' } })).toBe('Mia Chen')
    expect(accountName({ user_metadata: { full_name: 'M' } })).toBeNull()
  })
})

// ── 2026-10-11 structural items (8.05 / 8.13 / 8.14 / 8.15.02 / 8.17 / 8.27) ─────
describe('public listing reads go through rate-limited server routes', () => {
  const detailRoute = readFileSync('app/api/listings/[slug]/route.ts', 'utf8')
  const applyPage = readFileSync('app/apply/[slug]/page.tsx', 'utf8')
  const layout = readFileSync('app/listings/[slug]/layout.tsx', 'utf8')
  it('no anonymous-facing page queries the listings table from the browser; anon SELECT is revoked', () => {
    for (const src of [listPage, detailPage, applyPage]) expect(src).not.toContain(".from('listings')")
    expect(readFileSync('supabase/migrations/20261011_listings_anon_no_select.sql', 'utf8')).toContain('revoke select on public.listings from anon;')
    expect(layout).toContain('const key = process.env.SUPABASE_SERVICE_ROLE_KEY')
    expect(layout).toContain(".eq('display_internet', true)")
  })
  it('the search route budgets by IP / account, caps at 100, applies the seller directives and feed staleness', () => {
    expect(search).toContain('export const ANON_SEARCHES_PER_HOUR = 240')
    expect(search).toContain("underHourlyLimit(`lsearch:ip:${ip}`, ANON_SEARCHES_PER_HOUR, true)")
    expect(search).toContain(".eq('display_internet', true)")
    expect(search).toContain("'feed_updated_at.is.null,feed_updated_at.gt.'")
    expect(search).toContain("l.display_address ? l : { ...l, address: '', unit: null, lat: null, lng: null }")
    for (const heavy of ['description', 'price_history', 'broker_phone', 'transit']) expect(search.match(/CARD_COLUMNS = '([^']+)'/)![1]).not.toContain(heavy)
  })
  it('the detail route hides private columns, withholds the address, honours the owner preview and feed staleness', () => {
    expect(detailRoute).toContain("const PRIVATE_COLUMNS = ['broker_phone', 'realtor_check', 'management_company'] as const")
    expect(detailRoute).toContain("!owner && out.display_address === false ? withheld(out) : out")
    expect(detailRoute).toContain("const publiclyVisible = (l.verification_status === 'verified' || l.source === 'realtor') && l.display_internet !== false && !stale")
    expect(detailRoute).toContain('if (!publiclyVisible && !owner) return NextResponse.json')
    expect(detailRoute).toContain("underHourlyLimit(`ldetail:ip:${ip}`, ANON_DETAILS_PER_HOUR, true)")
  })
  it('the pages render the directives: withheld address text, no comparison tile when the seller opts out of AVM', () => {
    expect(listPage).toContain("? (zh ? '地址按卖方要求不公开' : 'Address withheld by the seller')")
    expect(detailPage).toContain('data-testid="listing-address-withheld"')
    expect(detailPage).toContain('{listing.display_avm !== false && (')
    const mig = readFileSync('supabase/migrations/20261011_listings_feed_display.sql', 'utf8')
    for (const col of ['display_internet', 'display_address', 'display_avm', 'feed_source', 'feed_updated_at']) expect(mig).toContain(col)
    expect(mig).toContain('create trigger listings_guard_feed_fields before insert or update on public.listings')
  })
})

describe('map area filter only after a user gesture (prod 2026-10-11)', () => {
  it('the map flags gestures and the page ignores its own fit', () => {
    const map = readFileSync('components/ListingsMap.tsx', 'utf8')
    expect(map).toContain("for (const ev of ['mousedown', 'wheel', 'touchstart', 'keydown']) el.addEventListener(ev, mark, { passive: true })")
    expect(map).toContain('user: userGestureRef.current')
    expect(listPage).toContain('if (!box.user) return')
  })
})
