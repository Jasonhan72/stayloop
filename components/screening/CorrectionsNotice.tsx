'use client'

// Correction note on a screening (Consumer Reporting Act s.13; V0.8 first item,
// 2026-10-17). Reads screening_corrections through the caller's RLS client
// (readable whenever the caller can read the screening) and, when there are
// rows, shows an amber block above the verdict card: date · item · action · note.
// Renders nothing when there are none. Pure addition to the screening pages.

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { type ScreeningCorrectionRow, correctionActionText, fmtDate, itemKindText } from '@/components/consumer/types'

export default function CorrectionsNotice({ screeningId, zh, className }: { screeningId: string; zh: boolean; className?: string }) {
  const [rows, setRows] = useState<ScreeningCorrectionRow[]>([])

  useEffect(() => {
    if (!screeningId) return
    let alive = true
    ;(async () => {
      const { data, error } = await supabase
        .from('screening_corrections')
        .select('id,item_kind,item_ref,item_label,action,note,created_at')
        .eq('screening_id', screeningId)
        .order('created_at', { ascending: true })
      if (!alive || error || !Array.isArray(data)) return
      setRows(data as ScreeningCorrectionRow[])
    })()
    return () => { alive = false }
  }, [screeningId])

  if (rows.length === 0) return null
  return (
    <section
      data-testid="corrections-notice"
      className={`rounded-2xl border p-4 sm:p-5 ${className || ''}`}
      style={{ borderColor: '#F5C27A', background: '#FEF3E2' }}
      aria-label={zh ? '更正记录' : 'Correction record'}
    >
      <div className="font-mono text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: '#92400E' }}>
        {zh ? `本档案有 ${rows.length} 条更正记录` : `This file has ${rows.length} correction record(s)`}
      </div>
      <p className="mt-1 text-[12.5px] leading-relaxed" style={{ color: '#92400E' }}>
        {zh ? '申请人提出争议后由 Stayloop 核实的结果；原报告保留，更正只追加。读报告时以更正为准。' : 'Outcomes Stayloop verified after the applicant disputed an item; the original report stays, corrections are appended. Read the report with these in mind.'}
      </p>
      <ul className="mt-3 divide-y" style={{ borderColor: '#F5C27A' }}>
        {rows.map((r) => (
          <li key={r.id} className="py-2 text-[13px] leading-relaxed" style={{ borderColor: '#F5C27A' }}>
            <span className="font-mono text-[11px]" style={{ color: '#92400E' }}>{fmtDate(r.created_at, zh)}</span>
            <span className="mx-2 text-body-3">·</span>
            <span className="font-semibold">{r.item_label || r.item_ref || itemKindText(r.item_kind || 'other', zh)}</span>
            <span className="mx-2 text-body-3">·</span>
            <span className="rounded-full bg-white px-2 py-[1px] font-mono text-[10.5px] font-bold" style={{ color: '#92400E' }}>{correctionActionText(r.action, zh)}</span>
            {r.note && <span className="ml-2 text-body-2">{r.note}</span>}
          </li>
        ))}
      </ul>
    </section>
  )
}
