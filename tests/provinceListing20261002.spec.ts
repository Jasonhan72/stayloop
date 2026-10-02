// 2026-10-02 · user: 「外省的要查外省的法规，不要用安省的法规和说法。，也不用特别加 一句话：
// 「安省租房规则不适用于这套房源（魁北克省）。」」 — the listing surfaces (detail page, rules note,
// move-in card, showing / question modal, application form, enrich route) use the listing's own
// province (lib/provinces) and never Ontario statutes, bodies or terms outside Ontario; Ontario's
// wording stays as it was. Also: the translation request no longer holds the transit /
// neighbourhood / similar sections (it is a call of its own, see tests/listingTranslations20261002.spec.ts).
import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => React.createElement('a', { href, ...rest }, children) }))
vi.mock('@/lib/supabase', () => ({ supabase: { auth: { getSession: async () => ({ data: { session: null } }) } }, getSupabaseBrowser: () => ({}) }))

import { ListingRulesNote } from '@/components/listing/ListingRulesNote'
import { MoveInCosts, depositIssue, depositNote, factCitation, monthsText, provinceMoveIn } from '@/components/listing/MoveInCosts'
import { ShowingRequestModal } from '@/components/ShowingRequestModal'
import { PROVINCE_CODES, applyConsentText, humanRights, listingRulesNote, rulesFor, type ProvinceCode } from '@/lib/provinces'
import { listingProvince } from '@/lib/listingDisplay'

const h = React.createElement
const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const page = read('app/listings/[slug]/page.tsx')
const apply = read('app/apply/[slug]/page.tsx')
const route = read('app/api/listings/enrich/route.ts')
const modalSrc = read('components/ShowingRequestModal.tsx')

const HAN = /[㐀-鿿]/
const OUTSIDE: ProvinceCode[] = PROVINCE_CODES.filter((c) => c !== 'ON')
// Ontario statutes, bodies and terms that must never reach a listing outside Ontario.
const ONTARIO_TERMS = /安省|安大略|Ontario|\bRTA\b|\bLTB\b|OHRC|RECO|TRESA|\bN\d{1,2}\b/

// The Montréal listing that started this (deposit not set, pets welcome).
const MONTREAL = { province: 'QC', address: '1569 rue St-Hubert, Montréal, QC, H2L 3Z1', city: 'Montréal', postal_code: null }

describe('no "Ontario rules do not apply" line, no raw-column province', () => {
  const files: string[] = []
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name)
      if (statSync(p).isDirectory()) walk(p)
      else if (/\.(tsx?|mjs|js)$/.test(name)) files.push(p)
    }
  }
  for (const d of ['app', 'components', 'lib']) walk(d)
  it('neither the helper nor the sentence survives anywhere', () => {
    for (const f of files) {
      const s = readFileSync(f, 'utf8')
      expect(s, f).not.toContain('ontarioRulesNotApplicable')
      expect(s, f).not.toMatch(/不适用于这套房源/)
      expect(s, f).not.toMatch(/do not apply to this listing/i)
    }
  })
  it('the Montréal listing is Quebec', () => {
    expect(listingProvince(MONTREAL)).toBe('QC')
  })
})

describe('ListingRulesNote', () => {
  const src = read('components/listing/ListingRulesNote.tsx')
  it('takes the derived province and calls lib/provinces; keeps its test id', () => {
    expect(src).toContain("import { listingRulesNote, type ProvinceCode } from '@/lib/provinces'")
    expect(src).toContain('province: ProvinceCode')
    expect(src).toContain("listingRulesNote(province, zh ? 'zh' : 'en')")
    expect(src).toContain('data-testid="listing-rules-note"')
    expect(src).not.toContain('isOntarioListing')
  })
  it('Ontario keeps its RTA note word for word', () => {
    const zh = renderToStaticMarkup(h(ListingRulesNote, { zh: true, province: 'ON' }))
    expect(zh).toContain('安省 RTA s.14：租约里的「禁止养宠」条款无效（共管大楼自身的规定除外）；押金只能是最后一月租金 + 钥匙押金（s.105–106、s.134）。')
    expect(renderToStaticMarkup(h(ListingRulesNote, { zh: false, province: 'ON' }))).toContain('Ontario RTA s.14: a “no pets” clause in a lease is void')
  })
  it('elsewhere: that province’s own note, in the UI language, no Ontario word', () => {
    for (const c of OUTSIDE) {
      for (const zh of [true, false]) {
        const html = renderToStaticMarkup(h(ListingRulesNote, { zh, province: c }))
        const note = listingRulesNote(c, zh ? 'zh' : 'en')
        if (!note) { expect(html, c).toBe(''); continue }
        expect(html, c).toContain('data-testid="listing-rules-note"')
        expect(html.replace(/&quot;/g, '"').replace(/&#x27;/g, "'"), c).toContain(note.slice(0, 30))
        expect(html, c).not.toMatch(ONTARIO_TERMS)
        if (!zh) expect(html, c).not.toMatch(HAN)
      }
    }
  })
})

describe('MoveInCosts', () => {
  const src = read('components/listing/MoveInCosts.tsx')
  it('takes the derived province and reads lib/provinces for every other province', () => {
    expect(src).toContain("from '@/lib/provinces'")
    expect(src).toContain('province: ProvinceCode')
    expect(src).toContain('moveInRules(province)')
    expect(src).not.toContain('isOntarioListing')
  })
  it('Ontario: the RTA card as before', () => {
    const html = renderToStaticMarkup(h(MoveInCosts, { zh: true, province: 'ON', rent: 2800, deposit: 3000 }))
    expect(html).toContain('租金押金（不超过一个月，只抵最后一月租金）')
    expect(html).toContain('安省 RTA s.106 规定租金押金不得超过一个月租金')
    expect(html).toContain('安省不允许收取：')
    expect(depositIssue('ON', 2800, 3000)).toBeNull() // the Ontario card checks itself
    expect(depositNote('ON', 2800, 3000, true)).toBeNull()
  })
  it('the Montréal listing: first month only, no deposit of any kind, total = one month', () => {
    const html = renderToStaticMarkup(h(MoveInCosts, { zh: true, province: 'QC', rent: 2225, deposit: null }))
    expect(html).toContain('首月租金（只能预收第一个月）')
    expect(html).toContain('押金（含钥匙押金、宠物押金）')
    expect(html).toContain('不得收取')
    expect(html).toContain('第一笔款合计')
    expect(html).toContain('$2,225')
    expect(html).toContain('魁北克省不允许：')
    expect(html).toContain('超过第一个月的预付租金')
    expect(html).not.toMatch(ONTARIO_TERMS)
    expect(html).not.toContain('bg-red-50') // no warning: no deposit is listed
    const en = renderToStaticMarkup(h(MoveInCosts, { zh: false, province: 'QC', rent: 2225, deposit: null }))
    expect(en).toContain('Not permitted in Quebec: ')
    expect(en).toContain('Not permitted')
    expect(en).not.toMatch(HAN)
    expect(en).not.toMatch(ONTARIO_TERMS)
  })
  it('a Quebec listing that states a deposit gets the red warning with the Civil Code citation; the total leaves it out', () => {
    expect(depositIssue('QC', 2225, 1000)).toEqual({ kind: 'not_allowed' })
    const v = provinceMoveIn('QC', 2225, 1000, true)!
    expect(v.warning).toBe('此房源标注了押金，但魁北克省不允许收取任何押金（《魁北克民法典》第 1904、1893 条）。请与房东确认。')
    expect(v.rows.find((r) => r.k.startsWith('押金'))).toMatchObject({ v: '$1,000', warn: true })
    expect(v.rows[v.rows.length - 1]).toMatchObject({ k: '第一笔款合计', v: '$2,225', strong: true })
    expect(depositNote('QC', 2225, 1000, true)).toBe('魁北克省不允许收取押金')
    expect(depositNote('QC', 2225, 1000, false)).toBe('Quebec does not allow a deposit')
    expect(depositNote('QC', 2225, null, true)).toBeNull()
  })
  it('British Columbia: half a month cap, separate pet damage deposit, refundable key fee', () => {
    expect(depositIssue('BC', 2000, 1500)).toEqual({ kind: 'over_cap', cap: 1000, months: 0.5 })
    expect(depositIssue('BC', 2000, 1000)).toBeNull()
    const v = provinceMoveIn('BC', 2000, 1500, true)!
    expect(v.rows.map((r) => r.k)).toEqual([
      '首月租金',
      '押金（最多半个月租金）',
      '宠物押金（只在养宠物时，最多半个月租金）',
      '钥匙或门禁卡费（可退，不超过更换成本）',
      '第一笔款合计',
    ])
    expect(v.warning).toBe('此房源标注的押金 $1,500 高于不列颠哥伦比亚省允许的上限：半个月租金（$1,000）（《住宅租赁法》第 19(1)、20、38(4) 条）。请与房东确认。')
    expect(v.rows[v.rows.length - 1].v).toBe('$3,500')
    expect(depositNote('BC', 2000, 1500, true)).toBe('超过不列颠哥伦比亚省的上限（半个月租金）')
  })
  it('Alberta: one deposit cap that pet and key deposits count toward; no strike list, only the footnote', () => {
    const v = provinceMoveIn('AB', 2000, null, true)!
    expect(v.rows.find((r) => r.k === '宠物押金')?.v).toBe('计入押金上限')
    expect(v.rows.find((r) => r.k === '钥匙押金')?.v).toBe('计入押金上限')
    expect(v.notPermittedLead).toBeNull()
    expect(v.footnote).toMatch(/^押金须在 2 个银行工作日内/)
  })
  it('every province outside Ontario: the card comes from its facts, one language, no Ontario word', () => {
    for (const c of OUTSIDE) {
      const r = rulesFor(c)!
      for (const dep of [null, 99_999]) {
        for (const zh of [true, false]) {
          const v = provinceMoveIn(c, 2000, dep, zh)!
          expect(v, c).not.toBeNull()
          const text = [...v.rows.flatMap((x) => [x.k, x.v]), v.warning, v.notPermittedLead, ...v.notPermitted, v.footnote].filter(Boolean).join(' | ')
          expect(text, c).not.toMatch(ONTARIO_TERMS)
          if (zh) for (const row of v.rows) expect(`${row.k} ${row.v}`, c).not.toMatch(/[A-Za-z]/)
          else expect(text, c).not.toMatch(HAN)
          // A deposit is warned about exactly when the province forbids it or it is over the cap.
          expect(!!v.warning, `${c} ${dep}`).toBe(dep != null)
          if (dep != null) expect(v.warning, c).toContain(factCitation(r.deposit[zh ? 'zh' : 'en'])!)
          // The deposit row says what the facts say.
          const depRow = v.rows[1]
          if (!r.deposit.allowed) expect(depRow.k.startsWith(zh ? '押金' : 'Deposit'), c).toBe(true)
          else expect(depRow.k, c).toContain(monthsText(r.deposit.maxMonths, zh))
        }
      }
      const html = renderToStaticMarkup(h(MoveInCosts, { zh: true, province: c, rent: 2000, deposit: null }))
      expect(html, c).toContain(`data-province="${c}"`)
      expect(html, c).not.toMatch(ONTARIO_TERMS)
    }
  })
  it('a citation is read from the end of the fact, brackets inside it kept', () => {
    expect(factCitation('……（《住宅租赁法》第 19(1)、20、38(4) 条）。')).toBe('《住宅租赁法》第 19(1)、20、38(4) 条')
    expect(factCitation('… (Residential Tenancy Act, ss. 19(1), 20, 38(4)).')).toBe('Residential Tenancy Act, ss. 19(1), 20, 38(4)')
    expect(factCitation('no citation here.')).toBeNull()
  })
})

describe('ShowingRequestModal', () => {
  const render = (province: ProvinceCode | undefined, zh: boolean) =>
    renderToStaticMarkup(h(ShowingRequestModal, { zh, kind: 'question', listingId: 'x', listingAddress: '1569 rue St-Hubert', signedIn: true, province, onClose: () => {} }))
  it('a new optional prop; Ontario (or none) keeps the OHRC sentence', () => {
    expect(modalSrc).toContain('province?: ProvinceCode | null')
    expect(modalSrc).toContain("humanRights(province, zh ? 'zh' : 'en')")
    for (const p of [undefined, 'ON'] as const) {
      expect(render(p, true)).toContain('按 OHRC 租房政策，看房与提问不需要、也不应提供家庭状况、国籍、收入来源等受保护信息。')
      expect(render(p, false)).toContain('Under OHRC housing policy')
    }
  })
  it('elsewhere: the province’s human-rights law and its protected grounds, no OHRC', () => {
    expect(render('QC', true)).toContain('看房与提问不需要、也不应提供受《魁北克人权与自由宪章》保护的个人信息，例如怀孕、有子女（民事状态）、领取社会救助（社会状况）。')
    for (const c of OUTSIDE) {
      for (const zh of [true, false]) {
        const html = render(c, zh).replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&')
        const hr = humanRights(c, zh ? 'zh' : 'en')!
        expect(html, c).toContain(hr.law)
        expect(html, c).toContain(hr.examples)
        expect(html, c).not.toMatch(ONTARIO_TERMS)
        if (!zh) expect(html, c).not.toMatch(HAN)
      }
    }
  })
})

describe('the listing detail page', () => {
  it('one derived province, passed to every province-aware piece; never the raw column for rules', () => {
    expect(page).toContain('const province = listingProvince(listing)')
    expect(page).toContain('<ListingRulesNote zh={zh} province={province} />')
    expect(page).toContain('<MoveInCosts zh={zh} province={province} rent={listing.monthly_rent} deposit={listing.deposit} />')
    expect(page).toMatch(/<ShowingRequestModal[\s\S]*?province=\{province\}[\s\S]*?\/>/)
    expect(page).not.toContain('isOntarioListing')
    expect(page).not.toMatch(/province=\{listing\.province\}/)
    // TRREB covers the Toronto region only
    expect(page).toContain("listingProvince(listing) === 'ON'")
  })
  it('pets, deposit and the contact label follow the province', () => {
    expect(page).toContain("petBanAllowed(province) === true ? (zh ? '不允许' : 'Not allowed') : zh ? '房东写「不允许」' : 'Listed as “no pets”'")
    expect(page).toContain('warn={depositNote(province, listing.monthly_rent, listing.deposit, zh)}')
    expect(page).toContain("landlordIsRegistrant && province === 'ON'")
  })
  it('the non-Ontario intent card and footnote stay neutral (no RECO, no Ontario)', () => {
    const i = page.indexOf(": province !== 'ON'\n")
    expect(i).toBeGreaterThan(0)
    const branch = page.slice(i, page.indexOf(': (zh', i + 30))
    expect(branch).not.toMatch(ONTARIO_TERMS)
    const j = page.indexOf("{listing.source !== 'realtor' && province !== 'ON'")
    expect(j).toBeGreaterThan(0)
    const foot = page.slice(j, page.indexOf(": listing.source !== 'realtor'", j))
    expect(foot).not.toMatch(ONTARIO_TERMS)
  })
})

describe('the application form', () => {
  it('reads the province with the listing and words the consent for it', () => {
    expect(apply).toContain(".select('id, landlord_id, source, address, unit, city, monthly_rent, bedrooms, bathrooms, images, title, province, postal_code')")
    expect(apply).toContain("const province: ProvinceCode = summary ? listingProvince(summary) : 'ON'")
    expect(apply).toContain("applyConsentText(province, zh ? 'zh' : 'en', { credit: 'if_checked', retentionDays: 90 })")
    // Ontario keeps its wording
    expect(apply).toContain('《安大略省人权法典》')
    expect(apply).toContain('Toronto / Ontario 合规')
    // and outside Ontario: city · province, no compliance claim
    expect(apply).toContain('cityOnly(summary?.city), provinceName(province, zh)]')
  })
  it('the consent text outside Ontario cites the province, not Ontario courts or the Ontario code', () => {
    for (const c of OUTSIDE) {
      for (const lang of ['zh', 'en'] as const) {
        const t = applyConsentText(c, lang, { credit: 'if_checked', retentionDays: 90 })
        expect(t, c).toBeTruthy()
        expect(t!, c).not.toMatch(ONTARIO_TERMS)
        expect(t!, c).toContain('90')
      }
    }
  })
  it('Quebec: no ID file (looked at, not copied), date of birth only for a consented credit check, employer and income optional, one line saying why', () => {
    expect(apply).toContain("return province === 'QC' ? FILE_KINDS.filter((k) => k.kind !== 'id') : FILE_KINDS")
    expect(apply).toContain('{fileKinds.map(({ kind, label, hint }) => (')
    expect(apply).not.toContain('{FILE_KINDS.map(')
    // ID files picked before the listing was read are dropped, and never uploaded
    expect(apply).toContain("setFiles((prev) => (prev.id.length ? { ...prev, id: [] } : prev))")
    expect(apply).toContain("filter((k) => collected.has(k)).forEach((k) =>")
    expect(apply).toContain("'出生日期（仅用于你同意的信用查询）'")
    // the employment status starts unanswered instead of pre-filled
    expect(apply).toContain("...(quebec ? [{ value: '', label: zh ? '不提供' : 'Prefer not to say' }] : [])")
    expect(apply).toContain("f.employment_status === 'Full-time employed' ? { ...f, employment_status: '' } : f")
    expect(apply).not.toMatch(/出生日期 \*/)
    expect(apply).toContain('<Input required={!quebec} value={form.employer_name}')
    expect(apply).toContain('<Input required={!quebec} type="number" value={form.monthly_income}')
    expect(apply).toContain('data-testid={quebec ? \'apply-quebec-limits\' : undefined}')
    expect(apply).toContain('不能复印、拍照或记录证件信息，所以这里不收证件文件（魁北克信息查阅委员会（CAI）指引）')
  })
  it('TRESA s.32 (Ontario) is asked only for an Ontario listing; PIPEDA named only where it is the law', () => {
    expect(apply).toContain('if (isOntario && registrant.profile && !disclosedRef.current && !createdAppIdRef.current) {')
    expect(apply).toContain("{zh ? (showPipeda ? '授权 · PIPEDA' : '授权') : showPipeda ? 'CONSENT · PIPEDA' : 'CONSENT'}")
    expect(apply).toMatch(/const showPipeda = provinceKnown && \(isOntario \|\| \/\^Personal Information Protection and Electronic Documents Act\//)
    // Quebec, BC and Alberta have their own private-sector laws
    for (const c of ['QC', 'BC', 'AB'] as const) expect(rulesFor(c)!.privacyLaw.cite, c).not.toMatch(/^Personal Information Protection and Electronic Documents Act/)
    expect(rulesFor('MB')!.privacyLaw.cite).toMatch(/^Personal Information Protection and Electronic Documents Act/)
  })
  it('the Realtor.ca branch is untouched', () => {
    expect(apply).toContain('data-testid="apply-realtor-refused"')
  })
})

describe('the enrich route', () => {
  it('geocoding and the primer use the listing’s real province; Ontario rows keep their stored value', () => {
    expect(route).toContain("return code === 'ON' ? (l.province || 'Ontario') : provinceName(code, 'en')")
    expect(route).toContain('${l.city}, ${provinceText(l)}')
    expect(route).toContain('generateProfile(svc, city, provinceText(l), hood, {')
    expect(route).not.toContain("l.province || 'Ontario', hood")
  })
})
