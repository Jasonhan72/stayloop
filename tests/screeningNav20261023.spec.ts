// 2026-10-23 · user: 「租客筛选这个 header 的菜单，在登录情况下，点击，页面会有闪，然后再到筛选的页面」.
// Cause: the nav item pointed at the public landing (/screening); for a signed-in landlord the whole
// marketing page painted, then AutoEnter replaced it with /screening/app once the hats loaded.
// Fix: the header links straight to the workspace for a landlord / live agent; the landing (and its
// AutoEnter forward for old bookmarks) is unchanged for visitors and tenants.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { screeningHrefFor } from '@/lib/screeningHref'

const read = (p: string) => readFileSync(p, 'utf8')

describe('screeningHrefFor', () => {
  const hats = (o: Partial<{ loading: boolean; landlord: boolean; agent: string | null }>) => ({ loading: false, landlord: false, agent: null, ...o })
  it('landing for visitors, tenants and while the hats are still loading', () => {
    expect(screeningHrefFor(false, hats({ landlord: true }))).toBe('/screening')
    expect(screeningHrefFor(true, hats({}))).toBe('/screening')
    expect(screeningHrefFor(true, hats({ loading: true, landlord: true }))).toBe('/screening')
    expect(screeningHrefFor(true, hats({ agent: 'pending' }))).toBe('/screening')
    expect(screeningHrefFor(true, hats({ agent: 'expired' }))).toBe('/screening')
  })
  it('workspace for a landlord or a live agent', () => {
    expect(screeningHrefFor(true, hats({ landlord: true }))).toBe('/screening/app')
    expect(screeningHrefFor(true, hats({ agent: 'verified' }))).toBe('/screening/app')
    expect(screeningHrefFor(true, hats({ agent: 'renewal_due' }))).toBe('/screening/app')
  })
})

describe('header wiring', () => {
  const h = read('components/Header.tsx')
  it('all three screening links use the hat-aware href; none is hardcoded to the landing', () => {
    expect(h).toContain("const screeningHref = screeningHrefFor(home.signedIn, hats)")
    expect(h).toContain('<NavLink i18nKey="nav.screening" href={screeningHref}')
    expect(h).toContain('<Link href={screeningHref} onClick={() => setMenuOpen(false)}')
    expect(h).toContain("{ href: screeningHref, label: t('nav.screening') }")
    expect(h).not.toMatch(/href="\/screening"/)
    expect(h).not.toContain("href: '/screening'")
  })
  it('the active state still matches both the landing and the workspace', () => {
    expect(h).toContain("active={isActive('/screening')}")
    expect(h).toMatch(/pathname === href \|\| pathname\.startsWith\(href \+ '\/'\)/)
  })
  it('the landing keeps AutoEnter for bookmarks', () => {
    expect(read('app/screening/page.tsx')).toContain('<AutoEnter />')
  })
})
