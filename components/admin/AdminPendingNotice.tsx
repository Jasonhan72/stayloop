'use client'
// The notice an admin sees after signing in when something is waiting on the back office
// (user 2026-11-15: 「管理员账号登录，如果要等待核验的，需要有登录后提示的机制」).
// Floats under the header's right edge — it is fixed, so it pushes nothing down (the assistant
// page keeps its "nothing above the conversation" rule). Not shown inside /admin: the admin home
// already carries the same counts on its cards. Closing it remembers this sign-in and these
// counts; it comes back on the next sign-in or when a queue grows.
import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  adminPendingSeenKey, openQueues, pendingTotal, readSeen, shouldShowNotice, type AdminPending, type AdminPendingSeen,
} from '@/lib/admin/pendingCounts'

export default function AdminPendingNotice({ pending, userId, signInAt, pathname, zh }: {
  pending: AdminPending | null
  userId: string | null
  signInAt: string | null
  pathname: string
  zh: boolean
}) {
  // Decided in an effect: storage is client-only, and the counts arrive after first paint anyway.
  const [show, setShow] = useState(false)
  useEffect(() => {
    if (!userId || !pending) { setShow(false); return }
    let seen: AdminPendingSeen | null = null
    try { seen = readSeen(window.localStorage.getItem(adminPendingSeenKey(userId))) } catch { /* private mode: show it */ }
    setShow(shouldShowNotice(pending, signInAt, seen))
  }, [pending, userId, signInAt])

  if (!show || !userId || !pending || pathname.startsWith('/admin')) return null
  const queues = openQueues(pending)
  const total = pendingTotal(pending)
  if (total === 0) return null

  const close = () => {
    try { window.localStorage.setItem(adminPendingSeenKey(userId), JSON.stringify({ signInAt, counts: pending } satisfies AdminPendingSeen)) } catch { /* nothing to remember it in */ }
    setShow(false)
  }

  return (
    <div
      role="status"
      data-testid="admin-pending-notice"
      className="fixed right-4 top-[76px] z-30 w-[320px] max-w-[calc(100vw-32px)] rounded-2xl border border-[#F3D9A4] bg-white p-4 shadow-[0_8px_28px_rgba(27,27,60,0.16)]"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-mono text-[10.5px] font-bold uppercase tracking-wider text-[#B45309]">{zh ? '后台管理' : 'Back office'}</div>
          <div className="mt-0.5 text-[15px] font-bold text-[#1B1B3C]">{zh ? `有 ${total} 项等你处理` : `${total} ${total === 1 ? 'item is' : 'items are'} waiting on you`}</div>
        </div>
        <button type="button" onClick={close} data-testid="admin-pending-notice-close" aria-label={zh ? '关闭提示' : 'Close notice'} className="-mr-1 -mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[16px] leading-none text-body-3 hover:bg-[#F3F4F6]">×</button>
      </div>
      <ul className="mt-3 space-y-1">
        {queues.map((q) => (
          <li key={q.key}>
            <Link href={q.href} onClick={close} data-testid={`admin-pending-notice-${q.key}`} className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-[13.5px] text-[#1B1B3C] hover:bg-[#FEF6E7]">
              <span>{zh ? q.zh : q.en}</span>
              <span className="rounded-full bg-[#FEF3E2] px-2 py-[1px] font-mono text-[12px] font-bold text-[#B45309]">{q.n}</span>
            </Link>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex items-center justify-end gap-2">
        <button type="button" onClick={close} className="rounded-full px-3 py-1.5 text-[12.5px] text-body-3 hover:bg-[#F3F4F6]">{zh ? '知道了' : 'Got it'}</button>
        <Link href="/admin" onClick={close} className="rounded-full bg-[#1B1B3C] px-3.5 py-1.5 text-[12.5px] font-bold text-white">{zh ? '去后台' : 'Open back office'}</Link>
      </div>
    </div>
  )
}
