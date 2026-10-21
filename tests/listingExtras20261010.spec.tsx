// @vitest-environment jsdom
// 2026-10-10 · listing page extras the user asked for after the TRREB readiness pass:
// 租金记录 gated like a VOW (anonymous: current row + blurred earlier rows + sign-in bar) and a
// facts-only 租客保险 card (partner link only when the admin-enabled referral config exists).
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import React from 'react'
import { act, cleanup, render } from '@testing-library/react'
import { all, only, textOf } from './helpers/dom'

vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => React.createElement('a', { href, ...rest }, children) }))
import { RentHistory, rentHistoryRows } from '../components/listing/RentHistory'
import { TenantInsuranceCard } from '../components/listing/TenantInsuranceCard'

const detail = readFileSync('app/listings/[slug]/page.tsx', 'utf8')
const history = [
  { date: '2026-08-01', price: 2900, prev: null, event: 'listed' },
  { date: '2026-09-01', price: 2800, prev: 2900, event: 'price_change' },
  { date: '2026-10-01', price: 2700, prev: 2800, event: 'price_change' },
] as never[]
const text = (r: ReturnType<typeof render>) => textOf(r.container)

afterEach(cleanup)

describe('RentHistory', () => {
  it('newest first; anonymous visitors see the current row, the earlier rows blurred behind a sign-in link; signed-in users see all', () => {
    expect(rentHistoryRows(history).map((h) => h.price)).toEqual([2700, 2800, 2900])
    let r = render(<RentHistory zh history={history} signedIn={false} loginHref="/login?redirect=/listings/x" />)
    const blurred = only(r.container, '[data-testid="rent-history-blurred"]')
    expect(blurred.getAttribute('aria-hidden')).toBe('true')
    expect(blurred.className).toContain('blur-')
    expect([blurred, ...all(blurred, 'span')].filter((n) => n.tagName === 'SPAN' && n.className.includes('font-semibold')).length).toBe(2)
    const signin = only(r.container, '[data-testid="rent-history-signin"]')
    expect(signin.getAttribute('href')).toBe('/login?redirect=/listings/x')
    expect(text(r)).toContain('还有 2 条')
    r = render(<RentHistory zh history={history} signedIn loginHref="/login" />)
    expect(all(r.container, '[data-testid="rent-history-blurred"]')).toHaveLength(0)
    expect(text(r)).toContain('降价（原 $2,800）')
  })
  it('a single row is never blurred, and no rows means no section', () => {
    let r = render(<RentHistory zh history={history.slice(0, 1)} signedIn={false} loginHref="/login" />)
    expect(all(r.container, '[data-testid="rent-history-blurred"]')).toHaveLength(0)
    r = render(<RentHistory zh history={[]} signedIn={false} loginHref="/login" />)
    expect(r.container.innerHTML).toBe('')
  })
})

describe('TenantInsuranceCard', () => {
  it('is a quote entry: a Get-quotes button to the comparison site by default, overridable by the admin config; facts only, no price', async () => {
    const g = globalThis as { fetch?: unknown }
    g.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ enabled: false }) }))
    let r!: ReturnType<typeof render>
    await act(async () => { r = render(<TenantInsuranceCard zh province="ON" />) })
    const t = text(r)
    expect(t).toContain('这套房源的租客保险要多少钱？')
    expect(t).toContain('安省标准租约第 11 条')
    expect(t).not.toMatch(/\$\s?\d/)
    const a = only(r.container, '[data-testid="tenant-insurance-partner"]')
    expect(a.getAttribute('href')).toBe('https://rates.ca/insurance-quotes/tenant')
    expect(a.getAttribute('target')).toBe('_blank')
    expect(t).toContain('报价由 Rates.ca 提供')
    expect(t).toContain('不承保')
    await act(async () => { r = render(<TenantInsuranceCard zh province="QC" />) })
    expect(text(r)).not.toContain('安省')
    g.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ enabled: true, partner_name: 'X', url: 'https://x.example/' }) }))
    await act(async () => { r = render(<TenantInsuranceCard zh province="ON" />) })
    expect(only(r.container, '[data-testid="tenant-insurance-partner"]').getAttribute('href')).toBe('https://x.example/')
    expect(text(r)).toContain('报价由 X 提供')
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
