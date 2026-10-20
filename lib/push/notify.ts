// Server side of push: who to tell, and the Muse-style threshold (2026-09-22).
//
// Two kinds of message, two per-device levels:
//   kind 'approval' — a card is waiting for the user's decision (renewal
//                     touchpoint, showing request, …). Sent at both levels.
//   kind 'event'    — something genuinely new happened that needs no
//                     decision yet (a new application arrived). Sent at
//                     'default' only; 'quiet' devices skip it.
// Nothing "completed" is ever pushed — the panel's 「最近替你办完」 and the audit page are for that.
import type { SupabaseClient } from '@supabase/supabase-js'
import { sendWebPush, type PushKeys } from './webpush'

export type PushLevel = 'default' | 'quiet'
export type PushMessage = { kind: 'approval' | 'event'; title: string; body: string; url: string }

export function shouldNotify(level: PushLevel, msg: Pick<PushMessage, 'kind'>): boolean {
  if (level === 'quiet') return msg.kind === 'approval'
  return true
}

export function pushKeysFromEnv(env: Record<string, string | undefined> = process.env): PushKeys | null {
  const publicKey = env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = env.VAPID_PRIVATE_KEY
  if (!publicKey || !privateKey) return null
  return { publicKey, privateKey, subject: 'mailto:privacy@stayloop.ai' }
}

type Row = { id: string; endpoint: string; p256dh: string; auth: string; level: PushLevel; fail_count: number; created_at: string | null }

/**
 * A subscription this young can get a 404 from FCM that only means "not registered yet" — the
 * push service needs a second or two after subscribe(). Disabling on that 404 turned off push for
 * people who pressed 「发送测试」 right after enabling (regression report 2026-10-19, S3).
 */
export const FRESH_SUBSCRIPTION_MS = 60_000
export const MAX_CONSECUTIVE_FAILURES = 5

/**
 * What a failed send does to the subscription. 410 is always final; a 404 is final unless the
 * subscription is under FRESH_SUBSCRIPTION_MS old, then it only counts like any other failure.
 * Any failure disables after MAX_CONSECUTIVE_FAILURES in a row.
 */
export function failureAction(
  res: { status: number; gone: boolean },
  row: { fail_count: number; created_at: string | null },
  now: number = Date.now(),
): 'disable' | 'count' {
  if (row.fail_count + 1 >= MAX_CONSECUTIVE_FAILURES) return 'disable'
  if (!res.gone) return 'count'
  if (res.status === 404 && row.created_at) {
    const age = now - Date.parse(row.created_at)
    if (Number.isFinite(age) && age >= 0 && age < FRESH_SUBSCRIPTION_MS) return 'count'
  }
  return 'disable'
}

/**
 * Best-effort fan-out to every live device of one user. Never throws; a dead
 * endpoint (410, or 404 once the subscription is past its first minute) is
 * disabled, other failures bump fail_count and disable after five in a row
 * (failureAction). Returns how many were sent.
 */
export async function notifyUser(admin: SupabaseClient, userId: string, msg: PushMessage, keys: PushKeys | null = pushKeysFromEnv()): Promise<number> {
  if (!keys) return 0
  try {
    const { data } = await admin
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth, level, fail_count, created_at')
      .eq('user_id', userId)
      .is('disabled_at', null)
      .limit(10)
    const rows = (data ?? []) as Row[]
    let sent = 0
    await Promise.all(rows.map(async (r) => {
      if (!shouldNotify(r.level, msg)) return
      const res = await sendWebPush(r, { title: msg.title, body: msg.body, url: msg.url, kind: msg.kind }, keys)
      if (res.ok) {
        sent++
        await admin.from('push_subscriptions').update({ last_used_at: new Date().toISOString(), fail_count: 0 }).eq('id', r.id)
      } else if (failureAction(res, r) === 'disable') {
        await admin.from('push_subscriptions').update({ disabled_at: new Date().toISOString(), fail_count: r.fail_count + 1 }).eq('id', r.id)
      } else {
        await admin.from('push_subscriptions').update({ fail_count: r.fail_count + 1 }).eq('id', r.id)
      }
    }))
    return sent
  } catch (e) {
    console.warn('[push] notifyUser failed:', (e as Error).message)
    return 0
  }
}
