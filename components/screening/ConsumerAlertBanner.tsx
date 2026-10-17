'use client'

// Identity-alert banner on a screening (Consumer Reporting Act s.12.1–12.2;
// V0.8 first item, 2026-10-17). Asks GET /api/consumer/alert?screening=<id>
// with the viewer's JWT (the route answers only when RLS lets them read the
// screening) and shows a red block when the applicant has an active alert on
// their file. Renders nothing otherwise. Pure addition to the screening pages.

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { fmtDate } from '@/components/consumer/types'

type Alert = { statement: string; created_at: string }

export default function ConsumerAlertBanner({ screeningId, zh, className }: { screeningId: string; zh: boolean; className?: string }) {
  const [alert, setAlert] = useState<Alert | null>(null)

  useEffect(() => {
    if (!screeningId) return
    let alive = true
    ;(async () => {
      try {
        const { data } = await supabase.auth.getSession()
        const token = data.session?.access_token
        if (!token) return
        const res = await fetch(`/api/consumer/alert?screening=${encodeURIComponent(screeningId)}`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' })
        if (!alive || !res.ok) return
        const j = (await res.json()) as { alert?: Alert | null }
        if (!alive) return
        setAlert(j.alert && typeof j.alert.statement === 'string' ? j.alert : null)
      } catch { /* no banner */ }
    })()
    return () => { alive = false }
  }, [screeningId])

  if (!alert) return null
  return (
    <section
      data-testid="consumer-alert-banner"
      role="alert"
      className={`rounded-2xl border-2 p-4 sm:p-5 ${className || ''}`}
      style={{ borderColor: '#DC2626', background: '#FEF2F2' }}
    >
      <div className="font-mono text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: '#B91C1C' }}>
        {zh ? '申请人在档案上设置了身份警示' : 'The applicant has placed an identity alert on their file'}
      </div>
      <p className="mt-2 whitespace-pre-line text-[14px] font-semibold leading-relaxed" style={{ color: '#7F1D1D' }}>{alert.statement}</p>
      <p className="mt-2 text-[12px] leading-relaxed" style={{ color: '#991B1B' }}>
        {zh
          ? `设置于 ${fmtDate(alert.created_at, zh)} · 《消费者报告法》s.12.1：申请人担心有人冒用身份，请在作出决定前按警示里的方式与本人核实。`
          : `Set on ${fmtDate(alert.created_at, zh)} · Consumer Reporting Act s.12.1: the applicant is concerned about identity misuse; verify with them as the alert describes before deciding.`}
      </p>
    </section>
  )
}
