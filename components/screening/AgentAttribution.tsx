'use client'

// "Prepared by <agent>" at the top of a screening report (V0.9, 2026-11-22) — the one addition the
// report page takes for this; the rule is in lib/agent/attribution.ts. Renders nothing for a
// landlord's own screening, and prints with the report (no print:hidden).
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { attributionLead, attributionLine, isAgentAttribution, type AgentAttribution as Attribution } from '@/lib/agent/attribution'

export default function AgentAttribution({ screeningId, zh }: { screeningId: string; zh: boolean }) {
  const [a, setA] = useState<Attribution | null>(null)

  useEffect(() => {
    if (!screeningId) return
    let on = true
    ;(async () => {
      try {
        const { data } = await supabase.auth.getSession()
        const jwt = data.session?.access_token
        if (!jwt) return
        const res = await fetch(`/api/agents/attribution?screening=${encodeURIComponent(screeningId)}`, { headers: { Authorization: `Bearer ${jwt}` }, cache: 'no-store' })
        if (!res.ok) return
        const j = (await res.json().catch(() => null)) as { attribution?: unknown } | null
        if (on && j && isAgentAttribution(j.attribution)) setA(j.attribution)
      } catch { /* the report reads the same without the line */ }
    })()
    return () => { on = false }
  }, [screeningId])

  if (!a) return null
  return (
    <div data-testid="screening-agent-attribution" data-via={a.via} className="mt-4 rounded-xl border border-agent/30 bg-agent/[0.05] px-4 py-3 text-[13px] leading-relaxed">
      <div className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrow text-agent">{attributionLead(a, zh)}</div>
      <div className="mt-0.5 font-semibold text-body">{attributionLine(a, zh)}</div>
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-body-3 print:hidden">
        {a.slug && <Link href={`/agents/${a.slug}`} className="underline underline-offset-2 hover:text-brand">{zh ? '经纪主页 →' : 'Agent page →'}</Link>}
        <a href="https://registrantsearch.reco.on.ca/" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-brand">{zh ? '在 RECO 公开注册库核对 ↗' : 'Check on the RECO public register ↗'}</a>
      </div>
    </div>
  )
}
