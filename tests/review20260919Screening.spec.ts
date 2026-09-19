// Review 2026-09-19 — screening slice. One guard per verified finding; every
// case here failed before its fix.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { scoreRubric, type RubricFacts } from '../lib/screening/rubric'
import { matchPortalParty, portalCourtDefendantHits, strongRespondentRecords } from '../lib/screening/portalMatch'
import { checkResidenceTimeline, footprintFromFacts, looksCanadian } from '../lib/screening/residenceTimeline'
import { analyzeCreditReport } from '../lib/screening/creditAnalysis'
import { datesAgree, parseDateLoose } from '../lib/screening/periods'
import { applicantDocNames, nameCovers, sameName, selectCoApplicantNames } from '../lib/screening/coApplicants'
import { courtHistoryQualifier, gateCapFor, identityNameVerdict, missingRequiredSections, stringFlags } from '../lib/screening/scoreGuards'
import { courtSourcesNotSearched, courtSummaryCheck } from '../lib/generateReport'
import type { CourtQuery, CreditReport } from '../lib/screening-types'

const root = join(__dirname, '..')

const BASE: RubricFacts = {
  monthly_rent: 2400, claimed_monthly_income: 8000, verified_monthly_income: 8000,
  credit: null, crossDoc: null, ltbCorroborated: 0, courtDefendantHits: 0,
  landlordRefs: 1, declaredAddresses: 1, documentKinds: ['id_document', 'pay_stub', 'bank_statement'],
  contradictions: [], forgedDocuments: 0, blankApplicationFields: 0, applicationSigned: true, creditReportAgeDays: null,
}

describe('1 · verified income with no target rent', () => {
  it('gets the verified floor (70) and is not an unknown dimension', () => {
    const r = scoreRubric({ ...BASE, monthly_rent: null })
    const hit = r.hits.find(h => h.dim === 'ability_to_pay' && h.delta >= 30 && /income/.test(h.code))!
    expect(hit.code).toBe('income_verified_no_rent')
    expect(hit.delta).toBe(70)
    expect(hit.observed).toMatch(/no target rent — ratio not computed/)
    expect(r.unknown).not.toContain('ability_to_pay')
    // never below what a verified earner at 1.0x rent gets
    const atOneX = scoreRubric({ ...BASE, monthly_rent: 8000 })
    expect(r.dimensions.ability_to_pay).toBeGreaterThanOrEqual(atOneX.dimensions.ability_to_pay)
  })
  it('claimed-only income with no rent is 35, and no income at all is still unknown', () => {
    const claimed = scoreRubric({ ...BASE, monthly_rent: null, verified_monthly_income: null })
    expect(claimed.hits.find(h => h.code === 'income_unverified')?.delta).toBe(35)
    expect(claimed.unknown).not.toContain('ability_to_pay')
    const none = scoreRubric({ ...BASE, monthly_rent: null, verified_monthly_income: null, claimed_monthly_income: null })
    expect(none.hits.find(h => h.code === 'income_unknown')?.delta).toBe(30)
    expect(none.unknown).toContain('ability_to_pay')
  })
})

describe('2 · a record token satisfies one query token', () => {
  it('"Lin Lin Zhang" vs "ZHANG, LIN" is a namesake, not a strong match', () => {
    const m = matchPortalParty('Lin Lin Zhang', 'Lin Zhang', 'ZHANG, LIN')
    expect(m.match).toBe(true)
    expect(m.confidence).toBe('name_only')
    expect(m.matched).toBe(2)
  })
  it('the full repeated name on the record is still strong', () => {
    const m = matchPortalParty('Lin Lin Zhang', 'Lin Lin Zhang', 'ZHANG, LIN LIN')
    expect(m.confidence).toBe('strong')
    expect(m.matched).toBe(3)
  })
  it('an exact token is not used up by another token\'s clerical variant', () => {
    const m = matchPortalParty('Maria Mario Garcia', 'Mario Maria Garcia', 'GARCIA, MARIO MARIA')
    expect(m.matched).toBe(3)
    expect(m.fuzzy).toBe(false)
  })
})

describe('3 · a source that did not answer is not a clean source', () => {
  const q = (source: string, status: CourtQuery['status'], extra: Partial<CourtQuery> = {}): CourtQuery => ({ source, tier: 'free', status, hits: status === 'ok' ? 0 : null, ...extra })
  const portalDown: CourtQuery[] = [
    q('CanLII', 'unavailable', { url: 'https://www.canlii.org/en/#search/text=x' }),
    q('Ontario Courts Portal — Civil & Small Claims', 'unavailable'),
    q('LTB Order Catalogue — Ontario Open Data', 'ok'),
    { source: 'Stayloop Verified Network', tier: 'pro', status: 'coming_soon', hits: null },
  ]
  it('portal unavailable + LTB ok → warn, never "clear"', () => {
    const zh = courtSummaryCheck({ queries: portalDown, totalHits: 0, courtRiskGate: false, zh: true })
    expect(zh.status).toBe('warn')
    expect(zh.detail).toContain('1 个数据源未能检索 — 不代表无记录')
    expect(zh.detail).not.toContain('无记录）')
    const en = courtSummaryCheck({ queries: portalDown, totalHits: 0, courtRiskGate: false, zh: false })
    expect(en.detail).toContain('1 source(s) could not be searched — not a clean result')
  })
  it('timeout and skipped count; the manual CanLII row and separators do not', () => {
    const qs = [q('── Sam Lee ──', 'ok'), q('CanLII (Sam Lee)', 'unavailable', { url: 'https://x' }), q('Ontario Courts Portal — Civil & Small Claims', 'timeout'), q('LTB Order Catalogue — Ontario Open Data (Sam Lee)', 'skipped')]
    expect(courtSourcesNotSearched(qs).map(x => x.status)).toEqual(['timeout', 'skipped'])
  })
  it('all sources answered → pass; a court gate stays fail', () => {
    const ok = [q('CanLII (via public web index)', 'ok'), q('Ontario Courts Portal — Civil & Small Claims', 'ok'), q('LTB Order Catalogue — Ontario Open Data', 'ok')]
    expect(courtSummaryCheck({ queries: ok, totalHits: 0, courtRiskGate: false, zh: false })).toEqual({ status: 'pass', detail: '3 sources searched, clear' })
    expect(courtSummaryCheck({ queries: portalDown, totalHits: 2, courtRiskGate: true, zh: false }).status).toBe('fail')
  })
  it('the report page uses the same helper', () => {
    const src = readFileSync(join(root, 'app/screening/[id]/report/page.tsx'), 'utf8')
    expect(src).toContain('courtSourcesNotSearched(courtQueries)')
    expect(src).toContain('不代表无记录')
  })
})

describe('4 · strong respondent-side portal records are counted, and said to be', () => {
  const recs = [
    { partyRole: 'Defendant', matchConfidence: 'strong' as const },
    { partyRole: 'Debtor', matchConfidence: 'strong' as const },
    { partyRole: 'Plaintiff', matchConfidence: 'strong' as const },
    { partyRole: 'Defendant', matchConfidence: 'name_only' as const },
  ]
  it('courtDefendantHits comes from strong respondent-side records only', () => {
    expect(strongRespondentRecords(recs)).toHaveLength(2)
    expect(portalCourtDefendantHits(recs)).toBe(2)
    expect(portalCourtDefendantHits([recs[0]])).toBe(1)
    expect(portalCourtDefendantHits([recs[2], recs[3]])).toBe(0)
    expect(portalCourtDefendantHits(null)).toBe(0)
  })
  it('the rubric prices them in rental history without touching the LTB input', () => {
    const clean = scoreRubric(BASE)
    const sued = scoreRubric({ ...BASE, courtDefendantHits: portalCourtDefendantHits(recs) })
    expect(sued.dimensions.rental_history).toBeLessThan(clean.dimensions.rental_history)
    expect(sued.hits.some(h => h.code === 'ltb_order_corroborated')).toBe(false)
  })
  it('the details sentence no longer says "not scored" when a gate fired', () => {
    const strong = courtHistoryQualifier(2, 1)
    expect(strong.zh).toContain('全名匹配')
    expect(strong.zh).toContain('硬门槛')
    expect(strong.en).toMatch(/full-name matches/)
    expect(strong.en).toMatch(/hard gate/)
    expect(strong.en).toMatch(/1 further name-only/)
    expect(strong.en).not.toMatch(/^name-only/)
    const weak = courtHistoryQualifier(0, 3)
    expect(weak.zh).toContain('未计入评分')
    expect(weak.en).toMatch(/Not scored/)
  })
  it('the route feeds the rubric from the portal helper, not a literal 0', () => {
    const src = readFileSync(join(root, 'app/api/screen-score/route.ts'), 'utf8')
    expect(src).not.toMatch(/courtDefendantHits:\s*0\b/)
    expect(src.match(/courtDefendantHits: portalCourtDefendantHits\(/g)?.length).toBe(2)
  })
})

describe('5 · a domestic mover is not a returning expatriate', () => {
  const footprint = footprintFromFacts({
    tradelines: [{ creditor: 'TD VISA', date_opened: '2019/04/01' }, { creditor: 'ROGERS', date_opened: '2021/02/01' }],
    inquiries: [{ date: '2024/03/01', creditor: 'CERTN', hard: false }],
  })
  it('"Relocating for work" + "55 Bloor St W, Toronto" raises nothing', () => {
    expect(checkResidenceTimeline({ residences: [{ address: '55 Bloor St W, Toronto', period: '2016 to 2026' }], vacating_reason: 'Relocating for work', applicantNames: ['Sam Lee'], footprint, today: new Date('2026-09-19') })).toEqual([])
    // and "relocating" alone no longer turns a street-only address into "abroad"
    expect(checkResidenceTimeline({ residences: [{ address: '6269 Ash St', period: '2016 to 2026' }], vacating_reason: 'Relocating / immigrating for work', applicantNames: ['Sam Lee'], footprint, today: new Date('2026-09-19') })).toEqual([])
  })
  it('a known Canadian city without a foreign marker is Canadian; ambiguous or marked ones are not', () => {
    expect(looksCanadian('55 Bloor St W, Toronto')).toBe(true)
    expect(looksCanadian('100 City Centre Dr, Mississauga')).toBe(true)
    expect(looksCanadian('12 High St, London')).toBe(false)
    expect(looksCanadian('Kingston 6, Jamaica')).toBe(false)
    expect(looksCanadian('1 Main St, Cambridge, MA 02139')).toBe(false)
  })
  it('the explicit return still fires', () => {
    expect(checkResidenceTimeline({ residences: [{ address: '6269 Ash St', period: '2016 to 2026' }], vacating_reason: 'moving back to Canada', applicantNames: ['Sam Lee'], footprint, today: new Date('2026-09-19') }).map(f => f.code)).toContain('cross_doc_residence_timeline_contradiction')
  })
})

describe('6 · a name that cannot be compared is not an inconsistent identity', () => {
  const matches = (n: string, ref: string) => sameName(n, ref) || nameCovers(n, ref)
  const ids = ['WANG XIAOMING']
  it('blank / single-token / CJK typed names fall back to the extracted name', () => {
    for (const typed of ['', 'Xiaoming', '王小明']) {
      expect(identityNameVerdict({ idDocNames: ids, applicantName: typed, extractedName: 'Xiaoming Wang', matches })).toBe(true)
    }
  })
  it('with nothing comparable there is no verdict — never false', () => {
    expect(identityNameVerdict({ idDocNames: ids, applicantName: '王小明', extractedName: null, matches })).toBeNull()
    expect(identityNameVerdict({ idDocNames: ids, applicantName: '', extractedName: '王小明', matches })).toBeNull()
    expect(identityNameVerdict({ idDocNames: [], applicantName: 'Sam Lee', matches })).toBeNull()
  })
  it('a comparable typed name still decides, both ways', () => {
    expect(identityNameVerdict({ idDocNames: ids, applicantName: 'Xiaoming Wang', extractedName: 'Someone Else', matches })).toBe(true)
    expect(identityNameVerdict({ idDocNames: ids, applicantName: 'Sam Lee', extractedName: 'Xiaoming Wang', matches })).toBe(false)
  })
})

describe('7 · a stream that ended without its stop event is held to the truncation rule', () => {
  const salvaged = { scores: { ability_to_pay: 80 }, flags: [], compliance_audit: {}, sub_coverage: {} }
  it('dropped connection (no message_stop, no max_tokens) reports the missing sections', () => {
    expect(missingRequiredSections(salvaged, { stopReason: '', sawMessageStop: false })).toEqual(['hard_gates_triggered', 'action_items', 'summary_zh', 'summary_en'])
  })
  it('max_tokens behaves as before; a clean stop is not second-guessed here', () => {
    expect(missingRequiredSections(salvaged, { stopReason: 'max_tokens', sawMessageStop: true })).toHaveLength(4)
    expect(missingRequiredSections(salvaged, { stopReason: 'end_turn', sawMessageStop: true })).toEqual([])
    const full = { ...salvaged, hard_gates_triggered: [], action_items: [], summary_zh: '', summary_en: '' }
    expect(missingRequiredSections(full, { stopReason: '', sawMessageStop: false })).toEqual([])
  })
  it('the route no longer gates the check on max_tokens alone', () => {
    const src = readFileSync(join(root, 'app/api/screen-score/route.ts'), 'utf8')
    expect(src).toContain('missingRequiredSections(parsed, { stopReason, sawMessageStop })')
    expect(src).not.toContain('REQUIRED_ON_TRUNCATION')
  })
})

describe('8 · the gate cap is taken when it is applied', () => {
  const CAPS = { doc_tampering: 30, court_record_defendant: 35 }
  it('a gate pushed after the first read still caps', () => {
    const gates: string[] = []
    const early = gateCapFor(gates, CAPS)
    gates.push('doc_tampering')
    expect(early).toBe(100)
    expect(gateCapFor(gates, CAPS)).toBe(30)
    expect(gateCapFor(['unknown_gate', 'toString'], CAPS)).toBe(100)
  })
  it('the route recomputes immediately before the overall score', () => {
    const src = readFileSync(join(root, 'app/api/screen-score/route.ts'), 'utf8')
    const i = src.indexOf('gateCap = gateCapFor(hardGates, HARD_GATE_CAPS)')
    const j = src.indexOf('let overall = Math.round(')
    expect(i).toBeGreaterThan(0)
    expect(j).toBeGreaterThan(i)
    expect(j - i).toBeLessThan(200)
  })
})

describe('9 · inquiry dates as bureaus print them', () => {
  const cr = (inquiries: Array<{ date: string; creditor: string }>): CreditReport => ({
    credit_score: 700, report_date: '2024-10-15', tradelines: [], inquiries,
  } as unknown as CreditReport)
  it('"Oct 02, 2024", "09/01/2024" and "Aug 2024" are inside the 12-month window', () => {
    const a = analyzeCreditReport(cr([
      { date: 'Oct 02, 2024', creditor: 'A' }, { date: '09/01/2024', creditor: 'B' }, { date: 'Aug 2024', creditor: 'C' },
      { date: 'Jul 15, 2024', creditor: 'D' }, { date: '06/20/2024', creditor: 'E' }, { date: 'Jan 05, 2021', creditor: 'OLD' },
    ]))!
    expect(a.inquiries12mo).toBe(5)
    expect(a.inquiriesApprox).toBe(false)
    expect(a.flags.some(f => /No derived risk signals/.test(f.en))).toBe(false)
  })
  it('an unreadable date is counted, and the count is marked approximate', () => {
    const a = analyzeCreditReport(cr([{ date: '2024-09-01', creditor: 'A' }, { date: 'see page 3', creditor: 'B' }]))!
    expect(a.inquiries12mo).toBe(2)
    expect(a.inquiriesApprox).toBe(true)
    expect(a.flags.some(f => /approximate/.test(f.en))).toBe(true)
  })
})

describe('10 · the application form does not put a landlord "on an ID"', () => {
  const docs = [
    { kind: 'id_document', key_facts: { names: ['SAM LEE'] } },
    { kind: 'application_form', key_facts: { names: ['Sam Lee', 'Jane Owner'] } },
  ]
  it('ID names only — the landlord printed on the form is dropped as a third party', () => {
    const third = ['Jane Owner']
    const idNames = applicantDocNames(docs, third)
    expect(idNames).toEqual(['SAM LEE'])
    const sel = selectCoApplicantNames(['Sam Lee', 'Jane Owner'], 'Sam Lee', { idDocNames: idNames, thirdPartyNames: third })
    expect(sel.searched).toEqual([])
    expect(sel.dropped.find(d => d.name === 'Jane Owner')?.reason).toBe('third_party')
  })
  it('with no ID in the file the form still narrows, minus known third parties', () => {
    expect(applicantDocNames([docs[1], { kind: 'application_form', key_facts: { names: ['Ana Lee'] } }], ['Jane Owner'])).toEqual(['Sam Lee', 'Ana Lee'])
  })
})

describe('11 · communication is not shown as a scored dimension', () => {
  for (const page of ['app/screening/[id]/done/page.tsx', 'app/screening/[id]/graph/page.tsx']) {
    it(page, () => {
      const src = readFileSync(join(root, page), 'utf8')
      expect(src).not.toMatch(/^\s*communication:/m)
      expect(src).toContain("k !== 'communication'")
    })
  }
})

describe('12 · non-string model output does not throw', () => {
  it('red flags keep strings only', () => {
    expect(stringFlags(['a', { code: 'b' }, null, 3, '', 'forensics_x'])).toEqual(['a', 'forensics_x'])
    expect(stringFlags('nope')).toEqual([])
    const src = readFileSync(join(root, 'app/api/screen-score/route.ts'), 'utf8')
    expect(src).toContain('const redFlags: string[] = stringFlags(parsed.red_flags)')
  })
  it('esc() in the print report coerces its input', () => {
    const src = readFileSync(join(root, 'lib/generateReport.ts'), 'utf8')
    expect(src).toMatch(/function esc\(s: unknown\): string \{[\s\S]{0,160}String\(s \?\? ''\)\.replace/)
  })
})

describe('13 · an ambiguous slash date is not a conflict', () => {
  it("'03/09/1985' agrees with '1985-09-03' and with '1985-03-09'", () => {
    const slash = parseDateLoose('03/09/1985')!
    expect(datesAgree([slash, parseDateLoose('1985-09-03')!])).toBe(true)
    expect(datesAgree([slash, parseDateLoose('1985-03-09')!])).toBe(true)
  })
  it('a real difference is still a conflict, and an unambiguous slash date is read one way', () => {
    expect(datesAgree([parseDateLoose('03/09/1985')!, parseDateLoose('1985-09-04')!])).toBe(false)
    expect(datesAgree([parseDateLoose('03/09/1985')!, parseDateLoose('1986-09-03')!])).toBe(false)
    expect(datesAgree([parseDateLoose('05/14/1979')!, parseDateLoose('1979-05-14')!])).toBe(true)
    expect(datesAgree([parseDateLoose('05/14/1979')!, parseDateLoose('1979-04-15')!])).toBe(false)
  })
})
