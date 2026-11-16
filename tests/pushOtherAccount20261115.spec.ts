// @vitest-environment jsdom
// 2026-11-15 · user: 「这个为什么不能改？」 — turning push on showed
//   没能开启：new row violates row-level security policy (USING expression) for table "push_subscriptions"
// The browser already held a push subscription registered to ANOTHER account that had used it
// (endpoint is unique; the row is theirs; the upsert's UPDATE is refused, 42501). Reproduced in a
// rolled-back transaction with two test accounts and the same endpoint. A device belongs to
// whoever is signed in on it now: enablePush takes a fresh subscription and saves that.
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Row = { user_id: string; endpoint: string }
const db = { rows: [] as Row[], upserts: [] as Row[], failAll: null as null | { code: string; message: string } }
const ME = 'user-b'

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: { id: ME } } }) },
    from: () => ({
      upsert: async (row: Row) => {
        db.upserts.push(row)
        if (db.failAll) return { error: db.failAll }
        const hit = db.rows.find((r) => r.endpoint === row.endpoint)
        // RLS: the conflicting row must be the caller's own to be updated
        if (hit && hit.user_id !== row.user_id) return { error: { code: '42501', message: 'new row violates row-level security policy (USING expression) for table "push_subscriptions"' } }
        if (hit) Object.assign(hit, row); else db.rows.push({ ...row })
        return { error: null }
      },
    }),
  },
}))

let current: { endpoint: string; unsubscribed: boolean; toJSON: () => unknown; unsubscribe: () => Promise<boolean> } | null
let minted = 0
const makeSub = (endpoint: string) => {
  const s = { endpoint, unsubscribed: false, toJSON: () => ({ keys: { p256dh: 'p', auth: 'a' } }), unsubscribe: async () => { s.unsubscribed = true; current = null; return true } }
  return s
}

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_VAPID_PUBLIC_KEY', 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U')
  vi.resetModules()
  db.rows = []; db.upserts = []; db.failAll = null; current = null; minted = 0
  const pushManager = {
    getSubscription: async () => current,
    subscribe: async () => { minted++; current = makeSub(`https://push.example/fresh-${minted}`); return current },
  }
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { ready: Promise.resolve({ pushManager }) } })
  ;(window as unknown as Record<string, unknown>).PushManager = function PushManager() {}
  ;(window as unknown as Record<string, unknown>).Notification = { permission: 'granted', requestPermission: async () => 'granted' }
  ;(globalThis as unknown as Record<string, unknown>).Notification = (window as unknown as Record<string, unknown>).Notification
})
afterEach(() => { vi.unstubAllEnvs() })

const load = async () => (await import('@/lib/push/client')).enablePush

describe('enablePush on a browser another account used', () => {
  it('first time on this browser: subscribes and saves', async () => {
    const enablePush = await load()
    expect(await enablePush('default')).toEqual({ ok: true })
    expect(db.rows).toEqual([expect.objectContaining({ user_id: ME, endpoint: 'https://push.example/fresh-1' })])
  })

  it('own existing subscription: saved again on the same endpoint, no re-subscribe', async () => {
    current = makeSub('https://push.example/mine')
    db.rows = [{ user_id: ME, endpoint: 'https://push.example/mine' }]
    const enablePush = await load()
    expect(await enablePush('quiet')).toEqual({ ok: true })
    expect(minted).toBe(0)
    expect(db.rows).toHaveLength(1)
  })

  it("the endpoint is another account's: drops the browser subscription, takes a fresh one, saves it", async () => {
    const old = makeSub('https://push.example/shared')
    current = old
    db.rows = [{ user_id: 'user-a', endpoint: 'https://push.example/shared' }]
    const enablePush = await load()
    expect(await enablePush('default')).toEqual({ ok: true })
    expect(old.unsubscribed).toBe(true)
    expect(minted).toBe(1)
    expect(db.upserts.map((r) => r.endpoint)).toEqual(['https://push.example/shared', 'https://push.example/fresh-1'])
    // the other account's row is untouched (it dies on its next push: the endpoint is gone)
    expect(db.rows).toEqual([
      { user_id: 'user-a', endpoint: 'https://push.example/shared' },
      expect.objectContaining({ user_id: ME, endpoint: 'https://push.example/fresh-1' }),
    ])
  })

  it('never hands the database message to the UI', async () => {
    db.failAll = { code: '42501', message: 'new row violates row-level security policy' }
    const enablePush = await load()
    expect(await enablePush('default')).toEqual({ ok: false, reason: 'other_account' })
    db.failAll = { code: '57014', message: 'canceling statement due to statement timeout' }
    expect(await (await load())('default')).toEqual({ ok: false, reason: 'save_failed' })
  })
})

describe('the settings card', () => {
  it('turns every failure reason into a sentence, in the interface language only', async () => {
    const { enableFailure } = await import('@/components/mobile/PushSettingsCard')
    for (const r of ['denied', 'default', 'signed_out', 'unsupported', 'other_account', 'save_failed', 'no_keys', undefined]) {
      const zh = enableFailure(r, true)
      const en = enableFailure(r, false)
      expect(zh).not.toMatch(/row-level|policy|push_subscriptions|undefined/)
      expect(en).not.toMatch(/[一-鿿]|row-level|policy|undefined/)
      expect(zh.length).toBeGreaterThan(6)
    }
    expect(enableFailure('save_failed', true)).toBe('没能开启，请稍后再试。')
    const src = readFileSync('components/mobile/PushSettingsCard.tsx', 'utf8')
    expect(src).toContain('if (!r.ok) setNote(enableFailure(r.reason, zh))')
    expect(src).not.toContain('没能开启：${r.reason}')
  })
})
