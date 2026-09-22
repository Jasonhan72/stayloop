// Server side of push: who to tell, and the Muse-style threshold (2026-09-22).
//
// Two kinds of message, two per-device levels:
//   kind 'approval' — a card is waiting for the user's decision (renewal
//                     touchpoint, showing request, …). Sent at both levels.
//   kind 'event'    — something genuinely new happened that needs no
//                     decision yet (a new application arrived). Sent at
//                     'default' only; 'quiet' devices skip it.
// Nothing "completed" is ever pushed — the activity log is for that.
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

type Row = { id: string; endpoint: string; p256dh: string; auth: string; level: PushLevel; fail_count: number }

/**
 * Best-effort fan-out to every live device of one user. Never throws; a dead
 * endpoint (404/410) is disabled, other failures bump fail_count and disable
 * after five in a row. Returns how many were sent.
 */
export async function notifyUser(admin: SupabaseClient, userId: string, msg: PushMessage, keys: PushKeys | null = pushKeysFromEnv()): Promise<number> {
  if (!keys) return 0
  try {
    const { data } = await admin
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth, level, fail_count')
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
      } else if (res.gone || r.fail_count + 1 >= 5) {
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
