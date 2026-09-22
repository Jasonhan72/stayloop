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
  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64urlToUint8(KEY) as BufferSource })
  }
  const j = sub.toJSON()
  const keys = j.keys || {}
  if (!keys.p256dh || !keys.auth) return { ok: false, reason: 'no_keys' }
  const { error } = await supabase.from('push_subscriptions').upsert(
    { user_id: u.user.id, endpoint: sub.endpoint, p256dh: keys.p256dh, auth: keys.auth, level, user_agent: navigator.userAgent.slice(0, 200), disabled_at: null, fail_count: 0 },
    { onConflict: 'endpoint' },
  )
  if (error) return { ok: false, reason: error.message }
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
