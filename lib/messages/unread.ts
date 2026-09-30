'use client'
// Unread message count for the header menu (消息系统 A 期; 2026-09-30 the envelope folded into the hamburger). One RPC
// (my_unread_messages, RLS-scoped), shared for 2 s so the envelope, the rail and
// the phone sheet do not each ask; MESSAGES_CHANGED_EVENT refreshes it.
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export const MESSAGES_CHANGED_EVENT = 'sl-messages-changed'
let inflight: Promise<number> | null = null
let at = 0
let last = 0

export function fetchUnreadMessages(force = false): Promise<number> {
  if (!force && inflight && Date.now() - at < 2000) return inflight
  at = Date.now()
  inflight = (async () => {
    const { data, error } = await supabase.rpc('my_unread_messages')
    if (!error && typeof data === 'number') last = data
    return last
  })()
  return inflight
}

export function notifyMessagesChanged() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(MESSAGES_CHANGED_EVENT))
}

/** Unread count for the signed-in user; refreshes on MESSAGES_CHANGED_EVENT, on tab focus, and every minute. */
export function useUnreadMessages(signedIn: boolean): number {
  const [n, setN] = useState(0)
  useEffect(() => {
    if (!signedIn) { setN(0); return }
    let on = true
    const load = (force = false) => fetchUnreadMessages(force).then((v) => { if (on) setN(v) })
    void load()
    const onEvt = () => void load(true)
    const onVis = () => { if (document.visibilityState === 'visible') void load(true) }
    window.addEventListener(MESSAGES_CHANGED_EVENT, onEvt)
    document.addEventListener('visibilitychange', onVis)
    const iv = setInterval(() => { if (document.visibilityState === 'visible') void load(true) }, 60_000)
    return () => { on = false; window.removeEventListener(MESSAGES_CHANGED_EVENT, onEvt); document.removeEventListener('visibilitychange', onVis); clearInterval(iv) }
  }, [signedIn])
  return n
}
