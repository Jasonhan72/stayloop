import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'

// Product structure made visible (2026-09-23): one lifecycle product
// (租前 · 租中 · 租后) + Stayloop API (renamed from Trust API).
describe('product structure: lifecycle + Stayloop API', () => {
  it('/platform exists and carries the three stages and the API', () => {
    const src = readFileSync('app/platform/page.tsx', 'utf8')
    for (const k of ["key: 'pre'", "key: 'mid'", "key: 'post'", 'Stayloop API', '/stayloop-api/docs']) expect(src).toContain(k)
    expect(src).toMatch(/租前[\s\S]*租中[\s\S]*租后/)
  })
  it('Trust API is renamed everywhere users can see it; old routes redirect', () => {
    expect(existsSync('app/stayloop-api/page.tsx')).toBe(true)
    expect(existsSync('app/trust-api')).toBe(false)
    const ui = ['app/stayloop-api/page.tsx', 'app/stayloop-api/docs/page.tsx', 'app/pricing/page.tsx', 'app/contact/page.tsx', 'app/partners/page.tsx', 'app/tenant/passport/sharing/page.tsx', 'app/admin/page.tsx', 'app/admin/partners/page.tsx', 'components/Footer.tsx', 'components/Header.tsx', 'lib/i18n.tsx', 'components/home/HomeNext.tsx']
    for (const f of ui) {
      const src = readFileSync(f, 'utf8').replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '')
      expect(src, f).not.toMatch(/Trust API|TRUST API|\/trust-api/)
    }
    expect(readFileSync('middleware.ts', 'utf8')).toMatch(/\/trust-api[\s\S]*\/stayloop-api/)
    expect(readFileSync('app/sitemap.ts', 'utf8')).toContain("'/stayloop-api/docs'")
  })
  it('header, footer and homepage all lead to the product structure', () => {
    expect(readFileSync('components/Header.tsx', 'utf8')).toMatch(/i18nKey="nav\.platform" href="\/platform"/)
    expect(readFileSync('components/Footer.tsx', 'utf8')).toMatch(/foot\.platform[\s\S]*foot\.stayloopApi/)
    expect(readFileSync('components/home/HomeNext.tsx', 'utf8')).toMatch(/租前 · 租中 · 租后，一条流程/)
    const i18n = readFileSync('lib/i18n.tsx', 'utf8')
    expect(i18n).toMatch(/'nav\.platform': \{ en: 'Product', zh: '产品' \}/)
    expect(i18n).toMatch(/'foot\.stayloopApi': \{ en: 'Stayloop API', zh: 'Stayloop API' \}/)
  })
})
