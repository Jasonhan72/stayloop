'use client'

// The landlord's real maintenance board (services marketplace Phase 0):
// every managed tenancy where this account is the landlord member, with the
// shared MaintenancePanel under each. Rendered above the design sample
// through WorkspaceShell's liveSlot and inline in demo mode.
import { useEffect, useState } from 'react'
import Link from 'next/link'
import MaintenancePanel from '@/components/household/MaintenancePanel'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/useAuth'
import { useReportLiveRows } from '@/lib/liveRows'

type Hh = { id: string; address: string; unit: string | null; city: string | null }
type Counts = { open: number; assigned: number; review: number; done: number }

export default function LiveMaintenanceBoard({ zh }: { zh: boolean }) {
  const auth = useAuth()
  const [hhs, setHhs] = useState<Hh[] | null>(null)
  const [counts, setCounts] = useState<Counts>({ open: 0, assigned: 0, review: 0, done: 0 })
  const [sel, setSel] = useState<string | null>(null)
  useReportLiveRows('maintenance', hhs ? hhs.length : null)
  useEffect(() => {
    if (auth.loading || !auth.user) { setHhs([]); return }
    let cancelled = false
    ;(async () => {
      const { data: mem } = await supabase.from('household_members').select('household_id').eq('user_id', auth.user!.id).in('role', ['landlord', 'property_manager']).eq('status', 'active').limit(100)
      const ids = ((mem ?? []) as { household_id: string }[]).map((m) => m.household_id)
      const { data: h } = ids.length ? await supabase.from('households').select('id, address, unit, city').in('id', ids).order('created_at', { ascending: false }) : { data: [] }
      const { data: t } = ids.length ? await supabase.from('maintenance_tickets').select('status').in('household_id', ids) : { data: [] }
      if (cancelled) return
      const c: Counts = { open: 0, assigned: 0, review: 0, done: 0 }
      for (const x of (t ?? []) as { status: string }[]) { if (x.status === 'new') c.open++; else if (x.status === 'assigned' || x.status === 'in_progress') c.assigned++; else if (x.status === 'review') c.review++; else if (x.status === 'done') c.done++ }
      setCounts(c)
      const list = (h ?? []) as Hh[]
      setHhs(list)
      setSel((s) => s ?? list[0]?.id ?? null)
    })()
    return () => { cancelled = true }
  }, [auth.loading, auth.user])
  if (!hhs || hhs.length === 0) return null
  const cur = hhs.find((h) => h.id === sel) ?? hhs[0]
  return (
    <div className="mb-6" data-testid="live-maintenance-board">
      <div className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-body-3">{zh ? '维修工单 · 真实记录' : 'MAINTENANCE · LIVE'}</div>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {([['open', zh ? '待指派' : 'To dispatch'], ['assigned', zh ? '已派 / 处理中' : 'Dispatched / in progress'], ['review', zh ? '待验收' : 'To accept'], ['done', zh ? '已完成' : 'Done']] as const).map(([k, label]) => (
          <div key={k} className="rounded-xl border border-line-divider bg-white px-3 py-2"><div className="text-[20px] font-extrabold leading-none">{counts[k]}</div><div className="mt-1 text-[11px] text-body-3">{label}</div></div>
        ))}
      </div>
      {hhs.length > 1 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {hhs.map((h) => <button key={h.id} onClick={() => setSel(h.id)} className={'rounded-full border px-3 py-1 text-[12px] ' + (cur.id === h.id ? 'border-brand bg-brand/10 font-bold text-brand' : 'border-line-divider')}>{h.address}{h.unit ? ` #${h.unit}` : ''}</button>)}
        </div>
      )}
      <div className="mt-3 rounded-2xl border border-line-divider bg-surface-chip p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-[12.5px]">
          <span className="font-semibold">{cur.address}{cur.unit ? ` #${cur.unit}` : ''}{cur.city ? `, ${cur.city}` : ''}</span>
          <Link href={`/h/${cur.id}?tab=maintenance`} className="text-brand underline underline-offset-2">{zh ? '打开在管租约 →' : 'Open the tenancy →'}</Link>
        </div>
        <MaintenancePanel householdId={cur.id} city={cur.city} myRole="landlord" zh={zh} />
      </div>
      <p className="mt-2 text-[11px] text-body-3">{zh ? '派单入口在每张工单的「指派」：精选网络（资质已核）或你自己的联系人。' : 'Dispatch from "Dispatch" on a ticket: the curated network (verified) or your own contact.'} <Link href="/landlord/providers" className="underline">{zh ? '服务商目录' : 'Provider directory'}</Link></p>
    </div>
  )
}
