// Logo destination + the signed-in header menu (V0.7, 2026-09-27).
// User: "登录以后点击 logo 应该跳到哪里？…客户如果想要去看房源呢？找不到 header 里的
// 菜单也是不好的体验。" Decisions: visitors' logo → the marketing homepage;
// signed-in → the acting hat's assistant (providers → the work-order desk), no
// detour through `/`; the desktop header keeps 产品 · 房源 · 定价 · 租客筛查 after
// sign-in, with the acting-identity chip standing where the「我是」dropdown was.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { homeHrefFor } from '../lib/homeHref'

const read = (p: string) => readFileSync(p, 'utf8')

describe('where the logo goes', () => {
  it('pure rule: visitors and still-loading → /; signed in → the acting hat’s assistant; providers → their desk', () => {
    expect(homeHrefFor({ signedIn: false, hatsLoading: false, onProvider: false, hat: 'tenant' })).toBe('/')
    expect(homeHrefFor({ signedIn: true, hatsLoading: true, onProvider: false, hat: 'landlord' })).toBe('/')
    expect(homeHrefFor({ signedIn: true, hatsLoading: false, onProvider: false, hat: 'tenant' })).toBe('/tenant/agent')
    expect(homeHrefFor({ signedIn: true, hatsLoading: false, onProvider: false, hat: 'landlord' })).toBe('/landlord/agent')
    expect(homeHrefFor({ signedIn: true, hatsLoading: false, onProvider: false, hat: 'agent' })).toBe('/agent/agent')
    expect(homeHrefFor({ signedIn: true, hatsLoading: false, onProvider: true, hat: 'tenant' })).toBe('/provider/jobs')
  })
  it('header and footer logos share one hook; the header no longer keeps its own provider reading', () => {
    const h = read('components/Header.tsx')
    const f = read('components/Footer.tsx')
    const hook = read('lib/useHomeHref.ts')
    for (const src of [h, f]) {
      expect(src).toContain("import { useHomeHref } from '@/lib/useHomeHref'")
      expect(src).toContain('<Logo size="md" href={home.href} />')
    }
    expect(h).not.toContain('rememberedProvider')
    expect(hook).toContain("const onProvider = pathname.startsWith('/provider/') || (rememberedProvider && !!hats.provider && !roleFromPath(pathname))")
    expect(hook).toContain('hat: activeHat(hats, auth.role)') // the same held-hat predicate as the header chip
    expect(hook).toContain("!(auth.user as { is_anonymous?: boolean }).is_anonymous")
  })
  it('signed in, the desktop header keeps the four public links and shows the acting identity in the「我是」slot', () => {
    const h = read('components/Header.tsx')
    const nav = h.slice(h.indexOf('<nav className="hidden items-center gap-[26px] lg:flex">'), h.indexOf('</nav>'))
    expect(nav).toContain('{appShell && auth.user ? (() => {')
    expect(nav).toContain('data-testid="app-shell-identity"')
    expect(nav).toContain('ref={productRef}') // visitors / marketing pages keep the dropdown
    for (const k of ['nav.platform', 'nav.listings', 'nav.pricing', 'nav.screening']) expect(nav).toContain(`i18nKey="${k}"`)
    expect(h).not.toContain('{!(appShell && auth.user) && (')
    // the phone menu is untouched: visitors see the links, signed-in users the folded「浏览 Stayloop」row (2026-09-23)
    expect(h).toMatch(/浏览 Stayloop/)
  })
})
