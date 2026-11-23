// V0.9 opening (2026-11-22): the small things V0.8 left behind (design/history/2026-11.md,
// 「V0.9 开头：V0.8 留下的五处小尾巴」). Guards:
//  · an initial avatar skips a leading "[TEST]" tag everywhere it is drawn — the header and the
//    settings page took the raw first character and showed "[" for the test provider;
//  · the settings page's 「角色」 tile names the identity the header names (a pure service provider
//    read 「角色：租客」 under 「我是服务商」);
//  · nothing in the agent workspace leads to the commission page any more: the third status tile is
//    the RECO registration, and the client table / calendar lost their 「打开账本」 links;
//  · the listing edit pages slim their sticky action bar on a phone held sideways.
// The apply-page change (the pack fills the form on its own) is guarded in v1stage4_applyPack.spec.tsx.
import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'

vi.mock('next/link', () => ({ default: () => null }))
vi.mock('@/lib/useAuth', () => ({ useAuth: () => ({ user: null }) }))
vi.mock('@/lib/facts/useFacts', () => ({ useFacts: () => ({ facts: null, loading: false }) }))

import { nameInitial, stripLeadingTags } from '../lib/ui/nameInitial'
import { initialOf } from '../lib/threads/shared'
import { displayIdentity } from '../lib/displayIdentity'
import { agentStats } from '../lib/facts/stats'
import { buildTiles } from '../components/agent/StatusOverview'

const read = (p: string) => readFileSync(p, 'utf8')

describe('initial avatars skip a leading [TEST] tag', () => {
  it('nameInitial: tags and punctuation before the first letter are skipped, Han stays whole, Latin is uppercased', () => {
    expect(nameInitial('[TEST] Northline')).toBe('N')
    expect(nameInitial('[TEST][QA] maple plumbing')).toBe('M')
    expect(nameInitial('[TEST] 陈美雅')).toBe('陈')
    expect(nameInitial('  ·· sarah')).toBe('S')
    expect(nameInitial('provider-test@stayloop.ai')).toBe('P')
    expect(nameInitial('7 Eleven')).toBe('7')
    // nothing usable → the caller's fallback; a name that is only a tag still shows a letter from it
    expect(nameInitial('', 'U')).toBe('U')
    expect(nameInitial(null, 'U')).toBe('U')
    expect(nameInitial('   ')).toBe('?')
    expect(nameInitial('[TEST]')).toBe('T')
    expect(stripLeadingTags('[TEST] Maple Plumbing')).toBe('Maple Plumbing')
    expect(stripLeadingTags('Unit [B] owner')).toBe('Unit [B] owner')
  })

  it('the messaging avatars keep their behaviour through the shared helper', () => {
    expect(initialOf('[TEST] Agent Person', 'agent', false)).toBe('A')
    expect(initialOf('王小明', 'tenant', true)).toBe('王')
    expect(initialOf(null, 'tenant', true)).toBe('租')
    expect(initialOf('whoever', 'admin', true)).toBe('S')
    expect(read('lib/threads/shared.ts')).toContain("return nameInitial(personName(name, role, zh))")
  })

  it('the header, the settings page and the technician chip draw the initial with the helper', () => {
    for (const p of ['components/Header.tsx', 'app/settings/page.tsx']) {
      const src = read(p)
      expect(src, p).toContain("nameInitial(auth.fullName || auth.email, 'U')")
      expect(src, p).not.toContain('.slice(0, 1).toUpperCase()')
    }
    const maint = read('app/tenant/maintenance/page.tsx')
    expect(maint).toContain('{nameInitial(t.tech.name)}')
    expect(maint).not.toContain('t.tech.name.slice(0, 1)')
    // the shared-pack page masks a name to initials; the tag is not part of the name
    expect(read('app/p/[token]/page.tsx')).toContain("stripLeadingTags((name || '').trim())")
  })
})

describe('the settings page names the identity the header names', () => {
  const providerOnly = { landlord: false, agent: null, provider: 'verified' }
  it('a pure service provider is 服务商 on /settings whatever the remembered hat; a landlord who also provides is not', () => {
    expect(displayIdentity('/settings', false, 'tenant', providerOnly)).toBe('provider')
    expect(displayIdentity('/settings', false, 'landlord', { landlord: true, agent: null, provider: 'verified' })).toBe('landlord')
    // came from the provider pages → the header says 服务商, and so does the tile
    expect(displayIdentity('/settings', true, 'agent', { landlord: false, agent: 'verified', provider: 'verified' })).toBe('provider')
  })
  it('the 「角色」 tile and the accent read that identity, not the workspace hat', () => {
    const src = read('app/settings/page.tsx')
    expect(src).toContain("const identity = displayIdentity('/settings', home.onProvider, shellRole, hats)")
    expect(src).toContain("provider: { zh: '服务商', en: 'Provider' }")
    expect(src).toContain('ROLE_LABELS[identity]')
    expect(src).not.toContain('ROLE_LABELS[shellRole]')
    expect(src).toContain("identity === 'provider' ? PROVIDER_ACCENT")
    // the shell still gets a workspace hat (the provider rail is the shell's own decision)
    expect(src).toContain('<WorkspaceShell role={shellRole} hideAside>')
  })
})

describe('nothing in the agent workspace leads to the commission page', () => {
  const base = { clientsToFollowUp: 1, activeClients: 3 }
  const third = (registration: { status: string | null; expiresAt: string | null } | null | undefined, lang: 'zh' | 'en' = 'zh') =>
    buildTiles('agent', { ...base, registration }, lang, 0)[2]

  it('the third agent tile is the RECO registration and opens 认证与主页', () => {
    const tiles = buildTiles('agent', { ...base, registration: { status: 'verified', expiresAt: '2027-03-31T00:00:00Z' } }, 'zh', 0)
    expect(tiles.map((t) => t.key)).toEqual(['followup', 'clients', 'registration'])
    expect(tiles[2]).toMatchObject({ label: 'RECO 注册', value: '有效', tone: 'ok', href: '/agent/verify', sub: '2027-03-31 到期' })
    expect(tiles[2].full).toBe('RECO 注册已核')
  })

  it('every registration state has a short word and an honest tone; unknown and missing are told apart', () => {
    expect(third({ status: 'renewal_due', expiresAt: '2026-12-10' })).toMatchObject({ value: '将到期', tone: 'warn', sub: '2026-12-10 到期' })
    expect(third({ status: 'pending', expiresAt: null })).toMatchObject({ value: '待核验', tone: 'default' })
    expect(third({ status: 'rejected', expiresAt: null })).toMatchObject({ value: '未通过', tone: 'danger' })
    // an expired registration shows no 「到期」 date as if it were still running
    const expired = third({ status: 'expired', expiresAt: '2026-01-01' })
    expect(expired).toMatchObject({ value: '已过期', tone: 'danger' })
    expect(expired.sub).toBeUndefined()
    expect(third(null)).toMatchObject({ value: '未提交', tone: 'muted', full: '还没有提交 RECO 注册信息' })
    expect(third(undefined)).toMatchObject({ value: '—', tone: 'muted' })
    expect(third({ status: 'verified', expiresAt: '2027-03-31' }, 'en')).toMatchObject({ label: 'RECO registration', value: 'Valid', sub: 'Expires 2027-03-31' })
    expect(third(null, 'en').value).toBe('Not filed')
  })

  it('agentStats carries the registration from the facts and no commission figure', () => {
    const s = agentStats({ profile: { status: 'renewal_due', expires_at: '2026-12-10' }, pending: 0, clients: [], commission: [{ fee_amount: 100, stripe_transfer_id: null }] })
    expect(s.registration).toEqual({ status: 'renewal_due', expiresAt: '2026-12-10' })
    expect(agentStats({ profile: null, pending: 0, clients: [], commission: [] }).registration).toBeNull()
    expect(read('lib/facts/stats.ts')).not.toContain('unsettled')
  })

  it('no tile of any role and none of the three agent files link to /agent/earnings', () => {
    for (const role of ['tenant', 'landlord', 'agent'] as const) {
      for (const t of buildTiles(role, {}, 'zh', 0)) expect(t.href, `${role}:${t.key}`).not.toBe('/agent/earnings')
    }
    for (const p of ['components/agent/StatusOverview.tsx', 'app/agent/clients/page.tsx', 'app/agent/calendar/page.tsx']) {
      const src = read(p)
      expect(src, p).not.toContain('href="/agent/earnings"')
      expect(src, p).not.toContain("href: '/agent/earnings'")
      for (const gone of ['待结算佣金', '打开账本', '打开佣金账本', '佣金明细见', 'Open ledger', 'Open commission ledger']) expect(src, `${p}: ${gone}`).not.toContain(gone)
    }
  })
})

describe('a phone held sideways: the listing edit pages slim their sticky action bar', () => {
  it('short-landscape is a variant (not a raw screen), keyed on orientation and a 500px height', () => {
    const cfg = read('tailwind.config.ts')
    expect(cfg).toContain("addVariant('short-landscape', '@media (orientation: landscape) and (max-height: 500px)')")
    expect(cfg).not.toMatch(/screens\s*:/)
  })
  it('both edit pages: the bar and every button in it tighten under the variant', () => {
    for (const p of ['app/dashboard/listings/[id]/edit/page.tsx', 'app/dashboard/listings/edit/page.tsx']) {
      const src = read(p)
      const at = src.indexOf('data-testid="listing-save-bar"')
      expect(at, p).toBeGreaterThan(-1)
      const bar = src.slice(at, src.indexOf('<div className="h-4" />', at))
      expect(bar, p).toContain('sticky bottom-0')
      expect(bar, p).toContain('short-landscape:py-1.5')
      const buttons = bar.match(/sl-btn-(primary|secondary)[^"]*"/g) ?? []
      expect(buttons.length, p).toBe(2)
      for (const b of buttons) expect(b, p).toContain('short-landscape:!py-1.5')
    }
  })
})
