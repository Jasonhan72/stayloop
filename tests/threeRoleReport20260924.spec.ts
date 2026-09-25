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
