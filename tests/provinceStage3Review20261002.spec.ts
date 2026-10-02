// Stage-3 review of the province work (2026-10-02 · 「外省的要查外省的法规，不要用安省的法规和说法」
// + one language per page). Each block pins one fix found in the code / render review.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { checkListingComplianceFor, listingRulesNote } from '@/lib/provinces/rules'
import { postalCodeIn } from '@/lib/provinces/detect'
import { provinceOfOwnedListingInMessage } from '@/lib/agent/guardrail'
import type { OwnedListingRow } from '@/lib/agent/draftExisting'

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8')

describe('Quebec copy check: a deposit ruled out is not a deposit stated', () => {
  const block = (description: string) => !checkListingComplianceFor('QC', { monthly_rent: 2225, description }).passed
  it('passes copy that says there is no deposit of a given kind', () => {
    for (const t of ['No pet deposit, no damage deposit required.', 'Deposit: none', 'Deposit: $0', '押金：无', '押金：0', '免押金，宠物友好'])
      expect(block(t), t).toBe(false)
  })
  it('still blocks a deposit the copy states', () => {
    for (const t of ['Security deposit: one month', 'Deposit: $500', '押金：0.5 个月', 'Pet deposit $300', 'No deposit. Key deposit $50'])
      expect(block(t), t).toBe(true)
  })
})

describe('the landlord’s only listing: a quantity is not another address', () => {
  const MTL = { id: 'x', address: '1569 rue St-Hubert, Montréal, QC, H2L 3Z1', city: 'Montréal', province: 'QC', postal_code: null, unit: null } as unknown as OwnedListingRow
  it('“3 months”, “10 percent”, “2500 dollars” keep the Quebec listing', () => {
    for (const m of ['My tenant’s lease ends in 3 months, how much can I raise the rent?', '租金涨 10 percent 可以吗', 'Rent 2500 dollars, 2 bedrooms'])
      expect(provinceOfOwnedListingInMessage(m, [MTL]), m).toBe('QC')
  })
  it('a street address (with or without a suffix) still means another property', () => {
    for (const m of ['我想发 28 Avondale Ave，能写禁止养宠吗', '我想发 28 avondale，能写禁止养宠吗', 'what about 55 Cooper St'])
      expect(provinceOfOwnedListingInMessage(m, [MTL]), m).toBeNull()
  })
})

describe('listing page details', () => {
  it('the Quebec note names the tribunal in full at its first mention (both languages)', () => {
    const zh = listingRulesNote('QC', 'zh')!
    const en = listingRulesNote('QC', 'en')!
    expect(zh.indexOf('魁北克住房行政法庭（TAL）')).toBeLessThan(zh.indexOf('TAL 的强制表格'))
    expect(zh.indexOf('魁北克住房行政法庭（TAL）')).toBeLessThanOrEqual(zh.indexOf('TAL'))
    expect(en.indexOf('Administrative Housing Tribunal (TAL)')).toBeLessThanOrEqual(en.indexOf('TAL'))
  })
  it('the postal code fact falls back to the code written in the address', () => {
    expect(postalCodeIn('1569 rue St-Hubert, Montréal, QC, H2L 3Z1')).toBe('H2L 3Z1')
    expect(postalCodeIn('1001 Bay St')).toBeNull()
    expect(read('app/listings/[slug]/page.tsx')).toContain('listing.postal_code || postalCodeIn(listing.address) ||')
  })
})

describe('apply page: one language, and no federal label before the province is known', () => {
  const apply = read('app/apply/[slug]/page.tsx')
  it('the employment options keep English values but show Chinese labels in the Chinese UI', () => {
    expect(apply).toContain("{ value: 'Full-time employed', zh: '全职' }")
    expect(apply).toContain('...EMPLOYMENT_OPTIONS.map((o) => ({ value: o.value, label: zh ? o.zh : o.value }))')
  })
  it('the eyebrows are Chinese in the Chinese UI', () => {
    expect(apply).toContain("zh ? (showPipeda ? '租房申请 · 加密存储 · PIPEDA' : '租房申请 · 加密存储')")
    expect(apply).toContain("zh ? (showPipeda ? '授权 · PIPEDA' : '授权')")
  })
  it('PIPEDA waits for the listing', () => {
    expect(apply).toContain('const showPipeda = provinceKnown && (')
  })
})

describe('Ontario-only promises are kept off listings elsewhere', () => {
  it('the wizard’s credit + court stamp mentions Ontario records only for an Ontario listing', () => {
    const w = read('app/dashboard/listings/new/page.tsx')
    expect(w).toContain("desc: form.province === 'ON' ? '申请人提供或授权的信用报告，加安省公开记录检索。' : '申请人提供或授权的信用报告。'")
    expect(w).toContain("desc: form.province === 'ON' ? 'A credit report the applicant provides or authorises, plus a search of Ontario public records.' : 'A credit report the applicant provides or authorises.'")
  })
  it('a lease record for a home outside Ontario is not labelled or offered as Ontario’s standard lease', () => {
    const p = read('app/landlord/leases/[id]/page.tsx')
    expect(p).toContain("const outside = recordOnly && province !== 'ON'")
    expect(p).toContain("{outside ? `${provName} · ${zh ? '租约记录' : 'LEASE RECORD'}` : <>{isTrreb ? 'TRREB FORM 400' : 'ONTARIO STANDARD LEASE'} · {l.status.toUpperCase()}</>}")
    // The province is resolved before the lease is shown (no Ontario wording first).
    expect(p.indexOf('setProvince(')).toBeLessThan(p.indexOf('setLease(data)'))
  })
})
