// 2026-10-10 · listing page extras the user asked for after the TRREB readiness pass:
// 租金记录 gated like a VOW (anonymous: current row + blurred earlier rows + sign-in bar) and a
// facts-only 租客保险 card (partner link only when the admin-enabled referral config exists).
import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'

vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => React.createElement('a', { href, ...rest }, children) }))
import { RentHistory, rentHistoryRows } from '../components/listing/RentHistory'
import { TenantInsuranceCard } from '../components/listing/TenantInsuranceCard'

const detail = readFileSync('app/listings/[slug]/page.tsx', 'utf8')
const history = [
  { date: '2026-08-01', price: 2900, prev: null, event: 'listed' },
  { date: '2026-09-01', price: 2800, prev: 2900, event: 'price_change' },
  { date: '2026-10-01', price: 2700, prev: 2800, event: 'price_change' },
] as never[]
const text = (r: TestRenderer.ReactTestRenderer) => { const walk = (x: TestRenderer.ReactTestInstance | string): string => typeof x === 'string' ? x : x.children.map(walk).join(''); return walk(r.root) }

describe('RentHistory', () => {
  it('newest first; anonymous visitors see the current row, the earlier rows blurred behind a sign-in link; signed-in users see all', () => {
    expect(rentHistoryRows(history).map((h) => h.price)).toEqual([2700, 2800, 2900])
    let r!: TestRenderer.ReactTestRenderer
    act(() => { r = TestRenderer.create(<RentHistory zh history={history} signedIn={false} loginHref="/login?redirect=/listings/x" />) })
    const blurred = r.root.findByProps({ 'data-testid': 'rent-history-blurred' })
    expect(blurred.props['aria-hidden']).toBe('true')
    expect(blurred.props.className).toContain('blur-')
    expect(blurred.findAll((n) => n.type === 'span' && typeof n.props.className === 'string' && n.props.className.includes('font-semibold')).length).toBe(2)
    const signin = r.root.findByProps({ 'data-testid': 'rent-history-signin' })
    expect(signin.props.href).toBe('/login?redirect=/listings/x')
    expect(text(r)).toContain('还有 2 条')
    act(() => { r = TestRenderer.create(<RentHistory zh history={history} signedIn loginHref="/login" />) })
    expect(r.root.findAllByProps({ 'data-testid': 'rent-history-blurred' })).toHaveLength(0)
    expect(text(r)).toContain('降价（原 $2,800）')
  })
  it('a single row is never blurred, and no rows means no section', () => {
    let r!: TestRenderer.ReactTestRenderer
    act(() => { r = TestRenderer.create(<RentHistory zh history={history.slice(0, 1)} signedIn={false} loginHref="/login" />) })
    expect(r.root.findAllByProps({ 'data-testid': 'rent-history-blurred' })).toHaveLength(0)
    act(() => { r = TestRenderer.create(<RentHistory zh history={[]} signedIn={false} loginHref="/login" />) })
    expect(r.toJSON()).toBeNull()
  })
})

describe('TenantInsuranceCard', () => {
  it('states facts only (no price), names Ontario standard lease s.11 for ON, and shows no partner button without the config', async () => {
    const g = globalThis as { fetch?: unknown }
    g.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ enabled: false }) }))
    let r!: TestRenderer.ReactTestRenderer
    await act(async () => { r = TestRenderer.create(<TenantInsuranceCard zh province="ON" />) })
    const t = text(r)
    expect(t).toContain('安省标准租约第 11 条')
    expect(t).not.toMatch(/\$\s?\d/)
    expect(r.root.findAllByProps({ 'data-testid': 'tenant-insurance-partner' })).toHaveLength(0)
    await act(async () => { r = TestRenderer.create(<TenantInsuranceCard zh province="QC" />) })
    expect(text(r)).not.toContain('安省')
    g.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ enabled: true, partner_name: 'X', url: 'https://x.example/' }) }))
    await act(async () => { r = TestRenderer.create(<TenantInsuranceCard zh province="ON" />) })
    const a = r.root.findByProps({ 'data-testid': 'tenant-insurance-partner' })
    expect(a.props.href).toBe('https://x.example/')
    expect(text(r)).toContain('不收取佣金')
  })
})

describe('wiring on the listing page', () => {
  it('the page uses the gated history (signed-in from auth) and the insurance card after the move-in costs', () => {
    expect(detail).toContain('<RentHistory zh={zh} history={listing.price_history} signedIn={!!auth.user}')
    expect(detail).not.toContain("title={zh ? '价格记录'")
    expect(detail.indexOf('<MoveInCosts')).toBeLessThan(detail.indexOf('<TenantInsuranceCard'))
    // the Ontario lease doc really numbers tenant insurance as section 11
    expect(readFileSync('components/lease/OntarioLeaseDoc.tsx', 'utf8')).toMatch(/<Section n=\{11\} title="Tenant's Insurance">/)
  })
})
