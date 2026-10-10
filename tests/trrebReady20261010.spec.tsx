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
    // contact card: no longer a 10.5px mono line when a brokerage is named
    expect(detailPage).toContain("listing.brokerage ? 'text-[13px] text-body-2' : 'font-mono text-[10.5px]")
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
  it('eight listing-data clauses cover personal use, bona fide interest, no copying, no AI, no scraping, ownership, audit access, no fee / no representation', () => {
    expect(terms).toContain("export const TERMS_VERSION = '2026-10-10'")
    const clauses = terms.match(/^\s+zh: '/gm) || []
    expect(clauses.length).toBe(8)
    for (const needle of ['非商业用途', '真实的租赁、购买或出售意向', '转授权', 'AI 系统', '抓取', '版权属于其来源', '核查', '不产生任何费用', '代理或代表关系']) expect(terms).toContain(needle)
    for (const needle of ['non-commercial', 'bona fide interest', 'sublicense', 'AI system', 'Scraping', 'copyright', 'verify compliance', 'no fee', 'representation']) expect(terms).toContain(needle)
    expect(termsPage).toContain('data-testid="terms-listing-data"')
    expect(termsPage).toContain('LISTING_DATA_CLAUSES.map')
    expect(termsPage).toContain('TERMS_VERSION')
    expect(termsPage).not.toContain('2026-05-09')
  })
  it('sign-up requires the checkbox and stores the accepted version with the account', () => {
    const card = read('components/home/LoginCard.tsx')
    expect(card).toContain('data-testid="signup-terms"')
    expect(card).toContain('disabled={f.loading || !f.password || !f.password2 || !f.agreeTerms}')
    expect(card).not.toContain('创建即表示你同意')
    const hook = read('lib/auth/useLoginForm.ts')
    expect(hook).toContain('data: termsAcceptanceMetadata()')
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
    const box = r.root.findByProps({ 'data-testid': 'terms-gate-checkbox' })
    act(() => { box.props.onChange({ target: { checked: true } }) })
    expect(r.root.findByProps({ 'data-testid': 'terms-gate-accept' }).props.disabled).toBe(false)
    await act(async () => { await r.root.findByProps({ 'data-testid': 'terms-gate-accept' }).props.onClick() })
    expect(updateUser).toHaveBeenCalledTimes(1)
    const arg = (updateUser.mock.calls as unknown as Array<[{ data: { terms_version: string; terms_accepted_at: string } }]>)[0][0]
    expect(arg.data.terms_version).toBe(TERMS_VERSION)
    expect(insert).toHaveBeenCalledTimes(1)
    expect(r.toJSON()).toBeNull()
  })
})
