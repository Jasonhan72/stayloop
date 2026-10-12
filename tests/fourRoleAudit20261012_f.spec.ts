import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { reviewWindowOpen, REVIEW_WINDOW_DAYS } from '@/lib/marketplace/reviews'

// Four-role audit 2026-10-12, evening re-check: NEW-1 (the delegation「撤回」froze an automated
// browser — it was a native window.confirm) and A⑦ (no place to leave a provider review).
describe('delegation withdraw is an inline two-step confirm, not a native dialog (NEW-1)', () => {
  const s = readFileSync('components/agent/ClientBook.tsx', 'utf8')
  it('no window.confirm on the revoke path; second click confirms, cancel backs out', () => {
    expect(s).not.toMatch(/action === 'revoke' && !window\.confirm/)
    expect(s).toMatch(/const \[confirmRevoke, setConfirmRevoke\] = useState<string \| null>\(null\)/)
    expect(s).toMatch(/data-testid="delegation-withdraw-confirm"/)
    expect(s).toMatch(/onClick=\{\(\) => setConfirmRevoke\(d\.id\)\} data-testid="delegation-withdraw"/)
    expect(s).toMatch(/撤回后客户收到的链接会失效。/)
  })
})

describe('provider review entry (A⑦)', () => {
  it('the window is 14 days from acceptance', () => {
    expect(REVIEW_WINDOW_DAYS).toBe(14)
    const now = new Date('2026-10-20T12:00:00Z')
    expect(reviewWindowOpen('2026-10-12T15:00:00Z', now)).toBe(true)
    expect(reviewWindowOpen('2026-10-05T12:00:00Z', now)).toBe(false)
    expect(reviewWindowOpen(null, now)).toBe(false)
  })
  it('the work-order card offers it to the landlord and the tenant after acceptance, and the form writes provider_reviews under RLS', () => {
    const card = readFileSync('components/marketplace/WorkOrderCard.tsx', 'utf8')
    expect(card).toMatch(/\['accepted', 'paid', 'closed'\]\.includes\(wo\.status\) && \(viewer === 'landlord' \|\| viewer === 'tenant'\)/)
    expect(card).toMatch(/<ReviewForm workOrderId=\{wo\.id\} providerId=\{wo\.provider_id\} acceptedAt=\{wo\.accepted_at\} viewer=\{viewer\}/)
    const f = readFileSync('components/marketplace/ReviewForm.tsx', 'utf8')
    expect(f).toMatch(/from\('provider_reviews'\)\.insert\(row\)/)
    expect(f).toMatch(/by_kind: viewer, by_user: user\.id/)
    expect(f).not.toMatch(/service_role|SUPABASE_SERVICE_ROLE_KEY/)
    // One review per party; outside the window the policy refuses and the copy says so.
    expect(f).toMatch(/error\?\.code === '23505'/)
    expect(f).toMatch(/error\?\.code === '42501'/)
    // A contact reached by email has no provider row — nothing to rate.
    expect(f).toMatch(/if \(!user \|\| !providerId \|\| mine === undefined\) return null/)
  })
})

describe('client email change is an inline two-step confirm too (NEW-2)', () => {
  it('no window.confirm anywhere in the client book; the save button becomes a confirm row', () => {
    const s = readFileSync('components/agent/ClientBook.tsx', 'utf8')
    expect(s).not.toMatch(/window\.confirm\(/)
    expect(s).toMatch(/if \(c\.email && !ackEmail\) \{ setConfirmEmail\(c\.id\); return \}/)
    expect(s).toMatch(/data-testid="client-email-change-confirm"/)
    expect(s).toMatch(/onClick=\{\(\) => void saveEdit\(c, true\)\}/)
  })
})
