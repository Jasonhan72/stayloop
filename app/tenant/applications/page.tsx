'use client'

import Link from 'next/link'
import WorkspaceShell from '@/components/WorkspaceShell'

const APPS = [
  {
    addr: '88 Harbour St, Unit 4502',
    nbr: 'CityPlace',
    rent: 3450,
    status: 'in-review',
    statusLabel: '房东审核中',
    submitted: '2 天前',
    timeline: ['提交意向', '房东查看', '邀请你看房', '提交申请', '签约'],
    cur: 1,
  },
  {
    addr: '15 Hanna Ave, Loft 312',
    nbr: 'Liberty Village',
    rent: 2890,
    status: 'invited',
    statusLabel: '已邀请你看房',
    submitted: '3 天前',
    timeline: ['提交意向', '房东查看', '邀请你看房', '提交申请', '签约'],
    cur: 2,
  },
  {
    addr: '432 Brunswick Ave',
    nbr: 'The Annex',
    rent: 4250,
    status: 'declined',
    statusLabel: '房东婉拒 · 房源已租',
    submitted: '5 天前',
    timeline: ['提交意向', '房东查看', '邀请你看房', '提交申请', '签约'],
    cur: 1,
  },
]

export default function TenantApplications() {
  return (
    <WorkspaceShell role="tenant" hideAside>
      <div className="mb-9">
        <div className="font-mono text-[11px] font-bold uppercase tracking-eyebrowLg text-tenant">
          MY APPLICATIONS
        </div>
        <h1 className="mt-2 text-[36px] font-bold tracking-tight">我的申请 (3)</h1>
      </div>
      <div className="space-y-4">
        {APPS.map((a) => (
          <div key={a.addr} className="sl-card p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <div>
                <h3 className="text-[18px] font-bold tracking-tight">{a.addr}</h3>
                <div className="text-[12.5px] text-body-3">{a.nbr} · ${a.rent.toLocaleString()}/mo · {a.submitted}提交</div>
              </div>
              <span
                className={
                  'rounded-md px-2 py-[4px] font-mono text-[10.5px] font-bold uppercase tracking-wider ' +
                  (a.status === 'invited'
                    ? 'bg-brand/15 text-brand'
                    : a.status === 'in-review'
                      ? 'bg-info/10 text-info'
                      : 'bg-danger/10 text-danger')
                }
              >
                {a.statusLabel}
              </span>
            </div>

            <div className="mt-6 grid grid-cols-5 gap-2">
              {a.timeline.map((t, i) => (
                <div key={t} className="flex flex-col items-center text-center">
                  <span
                    className={
                      'flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold ' +
                      (i <= a.cur
                        ? 'bg-brand text-white'
                        : 'bg-line-divider text-body-4')
                    }
                  >
                    {i + 1}
                  </span>
                  <span
                    className={
                      'mt-1 font-mono text-[10px] uppercase tracking-eyebrow ' +
                      (i <= a.cur ? 'text-brand' : 'text-body-3')
                    }
                  >
                    {t}
                  </span>
                </div>
              ))}
            </div>

            {a.status === 'invited' && (
              <div className="mt-5 flex gap-2">
                <button className="sl-btn-primary !py-[10px] !px-4 !text-[13.5px]">
                  确认看房时间
                </button>
                <button className="rounded-lg border border-line-strong bg-white px-4 py-[9px] text-[13.5px] font-semibold text-body transition hover:border-brand">
                  和房东对话
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </WorkspaceShell>
  )
}
