import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { checkLeaseTerms, checkListingCompliance, decisionNoticeFooter, ONTARIO_RULES, ruleById } from '../lib/ontario/rules'
import { buildLeaseInvite, leaseSendPreflight } from '../lib/lease/sendLease'

// Lifecycle closed loop + Trust API rebuild (design/lifecycle-and-trust-api-plan-2026-09.md,
// user 2026-09-23: "把上面的都开始修改"). Guards for the rules registry, the
// new executors, preview/undo, and the three v1 endpoints.

describe('Ontario rules single source', () => {
  it('registry ids are unique and every rule has a statute + both languages', () => {
    const ids = ONTARIO_RULES.map((r) => r.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const r of ONTARIO_RULES) { expect(r.statute.length).toBeGreaterThan(3); expect(r.title.zh && r.title.en && r.summary.zh && r.summary.en).toBeTruthy() }
    expect(ruleById('RTA-106-deposit-cap')?.severity).toBe('block')
  })
  it('listing compliance: deposit cap, pet bans (setting or copy), fees and pet/cleaning deposits', () => {
    expect(checkListingCompliance({ monthly_rent: 2450, deposit: 2450 }).passed).toBe(true)
    const r = checkListingCompliance({ monthly_rent: 2450, deposit: 4900, pets_allowed: 'no', description: 'Bright 1+1, $50 application fee, pet deposit $300' })
    expect(r.passed).toBe(false)
    expect(r.findings.map((f) => f.rule).sort()).toEqual(['RTA-106-deposit-cap', 'RTA-134-no-fees', 'RTA-134-no-fees', 'RTA-14-no-pet-clause'])
    expect(checkListingCompliance({ description: '不允许养宠物' }).findings[0].rule).toBe('RTA-14-no-pet-clause')
    expect(checkListingCompliance({ description: 'pet friendly, no application fee ever' }).findings.map((f) => f.rule)).toContain('RTA-134-no-fees')
  })
  it('lease terms: TRREB is only a warning, pet ban in Schedule B blocks, dates must be ordered', () => {
    expect(checkLeaseTerms({ rent_amount: 2000, deposit_amount: 2000, form_type: 'trreb' }).passed).toBe(true)
    expect(checkLeaseTerms({ rent_amount: 2000, form_type: 'trreb' }).findings[0].severity).toBe('warn')
    expect(checkLeaseTerms({ rent_amount: 2000, schedule_b: 'No pets allowed in the unit.' }).passed).toBe(false)
    expect(checkLeaseTerms({ rent_amount: 2000, start_date: '2026-11-01', end_date: '2026-10-01' }).passed).toBe(false)
  })
  it('decision notices always carry the s.10(7) right and the OHRC statement', () => {
    for (const l of ['zh', 'en'] as const) { const f = decisionNoticeFooter(l); expect(f).toMatch(/10\(7\)/); expect(f).toMatch(/60/); expect(f).toMatch(/privacy@stayloop\.ai/) }
  })
})

describe('lease send library', () => {
  const base = { id: 'l', landlord_id: 'x', form_type: 'ontario_standard', status: 'draft', terms: { landlord_legal_name: 'A', rent: { amount: 2000 } }, tenant_name: 'Mia', tenant_email: 'mia@example.com', unit_label: 'Unit 1', sign_token: null, landlord_signature: null, tenant_signature: null }
  it('preflight refuses missing email, already-signed, incomplete terms', () => {
    expect(leaseSendPreflight(base).ok).toBe(true)
    expect(leaseSendPreflight({ ...base, tenant_email: null }).ok).toBe(false)
    expect(leaseSendPreflight({ ...base, tenant_signature: { x: 1 } }).ok).toBe(false)
    expect(leaseSendPreflight({ ...base, terms: {} }).ok).toBe(false)
  })
  it('invite escapes landlord-typed fields in HTML and keeps the link', () => {
    const m = buildLeaseInvite({ ...base, tenant_name: '<b>Mia</b>' }, 'https://www.stayloop.ai/lease/sign/tok')
    expect(m.html).toContain('&lt;b&gt;Mia&lt;/b&gt;')
    expect(m.text).toContain('https://www.stayloop.ai/lease/sign/tok')
  })
})

describe('executors, preview and undo', () => {
  const execute = readFileSync('app/api/agent/execute/route.ts', 'utf8')
  const hook = readFileSync('lib/agent/useAgentSession.ts', 'utf8')
  const card = readFileSync('components/agent/ApprovalActionCard.tsx', 'utf8')
  it('send_decision + send_lease executors exist; preview never claims or sends', () => {
    expect(execute).toMatch(/case 'send_decision':/)
    expect(execute).toMatch(/case 'send_lease':/)
    expect(execute).toMatch(/const preview = body\.preview === true/)
    // every mail executor returns the preview BEFORE claimExecution
    for (const fn of ['executeSendMessage', 'executeRentReminder', 'executeShowingRequest', 'executeSendDecision', 'executeSendLease']) {
      const i = execute.indexOf(`async function ${fn}`)
      const body = execute.slice(i, execute.indexOf('\n}\n', i))
      expect(body.indexOf('if (preview)'), fn).toBeGreaterThan(0)
      expect(body.indexOf('if (preview)'), fn).toBeLessThan(body.indexOf('claimExecution'))
    }
    // send_decision: recipient is the application row's email, footer is the statutory one
    expect(execute).toMatch(/decisionNoticeFooter\('zh'\)/)
    expect(execute).toMatch(/const to = String\(app\.email \|\| ''\)\.trim\(\)/)
  })
  it('approval executes after a 60s undo window; undo puts the row back to pending and audits', () => {
    expect(hook).toMatch(/const UNDO_MS = 60_000/)
    expect(hook).toMatch(/action: 'approval_undone'/)
    expect(hook).toMatch(/\.update\(\{ status: 'pending' \}\)\.eq\('id', actionId\)\.eq\('status', 'approved'\)\.is\('executed_at', null\)/)
    expect(card).toMatch(/preview: true/)
  })
})

describe('closed loop wiring', () => {
  it('application → screening route copies the manifest and links application_id; the screening app scores ?run=1', () => {
    const r = readFileSync('app/api/screening/from-application/route.ts', 'utf8')
    expect(r).toMatch(/application_id: appId/)
    expect(r).toMatch(/consent_screening not ticked/)
    const app = readFileSync('app/screening/app/page.tsx', 'utf8')
    expect(app).toMatch(/async function runAnalysis\(existing\?: \{ id: string; fileCount: number \}\)/)
    expect(app).toMatch(/qs\.get\('run'\) === '1'/)
  })
  it('a fully executed lease creates a verified household, first rent row and tenant invite', () => {
    const s = readFileSync('app/api/lease/sign/route.ts', 'utf8')
    expect(s).toMatch(/source: 'esign', verified: true/)
    expect(s).toMatch(/from\('household_invites'\)\.insert/)
    expect(s).toMatch(/from\('rent_payments'\)\.insert/)
  })
  it('applicant page: one-click screening + decision notice card', () => {
    const s = readFileSync('app/landlord/applicants/[id]/page.tsx', 'utf8')
    expect(s).toMatch(/\/api\/screening\/from-application/)
    expect(s).toMatch(/action_type: 'send_decision'/)
    expect(s).toMatch(/<ApprovalActionCard action=\{noticeCard\} compact/)
  })
})

describe('Trust API v1', () => {
  it('compliance endpoint is anonymous, rate-limited, stores no listing text', () => {
    const s = readFileSync('app/api/v1/listings/compliance/route.ts', 'utf8')
    expect(s).toMatch(/underHourlyLimit\(`compliance:\$\{ip\}`, 120, true\)/)
    expect(s).toMatch(/source: 'compliance_api', rule_id: f\.rule, severity: f\.severity, metadata: \{\} /)
  })
  it('passport verify needs a partner key, an applicant token with api_scopes, and returns conclusions only', () => {
    const s = readFileSync('app/api/v1/passport/verify/route.ts', 'utf8')
    expect(s).toMatch(/api_key_hash/)
    expect(s).toMatch(/the applicant has not enabled API access/)
    expect(s).not.toMatch(/createSignedUrl|id_doc_path|storage\.from/)
    expect(s).toMatch(/trust_api_passport_verify/)
  })
  it('screen endpoint requires consent + bound landlord and runs screen-score in partner mode', () => {
    const s = readFileSync('app/api/v1/screen/route.ts', 'utf8')
    expect(s).toMatch(/consent required/)
    expect(s).toMatch(/not bound to a landlord account/)
    expect(s).toMatch(/'x-partner-key': apiKey/)
    const ss = readFileSync('app/api/screen-score/route.ts', 'utf8')
    expect(ss).toMatch(/partnerLandlordId && screening\.landlord_id !== partnerLandlordId/)
  })
  it('docs page lists exactly the three live endpoints and no fake base URL', () => {
    const d = readFileSync('app/trust-api/docs/page.tsx', 'utf8')
    expect(d).not.toMatch(/api\.stayloop\.ai|disputes\/mediate|npm/)
    for (const e of ['/listings/compliance', '/passport/verify', '/screen']) expect(d).toContain(`POST ${e}`)
  })
})
