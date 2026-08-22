// The read-everything review (case 24): the model's output is whitelisted and
// every anomaly must carry verbatim evidence; anomalies surface but never
// gate; the rubric scores a proven-unreliable credit report as a hard
// negative instead of "808 — Excellent".
import { describe, expect, it } from 'vitest'
import { sanitizeCoherenceOutput, coherenceToFlags, coherenceToPromptBlock } from '../lib/screening/coherenceReview'
import { scoreRubric, type RubricFacts } from '../lib/screening/rubric'

describe('sanitizeCoherenceOutput', () => {
  it('keeps well-formed anomalies, drops those without verbatim evidence', () => {
    const r = sanitizeCoherenceOutput({
      documents: [{ file: 'Eq.pdf', kind: 'credit_report', summary_zh: 'x', summary_en: 'y', key_facts: { dob: '2003-02-27', dates: ['2026-03-27', '2026-05-27'] } }],
      anomalies: [
        { id: 'A1', category: 'impossibility', severity: 'critical', files: ['Eq.pdf'], claim_zh: '2岁开户', claim_en: 'Rogers account opened at age 2', evidence: ['ROGERS COMMUNICATION  2005/08/05', 'Date Of Birth 2003-xx-27'], check_zh: '核', check_en: 'pull fresh', confidence: 0.97 },
        { id: 'A2', category: 'cross_document', severity: 'high', files: ['Apnew .pdf'], claim_zh: '无依据', claim_en: 'no evidence given', evidence: [], confidence: 0.9 },
        { id: 'A3', category: 'nonsense', severity: 'extreme', files: 'x', claim_zh: '', claim_en: 'weird shapes', evidence: ['q'], confidence: 7 },
      ],
    }, 'claude-sonnet-4-6', 1234)
    expect(r.status).toBe('ok')
    expect(r.anomalies.map(a => a.id)).toEqual(['A1', 'A3'])     // A2 dropped: no evidence
    expect(r.anomalies[1].category).toBe('other')                 // unknown category whitelisted to other
    expect(r.anomalies[1].severity).toBe('medium')                // unknown severity → medium
    expect(r.anomalies[1].confidence).toBe(1)                     // clamped
    expect(r.documents[0].key_facts.dates).toEqual(['2026-03-27', '2026-05-27'])
  })
  it('tolerates garbage and caps counts', () => {
    expect(sanitizeCoherenceOutput(null, null, 0).anomalies).toHaveLength(0)
    const many = { anomalies: Array.from({ length: 40 }, (_, i) => ({ id: `A${i}`, category: 'other', severity: 'low', claim_en: 'c', evidence: ['e'] })) }
    expect(sanitizeCoherenceOutput(many, null, 0).anomalies).toHaveLength(20)
  })
})

describe('coherence anomalies surface but never gate', () => {
  const review = sanitizeCoherenceOutput({ anomalies: [
    { id: 'A1', category: 'impossibility', severity: 'critical', files: ['Eq.pdf'], claim_zh: 'x', claim_en: 'opened at age 2', evidence: ['2005/08/05'], check_zh: 'y', check_en: 'z', confidence: 0.9 },
  ] }, 'm', 1)
  it('flags carry LOW weight with the model severity in the text', () => {
    const flags = coherenceToFlags(review)
    expect(flags).toHaveLength(1)
    expect(flags[0].severity).toBe('low')
    expect(flags[0].code).toBe('coherence_impossibility')
    expect(flags[0].evidence_en).toContain('critical')
    expect(flags[0].evidence_en).toContain('"2005/08/05"')
  })
  it('prompt block is explicit about status when the review did not run', () => {
    expect(coherenceToPromptBlock({ status: 'failed', model: 'm', anomalies: [], documents: [], error: 'HTTP 529', elapsed_ms: 0 })).toMatch(/failed: HTTP 529/)
    expect(coherenceToPromptBlock(review)).toMatch(/CRITICAL · impossibility/)
  })
})

describe('rubric: proven-unreliable credit report', () => {
  const base: RubricFacts = {
    monthly_rent: 2100, claimed_monthly_income: 8000, verified_monthly_income: null,
    credit: { bureau: 'Equifax', credit_score: 808, report_date: '2026-05-27', tradelines: [], collections: [], bankruptcies: [], inquiries: [], total_debt: 35971, monthly_debt_payments: 798 },
    crossDoc: null, ltbCorroborated: 0, courtDefendantHits: 0, landlordRefs: 0, declaredAddresses: 1,
    documentKinds: ['credit_report'], contradictions: [], forgedDocuments: 0, blankApplicationFields: 0, applicationSigned: null, creditReportAgeDays: 80,
  } as unknown as RubricFacts
  it('an 808 report scores 95 when trusted…', () => {
    const r = scoreRubric(base)
    expect(r.dimensions.credit_health).toBeGreaterThanOrEqual(90)
  })
  it('…and 20 when a deterministic check proved it cannot be the applicant\'s', () => {
    const r = scoreRubric({ ...base, creditReportUnreliable: true })
    expect(r.dimensions.credit_health).toBe(20)
    expect(r.hits.some(h => h.code === 'credit_report_unreliable')).toBe(true)
    expect(r.hits.some(h => h.code === 'bureau_score')).toBe(false)
  })
})
