'use client'
// Header envelope → /messages, with the unread count (消息系统 A 期). Signed-in only.
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/lib/useAuth'
import { fetchUnreadMessages, MESSAGES_CHANGED_EVENT } from '@/lib/messages/unread'

export default function InboxButton({ zh }: { zh: boolean }) {
  const auth = useAuth()
  const [n, setN] = useState(0)
  useEffect(() => {
    if (auth.loading || !auth.user) { setN(0); return }
    let on = true
    const load = (force = false) => fetchUnreadMessages(force).then((v) => { if (on) setN(v) })
    void load()
    const onEvt = () => void load(true)
    const onVis = () => { if (document.visibilityState === 'visible') void load(true) }
    window.addEventListener(MESSAGES_CHANGED_EVENT, onEvt)
    document.addEventListener('visibilitychange', onVis)
    const iv = setInterval(() => { if (document.visibilityState === 'visible') void load(true) }, 60_000)
    return () => { on = false; window.removeEventListener(MESSAGES_CHANGED_EVENT, onEvt); document.removeEventListener('visibilitychange', onVis); clearInterval(iv) }
  }, [auth.loading, auth.user])
  if (auth.loading || !auth.user) return null
  const label = zh ? (n ? `消息 · ${n} 条未读` : '消息') : n ? `Messages · ${n} unread` : 'Messages'
  return (
    <Link href="/messages" aria-label={label} title={label} data-testid="inbox-button"
      className="relative flex h-[42px] w-[42px] items-center justify-center rounded-full border border-[#DDDDDD] bg-white text-[#222] transition hover:shadow-[0_2px_4px_rgba(0,0,0,0.18)]">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></svg>
      {n > 0 && <span data-testid="inbox-unread" className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-white bg-[#FF385C] px-1 text-[10.5px] font-extrabold text-white">{n > 99 ? '99+' : n}</span>}
    </Link>
  )
}
