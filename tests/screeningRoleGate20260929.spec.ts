// 2026-09-29 ·「租客筛选功能需要房东或者经纪的角色才可以使用，这个你研究一下怎么做？」
//
// Who may screen: the landlord hat (a landlords row — the free, explicit opt-in), a RECO agent on a
// client's screening under that client's live delegation, or an admin. The pages already routed
// people this way; the table and the routes did not — any signed-in account could insert its own
// screenings row (policy: auth.uid() = landlord_id) and have it scored, and during the free month
// any signed-in account could run deep checks on names it typed in. Now four server-side points
// enforce one rule (lib/screening/roleGate.ts). Probed on production in a rolled-back transaction:
// tenant-only refused · landlord allowed · agent without delegation refused · agent with a live
// delegation allowed · service role allowed.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { mayScreen, SCREENING_ROLE_DB_ERROR, SCREENING_ROLE_MESSAGE } from '../lib/screening/roleGate'

const read = (p: string) => readFileSync(p, 'utf8')

describe('the rule', () => {
  it('landlord hat, admin, or a delegated screening — nothing else', () => {
    expect(mayScreen({ landlord: true }, false)).toBe(true)
    expect(mayScreen({ admin: true }, false)).toBe(true)
    expect(mayScreen({ landlord: false, admin: false }, true)).toBe(true) // an agent under a client delegation
    expect(mayScreen({ landlord: false, admin: false }, false)).toBe(false) // tenant-only, or an agent without a delegation
    expect(mayScreen(null, false)).toBe(false)
    expect(SCREENING_ROLE_MESSAGE.zh).toContain('开通房东身份（免费）')
    expect(SCREENING_ROLE_MESSAGE.zh).toContain('委托')
  })
})

describe('the table refuses new rows from other accounts', () => {
  const sql = read('supabase/migrations/20260929_screening_role_gate.sql')
  it('a BEFORE INSERT trigger, invoker (current_user must be the caller), passing server writes and delegations', () => {
    expect(sql).toContain('create or replace function public.guard_screening_role()')
    expect(sql).toContain('security invoker')
    expect(sql).toContain('if not public.is_direct_client_write() then return new; end if;')
    expect(sql).toContain('if new.delegation_id is not null then return new; end if;')
    expect(sql).toContain("if coalesce((public.my_hats() ->> 'landlord')::boolean, false) then return new; end if;")
    expect(sql).toContain(`raise exception '${SCREENING_ROLE_DB_ERROR}'`)
    expect(sql).toContain('before insert on public.screenings')
    expect(sql).toContain('revoke all on function public.guard_screening_role() from public, anon, authenticated;')
  })
})

describe('the routes check before they do anything', () => {
  it('/api/screen-score: after the row is loaded, before any write; partner keys and delegated rows pass', () => {
    const r = read('app/api/screen-score/route.ts')
    const check = r.indexOf('if (!partnerLandlordId && !mayScreen(await callerHats(supabase), !!screening.delegation_id))')
    expect(check).toBeGreaterThan(0)
    expect(check).toBeGreaterThan(r.indexOf(".from('screenings')\n      .select('*')"))
    expect(check).toBeLessThan(r.indexOf("update({ status: 'error', error: 'no_documents' })"))
    expect(check).toBeLessThan(r.indexOf('loadedScreeningId = screening.id'))
  })
  it('/api/deep-check: in the gate, before the free-month bypass; a delegated screening passes', () => {
    const r = read('app/api/deep-check/route.ts')
    const check = r.indexOf('if (!mayScreen(hats, delegated)) return bad(SCREENING_ROLE_MESSAGE.en, SCREENING_ROLE_MESSAGE.zh, 403)')
    expect(check).toBeGreaterThan(0)
    expect(check).toBeLessThan(r.indexOf('if (inInternalTestWindow()) return null'))
    expect(r).toContain(".from('screenings').select('delegation_id').eq('id', screeningId).maybeSingle()")
  })
  it('/api/verify/create: before the plan check and any link is made', () => {
    const r = read('app/api/verify/create/route.ts')
    const check = r.indexOf('if (!mayScreen(await callerHats(rls), !!screening.delegation_id))')
    expect(check).toBeGreaterThan(0)
    expect(check).toBeLessThan(r.indexOf('await hasProAccess(rls, user.id, screeningId)'))
    expect(r).toContain("select('id, tenant_name, ai_extracted_name, delegation_id')")
  })
})

describe('the pages route people the same way', () => {
  it('the screening app turns the table’s refusal into words; the other doors were already in place', () => {
    const app = read('app/screening/app/page.tsx')
    expect(app).toContain('if (insertErr?.message?.includes(SCREENING_ROLE_DB_ERROR)) throw new Error(`${SCREENING_ROLE_MESSAGE.zh} / ${SCREENING_ROLE_MESSAGE.en}`)')
    // agent mode creates nothing without a live delegation
    expect(app).toContain("if (shellRole === 'agent' && !(delegation && delegation !== 'none' && delegation.live))")
    // the /screening page's button: a tenant-only account gets the passport and the landlord door
    const cta = read('components/screening/ScreeningCta.tsx')
    expect(cta).toContain('const canScreen = !signedIn || hats.loading || hats.landlord || (!!hats.agent && isRegistrationLive(hats.agent))')
    expect(cta).toContain('/landlord/become?next=%2Fscreening%2Fapp')
  })
})
