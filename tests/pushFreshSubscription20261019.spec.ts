// S3 (regression report 2026-10-19): FCM answers 404 for a subscription that is only a second or
// two old ("not registered yet"). notifyUser used to disable on any 404, so 「发送测试」 right after
// enabling could switch push off. Within FRESH_SUBSCRIPTION_MS a 404 only counts.
import { describe, expect, it, vi, beforeEach } from 'vitest'

const sendMock = vi.fn()
vi.mock('../lib/push/webpush', () => ({ sendWebPush: (...a: unknown[]) => sendMock(...a) }))

import { failureAction, notifyUser, FRESH_SUBSCRIPTION_MS, MAX_CONSECUTIVE_FAILURES } from '../lib/push/notify'

const NOW = Date.parse('2026-10-19T20:30:00.000Z')
const ago = (ms: number) => new Date(NOW - ms).toISOString()
const KEYS = { publicKey: 'p', privateKey: 'k', subject: 'mailto:privacy@stayloop.ai' }

describe('failureAction', () => {
  it('a 404 on a subscription under a minute old only counts', () => {
    expect(failureAction({ status: 404, gone: true }, { fail_count: 0, created_at: ago(2_000) }, NOW)).toBe('count')
    expect(failureAction({ status: 404, gone: true }, { fail_count: 0, created_at: ago(FRESH_SUBSCRIPTION_MS - 1) }, NOW)).toBe('count')
  })
  it('a 404 at or after one minute disables, as before', () => {
    expect(failureAction({ status: 404, gone: true }, { fail_count: 0, created_at: ago(FRESH_SUBSCRIPTION_MS) }, NOW)).toBe('disable')
    expect(failureAction({ status: 404, gone: true }, { fail_count: 0, created_at: ago(86_400_000) }, NOW)).toBe('disable')
  })
  it('410 is final even on a brand-new subscription', () => {
    expect(failureAction({ status: 410, gone: true }, { fail_count: 0, created_at: ago(1_000) }, NOW)).toBe('disable')
  })
  it('without a usable created_at a 404 disables (no grace on unknown age, none for a future timestamp)', () => {
    expect(failureAction({ status: 404, gone: true }, { fail_count: 0, created_at: null }, NOW)).toBe('disable')
    expect(failureAction({ status: 404, gone: true }, { fail_count: 0, created_at: 'not a date' }, NOW)).toBe('disable')
    expect(failureAction({ status: 404, gone: true }, { fail_count: 0, created_at: new Date(NOW + 5_000).toISOString() }, NOW)).toBe('disable')
  })
  it('other failures count, and any failure disables at five in a row — grace included', () => {
    expect(failureAction({ status: 500, gone: false }, { fail_count: 0, created_at: ago(86_400_000) }, NOW)).toBe('count')
    expect(failureAction({ status: 0, gone: false }, { fail_count: MAX_CONSECUTIVE_FAILURES - 2, created_at: null }, NOW)).toBe('count')
    expect(failureAction({ status: 500, gone: false }, { fail_count: MAX_CONSECUTIVE_FAILURES - 1, created_at: null }, NOW)).toBe('disable')
    expect(failureAction({ status: 404, gone: true }, { fail_count: MAX_CONSECUTIVE_FAILURES - 1, created_at: ago(1_000) }, NOW)).toBe('disable')
  })
})

type Row = { id: string; endpoint: string; p256dh: string; auth: string; level: 'default' | 'quiet'; fail_count: number; created_at: string | null }

function fakeAdmin(rows: Row[]) {
  const updates: { id: string; patch: Record<string, unknown> }[] = []
  let selected = ''
  const admin = {
    from(table: string) {
      expect(table).toBe('push_subscriptions')
      return {
        select(cols: string) {
          selected = cols
          const q = { eq: () => q, is: () => q, limit: async () => ({ data: rows }) }
          return q
        },
        update(patch: Record<string, unknown>) {
          return { eq: async (_c: string, id: string) => { updates.push({ id, patch }); return { error: null } } }
        },
      }
    },
  }
  return { admin: admin as never, updates, selectedCols: () => selected }
}

describe('notifyUser applies the grace window', () => {
  beforeEach(() => { sendMock.mockReset(); vi.useFakeTimers(); vi.setSystemTime(NOW) })

  it('fresh 404 → fail_count bumped, not disabled; old 404 → disabled; 201 → counted as sent', async () => {
    const base = { endpoint: 'https://fcm.googleapis.com/fcm/send/x', p256dh: 'p', auth: 'a', level: 'default' as const }
    const { admin, updates, selectedCols } = fakeAdmin([
      { ...base, id: 'fresh', fail_count: 0, created_at: ago(3_000) },
      { ...base, id: 'old', fail_count: 0, created_at: ago(3 * 86_400_000) },
      { ...base, id: 'ok', fail_count: 2, created_at: ago(3_000) },
    ])
    sendMock.mockImplementation(async (r: Row) => (r.id === 'ok' ? { ok: true, status: 201, gone: false } : { ok: false, status: 404, gone: true }))
    const sent = await notifyUser(admin, 'user-1', { kind: 'event', title: 't', body: 'b', url: '/' }, KEYS)
    vi.useRealTimers()

    expect(selectedCols()).toContain('created_at')
    expect(sent).toBe(1)
    const by = Object.fromEntries(updates.map((u) => [u.id, u.patch]))
    expect(by.fresh).toEqual({ fail_count: 1 })
    expect(by.old).toMatchObject({ fail_count: 1 })
    expect(typeof by.old.disabled_at).toBe('string')
    expect(by.ok).toMatchObject({ fail_count: 0 })
    expect(by.ok.disabled_at).toBeUndefined()
  })
})
