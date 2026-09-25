// Three-role test report (~/Downloads/stayloop-3role-test-report.pdf, 2026-09-24).
// Each guard names the finding it closes.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { homeForHats, safeNext } from '@/lib/landlordHat'

const read = (p: string) => readFileSync(p, 'utf8')

describe('SL-T-01 · no score without evidence', () => {
  it('screen-score refuses a run with no documents and no verification, before any model call', () => {
    const s = read('app/api/screen-score/route.ts')
    const guard = s.indexOf("code: 'no_documents'")
    expect(guard).toBeGreaterThan(0)
    expect(guard).toBeLessThan(s.indexOf('// ---- Stage 1: Sign all files in parallel'))
    expect(s).toMatch(/nFiles === 0 && !\(v && \(v\.id \|\| v\.bank \|\| v\.credit\)\)/)
  })
  it('the start button needs at least one file (a name alone is not enough)', () => {
    const s = read('app/screening/app/page.tsx')
    expect(s).not.toContain("(files.length === 0 && !applicantName.trim()) || classifying")
    expect(s).toContain('files.length === 0 || classifying || preparing')
  })
})

describe('SL-L-01 · applicant documents open in-page and the view is audited', () => {
  it('no window.open after an await; modal handles loading / error / retry', () => {
    const page = read('app/landlord/applicants/[id]/page.tsx')
    expect(page).not.toMatch(/window\.open\(j\.url/)
    expect(page).toContain('<FilePreviewModal')
    const modal = read('components/landlord/FilePreviewModal.tsx')
    for (const s of ["phase: 'loading'", "phase: 'error'", 'Retry', 'target="_blank"']) expect(modal).toContain(s)
    expect(modal).toMatch(/code === 403/)
  })
  it('/api/file-url writes the audit row the page promises', () => {
    expect(read('app/api/file-url/route.ts')).toContain("action: 'application_file_viewed'")
  })
})

describe('SL-A-01 / SL-T-06 / SL-T-08 · the landlord hat is explicit', () => {
  it('no page load claims a landlord row', () => {
    expect(read('lib/useLandlord.ts')).not.toContain("rpc('claim_landlord')")
    expect(read('lib/useUser.ts')).not.toContain("rpc('claim_landlord')")
  })
  it('landlord workspace sends signed-in accounts without the hat to /landlord/become', () => {
    const shell = read('components/WorkspaceShell.tsx')
    expect(shell).toMatch(/role === 'landlord' && signedIn && !hats\.loading && !hats\.landlord/)
    expect(shell).toContain("router.replace('/landlord/become?next='")
    expect(read('app/landlord/become/page.tsx')).toContain("rpc('claim_landlord')")
  })
  it('onboarding as a landlord is an explicit opt-in', () => {
    expect(read('app/onboarding/name/page.tsx')).toMatch(/role === 'landlord' && signedIn\) \{\s*void Promise\.resolve\(supabase\.rpc\('claim_landlord'\)\)/)
  })
  it('safeNext keeps only same-site paths', () => {
    expect(safeNext('/landlord/applicants?x=1')).toBe('/landlord/applicants?x=1')
    for (const bad of [null, '', 'https://evil.com', '//evil.com', '/\\evil', '/landlord/become?next=/x']) expect(safeNext(bad)).toBe('/landlord/agent')
  })
  it('sign-in lands on a hat the account holds, not the previous account’s role', () => {
    expect(homeForHats('landlord', { landlord: false, agent: null })).toBe('/tenant/agent')
    expect(homeForHats('landlord', { landlord: false, agent: 'verified' })).toBe('/agent/agent')
    expect(homeForHats('landlord', { landlord: true })).toBe('/landlord/agent')
    expect(homeForHats('tenant', { landlord: true })).toBe('/tenant/agent')
    expect(homeForHats(null, { landlord: true })).toBe('/landlord/agent')
    expect(read('app/login/page.tsx')).toContain('homeForHats(role, data as HatsLite)')
    expect(read('app/auth/callback/page.tsx')).toContain('homeForHats(stored, hats as HatsLite)')
  })
})

describe('P2 items', () => {
  it('SL-T-02/03/04 · apply page shows what you apply for, prefills, and says 人权法典 in Chinese', () => {
    const s = read('app/apply/[slug]/page.tsx')
    expect(s).toContain('data-testid="apply-listing-summary"')
    expect(s).toMatch(/email: f\.email \|\| u\.email/)
    expect(s).toContain('《安大略省人权法典》')
  })
  it('SL-T-05 · deciding a card refreshes every badge', () => {
    expect(read('lib/agent/useAgentSession.ts')).toMatch(/await decidePendingAction\(getSupabaseBrowser\(\), actionId, decision, note\)\s*notifyPendingChanged\(\)/)
    for (const p of ['components/Header.tsx', 'components/WorkspaceShell.tsx']) expect(read(p)).toContain('window.addEventListener(PENDING_CHANGED_EVENT, load)')
  })
  it('SL-L-04 · /landlord/applications redirects', () => {
    expect(read('middleware.ts')).toContain("url.pathname = '/landlord/applicants' + (apps[1] || '')")
  })
  it('SL-L-08 · no US-style placeholder address', () => {
    expect(read('app/leases/import/page.tsx')).not.toContain('123 Main St')
  })
  it('SL-A-02 · sign-in method is read from the account, not hard-coded', () => {
    const s = read('app/settings/page.tsx')
    expect(s).not.toContain('value="Magic Link"')
    expect(s).toContain('signInMethods(auth.user, zh)')
  })
  it('SL-A-05 · the settings rail says 设置, not 设置与订阅', () => {
    expect(read('components/WorkspaceShell.tsx')).not.toContain('设置与订阅')
  })
  it('public copy: no 内部测试期 wording', () => {
    for (const p of ['app/pricing/page.tsx', 'components/settings/SubscriptionCard.tsx']) expect(read(p)).not.toContain('内部测试期')
  })
})

describe('round 2 (user: 改成 V0.6，其余按建议全部修)', () => {
  it('footer shows V0.6', () => {
    expect(read('components/Footer.tsx')).toContain('>V0.6<')
    expect(read('components/Footer.tsx')).not.toContain('>v5.3<')
  })
  it('SL-L-02 · the to-do page does not repeat its own cards in 今日', async () => {
    const { buildToday } = await import('@/lib/lifecycle/today')
    const pending = [{ id: '1', action_type: 'showing_request', title: '看房请求' }]
    const lc = { current: 'pre', phases: [{ key: 'pre', steps: [{ key: 'showings', state: 'current', label: { zh: '看房 / 提问', en: 'Showings' }, detail: { zh: '1 条等你回复', en: '1 waiting' }, href: '/landlord/todo' }], next: null }] } as never
    expect(buildToday(lc, pending, '/landlord/todo').map((i) => i.id)).toEqual(['approvals'])
    expect(buildToday(lc, pending, '/landlord/todo', { omitPending: true })).toEqual([])
    expect(read('components/mobile/RolePages.tsx')).toContain('omitPending')
  })
  it('SL-A-04 · client counts and tasks come from the client table', async () => {
    expect(read('components/agent/StatusOverview.tsx')).toMatch(/from\('agent_clients'\)[^\n]*neq\('stage', 'closed'\)/)
    const { clientTasks } = await import('@/lib/agent/clientBook')
    const base = { client_role: 'tenant' as const, last_contact_at: new Date().toISOString(), updated_at: new Date().toISOString() }
    const t = clientTasks([
      { ...base, id: 'a', name: 'Amy', stage: 'searching', representation_agreement_at: null, info_guide_given_at: null },
      { ...base, id: 'b', name: 'Ben', stage: 'showing', representation_agreement_at: '2026-09-01', info_guide_given_at: '2026-09-01' },
      { ...base, id: 'c', name: 'Cat', stage: 'closed', representation_agreement_at: null, info_guide_given_at: null },
    ])
    expect(t.map((x) => x.id)).toEqual(['paper:a', 'pack:b'])
    expect(read('app/agent/tasks/page.tsx')).toContain('liveSlot={<ClientTasks')
    expect(read('components/WorkspaceShell.tsx')).not.toContain('客户与任务功能将在代表协议记录上线后开放')
  })
  it('SL-L-05 · applications can be archived and unarchived', () => {
    expect(read('supabase/migrations/20260924_applications_archive.sql')).toContain('archived_at timestamptz')
    const list = read('app/landlord/applicants/page.tsx')
    expect(list).toContain("update({ archived_at: at }).in('id', ids)")
    expect(list).toContain('data-testid="archived-applications"')
    expect(read('app/landlord/applicants/[id]/page.tsx')).toContain('data-testid="archive-toggle"')
  })
  it('SL-L-03 · wizard drafts bilingual copy only from entered fields, no false AI promise', async () => {
    const { draftListingCopy } = await import('@/lib/listingCopy')
    const d = draftListingCopy({ address: '88 Harbour St', unit: '1203', city: 'Toronto', property_type: 'condo', bedrooms: 1, bathrooms: 1, monthly_rent: 2450 })
    expect(d.title).toContain('88 Harbour St')
    expect(d.description).toMatch(/月租 \$2,450/)
    expect(d.description).toMatch(/\$2,450\/month/)
    expect(d.description).not.toMatch(/宠物|pet|包含|includes|家具|Furnished|吸烟|smoking/i)
    const w = read('app/dashboard/listings/new/page.tsx')
    expect(w).not.toContain('自动生成英中文文案、推荐价格区间、SEO 描述')
    expect(w).toContain('data-testid="listing-copy"')
    expect(read('lib/listingPublish.ts')).toContain('...(form.description ? { description: form.description } : {})')
  })
  it('SL-T-07 · a messages inbox for tenants and landlords', () => {
    const shell = read('components/WorkspaceShell.tsx')
    expect(shell).toContain("href: '/tenant/messages'")
    expect(shell).toContain("href: '/landlord/messages'")
    expect(read('components/messages/Inbox.tsx')).toContain("from('household_messages')")
    expect(read('app/h/[id]/page.tsx')).toContain('setReadMark(id,')
  })
})
