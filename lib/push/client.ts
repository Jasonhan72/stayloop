'use client'

// Browser side of push (2026-09-22). The subscription row is the user's own
// (push_subscriptions RLS = self), so it is written straight through the
// RLS client — no API route. The VAPID public key is build-inlined.
import { supabase } from '@/lib/supabase'
import type { PushLevel } from './notify'

export type PushState = {
  supported: boolean
  /** iOS Safari only delivers push to an installed (home-screen) web app. */
  needsInstall: boolean
  permission: NotificationPermission | 'unsupported'
  subscribed: boolean
  level: PushLevel
}

const KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || ''
/** Postgres insufficient_privilege — what a row-level-security refusal comes back as. */
const RLS_VIOLATION = '42501'

function b64urlToUint8(s: string): Uint8Array {
  const pad = '='.repeat((4 - (s.length % 4)) % 4)
  const b64 = (s + pad).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}
function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true
}

export function pushSupported(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && !!KEY
}

export async function getPushState(): Promise<PushState> {
  if (!pushSupported()) {
    const needsInstall = typeof window !== 'undefined' && isIos() && !isStandalone()
    return { supported: false, needsInstall, permission: 'unsupported', subscribed: false, level: 'default' }
  }
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  let level: PushLevel = 'default'
  if (sub) {
    const { data } = await supabase.from('push_subscriptions').select('level, disabled_at').eq('endpoint', sub.endpoint).maybeSingle()
    if (data?.level === 'quiet') level = 'quiet'
    if (!data || data.disabled_at) {
      // Browser still holds a subscription the server no longer knows — treat as off.
      return { supported: true, needsInstall: false, permission: Notification.permission, subscribed: false, level }
    }
  }
  return { supported: true, needsInstall: false, permission: Notification.permission, subscribed: !!sub, level }
}

export async function enablePush(level: PushLevel = 'default'): Promise<{ ok: boolean; reason?: string }> {
  if (!pushSupported()) return { ok: false, reason: 'unsupported' }
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') return { ok: false, reason: perm }
  const { data: u } = await supabase.auth.getUser()
  if (!u.user) return { ok: false, reason: 'signed_out' }
  const reg = await navigator.serviceWorker.ready
  const subscribe = () => reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64urlToUint8(KEY) as BufferSource })
  const userId = u.user.id
  const save = async (sub: PushSubscription): Promise<{ code?: string; message: string } | 'no_keys' | null> => {
    const keys = sub.toJSON().keys || {}
    if (!keys.p256dh || !keys.auth) return 'no_keys'
    const { error } = await supabase.from('push_subscriptions').upsert(
      { user_id: userId, endpoint: sub.endpoint, p256dh: keys.p256dh, auth: keys.auth, level, user_agent: navigator.userAgent.slice(0, 200), disabled_at: null, fail_count: 0 },
      { onConflict: 'endpoint' },
    )
    return error
  }
  let sub = (await reg.pushManager.getSubscription()) ?? (await subscribe())
  let err = await save(sub)
  if (err && err !== 'no_keys' && err.code === RLS_VIOLATION) {
    // This browser's subscription is registered to another account that used it before
    // (endpoint is unique, and the row is theirs, so the upsert's UPDATE is refused — the
    // 「new row violates row-level security policy (USING expression)」 a user hit on 2026-11-15).
    // A device belongs to whoever is signed in on it now: drop the browser's subscription and
    // take a fresh one. The old endpoint stops existing, so the other account's row goes dead
    // on its next push (410 → disabled) and their notifications no longer land here.
    await sub.unsubscribe().catch(() => {})
    sub = await subscribe()
    err = await save(sub)
  }
  if (err === 'no_keys') return { ok: false, reason: 'no_keys' }
  if (err) return { ok: false, reason: err.code === RLS_VIOLATION ? 'other_account' : 'save_failed' }
  return { ok: true }
}

export async function setPushLevel(level: PushLevel): Promise<void> {
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  if (!sub) return
  await supabase.from('push_subscriptions').update({ level }).eq('endpoint', sub.endpoint)
}

export async function disablePush(): Promise<void> {
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  if (!sub) return
  await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
  await sub.unsubscribe().catch(() => {})
}

/** Signing out stops push on this device (user 2026-11-15: 「退出登录就停掉这台设备的推送」).
 *  Otherwise the account that signed out keeps getting its notifications on a device someone
 *  else may now be using. Call it BEFORE the session is dropped — deleting the row needs the
 *  signed-in user. The row and the browser subscription go independently: if the delete fails,
 *  the endpoint is still gone, so the row dies on its next push (410 → disabled).
 *  Never throws and never holds sign-out up for more than `timeoutMs`. Uses getRegistration(),
 *  not `ready` — `ready` never settles on a browser that has no service worker registered. */
export async function stopPushOnSignOut(timeoutMs = 2500): Promise<void> {
  if (typeof window === 'undefined' || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
  const work = (async () => {
    const reg = await navigator.serviceWorker.getRegistration()
    const sub = await reg?.pushManager?.getSubscription()
    if (!sub) return
    await Promise.allSettled([
      Promise.resolve(supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)),
      sub.unsubscribe(),
    ])
  })().catch(() => {})
  await Promise.race([work, new Promise<void>((resolve) => setTimeout(resolve, timeoutMs))])
}
