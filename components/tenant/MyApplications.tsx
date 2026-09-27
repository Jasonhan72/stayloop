'use client'

// The tenant's own rental applications — real rows from the applicant view
// (20260923_applications_applicant_select), matched by the login email. Shown
// above the demo fixtures on /tenant/applications and inside the honest empty
// state. Since 节点 1 (2026-09-26) the rows, the leases and the households
// come from lib/facts/useFacts — one payload shared with the progress tiles
// and the lifecycle rail.
//
// P1 2026-09-23: each row is a tracker — 已提交 → 房东已查看 → 筛查已发起 →
// 决定 → 租约待签 → 在管租约 (lib/lifecycle/applicationTrack). The tenant
// sees that the landlord looked and that screening started, never the score.
import Link from 'next/link'
import { useReportLiveRows } from '@/lib/liveRows'
import { useFacts, type LeaseRow, type TenantApplicationRow } from '@/lib/facts/useFacts'
import { applicationTrack, trackSummary, type TrackStep } from '@/lib/lifecycle/applicationTrack'

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
  const { facts } = useFacts('tenant')
  const rows: TenantApplicationRow[] | null = facts ? facts.applications : null
  const leases: LeaseRow[] = facts ? facts.leases : []
  const households = facts ? facts.households : []
  const joined = new Set(facts ? facts.members : [])
  useReportLiveRows('applications', rows ? rows.length : null)
  if (!rows || rows.length === 0) return null
  // A lease "belongs" to an application when it names it (lease_documents.application_id);
  // the address heuristic is only for leases that predate the column, and never for a lease
  // that names another application (review 2026-09-25).
  const leaseFor = (r: TenantApplicationRow, l: { address: string; unit: string | null } | null): LeaseRow | null => {
    if (r.status !== 'approved') return null
    const exact = leases.find((x) => x.application_id === r.id)
    if (exact) return exact
    const key = l ? `${l.address} ${l.unit ?? ''}`.toLowerCase() : ''
    return leases.find((x) => !x.application_id && x.unit_label && key && (key.includes(x.unit_label.toLowerCase()) || x.unit_label.toLowerCase().includes(l!.address.toLowerCase()))) ?? null
  }
  return (
    <div className="mb-6 rounded-2xl border border-line-divider bg-white p-5">
      <div className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-body-3">{zh ? '我的申请 · 真实记录' : 'MY APPLICATIONS · LIVE'}</div>
      <div className="mt-3 divide-y divide-line-divider">
        {rows.map((r) => {
          const l = r.listing_address ? { slug: r.listing_slug ?? '', address: r.listing_address, unit: r.listing_unit, active: r.listing_active !== false } : null
          const lease = leaseFor(r, l)
          const hh = lease ? households.find((h) => h.current_lease_id === lease.id) ?? null : null
          const steps = applicationTrack({ ...r, lease: lease ? { status: lease.status, sent_at: lease.sent_at ?? null, signed_at: lease.signed_at ?? null } : null, household: hh ? { id: hh.id, joined: joined.has(hh.id) } : null })
          const s = trackSummary(steps, zh)
          return (
            <div key={r.id} className="py-3 text-[13.5px]">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold">
                    {l ? (l.active && l.slug ? <Link href={`/listings/${l.slug}`} className="underline underline-offset-2">{l.address}{l.unit ? ` #${l.unit}` : ''}</Link> : <span>{l.address}{l.unit ? ` #${l.unit}` : ''}<span className="ml-1.5 rounded-full bg-surface-chip px-1.5 py-[1px] text-[10.5px] font-semibold text-body-3">{zh ? '已下架' : 'Off market'}</span></span>) : '—'}
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
