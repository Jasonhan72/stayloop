// @vitest-environment jsdom
// V1.0 阶段 4 · 乙 #7 申请包 · G15: "fill from my application pack" on /apply/[slug]
// (design/applicant-pack-contract-2026-10.md). Guards:
//  · UseMyPack renders a link when the account has no pack; with a pack the button fills
//    ONLY the fields still empty (the typed first name survives), the previous-tenancy
//    fields come along, stale / aging files start unticked and kinds the listing does not
//    collect are not offered; without consent on the pack page the file list is disabled.
//  · the apply page copies ticked pack files through POST /api/profile/attach and merges
//    the manifest BEFORE the single attach_application_files call; "save as my pack"
//    writes the profile + a history row and never the consent columns.
//  · the tenant's fifth quick-start card is "build my application pack" (no more
//    passport-badge card); no window.confirm / alert, no badge wording anywhere here.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import React from 'react'
import { act, cleanup, fireEvent, render as rtlRender } from '@testing-library/react'
import { all, textOf } from './helpers/dom'

const db = vi.hoisted(() => ({ tables: {} as Record<string, unknown[]> }))
vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => React.createElement('a', { href, ...rest }, children) }))
vi.mock('@/lib/supabase', () => {
  const chain = (table: string) => {
    const rows = db.tables[table] ?? []
    const c: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'order', 'limit', 'in']) c[m] = () => c
    c.maybeSingle = async () => ({ data: rows[0] ?? null, error: null })
    c.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(res, rej)
    return c
  }
  return { supabase: { from: chain, auth: { getSession: async () => ({ data: { session: null } }) }, rpc: vi.fn() } }
})

import UseMyPack, { defaultPackSelection, fillOnlyEmpty } from '../components/apply/UseMyPack'
import { INTAKES } from '../lib/agent/intake'
import type { ApplicantProfile, ProfileFile, ProfileHistoryEntry } from '../lib/profile/types'

const read = (p: string) => readFileSync(p, 'utf8')
const byId = (root: ParentNode, id: string) => all(root, `[data-testid="${id}"]`)
const flush = async () => { await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve() }) }

afterEach(cleanup)

const UID = '11111111-1111-4111-8111-111111111111'
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString()
const profile = (over: Partial<ApplicantProfile> = {}): ApplicantProfile => ({
  auth_id: UID, first_name: 'Mia', last_name: 'Chen', phone: '416 555 0100', current_address: '1 King St W, Toronto', date_of_birth: null,
  employment_status: 'Full-time employed', employer_name: 'Acme Inc.', job_title: 'Analyst', employment_start_date: '2024-02-01', monthly_income: 6200,
  employer_phone: null, employer_email: null, num_occupants: 2, has_pets: true, pet_details: 'one cat', is_smoker: false, additional_notes: null,
  consent_version: 'profile-v1-2026-10', consent_at: daysAgo(1), created_at: daysAgo(30), updated_at: daysAgo(1), ...over,
})
const history: ProfileHistoryEntry = {
  id: 'h1', auth_id: UID, position: 0, prev_address: '9 Queen St E', prev_landlord_name: 'Sarah Wang', prev_landlord_phone: '647 555 0199', prev_landlord_email: null,
  prev_rent: 2100, prev_move_in: '2023-01-01', prev_move_out: '2025-12-31', reason_for_leaving: 'Moving closer to work', created_at: daysAgo(30), updated_at: daysAgo(30),
}
const file = (id: string, kind: ProfileFile['kind'], over: Partial<ProfileFile> = {}): ProfileFile => ({
  id, auth_id: UID, kind, path: `profile/${UID}/${kind}/${id}-${kind}.pdf`, name: `${kind}-${id}.pdf`, size: 1000, mime: 'application/pdf', sha256: 'a'.repeat(64), as_of: null, uploaded_at: daysAgo(5), ...over,
})
const FILES: ProfileFile[] = [
  file('f-fresh', 'paystub'),
  file('f-stale', 'paystub', { as_of: daysAgo(400).slice(0, 10) }),
  file('f-aging', 'bank_statement', { uploaded_at: daysAgo(120) }),
  file('f-id', 'id', { as_of: new Date(Date.now() + 500 * 86_400_000).toISOString().slice(0, 10) }),
  file('f-credit', 'credit_report'),
]
const ALLOWED = ['id', 'paystub', 'bank_statement', 'employment_letter']
const FORM = { first_name: 'Already', last_name: '', email: 'mia@example.com', phone: '', current_address: '', employment_status: 'Full-time employed', employer_name: '', job_title: '', monthly_income: '', employment_start_date: '', employer_phone: '', employer_email: '', prev_landlord_name: '', prev_landlord_phone: '', prev_address: '', prev_rent: '', prev_move_in: '', prev_move_out: '', reason_for_leaving: '', num_occupants: '1', has_pets: 'false', pet_details: '', is_smoker: 'false', move_in_date: '', additional_notes: '', consent_screening: false, consent_credit_check: false }

async function render(props: Partial<React.ComponentProps<typeof UseMyPack>> = {}) {
  const onFill = vi.fn(); const onSelect = vi.fn(); const onLoaded = vi.fn()
  let r!: ReturnType<typeof rtlRender>
  await act(async () => {
    r = rtlRender(React.createElement(UseMyPack, { zh: false, uid: UID, form: FORM, onFill, allowedKinds: ALLOWED, selected: [], onSelect, ownCount: 1, maxFiles: 20, onLoaded, ...props }))
  })
  await flush()
  return { root: r.container, onFill, onSelect, onLoaded }
}

describe('UseMyPack', () => {
  it('no pack → one line with a link to build one on /tenant/passport', async () => {
    db.tables = { applicant_profiles: [], applicant_profile_history: [], applicant_profile_files: [] }
    const { root, onLoaded } = await render()
    expect(byId(root, 'use-my-pack-none').length).toBe(1)
    expect(all(root, 'a').some((a) => a.getAttribute('href') === '/tenant/passport')).toBe(true)
    expect(byId(root, 'use-my-pack').length).toBe(0)
    expect(onLoaded).toHaveBeenCalledWith({ hasProfile: false, consented: false })
  })

  it('with a pack: the button fills only empty fields (typed first name kept), brings the prev_* fields, fresh files start ticked and stale / aging ones do not; kinds the listing does not collect are not offered', async () => {
    db.tables = { applicant_profiles: [profile()], applicant_profile_history: [history], applicant_profile_files: FILES }
    const { root, onFill, onSelect, onLoaded } = await render()
    expect(onLoaded).toHaveBeenCalledWith({ hasProfile: true, consented: true })
    expect(byId(root, 'use-my-pack-no-consent').length).toBe(0)
    // default selection: only the fresh paystub and the valid ID (credit_report is not a kind this listing collects)
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect([...onSelect.mock.calls[0][0]].sort()).toEqual(['f-fresh', 'f-id'])
    const rows = byId(root, 'use-my-pack-file')
    // grouped by the pack's kind order (id → paystub → bank_statement); credit_report is not offered
    expect(rows.map((n) => n.getAttribute('data-state'))).toEqual(['fresh', 'fresh', 'stale', 'aging'])
    const txt = JSON.stringify(rows.map((n) => all(n, 'span').map(textOf).concat(all(n, 'div').map(textOf))))
    expect(txt).toContain('days old')
    expect(txt).not.toContain('credit_report')
    // count line: own 1 + 0 selected (the parent owns `selected`)
    expect(textOf(byId(root, 'use-my-pack-count')[0])).toContain('1 / 20')
    await act(async () => { fireEvent.click(byId(root, 'use-my-pack-fill')[0]) })
    expect(onFill).toHaveBeenCalledTimes(1)
    const patch = onFill.mock.calls[0][0] as Record<string, string>
    expect(patch.first_name).toBeUndefined() // already typed
    expect(patch.email).toBeUndefined() // the page's own
    expect(patch.last_name).toBe('Chen')
    expect(patch.phone).toBe('416 555 0100')
    expect(patch.monthly_income).toBe('6200')
    expect(patch.has_pets).toBe('true')
    expect(patch.pet_details).toBe('one cat')
    expect(patch.employment_status).toBeUndefined() // the form default is not empty
    for (const k of ['prev_landlord_name', 'prev_landlord_phone', 'prev_address', 'prev_rent', 'reason_for_leaving', 'prev_move_in', 'prev_move_out']) expect(patch[k], k).toBeTruthy()
    expect(patch.prev_landlord_name).toBe('Sarah Wang')
    expect(byId(root, 'use-my-pack-filled').length).toBe(1)
  })

  it('without consent on the pack page the file checkboxes are disabled, nothing is pre-selected, and the note links to the pack page', async () => {
    db.tables = { applicant_profiles: [profile({ consent_version: null, consent_at: null })], applicant_profile_history: [], applicant_profile_files: FILES }
    const { root, onSelect } = await render()
    expect(byId(root, 'use-my-pack-no-consent').length).toBe(1)
    expect(onSelect).not.toHaveBeenCalled()
    const boxes = all<HTMLInputElement>(root, 'input').filter((n) => n.type === 'checkbox')
    expect(boxes.length).toBe(4)
    for (const b of boxes) expect(b.disabled).toBe(true)
  })

  it('the application row already exists → the fill button is disabled, files can still be ticked', async () => {
    db.tables = { applicant_profiles: [profile()], applicant_profile_history: [], applicant_profile_files: FILES }
    const { root } = await render({ locked: true, selected: ['f-fresh'] })
    expect((byId(root, 'use-my-pack-fill')[0] as HTMLButtonElement).disabled).toBe(true)
    expect(textOf(byId(root, 'use-my-pack-count')[0])).toContain('2 / 20')
  })

  it('pure helpers: fillOnlyEmpty skips filled keys and unknown keys; defaultPackSelection takes fresh files of allowed kinds only', () => {
    expect(fillOnlyEmpty({ a: 'x', b: '', c: null }, { a: '1', b: '2', c: '3', d: '4' })).toEqual({ b: '2', c: '3' })
    expect(fillOnlyEmpty({ b: '' }, { b: '  ' })).toEqual({})
    expect(defaultPackSelection(FILES, ALLOWED).sort()).toEqual(['f-fresh', 'f-id'])
    expect(defaultPackSelection(FILES, ['paystub'])).toEqual(['f-fresh'])
  })
})

describe('apply page wiring', () => {
  const apply = read('app/apply/[slug]/page.tsx')
  const pack = read('components/apply/UseMyPack.tsx')
  it('renders UseMyPack above the first section for signed-in applicants only', () => {
    expect(apply).toMatch(/\{signedIn && auth\.user && (!\(existingApp && !createdAppId\) && )?\(\s*<UseMyPack/)
    expect(apply.indexOf('<UseMyPack')).toBeLessThan(apply.indexOf('<Section tag="01"'))
    expect(apply).toMatch(/allowedKinds=\{fileKinds\.map\(\(k\) => k\.kind\)\}/)
    expect(apply).toMatch(/onLoaded=\{setPack\}/)
  })
  it('ticked pack files are copied through POST /api/profile/attach and merged before the single attach_application_files call; own uploads + pack count against MAX_FILES; a copy failure is shown and does not stop the rest', () => {
    expect(apply).toContain("fetch('/api/profile/attach'")
    expect(apply).toMatch(/Authorization: `Bearer \$\{token\}`/)
    const attachCall = apply.indexOf('await attachPackFiles(inserted.id, packFileIds)')
    const merge = apply.indexOf('uploaded.push(...packAttachedRef.current)')
    const rpc = apply.indexOf("supabase.rpc('attach_application_files'")
    expect(attachCall).toBeGreaterThan(0)
    expect(merge).toBeGreaterThan(attachCall)
    expect(rpc).toBeGreaterThan(merge)
    expect((apply.match(/supabase\.rpc\('attach_application_files'/g) || []).length).toBe(1)
    expect(apply).toMatch(/reduce\(\(n, k\) => n \+ files\[k\]\.length, 0\) \+ packFileIds\.length/)
    expect(apply).toMatch(/else setPackError\(/)
    expect(apply).toContain('data-testid="apply-pack-error"')
    expect(pack).toContain('data-testid="use-my-pack-count"')
  })
  it('"save this application as my pack" is offered only to accounts without a pack, maps the form onto the contract columns, writes a history row, and never the consent columns', () => {
    expect(apply).toMatch(/\{signedIn && pack && !pack\.hasProfile && !createdAppId && \(\s*<label data-testid="apply-save-as-pack"/)
    expect(apply).toMatch(/supabase\.from\('applicant_profiles'\)\.upsert\(\{\s*auth_id: uid,/)
    expect(apply).toMatch(/\{ onConflict: 'auth_id' \}/)
    expect(apply).toMatch(/supabase\.from\('applicant_profile_history'\)\.insert\(\{ auth_id: uid, position: 0, \.\.\.hist \}\)/)
    expect(apply).not.toMatch(/consent_version|consent_at/)
    expect(apply).toMatch(/if \(saveAsPack && signedIn && auth\.user && pack && !pack\.hasProfile\)/)
    // the files uploaded here are not copied into the pack — the page says so
    expect(apply).toContain('文件可在申请包页另外上传')
    expect(apply).not.toMatch(/applicant_profile_files'\)\.insert/)
  })
  it('no native dialogs, no badge wording', () => {
    for (const [name, src] of [['apply', apply], ['pack', pack], ['intake', read('lib/agent/intake.ts')], ['chat', read('components/agent/AgentChat.tsx')]] as const) {
      expect(src, name).not.toMatch(/window\.confirm|\balert\(/)
      expect(src, name).not.toMatch(/章|stamp/i)
      expect(src, name).not.toMatch(/验证一次|解锁|unlock/i)
    }
  })
})

describe('tenant quick-start card', () => {
  it('"build my application pack" replaces the badge card: the intake exists, the old key is gone, the card and the demo sentence match', () => {
    expect(INTAKES.applicant_pack).toBeTruthy()
    expect(INTAKES.applicant_pack.steps.length).toBe(3)
    expect(INTAKES.applicant_pack.outline.zh).toMatch(/^3 步/)
    expect(INTAKES.stamps).toBeUndefined()
    const chat = read('components/agent/AgentChat.tsx')
    expect(chat).toMatch(/key: 'applicant_pack', icon: '🗂️', label: \{ zh: '准备申请包', en: 'Build my application pack' \}/)
    expect(chat).not.toMatch(/key: 'stamps'/)
    // every composed sentence starts with the same request and is complete
    const q = { lang: 'zh' as const, attachments: 0, pick: () => 'income', picks: () => ['income'], text: () => '', labels: () => ['工作与收入'], said: () => '工作与收入', has: () => false }
    expect(INTAKES.applicant_pack.compose(q)).toMatch(/^帮我准备申请包：先准备「工作与收入」/)
    expect(INTAKES.applicant_pack.compose({ ...q, lang: 'en', said: () => 'Employment and income' })).toMatch(/^Help me build my application pack: starting with employment and income/)
  })
})
