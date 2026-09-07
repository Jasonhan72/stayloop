import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { priceTag } from '../components/ListingsMap'
import { shouldShowMobileNav } from '../lib/mobileNavRoutes'
import { renderNote } from '../lib/safeNote'

describe('map price tag', () => {
  it('abbreviates rent in thousands the RealMaster way', () => {
    expect(priceTag(3000)).toBe('3K')
    expect(priceTag(3200)).toBe('3.2K')
    expect(priceTag(2325)).toBe('2.3K')
    expect(priceTag(13800)).toBe('13.8K')
    expect(priceTag(45000)).toBe('45K')
    expect(priceTag(950)).toBe('$950')
  })
})

describe('phone bottom nav routing', () => {
  it('shows on public pages only', () => {
    for (const p of ['/', '/listings', '/listings/abc', '/screening', '/pricing', '/tenant', '/landlord', '/about']) {
      expect(shouldShowMobileNav(p), p).toBe(true)
    }
    for (const p of ['/tenant/agent', '/landlord/applicants', '/agent/tasks', '/dashboard', '/settings', '/admin', '/login', '/onboarding/name', '/verify/tok', '/lease/sign/tok', '/join/tok', '/p/tok', '/h/id', '/screening/app', '/screening/id/report']) {
      expect(shouldShowMobileNav(p), p).toBe(false)
    }
  })
})

describe('listing note rendering', () => {
  it('keeps <b> and shows everything else literally', () => {
    const html = renderToStaticMarkup(<>{renderNote('<b>顶级独立屋</b> · 私人花园 <img src=x onerror=alert(1)> <script>x</script>')}</>)
    expect(html).toContain('<b>顶级独立屋</b>')
    expect(html).not.toContain('<img')
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;img')
  })
})
