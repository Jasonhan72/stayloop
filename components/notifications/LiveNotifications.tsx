'use client'

// Real notifications for the signed-in account (节点 2 · 清楚, 2026-09-26).
// /notifications was a design sample behind the demo gate; a provider who
// tapped 通知 was bounced into the landlord onboarding page (external review,
// P1-2). This slot renders, under the caller's own RLS:
//   · 需要你 — the pending approval cards of the current hat (→ its to-do page),
//   · 服务商 · 工单动态 — the latest work-order events on this account's provider
//     jobs (shown for any hat that also holds the provider row),
//   · 最近动态 — the account's latest audit events in plain words.
// Nothing here is a legal notice; formal notices stay e-mail + executor.
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/useAuth'
import { useHats } from '@/lib/useHats'
import { useT } from '@/lib/i18n'
import { useReportLiveRows } from '@/lib/liveRows'
import { auditActionLabel } from '@/lib/agent/ideas'
import { WORK_ORDER_COLUMNS } from '@/lib/marketplace/workOrders'
import type { AgentRole } from '@/lib/agent/types'

type Pending = { id: string; title: string; action_type: string; created_at: string }
type Audit = { id: string; action: string; created_at: string; metadata: Record<string, unknown> | null }
type WoEvent = { id: number; work_order_id: string; event: string; created_at: string; actor_kind: string | null; scope: string }

const WO_EVENT_LABEL: Record<string, { zh: string; en: string }> = {
  offered: { zh: '收到新工单邀请', en: 'New job invitation' },
  accept: { zh: '已接单', en: 'Accepted' },
  quote: { zh: '已报价', en: 'Quoted' },
  approve_quote: { zh: '房东批准了报价', en: 'Landlord approved the quote' },
  reject_quote: { zh: '房东未接受报价', en: 'Landlord declined the quote' },
  arrive: { zh: '已到场', en: 'Arrived' },
  complete: { zh: '已完工', en: 'Completed' },
  tenant_confirm: { zh: '租客确认问题已解决', en: 'Tenant confirmed the fix' },
  accept_completion: { zh: '房东已验收', en: 'Landlord accepted the work' },
  request_rework: { zh: '房东要求返工', en: 'Landlord asked for rework' },
  dispute: { zh: '进入争议', en: 'Disputed' },
  resolve_dispute: { zh: '争议已裁定', en: 'Dispute resolved' },
  mark_paid: { zh: '房东标记已付款', en: 'Landlord marked as paid' },
  close: { zh: '工单已关闭', en: 'Job closed' },
  cancel: { zh: '工单已取消', en: 'Job cancelled' },
  decline: { zh: '已婉拒', en: 'Declined' },
  quote_overdue: { zh: '报价已逾期（系统提醒）', en: 'Quote overdue (system reminder)' },
}

const NOT_NOTIFICATIONS = /session|turn$|memory_|thread/

function when(iso: string, zh: boolean): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleString(zh ? 'zh-CN' : 'en-CA', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
}

export default function LiveNotifications({ role }: { role: AgentRole }) {
  const auth = useAuth()
  const hats = useHats()
  const { lang } = useT()
  const zh = lang === 'zh'
  const [pending, setPending] = useState<Pending[] | null>(null)
  const [audit, setAudit] = useState<Audit[]>([])
  const [woEvents, setWoEvents] = useState<WoEvent[]>([])
  useEffect(() => {
    if (auth.loading || !auth.user) return
    let cancelled = false
    const uid = auth.user.id
    ;(async () => {
      const [{ data: p }, { data: a }] = await Promise.all([
        supabase.from('agent_pending_actions').select('id, title, action_type, created_at').eq('user_id', uid).eq('role', role).eq('status', 'pending').order('created_at', { ascending: false }).limit(10),
        supabase.from('agent_audit_events').select('id, action, created_at, metadata').eq('actor_id', uid).order('created_at', { ascending: false }).limit(40),
      ])
      if (cancelled) return
      setPending((p ?? []) as Pending[])
      setAudit(((a ?? []) as Audit[]).filter((r) => !NOT_NOTIFICATIONS.test(r.action)).slice(0, 10))
    })()
    return () => { cancelled = true }
  }, [auth.loading, auth.user, role])
  useEffect(() => {
    if (auth.loading || !auth.user || hats.loading || !hats.provider) return
    let cancelled = false
    const uid = auth.user.id
    ;(async () => {
      const { data: prov } = await supabase.from('service_providers').select('id').eq('auth_id', uid).maybeSingle()
      if (!prov) return
      const { data: wos } = await supabase.from('work_orders').select(WORK_ORDER_COLUMNS).eq('provider_id', (prov as { id: string }).id).order('updated_at', { ascending: false }).limit(20)
      const rows = (wos ?? []) as unknown as { id: string; scope: string }[]
      if (!rows.length) return
      const { data: ev } = await supabase.from('work_order_events').select('id, work_order_id, event, created_at, actor_kind').in('work_order_id', rows.map((w) => w.id)).order('created_at', { ascending: false }).limit(10)
      if (cancelled) return
      setWoEvents(((ev ?? []) as Omit<WoEvent, 'scope'>[]).map((e) => ({ ...e, scope: rows.find((w) => w.id === e.work_order_id)?.scope ?? '' })))
    })()
    return () => { cancelled = true }
  }, [auth.loading, auth.user, hats.loading, hats.provider])
  const total = (pending?.length ?? 0) + woEvents.length + audit.length
  useReportLiveRows('notifications', pending === null ? null : total)
  if (pending === null || total === 0) return null
  return (
    <div className="mb-6 space-y-4" data-testid="live-notifications">
      {pending.length > 0 && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
          <div className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-amber-800">{zh ? '需要你 · 等你点头' : 'NEEDS YOU'}</div>
          <ul className="mt-2 divide-y divide-amber-100">
            {pending.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 py-2 text-[13.5px]">
                <span className="min-w-0 truncate font-semibold">{p.title}</span>
                <Link href={`/${role}/todo`} className="flex-none text-[12.5px] font-semibold text-brand underline underline-offset-2">{zh ? '去处理 →' : 'Review →'}</Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      {woEvents.length > 0 && (
        <section className="rounded-2xl border border-line-divider bg-white p-4" data-testid="provider-notifications">
          <div className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-body-3">{zh ? '服务商 · 工单动态' : 'PROVIDER · JOB ACTIVITY'}</div>
          <ul className="mt-2 divide-y divide-line-divider">
            {woEvents.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-3 py-2 text-[13.5px]">
                <span className="min-w-0 truncate"><b>{zh ? WO_EVENT_LABEL[e.event]?.zh ?? e.event : WO_EVENT_LABEL[e.event]?.en ?? e.event}</b><span className="text-body-3"> · {e.scope.slice(0, 40)}</span></span>
                <span className="flex flex-none items-center gap-2 text-[12px] text-body-3">{when(e.created_at, zh)}<Link href="/provider/jobs" className="font-semibold text-brand underline underline-offset-2">{zh ? '工单 →' : 'Jobs →'}</Link></span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {audit.length > 0 && (
        <section className="rounded-2xl border border-line-divider bg-white p-4">
          <div className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-body-3">{zh ? '最近动态 · 已知会' : 'RECENT · FYI'}</div>
          <ul className="mt-2 divide-y divide-line-divider">
            {audit.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 py-2 text-[13.5px]">
                <span className="min-w-0 truncate">{auditActionLabel(r.action, lang, r.metadata || undefined)}</span>
                <span className="flex-none text-[12px] text-body-3">{when(r.created_at, zh)}</span>
              </li>
            ))}
          </ul>
          <Link href={`/${role}/audit`} className="mt-2 inline-block text-[12.5px] font-semibold text-brand underline underline-offset-2">{zh ? '完整审计 →' : 'Full audit →'}</Link>
        </section>
      )}
    </div>
  )
}
