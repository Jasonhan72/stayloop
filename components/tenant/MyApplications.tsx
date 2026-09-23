'use client'

// The tenant's own rental applications — real rows from `applications` under
// the applicant self-read policy (20260923_applications_applicant_select),
// matched by the login email. Shown above the demo fixtures on
// /tenant/applications and inside the honest empty state (e2e 2026-09-23:
// an account that had applied saw "还没有租房申请").
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/useAuth'
import { useReportLiveRows } from '@/lib/liveRows'

type Row = {
  id: string
  status: string | null
  created_at: string
  move_in_date: string | null
  decision_notified_at: string | null
  listing: { slug: string; address: string; unit: string | null } | { slug: string; address: string; unit: string | null }[] | null
}

export function applicationStatusLabel(status: string | null, zh: boolean): { text: string; tone: 'ok' | 'bad' | 'wait' } {
  switch (status) {
    case 'approved': return { text: zh ? '已录取 · 请查收邮件' : 'Approved · check your email', tone: 'ok' }
    case 'declined': return { text: zh ? '未被选中' : 'Not selected', tone: 'bad' }
    case 'reviewing': return { text: zh ? '房东请你补充材料' : 'Landlord asked for more', tone: 'wait' }
    case 'scored': return { text: zh ? '房东审核中' : 'Under review', tone: 'wait' }
    default: return { text: zh ? '已提交 · 等房东回应' : 'Submitted · waiting for the landlord', tone: 'wait' }
  }
}

export default function MyApplications({ zh }: { zh: boolean }) {
  const auth = useAuth()
  const [rows, setRows] = useState<Row[] | null>(null)
  useReportLiveRows('applications', rows ? rows.length : null)
  useEffect(() => {
    if (auth.loading || !auth.user) { setRows([]); return }
    let cancelled = false
    supabase
      .from('applications')
      .select('id, status, created_at, move_in_date, decision_notified_at, listing:listings(slug, address, unit)')
      .order('created_at', { ascending: false })
      .limit(20)
      .then(({ data }) => { if (!cancelled) setRows((data ?? []) as Row[]) })
    return () => { cancelled = true }
  }, [auth.loading, auth.user])
  if (!rows || rows.length === 0) return null
  return (
    <div className="mb-6 rounded-2xl border border-line-divider bg-white p-5">
      <div className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-body-3">{zh ? '我的申请 · 真实记录' : 'MY APPLICATIONS · LIVE'}</div>
      <div className="mt-3 divide-y divide-line-divider">
        {rows.map((r) => {
          const l = Array.isArray(r.listing) ? r.listing[0] : r.listing
          const s = applicationStatusLabel(r.status, zh)
          return (
            <div key={r.id} className="flex items-start justify-between gap-3 py-2.5 text-[13.5px]">
              <div className="min-w-0">
                <div className="font-semibold">
                  {l ? <Link href={`/listings/${l.slug}`} className="underline underline-offset-2">{l.address}{l.unit ? ` #${l.unit}` : ''}</Link> : '—'}
                </div>
                <div className="mt-0.5 text-[12px] text-body-3">
                  {zh ? '提交 ' : 'Submitted '}{r.created_at.slice(0, 10)}
                  {r.move_in_date ? (zh ? ` · 期望入住 ${r.move_in_date}` : ` · move-in ${r.move_in_date}`) : ''}
                  {r.decision_notified_at ? (zh ? ` · 房东回复 ${r.decision_notified_at.slice(0, 10)}` : ` · decision ${r.decision_notified_at.slice(0, 10)}`) : ''}
                </div>
              </div>
              <span className={'flex-none rounded-full px-2.5 py-[3px] text-[11px] font-bold ' + (s.tone === 'ok' ? 'bg-success/10 text-success' : s.tone === 'bad' ? 'bg-danger/10 text-danger' : 'bg-surface-chip text-body-3')}>{s.text}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
