// Legal-content review of the out-of-province rules (2026-10-02, stage 3). Every statement for a
// province outside Ontario must match its verified fact — same meaning, numbers and citation —
// and say nothing beyond it. Each block below is one finding of that review.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  PROVINCE_RULES, applyConsentText, checkListingComplianceFor, decisionNoticeFooterFor, leaseFormGuidance, rulesFor,
} from '../lib/provinces/rules'
import { listingCheckItemsFor } from '../lib/listingPublish'
import { provinceMoveIn } from '../components/listing/MoveInCosts'
import { applyGuardrail, sanitizeDraftListing } from '../lib/agent/guardrail'

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8')
const HAN = /[一-鿿]/
const ONTARIO_TERMS = /安省|安大略|Ontario|\bRTA\b|\bLTB\b|OHRC|RECO|TRESA|\bN\d{1,2}\b/

describe('Quebec: Section G exemptions are art. 1955 (CCQ art. 1896, 2nd para.: “articles 1955 to 1956”)', () => {
  it('the lease-form line cites 1955 next to 1896 and 1950', () => {
    const zh = leaseFormGuidance('QC', 'zh')!.lines.join('')
    const en = leaseFormGuidance('QC', 'en')!.lines.join(' ')
    expect(zh).toContain('低租金住房除外（第 1896、1950、1955 条）')
    expect(en).toContain('exempt (arts. 1896, 1950, 1955)')
  })
  it('lease end: renewed on the same conditions and for the same term (art. 1941)', () => {
    expect(PROVINCE_RULES.QC.leaseEnd.zh).toContain('按相同条件、相同期限自动续约')
    expect(PROVINCE_RULES.QC.leaseEnd.en).toContain('on the same conditions and for the same term')
  })
})

describe('Quebec application: P-39.1 s. 8 notice (purpose, access, possible processing outside Québec)', () => {
  it('both languages carry it, with the Act and sections named', () => {
    const zh = applyConsentText('QC', 'zh')!
    const en = applyConsentText('QC', 'en')!
    expect(zh).toContain('这些信息用于评估你的租房申请')
    expect(zh).toContain('信息可能在魁北克以外处理')
    expect(zh).toContain('《私营部门个人信息保护法》第 8、27 条')
    expect(en).toContain('it may be processed outside Québec')
    expect(en).toContain('ss. 8, 27')
    expect(en).not.toMatch(HAN)
    expect(applyConsentText('BC', 'zh')).not.toContain('魁北克以外')
  })
  it('a credit-check fee is a “reasonable fee” (Juridiqc), not an “actual cost”', () => {
    const f = checkListingComplianceFor('QC', { monthly_rent: 2225, description: 'Application fee $50' }).findings
    const hit = f.find((x) => x.rule === 'QC-application-fee')!
    expect(hit.severity).toBe('warn')
    expect(hit.message.zh).toContain('信用查询费只能是合理费用')
    expect(hit.message.zh).not.toContain('实际成本')
    expect(hit.message.en).toContain('a reasonable fee')
  })
})

describe('Quebec: a deposit stated in the copy is caught; "no deposit" is not', () => {
  it('blocks "Security deposit: one month" and 「押金一个月」, passes "No deposit"', () => {
    const block = (description: string) => checkListingComplianceFor('QC', { monthly_rent: 2225, deposit: null, description }).findings.some((x) => x.rule === 'QC-CCQ-1904-no-deposit')
    expect(block('Security deposit: one month')).toBe(true)
    expect(block('押金一个月')).toBe(true)
    expect(block('No deposit — first month only.')).toBe(false)
    expect(block('不收押金，只收第一个月租金。')).toBe(false)
    expect(block('Bright 2BR near UQAM.')).toBe(false)
  })
})

describe('outside Quebec, "damage deposit" is the security deposit itself — not a separate deposit', () => {
  it('British Columbia / Saskatchewan copy saying "Damage deposit" is not blocked; a cleaning deposit still is', () => {
    for (const code of ['BC', 'SK', 'MB', 'NS'] as const) {
      const damage = checkListingComplianceFor(code, { monthly_rent: 2000, deposit: 500, description: 'Damage deposit: $500.' }).findings
      expect(damage.some((x) => /no-cleaning-deposit/.test(x.rule)), code).toBe(false)
      const cleaning = checkListingComplianceFor(code, { monthly_rent: 2000, deposit: 500, description: 'Cleaning deposit $200 at move-in.' }).findings
      expect(cleaning.some((x) => x.rule === `${code}-no-cleaning-deposit`), code).toBe(true)
      expect(cleaning.find((x) => x.rule === `${code}-no-cleaning-deposit`)!.message.zh).not.toContain('损坏')
    }
  })
  it('the publish check names only the cleaning deposit', () => {
    const labels = (listingCheckItemsFor('BC', 'zh') ?? []).map((i) => i.label).join(' ')
    expect(labels).toContain('清洁押金')
    expect(labels).not.toContain('损坏押金')
  })
})

describe('Northwest Territories: application fees only "appear to be prohibited" (s. 14.2(1))', () => {
  it('the check warns in hedged words; the strike-through list states the statute, not the inference', () => {
    const f = checkListingComplianceFor('NT', { monthly_rent: 2000, description: 'Application fee $25' }).findings
    const hit = f.find((x) => x.rule === 'NT-no-application-fee')!
    expect(hit.severity).toBe('warn')
    expect(hit.message.zh).toContain('看来包括此类费用')
    expect(hit.message.en).toContain('appears to cover such a fee')
    expect(rulesFor('NT')!.notPermitted.map((x) => x.zh).join(' ')).not.toContain('申请费')
    expect(rulesFor('NT')!.notPermitted.map((x) => x.zh).join(' ')).toContain('以订约为条件')
    // Nunavut's fact states the ban outright: still a block there.
    expect(checkListingComplianceFor('NU', { monthly_rent: 2000, description: 'Application fee $25' }).findings.find((x) => x.rule === 'NU-no-application-fee')!.severity).toBe('block')
  })
})

describe('Manitoba', () => {
  it('the Act allows a tenant services deposit too: the strike-through names the keys rule instead', () => {
    const items = rulesFor('MB')!.notPermitted
    expect(items.map((x) => x.zh)).toContain('交钥匙或车库遥控器前收取的费用或押金')
    expect(items.map((x) => x.en).join(' ')).not.toContain('any deposit other than the security and pet damage deposits')
  })
  it('periodic notice takes effect no earlier than the last day of the next period (s. 87(2))', () => {
    expect(PROVINCE_RULES.MB.leaseEnd.zh).toContain('最早于下一期最后一天生效')
    expect(PROVINCE_RULES.MB.leaseEnd.en).toContain('no earlier than the last day of the next one')
  })
})

describe('wording', () => {
  it('the PIPEDA access line says whose information (a landlord or platform)', () => {
    const f = decisionNoticeFooterFor('MB', 'zh')
    expect(f).toContain('房东或平台持有的你的个人信息')
    expect(decisionNoticeFooterFor('MB', 'en')).toContain('the personal information a landlord or platform holds about you')
  })
  it('the move-in strike-through lead reads 「不允许：」 (the list includes "requiring post-dated cheques")', () => {
    expect(provinceMoveIn('QC', 2225, null, true)!.notPermittedLead).toBe('魁北克省不允许：')
    expect(provinceMoveIn('QC', 2225, null, false)!.notPermittedLead).toBe('Not permitted in Quebec: ')
  })
  it('guardrail notes outside Ontario do not nest brackets around the examples', () => {
    const r = applyGuardrail('landlord', { reply: '我们不租给有孩子的家庭。', proposed_action: null } as never, 'zh', 'QC')
    const note = r.out.reply
    expect(note).toContain('按《魁北克人权与自由宪章》')
    expect(note).not.toMatch(/（如[^）]*（/)
    expect(note).not.toMatch(ONTARIO_TERMS)
    const d = sanitizeDraftListing({ address: '1569 rue St-Hubert, Montréal, QC, H2L 3Z1', description: 'No children.' } as never, 'zh', 'QC')
    expect(d.note ?? '').not.toMatch(/（例如[^）]*（/)
    expect(d.note ?? '').not.toMatch(ONTARIO_TERMS)
  })
})

describe('surfaces tied to a listing outside Ontario that the first pass missed', () => {
  it('the tenant application page names no Ontario lease or statute for a listing elsewhere; Ontario text kept', () => {
    const src = read('app/tenant/applications/[id]/page.tsx')
    expect(src).toContain("rulesFor(effectiveProvince({ address: app.listing_address }))")
    expect(src).toContain("'已录取。房东会和你联系签订租约。'")
    expect(src).toContain('(rules.adverseDecision ?? rules.privacyLaw.access)')
    // Ontario wording unchanged
    expect(src).toContain("'已录取。房东会把安省标准租约发到你的邮箱，凭链接签署。'")
    expect(src).toContain('你有权在 60 天内索取所依据信息的性质与来源（《消费者报告法》s.10(7)）；申请时提供的材料不会被用于其他目的。')
  })
  it("the landlord's showing card names the listing province's human-rights law; Ontario keeps the OHRC note", () => {
    const src = read('app/api/showing-intent/route.ts')
    expect(src).toContain("const OHRC_NOTE = ' 按 OHRC 租房政策，看房与回答提问不得因受保护特征区别对待。'")
    expect(src).toContain('rightsNoteFor(listing)')
    expect(src).not.toMatch(/\+ OHRC_NOTE|\$\{OHRC_NOTE\}/)
    expect(src).toContain('city, postal_code, province')
  })
  it('a Realtor.ca listing outside Ontario does not offer RECO-verified agents', () => {
    const src = read('app/listings/[slug]/page.tsx')
    expect(src).toContain("listing.source === 'realtor' && province !== 'ON'")
    expect(src).toContain('请直接联系房源的挂牌经纪。')
    expect(src).toContain('Contact the listing brokerage directly.')
    expect((src.match(/\) : province !== 'ON' \? null : \(/g) ?? []).length).toBe(2)
  })
  it("the policies grid shows a Quebec deposit as 「不得收取」, not 「房东未设置」", () => {
    expect(read('app/listings/[slug]/page.tsx')).toContain("rulesFor(province)?.deposit.allowed === false ? (zh ? '不得收取' : 'Not permitted')")
  })
  it('the tenant agent also gets the province boundary (no out-of-province facts reach it)', () => {
    expect(read('lib/agent/prompts.ts')).toContain('tenant: PROVINCE_SCOPE_TENANT')
  })
})

describe('English strings carry no Chinese, Chinese strings no Ontario terms (all 12 jurisdictions)', () => {
  it('consent, footer, not-permitted list', () => {
    for (const code of Object.keys(PROVINCE_RULES) as Array<keyof typeof PROVINCE_RULES>) {
      for (const s of [applyConsentText(code, 'en')!, decisionNoticeFooterFor(code, 'en'), ...rulesFor(code)!.notPermitted.map((x) => x.en)]) {
        expect(s, code).not.toMatch(HAN)
        expect(s, code).not.toMatch(ONTARIO_TERMS)
      }
      for (const s of [applyConsentText(code, 'zh')!, decisionNoticeFooterFor(code, 'zh'), ...rulesFor(code)!.notPermitted.map((x) => x.zh)]) {
        expect(s, code).not.toMatch(ONTARIO_TERMS)
      }
    }
  })
})
