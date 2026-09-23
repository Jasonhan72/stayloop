'use client'

// The tenant's own rental applications — real rows from `applications` under
// the applicant self-read policy (20260923_applications_applicant_select),
// matched by the login email. Shown above the demo fixtures on
// /tenant/applications and inside the honest empty state (e2e 2026-09-23:
// an account that had applied saw "还没有租房申请").
//
// P1 2026-09-23: each row is a tracker — 已提交 → 房东已查看 → 筛查已发起 →
// 决定 → 租约待签 → 在管租约 (lib/lifecycle/applicationTrack). The tenant
// sees that the landlord looked and that screening started, never the score.
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/useAuth'
import { useReportLiveRows } from '@/lib/liveRows'
import { applicationTrack, trackSummary, type TrackStep } from '@/lib/lifecycle/applicationTrack'

type Row = {
  id: string
  status: string | null
  created_at: string
  move_in_date: string | null
  viewed_at: string | null
  screened_at: string | null
  decision_notified_at: string | null
  listing_id: string | null
  listing: { slug: string; address: string; unit: string | null } | { slug: string; address: string; unit: string | null }[] | null
}
type LeaseRow = { id: string; status: string | null; unit_label: string | null; sent_at: string | null; signed_at: string | null; created_at: string }
type HhRow = { id: string; current_lease_id: string | null; address: string | null }

export function applicationStatusLabel(status: string | null, zh: boolean): { text: string; tone: 'ok' | 'bad' | 'wait' } {
  switch (status) {
    case 'approved': return { text: zh ? '已录取 · 请查收邮件' : 'Approved · check your email', tone: 'ok' }
    case 'declined': return { text: zh ? '未被选中' : 'Not selected', tone: 'bad' }
    case 'reviewing': return { text: zh ? '房东请你补充材料' : 'Landlord asked for more', tone: 'wait' }
    case 'scored': return { text: zh ? '房东审核中' : 'Under review', tone: 'wait' }
    default: return { text: zh ? '已提交 · 等房东回应' : 'Submitted · waiting for the landlord', tone: 'wait' }
  }
}

function Tracker({ steps, zh }: { steps: TrackStep[]; zh: boolean }) {
  return (
    <ol className="mt-2 flex flex-wrap items-center gap-x-1 gap-y-1.5 text-[11.5px]" data-testid="application-track">
      {steps.map((s, i) => {
        const tone = s.state === 'done' ? 'text-success' : s.state === 'current' ? 'text-brand font-bold' : s.state === 'bad' ? 'text-danger font-bold' : 'text-body-3'
        const dot = s.state === 'done' ? '●' : s.state === 'current' ? '◉' : s.state === 'bad' ? '✕' : '○'
        return (
          <li key={s.key} className={'flex items-center gap-1 ' + tone}>
            <span aria-hidden>{dot}</span>
            <span>{zh ? s.label.zh : s.label.en}{s.when ? <span className="ml-0.5 font-mono text-[10px] opacity-70">{s.when.slice(5)}</span> : null}</span>
            {i < steps.length - 1 && <span className="mx-0.5 text-line-strong" aria-hidden>›</span>}
          </li>
        )
      })}
    </ol>
  )
}

export default function MyApplications({ zh }: { zh: boolean }) {
  const auth = useAuth()
  const [rows, setRows] = useState<Row[] | null>(null)
  const [leases, setLeases] = useState<LeaseRow[]>([])
  const [households, setHouseholds] = useState<HhRow[]>([])
  const [joined, setJoined] = useState<Set<string>>(new Set())
  useReportLiveRows('applications', rows ? rows.length : null)
  useEffect(() => {
    if (auth.loading || !auth.user) { setRows([]); return }
    let cancelled = false
    const uid = auth.user.id
    const email = auth.user.email ?? ''
    ;(async () => {
      const [{ data: apps }, { data: ls }, { data: hh }, { data: mem }] = await Promise.all([
        supabase.from('applications').select('id, status, created_at, move_in_date, viewed_at, screened_at, decision_notified_at, listing_id, listing:listings(slug, address, unit)').order('created_at', { ascending: false }).limit(20),
        email ? supabase.from('lease_documents').select('id, status, unit_label, sent_at, signed_at, created_at').ilike('tenant_email', email).order('created_at', { ascending: false }).limit(20) : Promise.resolve({ data: [] as LeaseRow[] }),
        supabase.from('households').select('id, current_lease_id, address').limit(20),
        supabase.from('household_members').select('household_id').eq('user_id', uid).limit(20),
      ])
      if (cancelled) return
      setRows((apps ?? []) as Row[])
      setLeases((ls ?? []) as LeaseRow[])
      setHouseholds((hh ?? []) as HhRow[])
      setJoined(new Set(((mem ?? []) as { household_id: string }[]).map((m) => m.household_id)))
    })()
    return () => { cancelled = true }
  }, [auth.loading, auth.user])
  if (!rows || rows.length === 0) return null
  // A lease "belongs" to an application when it names the same unit / address
  // (the e-sign flow drafts the lease from the application). Approved
  // applications without a match fall back to the newest lease so the
  // tracker never shows a blank step after 已录取.
  const leaseFor = (r: Row, l: { address: string; unit: string | null } | null): LeaseRow | null => {
    if (r.status !== 'approved') return null
    const key = l ? `${l.address} ${l.unit ?? ''}`.toLowerCase() : ''
    return leases.find((x) => x.unit_label && key && (key.includes(x.unit_label.toLowerCase()) || x.unit_label.toLowerCase().includes(l!.address.toLowerCase()))) ?? leases[0] ?? null
  }
  return (
    <div className="mb-6 rounded-2xl border border-line-divider bg-white p-5">
      <div className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-body-3">{zh ? '我的申请 · 真实记录' : 'MY APPLICATIONS · LIVE'}</div>
      <div className="mt-3 divide-y divide-line-divider">
        {rows.map((r) => {
          const l = Array.isArray(r.listing) ? r.listing[0] : r.listing
          const lease = leaseFor(r, l)
          const hh = lease ? households.find((h) => h.current_lease_id === lease.id) ?? null : null
          const steps = applicationTrack({ ...r, lease, household: hh ? { id: hh.id, joined: joined.has(hh.id) } : null })
          const s = trackSummary(steps, zh)
          return (
            <div key={r.id} className="py-3 text-[13.5px]">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold">
                    {l ? <Link href={`/listings/${l.slug}`} className="underline underline-offset-2">{l.address}{l.unit ? ` #${l.unit}` : ''}</Link> : '—'}
                  </div>
                  <div className="mt-0.5 text-[12px] text-body-3">
                    {zh ? '提交 ' : 'Submitted '}{r.created_at.slice(0, 10)}
                    {r.move_in_date ? (zh ? ` · 期望入住 ${r.move_in_date}` : ` · move-in ${r.move_in_date}`) : ''}
                  </div>
                </div>
                <span className={'flex-none rounded-full px-2.5 py-[3px] text-[11px] font-bold ' + (s.tone === 'ok' ? 'bg-success/10 text-success' : s.tone === 'bad' ? 'bg-danger/10 text-danger' : 'bg-surface-chip text-body-3')}>{s.text}</span>
              </div>
              <Tracker steps={steps} zh={zh} />
              {(lease?.status === 'sent' || hh) && (
                <div className="mt-1.5 flex flex-wrap gap-3 text-[12px]">
                  {lease?.status === 'sent' && <Link href="/tenant/lease" className="font-semibold text-brand underline underline-offset-2">{zh ? '租约已发到你的邮箱 · 去签署' : 'Lease sent to your email · sign'}</Link>}
                  {hh && <Link href={`/h/${hh.id}`} className="font-semibold text-brand underline underline-offset-2">{joined.has(hh.id) ? (zh ? '打开在管租约' : 'Open the tenancy') : (zh ? '接受在管租约邀请' : 'Accept the tenancy invitation')}</Link>}
                </div>
              )}
            </div>
          )
        })}
      </div>
      <p className="mt-3 text-[11px] text-body-3">{zh ? '「房东已查看」「筛查已发起」来自房东的真实操作；筛查结果只有房东能看到，决定以邮件通知为准。' : '"Landlord opened it" and "screening started" reflect the landlord’s real actions; only the landlord sees the screening result, and the decision arrives by email.'}</p>
    </div>
  )
}
