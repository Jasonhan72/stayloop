// 2026-10-12 · external monetisation audit, reproduced and fixed (the rest of the report was by design
// or the comped founder account — see CLAUDE.md「外部变现审计」).
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('settings subscription card during the free window', () => {
  const card = readFileSync('components/settings/SubscriptionCard.tsx', 'utf8')
  it('shows the free-window chip instead of a checkout button that can only fail with「free_window」', () => {
    expect(card).toContain("{state === 'free' && inInternalTestWindow() && (")
    expect(card).toContain('data-testid="subscription-free-window"')
    expect(card).toContain("{state === 'free' && !inInternalTestWindow() && (")
    expect(card).toContain("m === 'free_window' ? (zh ? '测试期内所有功能免费，暂时不需要订阅。'")
  })
})

describe('dashboard billing button', () => {
  const dash = readFileSync('app/dashboard/page.tsx', 'utf8')
  it('opens the Stripe portal only when a Stripe customer exists; a comped Pro gets a label, not an error alert', () => {
    expect(dash).toContain("select('plan, stripe_customer_id')")
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
