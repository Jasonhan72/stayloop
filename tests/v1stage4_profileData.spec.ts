// V1.0 阶段 4 · 乙 #7 · G13 — the applicant pack's data layer: freshness rules,
// the profile → /apply mapping, the consent text, and (by source grep) the
// migration and the three routes. Contract: design/applicant-pack-contract-2026-10.md.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { freshness, freshnessThresholds, worstFreshness } from '@/lib/profile/freshness'
import { APPLICANT_PROFILE_CONSENT_TEXT, APPLICANT_PROFILE_CONSENT_VERSION, hasCurrentConsent, presentedMetadata } from '@/lib/profile/consent'
import { buildStayloopHistory, isDualSignedLease, isLateOver7 } from '@/lib/profile/history'
import {
  acceptProfileFile,
  attachedFilePath,
  PROFILE_FILE_KIND_IDS,
  PROFILE_FILE_KINDS,
  PROFILE_FILE_MAX_BYTES,
  PROFILE_FILES_PER_KIND,
  PROFILE_FILES_TOTAL,
  profileFilePath,
  profileToApplyForm,
  safeFileName,
  toApplicationFile,
  toApplicationFileKind,
  type ApplicantProfile,
  type ProfileHistoryEntry,
  type StayloopHistoryEntry,
} from '@/lib/profile/types'

const read = (p: string) => readFileSync(p, 'utf8')
const MIG = read('supabase/migrations/20261016_applicant_profiles.sql')
const FILES_ROUTE = read('app/api/profile/files/route.ts')
const ATTACH_ROUTE = read('app/api/profile/attach/route.ts')
const APPLY_PAGE = read('app/apply/[slug]/page.tsx')
const UID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const SHA = 'abcdef12' + 'f'.repeat(56)
const T = new Date('2026-10-16T12:00:00Z')

// ── freshness ──────────────────────────────────────────────────────────────────
describe('freshness — thresholds and boundaries', () => {
  it('paystub / statement: 90 fresh, 91 aging, 180 aging, 181 stale', () => {
    expect(freshness('paystub', '2026-07-18', T)).toMatchObject({ days: 90, state: 'fresh' })
    expect(freshness('paystub', '2026-07-17', T)).toMatchObject({ days: 91, state: 'aging' })
    expect(freshness('bank_statement', '2026-04-19', T)).toMatchObject({ days: 180, state: 'aging' })
    expect(freshness('bank_statement', '2026-04-18', T)).toMatchObject({ days: 181, state: 'stale' })
  })
  it('employment letter: 180 / 365; credit report: 90 / 180', () => {
    expect(freshness('employment_letter', '2026-04-19', T).state).toBe('fresh')
    expect(freshness('employment_letter', '2026-04-18', T).state).toBe('aging')
    expect(freshness('employment_letter', '2025-10-16', T)).toMatchObject({ days: 365, state: 'aging' })
    expect(freshness('employment_letter', '2025-10-15', T).state).toBe('stale')
    expect(freshness('credit_report', '2026-07-17', T).state).toBe('aging')
    expect(freshness('credit_report', '2026-04-18', T).state).toBe('stale')
    expect(freshnessThresholds('credit_report')).toEqual({ aging: 90, stale: 180 })
    expect(freshnessThresholds('reference')).toBeNull()
  })
  it('ID goes by its expiry: expired = stale, within 30 days = aging, otherwise fresh', () => {
    expect(freshness('id', '2026-10-15', T)).toMatchObject({ days: 1, state: 'stale' })
    expect(freshness('id', '2026-10-16', T)).toMatchObject({ days: 0, state: 'aging' })
    expect(freshness('id', '2026-11-15', T)).toMatchObject({ days: -30, state: 'aging' })
    expect(freshness('id', '2026-11-16', T)).toMatchObject({ days: -31, state: 'fresh' })
    expect(freshness('id', '2030-01-01', T).suggestZh).toBe('')
  })
  it('reference / other are never judged; a missing date reads as fresh', () => {
    expect(freshness('reference', '2020-01-01', T).state).toBe('fresh')
    expect(freshness('other', '2020-01-01', T).state).toBe('fresh')
    expect(freshness('paystub', null, T)).toEqual({ days: 0, state: 'fresh', suggestZh: '', suggestEn: '' })
    expect(freshness('paystub', 'not a date', T).state).toBe('fresh')
  })
  it('accepts an ISO timestamp (uploaded_at) and a Date; suggestions come in both languages', () => {
    expect(freshness('paystub', '2026-04-01T09:00:00.000Z', T).state).toBe('stale')
    expect(freshness('paystub', new Date('2026-04-01T09:00:00Z'), T).state).toBe('stale')
    const f = freshness('credit_report', '2026-05-01', T)
    expect(f.suggestZh).toMatch(/信用报告/)
    expect(f.suggestEn).toMatch(/credit report/)
    expect(worstFreshness(['fresh', 'aging', 'stale'])).toBe('stale')
    expect(worstFreshness(['fresh', 'aging'])).toBe('aging')
    expect(worstFreshness([])).toBe('fresh')
  })
})

// ── profile → /apply form ──────────────────────────────────────────────────────
function applyFormKeys(): Set<string> {
  const m = /const \[form, setForm\] = useState\(\{([\s\S]*?)\}\)/.exec(APPLY_PAGE)
  if (!m) throw new Error('apply form useState not found')
  const keys = new Set<string>()
  for (const k of m[1].matchAll(/([a-z_]+):/g)) keys.add(k[1])
  return keys
}

const PROFILE: ApplicantProfile = {
  auth_id: UID, first_name: 'Mia', last_name: 'Chen', phone: '416 555 0100', current_address: '1207-55 King St W, Toronto',
  date_of_birth: '1994-05-14', employment_status: 'Full-time employed', employer_name: 'Acme Inc.', job_title: 'Analyst',
  employment_start_date: '2022-03-01', monthly_income: 6200, employer_phone: '', employer_email: null,
  num_occupants: 2, has_pets: true, pet_details: 'one cat', is_smoker: false, additional_notes: '  ',
  consent_version: null, consent_at: null, created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z',
}
const HISTORY: ProfileHistoryEntry = {
  id: 'h1', auth_id: UID, position: 0, prev_address: '12 Elm Ave', prev_landlord_name: 'Sarah Wang', prev_landlord_phone: '416 555 0199',
  prev_landlord_email: 'sw@example.com', prev_rent: 2400, prev_move_in: '2023-06-01', prev_move_out: '2026-05-31', reason_for_leaving: 'Closer to work',
  created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z',
}

describe('profileToApplyForm — only non-empty values, only the apply form’s own keys', () => {
  it('every key it emits exists in the /apply form state', () => {
    const keys = applyFormKeys()
    expect(keys.has('first_name')).toBe(true)
    const out = profileToApplyForm(PROFILE, HISTORY)
    for (const k of Object.keys(out)) expect(keys.has(k), `unknown apply form key ${k}`).toBe(true)
    // The whole mapped surface is covered once: profile + history.
    const expected = ['first_name', 'last_name', 'phone', 'date_of_birth', 'current_address', 'employment_status', 'employer_name', 'job_title',
      'monthly_income', 'employment_start_date', 'num_occupants', 'has_pets', 'pet_details', 'prev_address', 'prev_landlord_name', 'prev_landlord_phone',
      'prev_rent', 'prev_move_in', 'prev_move_out', 'reason_for_leaving']
    expect(Object.keys(out).sort()).toEqual(expected.sort())
  })
  it('gives strings the form stores (numbers and booleans as strings), skips empty / null / false', () => {
    const out = profileToApplyForm(PROFILE, HISTORY)
    expect(out.monthly_income).toBe('6200')
    expect(out.num_occupants).toBe('2')
    expect(out.has_pets).toBe('true')
    expect(out).not.toHaveProperty('is_smoker')
    expect(out).not.toHaveProperty('employer_phone')
    expect(out).not.toHaveProperty('employer_email')
    expect(out).not.toHaveProperty('additional_notes')
    expect(out).not.toHaveProperty('email')
    expect(out).not.toHaveProperty('prev_landlord_email')
    for (const v of Object.values(out)) expect(typeof v === 'string' && v.length > 0).toBe(true)
  })
  it('an empty pack maps to nothing; a Stayloop-confirmed tenancy fills address, dates and landlord name only', () => {
    expect(profileToApplyForm(null)).toEqual({})
    expect(profileToApplyForm({}, null)).toEqual({})
    const s: StayloopHistoryEntry = { source: 'stayloop', address: '100 Test Ave', unit: '1', city: 'Toronto', start: '2026-08-01', end: '2027-07-31', onTime: 2, lateOver7: 0, total: 2, landlordName: 'Test Landlord' }
    const out = profileToApplyForm({}, s)
    expect(out).toEqual({ prev_address: '100 Test Ave, #1, Toronto', prev_landlord_name: 'Test Landlord', prev_move_in: '2026-08-01', prev_move_out: '2027-07-31' })
  })
})

// ── consent ────────────────────────────────────────────────────────────────────
describe('consent — version and the five points', () => {
  it('version string and both languages cover purpose / content / who sees / retention / withdrawal', () => {
    expect(APPLICANT_PROFILE_CONSENT_VERSION).toBe('profile-v1-2026-10')
    for (const lang of ['zh', 'en'] as const) {
      const t = APPLICANT_PROFILE_CONSENT_TEXT[lang]
      expect(t.points).toHaveLength(5)
      const all = t.intro + t.points.map((p) => p.title + p.body).join(' ')
      if (lang === 'zh') {
        expect(all).toMatch(/只用于向我选择的房东/)
        expect(all).toMatch(/我填写的资料/)
        expect(all).toMatch(/Stayloop 不主动提供给任何人/)
        expect(all).toMatch(/随时删除/)
        expect(all).toMatch(/删除即撤回/)
        expect(all).toMatch(/由房东保管/)
      } else {
        expect(all).toMatch(/landlords or agents I choose/)
        expect(all).toMatch(/files I uploaded/)
        expect(all).toMatch(/never hands it to anyone/)
        expect(all).toMatch(/delete any item, or the whole pack/)
        expect(all).toMatch(/Deleting is withdrawing/)
      }
      // The pack never claims Stayloop looks anyone up.
      expect(all).not.toMatch(/法庭|court|信用局查询|credit bureau/i)
    }
    expect(hasCurrentConsent({ consent_version: 'profile-v1-2026-10', consent_at: '2026-10-16T00:00:00Z' })).toBe(true)
    expect(hasCurrentConsent({ consent_version: 'profile-v0', consent_at: '2026-10-16T00:00:00Z' })).toBe(false)
    expect(hasCurrentConsent(null)).toBe(false)
  })
  it('presentedMetadata has the contract shape {to, application_id?, scope[]}', () => {
    expect(presentedMetadata('application', ['id', 'paystub', 'id'], UID)).toEqual({ to: 'application', application_id: UID, scope: ['id', 'paystub'] })
    expect(presentedMetadata('pdf', ['other'])).toEqual({ to: 'pdf', scope: ['other'] })
  })
})

// ── files: kinds, gate, paths ──────────────────────────────────────────────────
describe('file kinds, the type gate and the storage paths', () => {
  it('seven kinds in the contract order with zh / en label and hint', () => {
    expect(PROFILE_FILE_KIND_IDS).toEqual(['id', 'paystub', 'bank_statement', 'employment_letter', 'credit_report', 'reference', 'other'])
    for (const k of PROFILE_FILE_KINDS) {
      expect(k.label.zh.length).toBeGreaterThan(0)
      expect(k.label.en.length).toBeGreaterThan(0)
      expect(k.hint.zh.length).toBeGreaterThan(0)
      expect(k.hint.en.length).toBeGreaterThan(0)
    }
    expect(PROFILE_FILES_PER_KIND).toBe(6)
    expect(PROFILE_FILES_TOTAL).toBe(20)
    expect(PROFILE_FILE_MAX_BYTES).toBe(25 * 1024 * 1024)
  })
  it('accepts jpeg / png / webp / heic / pdf (HEIC by extension when the type is empty), refuses the rest and 25 MB+', () => {
    expect(acceptProfileFile({ name: 'a.pdf', type: 'application/pdf', size: 10 })).toEqual({ ok: true, mime: 'application/pdf', ext: 'pdf' })
    expect(acceptProfileFile({ name: 'IMG.HEIC', type: '', size: 10 })).toEqual({ ok: true, mime: 'image/heic', ext: 'heic' })
    expect(acceptProfileFile({ name: 'x.docx', type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: 10 })).toEqual({ ok: false, reason: 'file_type' })
    expect(acceptProfileFile({ name: 'x.html', type: 'text/html', size: 10 })).toEqual({ ok: false, reason: 'file_type' })
    expect(acceptProfileFile({ name: 'x.pdf', type: 'application/pdf', size: PROFILE_FILE_MAX_BYTES + 1 })).toEqual({ ok: false, reason: 'file_size' })
    expect(acceptProfileFile({ name: 'x.pdf', type: 'application/pdf', size: 0 })).toEqual({ ok: false, reason: 'empty' })
  })
  it('paths: profile/<uid>/<kind>/<sha8>-<safe-name> and <application_id>/<kind>/<sha8>-<safe-name>', () => {
    expect(profileFilePath(UID, 'paystub', SHA, 'Pay Stub (Sept).pdf', 'pdf')).toBe(`profile/${UID}/paystub/abcdef12-Pay_Stub_Sept.pdf`)
    expect(attachedFilePath('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'credit_report', SHA, '报告.pdf', 'pdf')).toBe('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/credit_report/abcdef12-file.pdf')
    expect(safeFileName('../../etc/passwd', 'pdf')).not.toMatch(/\//)
    expect(safeFileName('', 'jpg')).toBe('file.jpg')
    expect(safeFileName('.htaccess', 'pdf')).toBe('file.pdf')
    expect(safeFileName('evil.html', 'pdf')).toBe('evil.pdf')
    expect(safeFileName('scan.PDF', 'pdf')).toBe('scan.pdf')
    expect(safeFileName('x'.repeat(200) + '.pdf', 'pdf').length).toBeLessThanOrEqual(84)
  })
  it('the pack’s seven kinds travel to /apply as its five FileKinds (credit_report / reference → other)', () => {
    expect(toApplicationFileKind('id')).toBe('id')
    expect(toApplicationFileKind('employment_letter')).toBe('employment_letter')
    expect(toApplicationFileKind('credit_report')).toBe('other')
    expect(toApplicationFileKind('reference')).toBe('other')
    const f = toApplicationFile({ kind: 'reference', name: 'ref.pdf', size: 12, mime: 'application/pdf' }, 'app/other/ab-ref.pdf', '2026-10-16T00:00:00Z')
    expect(f).toEqual({ kind: 'other', type: 'other', path: 'app/other/ab-ref.pdf', name: 'ref.pdf', size: 12, mime: 'application/pdf', uploaded_at: '2026-10-16T00:00:00Z' })
  })
})

// ── Stayloop history (pure fold) ───────────────────────────────────────────────
describe('buildStayloopHistory — the /p/<token> test, counts only', () => {
  const LEASE_A = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
  const LEASE_B = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
  const sig = { name: 'X' }
  it('a verified household counts, an unverified one with a typed `active` lease does not; dual-signed counts on its own', () => {
    const out = buildStayloopHistory(
      [
        { id: 'h1', verified: true, current_lease_id: LEASE_A, previous_lease_id: null, address: '100 Test Ave', unit: '1', city: 'Toronto', start_date: '2026-08-01', end_date: '2027-07-31' },
        { id: 'h2', verified: false, current_lease_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', previous_lease_id: null, address: '9 Fake St', unit: null, city: null, start_date: null, end_date: null },
      ],
      [
        { id: LEASE_A, status: 'active', signed_at: null, landlord_signature: null, tenant_signature: null, tenant_email: 't@x', start_date: '2026-08-01', end_date: '2027-07-31', unit_label: null, terms: { landlord_legal_name: 'Test Landlord' } },
        { id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', status: 'active', signed_at: null, landlord_signature: null, tenant_signature: null, tenant_email: 't@x', start_date: null, end_date: null, unit_label: null, terms: null },
        { id: LEASE_B, status: 'signed_both', signed_at: '2025-01-01T00:00:00Z', landlord_signature: sig, tenant_signature: sig, tenant_email: 't@x', start_date: '2025-02-01', end_date: '2026-01-31', unit_label: '4B', terms: { unit: { street: '12 Elm Ave', city: 'Toronto' } } },
      ],
      [
        { lease_id: LEASE_A, due_date: '2026-08-01', status: 'paid', paid_at: '2026-08-01T00:00:00Z' },
        { lease_id: LEASE_A, due_date: '2026-09-01', status: 'late', paid_at: '2026-09-12T00:00:00Z' },
        { lease_id: LEASE_A, due_date: '2026-10-01', status: 'late', paid_at: '2026-10-03T00:00:00Z' },
        { lease_id: LEASE_A, due_date: '2026-11-01', status: 'due', paid_at: null },
        { lease_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', due_date: '2026-10-01', status: 'paid', paid_at: '2026-10-01T00:00:00Z' },
      ],
    )
    expect(out).toHaveLength(2)
    expect(out[0]).toEqual({ source: 'stayloop', address: '100 Test Ave', unit: '1', city: 'Toronto', start: '2026-08-01', end: '2027-07-31', onTime: 1, lateOver7: 1, total: 3, landlordName: 'Test Landlord' })
    // The dual-signed lease has no household: address from the lease terms, the landlord from the signature.
    expect(out[1]).toEqual({ source: 'stayloop', address: '12 Elm Ave', unit: '4B', city: 'Toronto', start: '2025-02-01', end: '2026-01-31', onTime: 0, lateOver7: 0, total: 0, landlordName: 'X' })
    expect(JSON.stringify(out)).not.toMatch(/amount|monthly_rent/)
  })
  it('dual-signed needs all four marks; late over 7 is strictly more than 7 days', () => {
    expect(isDualSignedLease({ status: 'signed_both', signed_at: 'x', landlord_signature: sig, tenant_signature: null })).toBe(false)
    expect(isDualSignedLease({ status: 'active', signed_at: 'x', landlord_signature: sig, tenant_signature: sig })).toBe(false)
    expect(isLateOver7({ due_date: '2026-09-01', paid_at: '2026-09-08T23:00:00Z' })).toBe(false)
    expect(isLateOver7({ due_date: '2026-09-01', paid_at: '2026-09-09T00:00:00Z' })).toBe(true)
    expect(isLateOver7({ due_date: '2026-09-01', paid_at: null })).toBe(false)
  })
})

// ── migration text ─────────────────────────────────────────────────────────────
describe('migration 20261016_applicant_profiles.sql', () => {
  it('creates the three tables with RLS and the contract columns', () => {
    for (const t of ['applicant_profiles', 'applicant_profile_history', 'applicant_profile_files']) {
      expect(MIG).toMatch(new RegExp(`create table if not exists public\\.${t}`))
      expect(MIG).toMatch(new RegExp(`alter table public\\.${t} enable row level security`))
      expect(MIG).toMatch(new RegExp(`revoke all on public\\.${t} from public, anon, authenticated, service_role`))
    }
    expect(MIG).toMatch(/auth_id\s+uuid primary key references auth\.users\(id\) on delete cascade/)
    for (const col of ['first_name', 'last_name', 'phone', 'current_address', 'date_of_birth', 'employment_status', 'employer_name', 'job_title', 'employment_start_date', 'monthly_income', 'employer_phone', 'employer_email', 'num_occupants', 'has_pets', 'pet_details', 'is_smoker', 'additional_notes', 'consent_version', 'consent_at']) {
      expect(MIG, col).toMatch(new RegExp(`\\n\\s+${col}\\s`))
    }
    for (const col of ['position', 'prev_address', 'prev_landlord_name', 'prev_landlord_phone', 'prev_landlord_email', 'prev_rent', 'prev_move_in', 'prev_move_out', 'reason_for_leaving']) {
      expect(MIG, col).toMatch(new RegExp(`\\n\\s+${col}\\s`))
    }
    expect(MIG).toMatch(/kind\s+text not null check \(kind in \('id','paystub','bank_statement','employment_letter','credit_report','reference','other'\)\)/)
    expect(MIG).toMatch(/path\s+text not null unique/)
    expect(MIG).toMatch(/sha256 ~ '\^\[0-9a-f\]\{64\}\$'/)
    expect(MIG).toMatch(/char_length\(name\) <= 160/)
    expect(MIG).toMatch(/char_length\(mime\) <= 80/)
    expect(MIG).toMatch(/char_length\(additional_notes\) <= 2000/)
    expect(MIG).toMatch(/updated_at := clock_timestamp\(\)/)
    expect(MIG).toMatch(/create trigger trg_applicant_profiles_touch before update/)
  })
  it('RLS: four own policies on profiles and history, select + delete only on files, no client insert on files', () => {
    for (const t of ['applicant_profiles', 'applicant_profile_history']) {
      for (const op of ['select', 'insert', 'update', 'delete']) {
        expect(MIG).toMatch(new RegExp(`create policy ${t}_own_${op} on public\\.${t}\\n\\s+for ${op} to authenticated`))
      }
      expect(MIG).toMatch(new RegExp(`grant select, insert, update, delete on public\\.${t} to authenticated`))
    }
    expect(MIG).toMatch(/create policy applicant_profile_files_own_select on public\.applicant_profile_files\n\s+for select to authenticated using \(auth_id = auth\.uid\(\)\)/)
    expect(MIG).toMatch(/create policy applicant_profile_files_own_delete on public\.applicant_profile_files\n\s+for delete to authenticated/)
    expect(MIG).not.toMatch(/create policy applicant_profile_files_own_(insert|update)/)
    expect(MIG).toMatch(/grant select, delete on public\.applicant_profile_files to authenticated/)
    expect(MIG).not.toMatch(/grant (select, )?insert[^\n]*applicant_profile_files to authenticated/)
    // Every policy is the owner's own row.
    const policies = MIG.match(/create policy applicant_[^\n]*\n[^\n]*/g) ?? []
    expect(policies.length).toBe(10)
    for (const p of policies) expect(p).toMatch(/auth_id = auth\.uid\(\)/)
  })
  it('bucket: profile_file_readable keys on profile/<uid>/<kind>, select only, no client insert policy for the prefix', () => {
    expect(MIG).toMatch(/create or replace function public\.profile_file_readable\(p_name text\)[\s\S]*security definer/)
    expect(MIG).toMatch(/v_parts\[1\] <> 'profile'/)
    expect(MIG).toMatch(/v_parts\[2\] <> v_uid::text/)
    expect(MIG).toMatch(/revoke execute on function public\.profile_file_readable\(text\) from public, anon, authenticated, service_role/)
    expect(MIG).toMatch(/grant execute on function public\.profile_file_readable\(text\) to authenticated, service_role/)
    expect(MIG).toMatch(/create policy tenant_files_profile_select on storage\.objects\n\s+for select to authenticated\n\s+using \(bucket_id = 'tenant-files' and public\.profile_file_readable\(name\)\)/)
    expect(MIG).not.toMatch(/create policy tenant_files_profile_insert/)
    expect(MIG).not.toMatch(/for insert to anon/)
  })
})

// ── routes (source) ────────────────────────────────────────────────────────────
describe('POST / DELETE /api/profile/files', () => {
  it('signed-in only, per-user fail-closed limiter, whitelist types, server SHA-256, service role is the only writer', () => {
    expect(FILES_ROUTE).toMatch(/export const runtime = 'edge'/)
    expect(FILES_ROUTE).toMatch(/sign_in_required/)
    expect(FILES_ROUTE).toMatch(/underHourlyLimit\(`profile-files:\$\{uid\}`, 30, false\)/)
    expect(FILES_ROUTE).toMatch(/acceptProfileFile\(/)
    expect(FILES_ROUTE).toMatch(/crypto\.subtle\.digest\('SHA-256', buf\)/)
    expect(FILES_ROUTE).toMatch(/isProfileFileKind\(kind\)/)
    expect(FILES_ROUTE).toMatch(/PROFILE_FILES_PER_KIND/)
    expect(FILES_ROUTE).toMatch(/PROFILE_FILES_TOTAL/)
    // One upload call, on the service-role client, with the server's bytes.
    const uploads = FILES_ROUTE.match(/\.upload\(/g) ?? []
    expect(uploads).toHaveLength(1)
    expect(FILES_ROUTE).toMatch(/svc\.storage\.from\(BUCKET\)\.upload\(path, buf, \{ contentType: accept\.mime, upsert: false \}\)/)
    expect(FILES_ROUTE).toMatch(/svc\s*\n?\s*\.from\('applicant_profile_files'\)\s*\n?\s*\.insert\(/)
    expect(FILES_ROUTE).not.toMatch(/sb\.from\('applicant_profile_files'\)\.insert/)
    expect(FILES_ROUTE).toMatch(/duplicate: true/)
    expect(FILES_ROUTE).toMatch(/action: 'applicant_pack_file_added'/)
  })
  it('DELETE removes the object then the owner’s row and audits', () => {
    expect(FILES_ROUTE).toMatch(/export async function DELETE/)
    expect(FILES_ROUTE).toMatch(/searchParams\.get\('id'\)/)
    expect(FILES_ROUTE).toMatch(/startsWith\(`profile\/\$\{uid\}\/`\)/)
    expect(FILES_ROUTE).toMatch(/svc\.storage\.from\(BUCKET\)\.remove\(\[r\.path\]\)/)
    expect(FILES_ROUTE).toMatch(/\.delete\(\)\.eq\('id', r\.id\)\.eq\('auth_id', uid\)/)
    expect(FILES_ROUTE).toMatch(/action: 'applicant_pack_file_removed'/)
  })
})

describe('POST /api/profile/attach', () => {
  it('checks email / 1 hour / empty files, copies with the service role, never calls attach_application_files', () => {
    expect(ATTACH_ROUTE).toMatch(/export const runtime = 'edge'/)
    expect(ATTACH_ROUTE).toMatch(/underHourlyLimit\(`profile-attach:\$\{uid\}`, 30, false\)/)
    expect(ATTACH_ROUTE).toMatch(/\.toLowerCase\(\) !== jwtEmail/)
    expect(ATTACH_ROUTE).toMatch(/not_your_application/)
    expect(ATTACH_ROUTE).toMatch(/60 \* 60 \* 1000\) return NextResponse\.json\(\{ error: 'application_too_old' \}/)
    expect(ATTACH_ROUTE).toMatch(/application_has_files/)
    expect(ATTACH_ROUTE).toMatch(/f\.auth_id === uid && f\.path\.startsWith\(`profile\/\$\{uid\}\/`\)/)
    expect(ATTACH_ROUTE).toMatch(/attachedFilePath\(appId, f\.kind, sha/)
    expect(ATTACH_ROUTE).toMatch(/svc\.storage\.from\(BUCKET\)\.copy\(f\.path, dest\)/)
    expect(ATTACH_ROUTE).toMatch(/svc\.storage\.from\(BUCKET\)\.download\(f\.path\)/)
    // No RPC at all: the apply page merges the manifest and calls attach_application_files itself.
    expect(ATTACH_ROUTE).not.toMatch(/\.rpc\(/)
    expect(ATTACH_ROUTE).toMatch(/toApplicationFile\(f, dest, now\)/)
    expect(ATTACH_ROUTE).toMatch(/action: 'applicant_pack_presented'/)
    expect(ATTACH_ROUTE).toMatch(/presentedMetadata\('application'/)
  })
})

describe('employment status maps between the pack keys and the /apply select values', () => {
  it('pack → apply and apply → pack, raw keys never leak', async () => {
    const { toApplyEmploymentStatus, toPackEmploymentStatus, profileToApplyForm } = await import('../lib/profile/types')
    expect(toApplyEmploymentStatus('employed')).toBe('Full-time employed')
    expect(toApplyEmploymentStatus('self_employed')).toBe('Self-employed')
    expect(toApplyEmploymentStatus('unemployed')).toBe('Other')
    expect(toApplyEmploymentStatus('Student')).toBe('Student')
    expect(toApplyEmploymentStatus('garbage')).toBeNull()
    expect(toPackEmploymentStatus('Part-time employed')).toBe('employed')
    expect(toPackEmploymentStatus('Self-employed')).toBe('self_employed')
    expect(toPackEmploymentStatus('other')).toBe('other')
    const form = profileToApplyForm({ employment_status: 'retired' } as never, null)
    expect(form.employment_status).toBe('Retired')
    const fs = await import('node:fs')
    expect(fs.readFileSync('app/apply/[slug]/page.tsx', 'utf8')).toMatch(/employment_status: toPackEmploymentStatus\(form\.employment_status\)/)
  })
})

