// Services marketplace — the entry points (proposal approved 2026-09-26).
// Until this batch the marketplace was reachable only from inside a tenancy
// hub. These guards pin the public page, the four site-wide links, the
// landlord rail item and policy strip, the provider doors and the tenant /
// pricing copy. Source guards, plus the pure mode-label table.
import { describe, expect, it } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { DISPATCH_MODES, MODE_LABEL } from '@/lib/marketplace/dispatchPolicy'
import { CREDENTIAL_LABEL, TRADES } from '@/lib/marketplace/trades'

const read = (p: string) => readFileSync(p, 'utf8')

describe('/services — the public page of the repairs network', () => {
  const src = read('app/services/page.tsx')
  it('exists, is client-rendered like the other product pages, and names itself honestly', () => {
    expect(existsSync('app/services/page.tsx')).toBe(true)
    expect(src).toContain("'use client'")
    expect(src).toContain('维修与服务网络')
    expect(src).toContain('试点阶段')
    expect(src).toContain('不抽成')
    expect(src).toContain('没有公开的服务商目录')
  })
  it('has the two CTAs from the proposal — landlords dispatch, providers onboard', () => {
    expect(src).toContain('href="/landlord/providers" className="sl-btn-primary"')
    expect(src).toContain('href="/provider/onboard" className="sl-btn-secondary"')
  })
  it('reads trades and credentials from the one module the server enforces with', () => {
    expect(src).toMatch(/import \{ CREDENTIAL_LABEL, TRADES \} from '@\/lib\/marketplace\/trades'/)
    expect(src).toContain('TRADES.map(')
    expect(src).toContain('t.required.map(')
    // No hand-written credential list that could drift from lib/marketplace/trades.ts.
    for (const t of TRADES) for (const k of t.required) expect(CREDENTIAL_LABEL[k]).toBeTruthy()
  })
  it('states the legal flow, not marketing metrics', () => {
    expect(src).toContain('RTA s.27')
    expect(src).toContain('s.26')
    expect(src).toContain('10%')
    expect(src).not.toMatch(/★|SOC ?2|客户数|评分 ?\d/)
  })
})

describe('site-wide links to /services', () => {
  it('Header: fourth door in the 我是 dropdown (desktop and mobile render the same list)', () => {
    const h = read('components/Header.tsx')
    expect(h).toContain("{ key: 'nav.services', href: '/services'")
    // Both menus map PRODUCT_ITEMS, so one entry covers desktop and phone.
    expect((h.match(/PRODUCT_ITEMS\.map\(/g) || []).length).toBeGreaterThanOrEqual(2)
  })
  it('Header identity menu: a provider door when the account has no provider row, the jobs door when it has', () => {
    const h = read('components/Header.tsx')
    expect(h).toContain('{!hats.loading && !hats.provider && (')
    expect(h).toContain('data-testid="become-provider"')
    expect(h).toContain('成为服务商 · 需资质核验')
    expect(h).toContain('{hats.provider && (')
    expect(h).toContain('href="/provider/jobs"')
  })
  it('i18n keys exist for the nav item and the footer link', () => {
    const i = read('lib/i18n.tsx')
    expect(i).toContain("'nav.services': { en: 'Provider', zh: '服务商' }")
    expect(i).toContain("'foot.services': {")
  })
  it('Footer product column lists it right after Stayloop API', () => {
    const f = read('components/Footer.tsx')
    expect(f).toContain("{ key: 'foot.stayloopApi', href: '/stayloop-api' },\n      { key: 'foot.services', href: '/services' },")
  })
  it('/platform 租中 has a repair-dispatch capability linking to /services', () => {
    const p = read('app/platform/page.tsx')
    expect(p).toMatch(/维修派单[^\n]*href: '\/services'/)
  })
  it('homepage 租中 card mentions repair dispatch in both languages', () => {
    const h = read('components/home/HomeNext.tsx')
    expect(h).toContain('租金记录 · 报修 · 维修派单')
    expect(h).toContain('maintenance · repair dispatch')
  })
  it('the route audit probes the new public page', () => {
    expect(read('scripts/route-audit.mjs')).toContain("'/services',")
  })
})

describe('landlord side — rail item and the policy strip on the maintenance board', () => {
  const rail = read('components/workspace/rail.tsx')
  it('the landlord rail has 服务商 right after 维修; tenants and agents do not', () => {
    const landlord = rail.slice(rail.indexOf('landlord: ['), rail.indexOf('agent: ['))
    const maint = landlord.indexOf("href: '/landlord/maintenance'")
    const prov = landlord.indexOf("href: '/landlord/providers'")
    expect(maint).toBeGreaterThan(-1)
    expect(prov).toBeGreaterThan(maint)
    expect(landlord).toContain("label: { zh: '服务商', en: 'Providers' }")
    const tenant = rail.slice(rail.indexOf('tenant: ['), rail.indexOf('landlord: ['))
    const agent = rail.slice(rail.indexOf('agent: ['), rail.indexOf('/* ============= PHONE TABS'))
    expect(tenant).not.toContain('/landlord/providers')
    expect(agent).not.toContain('/landlord/providers')
    expect(rail).toContain('export function UsersIcon()')
  })
  it('the maintenance board shows the live dispatch policy and links to where it is set', () => {
    const b = read('components/landlord/LiveMaintenanceBoard.tsx')
    expect(b).toContain("from('dispatch_policies')")
    expect(b).toContain('normalizePolicy(')
    expect(b).toContain('data-testid="dispatch-policy-strip"')
    expect(b).toContain('MODE_LABEL[policy.mode]')
    expect(b).toContain('href="/landlord/providers"')
  })
  it('mode labels are one table shared by the settings card and the strip', () => {
    expect(Object.keys(MODE_LABEL).sort()).toEqual([...DISPATCH_MODES].sort())
    for (const m of DISPATCH_MODES) { expect(MODE_LABEL[m].zh.length).toBeGreaterThan(0); expect(MODE_LABEL[m].en.length).toBeGreaterThan(0) }
    const card = read('components/marketplace/DispatchPolicyCard.tsx')
    expect(card).toContain('...MODE_LABEL.suggest')
    expect(card).not.toContain("zh: '只建议'")
  })
  it('the landlord maintenance empty state points at the network page', () => {
    const s = read('components/WorkspaceShell.tsx')
    const gate = s.slice(s.indexOf("'/landlord/maintenance': {"), s.indexOf("'/tenant/applications': {"))
    expect(gate).toContain("more: { zh: '维修与服务网络是怎么运作的 →'")
    expect(gate).toContain("href: '/services'")
    expect(s).toContain('{gate.more && ')
  })
})

describe('provider side', () => {
  it('phone drawer: a provider account gets a 工单 tile in every role\'s 更多 sheet', () => {
    const rail = read('components/workspace/rail.tsx')
    expect(rail).toContain("import { useHats } from '@/lib/useHats'")
    expect(rail).toContain('const hats = useHats()')
    expect(rail).toContain('{hats.provider && (')
    expect(rail).toContain('data-testid="drawer-provider-jobs"')
    expect(rail).toContain('href="/provider/jobs"')
  })
  it('/provider/jobs warns ≤30 days before the earliest required credential expires, red once expired', () => {
    const j = read('app/provider/jobs/page.tsx')
    expect(j).toContain('earliestExpiry(')
    expect(j).toContain("from('provider_credentials').select('kind, expires_at, verified_at')")
    expect(j).toContain('expiry.days <= 30')
    expect(j).toContain('data-testid="credential-expiry"')
    expect(j).toContain("expiry.days < 0 ? 'border-red-200")
    expect(j).toContain('href="/provider/onboard" className="font-bold underline"')
  })
})

describe('tenant and pricing copy', () => {
  it('the ticket modal explains dispatch and links to /services in both languages', () => {
    const m = read('components/tenant/NewTicketModal.tsx')
    expect((m.match(/href="\/services"/g) || []).length).toBe(2)
    expect(m).toContain('了解维修与服务网络 →')
    expect(m).toContain('About the repairs network →')
  })
  it('the tenant maintenance empty state mentions credential-checked providers and links to /services', () => {
    const s = read('components/WorkspaceShell.tsx')
    const gate = s.slice(s.indexOf("'/tenant/maintenance': {"), s.indexOf("'/agent/tasks': {"))
    expect(gate).toContain('资质已核的服务商')
    expect(gate).toContain("href: '/services'")
  })
  it('pricing: both repair lines link to /services through the optional feature href', () => {
    const p = read('app/pricing/page.tsx')
    expect(p).toContain("{ zh: '维修工单 + 派给你自己的联系人', en: 'Repair tickets + dispatch to your own contacts', href: '/services' }")
    expect(p).toMatch(/维修派单：已核验服务商网络[^\n]*href: '\/services'/)
    expect(p).toContain('f.href && ')
  })
})
