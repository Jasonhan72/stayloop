// Guards for the page-load review (2026-09-23, user: "刷新后加载很慢"): every
// REST query fired twice per load because useAuth handed out a new user object
// for the same login; the header ran three assistant-name queries; two
// components fetched the same pending count; the tenant lifecycle loader
// needed three dependent round trips; the model catalogue was refetched on
// every refresh.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const read = (p: string) => readFileSync(p, 'utf8')

describe('page-load round trips', () => {
  it('useAuth keeps the same user object when the login has not changed', () => {
    const s = read('lib/useAuth.ts')
    expect(s).toContain('const sameUser = !!prev.user && !!s?.user && prev.user.id === s.user.id')
    expect(s).toContain("if (!prev.loading && sameUser && sameToken && event !== 'USER_UPDATED' && prev.role === role) return prev")
    expect(s).not.toMatch(/setState\(\(prev\) => \(\{\s*\.\.\.prev,\s*loading: false,\s*user: s\?\.user/)
  })
  it('useHats shares one in-flight my_hats promise per user', () => {
    const s = read('lib/useHats.ts')
    expect(s).toContain('if (inflight && inflight.uid === uid) return inflight.p')
    expect(s).toContain('inflight = null }')
  })
  it('the assistant name comes from one profile query per session (one assistant per account, 2026-09-25)', () => {
    const s = read('lib/aiName.ts')
    expect(s).toContain('let nameResolve: Promise<string | null> | null = null')
    expect(s).toContain('const profile = await readAssistantProfile(supabase)')
    expect(s).not.toContain("from('agent_configs')")
  })
  it('Header and phone tabs read the pending badge through the shared fetch', () => {
    expect(read('components/Header.tsx')).toContain('fetchPendingCount(currentRole)')
    expect(read('components/WorkspaceShell.tsx')).toContain('fetchPendingCount(role)')
    for (const f of ['components/Header.tsx', 'components/WorkspaceShell.tsx']) expect(read(f)).not.toContain("from('agent_pending_actions').select('id', { count: 'exact', head: true })")
  })
  it('tenant lifecycle loads in two dependent batches', () => {
    const s = read('lib/lifecycle/useLifecycle.ts')
    const body = s.slice(s.indexOf('async function loadTenant'), s.indexOf('async function loadAgent'))
    expect((body.match(/await Promise\.all\(/g) || []).length).toBe(2)
    expect(body).not.toMatch(/const \{ data: tenantRow \} = await supabase/)
  })
  it('agent session reads run alongside the bootstrap RPC', () => {
    const s = read('lib/agent/session-loader.ts')
    expect(s).toContain("const [{ data: sessRow, error: bootErr }, { data: cfgByRole }, { data: task }, memories, pendingActions, profile] =")
    expect(s).toContain('(cfgByRole as { id: string }).id === session.agent_config_id')
  })
  it('tenants row lookup is shared and the status tiles start on user, not on live', () => {
    expect(read('lib/lifecycle/useLifecycle.ts')).toContain('getTenantRow(uid)')
    const so = read('components/agent/StatusOverview.tsx')
    expect(so).toContain('const t = await getTenantRow(uid)')
    expect(so).toContain('}, [user, role])')
    expect(so).not.toContain('}, [live, user, role])')
  })
  it('model catalogue is cached per user for the session', () => {
    const s = read('components/agent/AgentInputBar.tsx')
    expect(s).toContain("const CATALOG_CACHE_KEY = 'sl-model-catalog'")
    expect(s).toContain('sessionStorage.removeItem(`${CATALOG_CACHE_KEY}:${auth.user.id}`)')
  })
})
