'use client'

// The tenant's own showing requests and landlord questions (lifecycle plan
// §2.2, 2026-09-23): real rows from showing_intents under the tenant's RLS,
// shown above the demo application fixtures on /tenant/applications.
//
// 找得到人 2026-09-30: every request / question lives in one conversation per
// listing (listing_inquiry). The tenant's own inquiry threads are read once,
// next to the rows (one query for the whole list, not one RPC per row), so a
// row opens its conversation directly; a row from before conversations existed
// has none and points back to the listing to ask again.
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/useAuth'
import { useReportLiveRows } from '@/lib/liveRows'

type Row = { id: string; kind: string; status: string; move_in_date: string | null; message: string | null; created_at: string; listing_id: string | null; listing_slug: string | null; listing_address: string | null; listing_unit: string | null; listing_active: boolean | null }

export default function MyShowings({ zh }: { zh: boolean }) {
  const auth = useAuth()
  const [rows, setRows] = useState<Row[] | null>(null)
  // listing id → the tenant's own inquiry thread on it.
  const [threads, setThreads] = useState<Record<string, string>>({})
  useReportLiveRows('showings', rows ? rows.length : null)
  useEffect(() => {
    if (auth.loading || !auth.user) { setRows([]); setThreads({}); return }
    const uid = auth.user.id
    let cancelled = false
    Promise.all([
      supabase
        // my_showing_intents = the tenant's own rows + a listing snapshot (an inactive listing is hidden by the public RLS — it rendered as "—").
        .from('my_showing_intents')
        .select('id, kind, status, move_in_date, message, created_at, listing_id, listing_slug, listing_address, listing_unit, listing_active')
        .order('created_at', { ascending: false })
        .limit(20),
      supabase.from('threads').select('id, listing_id').eq('kind', 'listing_inquiry').eq('subject_user', uid).limit(50),
    ]).then(([intents, th]) => {
      if (cancelled) return
      const map: Record<string, string> = {}
      for (const t of (th.data ?? []) as { id: string; listing_id: string | null }[]) if (t.listing_id) map[t.listing_id] = t.id
      setThreads(map)
      setRows((intents.data ?? []) as Row[])
    })
    return () => { cancelled = true }
  }, [auth.loading, auth.user])
  if (!rows || rows.length === 0) return null
  // The landlord answers in the listing conversation (the approval email is a copy with a link back to it).
  // Only claim "continue in Messages" when that conversation exists (requests approved before 2026-09-30 got an email).
  const st = (s: string, hasThread: boolean) => s === 'accepted' ? (hasThread ? (zh ? '房东已同意 · 在消息里继续' : 'Accepted · in Messages') : (zh ? '房东已同意 · 请查收邮件' : 'Accepted · check your email')) : s === 'declined' ? (zh ? '房东婉拒' : 'Declined') : s === 'expired' ? (zh ? '已过期' : 'Expired') : (zh ? '等房东回应' : 'Waiting for the landlord')
  return (
    <div className="mb-6 rounded-2xl border border-line-divider bg-white p-5">
      <div className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-body-3">{zh ? '我的看房与提问 · 真实记录' : 'MY VIEWINGS & QUESTIONS · LIVE'}</div>
      <div className="mt-3 divide-y divide-line-divider">
        {rows.map((r) => {
          const l = r.listing_address ? { slug: r.listing_slug ?? '', address: r.listing_address, unit: r.listing_unit, active: r.listing_active !== false } : null
          return (
            <div key={r.id} className="flex items-start justify-between gap-3 py-2.5 text-[13.5px]">
              <div className="min-w-0">
                <div className="font-semibold">
                  {r.kind === 'question' ? (zh ? '提问 · ' : 'Question · ') : (zh ? '看房 · ' : 'Viewing · ')}
                  {l ? (l.active && l.slug ? <Link href={`/listings/${l.slug}`} className="underline underline-offset-2">{l.address}{l.unit ? ` #${l.unit}` : ''}</Link> : <span>{l.address}{l.unit ? ` #${l.unit}` : ''}<span className="ml-1.5 rounded-full bg-surface-chip px-1.5 py-[1px] text-[10.5px] font-semibold text-body-3">{zh ? '已下架' : 'Off market'}</span></span>) : '—'}
                </div>
                <div className="mt-0.5 break-words text-[12px] text-body-3">
                  {r.move_in_date ? (zh ? `期望入住 ${r.move_in_date} · ` : `Move-in ${r.move_in_date} · `) : ''}{r.message ? r.message.slice(0, 80) : ''}
                </div>
              </div>
              <span className="flex max-w-[46%] shrink-0 flex-col items-end gap-1.5 text-right">
                <span className={'rounded-full px-2.5 py-[3px] text-[11px] font-bold ' + (r.status === 'accepted' ? 'bg-success/10 text-success' : 'bg-surface-chip text-body-3')}>{st(r.status, !!(r.listing_id && threads[r.listing_id]))}</span>
                {r.listing_id && threads[r.listing_id] ? (
                  <Link href={`/messages?t=${threads[r.listing_id]}&compose=1`} data-testid="showing-open-thread" className="text-[12px] font-semibold text-brand underline-offset-2 hover:underline">{zh ? '打开对话 →' : 'Open conversation →'}</Link>
                ) : l && l.active && l.slug ? (
                  <Link href={`/listings/${l.slug}`} className="text-[12px] font-semibold text-brand underline-offset-2 hover:underline">{zh ? '去房源页继续提问 →' : 'Ask again on the listing →'}</Link>
                ) : null}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
