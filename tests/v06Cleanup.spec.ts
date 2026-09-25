// V0.6 cleanup (2026-09-24): RECO expiry sweep, retired /api/trust/verify,
// repair tickets notify the other side, one-round-trip lifecycle facts.
import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { isRegistrationLive } from '@/lib/agentProfile'

const read = (p: string) => readFileSync(p, 'utf8')

describe('RECO registration expiry', () => {
  it('renewal_due is still a live registration; expired / pending are not', () => {
    expect(isRegistrationLive('verified')).toBe(true)
    expect(isRegistrationLive('renewal_due')).toBe(true)
    for (const s of ['expired', 'pending', 'rejected', null, undefined]) expect(isRegistrationLive(s)).toBe(false)
  })
  it('the sweep moves verified → renewal_due at 30 days and → expired after the date, daily', () => {
    const sql = read('supabase/migrations/20260924_agent_registration_sweep.sql')
    expect(sql).toMatch(/expires_at <= current_date \+ 30/)
    expect(sql).toMatch(/set status = 'expired'[\s\S]*expires_at < current_date/)
    expect(sql).toMatch(/cron\.schedule\('agent-registration-sweep'/)
    expect(sql).toMatch(/revoke all on function public\.agent_registration_sweep\(\) from public, anon, authenticated/)
    // Directory keeps renewal_due agents until the date passes.
    expect(sql).toMatch(/status in \('verified', 'renewal_due'\)[\s\S]*expires_at >= current_date/)
  })
  it('badge, header and the agent-only lock all use the shared predicate', () => {
    expect(read('components/AgentBadge.tsx')).toContain('isRegistrationLive(agent.status)')
    expect(read('components/WorkspaceShell.tsx')).toContain('!isRegistrationLive(agentStatus)')
    expect(read('components/Header.tsx')).toContain('!isRegistrationLive(hats.agent)')
  })
})

describe('retired Trust API route', () => {
  it('/api/trust/verify (queried a table that never existed) is gone', () => {
    expect(existsSync('app/api/trust/verify/route.ts')).toBe(false)
    expect(read('scripts/route-audit.mjs')).toMatch(/retired trust\/verify → 404/)
  })
})

describe('repair tickets notify the counterpart', () => {
  const route = read('app/api/maintenance/notify/route.ts')
  it('only the opener can announce, once, rate limited, recipients from membership', () => {
    expect(route).toMatch(/own\.opened_by !== user\.id/)
    expect(route).toMatch(/\.is\('counterpart_notified_at', null\)/)
    expect(route).toMatch(/underHourlyLimit\(`ticket-notify:\$\{user\.id\}`, 20, false\)/)
    expect(route).toContain('ticketContext(admin, ticketId)')
    expect(route).not.toMatch(/body\.(to|email|recipient)/)
  })
  it('tenant-filed tickets also get the dispatch suggestion card', () => {
    expect(route).toContain('suggestDispatch(admin, ctx.landlordAuthId, ticketId)')
    expect(read('lib/marketplace/server.ts')).toMatch(/export async function suggestDispatch/)
  })
  it('both ticket forms call it after the insert', () => {
    expect(read('components/tenant/NewTicketModal.tsx')).toMatch(/await notifyTicket\(ticketId\)/)
    expect(read('components/household/MaintenancePanel.tsx')).toMatch(/notifyTicket\(id\)/)
  })
})

describe('lifecycle facts in one round trip', () => {
  const sql = read('supabase/migrations/20260924_lifecycle_facts_rpc.sql')
  it('RPCs are SECURITY INVOKER (caller RLS) and not callable by anon', () => {
    expect(sql.match(/security invoker/g)?.length).toBe(2)
    expect(sql).not.toMatch(/security definer/)
    expect(sql).toMatch(/revoke all on function public\.lifecycle_facts_tenant\(\) from public, anon/)
  })
  it('tenant facts read applications through the score-free applicant view', () => {
    expect(sql).toContain('from applicant_applications')
    expect(sql).not.toMatch(/ai_score/)
  })
  it('the hook calls the RPC first and keeps the per-table loaders as fallback', () => {
    const hook = read('lib/lifecycle/useLifecycle.ts')
    expect(hook).toContain("supabase.rpc('lifecycle_facts_landlord')")
    expect(hook).toContain('return loadLandlordLegacy(uid)')
    expect(hook).toContain('return loadTenantLegacy(uid, email)')
  })
})
