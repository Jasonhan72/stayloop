// 2026-09-29 ·「我是房东这个菜单文字的颜色也改成图片里右边对的文字一样的绿色吧，这样就容易理解现在的角色了」
//
// Signed in, the header's「我是…」trigger is written in the acting hat's colour — the
// same colour as the「当前：房东」chip in the avatar menu (landlord green, tenant purple,
// agent blue), bold. The provider context has no identity colour and stays neutral;
// visitors see the plain「我是」menu as before.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { ROLE_THEME } from '../lib/roleTheme'

const header = readFileSync('components/Header.tsx', 'utf8')

describe('the「我是…」trigger speaks in the acting hat’s colour', () => {
  it('uses exactly the chip’s colour source, and only when signed in outside the provider context', () => {
    expect(header).toContain('const identityColor = home.signedIn && !home.onProvider ? ROLE_META[currentRole].color : null')
    // the avatar-menu chip reads the same entry
    expect(header).toMatch(/style=\{\{ background: ROLE_META\[currentRole\]\.color \+ '14', color: ROLE_META\[currentRole\]\.color \}\}/)
    expect(header).toContain("color: identityColor ?? (isProductActive ? '#171717' : '#3F3F46')")
    expect(header).toContain('fontWeight: identityColor || isProductActive ? 600 : 400')
    expect(header).toContain('bold={!!identityColor || isProductActive}')
  })
  it('the colours are the role identity accents', () => {
    expect(ROLE_THEME.landlord.accent).toBe('#047857') // the green in the user's screenshot
    expect(ROLE_THEME.tenant.accent).toBe('#7C3AED')
    expect(ROLE_THEME.agent.accent).toBe('#2563EB')
    for (const r of ['tenant', 'landlord', 'agent']) expect(header).toContain(`color: ROLE_THEME.${r}.accent`)
  })
})
