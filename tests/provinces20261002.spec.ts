// 2026-10-02 user: 「外省的要查外省的法规，不要用安省的法规和说法。」 — a listing outside Ontario
// follows its own province's rules (or says nothing), never Ontario's. lib/provinces/detect decides
// the province (postal code > address token > stored value > city > ON); lib/provinces/rules holds
// the 12 other jurisdictions, built only from facts verified against each official source. The
// numbers below are hard-coded from that fact sheet on purpose: a change has to be a deliberate
// edit in two places.
import { describe, expect, it } from 'vitest'
import {
  effectiveProvince, normalizeProvince, provinceFromPostal, provinceFromText, provinceName, provinceTokenIn,
} from '../lib/provinces/detect'
import {
  PROVINCE_RULES, aiFactsBlock, applyConsentText, checkListingComplianceFor, decisionNoticeFooterFor, humanRights,
  leaseFormGuidance, listingRulesNote, moveInRules, petBanAllowed, rulesFor, type ProvinceRules,
} from '../lib/provinces/rules'
import { checkListingCompliance, decisionNoticeFooter, type ListingInput } from '../lib/ontario/rules'

const CODES = Object.keys(PROVINCE_RULES) as Array<keyof typeof PROVINCE_RULES>

describe('which province a listing is in', () => {
  it('the Montréal listing stored as ON is Quebec (postal code H2L)', () => {
    expect(effectiveProvince({ province: 'ON', address: '1569 rue St-Hubert, Montréal, QC, H2L 3Z1', city: 'Montréal' })).toBe('QC')
    expect(effectiveProvince({ province: 'ON', address: '1569 rue St-Hubert', postal_code: 'H2L 3Z1' })).toBe('QC')
    // without a postal code or token, a valid stored province outranks the city dictionary
    expect(effectiveProvince({ address: '1569 rue St-Hubert, Montréal' })).toBe('QC')
    expect(effectiveProvince({ province: 'ON', address: '1569 rue St-Hubert, Montréal' })).toBe('ON')
  })
  it('postal codes: X0A/X0B/X0C Nunavut, X0E/X0G/X1A Northwest Territories, first letter elsewhere', () => {
    expect(provinceFromPostal('X0A 0H0')).toBe('NU')
    expect(provinceFromPostal('X0C')).toBe('NU')
    expect(provinceFromPostal('X1A 2P8')).toBe('NT')
    expect(provinceFromPostal('X0E 0N0')).toBe('NT')
    expect(provinceFromPostal('1 Main St, Halifax NS B3H 1A1')).toBe('NS')
    expect(provinceFromPostal('V6B1A1')).toBe('BC')
    expect(provinceFromPostal('T2P-1J9')).toBe('AB')
    expect(provinceFromPostal('M5V 2T6')).toBe('ON')
    expect(provinceFromPostal('A1C 5M2')).toBe('NL')
    expect(provinceFromPostal('C1A 4P3')).toBe('PE')
    expect(provinceFromPostal('E1C 4M3')).toBe('NB')
    expect(provinceFromPostal('R3C 0V8')).toBe('MB')
    expect(provinceFromPostal('S4P 3Y2')).toBe('SK')
    expect(provinceFromPostal('Y1A 2C6')).toBe('YT')
    expect(provinceFromPostal('Unit 1207, 1 King St W')).toBeNull()
  })
  it('Toronto, ON is Ontario; an empty row is Ontario', () => {
    expect(provinceFromText('100 King St W, Toronto, ON')).toBe('ON')
    expect(effectiveProvince({ address: '100 King St W, Toronto, ON' })).toBe('ON')
    expect(effectiveProvince({})).toBe('ON')
    expect(effectiveProvince(null)).toBe('ON')
    expect(effectiveProvince({ province: 'Foo', address: '12 Some Rd' })).toBe('ON')
  })
  it('precedence: postal > explicit token > stored province > city dictionary', () => {
    expect(effectiveProvince({ province: 'QC', address: '1 Yonge St, Toronto, ON M5E 1W7' })).toBe('ON')
    expect(effectiveProvince({ province: 'ON', address: '123 Main St, Calgary, AB' })).toBe('AB')
    expect(effectiveProvince({ province: 'BC', address: '12 Some Rd', city: 'Toronto' })).toBe('BC')
    expect(effectiveProvince({ address: '500 Main St', city: 'Winnipeg' })).toBe('MB')
    expect(effectiveProvince({ address: '1 Water St', city: 'Halifax' })).toBe('NS')
    expect(effectiveProvince({ address: '4920 52 St, Yellowknife' })).toBe('NT')
  })
  it('province names inside street names do not count', () => {
    expect(provinceTokenIn('123 Quebec Ave, Toronto')).toBeNull()
    expect(provinceFromText('123 Quebec Ave', 'Toronto')).toBe('ON')
    expect(provinceFromText('2000 rue Ontario Est, Montréal')).toBe('QC')
    expect(provinceTokenIn('2000 rue Ontario Est')).toBeNull()
    expect(provinceTokenIn('55 Ontario Place')).toBeNull()
    expect(provinceTokenIn('9 Alta Vista Dr, Ottawa')).toBeNull()
  })
  it('stored values in many spellings', () => {
    for (const [raw, code] of [
      ['QC', 'QC'], ['Québec', 'QC'], ['Quebec', 'QC'], ['PQ', 'QC'], ['魁北克省', 'QC'], ['Ont', 'ON'], ['Ontario', 'ON'], ['安省', 'ON'],
      ['B.C.', 'BC'], ['British Columbia', 'BC'], ['Colombie-Britannique', 'BC'], ['N.W.T.', 'NT'], ['P.E.I.', 'PE'], ['Nfld', 'NL'],
      ['Newfoundland and Labrador', 'NL'], ['Nouvelle-Écosse', 'NS'], ['Yukon', 'YT'], ['Nunavut', 'NU'], ['Sask', 'SK'], ['Alberta', 'AB'],
    ] as const) expect(normalizeProvince(raw), raw).toBe(code)
    for (const raw of ['', null, undefined, 'Foo', 'Canada']) expect(normalizeProvince(raw)).toBeNull()
  })
  it('names for display', () => {
    expect(provinceName('QC', 'zh')).toBe('魁北克省')
    expect(provinceName('QC', true)).toBe('魁北克省')
    expect(provinceName('ON', 'zh')).toBe('安大略省')
    expect(provinceName('ON', 'en')).toBe('Ontario')
    expect(provinceName('nunavut', false)).toBe('Nunavut')
  })
})

// Hard-coded from the verified fact sheet (province_facts.json, 2026-10-02).
const EXPECTED: Record<string, {
  deposit: number | false; pet: number | false; appFee: boolean | null | 'none'; petBan: boolean | null
  rent2026: number | null; copyDays: number | null; formMandatory: boolean; adverse: boolean
}> = {
  QC: { deposit: false, pet: false, appFee: null, petBan: true, rent2026: null, copyDays: 10, formMandatory: true, adverse: false },
  BC: { deposit: 0.5, pet: 0.5, appFee: false, petBan: true, rent2026: 2.3, copyDays: 21, formMandatory: false, adverse: true },
  AB: { deposit: 1, pet: 1, appFee: null, petBan: true, rent2026: null, copyDays: 21, formMandatory: false, adverse: false },
  MB: { deposit: 0.5, pet: 1, appFee: false, petBan: true, rent2026: 1.8, copyDays: 21, formMandatory: true, adverse: true },
  SK: { deposit: 1, pet: false, appFee: false, petBan: true, rent2026: null, copyDays: 20, formMandatory: false, adverse: true },
  NS: { deposit: 0.5, pet: false, appFee: false, petBan: true, rent2026: 5, copyDays: 10, formMandatory: true, adverse: true },
  NB: { deposit: 1, pet: false, appFee: 'none', petBan: true, rent2026: 3, copyDays: null, formMandatory: true, adverse: true },
  PE: { deposit: 1, pet: false, appFee: false, petBan: true, rent2026: 2, copyDays: 10, formMandatory: false, adverse: true },
  NL: { deposit: 0.75, pet: false, appFee: null, petBan: true, rent2026: null, copyDays: 10, formMandatory: false, adverse: false },
  YT: { deposit: 1, pet: 0.5, appFee: false, petBan: true, rent2026: 2.6, copyDays: 21, formMandatory: false, adverse: false },
  NT: { deposit: 1, pet: 0.5, appFee: false, petBan: true, rent2026: null, copyDays: 60, formMandatory: false, adverse: false },
  NU: { deposit: 1, pet: false, appFee: false, petBan: null, rent2026: null, copyDays: 60, formMandatory: false, adverse: false },
}

describe('every province matches the verified facts', () => {
  it('covers exactly the 12 jurisdictions outside Ontario', () => {
    expect(CODES.sort()).toEqual(Object.keys(EXPECTED).sort())
    expect(rulesFor('ON')).toBeNull()
  })
  for (const code of Object.keys(EXPECTED)) {
    it(code, () => {
      const e = EXPECTED[code]
      const r = rulesFor(code) as ProvinceRules
      expect(r.code).toBe(code)
      if (e.deposit === false) { expect(r.deposit.allowed).toBe(false); expect(r.deposit.maxMonths).toBe(0) }
      else { expect(r.deposit.allowed).toBe(true); expect(r.deposit.maxMonths).toBe(e.deposit) }
      if (e.pet === false) expect(r.petDeposit.allowed).toBe(false)
      else { expect(r.petDeposit.allowed).toBe(true); expect(r.petDeposit.maxMonths).toBe(e.pet) }
      if (e.appFee === 'none') expect(r.applicationFee).toBeNull()
      else expect(r.applicationFee?.allowed).toBe(e.appFee)
      expect(petBanAllowed(code)).toBe(e.petBan)
      expect(r.rentIncrease.pct2026).toBe(e.rent2026)
      expect(r.leaseForm.copyDays).toBe(e.copyDays)
      expect(r.leaseForm.mandatory).toBe(e.formMandatory)
      expect(!!r.adverseDecision).toBe(e.adverse)
      // every sourced item carries a citation and an official link
      for (const item of [r.statute, r.tribunal, r.deposit, r.petDeposit, r.keyOrOtherDeposits, r.advanceRent, r.rentIncrease, r.privacyLaw, r.leaseEnd]) {
        expect(item.cite.length).toBeGreaterThan(5)
        expect(item.url).toMatch(/^https:\/\//)
      }
    })
  }
  it('Quebec specifics: no deposit of any kind, first month only in advance, 2026 base 3.1%', () => {
    const m = moveInRules('QC')!
    expect(m.advanceRentMonths).toBe(1)
    expect(m.deposit).toEqual({ allowed: false, maxMonths: 0 })
    expect(m.keyDeposit.allowed).toBe(false)
    expect(m.petDeposit.allowed).toBe(false)
    const q = rulesFor('QC')!.quebec!
    expect(q.rent2026.basePct).toBe(3.1)
    expect(q.lowestRentNotice.lookbackMonths).toBe(12)
    expect(q.lowestRentNotice.tenantDays).toBe(10)
    expect(q.keyDeposit.allowed).toBe(false)
    expect(q.childrenPregnancy.cite).toContain('art. 1899')
    expect(q.leaseLanguage.cite).toContain('s. 55')
    expect(q.screeningLimits.zh).toContain('社会保险号')
  })
  it('the Quebec listing note says what the facts say', () => {
    const zh = listingRulesNote('QC', 'zh')!
    expect(zh).toContain('房东不能收取任何押金（包括钥匙押金和宠物押金）')
    expect(zh).toContain('最多只能预收第一个月租金')
    expect(zh).toContain('第 1904 条')
    expect(zh).toContain('魁北克住房行政法庭（TAL）')
    expect(zh).toContain('10 天内')
    expect(zh).toContain('第 1895 条')
    expect(listingRulesNote('QC', 'en')).toContain('Civil Code of Québec, art. 1904')
  })
  it('a topic without a verified fact is left out', () => {
    expect(listingRulesNote('NU', 'zh')).not.toMatch(/禁养|禁止养宠/)
    expect(listingRulesNote('NB', 'zh')).not.toMatch(/申请费|筛查费/)
    expect(aiFactsBlock('NU')).not.toContain('禁养宠物：')
    expect(aiFactsBlock('NB')).not.toContain('申请费：')
  })
})

// Every string a non-Ontario helper can produce, in both languages.
function allOutputs(): { zh: string[]; en: string[]; any: string[] } {
  const zh: string[] = []
  const en: string[] = []
  const any: string[] = []
  const walk = (v: unknown, key = ''): void => {
    if (typeof v === 'string') { any.push(v); if (key === 'zh') zh.push(v); else en.push(v); return }
    if (Array.isArray(v)) { v.forEach((x) => walk(x, key)); return }
    if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, k)
  }
  walk(PROVINCE_RULES)
  for (const code of CODES) {
    for (const lang of ['zh', 'en'] as const) {
      const bucket = lang === 'zh' ? zh : en
      const push = (s: string | null | undefined) => { if (s) { bucket.push(s); any.push(s) } }
      push(listingRulesNote(code, lang))
      push(applyConsentText(code, lang))
      push(applyConsentText(code, lang, { credit: true, retentionDays: 90 }))
      push(decisionNoticeFooterFor(code, lang))
      const h = humanRights(code, lang)!
      push(h.law); push(h.body); push(h.examples)
      const l = leaseFormGuidance(code, lang)!
      push(l.name); l.lines.forEach(push)
      const m = moveInRules(code)!
      m.notPermitted.forEach((x) => push(x[lang]))
      push(m.footnote?.[lang])
      push(provinceName(code, lang))
      for (const input of SAMPLE_INPUTS) for (const f of checkListingComplianceFor(code, input).findings) push(f.message[lang])
    }
    any.push(aiFactsBlock(code)!)
  }
  return { zh, en, any }
}

const SAMPLE_INPUTS: ListingInput[] = [
  { monthly_rent: 2225, deposit: 5000, key_deposit: 300, pets_allowed: 'no', description: 'Application fee $50. Pet deposit $300, cleaning deposit $200, pet fee $25/mo. First and last month’s rent required.' },
  { monthly_rent: 2225, deposit: 500, description: '申请费 $50，宠物押金 $300，清洁押金 $200，需预付最后一个月租金。' },
]

const ONTARIO_WORDS = /\bRTA\b|\bLTB\b|OHRC|RECO|TRESA|Ontario|安省|安大略/

describe('non-Ontario output never uses Ontario law or terms', () => {
  it('no RTA / LTB / OHRC / RECO / TRESA / Ontario / 安省 / 安大略 anywhere', () => {
    const { any } = allOutputs()
    expect(any.length).toBeGreaterThan(300)
    for (const s of any) expect(s, s.slice(0, 120)).not.toMatch(ONTARIO_WORDS)
  })
  it('Chinese strings carry no English words except names, citations and form numbers', () => {
    const ALLOWED = new Set(['TAL', 'CDPDJ', 'CAI', 'PIPA', 'PIPEDA', 'RTB', 'RTDRS', 'ORT', 'RTO', 'IRAC', 'Form', 'AI', 'Stayloop', 'privacy@stayloop.ai'])
    const { zh } = allOutputs()
    for (const s of zh) {
      const words = s.match(/[A-Za-z][A-Za-z.@-]*[A-Za-z]/g) || []
      for (const w of words) expect(ALLOWED.has(w), `${w} in: ${s.slice(0, 80)}`).toBe(true)
    }
  })
  it('English strings carry no Chinese', () => {
    const { en } = allOutputs()
    for (const s of en) expect(s, s.slice(0, 80)).not.toMatch(/\p{Script=Han}/u)
  })
})

describe('listing compliance by province', () => {
  it('Quebec blocks any deposit', () => {
    const r = checkListingComplianceFor('QC', { deposit: 500, monthly_rent: 2225 })
    expect(r.passed).toBe(false)
    expect(r.findings[0]).toMatchObject({ rule: 'QC-CCQ-1904-no-deposit', severity: 'block' })
    expect(r.findings[0].statute).toContain('art. 1904')
    expect(checkListingComplianceFor('QC', { monthly_rent: 2225, key_deposit: 50 }).passed).toBe(false)
    expect(checkListingComplianceFor('QC', { monthly_rent: 2225, deposit: null }).passed).toBe(true)
  })
  it('a pet ban is fine where the facts allow one (Quebec, BC)', () => {
    expect(checkListingComplianceFor('QC', { monthly_rent: 2225, pets_allowed: 'no' }).findings).toEqual([])
    expect(checkListingComplianceFor('BC', { monthly_rent: 2000, pets_allowed: 'no', description: 'No pets.' }).findings).toEqual([])
  })
  it('deposit caps follow each province', () => {
    expect(checkListingComplianceFor('BC', { monthly_rent: 2000, deposit: 1000 }).passed).toBe(true)
    expect(checkListingComplianceFor('BC', { monthly_rent: 2000, deposit: 1200 }).findings[0]).toMatchObject({ rule: 'BC-deposit-cap', severity: 'block' })
    expect(checkListingComplianceFor('NL', { monthly_rent: 2000, deposit: 1500 }).passed).toBe(true)
    expect(checkListingComplianceFor('NL', { monthly_rent: 2000, deposit: 1600 }).passed).toBe(false)
    expect(checkListingComplianceFor('SK', { monthly_rent: 2000, deposit: 2000 }).passed).toBe(true)
    // Alberta: key deposits share the one-month cap
    expect(checkListingComplianceFor('AB', { monthly_rent: 2000, deposit: 1500, key_deposit: 600 }).passed).toBe(false)
    expect(checkListingComplianceFor('AB', { monthly_rent: 2000, deposit: 1500, key_deposit: 400 }).passed).toBe(true)
    // Manitoba: no key deposit at all
    expect(checkListingComplianceFor('MB', { monthly_rent: 2000, deposit: 1000, key_deposit: 50 }).findings.map((f) => f.rule)).toContain('MB-no-key-deposit')
  })
  it('pet / cleaning deposits and fees where the facts prohibit them', () => {
    expect(checkListingComplianceFor('SK', { monthly_rent: 2000, description: 'Pet deposit $300' }).findings.map((f) => f.rule)).toContain('SK-no-pet-deposit')
    expect(checkListingComplianceFor('BC', { monthly_rent: 2000, description: 'Pet damage deposit $500' }).findings).toEqual([])
    expect(checkListingComplianceFor('NS', { monthly_rent: 2000, description: '清洁押金 $200' }).findings.map((f) => f.rule)).toContain('NS-no-cleaning-deposit')
    expect(checkListingComplianceFor('BC', { monthly_rent: 2000, description: 'Pet fee $25/mo' }).findings.map((f) => f.rule)).toContain('BC-no-pet-fee')
    expect(checkListingComplianceFor('AB', { monthly_rent: 2000, description: 'Pet fee $100' }).findings).toEqual([])
  })
  it('application fees: blocked where prohibited, a warning in Quebec, silent where the law is silent', () => {
    expect(checkListingComplianceFor('BC', { monthly_rent: 2000, description: 'Application fee $50' }).findings[0]).toMatchObject({ rule: 'BC-no-application-fee', severity: 'block' })
    const qc = checkListingComplianceFor('QC', { monthly_rent: 2225, application_fee: 30 })
    expect(qc.passed).toBe(true)
    expect(qc.findings[0]).toMatchObject({ rule: 'QC-application-fee', severity: 'warn' })
    expect(checkListingComplianceFor('AB', { monthly_rent: 2000, application_fee: 30 }).findings).toEqual([])
    expect(checkListingComplianceFor('NB', { monthly_rent: 2000, application_fee: 30 }).findings).toEqual([])
  })
  it('last month’s rent where it is prohibited', () => {
    expect(checkListingComplianceFor('SK', { monthly_rent: 2000, description: 'First and last month required' }).passed).toBe(false)
    expect(checkListingComplianceFor('QC', { monthly_rent: 2225, description: 'last month’s rent due at signing' }).findings[0].rule).toBe('QC-CCQ-1904-advance-rent')
  })
  it('Ontario delegates to the Ontario check unchanged', () => {
    for (const input of [...SAMPLE_INPUTS, { monthly_rent: 2225, deposit: 500 }, { monthly_rent: 2000, pets_allowed: 'no' }]) {
      expect(checkListingComplianceFor('ON', input)).toEqual(checkListingCompliance(input))
      expect(checkListingComplianceFor(null, input)).toEqual(checkListingCompliance(input))
    }
  })
})

describe('helpers keep Ontario on its own code path', () => {
  it('null / Ontario for every helper', () => {
    for (const code of ['ON', null, undefined, '', 'Ontario'] as const) {
      expect(rulesFor(code)).toBeNull()
      expect(listingRulesNote(code, 'zh')).toBeNull()
      expect(moveInRules(code)).toBeNull()
      expect(petBanAllowed(code)).toBeNull()
      expect(humanRights(code, 'zh')).toBeNull()
      expect(applyConsentText(code, 'zh')).toBeNull()
      expect(leaseFormGuidance(code, 'zh')).toBeNull()
      expect(aiFactsBlock(code)).toBeNull()
      expect(decisionNoticeFooterFor(code, 'zh')).toBe(decisionNoticeFooter('zh'))
      expect(decisionNoticeFooterFor(code, 'en')).toBe(decisionNoticeFooter('en'))
    }
  })
})

describe('applicant-facing text outside Ontario', () => {
  it('consent text: credit only when checked, the province’s human-rights law, Quebec’s ID rules', () => {
    const zh = applyConsentText('QC', 'zh')!
    expect(zh).toContain('（如勾选）在你同意的前提下获取你的信用报告')
    expect(zh).toContain('《魁北克人权与自由宪章》')
    expect(zh).toContain('不能复印')
    expect(zh).toContain('社会保险号')
    expect(applyConsentText('QC', 'zh', { credit: false })).not.toContain('信用报告')
    expect(applyConsentText('BC', 'en', { retentionDays: 90 })).toContain('Data is deleted after 90 days.')
    expect(applyConsentText('BC', 'zh')).not.toContain('社会保险号')
  })
  it('decision footer: the province’s human-rights and privacy law, and its verified adverse-decision right', () => {
    const qc = decisionNoticeFooterFor('QC', 'zh')
    expect(qc).toContain('本决定由房东本人作出')
    expect(qc).toContain('《魁北克人权与自由宪章》')
    expect(qc).toContain('第 27 条')
    expect(qc).toContain('privacy@stayloop.ai')
    expect(decisionNoticeFooterFor('BC', 'en')).toContain('Business Practices and Consumer Protection Act, s. 110')
    expect(decisionNoticeFooterFor('MB', 'zh')).toContain('《个人调查法》第 7 条')
    expect(decisionNoticeFooterFor('NU', 'en')).toContain('PIPEDA')
    expect(decisionNoticeFooterFor('AB', 'zh')).not.toMatch(/信用报告机构|征信机构/)
  })
  it('lease form: Quebec’s mandatory TAL form, Section G and the French rule', () => {
    const g = leaseFormGuidance('QC', 'zh')!
    expect(g.mandatory).toBe(true)
    expect(g.copyDays).toBe(10)
    expect(g.name).toContain('附表 5')
    expect(g.lines.join('')).toContain('G 部分')
    expect(g.lines.join('')).toContain('法文')
    expect(leaseFormGuidance('BC', 'en')!.lines.join(' ')).toContain('within 21 days')
  })
  it('the model fact pack is Chinese, cited and bounded', () => {
    const qc = aiFactsBlock('QC')!
    expect(qc).toContain('只可引用以下内容')
    expect(qc).toContain('第 1904 条')
    expect(qc).toContain('Civil Code of Québec, art. 1904')
    expect(qc).toContain('3.1%')
    expect(aiFactsBlock('BC')).toContain('2.3%')
  })
})
