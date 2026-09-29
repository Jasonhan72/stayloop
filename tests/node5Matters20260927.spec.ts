// 节点 5 · 租赁事务主记录与经纪委托 (2026-09-27): one matter id from
// application to move-out; delegations proposed by the agent, confirmed by
// the principal through an emailed link, revocable at once; screenings for a
// client run only under a live delegation and stay readable to the
// principal; work-order cards act inline. Pure-function tests plus source guards.
import { describe, expect, it } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { allows, daysLeft, isDelegationLive, representingLine, validateProposal } from '@/lib/delegations/shared'
import { matterLinks, matterStage, matterTitle, type MatterSummary } from '@/lib/matters/shared'

const read = (p: string) => readFileSync(p, 'utf8')
const NOW = new Date('2026-09-27T12:00:00Z')
const base: MatterSummary = { id: 'm1', address: '100 Test Ave', unit: '1', landlord_auth_id: 'L', tenant_auth_id: null, tenant_email: 't@x.ca', listing_id: null, application: null, screening: null, lease: null, household: null, work_orders: { open: 0, total: 0 }, threads: 0, delegation: null, created_at: '2026-09-01T00:00:00Z' }

describe('delegations · pure rules', () => {
  it('validateProposal: uuid client, known scopes / actions, 1–12 months, de-duplicated', () => {
    expect(validateProposal({ client_id: 'x', scope: ['listing'], allowed_actions: ['screen'], months: 6 })).toEqual({ ok: false, reason: 'client_id' })
    const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    expect(validateProposal({ client_id: id, scope: ['bogus'], allowed_actions: ['screen'], months: 6 })).toEqual({ ok: false, reason: 'scope' })
    expect(validateProposal({ client_id: id, scope: ['listing'], allowed_actions: [], months: 6 })).toEqual({ ok: false, reason: 'allowed_actions' })
    expect(validateProposal({ client_id: id, scope: ['listing'], allowed_actions: ['screen'], months: 13 })).toEqual({ ok: false, reason: 'months' })
    expect(validateProposal({ client_id: id, scope: ['listing', 'listing', 'nope'], allowed_actions: ['screen', 'message', 'screen'], months: 3 })).toEqual({ ok: true, value: { client_id: id, scope: ['listing'], allowed_actions: ['screen', 'message'], months: 3 } })
  })
  it('live = active and not past its end; allows() also needs the action; the strip line names who · scope · until', () => {
    const d = { status: 'active' as const, expires_at: '2026-12-31T00:00:00Z', allowed_actions: ['screen' as const], principal_name: '张房东', principal_email: 'z@x.ca', scope: ['listing' as const] }
    expect(isDelegationLive(d, NOW)).toBe(true)
    expect(isDelegationLive({ ...d, status: 'revoked' }, NOW)).toBe(false)
    expect(isDelegationLive({ ...d, expires_at: '2026-09-01T00:00:00Z' }, NOW)).toBe(false)
    expect(allows(d, 'screen', NOW)).toBe(true)
    expect(allows(d, 'draft_lease', NOW)).toBe(false)
    expect(allows(null, 'screen', NOW)).toBe(false)
    expect(daysLeft(d, NOW)).toBe(95)
    expect(representingLine(d, true)).toBe('正在代表：张房东 · 出租（房东客户） · 到期 2026-12-31')
  })
})

describe('matters · pure rules', () => {
  it('stage follows the chain: applied → screened → decided → lease sent → signed → active → ended; states only', () => {
    expect(matterStage({ ...base, application: { id: 'a', status: 'submitted', created_at: '2026-09-02', decision_notified_at: null } }, NOW)).toBe('applied')
    expect(matterStage({ ...base, application: { id: 'a', status: 'submitted', created_at: '2026-09-02', decision_notified_at: null }, screening: { id: 's', status: 'scored' } }, NOW)).toBe('screened')
    expect(matterStage({ ...base, application: { id: 'a', status: 'approved', created_at: '2026-09-02', decision_notified_at: '2026-09-03' } }, NOW)).toBe('decided')
    expect(matterStage({ ...base, lease: { id: 'l', status: 'sent', start_date: '2026-11-01', end_date: '2027-10-31', sent_at: '2026-09-05', signed_at: null } }, NOW)).toBe('lease_sent')
    expect(matterStage({ ...base, lease: { id: 'l', status: 'signed_both', start_date: '2026-11-01', end_date: '2027-10-31', sent_at: '2026-09-05', signed_at: '2026-09-06' } }, NOW)).toBe('signed')
    expect(matterStage({ ...base, household: { id: 'h', verified: true, status: 'active' }, lease: { id: 'l', status: 'active', start_date: '2026-01-01', end_date: '2026-12-31', sent_at: null, signed_at: null } }, NOW)).toBe('active')
    expect(matterStage({ ...base, household: { id: 'h', verified: true, status: 'ended' } }, NOW)).toBe('ended')
    expect(matterTitle(base)).toBe('100 Test Ave #1')
    const links = matterLinks({ ...base, application: { id: 'a', status: 'approved', created_at: '2026-09-02', decision_notified_at: null }, screening: { id: 's', status: 'scored' }, household: { id: 'h', verified: true, status: 'active' }, work_orders: { open: 1, total: 3 } }, 'tenant')
    expect(links.map((l) => l.key)).toEqual(['application', 'household', 'maintenance']) // the tenant never gets a screening link
    expect(links[0].href).toBe('/tenant/applications/a')
    expect(JSON.stringify(links)).not.toMatch(/score|分/)
  })
})

describe('schema: one writer, party-scoped reads, delegation-gated screenings', () => {
  const sql = read('supabase/migrations/20260927_node5_matters_delegations.sql')
  it('ensure_matter is server-only; my_matters materialises and returns only the caller’s matters; matter_party covers landlord / tenant / delegated agent', () => {
    expect(sql).toContain('revoke execute on function public.ensure_matter(text, uuid) from public, anon, authenticated')
    expect(sql).toContain('grant execute on function public.ensure_matter(text, uuid) to service_role')
    expect(sql).toContain('grant execute on function public.my_matters() to authenticated, service_role')
    for (const k of ["return 'landlord'", "return 'tenant'", "then return 'agent'"]) expect(sql).toContain(k)
    expect(sql).toContain("d.status = 'active' and d.expires_at > now()")
  })
  it('the confirm token is never readable by clients; delegations are read by either party and written only by the server', () => {
    expect(sql).toMatch(/grant select \(id, principal_auth_id, principal_email[^)]*\) on public\.delegations to authenticated/)
    expect(sql).not.toMatch(/grant select \([^)]*confirm_token[^)]*\) on public\.delegations to authenticated/)
    expect(sql).not.toMatch(/grant (insert|update|delete)[^\n]*public\.delegations to authenticated/)
    expect(sql).toContain('create policy delegations_party_read on public.delegations for select to authenticated')
  })
  it('screenings: a client-set delegation_id must be the caller’s live delegation allowing screen; the principal reads; the agent loses read when it is no longer live (restrictive policy)', () => {
    expect(sql).toContain("'screen' = any (d.allowed_actions)")
    expect(sql).toContain("raise exception 'delegation_invalid'")
    expect(sql).toContain('create policy screenings_delegation_principal_read on public.screenings for select to authenticated')
    expect(sql).toContain('create policy screenings_delegation_gate on public.screenings as restrictive for select to authenticated')
    expect(sql).toContain("if tg_op = 'UPDATE' then new.delegation_id := old.delegation_id; return new; end if;")
  })
  it('threads and audit receipts carry the matter; the matter columns exist before the SQL function that reads them', () => {
    expect(sql.indexOf('alter table public.threads add column if not exists matter_id')).toBeLessThan(sql.indexOf('create or replace function public.matter_summary'))
    expect(read('lib/threads/server.ts')).toContain('const matterId = await ensureMatter(admin, matterKindOfThread(kind), refId)')
    expect(read('app/api/agent/execute/route.ts')).toContain('rental_matter_id: rentalMatterId')
    expect(read('lib/marketplace/server.ts')).toContain("void ensureMatter(admin, 'work_order', wo.id)")
  })
})

describe('surfaces and routes', () => {
  it('the agent proposes from the client table only with paperwork + email; a live delegation with screen rides along on the hand-off', () => {
    const c = read('components/agent/ClientBook.tsx')
    expect(c).toContain('data-testid="propose-delegation-button"')
    expect(c).toContain("const shared = live && allows(d, 'screen')")
    // since 2026-09-29 a verified agent screens directly; the delegation only adds the client as a reader
    expect(c).toContain("const screenHref = shared ? `/screening/app?as=agent&delegation=${d.id}` : '/screening/app?as=agent'")
  })
  it('the server re-checks registration, ownership, email and both TRESA dates before proposing; confirm needs the principal’s email; revoke is either party', () => {
    const r = read('app/api/delegations/route.ts')
    for (const k of ["error: 'registration_not_live'", "error: 'client_email_required'", "error: 'paperwork_required'", "error: 'already_delegated'", "action: 'delegation_proposed'"]) expect(r).toContain(k)
    const c = read('app/api/delegations/confirm/route.ts')
    expect(c).toContain("error: 'email_mismatch'")
    expect(c).toContain("update({ status: 'active', principal_auth_id: ud.user.id, confirmed_at: now, confirm_token: null")
    const v = read('app/api/delegations/[id]/route.ts')
    expect(v).toContain('if (!asPrincipal && !asDelegate) return NextResponse.json({ error: \'not a party\' }, { status: 403 })')
    expect(v).toContain("action: 'delegation_revoked'")
  })
  it('the screening app stamps delegation_id only for a live delegation; without one the agent screens directly (2026-09-29)', () => {
    const s = read('app/screening/app/page.tsx')
    expect(s).not.toContain("if (shellRole === 'agent' && !(delegation && delegation !== 'none' && delegation.live))")
    expect(s).toContain("delegation_id: shellRole === 'agent' && delegation && delegation !== 'none' && delegation.live ? delegationId : null")
    expect(s).toContain('data-testid="screening-delegation-invalid"')
    expect(s).toContain('data-testid="screening-agent-direct"')
  })
  it('the agent shell shows who it is representing; settings lists delegations both ways; the progress page is the matter page; work-order cards act inline', () => {
    expect(read('components/WorkspaceShell.tsx')).toContain("{role === 'agent' && <RepresentingStrip zh={lang === 'zh'} />}")
    expect(read('app/settings/page.tsx')).toContain('<MyDelegations zh={zh} />')
    expect(read('components/mobile/RolePages.tsx')).toContain('{live && <MattersPanel role={role} zh={zh} />}')
    expect(read('components/agent/ApprovalActionCard.tsx')).toContain('<WorkOrderInline workOrderId=')
    expect(read('components/matters/MattersPanel.tsx')).toContain("supabase.rpc('my_matters')")
    expect(read('components/matters/MattersPanel.tsx')).not.toMatch(/ai_score|v3_tier|\/100/)
    expect(existsSync('app/delegate/[token]/page.tsx')).toBe(true)
    expect(read('app/delegate/[token]/page.tsx')).toContain("export const runtime = 'edge'")
  })
})
