'use client'
// Unread message count for the header envelope (消息系统 A 期). One RPC
// (my_unread_messages, RLS-scoped), shared for 2 s so the envelope, the rail and
// the phone sheet do not each ask; MESSAGES_CHANGED_EVENT refreshes it.
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
