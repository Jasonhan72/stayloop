import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

// Guard (2026-09-06): every workspace route whose body is design-canon
// fixture content must be either gated (DEMO_GATE — empty state by default,
// amber SampleBanner in demo mode) or carry an always-on SAMPLE_NOTE. A new
// fixture page that forgets this shows canned numbers to a real user.

const shell = readFileSync('components/WorkspaceShell.tsx', 'utf8')

const GATED = [
  '/landlord/finance', '/landlord/maintenance',
  '/tenant/applications', '/tenant/payments', '/tenant/move-in', '/tenant/maintenance',
  '/tenant/passport/sharing', '/tenant/audit', '/landlord/audit',
  '/agent/tasks', '/agent/clients', '/agent/calendar', '/agent/earnings', '/agent/showings/*',
]
// /tenant/passport left this list on 2026-10-16: it is the real applicant pack now (tests/v1stage4_passportPack.spec.tsx).
const NOTED = ['/tenant/lease']

describe('sample-data notices', () => {
  it('gates every fixture-only workspace route', () => {
    for (const r of GATED) expect(shell, r).toContain(`'${r}': {`)
  })
  it('carries an always-on note on mixed routes', () => {
    for (const r of NOTED) expect(shell, r).toContain(`'${r}': {`)
    expect(shell).toContain('SAMPLE_NOTE[path]')
  })
  it('renders the shared amber banner in demo mode, and says nothing is debited', () => {
    expect(shell).toContain('<SampleBanner')
    expect(shell).toMatch(/不经手租金.*不会扣款/)
    expect(shell).not.toMatch(/立即支付/)
  })
  it('labels the sample applicant and sample lease detail pages', () => {
    for (const f of ['app/landlord/applicants/[id]/page.tsx', 'app/landlord/leases/[id]/page.tsx']) {
      expect(readFileSync(f, 'utf8'), f).toContain('<SampleBanner')
    }
  })
})
