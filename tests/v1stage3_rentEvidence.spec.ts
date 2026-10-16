// V1.0 阶段 3 · 甲 #4 · G9 — every rent period has evidence: a record, the OTHER
// side's confirmation, and a receipt file. Pure rules in lib/household/rentEvidence;
// the migration, the upload route and the three surfaces are pinned by source grep.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  acceptEvidenceFile,
  EVIDENCE_BADGE_LABEL,
  EVIDENCE_MAX_BYTES,
  EVIDENCE_MIMES,
  evidenceBadge,
  evidenceErrorText,
  evidencePath,
  periodEvidenceState,
  shortSha,
} from '@/lib/household/rentEvidence'

const read = (p: string) => readFileSync(p, 'utf8')
const ME = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const OTHER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const HH = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const LEASE = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const SHA = 'f'.repeat(64)

describe('acceptEvidenceFile — type and size gate', () => {
  it('takes jpeg / png / webp / heic and pdf, nothing else', () => {
    for (const type of EVIDENCE_MIMES) expect(acceptEvidenceFile({ name: 'x', type, size: 10 }).ok).toBe(true)
    expect(acceptEvidenceFile({ name: 'x.gif', type: 'image/gif', size: 10 })).toEqual({ ok: false, reason: 'file_type' })
    expect(acceptEvidenceFile({ name: 'x.docx', type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: 10 })).toEqual({ ok: false, reason: 'file_type' })
    expect(acceptEvidenceFile({ name: 'x.html', type: 'text/html', size: 10 })).toEqual({ ok: false, reason: 'file_type' })
  })
  it('iOS HEIC with an empty type is accepted by extension; a declared type wins over the extension', () => {
    expect(acceptEvidenceFile({ name: 'IMG_1.HEIC', type: '', size: 10 })).toEqual({ ok: true, mime: 'image/heic', ext: 'heic' })
    expect(acceptEvidenceFile({ name: 'IMG_1.heif', type: 'image/heif', size: 10 })).toEqual({ ok: true, mime: 'image/heic', ext: 'heic' })
    expect(acceptEvidenceFile({ name: 'receipt.pdf', type: 'text/html', size: 10 }).ok).toBe(false)
    expect(acceptEvidenceFile({ name: 'receipt.pdf', type: 'application/octet-stream', size: 10 })).toEqual({ ok: true, mime: 'application/pdf', ext: 'pdf' })
    expect(acceptEvidenceFile({ name: 'noext', type: '', size: 10 })).toEqual({ ok: false, reason: 'file_type' })
  })
  it('10 MB ceiling, empty files refused', () => {
    expect(EVIDENCE_MAX_BYTES).toBe(10 * 1024 * 1024)
    expect(acceptEvidenceFile({ name: 'a.png', type: 'image/png', size: EVIDENCE_MAX_BYTES }).ok).toBe(true)
    expect(acceptEvidenceFile({ name: 'a.png', type: 'image/png', size: EVIDENCE_MAX_BYTES + 1 })).toEqual({ ok: false, reason: 'file_size' })
    expect(acceptEvidenceFile({ name: 'a.png', type: 'image/png', size: 0 })).toEqual({ ok: false, reason: 'empty' })
  })
})

describe('evidencePath — household folder first, period and hash in the name', () => {
  it('builds <household>/rent/<lease>/<due>-<sha8>.<ext>', () => {
    expect(evidencePath(HH, LEASE, '2026-10-01', SHA, 'pdf')).toBe(`${HH}/rent/${LEASE}/2026-10-01-ffffffff.pdf`)
    expect(evidencePath(HH, LEASE, '2026-10-01T00:00:00Z', SHA, 'JPG')).toBe(`${HH}/rent/${LEASE}/2026-10-01-ffffffff.jpg`)
    expect(evidencePath(HH, LEASE, '2026-10-01', SHA, '../x')).toBe(`${HH}/rent/${LEASE}/2026-10-01-ffffffff.x`)
    expect(evidencePath(HH, LEASE, '2026-10-01', SHA, '')).toMatch(/\.bin$/)
  })
  it('the first segment is the household id (tenancy_files_member_read keys on it)', () => {
    expect(evidencePath(HH, LEASE, '2026-10-01', SHA, 'png').split('/')[0]).toBe(HH)
  })
  it('shortSha is the first 12 hex characters', () => {
    expect(shortSha(SHA)).toBe('ffffffffffff')
    expect(shortSha(null)).toBe('')
  })
})

describe('periodEvidenceState / evidenceBadge', () => {
  it('an unrecorded period has nothing and cannot be confirmed', () => {
    const s = periodEvidenceState({ status: 'due', tenant_id: OTHER }, ME)
    expect(s).toMatchObject({ recorded: false, recordedBy: null, canConfirm: false, confirmed: false, hasEvidence: false })
    expect(evidenceBadge({ status: 'due' }, ME)).toBe('none')
    expect(evidenceBadge(null, ME)).toBe('none')
  })
  it('the recorder cannot confirm; the other member can', () => {
    expect(periodEvidenceState({ status: 'paid', tenant_id: ME }, ME)).toMatchObject({ recordedByMe: true, canConfirm: false })
    expect(periodEvidenceState({ status: 'late', tenant_id: OTHER }, ME)).toMatchObject({ recordedByMe: false, canConfirm: true })
    expect(evidenceBadge({ status: 'paid', tenant_id: ME }, ME)).toBe('awaiting_other')
    expect(evidenceBadge({ status: 'paid', tenant_id: OTHER }, ME)).toBe('awaiting_me')
    // Signed out / unknown viewer: no confirm button.
    expect(periodEvidenceState({ status: 'paid', tenant_id: OTHER }, null).canConfirm).toBe(false)
  })
  it('the facts RPCs name the recorder recorded_by; the table names it tenant_id', () => {
    expect(periodEvidenceState({ status: 'paid', recorded_by: OTHER }, ME).canConfirm).toBe(true)
    expect(periodEvidenceState({ status: 'paid', recorded_by: ME, tenant_id: OTHER }, ME).recordedByMe).toBe(true)
  })
  it('confirmed and evidenced states, with their labels', () => {
    expect(periodEvidenceState({ status: 'paid', tenant_id: OTHER, confirmed_by: ME }, ME)).toMatchObject({ confirmed: true, confirmedByMe: true, canConfirm: false })
    expect(evidenceBadge({ status: 'paid', tenant_id: OTHER, confirmed_by: ME }, ME)).toBe('confirmed')
    expect(evidenceBadge({ status: 'paid', tenant_id: ME, evidence_path: 'x/rent/y/2026-10-01-abc.pdf' }, ME)).toBe('receipt')
    expect(evidenceBadge({ status: 'late', tenant_id: ME, confirmed_by: OTHER, evidence_path: 'x' }, ME)).toBe('receipt_confirmed')
    for (const k of ['receipt_confirmed', 'receipt', 'confirmed', 'awaiting_me', 'awaiting_other', 'none'] as const) {
      expect(EVIDENCE_BADGE_LABEL[k].zh.length).toBeGreaterThan(0)
      expect(EVIDENCE_BADGE_LABEL[k].en.length).toBeGreaterThan(0)
    }
    expect(EVIDENCE_BADGE_LABEL.receipt.zh).toBe('✓ 回执')
    expect(EVIDENCE_BADGE_LABEL.none.zh).toBe('无')
  })
  it('error words are explained in both languages', () => {
    expect(evidenceErrorText('self_confirm', true)).toContain('记录人不能自己确认')
    expect(evidenceErrorText('not_recorded', false)).toContain('not recorded as paid yet')
    expect(evidenceErrorText('evidence_exists', true)).toContain('已经有回执')
    expect(evidenceErrorText('file_size', false)).toContain('10 MB')
    expect(evidenceErrorText('something else', true)).toContain('something else')
  })
})

describe('migration 20261016_rent_evidence.sql', () => {
  const sql = read('supabase/migrations/20261016_rent_evidence.sql')
  it('adds the evidence columns with their length checks', () => {
    for (const c of ['confirmed_by uuid', 'confirmed_at timestamptz', 'evidence_path text', 'evidence_sha256 text', 'evidence_name text', 'evidence_size integer', 'evidence_mime text', 'evidence_by uuid', 'evidence_at timestamptz', 'note text']) {
      expect(sql).toContain(`add column if not exists ${c}`)
    }
    expect(sql).toContain('char_length(evidence_name) <= 160')
    expect(sql).toContain('char_length(evidence_mime) <= 80')
    expect(sql).toContain('char_length(note) <= 200')
    expect(sql).toMatch(/evidence_sha256 ~ '\^\[0-9a-f\]\{64\}\$'/)
  })
  it('confirm_rent_payment: definer, member of the household on any of the three lease pointers, never the recorder, idempotent', () => {
    expect(sql).toMatch(/create or replace function public\.confirm_rent_payment\(p_lease uuid, p_due date\)[\s\S]*security definer\s+set search_path = public, pg_temp/)
    expect(sql).toContain('(h.current_lease_id = p_lease or h.previous_lease_id = p_lease or h.next_lease_id = p_lease)')
    expect(sql).toContain('and public.is_household_member(h.id)')
    expect(sql).toContain("raise exception 'not_recorded' using errcode = '22023';")
    expect(sql).toMatch(/if v_row\.confirmed_by is not null then\s+return v_row;/)
    expect(sql).toMatch(/if v_row\.tenant_id is not null and v_row\.tenant_id = v_uid then\s+raise exception 'self_confirm'/)
    expect(sql).toMatch(/set confirmed_by = v_uid, confirmed_at = now\(\)/)
    expect(sql).toContain("'rent_confirmed'")
  })
  it('locks the function: revoke from public, anon, authenticated, then an explicit grant', () => {
    expect(sql).toContain('revoke all on function public.confirm_rent_payment(uuid, date) from public, anon, authenticated;')
    expect(sql).toContain('grant execute on function public.confirm_rent_payment(uuid, date) to authenticated, service_role;')
  })
  it('re-creates both facts RPCs (SECURITY INVOKER) with the evidence columns in rent_month / rent_all only', () => {
    const base = read('supabase/migrations/20261006_facts_lease_place.sql')
    const cols = 'tenant_id as recorded_by, confirmed_by, confirmed_at, evidence_path, evidence_name, evidence_at, note'
    expect(sql).toMatch(/create or replace function public\.lifecycle_facts_landlord\(\)\s+returns jsonb language sql stable security invoker/)
    expect(sql).toMatch(/create or replace function public\.lifecycle_facts_tenant\(\)\s+returns jsonb language sql stable security invoker/)
    expect(sql).toContain(`rent_month as (select lease_id, due_date, status, amount, ${cols} from rent_payments`)
    expect(sql).toContain(`rent_all as (select id, lease_id, due_date, status, amount, paid_at, method, ${cols} from rent_payments`)
    // Everything else is verbatim: strip the two changed lines from both and compare the function bodies.
    const strip = (t: string) => t.slice(t.indexOf('create or replace function public.lifecycle_facts_landlord()')).replace(`, ${cols} from rent_payments`, ' from rent_payments').replace(`, ${cols} from rent_payments`, ' from rent_payments')
    expect(strip(sql)).toBe(strip(base))
    // The ALTER comes before the `language sql` bodies that reference the new columns.
    expect(sql.indexOf('add column if not exists confirmed_by')).toBeLessThan(sql.indexOf('create or replace function public.lifecycle_facts_landlord()'))
  })
})

describe('route app/api/rent/evidence', () => {
  const src = read('app/api/rent/evidence/route.ts')
  it('edge, JWT, per-user hourly limit that fails closed, no DELETE', () => {
    expect(src).toContain("export const runtime = 'edge'")
    expect(src).toContain("underHourlyLimit(`rent-evidence:${uid}`, 30, false)")
    expect(src).toContain('export async function POST(')
    expect(src).not.toMatch(/export async function (DELETE|GET|PUT|PATCH)/)
  })
  it('membership through the caller RLS client on the three lease pointers; the type gate is the shared one', () => {
    expect(src).toContain('.or(`current_lease_id.eq.${leaseId},previous_lease_id.eq.${leaseId},next_lease_id.eq.${leaseId}`)')
    expect(src).toContain('acceptEvidenceFile({ name: file.name, type: file.type, size: file.size })')
    expect(src).not.toMatch(/ALLOWED\s*=/)
  })
  it('records first through mark_rent_paid with the caller client, and its errors come back as 4xx', () => {
    expect(src).toContain("sb.rpc('mark_rent_paid', { p_lease: leaseId, p_due: due, p_paid_on: paidOn })")
    expect(src).toContain("if (!paidOn) return NextResponse.json({ error: 'not_recorded' }, { status: 409 })")
    expect(src).toContain('status(recErr.message)')
  })
  it('the server computes the hash; the only upload is by the service role; evidence is appended once', () => {
    expect(src).toContain("crypto.subtle.digest('SHA-256', buf)")
    const uploads = src.match(/\.upload\(/g) ?? []
    expect(uploads).toHaveLength(1)
    expect(src).toContain("admin.storage.from('tenancy-files').upload(path, buf, { contentType: accept.mime, upsert: false })")
    expect(src).toContain('evidencePath(householdId, leaseId, due, sha256, accept.ext)')
    expect(src).toContain(".is('evidence_path', null)")
    expect(src).toContain("{ error: 'evidence_exists' }, { status: 409 }")
    expect(src).not.toMatch(/\.remove\(/)
  })
  it('writes the audit event with the acting role and the matter', () => {
    expect(src).toContain("action: 'rent_evidence_attached'")
    expect(src).toMatch(/metadata: \{ lease_id: leaseId, household_id: householdId, due_date: due, sha256/)
    expect(src).toContain('actingRole,')
  })
})

describe('hub rent tab + RentPeriodRow', () => {
  const page = read('app/h/[id]/page.tsx')
  const row = read('components/household/RentPeriodRow.tsx')
  it('the page calls confirm_rent_payment and renders both lists through RentPeriodRow', () => {
    expect(page).toContain("supabase.rpc('confirm_rent_payment', { p_lease: leaseId, p_due: due })")
    expect((page.match(/<RentPeriodRow /g) ?? []).length).toBe(2)
    expect(page).toContain('data-testid="rent-evidence-note"')
    expect(page).toContain('记录 + 对方确认 + 回执 = 这一期有凭证；导出聊天记录时一并带出。')
  })
  it('no native confirm dialogs anywhere in the flow', () => {
    expect(page).not.toContain('window.confirm')
    expect(row).not.toContain('window.confirm')
    expect(row).not.toMatch(/\balert\(/)
  })
  it('the row: recorder shown, confirm only for the other side, attach via the route, view via a short signed URL', () => {
    expect(row).toContain('periodEvidenceState(record, p.myUid)')
    expect(row).toContain('data-testid="rent-confirm"')
    expect(row).toContain('ev.canConfirm ?')
    expect(row).toContain('data-testid="rent-attach-evidence"')
    expect(row).toContain("fetch('/api/rent/evidence'")
    expect(row).toContain("createSignedUrl(record.evidence_path, 600)")
    expect(row).toContain('shortSha(record.evidence_sha256)')
    expect(row).toContain('data-testid="rent-note"')
    expect(row).not.toMatch(/\.(delete|remove)\(/)
  })
})

describe('dashboards carry the 凭证 column', () => {
  it('landlord ledger: reads the marks, one more column, links to the hub', () => {
    const s = read('components/landlord/RentLedger.tsx')
    expect(s).toContain("select('id, tenant_id, confirmed_by, confirmed_at, evidence_path, evidence_name, evidence_at')")
    expect(s).toContain("zh ? '凭证' : 'Evidence'")
    expect(s).toContain('evidenceBadge(r, user?.id ?? null)')
    expect(s).toContain('data-testid="rent-evidence-badge"')
  })
  it('tenant list: the badge rides on the facts row and links to the hub', () => {
    const s = read('components/tenant/MyRent.tsx')
    expect(s).toContain('evidenceBadge({ ...marks, status: p.status }, user?.id ?? null)')
    expect(s).toContain('data-testid="rent-evidence-badge"')
    expect(s).toContain('href={`/h/${r.household_id}?tab=rent`} data-testid="rent-evidence-badge"')
  })
})

describe('a paid-late period is not outstanding (prod check 2026-10-16)', () => {
  it('isRentOutstanding agrees with the ledger: late = recorded, due = outstanding', async () => {
    const { isRentOutstanding } = await import('../lib/matters/states')
    const { isRecordedPayment } = await import('../lib/household/ledger')
    expect(isRentOutstanding({ status: 'due' })).toBe(true)
    expect(isRentOutstanding({ status: 'late' })).toBe(false)
    expect(isRentOutstanding({ status: 'paid' })).toBe(false)
    expect(isRecordedPayment({ status: 'late' })).toBe(true)
  })
})

