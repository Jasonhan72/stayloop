// The cached assistant name belongs to one account (prod 2026-09-25: a
// magic-link sign-in on a browser that still held the previous account's
// `sl-ai-name` pushed that name into the new account's assistant_profiles row —
// sign-out clears the cache, but a session can be replaced without one).
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'

const h = vi.hoisted(() => ({
  session: { user: { id: 'u2' } } as { user: { id: string } } | null,
  profile: { name: 'Zed', avatar: null } as { name: string | null; avatar: string | null } | null,
  reads: 0,
}))
vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: h.session } }) } },
  getSupabaseBrowser: () => ({}),
}))
vi.mock('@/lib/agent/assistantProfile', () => ({
  readAssistantProfile: async () => { h.reads += 1; return h.profile },
  saveAssistantName: async () => {},
  saveAssistantAvatar: async () => {},
}))

const read = (p: string) => readFileSync(p, 'utf8')

function memoryStorage() {
  const m = new Map<string, string>()
  return {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => { m.set(k, String(v)) },
    removeItem: (k: string) => { m.delete(k) },
    clear: () => m.clear(),
    keys: () => [...m.keys()],
  }
}

describe('assistant name cache is bound to its account', () => {
  const store = memoryStorage()
  beforeEach(() => {
    store.clear()
    vi.stubGlobal('window', { localStorage: store })
    vi.stubGlobal('localStorage', store)
  })

  it('a name chosen before signing in is unclaimed: any account may adopt it', async () => {
    const { setAIName, getStoredAIName, getAIName } = await import('@/lib/aiName')
    setAIName('Nova', null)
    expect(getStoredAIName(null)).toBe('Nova')
    expect(getStoredAIName('u1')).toBe('Nova')
    expect(getAIName('u9')).toBe('Nova')
    expect(store.getItem('sl-ai-name-owner')).toBeNull()
  })

  it('a name cached for account A is never shown to account B or to a signed-out visitor', async () => {
    const { setAIName, getStoredAIName, getAIName } = await import('@/lib/aiName')
    setAIName('Ember', 'u1')
    expect(getStoredAIName('u1')).toBe('Ember')
    expect(getStoredAIName('u2')).toBeNull()
    expect(getStoredAIName(null)).toBeNull()
    expect(getStoredAIName()).toBeNull()
    expect(getAIName('u2')).toBe('AI Agent')
  })

  it('dropForeignAIName clears another account’s cache and leaves the account’s own (or an unclaimed one) alone', async () => {
    const { setAIName, getStoredAIName, dropForeignAIName } = await import('@/lib/aiName')
    setAIName('Ember', 'u1')
    dropForeignAIName('u1')
    expect(getStoredAIName('u1')).toBe('Ember')
    dropForeignAIName('u2')
    expect(store.getItem('sl-ai-name')).toBeNull()
    expect(store.getItem('sl-ai-name-owner')).toBeNull()
    setAIName('Nova', null)
    dropForeignAIName('u2')
    expect(getStoredAIName('u2')).toBe('Nova')
  })

  it('clearCachedAiNames removes the name, its owner and the legacy per-hat keys', async () => {
    const { setAIName, clearCachedAiNames } = await import('@/lib/aiName')
    setAIName('Ember', 'u1')
    store.setItem('sl-landlord-ai-name', 'Logic')
    clearCachedAiNames()
    expect(store.keys()).toEqual([])
  })

  it('resolveAccountName reads the profile once per page load and again after invalidateAiName', async () => {
    const { resolveAccountName, invalidateAiName } = await import('@/lib/aiName')
    invalidateAiName()
    h.reads = 0
    const a = await resolveAccountName()
    const b = await resolveAccountName()
    expect(a).toEqual({ uid: 'u2', name: 'Zed' })
    expect(b).toEqual(a)
    expect(h.reads).toBe(1)
    invalidateAiName()
    await resolveAccountName()
    expect(h.reads).toBe(2)
  })

  it('every reader passes the account, every writer names the owner, the session hook drops a foreign cache before reconciling', () => {
    const hook = read('lib/agent/useAgentSession.ts')
    expect(hook).toContain('dropForeignAIName(uid)')
    expect(hook).toContain('const local = getStoredAIName(uid)')
    expect(hook).toContain('setAIName(dbName, uid)')
    expect(hook).toContain('await saveAssistantName(client, uid, local)\n      setAIName(local, uid)')
    expect(hook).toContain("getStoredAIName(isLive && user?.id ? user.id : null)")
    expect(read('components/agent/AssistantPanel.tsx')).toContain('setAIName(next, live && auth.user ? auth.user.id : null)')
    expect(read('app/settings/page.tsx')).toContain('setAIName(trimmed, user?.id ?? null)')
    expect(read('app/settings/page.tsx')).toContain('getAIName(auth.user?.id ?? null)')
    expect(read('app/onboarding/name/page.tsx')).toContain('setAIName(chosen, user?.id ?? null)')
    expect(read('lib/useOnboarding.ts')).toContain('resolveAccountName().then(({ uid, name }) => { if (!cancelled && uid === user.id && name) setNamed(true) })')
    const lib = read('lib/aiName.ts')
    expect(lib).toContain('if (uid) dropForeignAIName(uid)')
    expect(lib).toContain("const OWNER_KEY = 'sl-ai-name-owner'")
    // no caller is left on the old owner-less signatures
    for (const f of ['components/agent/AssistantPanel.tsx', 'app/settings/page.tsx', 'app/onboarding/name/page.tsx', 'lib/agent/useAgentSession.ts', 'lib/useOnboarding.ts']) {
      const s = read(f)
      expect(s, f).not.toMatch(/setAIName\([^,()]*\)/)
      expect(s, f).not.toMatch(/getStoredAIName\(\)|getAIName\(\)/)
    }
  })
})
