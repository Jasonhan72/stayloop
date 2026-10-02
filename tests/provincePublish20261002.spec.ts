// 2026-10-02 user: 「外省的要查外省的法规，不要用安省的法规和说法」 — the Montréal listing
// ("1569 rue St-Hubert, Montréal, QC, H2L 3Z1") was stored as province 'ON' because every
// publish path hard-coded it, and the publish wizard / editors told every landlord about the
// Ontario RTA. Rows now carry the confirmed / detected province, and the forms' legal hints
// come from that province's verified facts (lib/provinces/rules.ts); Ontario text is unchanged.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  addressProvinceEvidence, buildListingRow, cityFromAddress, depositGuidanceFor, detectListingProvince, factCitation,
  listingCheckItemsFor, listingFormProvince, petGuidanceFor, provinceOptions,
} from '../lib/listingPublish'
import { PROVINCE_CODES, PROVINCE_RULES, checkListingComplianceFor, type NonOntarioCode } from '../lib/provinces'

const read = (p: string) => readFileSync(p, 'utf8')
const MTL = '1569 rue St-Hubert, Montréal, QC, H2L 3Z1'
const NON_ON = Object.keys(PROVINCE_RULES) as NonOntarioCode[]
// Ontario statutes, bodies and terms that must never describe a listing elsewhere ("standard
// lease" alone is New Brunswick's own form; Ontario's is caught by 安省 / Ontario).
const ONTARIO_TERMS = /\bRTA\b|\bLTB\b|\bOHRC\b|\bRECO\b|\bTRESA\b|\bTRREB\b|\bN(1|4|9|12|13)\b|Ontario|安省|安大略/

describe('the row carries the listing’s province', () => {
  const base = { monthly_rent: 2225, bedrooms: 1, bathrooms: 1, property_type: 'condo', amenities: [] }
  it('the Montréal address is QC and a Toronto one is ON, on both the wizard and the full path', () => {
    for (const slim of [true, false]) {
      expect(buildListingRow({ ...base, address: MTL } as never, { landlordId: 'l', slug: 's', slim }).province).toBe('QC')
      expect(buildListingRow({ ...base, address: '100 King St W', city: 'Toronto' } as never, { landlordId: 'l', slug: 's', slim }).province).toBe('ON')
      expect(buildListingRow({ ...base, address: '28 Avondale Ave' } as never, { landlordId: 'l', slug: 's', slim }).province).toBe('ON')
    }
  })
  it('a valid province confirmed on the form wins; an invalid one falls back to the address', () => {
    expect(buildListingRow({ ...base, address: '28 Avondale Ave', province: 'BC' } as never, { landlordId: 'l', slug: 's', slim: true }).province).toBe('BC')
    expect(buildListingRow({ ...base, address: MTL, province: 'Foo' } as never, { landlordId: 'l', slug: 's' }).province).toBe('QC')
    expect(listingFormProvince({ address: '1569 rue St-Hubert', city: 'Montréal' })).toBe('QC')
    expect(listingFormProvince({ address: '1569 rue St-Hubert', postal_code: 'H2L 3Z1' })).toBe('QC')
    expect(listingFormProvince({ province: 'Québec', address: '1 Main St' })).toBe('QC')
  })
  it('the full path keeps the Toronto city default for Ontario only; elsewhere the city comes from the address', () => {
    expect(buildListingRow({ ...base, address: MTL } as never, { landlordId: 'l', slug: 's' }).city).toBe('Montréal')
    expect(buildListingRow({ ...base, address: '28 Avondale Ave' } as never, { landlordId: 'l', slug: 's' }).city).toBe('Toronto')
  })
  it('no hard-coded Ontario province is left in the publish library', () => {
    const src = read('lib/listingPublish.ts')
    expect(src).not.toMatch(/province:\s*'ON'/)
    expect(src).toContain('const province = listingFormProvince(form)')
  })
})

describe('province detection helpers', () => {
  it('detectListingProvince: the untouched Toronto default does not outvote the address', () => {
    expect(detectListingProvince('1569 rue St-Hubert, Montréal', null)).toBe('QC')
    expect(detectListingProvince('1569 rue St-Hubert, Montréal', 'Toronto')).toBe('ON')
    expect(detectListingProvince('', null)).toBe('ON')
  })
  it('addressProvinceEvidence reads only a postal code or an explicit province token', () => {
    expect(addressProvinceEvidence(MTL)).toBe('QC')
    expect(addressProvinceEvidence('1569 rue St-Hubert, Montréal')).toBeNull()
    expect(addressProvinceEvidence('100 King St W, Toronto, ON M5X 1A9')).toBe('ON')
    expect(addressProvinceEvidence('1 Main St', null, 'V6B 1A1')).toBe('BC')
  })
  it('cityFromAddress takes the city segment, dropping the province and postal code', () => {
    expect(cityFromAddress(MTL)).toBe('Montréal')
    expect(cityFromAddress('1569 rue St-Hubert, Apt 3, Montréal QC H2L 3Z1')).toBe('Montréal')
    expect(cityFromAddress('10 Jasper Ave, Edmonton, AB, Canada')).toBe('Edmonton')
    expect(cityFromAddress('1569 rue St-Hubert')).toBeNull()
  })
  it('the select lists all 13 provinces and territories in the UI language', () => {
    expect(provinceOptions('zh').map((o) => o.value)).toEqual([...PROVINCE_CODES])
    expect(provinceOptions('zh').find((o) => o.value === 'QC')?.label).toBe('魁北克省')
    expect(provinceOptions('en').find((o) => o.value === 'QC')?.label).toBe('Quebec')
    for (const o of provinceOptions('en')) expect(o.label, o.value).not.toMatch(/[㐀-鿿]/)
  })
})

describe('lease-term guidance outside Ontario comes from that province’s facts', () => {
  it('Ontario gets nothing from these helpers (the forms keep their RTA text)', () => {
    expect(depositGuidanceFor('ON', 2000, 5000, 'zh')).toBeNull()
    expect(depositGuidanceFor(null, 2000, 5000, 'zh')).toBeNull()
    expect(petGuidanceFor('ON', 'zh')).toBeNull()
    expect(listingCheckItemsFor('ON', 'zh')).toBeNull()
  })
  it('Quebec: no deposit of any kind, with the Civil Code citation', () => {
    const g = depositGuidanceFor('QC', 2225, 2225, 'zh')!
    expect(g.rule).toBe(PROVINCE_RULES.QC.deposit.zh)
    expect(g.rule).toContain('《魁北克民法典》第 1904、1893 条')
    expect(g.problems.length).toBe(1)
    expect(depositGuidanceFor('QC', 2225, null, 'zh')!.problems).toEqual([])
    expect(depositGuidanceFor('QC', 2225, 2225, 'en')!.problems[0]).toMatch(/Quebec does not allow any deposit/)
  })
  it('a capped province flags only an amount over its cap', () => {
    expect(depositGuidanceFor('BC', 2000, 1000, 'zh')!.problems).toEqual([])
    expect(depositGuidanceFor('BC', 2000, 1500, 'zh')!.problems[0]).toContain('半个月')
    expect(depositGuidanceFor('AB', 2000, 2000, 'en')!.problems).toEqual([])
  })
  it('pets: the verified rule where there is one, the 「不允许」 option only where a ban is allowed', () => {
    const qc = petGuidanceFor('QC', 'zh')!
    expect(qc.banOption).toBe(true)
    expect(qc.note).toBe(PROVINCE_RULES.QC.petBanAllowed!.zh)
    // Nunavut has no verified pet-ban fact: say nothing, offer no ban.
    expect(petGuidanceFor('NU', 'zh')).toEqual({ note: null, banOption: false })
  })
  it('factCitation reads the trailing citation, including nested section numbers', () => {
    expect(factCitation(PROVINCE_RULES.QC.deposit.zh)).toBe('《魁北克民法典》第 1904、1893 条')
    expect(factCitation(PROVINCE_RULES.BC.deposit.en)).toBe('Residential Tenancy Act, ss. 19(1), 20, 38(4)')
    expect(factCitation('no citation here.')).toBeNull()
  })
  it('the wizard’s check lines cover every finding checkListingComplianceFor can return', () => {
    const input = { monthly_rent: 2000, deposit: 6000, title: 'Bright 1+1', description: 'pet deposit $300, cleaning deposit, pet fee $25/mo, first and last month’s rent, $50 application fee' }
    for (const c of NON_ON) {
      const items = listingCheckItemsFor(c, 'zh')!
      const covered = new Set(items.flatMap((i) => i.rules))
      const { findings } = checkListingComplianceFor(c, input)
      expect(findings.length, c).toBeGreaterThan(0)
      for (const f of findings) expect(covered.has(f.rule), `${c} ${f.rule}`).toBe(true)
    }
  })
  it('every label, rule and note outside Ontario is free of Ontario terms and in one language', () => {
    for (const c of NON_ON) {
      for (const lang of ['zh', 'en'] as const) {
        const texts = [
          ...listingCheckItemsFor(c, lang)!.map((i) => i.label),
          depositGuidanceFor(c, 2000, 6000, lang)!.rule,
          ...depositGuidanceFor(c, 2000, 6000, lang)!.problems,
          petGuidanceFor(c, lang)!.note ?? '',
        ]
        for (const t of texts) {
          expect(t, `${c} ${lang}: ${t}`).not.toMatch(ONTARIO_TERMS)
          if (lang === 'en') expect(t, `${c} en: ${t}`).not.toMatch(/[㐀-鿿]/)
        }
      }
    }
  })
  it('Quebec’s check lines: no deposit (Civil Code), no prepaid last month, no pet fee, the application-fee warning', () => {
    const labels = listingCheckItemsFor('QC', 'zh')!.map((i) => i.label)
    expect(labels).toContain('不收任何押金（《魁北克民法典》第 1904、1893 条）')
    expect(labels.some((l) => l.startsWith('文案里没有预收最后一个月租金'))).toBe(true)
    expect(labels).toContain('文案里没有宠物费')
    expect(labels.some((l) => l.startsWith('文案里没有申请费'))).toBe(true)
  })
})

describe('the wizard and the editors are province-aware; Ontario text stays', () => {
  const wiz = read('app/dashboard/listings/new/page.tsx')
  const pub = read('app/dashboard/listings/[id]/edit/page.tsx')
  const draft = read('app/dashboard/listings/edit/page.tsx')
  it('the wizard detects the province, lets the landlord correct it and checks against that province', () => {
    expect(wiz).toContain('data-testid="listing-province"')
    expect(wiz).toContain('detectListingProvince(next.address')
    expect(wiz).toContain('province: form.province,')
    expect(wiz).toContain('checkListingComplianceFor(form.province, {')
    expect(wiz).toContain('listingCheckItemsFor(form.province, lang)')
    expect(wiz).toContain("petBanAllowed(form.province) === true && <option value=\"no\">")
    expect(wiz).toContain('depositGuidanceFor(form.province,')
    expect(wiz).not.toMatch(/import \{ checkListingCompliance \} from '@\/lib\/ontario\/rules'/)
    // the Ontario registrant notice (TRESA / RECO) is asked for an Ontario listing only
    expect(wiz).toContain("!!registrant.profile && form.province === 'ON'")
  })
  it('both editors carry the province select, the province deposit rule and the province pet options', () => {
    for (const e of [pub, draft]) {
      expect(e).toContain('data-testid="listing-province"')
      expect(e).toContain('depositGuidanceFor(')
      expect(e).toContain('petGuidanceFor(')
      expect(e).toMatch(/petBanAllowed\((form\.)?province\) === true && <option value="no">/)
    }
    expect(pub).toContain('province: form.province,')
    expect(pub).toContain('effectiveProvince(data)')
  })
  it('Ontario hint strings are still there, shown for Ontario', () => {
    expect(wiz).toContain('押金超过一个月租金。安省 RTA s.106 只允许收最多一个月租金作为末月租押金')
    expect(wiz).toContain('安省 RTA 下「禁止养宠」条款无效，所以宠物只能写「允许 / 有限制」；吸烟政策可由房东设定。')
    expect(wiz).toContain("{lang === 'zh' ? '押金不超过一个月租金（RTA s.106）' : \"Deposit within one month's rent (RTA s.106)\"}")
    expect(wiz).toContain('会拉同区域真实挂牌与 TRREB 官方数据')
    expect(wiz).toContain("{form.province === 'ON' && parseInt(form.deposit) > parseInt(form.monthly_rent)")
    for (const e of [pub, draft]) {
      expect(e).toContain('安省租金押金最多一个月租金，且只能抵最后一个月租金（RTA s.106）。')
      expect(e).toContain('安省 RTA 下「禁止养宠」条款无效，所以宠物只能写「允许 / 有限制」；吸烟政策可以由房东设定。')
    }
  })
})
