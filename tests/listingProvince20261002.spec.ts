// 2026-10-02 user: 「蒙特利尔房源，改成魁北克」→「是的，要改」 — Ontario-only content on the listing detail page (the
// RTA notes, the move-in cost card, TRREB averages) shows only on Ontario listings; elsewhere one sentence says the
// Ontario rules do not apply. An empty province is Ontario (older rows; the product is Ontario-only).
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { isOntarioListing, ontarioRulesNotApplicable, provinceName } from '../lib/listingDisplay'

describe('which listings get the Ontario notes', () => {
  it('Ontario, its spellings and an empty province are Ontario; Quebec and others are not', () => {
    for (const p of ['ON', 'on', 'Ont', 'Ontario', '安省', '', null, undefined]) expect(isOntarioListing(p), String(p)).toBe(true)
    for (const p of ['QC', 'BC', 'Quebec', 'AB']) expect(isOntarioListing(p), p).toBe(false)
  })
  it('the replacement sentence names the province', () => {
    expect(provinceName('QC', true)).toBe('魁北克省')
    expect(ontarioRulesNotApplicable('QC', true)).toBe('安省租房规则不适用于这套房源（魁北克省）。')
    expect(ontarioRulesNotApplicable('QC', false)).toBe('Ontario rental rules do not apply to this listing (Quebec).')
  })
})

describe('the listing page gates its Ontario-only blocks', () => {
  const s = readFileSync('app/listings/[slug]/page.tsx', 'utf8')
  it('the rules note, the move-in card and the TRREB benchmark depend on the province', () => {
    expect(s).toContain('{!isOntarioListing(listing.province)\n                  ? ontarioRulesNotApplicable(listing.province, zh)')
    expect(s).toContain('{isOntarioListing(listing.province) && <MoveInCosts zh={zh} rent={listing.monthly_rent} deposit={listing.deposit} />}')
    expect(s).toContain('if (trrebType && listing.bedrooms != null && isOntarioListing(listing.province)) {')
    // the TRREB source line appears only when a TRREB number is shown
    expect(s).toContain("${benchmark ? '；成交均价来自 TRREB 季度租赁市场报告（成交，非挂牌）' : ''}")
  })
  it('outside Ontario the contact card does not offer RECO (Ontario-registered) agents', () => {
    expect(s).toContain("'向房东预约看房或提问，或直接提交完整申请。Stayloop 不参与交易、不收费。'")
    expect(s).toContain("{listing.source !== 'realtor' && !isOntarioListing(listing.province)")
  })
})
