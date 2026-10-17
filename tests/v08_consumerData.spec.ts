// V0.8 · 消费者索取档案 / 争议更正 / 身份警示 — G19 guards (2026-10-17).
// Pure-function tests on lib/consumer/*, plus source guards on the migration,
// the applicant-side routes (anonymous + token), the admin route, and the three
// existing routes / the share page that gained a write.
// Contract: design/consumer-file-access-contract-2026-10.md.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { addBusinessDays, businessDaysBetween } from '@/lib/consumer/businessDays'
import { classify, dobMatches, editDistance1, nameMatches, nameTokens } from '@/lib/consumer/match'
import { buildDisclosurePack, canonicalJson, filterToApplicantNames, packFingerprint, type BuildPackInput, type PackScreeningRow } from '@/lib/consumer/pack'
import { renderDisclosurePack, rightsParagraph } from '@/lib/consumer/render'
import { alertBanner, alertPublic } from '@/lib/consumer/alerts'
import { constantTimeEqual, maskEmail, normalizeEmail } from '@/lib/consumer/server'
import type { ConsumerRequest } from '@/lib/consumer/types'

const read = (p: string) => readFileSync(p, 'utf8')

describe('businessDays', () => {
  it('Friday + 2 business days = Tuesday; weekends are skipped', () => {
    expect(addBusinessDays(new Date('2026-10-16T15:00:00Z'), 2).toISOString()).toBe('2026-10-20T15:00:00.000Z') // Fri → Tue
    expect(addBusinessDays(new Date('2026-10-12T09:00:00Z'), 2).toISOString()).toBe('2026-10-14T09:00:00.000Z') // Mon → Wed
    expect(addBusinessDays(new Date('2026-10-17T09:00:00Z'), 1).toISOString()).toBe('2026-10-19T09:00:00.000Z') // Sat → Mon
    expect(addBusinessDays(new Date('2026-10-16T15:00:00Z'), 0).toISOString()).toBe('2026-10-16T15:00:00.000Z')
  })
  it('businessDaysBetween counts weekdays only, signed', () => {
    expect(businessDaysBetween(new Date('2026-10-16T00:00:00Z'), new Date('2026-10-20T00:00:00Z'))).toBe(2)
    expect(businessDaysBetween(new Date('2026-10-20T00:00:00Z'), new Date('2026-10-16T00:00:00Z'))).toBe(-2)
  })
})

describe('match: names, DOB, classification', () => {
  it('nameTokens: NFKC, accents stripped, CJK runs whole', () => {
    expect(nameTokens('Carlos Regueiro Rodríguez')).toEqual(['carlos', 'regueiro', 'rodriguez'])
    expect(nameTokens('陈美雅')).toEqual(['陈美雅'])
    expect(nameTokens('ＭＩＡ　Chen')).toEqual(['mia', 'chen'])
  })
  it('editDistance1', () => {
    expect(editDistance1('nathali', 'nathalie')).toBe(true)
    expect(editDistance1('maria', 'mario')).toBe(true)
    expect(editDistance1('maria', 'marcos')).toBe(false)
  })
  it('nameMatches: first and last token each hit one of the file names', () => {
    expect(nameMatches('Mia Chen', { tenant_name: 'MIA CHEN' })).toBe(true)
    expect(nameMatches('Mia Chen', { tenant_name: 'Chen, Mia' })).toBe(true)
    expect(nameMatches('Mia Chen', { first_name: 'Mia', last_name: 'Chen' })).toBe(true)
    expect(nameMatches('Mia Chen', { ai_extracted_name: 'Mia Jade Chen' })).toBe(true)
    expect(nameMatches('Mia Chen', { tenant_name: 'Mia Wong' })).toBe(false)
    expect(nameMatches('Mia Chen', { tenant_name: 'Sarah Wang', ai_extracted_name: 'David Park' })).toBe(false)
    // one typo in a ≥5-letter token is a clerk's error, not another person
    expect(nameMatches('Nathali Cipriani', { tenant_name: 'Nathalie Cipriani' })).toBe(true)
    // short tokens get no tolerance
    expect(nameMatches('Mia Chen', { tenant_name: 'Mio Chen' })).toBe(false)
    expect(nameMatches('Carlos Rodriguez', { tenant_name: 'Carlos Regueiro Rodríguez' })).toBe(true)
  })
  it('nameMatches: a single Latin token is never enough; a single CJK name must match whole', () => {
    expect(nameMatches('Chen', { tenant_name: 'Mia Chen' })).toBe(false)
    expect(nameMatches('陈美雅', { tenant_name: '陈美雅' })).toBe(true)
    expect(nameMatches('陈美雅', { tenant_name: '陈美' })).toBe(false)
    expect(nameMatches('', { tenant_name: 'Mia Chen' })).toBe(false)
    expect(nameMatches('Mia Chen', {})).toBe(false)
  })
  it('dobMatches: equal when both present; not judged when either is missing', () => {
    expect(dobMatches('1990-05-14', '1990-05-14')).toBe(true)
    expect(dobMatches('1990-05-14', '1990-05-15')).toBe(false)
    expect(dobMatches('1990-05-14', '1990-05-14T00:00:00')).toBe(true)
    expect(dobMatches(null, '1990-05-14')).toBe(true)
    expect(dobMatches('1990-05-14', null)).toBe(true)
    expect(dobMatches('garbage', '1990-05-14')).toBe(true)
  })
  it('classify: matched needs a name hit without a DOB conflict; anything else is for a human', () => {
    expect(classify([{ screening_id: 'a', name_ok: true, dob_ok: null }])).toEqual({ status: 'matched', matched: ['a'], unmatched: [] })
    expect(classify([{ screening_id: 'a', name_ok: true, dob_ok: true }, { screening_id: 'b', name_ok: false, dob_ok: null }])).toEqual({ status: 'matched', matched: ['a'], unmatched: ['b'] })
    expect(classify([{ screening_id: 'a', name_ok: true, dob_ok: false }]).status).toBe('needs_review')
    expect(classify([{ screening_id: 'a', name_ok: false, dob_ok: true }]).status).toBe('needs_review')
    expect(classify([]).status).toBe('needs_review')
  })
  it('findCandidateScreenings only walks the three email chains — never a name search', () => {
    const m = read('lib/consumer/match.ts')
    const fn = m.slice(m.indexOf('export async function findCandidateScreenings'), m.indexOf('// ── name / dob'))
    expect(fn).toContain("from('applications').select('id').ilike('email'")
    expect(fn).toContain("from('verification_requests').select('screening_id').ilike('tenant_email'")
    expect(fn).toContain("from('agent_intake_submissions').select('screening_id').ilike('applicant_email'")
    expect(fn).not.toMatch(/tenant_name|ai_extracted_name|full_name/)
  })
})

// ── disclosure pack ───────────────────────────────────────────────────────────

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const APP = '33333333-3333-4333-8333-333333333333'

function screeningRow(id: string, extra: Partial<PackScreeningRow> = {}): PackScreeningRow {
  return {
    id,
    created_at: '2026-10-01T12:00:00Z',
    scored_at: '2026-10-01T12:10:00Z',
    landlord_id: 'll-1',
    tenant_name: 'Mia Chen',
    ai_extracted_name: 'Mia Chen',
    ai_score: 82,
    v3_tier: 'approve',
    ai_summary_zh: '材料齐全，收入与租金比例合理。',
    ai_summary_en: 'Complete package; income supports the rent.',
    ai_dimension_notes: {
      _v3: {
        extracted_names: ['Mia Chen', 'John Signatory (HR Manager)', 'Sarah Wang', 'Kevin Tran'],
        detected_monthly_income: 6200,
        coherence_review: {
          documents: [
            { file: 'id.pdf', kind: 'id_document', key_facts: { names: ['Mia Chen', 'Kevin Tran'], addresses: ['1207-100 King St W, Toronto'] } },
            { file: 'letter.pdf', kind: 'employment_letter', key_facts: { names: ['Mia Chen'], employer: 'Acme Logistics Inc.', employment_start: '2024-03-01' } },
            { file: 'ref.pdf', kind: 'reference_letter', key_facts: { names: ['Sarah Wang'], employer: 'Wang Holdings', addresses: ['9 Elsewhere Rd'] } },
          ],
        },
        ltb_check: { status: 'ok', as_respondent: [{ file_number: 'TEL-12345', document_id: 'd1', order_date: '2025-02-01', application_codes: ['L1'], unit_address: '5 Other St' }], corroborated: [] },
        credit_report: { score: 712, bureau: 'Equifax', report_date: '2026-09-20' },
      },
    },
    hard_gates_triggered: ['identity_mismatch'],
    red_flags: ['cross_doc_contradictions'],
    forensics_detail: { all_flags: [{ code: 'pdf_producer_consumer_tool', severity: 'medium', file: 'paystub.pdf', evidence_en: 'Producer: Canva', evidence_zh: '生成工具：Canva' }, { code: 'payroll_processor_recognized', severity: 'info', evidence_en: 'ADP', evidence_zh: 'ADP' }] },
    court_records_detail: { queries: [
      { source: 'Ontario Courts Portal — Civil & Small Claims', status: 'ok', hits: 1, portalRecords: [{ caseNumber: 'CV-26-0001', caseTitle: 'Bank v. Chen', partyRole: 'Defendant', filedDate: '2026-01-05', closedFlag: false, matchConfidence: 'name_only' }] },
      { source: 'CanLII (via public web index)', status: 'unavailable', hits: null, note: "CanLII's API has no name search" },
    ] },
    verification: { id: { status: 'verified', provider: 'veriff' }, bank: { status: 'verified', provider: 'flinks', sandbox: true } },
    files: [{ kind: 'paystub', name: 'paystub.pdf', path: 'x/paystub.pdf' }],
    notes: 'Listing: 100 King St W #1207',
    application_id: APP,
    notice_confirmed_how: 'application_consent',
    landlord: { full_name: 'Sarah Wang', email: 'sarah@example.com', phone: '416-555-0100' },
    ...extra,
  }
}

const request: Pick<ConsumerRequest, 'id' | 'email' | 'name' | 'matched_screening_ids'> = { id: 'req-1', email: 'mia@example.com', name: 'Mia Chen', matched_screening_ids: [A] }

function packInput(): BuildPackInput {
  return {
    request,
    screenings: [screeningRow(A), screeningRow(B, { tenant_name: 'Other Person', ai_extracted_name: 'Other Person', notes: 'Listing: 9 Secret Lane', landlord: { full_name: 'Hidden Landlord', email: null, phone: null } })],
    applications: [{ id: APP, first_name: 'Mia', last_name: 'Chen', listing: { address: '100 King St W', unit: '1207', city: 'Toronto' } }],
    verifications: [],
    corrections: [{ id: 'c1', screening_id: A, dispute_id: 'd1', item_kind: 'public_record', item_ref: 'portal:CV-26-0001', item_label: 'Ontario Courts Portal record', action: 'supplemented', note: 'Applicant is not the defendant; same-name namesake confirmed.', created_by: null, created_at: '2026-10-10T10:00:00Z' }, { id: 'c2', screening_id: B, dispute_id: null, item_kind: null, item_ref: null, item_label: 'other file', action: 'deleted', note: null, created_by: null, created_at: '2026-10-10T10:00:00Z' }],
    viewers: [{ name: 'Sarah Wang', role: 'landlord', phone: '416-555-0100', email: 'sarah@example.com', when: '2026-10-01T12:10:00Z', what: 'screening report' }, { name: 'Share link opened', role: 'share_link', phone: null, email: null, when: '2026-10-05T09:00:00Z', what: 'passport share page' }],
    recipients: [{ name: 'Sarah Wang', role: 'landlord', phone: '416-555-0100', email: 'sarah@example.com', received_at: '2026-10-01T12:10:00Z', screening_id: A }, { name: 'Hidden Landlord', role: 'landlord', phone: null, email: null, received_at: '2026-10-01T12:10:00Z', screening_id: B }],
    alerts: [{ id: 'al1', email: 'mia@example.com', name: 'Mia Chen', statement: 'My identity was misused in 2025.', created_at: '2026-10-02T00:00:00Z', expires_at: '2032-10-02T00:00:00Z', revoked_at: null, request_id: 'req-1' }],
    lang: 'zh',
    now: new Date('2026-10-17T12:00:00Z'),
  }
}

describe('buildDisclosurePack', () => {
  it('contains only matched screenings — a row handed in that was not matched is dropped', () => {
    const pack = buildDisclosurePack(packInput())
    expect(pack.screenings.map((s) => s.screening_id)).toEqual([A])
    const json = JSON.stringify(pack)
    expect(json).not.toContain(B)
    expect(json).not.toContain('Secret Lane')
    expect(json).not.toContain('Hidden Landlord')
    expect(json).not.toContain('Other Person')
    // recipients / corrections of the unmatched screening are gone too
    expect(pack.recipients.every((r) => r.screening_id === A)).toBe(true)
    expect(pack.screenings[0].corrections.map((c) => c.id)).toEqual(['c1'])
  })
  it('lists no third person: HR signatories and declared landlords are filtered, the co-applicant on the ID stays', () => {
    const pack = buildDisclosurePack(packInput())
    const json = JSON.stringify(pack.screenings[0].items)
    expect(json).not.toContain('Signatory')
    expect(json).not.toContain('Sarah Wang') // Sarah is the landlord (viewers), never an item
    expect(json).not.toContain('Wang Holdings')
    expect(json).not.toContain('Elsewhere')
    expect(json).toContain('Mia Chen')
    expect(json).toContain('Kevin Tran') // on the ID document → co-applicant
    expect(json).toContain('Acme Logistics Inc.')
    expect(filterToApplicantNames(['Mia Chen', 'HR Person'], 'Mia Chen', [])).toEqual(['Mia Chen'])
  })
  it('signals are plain labels (never raw codes), info-level forensics are left out, public records are marked unverified unless corroborated', () => {
    const s = buildDisclosurePack(packInput()).screenings[0]
    const labels = s.items.map((i) => i.label)
    expect(labels).toContain('各文件身份不一致')
    expect(labels).toContain('文件之间有矛盾')
    expect(labels).toContain('PDF 由消费级编辑工具生成')
    expect(labels.join(' ')).not.toMatch(/identity_mismatch|cross_doc_contradictions|pdf_producer_consumer_tool/)
    expect(s.items.find((i) => i.ref === 'forensic:payroll_processor_recognized')).toBeUndefined()
    const portal = s.items.find((i) => i.ref === 'portal:CV-26-0001')!
    expect(portal.unverified).toBe(true)
    const ltb = s.items.find((i) => i.ref === 'ltb:d1')!
    expect(ltb.unverified).toBe(true)
    const canlii = s.items.find((i) => i.ref.startsWith('source:CanLII'))!
    expect(canlii.unverified).toBe(true)
    expect(canlii.label).toContain('未能检索')
    expect(s.items.find((i) => i.ref === 'verification:bank')!.detail).toContain('沙箱')
  })
  it('score: only ai_score and the tier label; no dimension numbers', () => {
    const s = buildDisclosurePack(packInput()).screenings[0]
    expect(s.ai_score).toBe(82)
    expect(s.tier_label).toBe('优质 · 建议通过')
    expect(JSON.stringify(s)).not.toMatch(/ability_to_pay|credit_health_score|rental_history_score|verification_score/)
    expect(s.property).toBe('100 King St W #1207, Toronto')
    expect(s.landlord_name).toBe('Sarah Wang')
    expect(s.notice_confirmed_how).toBe('application_consent')
  })
  it('carries corrections, viewers, recipients and the live alert', () => {
    const pack = buildDisclosurePack(packInput())
    expect(pack.screenings[0].corrections[0].action).toBe('supplemented')
    expect(pack.viewers.map((v) => v.role)).toEqual(['share_link', 'landlord']) // newest first
    expect(pack.recipients).toHaveLength(1)
    expect(pack.alert?.statement).toBe('My identity was misused in 2025.')
    const revoked = packInput()
    revoked.alerts[0].revoked_at = '2026-10-03T00:00:00Z'
    expect(buildDisclosurePack(revoked).alert).toBeNull()
  })
  it('fingerprint is stable over key order and changes with content', async () => {
    const p1 = buildDisclosurePack(packInput())
    const p2 = buildDisclosurePack(packInput())
    expect(await packFingerprint(p1)).toBe(await packFingerprint(p2))
    expect(canonicalJson({ b: 1, a: [2, { d: 1, c: 2 }] })).toBe('{"a":[2,{"c":2,"d":1}],"b":1}')
    const p3 = buildDisclosurePack({ ...packInput(), request: { ...request, name: 'Mia Chen ' } })
    expect(await packFingerprint(p3)).not.toBe(await packFingerprint(p1))
  })
})

describe('renderDisclosurePack', () => {
  it('escapes user strings, prints the rights paragraph, the contact address, the alert and the fingerprint', async () => {
    const input = packInput()
    input.screenings[0].ai_summary_zh = '<script>alert(1)</script>'
    input.viewers[0].name = 'Evil "<b>" Landlord'
    const pack = buildDisclosurePack(input)
    pack.fingerprint = await packFingerprint(pack)
    const html = renderDisclosurePack(pack, 'zh')
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(html).toContain('Evil &quot;&lt;b&gt;&quot; Landlord')
    for (const p of rightsParagraph('zh')) expect(html).toContain(p.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'))
    expect(html).toContain('privacy@stayloop.ai')
    expect(html).toContain('电子方式即时；邮寄或电话方式 2 个工作日内')
    expect(html).toContain('身份警示')
    expect(html).toContain('My identity was misused in 2025.')
    expect(html).toContain(pack.fingerprint)
    expect(html).toContain('class="sheet"')
    expect(html).toContain('window.print()')
    expect(html).toContain('未经佐证')
    expect(html).toContain('在线提出争议')
    expect(html).not.toContain('不是消费者报告机构')
    const en = renderDisclosurePack(pack, 'en')
    expect(en).toContain('My screening file')
    expect(en).toContain('electronic disclosure is immediate; by mail or phone, within 2 business days')
  })
})

describe('alerts + server helpers', () => {
  it('alertBanner / alertPublic', () => {
    const a = { id: 'x', email: 'e', name: null, statement: 'S', created_at: '2026-10-02T00:00:00Z', expires_at: '2032-10-02T00:00:00Z', revoked_at: null, request_id: null }
    expect(alertBanner(a, 'zh').title).toContain('身份警示')
    expect(alertBanner(a, 'en').meta).toContain('s.12.1')
    expect(alertPublic(a)).toEqual({ statement: 'S', created_at: a.created_at, expires_at: a.expires_at })
    expect(alertPublic(null)).toBeNull()
  })
  it('constantTimeEqual compares every byte; maskEmail / normalizeEmail', () => {
    expect(constantTimeEqual('abc', 'abc')).toBe(true)
    expect(constantTimeEqual('abc', 'abd')).toBe(false)
    expect(constantTimeEqual('abc', 'ab')).toBe(false)
    expect(maskEmail('mia@example.com')).toBe('mi*@example.com')
    expect(normalizeEmail('  Mia@Example.com ')).toBe('mia@example.com')
    expect(normalizeEmail('not-an-email')).toBeNull()
  })
})

// ── migration ─────────────────────────────────────────────────────────────────

describe('migration 20261017_consumer_file_access', () => {
  const m = read('supabase/migrations/20261017_consumer_file_access.sql')
  it('creates the five tables', () => {
    for (const t of ['consumer_requests', 'consumer_disputes', 'screening_corrections', 'consumer_alerts', 'passport_share_views']) expect(m).toContain(`create table if not exists public.${t} (`)
  })
  it('locks every table: revoke from public, anon, authenticated, service_role, then explicit grants', () => {
    for (const t of ['consumer_requests', 'consumer_disputes', 'screening_corrections', 'consumer_alerts', 'passport_share_views']) {
      expect(m).toContain(`revoke all on public.${t} from public, anon, authenticated, service_role;`)
      expect(m).toContain(`grant all on public.${t} to service_role;`)
      expect(m).toContain(`alter table public.${t} enable row level security;`)
    }
    expect(m).not.toMatch(/grant \w+ on public\.consumer_(requests|disputes|alerts) to (anon|authenticated)/)
    expect(m).not.toMatch(/grant \w+ on public\.passport_share_views to (anon|authenticated)/)
  })
  it('screening_corrections and passport_share_views are append-only for every role', () => {
    expect(m).toMatch(/create or replace function public\.consumer_append_only\(\)[\s\S]*raise exception 'append_only'/)
    expect(m).toContain('create trigger trg_screening_corrections_append_only before update or delete on public.screening_corrections')
    expect(m).toContain('create trigger trg_passport_share_views_append_only before update or delete on public.passport_share_views')
    // no is_direct_client_write() escape hatch: the service role is locked out too
    const fn = m.slice(m.indexOf('function public.consumer_append_only'), m.indexOf('-- ── 1.'))
    expect(fn).not.toContain('is_direct_client_write')
  })
  it('screening_corrections: select for authenticated through the screenings RLS', () => {
    expect(m).toMatch(/create policy screening_corrections_read_via_screening on public\.screening_corrections\s+for select to authenticated\s+using \(exists \(select 1 from public\.screenings s where s\.id = screening_id\)\)/)
    expect(m).toContain('grant select on public.screening_corrections to authenticated;')
    expect(m).not.toMatch(/grant (insert|update|delete)[^;]*screening_corrections to authenticated/)
  })
  it('token is 64 hex; email stored lower; statuses and kinds match the contract; 6-year alerts', () => {
    expect(m).toContain("token                   text not null unique check (token ~ '^[a-f0-9]{64}$')")
    expect(m).toContain('email                   text not null check (email = lower(email)')
    expect(m).toContain("check (status in ('pending_verification', 'matched', 'needs_review', 'fulfilled', 'closed'))")
    expect(m).toContain("check (delivery in ('electronic', 'mail', 'phone'))")
    expect(m).toContain("check (item_kind in ('fact', 'public_record', 'forensic_flag', 'credit', 'verification', 'other'))")
    expect(m).toContain("check (action in ('corrected', 'supplemented', 'deleted', 'maintained'))")
    expect(m).toContain("expires_at timestamptz not null default (now() + interval '6 years')")
    expect(m).toContain('create trigger trg_consumer_requests_touch before update on public.consumer_requests')
  })
  it('screenings gains the two s.11(3) columns with the four allowed sources', () => {
    expect(m).toContain('alter table public.screenings add column if not exists notice_confirmed_at timestamptz;')
    expect(m).toContain('alter table public.screenings add column if not exists notice_confirmed_how text;')
    expect(m).toContain("notice_confirmed_how in ('application_consent', 'intake_consent', 'landlord_attested', 'partner_attested')")
  })
})

// ── routes ────────────────────────────────────────────────────────────────────

describe('applicant-side routes (anonymous + token)', () => {
  it('POST /api/consumer/request always answers 200 {ok:true}; both limiters fail-closed; token only in the email', () => {
    const r = read('app/api/consumer/request/route.ts')
    expect(r).not.toMatch(/status: 4\d\d|status: 5\d\d/)
    expect(r).toContain("underHourlyLimit(`consumer-request:ip:${ipHash}`, 5, false)")
    expect(r).toContain('underHourlyLimit(`consumer-request:email:${(await sha256Hex(email)).slice(0, 32)}`, 3, false)')
    expect(r).toContain('const OK = () => NextResponse.json({ ok: true }')
    expect(r).not.toMatch(/NextResponse\.json\(\{[^}]*token/)
    expect(r).toContain('/my-file/${token}')
    expect(r).toContain("audit(admin, 'consumer_request_created'")
    expect(r).toContain("export const runtime = 'edge'")
  })
  it('token lookup: format → indexed lookup → constant-time compare → expiry; invalid → 404 invalid_token', () => {
    const s = read('lib/consumer/server.ts')
    expect(s).toContain('export const CONSUMER_TOKEN_RE = /^[a-f0-9]{64}$/')
    expect(s).toMatch(/if \(!row \|\| !constantTimeEqual\(row\.token, token\)\) return null/)
    expect(s).toMatch(/export function constantTimeEqual[\s\S]*diff \|= \(x\[i\] \?\? 0\) \^ \(y\[i\] \?\? 0\)/)
    for (const p of ['app/api/consumer/request/[token]/route.ts', 'app/api/consumer/request/[token]/verify/route.ts', 'app/api/consumer/request/[token]/pack/route.ts', 'app/api/consumer/request/[token]/dispute/route.ts', 'app/api/consumer/request/[token]/alert/route.ts']) {
      const r = read(p)
      expect(r).toContain('loadRequestByToken(admin, token)')
      expect(r).toContain("{ error: 'invalid_token' }, { status: 404")
      expect(r).toContain("export const runtime = 'edge'")
      expect(r).not.toMatch(/auth\.getUser|Authorization/) // no login anywhere on the applicant side
    }
  })
  it('GET stamps email_verified_at once; pack only when matched/fulfilled AND verified; fingerprint header; disclosure audited', () => {
    const g = read('app/api/consumer/request/[token]/route.ts')
    expect(g).toContain("update({ email_verified_at: at }).eq('id', request.id).is('email_verified_at', null)")
    const p = read('app/api/consumer/request/[token]/pack/route.ts')
    expect(p).toContain("const ready = (request.status === 'matched' || request.status === 'fulfilled') && !!request.email_verified_at")
    expect(p).toContain("if (!ready) return NextResponse.json({ error: 'not_available'")
    expect(p).toContain("'X-Content-Fingerprint': pack.fingerprint")
    expect(p).toContain("audit(admin, 'consumer_file_disclosed'")
    expect(p).toContain('buildDisclosurePack(inputs)')
  })
  it('verify: matched + electronic → fulfilled; needs_review / mail / phone → admins emailed; audited', () => {
    const v = read('app/api/consumer/request/[token]/verify/route.ts')
    expect(v).toContain("const fulfilNow = m.status === 'matched' && delivery === 'electronic'")
    expect(v).toContain("status === 'needs_review' || (status === 'matched' && delivery !== 'electronic')")
    expect(v).toContain('adminReviewEmail(')
    expect(v).toContain("audit(admin, 'consumer_request_verified'")
    expect(v).toContain("underHourlyLimit(`consumer-verify:${request.id}`, 5, false)")
    expect(v).toContain('due_at: dueAt')
  })
  it('dispute: screening_id must be in matched_screening_ids; 10/token/h fail-closed; admins emailed; audited', () => {
    const d = read('app/api/consumer/request/[token]/dispute/route.ts')
    expect(d).toContain("!(request.matched_screening_ids ?? []).includes(screeningId)) return NextResponse.json({ error: 'screening_not_matched' }, { status: 403")
    expect(d).toContain("underHourlyLimit(`consumer-dispute:${request.id}`, 10, false)")
    expect(d).toContain('adminDisputeEmail(')
    expect(d).toContain("audit(admin, 'consumer_dispute_filed'")
    expect(d).toContain('DISPUTE_ITEM_KINDS.includes(itemKind)')
  })
  it('alert: email from the request only; POST revokes the previous then inserts; DELETE revokes; both audited', () => {
    const a = read('app/api/consumer/request/[token]/alert/route.ts')
    expect(a).toContain("insert({ email: request.email, name: request.name, statement, request_id: request.id })")
    expect(a).not.toMatch(/body\.email/)
    expect(a).toContain("audit(admin, 'consumer_alert_set'")
    expect(a).toContain("audit(admin, 'consumer_alert_revoked'")
    expect(a).toContain('export async function DELETE')
  })
})

describe('landlord alert lookup + admin queue', () => {
  it('GET /api/consumer/alert: landlord JWT, RLS read of the screening is the proof, email found via the three chains only, never returned', () => {
    const r = read('app/api/consumer/alert/route.ts')
    expect(r).toContain("sb.from('screenings').select('id, application_id').eq('id', screeningId).maybeSingle()")
    expect(r).toContain("from('applications').select('email')")
    expect(r).toContain("from('verification_requests').select('tenant_email')")
    expect(r).toContain("from('agent_intake_submissions').select('applicant_email')")
    expect(r).toContain('alertPublic(a)')
    expect(r).not.toMatch(/email: e|emails\b.*NextResponse\.json/)
  })
  it('admin: guard via is_stayloop_admin; confirm_match only among candidates; resolve writes screening_corrections, sets the dispute, notifies 60-day recipients + applicant, audits', () => {
    const r = read('app/api/admin/consumer/route.ts')
    expect(r).toContain("sb.rpc('is_stayloop_admin')")
    expect(r).toContain("const allowed = new Set(request.candidate_screening_ids ?? [])")
    expect(r).toContain("from('screening_corrections').insert({ screening_id: dispute.screening_id, dispute_id: dispute.id")
    expect(r).toContain("from('consumer_disputes').update({ status: resolution, resolution_note: note, resolved_by: g.userId, resolved_at: now })")
    expect(r).toContain('const SIXTY_DAYS_MS = 60 * 86_400_000')
    expect(r).toContain('correctionNoticeEmail(')
    expect(r).toContain('applicantDisputeResultEmail(')
    expect(r).toContain("kind: 'partner_webhook'")
    expect(r).toContain("update({ notified_at: new Date().toISOString(), notified_to: notified })")
    expect(r).toContain("action: 'consumer_dispute_resolved'")
    expect(r).toContain("'correction_notice_emailed'")
    expect(r).toContain("if (resolution === 'maintained' && !note) return NextResponse.json({ error: 'note_required' }")
    // corrections are appended, never an update on the screening row itself
    expect(r).not.toMatch(/from\('screenings'\)\.update/)
  })
})

describe('existing routes gain a write (nothing else changes)', () => {
  it('from-application and agent-intake record the s.11(3) notice confirmation', () => {
    const a = read('app/api/screening/from-application/route.ts')
    expect(a).toContain("notice_confirmed_how: 'application_consent'")
    expect(a).toContain('notice_confirmed_at: new Date().toISOString()')
    const i = read('app/api/agent-intake/[token]/route.ts')
    expect(i).toContain("notice_confirmed_how: 'intake_consent'")
    expect(i).toContain('notice_confirmed_at: new Date().toISOString()')
  })
  it('passport verify response carries the identity alert', () => {
    const r = read('app/api/v1/passport/verify/route.ts')
    expect(r).toContain("import { activeAlertFor, alertPublic } from '@/lib/consumer/alerts'")
    expect(r).toContain('const alert = email ? alertPublic(await activeAlertFor(admin, email)) : null')
    expect(r).toContain("return NextResponse.json({ verified: true, scopes, ...out, alert, issued_by: 'applicant'")
  })
  it('share page inserts one passport_share_views row per open with a hashed IP', () => {
    const p = read('app/p/[token]/page.tsx')
    expect(p).toContain("sb.from('passport_share_views').insert({ token, ip_hash: ipHash, user_agent:")
    expect(p).toContain(".join('').slice(0, 16)")
    expect(p).toContain('view_count: (row.view_count ?? 0) + 1') // the counter stays
  })
  it('no "not a consumer reporting agency" wording anywhere in the new modules', () => {
    for (const p of ['lib/consumer/render.ts', 'lib/consumer/emails.ts', 'lib/consumer/alerts.ts']) {
      const s = read(p)
      expect(s).not.toContain('不是消费者报告机构')
      expect(s).not.toContain('not a consumer reporting agency')
    }
  })
})
