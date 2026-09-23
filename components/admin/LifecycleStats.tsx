'use client'

// The five lifecycle ROI metrics (lifecycle plan 2026-09-22 §2.6), from
// admin_lifecycle_stats(p_days). Every number is counted from real rows —
// zero when the funnel is empty, never a sample.
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Med = { n: number; median: number | null }
type Stats = {
  days: number
  vacancy_days: Med
  application_turnaround_days: Med
  screening_minutes: Med
  screenings_scored: number
  compliance_blocks: number
  compliance_by_rule: Record<string, number>
  renewal_touchpoints: { leases_in_window: number; first_card_90d: number; approved_within_30d: number }
  actions: { proposed: number; approved: number; rejected: number; executed: number }
  push_subscriptions: number
}

export default function LifecycleStats({ days, zh }: { days: number; zh: boolean }) {
  const [s, setS] = useState<Stats | null>(null)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    supabase.rpc('admin_lifecycle_stats', { p_days: days }).then(({ data, error }) => {
      if (cancelled) return
      if (error) setErr(error.message); else setS(data as Stats)
    })
    return () => { cancelled = true }
  }, [days])
  const med = (m: Med | undefined, unit: string) => !m || !m.n ? '—' : `${Number(m.median).toFixed(1)}${unit}`
  const sub = (m: Med | undefined) => !m || !m.n ? (zh ? '还没有样本' : 'no samples yet') : (zh ? `${m.n} 个样本 · 中位数` : `${m.n} samples · median`)
  return (
    <div className="mt-8">
      <h2 className="text-[16px] font-extrabold tracking-tight">{zh ? '全流程指标' : 'Lifecycle metrics'}</h2>
      <p className="mt-1 text-[12.5px] text-body-3">{zh ? '五个可证实的 ROI 指标，全部从现有表计数；没有样本就显示「—」。' : 'Five verifiable ROI metrics, counted from real rows; "—" when there are no samples.'}</p>
      {err && <div className="mt-3 text-[12.5px] text-danger">{err}</div>}
      {s && (
        <>
          <div className="mt-3 grid gap-3 sm:grid-cols-5">
            <K label={zh ? '空置天数' : 'Vacancy days'} value={med(s.vacancy_days, zh ? ' 天' : 'd')} sub={sub(s.vacancy_days)} />
            <K label={zh ? '申请周转' : 'Application turnaround'} value={med(s.application_turnaround_days, zh ? ' 天' : 'd')} sub={sub(s.application_turnaround_days)} />
            <K label={zh ? '筛查用时' : 'Screening time'} value={med(s.screening_minutes, zh ? ' 分' : 'm')} sub={zh ? `${s.screenings_scored} 份已评分 · 人工基准 2–3 小时` : `${s.screenings_scored} scored · manual baseline 2–3 h`} />
            <K label={zh ? '合规拦截' : 'Compliance blocks'} value={String(s.compliance_blocks)} sub={Object.entries(s.compliance_by_rule || {}).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k, v]) => `${k} ${v}`).join(' · ') || (zh ? '无' : 'none')} />
            <K label={zh ? '续约提前触达' : 'Renewal reach'} value={`${s.renewal_touchpoints.first_card_90d}/${s.renewal_touchpoints.leases_in_window}`} sub={zh ? `窗口内租约 ${s.renewal_touchpoints.leases_in_window} · 30 天内批准 ${s.renewal_touchpoints.approved_within_30d}` : `${s.renewal_touchpoints.leases_in_window} in window · ${s.renewal_touchpoints.approved_within_30d} approved ≤30d`} />
          </div>
          <div className="mt-2 text-[12px] text-body-3">
            {zh
              ? `助手提议 ${s.actions.proposed} · 批准 ${s.actions.approved} · 拒绝 ${s.actions.rejected} · 已执行 ${s.actions.executed} · 推送设备 ${s.push_subscriptions}`
              : `Proposed ${s.actions.proposed} · approved ${s.actions.approved} · rejected ${s.actions.rejected} · executed ${s.actions.executed} · push devices ${s.push_subscriptions}`}
          </div>
        </>
      )}
    </div>
  )
}

function K({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-line-divider bg-white p-4">
      <div className="font-mono text-[10px] font-bold uppercase tracking-eyebrow text-body-3">{label}</div>
      <div className="mt-1 text-[22px] font-extrabold tabular-nums">{value}</div>
      {sub && <div className="mt-0.5 truncate text-[11.5px] text-body-3">{sub}</div>}
    </div>
  )
}
