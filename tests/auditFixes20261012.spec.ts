// 2026-10-12 · external monetisation audit, reproduced and fixed (the rest of the report was by design
// or the comped founder account — see CLAUDE.md「外部变现审计」).
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('settings subscription card', () => {
  const card = readFileSync('components/settings/SubscriptionCard.tsx', 'utf8')
  it('never shows a checkout button that can only fail: free and trial both get a working Checkout; the trial says until when (test-month switch retired 2026-10-12)', () => {
    expect(card).toContain("{(state === 'free' || state === 'trial') && (")
    expect(card).toContain('data-testid="subscription-upgrade"')
    expect(card).toContain("case 'trial': return { text: zh ? 'Pro 试用中' : 'Pro trial'")
    expect(card).not.toContain('inInternalTestWindow')
    expect(readFileSync('app/api/stripe/checkout/route.ts', 'utf8')).not.toContain('free_window')
  })
})

describe('dashboard billing button', () => {
  const dash = readFileSync('app/dashboard/page.tsx', 'utf8')
  it('opens the Stripe portal only when a Stripe customer exists; a comped Pro gets a label, not an error alert', () => {
    expect(dash).toContain("select('plan, stripe_customer_id, pro_trial_until')")
    expect(dash).toContain("{(plan === 'pro' || plan === 'team') && hasStripeCustomer && (")
    expect(dash).toContain('data-testid="plan-comped"')
  })
})

describe('listing wizard draft autosave', () => {
  const wiz = readFileSync('app/dashboard/listings/new/page.tsx', 'utf8')
  it('keeps form + step in localStorage, restores with a banner, never saves photos, clears on publish', () => {
    expect(wiz).toContain("const WIZARD_DRAFT_KEY = 'sl-listing-wizard-draft'")
    expect(wiz).not.toContain('export const WIZARD_DRAFT_KEY')
    expect(wiz).toContain('JSON.stringify({ form, step, savedAt: new Date().toISOString() })')
    expect(wiz).not.toMatch(/JSON\.stringify\(\{[^}]*photos/)
    expect(wiz).toContain('data-testid="wizard-draft-restored"')
    expect(wiz).toContain("try { localStorage.removeItem(WIZARD_DRAFT_KEY) } catch { /* ignore */ }\n    router.replace('/dashboard?new=' + newSlug)")
  })
})
