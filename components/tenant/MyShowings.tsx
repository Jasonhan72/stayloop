'use client'

// The tenant's own showing requests and landlord questions (lifecycle plan
// §2.2, 2026-09-23): real rows from showing_intents under the tenant's RLS,
// shown above the demo application fixtures on /tenant/applications.
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/useAuth'
import { useReportLiveRows } from '@/lib/liveRows'

type Row = { id: string; kind: string; status: string; move_in_date: string | null; message: string | null; created_at: string; listing: { slug: string; address: string; unit: string | null } | { slug: string; address: string; unit: string | null }[] | null }

export default function MyShowings({ zh }: { zh: boolean }) {
  const auth = useAuth()
  const [rows, setRows] = useState<Row[] | null>(null)
  useReportLiveRows('showings', rows ? rows.length : null)
  useEffect(() => {
    if (auth.loading || !auth.user) { setRows([]); return }
    let cancelled = false
    supabase
      .from('showing_intents')
      .select('id, kind, status, move_in_date, message, created_at, listing:listings(slug, address, unit)')
      .order('created_at', { ascending: false })
      .limit(20)
      .then(({ data }) => { if (!cancelled) setRows((data ?? []) as Row[]) })
    return () => { cancelled = true }
  }, [auth.loading, auth.user])
  if (!rows || rows.length === 0) return null
  const st = (s: string) => s === 'accepted' ? (zh ? '房东已同意 · 请查收邮件' : 'Accepted · check your email') : s === 'declined' ? (zh ? '房东未回应' : 'Not taken up') : (zh ? '等房东回应' : 'Waiting for the landlord')
  return (
    <div className="mb-6 rounded-2xl border border-line-divider bg-white p-5">
      <div className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-body-3">{zh ? '我的看房与提问 · 真实记录' : 'MY VIEWINGS & QUESTIONS · LIVE'}</div>
      <div className="mt-3 divide-y divide-line-divider">
        {rows.map((r) => {
          const l = Array.isArray(r.listing) ? r.listing[0] : r.listing
          return (
            <div key={r.id} className="flex items-start justify-between gap-3 py-2.5 text-[13.5px]">
              <div className="min-w-0">
                <div className="font-semibold">
                  {r.kind === 'question' ? (zh ? '提问 · ' : 'Question · ') : (zh ? '看房 · ' : 'Viewing · ')}
                  {l ? <Link href={`/listings/${l.slug}`} className="underline underline-offset-2">{l.address}{l.unit ? ` #${l.unit}` : ''}</Link> : '—'}
                </div>
                <div className="mt-0.5 text-[12px] text-body-3">
                  {r.move_in_date ? (zh ? `期望入住 ${r.move_in_date} · ` : `Move-in ${r.move_in_date} · `) : ''}{r.message ? r.message.slice(0, 80) : ''}
                </div>
              </div>
              <span className={'flex-none rounded-full px-2.5 py-[3px] text-[11px] font-bold ' + (r.status === 'accepted' ? 'bg-success/10 text-success' : 'bg-surface-chip text-body-3')}>{st(r.status)}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
