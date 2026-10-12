// 2026-10-10 · TRREB / PropTx readiness (MLS Rules Art. 8): the ten items the user asked to fix
// before the data-agreement email. Each assertion names the rule it serves.
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'

const read = (p: string) => readFileSync(p, 'utf8')
const listPage = read('app/listings/page.tsx')
const detailPage = read('app/listings/[slug]/page.tsx')
const terms = read('lib/legal/terms.ts')
const termsPage = read('app/terms/page.tsx')
const privacy = read('app/privacy/page.tsx')
const migration = read('supabase/migrations/20261010_listings_anon_readonly.sql')

describe('8.26 listing brokerage shown prominently', () => {
  it('browse cards and the detail title carry the listing brokerage at listing-fact size', () => {
    expect(listPage).toContain("has_den,source,verification_status,brokerage')")
    expect(listPage).toMatch(/data-testid="card-brokerage"[\s\S]{0,400}l\.brokerage \|\| 'Realtor\.ca'/)
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
    expect(notice).toMatch(/MLS® and REALTOR® are trademarks of The Canadian Real Estate Association/)
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
    expect(listPage).toMatch(/data-testid=\{`listings-group-\$\{g\.key\}`\}/)
    expect(listPage).toContain("if (sourceFilter !== 'all') out = out.filter((l) => sourceOf(l) === sourceFilter)")
  })
})

describe('8.27 at most 100 listings per inquiry', () => {
  it('the browse page paginates at 100 and shows a pager', () => {
    expect(listPage).toContain('const PAGE_SIZE = 100')
    expect(listPage).toMatch(/shown\.slice\(safePage \* PAGE_SIZE, safePage \* PAGE_SIZE \+ PAGE_SIZE\)/)
    expect(listPage).toContain('data-testid="listings-pager"')
  })
})

describe('8.13 anti-scraping: anon is read-only on listings', () => {
  it('the migration revokes every write privilege from anon and keeps select', () => {
    expect(migration).toMatch(/revoke insert, update, delete, truncate, references, trigger on public\.listings from anon;/)
    expect(migration).not.toMatch(/revoke select/)
  })
})

describe('8.09–8.11 terms of use', () => {
  it('nine listing-data clauses: 8.09(a) customer relationship, personal use, bona fide interest, no copying, no AI, no scraping, ownership, audit access, no fee / no representation agreement', () => {
    expect(terms).toContain("export const TERMS_VERSION = '2026-10-10'")
    const clauses = terms.match(/^\s+zh: '/gm) || []
    expect(clauses.length).toBe(9)
    for (const needle of ['经纪-消费者（客户）关系', '这不是代表协议', '非商业用途', '真实的租赁、购买或出售意向', '转授权', 'AI 系统', '抓取', '版权属于其来源', '核查', '不产生任何费用', '代表协议']) expect(terms).toContain(needle)
    for (const needle of ['broker-consumer (customer) relationship', 'non-commercial', 'bona fide interest', 'sublicense', 'AI system', 'Scraping', 'copyright', 'verify compliance', 'no fee', 'representation']) expect(terms).toContain(needle)
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

describe('8.12 sponsoring member slot · 8.13 view audit trail', () => {
  it('the detail page has an env-driven sponsor card and logs a listing_viewed audit row for signed-in viewers', () => {
    expect(detailPage).toContain('data-testid="listing-sponsor-member"')
    expect(read('lib/listings/dataNotice.ts')).toContain('NEXT_PUBLIC_MLS_SPONSOR_NAME')
    expect(detailPage).toContain("action: 'listing_viewed'")
    expect(detailPage).toMatch(/if \(auth\.loading \|\| !auth\.user \|\| !listing\?\.id \|\| viewedRef\.current === listing\.id\) return/)
    expect(read('lib/agent/ideas.ts')).toContain('listing_viewed:')
  })
})

// ── Consent gate behaviour (react-test-renderer) ───────────────────────────────
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

const textOf = (n: TestRenderer.ReactTestInstance | TestRenderer.ReactTestRenderer): string => {
  const root = 'root' in n ? n.root : n
  const walk = (x: TestRenderer.ReactTestInstance | string): string => typeof x === 'string' ? x : x.children.map(walk).join('')
  return walk(root)
}

describe('TermsConsentGate', () => {
  afterEach(() => { updateUser.mockClear(); insert.mockClear(); path = '/listings' })
  it('renders nothing for anonymous visitors and for accounts on the current version', () => {
    authState = { loading: false, user: null }
    let r!: TestRenderer.ReactTestRenderer
    act(() => { r = TestRenderer.create(<TermsConsentGate />) })
    expect(r.toJSON()).toBeNull()
    authState = { loading: false, user: { id: 'u1', user_metadata: { terms_version: TERMS_VERSION } } }
    act(() => { r = TestRenderer.create(<TermsConsentGate />) })
    expect(r.toJSON()).toBeNull()
  })
  it('blocks an account without the current version, stays hidden on /terms, and accepts only after the checkbox', async () => {
    authState = { loading: false, user: { id: 'u1', user_metadata: {} } }
    path = '/terms'
    let r!: TestRenderer.ReactTestRenderer
    act(() => { r = TestRenderer.create(<TermsConsentGate />) })
    expect(r.toJSON()).toBeNull()
    path = '/listings'
    act(() => { r = TestRenderer.create(<TermsConsentGate />) })
    expect(textOf(r)).toContain('房源信息的使用规则')
    const accept = r.root.findByProps({ 'data-testid': 'terms-gate-accept' })
    expect(accept.props.disabled).toBe(true)
    // 8.05(b): an account without a name on record is asked for one here
    const nameInput = r.root.findByProps({ 'data-testid': 'terms-gate-name' })
    act(() => { nameInput.props.onChange({ target: { value: 'Mia Chen' } }) })
    const box = r.root.findByProps({ 'data-testid': 'terms-gate-checkbox' })
    act(() => { box.props.onChange({ target: { checked: true } }) })
    expect(r.root.findByProps({ 'data-testid': 'terms-gate-accept' }).props.disabled).toBe(false)
    await act(async () => { await r.root.findByProps({ 'data-testid': 'terms-gate-accept' }).props.onClick() })
    expect(updateUser).toHaveBeenCalledTimes(1)
    const arg = (updateUser.mock.calls as unknown as Array<[{ data: { terms_version: string; terms_accepted_at: string } }]>)[0][0]
    expect(arg.data.terms_version).toBe(TERMS_VERSION)
    expect((arg.data as unknown as { full_name: string }).full_name).toBe('Mia Chen')
    expect(insert).toHaveBeenCalledTimes(1)
    expect(r.toJSON()).toBeNull()
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
