'use client'

import Link from 'next/link'
import WorkspaceShell from '@/components/WorkspaceShell'

interface Applicant {
  id: string
  name: string
  initial: string
  avc: 'tenant' | 'agent' | 'landlord' | 'orange'
  match: number
  tier: 1 | 2 | 3 | 4
  income: number
  credit: number
  qual: string
  decision: 'approve' | 'review' | 'decline'
}

const APPS: Applicant[] = [
  { id: '1', name: 'Mia Wang',     initial: 'M', avc: 'tenant',   match: 92, tier: 3, income: 11200, credit: 758, qual: '收入 ✓ 信用 ✓ 法庭 ✓', decision: 'approve' },
  { id: '2', name: 'David Park',   initial: 'D', avc: 'agent',    match: 87, tier: 3, income: 9800,  credit: 742, qual: '收入 ✓ 信用 ✓ 上家 5⭐',  decision: 'approve' },
  { id: '3', name: 'Karen Liu',    initial: 'K', avc: 'landlord', match: 84, tier: 3, income: 12300, credit: 728, qual: '收入 ✓ 信用 ✓ 自雇',     decision: 'approve' },
  { id: '4', name: 'Lina Chen',    initial: 'L', avc: 'orange',   match: 81, tier: 2, income: 8900,  credit: 695, qual: '材料齐 · 短租意向 · 可议',    decision: 'review' },
  { id: '5', name: 'Tom Zhao',     initial: 'T', avc: 'tenant',   match: 64, tier: 2, income: 7200,  credit: 651, qual: '近 1 年 LTB 1 起 (已结案)', decision: 'review' },
  { id: '6', name: 'Anna Brooks',  initial: 'A', avc: 'agent',    match: 41, tier: 1, income: 5400,  credit: 0,   qual: '未升级 Tier 2 · 仅基本 ID',  decision: 'decline' },
]

const SECTIONS = [
  { decision: 'approve', label: '推荐审批', tone: 'bg-success/10 text-success border-success/30' },
  { decision: 'review',  label: '需面谈',   tone: 'bg-warning/10 text-warning border-warning/30' },
  { decision: 'decline', label: '不达标',   tone: 'bg-danger/10 text-danger border-danger/30' },
] as const

export default function LandlordApplicantsPage() {
  return (
    <WorkspaceShell role="landlord" hideAside>
      <div className="mb-9 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="font-mono text-[11px] font-bold uppercase tracking-eyebrowLg text-brand">
            APPLICANTS · 88 HARBOUR ST
          </div>
          <h1 className="mt-2 text-[36px] font-bold tracking-tight">7 份申请 · Logic 已分组</h1>
          <p className="mt-2 text-[14px] text-body-2">
            按你的 Tier 3 / 信用 ≥ 720 / DTI ≤ 35% 政策，已分入 3 组。点开任一申请查看完整六维评分 + 文件。
          </p>
        </div>
        <button className="sl-btn-secondary">导出 CSV</button>
      </div>

      {SECTIONS.map((s) => {
        const list = APPS.filter((a) => a.decision === s.decision)
        return (
          <div key={s.decision} className="mb-8">
            <div className={`mb-3 inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-[13px] font-bold ${s.tone}`}>
              {s.label}
              <span className="font-mono text-[11px]">{list.length}</span>
            </div>
            <div className="space-y-2">
              {list.map((a) => (
                <Link
                  key={a.id}
                  href={`/landlord/applicants/${a.id}`}
                  className="grid grid-cols-[44px_1fr_120px_140px_60px] items-center gap-4 rounded-xl border border-line-divider bg-white p-4 transition hover:border-brand/40 hover:shadow-md"
                >
                  <span
                    className="flex h-11 w-11 items-center justify-center rounded-full text-[15px] font-bold text-white"
                    style={{
                      background:
                        a.avc === 'tenant'
                          ? 'linear-gradient(135deg,#C4B5FD,#7C3AED)'
                          : a.avc === 'agent'
                            ? 'linear-gradient(135deg,#93C5FD,#2563EB)'
                            : a.avc === 'orange'
                              ? 'linear-gradient(135deg,#FDBA74,#EA580C)'
                              : 'linear-gradient(135deg,#6EE7B7,#047857)',
                    }}
                  >
                    {a.initial}
                  </span>
                  <div>
                    <div className="text-[15px] font-bold">{a.name}</div>
                    <div className="font-mono text-[11px] text-body-3">
                      ${a.income.toLocaleString()}/mo · 信用 {a.credit || '—'}
                    </div>
                    <div className="mt-1 font-mono text-[11.5px] text-body-2">{a.qual}</div>
                  </div>
                  <span className={`tier-badge t${a.tier}`}>TIER {a.tier}</span>
                  <div>
                    <div className="font-mono text-[24px] font-bold leading-none">{a.match}</div>
                    <div className="font-mono text-[10px] uppercase text-body-3">MATCH</div>
                  </div>
                  <span className="text-right text-body-3">›</span>
                </Link>
              ))}
            </div>
          </div>
        )
      })}
    </WorkspaceShell>
  )
}
