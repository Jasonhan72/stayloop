// 2026-09-29 ·「我是房东这个菜单文字的颜色也改成图片里右边对的文字一样的绿色吧，这样就容易理解现在的角色了」
// then「我是经纪，我是服务商，也是要一样的处理下」and「我是经纪菜单点击了以后要把菜单文字也要切换成我是经纪」.
//
// Signed in, the header's「我是…」trigger names the area you are in, in that identity's
// colour — the same colour and name as the「当前：…」chip in the avatar menu and the
// current row of the identity list: landlord green, tenant purple, agent blue, provider
// orange. Agent pages say 经纪 even before the RECO check (picking「经纪 · 开通」lands on
// /agent/verify, which used to keep saying 我是房东); provider pages say 服务商.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { PROVIDER_ACCENT, ROLE_THEME } from '../lib/roleTheme'
import { displayIdentity } from '../lib/displayIdentity'

const header = readFileSync('components/Header.tsx', 'utf8')

describe('which identity the header names', () => {
  it('the area you are in: agent pages → 经纪 (also before verification), provider pages → 服务商, else the active hat', () => {
    expect(displayIdentity('/agent/verify', false, 'landlord')).toBe('agent') // the page「经纪 · 开通」opens
    expect(displayIdentity('/agent/agent', false, 'landlord')).toBe('agent')
    expect(displayIdentity('/agent', false, 'landlord')).toBe('landlord') // the public agent page is not the agent area
    expect(displayIdentity('/provider/onboard', true, 'landlord')).toBe('provider')
    expect(displayIdentity('/notifications', true, 'tenant')).toBe('provider') // a neutral page reached from the provider pages
    expect(displayIdentity('/landlord/agent', false, 'landlord')).toBe('landlord')
    expect(displayIdentity('/screening/app', false, 'agent')).toBe('agent') // an agent screening for a client keeps 经纪
    expect(displayIdentity('/settings', false, 'tenant')).toBe('tenant')
  })
  it('the label, its colour, the chip, the current row and the workspace link all read it', () => {
    expect(header).toContain('const displayRole = displayIdentity(pathname, home.onProvider, currentRole)')
    expect(header).toContain("const actingLabel = lang === 'zh' ? ROLE_META[displayRole].label : ROLE_META[displayRole].labelEn")
    expect(header).toContain('const identityColor = home.signedIn ? ROLE_META[displayRole].color : null')
    expect(header).toMatch(/style=\{\{ background: ROLE_META\[displayRole\]\.color \+ '14', color: ROLE_META\[displayRole\]\.color \}\}/)
    expect(header).toContain('const isCurrent = r === displayRole')
    expect(header).toContain("href={ROLE_META[displayRole]?.home || '/tenant/agent'}")
    expect(header).toContain("color: identityColor ?? (isProductActive ? '#171717' : '#3F3F46')")
    expect(header).toContain('fontWeight: identityColor || isProductActive ? 600 : 400')
    expect(header).toContain('bold={!!identityColor || isProductActive}')
    // an unverified agent on the agent pages: the agent row is current and says so
    expect(header).toContain("isCurrent ? (lang === 'zh' ? '未认证' : 'not verified')")
  })
})

describe('identity colours', () => {
  it('the role accents, plus the provider’s own orange', () => {
    expect(ROLE_THEME.landlord.accent).toBe('#047857') // the green in the user's screenshot
    expect(ROLE_THEME.tenant.accent).toBe('#7C3AED')
    expect(ROLE_THEME.agent.accent).toBe('#2563EB')
    expect(PROVIDER_ACCENT).toBe('#C2410C')
    for (const r of ['tenant', 'landlord', 'agent']) expect(header).toContain(`color: ROLE_THEME.${r}.accent`)
    expect(header).toMatch(/provider: \{ label: '服务商', labelEn: 'Provider', color: PROVIDER_ACCENT/)
    // the identity chooser on /onboarding/name uses the same provider colour
    expect(readFileSync('components/onboarding/RoleChooser.tsx', 'utf8')).toContain("const dot = c.key === 'provider' ? PROVIDER_ACCENT : ROLE_THEME[c.key].accent")
  })
})
