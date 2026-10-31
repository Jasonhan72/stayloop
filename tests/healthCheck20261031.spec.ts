import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// 2026-10-31 system health check. The referral-commission engine is frozen
// (STAYLOOP_COMMISSION_ENGINE unset → /api/stripe/connect/settle answers 410),
// so its SECURITY DEFINER RPC must not be callable by API roles either:
// 20260704 revoked it, 20260708 re-granted it by accident. Pin the repair and
// the duplicate-index cleanup so a later migration does not silently undo them.
const ROOT = join(__dirname, '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

describe('health check 2026-10-31 — commission RPC locked, duplicate indexes gone', () => {
  const mig = read('supabase/migrations/20261031_health_check_fixes.sql')

  it('revokes settle_referral_commission from every API role (service_role keeps it)', () => {
    expect(mig).toContain(
      'revoke execute on function public.settle_referral_commission(uuid, numeric) from public, anon, authenticated;',
    )
    expect(mig).not.toMatch(/grant execute on function public\.settle_referral_commission/)
  })

  it('drops the ad-hoc *_idx twins and keeps the idx_* indexes the migrations create', () => {
    for (const idx of ['maintenance_tickets_listing_id_idx', 'screenings_landlord_id_idx', 'showing_intents_listing_id_idx']) {
      expect(mig).toContain(`drop index if exists public.${idx};`)
    }
    expect(mig).not.toMatch(/drop index if exists public\.idx_/)
  })

  it('the settle route still refuses before the RPC while the engine is frozen', () => {
    const route = read('app/api/stripe/connect/settle/route.ts')
    const freeze = route.indexOf("process.env.STAYLOOP_COMMISSION_ENGINE !== 'enabled'")
    const rpc = route.indexOf("'settle_referral_commission'")
    expect(freeze).toBeGreaterThan(-1)
    expect(freeze).toBeLessThan(rpc)
    expect(route).toContain('{ status: 410 }')
  })
})
