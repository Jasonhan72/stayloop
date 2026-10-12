// Four-role audit 2026-10-12 (design/4role-audit-fix-plan-2026-10-12.md), group B:
//
// P1-5 · identity flicker. Pages are prerendered and my_hats answers after sign-in;
// until it does, activeHat falls back to 租客, so an agent account briefly saw
//「我是租客」+ the tenant rail on /settings. Now, while the hats load for a signed-in
// visitor, the header commits to no identity (a grey「我是…」, no「当前：…」chip, a
// placeholder where the identity rows go) and the neutral pages that frame themselves
// by activeHat (/settings, /leases/import) render a blank until auth AND hats are known
// — the gate /messages already had. Visitors' prerendered HTML is unchanged.
//
// P2-4 · a provider-only account said「我是租客」on neutral pages (/, /settings, /messages):
// displayIdentity only knew 服务商 from the remembered provider context. It now takes the
// hats: a provider row with no landlord hat and no live RECO registration → 服务商 on
// neutral pages; the hat pages and the agent pages keep their own answer. /login and
// /register land with the callback's landingAfterSignIn semantics (the remembered value
// is the person's choice, useAuth's in-memory role is only a hint), so a pure provider
// lands on /provider/jobs.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { displayIdentity, isProviderOnly } from '../lib/displayIdentity'
import { homeForHats, landingAfterSignIn } from '../lib/landlordHat'

const read = (p: string) => readFileSync(p, 'utf8')
const header = read('components/Header.tsx')

describe('P2-4 · displayIdentity knows a provider-only account', () => {
  const providerOnly = { landlord: false, agent: null, provider: 'verified' }
  it('isProviderOnly: a provider row and nothing else that frames the account', () => {
    expect(isProviderOnly(providerOnly)).toBe(true)
    expect(isProviderOnly({ landlord: false, agent: 'pending', provider: 'pending' })).toBe(true) // an unverified RECO registration does not frame it
    expect(isProviderOnly({ landlord: false, agent: 'rejected', provider: 'verified' })).toBe(true)
    expect(isProviderOnly({ landlord: true, agent: null, provider: 'verified' })).toBe(false)
    expect(isProviderOnly({ landlord: false, agent: 'verified', provider: 'verified' })).toBe(false)
    expect(isProviderOnly({ landlord: false, agent: 'renewal_due', provider: 'verified' })).toBe(false)
    expect(isProviderOnly({ landlord: false, agent: null, provider: null })).toBe(false)
    expect(isProviderOnly(null)).toBe(false)
    expect(isProviderOnly(undefined)).toBe(false)
  })
  it('neutral pages → 服务商 for a provider-only account, whatever this browser remembers', () => {
    for (const p of ['/', '/settings', '/messages', '/pricing', '/listings', '/leases/import']) {
      expect(displayIdentity(p, false, 'tenant', providerOnly), p).toBe('provider')
    }
    // the remembered provider context still wins on its own (unchanged)
    expect(displayIdentity('/settings', true, 'tenant', providerOnly)).toBe('provider')
  })
  it('the hat pages keep the active hat, the agent pages keep 经纪 (also before verification)', () => {
    expect(displayIdentity('/tenant/agent', false, 'tenant', providerOnly)).toBe('tenant')
    expect(displayIdentity('/landlord/agent', false, 'landlord', { landlord: true, agent: null, provider: 'verified' })).toBe('landlord')
    expect(displayIdentity('/dashboard', false, 'landlord', { landlord: true, agent: null, provider: 'verified' })).toBe('landlord')
    expect(displayIdentity('/screening/app', false, 'agent', { landlord: false, agent: 'verified', provider: null })).toBe('agent')
    expect(displayIdentity('/agent/verify', false, 'tenant', providerOnly)).toBe('agent') // the door「经纪 · 开通」opens
    expect(displayIdentity('/agent/agent', false, 'landlord', null)).toBe('agent')
    expect(displayIdentity('/agent', false, 'landlord', providerOnly)).toBe('provider') // the public agent page is neutral
  })
  it('anything but a pure provider: the active hat on neutral pages, as before', () => {
    expect(displayIdentity('/settings', false, 'tenant', { landlord: false, agent: null, provider: null })).toBe('tenant')
    expect(displayIdentity('/settings', false, 'landlord', { landlord: true, agent: null, provider: 'verified' })).toBe('landlord')
    expect(displayIdentity('/settings', false, 'agent', { landlord: false, agent: 'verified', provider: 'verified' })).toBe('agent')
    expect(displayIdentity('/settings', false, 'tenant')).toBe('tenant') // the hats may be omitted (old call shape)
    expect(displayIdentity('/notifications', true, 'tenant')).toBe('provider')
  })
  it('the header hands the hats to displayIdentity', () => {
    expect(header).toContain('const displayRole = displayIdentity(pathname, home.onProvider, currentRole, hats)')
  })
})

describe('P2-4 · /login and /register land a pure provider on its jobs', () => {
  const provider = { landlord: false, agent: null, provider: 'verified' }
  it('landingAfterSignIn: nothing remembered → the provider hat; a tenant hint never outranks it', () => {
    expect(landingAfterSignIn(null, null, provider)).toBe('/provider/jobs')
    expect(landingAfterSignIn(null, 'tenant', provider)).toBe('/provider/jobs')
    expect(landingAfterSignIn('provider', null, provider)).toBe('/provider/jobs')
    expect(landingAfterSignIn(null, 'tenant', { landlord: false, agent: null, provider: null })).toBe('/tenant/agent')
    expect(landingAfterSignIn(null, null, { landlord: true, agent: null, provider: null })).toBe('/landlord/agent')
    // what the browser remembers for THIS account is the person's own choice (the callback agrees)
    expect(landingAfterSignIn('tenant', null, provider)).toBe(homeForHats('tenant', provider))
  })
  it('AuthPage: the remembered value is stored, useAuth’s role is only a hint, as in the auth callback', () => {
    const page = read('components/auth/AuthPage.tsx')
    expect(page).toContain("import { landingAfterSignIn, type HatsLite } from '@/lib/landlordHat'")
    expect(page).toContain('const remembered = window.localStorage.getItem(roleStorageKey(user.id))')
    expect(page).not.toContain('?? role') // the in-memory role is no longer folded into "remembered"
    expect(page).toContain('landingAfterSignIn(remembered, remembered ? null : role, data as HatsLite)')
    expect(page).not.toContain('homeForHats(')
    expect(read('app/auth/callback/page.tsx')).toContain('landingAfterSignIn(fromStored ? candidate : null, fromStored ? null : candidate, hats as HatsLite)') // the same semantics on both sign-in paths
  })
})

describe('P1-5 · the header commits to no identity while my_hats loads', () => {
  it('identityPending = signed in AND hats loading; visitors are never pending', () => {
    expect(header).toContain('const identityPending = home.signedIn && hats.loading')
  })
  it('the「我是」label: grey「我是…」/ "I’m …", no identity colour, not bold', () => {
    expect(header).toContain("const identityColor = home.signedIn && !identityPending ? ROLE_META[displayRole].color : null")
    expect(header).toContain("const navIdentityLabel = identityPending\n    ? (lang === 'zh' ? '我是…' : 'I’m …')")
    expect(header).toContain("color: identityColor ?? (identityPending ? '#717171' : isProductActive ? '#171717' : '#3F3F46')")
    expect(header).toContain('fontWeight: identityColor || isProductActive ? 600 : 400') // null colour → 400 while pending
    // the avatar initial gets a neutral gradient too, not a hat colour
    expect(header).toMatch(/const avatarBg = identityPending\s*\n\s*\? 'linear-gradient\(135deg, #CBD5E1, #94A3B8\)'/)
  })
  it('the avatar menu: a placeholder instead of the「当前：…」chip, the workspace link and the identity rows', () => {
    expect(header).toContain('data-testid="identity-chip-skeleton"')
    expect(header).toContain('data-testid="workspace-link-skeleton"')
    expect(header).toContain('data-testid="identity-skeleton"')
    // both surfaces that list the hats (the「我是」dropdown and the hamburger's folded list) swap in the placeholder
    expect((header.match(/\{identityPending \? identitySkeleton : identityRows\}/g) || []).length).toBe(2)
    expect(header).toContain('{identityPending ? (\n                          <div className="mt-1 h-4 w-20 rounded-full bg-[#EBEBEB]" aria-busy="true" data-testid="identity-chip-skeleton" />')
    expect(header).toContain("{!identityPending && displayRole === 'landlord' && (") // 房源管理 waits too
    // the placeholder names no hat
    const skel = header.slice(header.indexOf('const identitySkeleton = ('), header.indexOf('\n  )', header.indexOf('const identitySkeleton = (')))
    expect(skel).not.toMatch(/ROLE_META|displayRole|租客|房东|经纪|服务商/)
  })
  it('the pending-cards count waits for the hat instead of fetching the tenant’s', () => {
    expect(header).toContain('if (identityPending) return // the hat is not known yet; re-runs once it is')
    expect(header).toContain('[auth.loading, auth.user, currentRole, displayRole, pathname, identityPending])')
  })
  it('the anonymous branches are untouched: visitors still get the product menu and the role pages', () => {
    expect(header).toContain("<ReservedText text={home.signedIn ? navIdentityLabel : t('nav.product')} bold={!!identityColor || isProductActive} />")
    expect(header).toContain('{productOpen && !home.signedIn && (')
    expect(header).toContain('{PRODUCT_ITEMS.map((item) => (')
  })
})

describe('P1-5 · neutral pages framed by activeHat render blank until the hats are known', () => {
  it('/settings: blank while auth or hats load (the /messages gate), after every hook', () => {
    const s = read('app/settings/page.tsx')
    expect(s).toContain('if (auth.loading || hats.loading) return <div className="min-h-screen bg-[#F3F8FC]" />')
    expect(s.indexOf('if (auth.loading || hats.loading) return')).toBeLessThan(s.indexOf('<WorkspaceShell role={shellRole} hideAside>'))
    // every hook of the page component sits above the gate (no conditional hooks)
    const body = s.slice(s.indexOf('export default function SettingsPage()'), s.indexOf('if (auth.loading || hats.loading) return'))
    const after = s.slice(s.indexOf('if (auth.loading || hats.loading) return'), s.indexOf('</WorkspaceShell>'))
    expect(body).toMatch(/useHats\(\)/)
    expect(after).not.toMatch(/\n  (const \[.*\] = useState|useEffect\(|const .* = useRef)/)
    expect(read('app/messages/page.tsx')).toContain('if (auth.loading || !auth.user || hats.loading) return <div className="min-h-screen bg-[#F3F8FC]" />')
  })
  it('/leases/import: blank while signed in and the hats load; the anonymous sign-in prompt is unchanged', () => {
    const s = read('app/leases/import/page.tsx')
    expect(s).toContain('if (loading || (user && hats.loading)) return <div className="min-h-screen bg-[#F3F8FC]" />')
    expect(s.indexOf('if (loading || (user && hats.loading)) return')).toBeLessThan(s.indexOf('if (!loading && !user) {'))
    expect(s).toContain('<Link href="/login?next=/leases/import"')
  })
})
