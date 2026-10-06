// 2026-10-06 (V0.7) — delegations past their end date are closed by a daily
// sweep (status → expired, one audit row per party) instead of staying
// `active` forever while every read already ignored them.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { STATUS_LABEL, isDelegationLive } from '../lib/delegations/shared'

const sql = readFileSync('supabase/migrations/20261006_delegation_expiry_sweep.sql', 'utf8')

describe('delegation expiry sweep', () => {
  it('a SECURITY DEFINER function only service_role may call, scheduled daily', () => {
    expect(sql).toMatch(/create or replace function public\.delegation_expiry_sweep\(\)/)
    expect(sql).toContain('security definer set search_path = public')
    expect(sql).toContain('revoke all on function public.delegation_expiry_sweep() from public, anon, authenticated;')
    expect(sql).toContain('grant execute on function public.delegation_expiry_sweep() to service_role;')
    expect(sql).toMatch(/cron\.schedule\('delegation-expiry-sweep', '15 13 \* \* \*'/)
  })
  it('closes active and pending rows whose expires_at passed, and audits both parties as the system', () => {
    expect(sql).toContain("where status in ('active', 'pending')")
    expect(sql).toContain('and expires_at <= now()')
    expect(sql).toContain("set status = 'expired'")
    expect(sql).toContain("'system', 'delegation_expired', 'delegation'")
    expect(sql).toContain("values (x.delegate_auth_id, 'agent'::text), (x.principal_auth_id, null::text)")
    expect(sql).toContain('where p.actor_id is not null')
  })
  it('the UI already names the state the sweep writes', () => {
    expect(STATUS_LABEL.expired).toMatchObject({ zh: '已到期', en: 'Expired' })
    expect(isDelegationLive({ status: 'expired', expires_at: '2099-01-01T00:00:00Z' })).toBe(false)
  })
})
