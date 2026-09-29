// 节点 2 · 清楚 (2026-09-26): identity is always visible and always a hat the
// account holds; every key task has a door; booleans and internal names never
// reach the screen. Pure-function tests plus source guards.
import { describe, expect, it } from 'vitest'
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { homeForHats } from '@/lib/landlordHat'
import { agentLifecycle } from '@/lib/lifecycle/stages'

const read = (p: string) => readFileSync(p, 'utf8')
const T = new Date('2026-09-26T15:00:00Z')

describe('the provider is a landing hat', () => {
  it('a pure provider account lands on its jobs page; a remembered provider wins; other hats keep their order', () => {
    expect(homeForHats(null, { provider: 'verified' })).toBe('/provider/jobs')
    expect(homeForHats('provider', { provider: 'verified', landlord: true })).toBe('/provider/jobs')
    expect(homeForHats('landlord', { provider: 'verified', landlord: true })).toBe('/landlord/agent')
    expect(homeForHats(null, { provider: 'verified', agent: 'verified' })).toBe('/agent/agent')
    expect(homeForHats('provider', { provider: null })).toBe('/tenant/agent') // not held → ignored
  })
  it('the callback and the login page hand the raw remembered hat to homeForHats', () => {
    expect(read('app/auth/callback/page.tsx')).toContain("provider: '/provider/jobs'")
    expect(read('components/auth/AuthPage.tsx')).toContain('homeForHats(remembered, data as HatsLite)') // /login and /register since 2026-09-29
    const auth = read('lib/useAuth.ts')
    expect(auth).toContain("pathname.startsWith('/provider/')")
    expect(auth).toContain("window.localStorage.setItem(key, 'provider')")
  })
  it('neutral pages frame themselves with a held hat; the landlord gate resets a stale remembered hat', () => {
    const n = read('app/notifications/page.tsx')
    expect(n).toContain('const shellRole = activeHat(hats, role)')
    expect(n).toContain('liveSlot={<LiveNotifications role={shellRole} />}')
    const shell = read('components/WorkspaceShell.tsx')
    expect(shell).toContain('auth.setRole(bestHat(hats))')
    expect(shell).toContain("const ctaHref = gate.href === '/dashboard' && role !== 'landlord' ? `/${role}/agent` : gate.href")
    expect(shell).toContain('<Header variant="solid" mobileNav={false} />') // one header everywhere (user 2026-09-27)
  })
  it('one header everywhere (user 2026-09-27): the marketing nav stays on workbench pages too; the acting identity is the「我是」label', () => {
    const h = read('components/Header.tsx')
    // the 节点 2 app-shell variant (identity chip instead of the nav) is retired
    expect(h).not.toContain('appShell')
    expect(h).not.toContain('app-shell-identity')
    expect(read('lib/useHomeHref.ts')).toContain("const onProvider = pathname.startsWith('/provider/')")
    expect(h).toContain('data-testid="nav-identity"')
    // signed in, the label is bold and in the acting hat's colour (tests/headerIdentityColor20260929.spec.ts)
    expect(h).toContain("<ReservedText text={home.signedIn ? navIdentityLabel : t('nav.product')} bold={!!identityColor || isProductActive} />")
    for (const f of ['app/provider/jobs/page.tsx', 'app/provider/onboard/page.tsx']) expect(read(f)).toContain('<Header />')
  })
  it('real notifications: pending cards of the hat, provider job events, recent audit', () => {
    const c = read('components/notifications/LiveNotifications.tsx')
    expect(c).toContain(".eq('role', role).eq('status', 'pending')")
    expect(c).toContain("from('work_order_events')")
    expect(c).toContain('data-testid="provider-notifications"')
    expect(c).toContain('auditActionLabel(r.action, lang')
  })
})

describe('hat activation is audited; audit rows carry the acting role and the matter', () => {
  const sql = read('supabase/migrations/20260926_node2_identity_audit.sql')
  it('columns and index', () => {
    for (const col of ['acting_role text', 'matter_type text', 'matter_id uuid', 'delegation_id uuid']) expect(sql).toContain(`add column if not exists ${col}`)
    expect(sql).toContain('agent_audit_events_matter_idx')
  })
  it('one trigger function on the three hat tables, definer, not executable by API roles', () => {
    expect(sql).toContain('create or replace function public.audit_hat_activation()')
    expect(sql).toMatch(/security definer set search_path = public/)
    expect(sql).toContain('revoke execute on function public.audit_hat_activation() from public, anon, authenticated, service_role')
    for (const t of ['landlords', 'agent_profiles', 'service_providers']) expect(sql).toMatch(new RegExp(`after insert on public\\.${t} for each row execute function public\\.audit_hat_activation\\('(landlord|agent|provider)'\\)`))
  })
  it('the applicant view gained a material count and the decision note — still no score', () => {
    expect(sql).toContain('as files_count')
    expect(sql).toContain('a.decision_reason')
    expect(sql).not.toMatch(/ai_score/)
    expect(read('supabase/migrations/20260926_facts_v2b_tenant_app_detail.sql')).toContain('listing_active, files_count, decision_reason')
  })
})

describe('key task doors', () => {
  it('tenant application detail page: steps with an owner, next step, materials count, no score', () => {
    expect(existsSync('app/tenant/applications/[id]/page.tsx')).toBe(true)
    const p = read('app/tenant/applications/[id]/page.tsx')
    expect(p).toContain('data-testid="application-detail-steps"')
    expect(p).toContain('data-testid="application-next-step"')
    expect(p).toContain('app.files_count')
    expect(p).toContain("useFacts('tenant')")
    expect(p).not.toMatch(/ai_score|match/)
    expect(read('components/tenant/MyApplications.tsx')).toContain('data-testid="application-detail-link"')
  })
  it('agent to-do lists the client table tasks; the rail flags a RECO registration expiring within 30 days', () => {
    expect(read('components/mobile/RolePages.tsx')).toContain("{live && role === 'agent' && <ClientTasks zh={zh} />}")
    const lc = agentLifecycle({ profileStatus: 'verified', profileExpiresAt: '2026-10-10', pendingCards: 0, clients: [] }, T)
    expect(lc.phases[0].steps.find((s) => s.key === 'reco')?.state).toBe('current')
    expect(lc.phases[0].steps.find((s) => s.key === 'reco')?.detail?.zh).toContain('14 天后到期')
    expect(lc.phases[0].clock?.label.zh).toBe('RECO 注册到期')
    const ok = agentLifecycle({ profileStatus: 'verified', profileExpiresAt: '2027-06-30', pendingCards: 0, clients: [] }, T)
    expect(ok.phases[0].steps.find((s) => s.key === 'reco')?.state).toBe('done')
    expect(ok.phases[0].clock).toBeUndefined()
  })
  it('landlord archive is a follow-up table: decision · notice · lease · move-in', () => {
    const p = read('app/landlord/applicants/page.tsx')
    expect(p).toContain("useFacts('landlord')")
    expect(p).toContain("lang === 'zh' ? '未发通知' : 'Not sent'")
    expect(p).toContain('leaseStateDetail(lease, lang === \'zh\')')
    expect(p).toContain("lang === 'zh' ? '在管租约已确认' : 'Tenancy confirmed'")
  })
  it('the screening landing forwards only landlords and registered agents; a signed-in tenant sees the landing', () => {
    const a = read('app/screening/AutoEnter.tsx')
    expect(a).toContain('if (hats.landlord || isRegistrationLive(hats.agent)) router.replace(\'/screening/app\')')
    expect(a).not.toContain('if (!cancelled && data.session) router.replace')
  })
  it('the screening landing CTA is hat-aware: tenants get their own door', () => {
    const c = read('components/screening/ScreeningCta.tsx')
    expect(c).toContain('data-testid="screening-cta-tenant"')
    expect(c).toContain('href="/tenant/passport"')
    expect(c).toContain('href="/landlord/become?next=%2Fscreening%2Fapp"')
    const body = read('app/screening/LandingBody.tsx')
    expect((body.match(/<ScreeningCta /g) || []).length).toBe(2)
    expect(body).not.toContain('href="/screening/app"')
  })
})

describe('the audit page is real', () => {
  it('/x/audit renders the account\'s own audit rows with hat · action · matter · result above the sample', () => {
    expect(read('components/AuditLog.tsx')).toContain('liveSlot={<LiveAuditLog role={role} />}')
    const a = read('components/audit/LiveAuditLog.tsx')
    expect(a).toContain("select('id, action, created_at, actor_type, acting_role, matter_type, matter_id, target_type, target_id, metadata')")
    expect(a).toContain('data-testid="live-audit"')
    expect(a).toMatch(/const NOT_AUDIT = \/session\|turn\$/)
  })
  it('execution receipts carry the acting hat and the matter; the writer derives the matter from ids', async () => {
    const ex = read('app/api/agent/execute/route.ts')
    expect(ex).toContain('acting_role: action.role ?? null')
    expect(ex).toContain('matter_type: ref.matterType')
    const { matterRef } = await import('@/lib/agent/audit')
    expect(matterRef({ lease_id: '46b558d0-0028-42dd-9964-0f1b88829c20', sent_to: 'x' })).toEqual({ matterType: 'lease', matterId: '46b558d0-0028-42dd-9964-0f1b88829c20' })
    expect(matterRef({ work_order_id: '8e668976-0000-4000-8000-000000000000', ticket_id: '8e668976-0000-4000-8000-000000000001' })).toEqual({ matterType: 'work_order', matterId: '8e668976-0000-4000-8000-000000000000' })
    expect(matterRef({ note: 'nothing' })).toEqual({ matterType: null, matterId: null })
  })
})

describe('copy and access', () => {
  it('the apply form never shows true / false', () => {
    const p = read('app/apply/[slug]/page.tsx')
    expect(p).not.toContain("options={['false', 'true']}")
    expect(p).toContain("label: zh ? '否' : 'No'")
  })
  it('no Brief pack wording; the demo client fixture says 带看准备包', () => {
    expect(read('app/agent/tasks/page.tsx')).toContain("package: { zh: '带看准备包', en: 'Showing pack' }")
    expect(read('lib/demo/agentClients.ts')).not.toContain('brief 包')
  })
  it('material downloads are recorded separately from views', () => {
    const r = read('app/api/file-url/route.ts')
    expect(r).toContain("download ? 'application_file_downloaded' : 'application_file_viewed'")
    expect(r).toContain('createSignedUrl(path, 600, download ? { download: true } : undefined)')
    expect(read('components/landlord/FilePreviewModal.tsx')).toContain('data-testid="file-download"')
  })
  it('the publish button says what is missing; the agent settings page names its plan; the import page lives in the workbench', () => {
    expect(read('app/dashboard/listings/new/page.tsx')).toContain('data-testid="publish-missing"')
    expect(read('app/settings/page.tsx')).toContain('data-testid="agent-plan-note"')
    const imp = read('app/leases/import/page.tsx')
    expect(imp).toContain('<WorkspaceShell role={shellRole} hideAside>')
    expect(imp).toContain("aria-label={zh ? '选择租约文件' : 'Choose lease file(s)'}")
  })
  it('the cross-hat probe script exists and never hard-codes the password', () => {
    const s = read('scripts/e2e/hat-probes.sh')
    expect(s).toContain('E2E_TEST_PASSWORD')
    expect(s).not.toMatch(/Test1234/)
    expect(s).toContain('lifecycle_facts_landlord')
  })
})

// ship40 (2026-09-26) failed at the next-on-pages step: the new
// /tenant/applications/[id] page had no `export const runtime = 'edge'`, and
// only dynamic segments need it, so tsc and vitest were both green. Every
// dynamic page and every API route must declare the edge runtime.
describe('every dynamic page and API route runs on the edge', () => {
  const walk = (dir: string, out: string[] = []): string[] => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name)
      if (e.isDirectory()) walk(p, out)
      else if (e.name === 'page.tsx' || e.name === 'route.ts') out.push(p)
    }
    return out
  }
  it('no dynamic segment page or route.ts is missing the export', () => {
    const files = walk('app').filter((p) => p.endsWith('route.ts') || /\[[^/]+\]\/page\.tsx$/.test(p))
    const missing = files.filter((p) => !read(p).includes("export const runtime = 'edge'"))
    expect(missing).toEqual([])
  })
})
