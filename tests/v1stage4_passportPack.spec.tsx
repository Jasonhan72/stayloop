// V1.0 阶段 4 · 乙 #7 · G14 (2026-10-16): /tenant/passport is the real applicant pack.
//
// The page used to be four sample stamps + a sample view log + a sample
// verification history around one real share link. Now every block is real:
// four self-declared sections (applicant_profiles / applicant_profile_history),
// files (applicant_profile_files via /api/profile/files), the consent that
// unlocks presenting, a preview and a printable export (lib/profile/
// exportPack.ts), the share link, the API read scopes and the waitlist. No
// credit / court placeholder, no SIN, nothing「解锁」anything.
import { describe, expect, it, vi } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'

vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => React.createElement('a', { href, ...rest }, children) }))

import ProfileConsent from '../components/profile/ProfileConsent'
import { esc, renderApplicantPack, sectionCompleteness, stayloopRentLine } from '../lib/profile/exportPack'
import { APPLICANT_PROFILE_CONSENT_VERSION } from '../lib/profile/consent'
import type { ProfileFile, ProfileHistoryEntry } from '../lib/profile/types'

const read = (p: string) => readFileSync(p, 'utf8')
const page = read('app/tenant/passport/page.tsx')
const shell = read('components/WorkspaceShell.tsx')
const profileComponents = readdirSync('components/profile').map((f) => read(join('components/profile', f)))
const everything = [page, read('lib/profile/exportPack.ts'), ...profileComponents].join('\n')
const code = (s: string) => s.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')

describe('the sample blocks are gone', () => {
  it('no stamps, no sample view log, no sample verification history on the page', () => {
    const c = code(page)
    expect(c).not.toMatch(/STAMPS|stampForTier|stampLabel|passportStamps|TIERS\b/)
    expect(c).not.toMatch(/验证历史|[Vv]erification history|谁看过|[Ww]ho viewed|示范数据|SAMPLE DATA|Sarah Wang|David Park|Unit 1207/)
    expect(c).not.toMatch(/信用章|法庭章|[Cc]redit stamp|[Cc]ourt stamp|[Cc]redit \+ court/)
    expect(c).not.toMatch(/window\.confirm|\balert\(/)
  })
  it('the page, the profile components and the renderer never say 验证一次 / 处处通行 / 解锁 / 四枚章 / 六维', () => {
    expect(code(everything)).not.toMatch(/验证一次|处处通行|解锁|四枚章|六维|[Vv]erify once|go anywhere|unlock/)
  })
  it('SAMPLE_NOTE no longer carries /tenant/passport — the whole page is real', () => {
    const note = shell.slice(shell.indexOf('const SAMPLE_NOTE'), shell.indexOf('function lookupGate'))
    expect(note).not.toContain("'/tenant/passport'")
  })
})

describe('the page is wired to the shared contract', () => {
  it('imports types, consent, freshness and the Stayloop-confirmed history from lib/profile/*', () => {
    expect(page).toContain("from '@/lib/profile/types'")
    expect(page).toContain("from '@/lib/profile/consent'")
    expect(page).toContain("from '@/lib/profile/freshness'")
    expect(page).toContain("import { stayloopHistory } from '@/lib/profile/history'")
  })
  it('reads and writes only the applicant’s own rows through RLS, and the files only through the route', () => {
    expect(page).toMatch(/from\('applicant_profiles'\)\.upsert\(\{ auth_id: uid, \.\.\.patch \}, \{ onConflict: 'auth_id' \}\)/)
    expect(page).toMatch(/from\('applicant_profile_files'\)\.select\(/)
    expect(page).not.toMatch(/from\('applicant_profile_files'\)\.(insert|delete)/)
    const files = read('components/profile/ProfileFiles.tsx')
    expect(files).toContain("fetch('/api/profile/files', { method: 'POST'")
    expect(files).toContain('`/api/profile/files?id=${encodeURIComponent(f.id)}`')
    expect(files).toContain("createSignedUrl(f.path, 600)")
    expect(files).toContain('prepareUploads(')
    expect(files).toContain('data-testid="profile-file-delete-confirm"') // two-step, no window.confirm
  })
  it('exporting writes the applicant_pack_presented audit event as the tenant, with to:pdf', () => {
    expect(page).toMatch(/writeAuditEvent\(supabase, \{ actorId: uid, action: 'applicant_pack_presented', actingRole: 'tenant', metadata: presentedMetadata\('pdf', packScope\) \}\)/)
  })
  it('the preview is a sandboxed srcdoc iframe inside a horizontal scroller with min-w-0; the title and eyebrow are the new ones', () => {
    expect(page).toContain('srcDoc={previewHtml} sandbox=""')
    expect(page).toContain('className="min-w-0 overflow-x-auto bg-[#E2E8F0]"')
    expect(page).toContain("title={zh ? '租客护照 · 申请包' : 'Tenant Passport · Application pack'}")
    expect(page).toContain('APPLICATION PACK')
    // the share-link fact the older guards pin stays in place
    expect(page).toMatch(/姓名缩写和按时付租记录，只取自双方都确认过的租约/)
  })
  it('the side rail gives deterministic suggestions and three facts, not a model call', () => {
    expect(page).not.toMatch(/\/api\/agent\/turn|llmChat|prompt:/)
    expect(page).toContain('申请房源时一键填入')
    expect(page).toContain('导出 PDF 给站外房东')
    expect(page).toContain('分享链接只给姓名缩写与付租记录')
  })
  it('the sections carry a 自述 tag per item and only a real verification earns 已核验; no credit / court placeholder', () => {
    const sections = read('components/profile/ProfileSections.tsx')
    expect(sections).toContain('data-testid="tag-self"')
    expect(sections).toContain('data-testid="tag-verified"')
    expect(sections).toContain('data-testid="stayloop-history"')
    expect(sections).toContain('只用于你本人同意的信用查询')
    expect(sections).toMatch(/不收 SIN · 不问任何受保护特征/)
    expect(code(sections)).not.toMatch(/credit_score|LTB|法庭|信用分/)
  })
})

describe('renderApplicantPack', () => {
  const profile = {
    first_name: 'Mia <script>alert(1)</script>',
    last_name: 'Chen',
    phone: '416-555-0100',
    current_address: '1207-100 King St W',
    employment_status: 'employed',
    employer_name: 'ACME & Co',
    monthly_income: 6200,
    num_occupants: 2,
    has_pets: true,
    pet_details: 'one "cat"',
    is_smoker: false,
    additional_notes: '<b>bold</b>',
    consent_version: APPLICANT_PROFILE_CONSENT_VERSION,
    consent_at: '2026-10-16T10:00:00Z',
  }
  const history: ProfileHistoryEntry[] = [{
    id: 'h1', auth_id: 'u', position: 0, prev_address: '22 Elm <Ave>', prev_landlord_name: 'Pat', prev_landlord_phone: null, prev_landlord_email: null,
    prev_rent: 1800, prev_move_in: '2024-01-01', prev_move_out: null, reason_for_leaving: null, created_at: '', updated_at: '',
  }]
  const files: ProfileFile[] = [{
    id: 'f1', auth_id: 'u', kind: 'paystub', path: 'profile/u/paystub/abcd1234-stub.pdf', name: 'stub <2026>.pdf', size: 1000, mime: 'application/pdf',
    sha256: 'a'.repeat(64), as_of: null, uploaded_at: '2026-06-01T00:00:00Z',
  }]
  const html = renderApplicantPack({
    profile, history, files, lang: 'zh',
    stayloopHistory: [{ address: '100 Test Ave', unit: '1', city: 'Toronto', start: '2026-08-01', end: '2027-07-31', onTime: 1, lateOver7: 0, total: 1 }],
    presentedTo: 'Sarah <W>',
    now: new Date('2026-10-16T12:00:00Z'),
  })

  it('escapes every user string', () => {
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('22 Elm &lt;Ave&gt;')
    expect(html).toContain('stub &lt;2026&gt;.pdf')
    expect(html).toContain('Sarah &lt;W&gt;')
    expect(html).not.toContain('<b>bold</b>')
    expect(esc('a&b"c\'d<e>')).toBe('a&amp;b&quot;c&#39;d&lt;e&gt;')
  })
  it('prints the consent version, the self-declared / verified tags and the closing statement', () => {
    expect(html).toContain(APPLICANT_PROFILE_CONSENT_VERSION)
    expect(html).toContain('自述')
    expect(html).toContain('已核验')
    expect(html).toContain('本申请包由申请人本人准备并出示；Stayloop 未替任何一方查询任何记录。')
    expect(html).toContain('<div class="sheet">')
    expect(html).toContain('@media print')
  })
  it('lists files by name + SHA-256 + upload date + freshness only — never the file, never the storage path', () => {
    expect(html).toContain('a'.repeat(64))
    expect(html).not.toContain('profile/u/paystub')
    expect(html).not.toMatch(/<img|<embed|<object|<iframe/)
    expect(html).toContain('建议更新') // a 137-day-old pay stub is ageing
  })
  it('never mentions a SIN and never shows a credit / court placeholder', () => {
    expect(html).not.toMatch(/\bSIN\b|社会保险号|信用分|LTB|法庭/)
  })
  it('the confirmed tenancy line counts statuses only, never amounts', () => {
    expect(stayloopRentLine({ onTime: 3, lateOver7: 1, total: 4 }, 'zh')).toBe('4 期已记录 · 按时 3 期 · 迟付超过 7 天 1 期')
    expect(stayloopRentLine({ onTime: 0, lateOver7: 0, total: 0 }, 'en')).toBe('no rent records yet')
    const confirmedRow = html.slice(html.indexOf('<tr><td>100 Test Ave'), html.indexOf('</tr>', html.indexOf('<tr><td>100 Test Ave')))
    expect(confirmedRow).toContain('已核验')
    expect(confirmedRow).not.toContain('$')
  })
  it('sectionCompleteness: a Stayloop-confirmed tenancy counts as history; a blank profile is 0/4', () => {
    expect(Object.values(sectionCompleteness(null, [], [])).filter(Boolean)).toHaveLength(0)
    const c = sectionCompleteness(profile, [], [{ address: 'x', unit: null, city: null, start: null, end: null, onTime: 0, lateOver7: 0, total: 0 }])
    expect(c).toEqual({ identity: true, employment: true, history: true, other: true })
  })
})

describe('ProfileConsent (real render)', () => {
  const find = (r: TestRenderer.ReactTestRenderer, id: string) => r.root.findAll((n) => n.props['data-testid'] === id && typeof n.type === 'string')[0]

  it('before the box is ticked, preview and export are disabled and the apply link is a disabled stand-in', () => {
    const onToggle = vi.fn()
    let r!: TestRenderer.ReactTestRenderer
    act(() => { r = TestRenderer.create(<ProfileConsent zh signedIn consented={false} onToggle={onToggle} onPreview={() => {}} onExport={() => {}} />) })
    expect(find(r, 'pack-export').props.disabled).toBe(true)
    expect(find(r, 'pack-preview').props.disabled).toBe(true)
    expect(find(r, 'pack-apply-disabled')).toBeTruthy()
    expect(find(r, 'pack-locked-why')).toBeTruthy()
    expect(find(r, 'profile-consent-text')).toBeTruthy()
    act(() => { find(r, 'profile-consent-checkbox').props.onChange({ target: { checked: true } }) })
    expect(onToggle).toHaveBeenCalledWith(true)
  })

  it('once consented, export and preview work and the apply link points at the listings', () => {
    const onExport = vi.fn()
    let r!: TestRenderer.ReactTestRenderer
    act(() => { r = TestRenderer.create(<ProfileConsent zh signedIn consented consentAt="2026-10-16T10:00:00Z" onToggle={() => {}} onPreview={() => {}} onExport={onExport} />) })
    expect(find(r, 'pack-export').props.disabled).toBe(false)
    act(() => { find(r, 'pack-export').props.onClick() })
    expect(onExport).toHaveBeenCalledTimes(1)
    expect(find(r, 'pack-apply').props.href).toBe('/listings')
    expect(r.root.findAll((n) => n.props['data-testid'] === 'pack-locked-why')).toHaveLength(0)
  })

  it('an anonymous visitor sees the text but cannot tick or present', () => {
    let r!: TestRenderer.ReactTestRenderer
    act(() => { r = TestRenderer.create(<ProfileConsent zh={false} signedIn={false} consented={false} onToggle={() => {}} onPreview={() => {}} onExport={() => {}} />) })
    expect(find(r, 'profile-consent-checkbox').props.disabled).toBe(true)
    expect(find(r, 'pack-export').props.disabled).toBe(true)
  })
})
