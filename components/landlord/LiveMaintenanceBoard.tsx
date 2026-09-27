'use client'

// The landlord's real maintenance board (services marketplace Phase 0):
// every managed tenancy where this account is the landlord, with the shared
// MaintenancePanel under each. Since 节点 1 (2026-09-26) the tenancy list and
// the four counts come from lib/facts/useFacts — the same rows the progress
// tiles and the lifecycle rail count — so the board can no longer say "2"
// where the tiles say "0" (the tiles used to count by listing_id, the board
// by household membership). Rendered above the design sample through
// WorkspaceShell's liveSlot and inline in demo mode.
import { useEffect, useState } from 'react'
import Link from 'next/link'
import MaintenancePanel from '@/components/household/MaintenancePanel'
import { MODE_LABEL, normalizePolicy, type DispatchPolicy } from '@/lib/marketplace/dispatchPolicy'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/useAuth'
import { useReportLiveRows } from '@/lib/liveRows'
import { useFacts } from '@/lib/facts/useFacts'
import { TICKET_STATE_LABEL } from '@/lib/matters/states'

type Counts = { open: number; assigned: number; review: number; done: number }

export default function LiveMaintenanceBoard({ zh }: { zh: boolean }) {
  const auth = useAuth()
  const { facts } = useFacts('landlord')
  const [sel, setSel] = useState<string | null>(null)
  // The dispatch policy is set on /landlord/providers; the board shows which
  // mode is live so a landlord knows what happens to the next ticket without
  // leaving the page (entry proposal 2026-09-26). null = not loaded yet.
  const [policy, setPolicy] = useState<DispatchPolicy | null>(null)
  const hhs = facts ? facts.households.filter((h) => h.status !== 'ended') : null
  useReportLiveRows('maintenance', hhs ? hhs.length : null)
  useEffect(() => {
    if (auth.loading || !auth.user) return
    let cancelled = false
    supabase.from('dispatch_policies').select('mode, emergency_auto_approve, emergency_cap, preferred').eq('landlord_auth_id', auth.user.id).maybeSingle()
      .then(({ data }) => { if (!cancelled) setPolicy(normalizePolicy(data as Parameters<typeof normalizePolicy>[0])) })
    return () => { cancelled = true }
  }, [auth.loading, auth.user])
  if (!facts || !hhs || hhs.length === 0) return null
  const counts: Counts = { open: 0, assigned: 0, review: 0, done: 0 }
  for (const t of facts.tickets) { if (t.status === 'new') counts.open++; else if (t.status === 'assigned' || t.status === 'in_progress') counts.assigned++; else if (t.status === 'review') counts.review++; else if (t.status === 'done') counts.done++ }
  const cur = hhs.find((h) => h.id === sel) ?? hhs[0]
  const L = (k: keyof typeof TICKET_STATE_LABEL) => (zh ? TICKET_STATE_LABEL[k].zh : TICKET_STATE_LABEL[k].en)
  return (
    <div className="mb-6" data-testid="live-maintenance-board">
      <div className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-body-3">{zh ? '维修工单 · 真实记录' : 'MAINTENANCE · LIVE'}</div>
      {policy && (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-line-divider bg-white px-3 py-2 text-[12.5px]" data-testid="dispatch-policy-strip">
          <span className="font-semibold">{zh ? '派单策略：' : 'Dispatch policy: '}{zh ? MODE_LABEL[policy.mode].zh : MODE_LABEL[policy.mode].en}</span>
          <span className="text-body-3">
            {policy.emergency_auto_approve
              ? (zh ? `紧急报价 ≤ $${policy.emergency_cap} 自动批准` : `emergency quotes ≤ $${policy.emergency_cap} auto-approved`)
              : (zh ? '每张报价都等你批准' : 'every quote waits for you')}
          </span>
          <Link href="/landlord/providers" className="ml-auto text-brand underline underline-offset-2">{zh ? '服务商与策略 →' : 'Providers & policy →'}</Link>
        </div>
      )}
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4" data-testid="ticket-counts">
        {([['open', L('new')], ['assigned', zh ? '已派 / 处理中' : 'Dispatched / in progress'], ['review', L('review')], ['done', L('done')]] as const).map(([k, label]) => (
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
        <MaintenancePanel householdId={cur.id} city={cur.city ?? null} myRole="landlord" zh={zh} />
      </div>
      <p className="mt-2 text-[11px] text-body-3">{zh ? '派单入口在每张工单的「指派」：精选网络（资质已核）或你自己的联系人。' : 'Dispatch from "Dispatch" on a ticket: the curated network (verified) or your own contact.'} <Link href="/landlord/providers" className="underline">{zh ? '服务商目录' : 'Provider directory'}</Link></p>
    </div>
  )
}
