// V1.0 阶段 2 · 丙 #13 经纪收件链接 / #15 TRESA 文件完整化 / #16 客户跟进 + 租约到期提醒
// (2026-10-16). Pure-function tests on lib/agent/intakeLinks.ts and clientTasks, plus source
// guards on the migration, the two routes, the public page and the client table.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  AGENT_INTAKE_CONSENT_VERSION, INTAKE_FILE_KINDS, INTAKE_LINK_DAYS, INTAKE_TOKEN_RE,
  agentIntakeConsentText, intakeFilePath, intakeLinkExpiry, intakeLinkState, intakeLinkUrl, intakeScreeningHref, intakeScreeningNotes, makeIntakeToken, validateIntakeSubmission,
} from '@/lib/agent/intakeLinks'
import { AGREEMENT_EXPIRY_WARN_DAYS, LEASE_END_TOUCHPOINTS, clientTasks, daysUntil } from '@/lib/agent/clientBook'

const read = (p: string) => readFileSync(p, 'utf8')
const NOW = new Date('2026-10-16T12:00:00Z')
const LINK = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

describe('migration 20261016_agent_intake', () => {
  const m = read('supabase/migrations/20261016_agent_intake.sql')
  it('adds the five client-table columns (#15 / #16) with the note length cap', () => {
    for (const col of ['representation_agreement_expires_at date', 'info_guide_delivered_at timestamptz', 'info_guide_delivery_note text', 'multi_rep_consent_at date', 'lease_end_date date']) expect(m).toContain(`alter table public.agent_clients add column if not exists ${col}`)
    expect(m).toContain('char_length(info_guide_delivery_note) <= 200')
  })
  it('agent_intake_links: own rows, 64-hex token, 14-day default, browser may only relabel / revoke', () => {
    expect(m).toContain("create table if not exists public.agent_intake_links")
    expect(m).toContain("token         text not null unique check (token ~ '^[a-f0-9]{64}$')")
    expect(m).toContain("expires_at    timestamptz not null default (now() + interval '14 days')")
    expect(m).toMatch(/create policy agent_intake_links_own_select[\s\S]*agent_auth_id = auth\.uid\(\)/)
    expect(m).toContain('grant update (label, revoked_at) on public.agent_intake_links to authenticated')
    expect(m).not.toMatch(/grant insert on public\.agent_intake_links to authenticated/)
  })
  it('agent_intake_submissions is service-role only (no policies, everything revoked)', () => {
    expect(m).toContain('create table if not exists public.agent_intake_submissions')
    expect(m).toContain('revoke all on public.agent_intake_submissions from public, anon, authenticated, service_role;')
    expect(m).toContain('grant all on public.agent_intake_submissions to service_role;')
    expect(m).not.toMatch(/create policy \w+ on public\.agent_intake_submissions/)
    expect(m).toContain('consent_version text not null')
  })
  it('bucket: anon upload only under agent-intake/<link_id>/<kind>/ while the link is live; read-back only for the owning agent', () => {
    expect(m).toContain("create or replace function public.agent_intake_upload_allowed(p_name text)")
    expect(m).toContain("if v_parts[1] <> 'agent-intake' then return false; end if;")
    expect(m).toMatch(/l\.revoked_at is null\s+and l\.expires_at > now\(\)/)
    expect(m).toContain("create policy tenant_files_agent_intake_insert on storage.objects\n  for insert to anon, authenticated\n  with check (bucket_id = 'tenant-files' and public.agent_intake_upload_allowed(name));")
    expect(m).toContain("create or replace function public.agent_intake_file_readable(p_name text)")
    expect(m).toContain('and l.agent_auth_id = v_uid')
    expect(m).toContain("create policy tenant_files_agent_intake_select on storage.objects\n  for select to authenticated")
    // function locks are written `from public, anon` (review 2026-09-25 rule)
    expect(m).toContain('revoke execute on function public.agent_intake_upload_allowed(text) from public, anon, authenticated, service_role;')
    expect(m).toContain('revoke execute on function public.agent_intake_file_readable(text) from public, anon, authenticated, service_role;')
  })
})

describe('lib/agent/intakeLinks · pure rules', () => {
  it('token: 64 lowercase hex from 32 random bytes; url; expiry 14 days', () => {
    const t = makeIntakeToken()
    expect(t).toMatch(INTAKE_TOKEN_RE)
    expect(makeIntakeToken((b) => b.fill(255))).toBe('f'.repeat(64))
    expect(intakeLinkUrl('https://www.stayloop.ai/', t)).toBe(`https://www.stayloop.ai/intake/${t}`)
    expect(INTAKE_LINK_DAYS).toBe(14)
    expect(intakeLinkExpiry(NOW)).toBe('2026-10-30T12:00:00.000Z')
  })
  it('state: active / revoked / expired', () => {
    expect(intakeLinkState({ expires_at: '2026-10-30T00:00:00Z', revoked_at: null }, NOW)).toBe('active')
    expect(intakeLinkState({ expires_at: '2026-10-30T00:00:00Z', revoked_at: '2026-10-17T00:00:00Z' }, NOW)).toBe('revoked')
    expect(intakeLinkState({ expires_at: '2026-10-01T00:00:00Z', revoked_at: null }, NOW)).toBe('expired')
    expect(intakeLinkState({ expires_at: 'garbage', revoked_at: null }, NOW)).toBe('expired')
  })
  it('file path: agent-intake/<link>/<kind>/<ts>_<n>_<safe name>; screening href carries as=agent & run=1', () => {
    expect(intakeFilePath(LINK, 'paystub', 'Sept Pay (1).pdf', 2, 1700000000000)).toBe(`agent-intake/${LINK}/paystub/1700000000000_2_Sept_Pay__1_.pdf`)
    expect(intakeScreeningHref('s1')).toBe('/screening/app?as=agent&screening=s1&run=1')
  })
  it('validateIntakeSubmission: name / email / date / consent version / signature / files under this link only', () => {
    const good = { applicant_name: ' Mia Chen ', applicant_email: 'Mia@Example.ca', move_in_date: '2026-12-01', consent_version: AGENT_INTAKE_CONSENT_VERSION, consent_name: 'Mia Chen', files: [{ path: `agent-intake/${LINK}/id/1_0_dl.pdf`, name: 'dl.pdf', size: 1000, mime: 'application/pdf', kind: 'id' }] }
    const ok = validateIntakeSubmission(good, LINK)
    expect(ok.ok).toBe(true)
    if (ok.ok) { expect(ok.value.applicant_name).toBe('Mia Chen'); expect(ok.value.applicant_email).toBe('mia@example.ca'); expect(ok.value.files).toHaveLength(1) }
    expect(validateIntakeSubmission({ ...good, applicant_name: '' }, LINK)).toEqual({ ok: false, reason: 'applicant_name' })
    expect(validateIntakeSubmission({ ...good, applicant_email: 'nope' }, LINK)).toEqual({ ok: false, reason: 'applicant_email' })
    expect(validateIntakeSubmission({ ...good, move_in_date: '12/01/2026' }, LINK)).toEqual({ ok: false, reason: 'move_in_date' })
    expect(validateIntakeSubmission({ ...good, consent_version: 'v0' }, LINK)).toEqual({ ok: false, reason: 'consent_version' })
    expect(validateIntakeSubmission({ ...good, consent_name: 'M' }, LINK)).toEqual({ ok: false, reason: 'consent_name' })
    expect(validateIntakeSubmission({ ...good, files: [] }, LINK)).toEqual({ ok: false, reason: 'files' })
    // another link's folder, a kind mismatch, a traversal segment, an unknown kind — all refused
    expect(validateIntakeSubmission({ ...good, files: [{ ...good.files[0], path: 'agent-intake/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/id/x.pdf' }] }, LINK)).toEqual({ ok: false, reason: 'files' })
    expect(validateIntakeSubmission({ ...good, files: [{ ...good.files[0], path: `agent-intake/${LINK}/paystub/x.pdf` }] }, LINK)).toEqual({ ok: false, reason: 'files' })
    expect(validateIntakeSubmission({ ...good, files: [{ ...good.files[0], path: `agent-intake/${LINK}/id/../x.pdf` }] }, LINK)).toEqual({ ok: false, reason: 'files' })
    expect(validateIntakeSubmission({ ...good, files: [{ ...good.files[0], kind: 'sin_card', path: `agent-intake/${LINK}/sin_card/x.pdf` }] }, LINK)).toEqual({ ok: false, reason: 'files' })
    expect(validateIntakeSubmission({ ...good, files: [{ ...good.files[0], size: 26 * 1024 * 1024 }] }, LINK)).toEqual({ ok: false, reason: 'files' })
    // duplicates collapse
    const dup = validateIntakeSubmission({ ...good, files: [good.files[0], good.files[0]] }, LINK)
    expect(dup.ok && dup.value.files.length).toBe(1)
  })
  it('consent text: O. Reg. 290/98 scope, OHRC, CRA s.10(7) 60 days, and the public-record sentence flips with CRA_MODE', () => {
    for (const lang of ['zh', 'en'] as const) {
      const tool = agentIntakeConsentText(lang, false)
      const reg = agentIntakeConsentText(lang, true)
      const all = (c: typeof tool) => c.items.map((i) => i.p).join('\n')
      expect(all(tool)).toMatch(/290\/98/)
      expect(all(tool)).toMatch(/10\(7\)/)
      expect(all(tool)).toMatch(/60/)
      expect(all(tool)).toMatch(lang === 'zh' ? /不替房东或经纪检索/ : /does not search public records/)
      expect(all(reg)).toMatch(lang === 'zh' ? /法院门户/ : /court portal/)
      expect(tool.ack.length).toBeGreaterThan(10)
    }
    expect(AGENT_INTAKE_CONSENT_VERSION).toBe('agent-intake-v1-2026-10')
    expect(INTAKE_FILE_KINDS.map((k) => k.kind)).toEqual(['id', 'paystub', 'bank_statement', 'employment_letter', 'credit_report', 'reference', 'other'])
    // no SIN is ever asked for
    expect(JSON.stringify(INTAKE_FILE_KINDS) + JSON.stringify(agentIntakeConsentText('en', true))).not.toMatch(/\bSIN\b|social insurance/i)
  })
  it('screening notes name the link, the consent version and the tool-mode caveat', () => {
    const sub = { applicant_name: 'Mia', applicant_email: 'm@x.ca', move_in_date: '2026-12-01', consent_version: AGENT_INTAKE_CONSENT_VERSION, consent_name: 'Mia Chen', files: [{ path: 'p', name: 'dl.pdf', size: 1, mime: 'application/pdf', kind: 'id' as const }] }
    const n = intakeScreeningNotes({ linkId: LINK, clientId: 'c1', label: '1207 King W', submission: sub, lookupsAllowed: false })
    expect(n).toContain(`[from agent intake link ${LINK} client c1]`)
    expect(n).toContain('Unit / label: 1207 King W')
    expect(n).toContain(AGENT_INTAKE_CONSENT_VERSION)
    expect(n).toContain('CRA_MODE=tool')
    expect(intakeScreeningNotes({ linkId: LINK, clientId: null, label: null, submission: sub, lookupsAllowed: true })).not.toContain('CRA_MODE=tool')
  })
})

describe('routes · source guards', () => {
  it('public POST /api/agent-intake/[token]: IP limit 10/h fail-closed, consent version, screening under the agent authId, service role, delegation only when live + screen', () => {
    const r = read('app/api/agent-intake/[token]/route.ts')
    expect(r).toContain("underHourlyLimit(`agent-intake-submit:${ip}`, 10, false)")
    expect(r).toContain('validateIntakeSubmission(body, v.link.id)')
    expect(r).toContain('landlord_id: v.link.agent_auth_id,')
    expect(r).toContain("SUPABASE_SERVICE_ROLE_KEY!")
    expect(r).toMatch(/\.eq\('status', 'active'\)\.gt\('expires_at', new Date\(\)\.toISOString\(\)\)\.contains\('allowed_actions', \['screen'\]\)/)
    // only files that are really in the bucket count; the manifest is client supplied
    expect(r).toContain("a.storage.from('tenant-files').list(`agent-intake/${v.link.id}/${kind}`")
    expect(r).toContain("return NextResponse.json({ error: 'no_documents' }, { status: 422")
    // CRA_MODE: the GET tells the page whether lookups run; the notes say so
    expect(r).toContain('personal_record_lookups: personalRecordLookupsAllowed()')
    // a revoked / expired link, or an agent whose registration is no longer live, stops intake
    expect(r).toMatch(/a\.status === 'verified' \|\| a\.status === 'renewal_due'/)
    // the agent is told by mail + push, to the same screening href the client table uses
    expect(r).toContain('sendEmail({ to, subject, html, text: plain')
    expect(r).toContain("notifyUser(a, v.link.agent_auth_id, { kind: 'event'")
    expect(r).toContain('intakeScreeningHref(screeningId)')
    expect(r).toContain("'Cache-Control': 'no-store'")
  })
  it('agent POST /api/agent/intake-links: JWT, registration live, landlord client only, token minted server side, 30/h', () => {
    const r = read('app/api/agent/intake-links/route.ts')
    expect(r).toContain("if (!c) return NextResponse.json({ error: 'sign_in_required' }, { status: 401 })")
    expect(r).toContain('isRegistrationLive(p.status)')
    expect(r).toContain("if (row.client_role !== 'landlord') return NextResponse.json({ error: 'landlord_client_required' }, { status: 422 })")
    expect(r).toContain('const token = makeIntakeToken()')
    expect(r).toContain("underHourlyLimit(`agent-intake-link:${c.uid}`, 30, false)")
    // the applicant's email never travels to the client table
    expect(r).toContain("select('id, link_id, applicant_name, move_in_date, screening_id, created_at')")
  })
  it('the public page shows the agent per O. Reg. 567/05 s.12.1, uploads with prepareUploads, and submits the consent version', () => {
    const p = read('app/intake/[token]/page.tsx')
    expect(p).toContain('agent.legal_name')
    expect(p).toContain('agent.brokerage_name')
    expect(p).toContain('RECO #{agent.reco_number}')
    expect(p).toContain('prepareUploads([raw])')
    expect(p).toContain("supabase.storage.from('tenant-files').upload(path, file")
    expect(p).toContain('consent_version: peek.consent_version')
    expect(p).toContain('agentIntakeConsentText(')
    expect(p).toContain('data-testid="intake-consent"')
    expect(p).toMatch(/AI 助理|AI Agent|经纪|agent/)
    expect(p).not.toMatch(/助手|管家/)
  })
})

describe('client table · #13 / #15 / #16 wiring', () => {
  const c = read('components/agent/ClientBook.tsx')
  it('header「收件链接」, per-landlord-row intake link, and「材料已到 · 一键筛查 →」to the from-application path', () => {
    expect(c).toContain('data-testid="intake-link-new"')
    expect(c).toContain('data-testid="client-intake-new"')
    expect(c).toContain('data-testid="client-intake-link"')
    expect(c).toContain('data-testid="client-intake-screen"')
    expect(c).toContain('材料已到 · 一键筛查 →')
    expect(c).toContain("fetch('/api/agent/intake-links'")
    expect(c).toContain('intakeScreeningHref(sb.screening_id)')
    // the intake button sits on landlord rows only
    expect(c).toMatch(/\{c\.client_role === 'landlord' && \(\(\) => \{\s*const il = liveIntakeFor\(c\.id\)/)
  })
  it('the four new date fields are editable in the TRESA column; the Guide delivery note stamps delivered_at', () => {
    for (const f of ['representation_agreement_expires_at', 'info_guide_delivery_note', 'multi_rep_consent_at', 'lease_end_date']) expect(c).toContain(`update(c.id, { ${f}:`)
    expect(c).toContain('info_guide_delivered_at: v ? (c.info_guide_delivered_at ?? new Date().toISOString()) : null')
    expect(c).toContain("aria-label=\"multiple representation consent date\"")
  })
  it('showing pack button: prompt deep link + a searching client moves to showing', () => {
    expect(c).toContain('data-testid="client-showing-pack"')
    expect(c).toContain("if (c.stage === 'searching') await update(c.id, { stage: 'showing' })")
    expect(c).toContain('onClick={() => void showingPack(c)}')
  })
  it('no native confirm; user-visible wording says AI 助理 / AI Agent', () => {
    expect(c).not.toMatch(/window\.confirm\(/)
    expect(c).not.toMatch(/助手|管家/)
  })
  it('ClientTasks loads the new columns', () => {
    expect(read('components/agent/ClientTasks.tsx')).toContain('representation_agreement_expires_at, info_guide_given_at, info_guide_delivered_at, info_guide_delivery_note, multi_rep_consent_at, lease_end_date')
  })
})

describe('clientTasks · #15 / #16 (record, never act for the agent)', () => {
  const base = { client_role: 'landlord' as const, stage: 'searching' as const, last_contact_at: NOW.toISOString(), updated_at: NOW.toISOString(), representation_agreement_at: '2026-01-10', info_guide_given_at: '2026-01-10' }
  it('daysUntil', () => {
    expect(daysUntil('2026-10-26', NOW)).toBe(10)
    expect(daysUntil('2026-10-15', NOW)).toBe(-1)
    expect(daysUntil(null, NOW)).toBeNull()
    expect(daysUntil(undefined, NOW)).toBeNull()
  })
  it('missing expiry (loaded as null) → task; undefined (column not loaded) → nothing', () => {
    const t = clientTasks([{ ...base, id: 'a', name: 'Ann', representation_agreement_expires_at: null, info_guide_delivery_note: 'email', info_guide_delivered_at: '2026-01-10T00:00:00Z' }], NOW)
    expect(t.map((x) => x.id)).toEqual(['expiry-missing:a'])
    expect(t[0].zh).toContain('s.13.4')
    expect(clientTasks([{ ...base, id: 'b', name: 'Ben' }], NOW)).toEqual([])
  })
  it('agreement expiring within 30 days → warn; past → warn「续签或归档」', () => {
    const soon = clientTasks([{ ...base, id: 'a', name: 'Ann', representation_agreement_expires_at: '2026-11-10', info_guide_delivery_note: 'x' }], NOW)
    expect(soon.map((x) => x.id)).toEqual(['expiry-soon:a'])
    expect(soon[0].tone).toBe('warn')
    expect(soon[0].zh).toContain('25 天后到期')
    const past = clientTasks([{ ...base, id: 'a', name: 'Ann', representation_agreement_expires_at: '2026-10-01', info_guide_delivery_note: 'x' }], NOW)
    expect(past.map((x) => x.id)).toEqual(['expired:a'])
    expect(past[0].zh).toContain('续签或归档')
    expect(AGREEMENT_EXPIRY_WARN_DAYS).toBe(30)
    // far away: no task
    expect(clientTasks([{ ...base, id: 'a', name: 'Ann', representation_agreement_expires_at: '2027-10-01', info_guide_delivery_note: 'x' }], NOW)).toEqual([])
  })
  it('Information Guide date recorded but delivery not → info task that says the onus stays with the agent', () => {
    const t = clientTasks([{ ...base, id: 'a', name: 'Ann', representation_agreement_expires_at: '2027-10-01', info_guide_delivered_at: null, info_guide_delivery_note: null }], NOW)
    expect(t.map((x) => x.id)).toEqual(['guide-delivery:a'])
    expect(t[0].zh).toContain('只记录')
    expect(t[0].en).toMatch(/stays with you/)
    // no date yet → the existing paperwork task, not this one
    const none = clientTasks([{ ...base, id: 'a', name: 'Ann', info_guide_given_at: null, representation_agreement_expires_at: '2027-10-01', info_guide_delivered_at: null, info_guide_delivery_note: null }], NOW)
    expect(none.map((x) => x.id)).toEqual(['paper:a'])
  })
  it('lease end 90 / 30 days → reminder the agent sends themselves (CASL); past end → nothing', () => {
    expect(LEASE_END_TOUCHPOINTS).toEqual([90, 30])
    const full = { ...base, representation_agreement_expires_at: '2027-10-01', info_guide_delivery_note: 'x' }
    const d90 = clientTasks([{ ...full, id: 'a', name: 'Ann', lease_end_date: '2027-01-01' }], NOW)
    expect(d90.map((x) => x.id)).toEqual(['lease-end-90:a'])
    expect(d90[0].tone).toBe('info')
    expect(d90[0].zh).toContain('由你联系客户')
    expect(d90[0].prompt?.zh).toContain('我自己发')
    const d30 = clientTasks([{ ...full, id: 'a', name: 'Ann', lease_end_date: '2026-11-01' }], NOW)
    expect(d30.map((x) => x.id)).toEqual(['lease-end-30:a'])
    expect(d30[0].tone).toBe('warn')
    expect(clientTasks([{ ...full, id: 'a', name: 'Ann', lease_end_date: '2027-06-01' }], NOW)).toEqual([])
    expect(clientTasks([{ ...full, id: 'a', name: 'Ann', lease_end_date: '2026-10-01' }], NOW)).toEqual([])
    // the wording never claims Stayloop sends anything
    for (const t of [...d90, ...d30]) { expect(t.zh).not.toMatch(/替你发|自动发|已发送/); expect(t.en).not.toMatch(/we (will )?send|sent for you/i) }
  })
  it('closed clients produce nothing; the pre-existing tasks still come first on warn', () => {
    expect(clientTasks([{ ...base, id: 'z', name: 'Zed', stage: 'closed', representation_agreement_expires_at: null, lease_end_date: '2026-11-01' }], NOW)).toEqual([])
    const t = clientTasks([{ ...base, id: 'a', name: 'Ann', info_guide_given_at: null, representation_agreement_expires_at: null }], NOW)
    expect(t[0].id).toBe('paper:a')
  })
})
