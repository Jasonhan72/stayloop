// Logo destination + the signed-in header menu (V0.7, 2026-09-27; logo changed 2026-10-04).
// 2026-10-04 user: the logo 「不管有没有登录，都是到首页营销页」 — it goes to `/` for everyone,
// and `/` shows the marketing page to signed-in visitors too (only a brand-new account is sent
// on to onboarding). The desktop header keeps 产品 · 房源 · 定价 · 租客筛查 after sign-in.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const read = (p: string) => readFileSync(p, 'utf8')

describe('where the logo goes', () => {
  it('always the marketing homepage, signed in or not (2026-10-04)', () => {
    const hook = read('lib/useHomeHref.ts')
    expect(hook).toContain("return { href: '/', onProvider, signedIn }")
    expect(hook).not.toContain('homeHrefFor')
    const home = read('components/home/HomeNext.tsx')
    expect(home).not.toContain('data-testid="home-redirect"') // no 「正在打开你的 AI 助理…」 bounce for signed-in visitors
    expect(home).toContain("const onboarding = ready && landingForAccount(remembered, hats, named) === '/onboarding/name'")
    expect(home).toContain("router.replace('/onboarding/name')")
    expect(home).toContain('homeHref={myHome} defaultRole={askAs}')
    expect(home).toContain('data-testid="home-back-to-agent"')
    expect(read('components/home/HeroComposer.tsx')).toContain('data-testid="home-ask-back"')
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
    expect(hook).toContain("!(auth.user as { is_anonymous?: boolean }).is_anonymous")
  })
  it('one menu everywhere (user 2026-09-27): the desktop nav is not gated on any prop; signed in, the「我是」dropdown lists the hats and its label names the acting hat', () => {
    const h = read('components/Header.tsx')
    expect(h).not.toContain('appShell')
    expect(h).not.toContain('onClick={() => { setMenuOpen(true); setHatsOpen(true) }}') // no chip, no「切换」that opened the hamburger
    const nav = h.slice(h.indexOf('<nav className="hidden items-center gap-[26px] lg:flex">'), h.indexOf('</nav>'))
    expect(nav).toContain('ref={productRef}')
    for (const k of ['nav.platform', 'nav.listings', 'nav.pricing', 'nav.screening']) expect(nav).toContain(`i18nKey="${k}"`)
    expect(nav).toContain('{productOpen && home.signedIn && (')
    expect(nav).toContain('data-testid="nav-identity-menu"')
    expect(nav).toContain('{productOpen && !home.signedIn && (')
    expect(nav).toContain('{PRODUCT_ITEMS.map((item) => (') // visitors still get the four role pages
    expect(h).toContain("const navIdentityLabel = lang === 'zh' ? `我是${actingLabel}`")
    // one set of rows, rendered by the dropdown and by the hamburger's folded list
    expect((h.match(/\{identityRows\}/g) || []).length).toBe(2)
    // switching a hat or opening a door closes both surfaces; Escape / outside click already close the dropdown
    expect(h).toContain('const closeMenus = () => { setMenuOpen(false); setProductOpen(false) }')
    const rows = h.slice(h.indexOf('const identityRows = ('), h.indexOf('\n  return ('))
    expect(rows).not.toContain('setMenuOpen(false)')
    expect((rows.match(/onClick=\{closeMenus\}/g) || []).length).toBeGreaterThanOrEqual(3)
    // the phone menu is untouched: visitors see the links, signed-in users the folded「浏览 Stayloop」row (2026-09-23)
    expect(h).toMatch(/浏览 Stayloop/)
  })
})
