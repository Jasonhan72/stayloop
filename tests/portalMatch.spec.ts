// Ontario Courts Portal party matching (2026-09-12). Two real records were
// missed: "QUIROGA, LEONARDO" (five defendant-side cases; the court omitted
// the middle name) and "NATHALI, CRISTINE CIPRIANI CAMPINS" (open debtor
// record; one letter dropped by the clerk). The XIONG YI / ZHENG, YI XIONG
// false positive the old rule was written for must stay rejected.
import { describe, expect, it } from 'vitest'
import { matchPortalParty, tokensMatch, isRespondentSide, planPortalQueries, corroborateByCoParties } from '../lib/screening/portalMatch'
import { selectCoApplicantNames } from '../lib/screening/coApplicants'
import { reconcileScanFlags } from '../lib/forensics/scan-flags'

describe('matchPortalParty', () => {
  it('accepts a record that omits the middle name, as name-only', () => {
    const m = matchPortalParty('LEONARDO ALFREDO QUIROGA', 'LEONARDO QUIROGA', 'QUIROGA, LEONARDO')
    expect(m.match).toBe(true)
    expect(m.confidence).toBe('name_only')
  })
  it('rates a full three-token line-up as strong', () => {
    const m = matchPortalParty('LEONARDO ALFREDO QUIROGA', 'LEONARDO ALFREDO QUIROGA', 'QUIROGA, LEONARDO ALFREDO')
    expect(m.match).toBe(true)
    expect(m.confidence).toBe('strong')
  })
  it('tolerates one clerical slip in the first name and reads both surnames', () => {
    const m = matchPortalParty('NATHALIE CIPRIANI CAMPINS', 'NATHALI CRISTINE CIPRIANI CAMPINS', 'NATHALI, CRISTINE CIPRIANI CAMPINS')
    expect(m.match).toBe(true)
    expect(m.confidence).toBe('strong')
    expect(m.fuzzy).toBe(true)
  })
  it('still rejects a surname buried in someone else\'s given name', () => {
    expect(matchPortalParty('XIONG YI', 'YI XIONG ZHENG', 'ZHENG, YI XIONG').match).toBe(false)
  })
  it('rejects a different surname and a missing first name', () => {
    expect(matchPortalParty('DAVID PARK', 'DAVID PARKER', 'PARKER, DAVID').match).toBe(false)
    expect(matchPortalParty('DAVID PARK', 'JOHN PARK', 'PARK, JOHN').match).toBe(false)
    expect(matchPortalParty('DAVID PARK', 'DAVID', 'DAVID').match).toBe(false)
  })
  it('never fuzzes short tokens', () => {
    expect(tokensMatch('lee', 'lei').match).toBe(false)
    expect(tokensMatch('nathalie', 'nathali').match).toBe(true)
  })
  it('knows which side of a case is the applicant\'s risk', () => {
    expect(isRespondentSide('Respondent / Defendant')).toBe(true)
    expect(isRespondentSide('Debtor')).toBe(true)
    expect(isRespondentSide('Applicant / Plaintiff')).toBe(false)
  })
})

describe('co-applicant on an ID is never a third party', () => {
  it('keeps a co-applicant whose NOA (kind other) also carries the name', () => {
    const r = selectCoApplicantNames(
      ['NATHALIE CRISTINE CIPRIANI CAMPINS', 'LEONARDO ALFREDO QUIROGA'],
      'Nathalie Cipriani Campins',
      { idDocNames: ['CIPRIANI CAMPINS NATHALIE CRISTINE', 'QUIROGA LEONARDO ALFREDO'], thirdPartyNames: ['LEONARDO ALFREDO QUIROGA'] },
    )
    expect(r.searched).toEqual(['LEONARDO ALFREDO QUIROGA'])
  })
})

describe('scan flags yield to OCR content', () => {
  const ocr = { text: 'TD Canada Trust Statement of Account MISS NATHALIE CIPRIANI CAMPINS '.repeat(5), apparent_doc_type: 'bank statement', apparent_name: null, visible_issuer: 'TD Canada Trust', has_watermark: false, visible_dates: [], elapsed_ms: 1 }
  const flags = [
    { code: 'pdf_producer_unknown', severity: 'low' as const, evidence_en: '', evidence_zh: '' },
    { code: 'pdf_oversized_for_text', severity: 'medium' as const, evidence_en: '', evidence_zh: '' },
    { code: 'pdf_producer_consumer_tool', severity: 'critical' as const, evidence_en: '', evidence_zh: '' },
  ]
  it('withdraws text-PDF-only notes when the issuer is recognised, keeps editing evidence', () => {
    const out = reconcileScanFlags(flags, 'TD.pdf', 'bank_statement', ocr, { matched_bank: 'TD', bank_producer_whitelisted: false, equifax_authentic_markers: null, matched_payroll: null })
    const codes = out.map(f => f.code)
    expect(codes).not.toContain('pdf_oversized_for_text')
    expect(codes).not.toContain('pdf_producer_unknown')
    expect(codes).toContain('pdf_producer_consumer_tool')
    expect(codes).toContain('scan_content_recognized')
  })
  it('leaves flags alone when OCR found nothing recognisable', () => {
    const out = reconcileScanFlags(flags, 'x.pdf', 'bank_statement', { ...ocr, text: 'blurry', apparent_doc_type: 'unknown', visible_issuer: null }, null)
    expect(out).toEqual(flags)
  })
})

describe('query plan and co-party corroboration', () => {
  it('plans exact orders, first+each-surname, fuzzy full and fuzzy surnames for a three-token name', () => {
    const names = planPortalQueries('NATHALIE CIPRIANI CAMPINS').map(p => `${p.type === '10462' ? 'E' : 'F'}:${p.name}`)
    expect(names).toContain('E:NATHALIE CIPRIANI')
    expect(names).toContain('E:NATHALIE CAMPINS')
    expect(names).toContain('F:CIPRIANI CAMPINS')
    expect(planPortalQueries('DAVID PARK').some(p => p.type === '300054' && p.name === 'PARK')).toBe(false)
  })
  it('upgrades a name-only record that shares a co-party with a strong record', () => {
    const m = [
      { caseTitle: 'UMANA v. CZUPAJLO et al', matchConfidence: 'strong' as const },
      { caseTitle: 'CANADIAN IMPERIAL BANK OF COMMERCE v. CZUPAJLO et al', matchConfidence: 'name_only' as const },
      { caseTitle: 'HOME TRUST COMPANY v. QUIROGA', matchConfidence: 'name_only' as const },
    ]
    expect(corroborateByCoParties(m)).toBe(1)
    expect(m[1].matchConfidence).toBe('strong')
    expect(m[2].matchConfidence).toBe('name_only')
  })
})

// Review 2026-09-13 — a strong match is an auto-decline, so the fuzz must
// never promote a different person.
describe('strong is never handed to a different person', () => {
  it('a swapped letter on a three-token name stays name_only (MARIA ≠ MARIO)', () => {
    const m = matchPortalParty('MARIA JOSE GARCIA', 'MARIO JOSE GARCIA', 'GARCIA, MARIO JOSE')
    expect(m.match).toBe(true)
    expect(m.confidence).toBe('name_only')
  })
  it('a dropped letter on a three-token name is still the same person', () => {
    expect(matchPortalParty('NATHALIE CIPRIANI CAMPINS', 'NATHALI CIPRIANI CAMPINS', 'NATHALI, CIPRIANI CAMPINS').confidence).toBe('strong')
  })
  it('the applicant\'s own surname is not a shared co-party', () => {
    const ms = [
      { caseTitle: 'HOME TRUST COMPANY v. QUIROGA', matchConfidence: 'strong' as const },
      { caseTitle: 'PATEL v. QUIROGA', matchConfidence: 'name_only' as const },
    ]
    expect(corroborateByCoParties(ms, 'LEONARDO QUIROGA')).toBe(0)
    expect(ms[1].matchConfidence).toBe('name_only')
  })
})
