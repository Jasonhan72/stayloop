'use client'

// /provider/history — the provider's track record (节点 3 「可执行」, 2026-09-26,
// 报告 7): finished work orders with their decline / cancel reasons, invoices
// and the offline settlement record (the landlord's "marked paid" stamps —
// Stayloop moves no money), the reviews landlords and tenants left, and the
// pilot metrics computed from the rows (response time, punctuality,
// acceptance, first-time fix, rework, disputes). Everything reads through the
// provider's own RLS; nothing here can be edited.
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import WorkOrderCard, { type WorkOrderLite } from '@/components/marketplace/WorkOrderCard'
import ThreadPanel from '@/components/threads/ThreadPanel'
import { providerMetrics, WORK_ORDER_COLUMNS, WO_STATUS_LABEL, type WoRow, type WorkOrderStatus } from '@/lib/marketplace/workOrders'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/useAuth'
import { useT } from '@/lib/i18n'
import { settlementByMonth } from '@/lib/marketplace/providerView'

type Row = WorkOrderLite & { ticket_id: string; household_id: string }
type Review = { id: string; by_kind: string; overall: number; on_time: number | null; communication: number | null; quality: number | null; comment: string | null; created_at: string; work_order_id: string }
const FINISHED: WorkOrderStatus[] = ['paid', 'closed', 'declined', 'cancelled', 'expired']

const money = (n: number | string | null | undefined) => (n == null || n === '' ? '—' : `$${Number(n).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)
const pct = (v: number | null) => (v == null ? '—' : `${Math.round(v * 100)}%`)

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-screen flex-col bg-surface"><Header /><main className="mx-auto w-full max-w-[860px] flex-1 px-5 py-8">{children}</main><Footer /></div>
}

export default function ProviderHistoryPage() {
  const auth = useAuth()
  const { lang } = useT()
  const zh = lang === 'zh'
  const [prov, setProv] = useState<{ id: string; legal_name: string; trade_name: string | null } | null | 'loading'>('loading')
  const [rows, setRows] = useState<Row[]>([])
  const [reviews, setReviews] = useState<Review[]>([])
  useEffect(() => {
    if (auth.loading) return
    if (!auth.user) { setProv(null); return }
    let cancelled = false
    ;(async () => {
      const { data: p } = await supabase.from('service_providers').select('id, legal_name, trade_name').eq('auth_id', auth.user!.id).maybeSingle()
      if (cancelled) return
      setProv((p as typeof prov) ?? null)
      if (!p) return
      const pid = (p as { id: string }).id
      const [{ data: w }, { data: rv }] = await Promise.all([
        supabase.from('work_orders').select(WORK_ORDER_COLUMNS).eq('provider_id', pid).order('updated_at', { ascending: false }).limit(300),
        supabase.from('provider_reviews').select('id, by_kind, overall, on_time, communication, quality, comment, created_at, work_order_id').eq('provider_id', pid).order('created_at', { ascending: false }).limit(200),
      ])
      if (cancelled) return
      setRows((w ?? []) as unknown as Row[])
      setReviews((rv ?? []) as Review[])
    })()
    return () => { cancelled = true }
  }, [auth.loading, auth.user])

  const metrics = useMemo(() => providerMetrics(rows as unknown as WoRow[]), [rows])
  const settlement = useMemo(() => settlementByMonth(rows), [rows])
  const finished = useMemo(() => rows.filter((r) => FINISHED.includes(r.status)), [rows])
  const avg = reviews.length ? Math.round((reviews.reduce((s, r) => s + Number(r.overall), 0) / reviews.length) * 10) / 10 : null

  if (auth.loading || prov === 'loading') return <Shell><div className="text-body-3">…</div></Shell>
  if (!auth.user) return <Shell><div className="rounded-2xl border border-line-divider bg-white p-6 text-[14px]">{zh ? '请先登录。' : 'Sign in first.'} <Link href="/login?next=/provider/history" className="underline">{zh ? '登录' : 'Sign in'}</Link></div></Shell>
  if (!prov) return <Shell><div className="rounded-2xl border border-line-divider bg-white p-6 text-[14px]">{zh ? '你还没有服务商档案。' : 'No provider profile yet.'} <Link href="/provider/onboard" className="font-bold text-brand underline">{zh ? '入驻 →' : 'Onboard →'}</Link></div></Shell>

  const stat = (n: string, label: string, sub?: string) => (
    <div className="rounded-xl border border-line-divider bg-white p-3"><div className="text-[20px] font-extrabold tracking-tight">{n}</div><div className="text-[12px] font-semibold text-body-2">{label}</div>{sub ? <div className="mt-0.5 text-[11px] text-body-3">{sub}</div> : null}</div>
  )
  return (
    <Shell>
      <div className="font-mono text-[11px] font-bold uppercase tracking-eyebrowLg text-body-3">{zh ? '服务商 · 历史' : 'PROVIDER · HISTORY'}</div>
      <h1 className="mt-1 text-[24px] font-extrabold tracking-tight">{prov.trade_name || prov.legal_name}</h1>
      <p className="mt-1 text-[12.5px] text-body-3"><Link href="/provider/jobs" className="underline">{zh ? '← 工单' : '← Jobs'}</Link> · {zh ? '这里的每个数字都从你自己的工单行算出来；房东也按同一规则看到你的接单率、响应时长和准时率。' : 'Every number here is computed from your own work-order rows; landlords see your acceptance, response time and punctuality by the same rule.'}</p>

      <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6" data-testid="provider-metrics">
        {stat(metrics.responseHoursMedian == null ? '—' : metrics.responseHoursMedian < 1 ? '<1h' : `${metrics.responseHoursMedian}h`, zh ? '响应时长（中位）' : 'Response (median)', zh ? '派单 → 报价' : 'offer → quote')}
        {stat(pct(metrics.onTimeRate), zh ? '准时到场' : 'On time', zh ? '窗口开始 15 分钟内' : 'within 15 min of the window')}
        {stat(pct(metrics.acceptRate), zh ? '接单率' : 'Acceptance', zh ? `共 ${metrics.offered} 次派单` : `${metrics.offered} offers`)}
        {stat(pct(metrics.firstTimeFixRate), zh ? '一次解决' : 'First-time fix', zh ? '无返工、无争议' : 'no rework, no dispute')}
        {stat(pct(metrics.reworkRate), zh ? '返工率' : 'Rework')}
        {stat(pct(metrics.disputeRate), zh ? '争议率' : 'Disputes')}
      </div>

      <section className="mt-6" data-testid="settlement-record">
        <h2 className="text-[14px] font-extrabold">{zh ? '结算记录（线下）' : 'Settlement record (offline)'} <span className="font-mono text-[12px] text-body-3">{settlement.length}</span></h2>
        <p className="mt-1 text-[12px] text-body-3">{zh ? '以房东在工单上「标记已付」的时间为准。Stayloop 不经手资金，这不是发票；发票由你自己开给房东。' : 'Based on when the landlord marked the job paid. Stayloop moves no money and this is not an invoice — you invoice the landlord yourself.'}</p>
        {settlement.length === 0 ? <p className="mt-2 text-[12.5px] text-body-3">—</p> : (
          <div className="mt-2 overflow-x-auto rounded-xl border border-line-divider bg-white">
            <table className="w-full min-w-[420px] text-left text-[12.5px]">
              <thead className="font-mono text-[10.5px] uppercase tracking-eyebrowLg text-body-3"><tr><th className="px-3 py-2">{zh ? '月份' : 'Month'}</th><th className="px-3 py-2">{zh ? '已付工单' : 'Paid jobs'}</th><th className="px-3 py-2">{zh ? '账单合计' : 'Invoices total'}</th></tr></thead>
              <tbody className="divide-y divide-line-divider">{settlement.map((s) => <tr key={s.month}><td className="px-3 py-2 font-mono">{s.month}</td><td className="px-3 py-2">{s.count}</td><td className="px-3 py-2 font-semibold">{money(s.total)}</td></tr>)}</tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mt-6" data-testid="provider-reviews">
        <h2 className="text-[14px] font-extrabold">{zh ? '收到的评价' : 'Reviews'} <span className="font-mono text-[12px] text-body-3">{reviews.length}{avg != null ? ` · ★ ${avg}` : ''}</span></h2>
        {reviews.length === 0 ? <p className="mt-2 text-[12.5px] text-body-3">{zh ? '还没有评价。房东与租客在验收后 14 天内可以各写一条。' : 'No reviews yet. The landlord and the tenant may each leave one within 14 days of acceptance.'}</p> : (
          <div className="mt-2 divide-y divide-line-divider rounded-xl border border-line-divider bg-white">
            {reviews.map((r) => (
              <div key={r.id} className="px-3 py-2.5 text-[12.5px]">
                <div className="flex flex-wrap items-center gap-2"><span className="font-bold">{'★'.repeat(Number(r.overall))}<span className="text-line-strong">{'★'.repeat(5 - Number(r.overall))}</span></span><span className="text-body-3">{r.by_kind === 'landlord' ? (zh ? '房东' : 'landlord') : (zh ? '租客' : 'tenant')} · {r.created_at.slice(0, 10)}</span>{r.on_time != null && <span className="text-[11px] text-body-3">{zh ? '准时' : 'on time'} {r.on_time}</span>}{r.communication != null && <span className="text-[11px] text-body-3">{zh ? '沟通' : 'communication'} {r.communication}</span>}{r.quality != null && <span className="text-[11px] text-body-3">{zh ? '质量' : 'quality'} {r.quality}</span>}</div>
                {r.comment && <p className="mt-1 text-body-2">{r.comment}</p>}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="mt-6" data-testid="history-list">
        <h2 className="text-[14px] font-extrabold">{zh ? '历史工单' : 'Finished work orders'} <span className="font-mono text-[12px] text-body-3">{finished.length}</span></h2>
        <p className="mt-1 text-[12px] text-body-3">{zh ? '已付款、已归档、婉拒、取消、过期的工单。婉拒与取消原因保留在卡片与时间线上。' : 'Paid, closed, declined, cancelled and expired jobs. Decline and cancel reasons stay on the card and its timeline.'}</p>
        {finished.length === 0 ? <p className="mt-2 text-[12.5px] text-body-3">—</p> : (
          <div className="mt-2 space-y-3">
            {finished.map((r) => (
              <div key={r.id}>
                <div className="mb-1 text-[12.5px] text-body-2"><b>{r.scope}</b> · <span className="text-body-3">{zh ? WO_STATUS_LABEL[r.status].zh : WO_STATUS_LABEL[r.status].en}</span></div>
                <WorkOrderCard wo={r} viewer="provider" zh={zh} providerName={prov.trade_name || prov.legal_name} compact />
                <div className="mt-2"><ThreadPanel kind="work_order" refId={r.id} viewer="provider" zh={zh} compact title={zh ? '工单对话（记录）' : 'Work-order thread (record)'} allowAttachments={false} /></div>
              </div>
            ))}
          </div>
        )}
      </section>
    </Shell>
  )
}
