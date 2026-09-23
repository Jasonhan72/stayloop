'use client'

// /provider/jobs — the provider's job list (services marketplace §4.3):
// invitations, in progress, done. Mobile first; every action goes through
// the shared WorkOrderCard → /api/work-orders/[id]/act.
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import WorkOrderCard, { type WorkOrderLite } from '@/components/marketplace/WorkOrderCard'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/useAuth'
import { useT } from '@/lib/i18n'

type Row = WorkOrderLite & { ticket_id: string; household_id: string }
type Ctx = { title: string; city: string | null; address: string | null; unit: string | null }
const PROVIDER_STATUS: Record<string, { zh: string; en: string }> = { pending: { zh: '待核验', en: 'pending verification' }, verified: { zh: '已核验', en: 'verified' }, rejected: { zh: '未通过', en: 'rejected' }, suspended: { zh: '已暂停', en: 'suspended' }, expired: { zh: '已过期', en: 'expired' } }

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-screen flex-col bg-surface"><Header /><main className="mx-auto w-full max-w-[860px] flex-1 px-5 py-8">{children}</main><Footer /></div>
}

export default function ProviderJobsPage() {
  const auth = useAuth()
  const { lang } = useT()
  const zh = lang === 'zh'
  const [prov, setProv] = useState<{ id: string; status: string; legal_name: string; trade_name: string | null } | null | 'loading'>('loading')
  const [rows, setRows] = useState<Row[]>([])
  const [ctx, setCtx] = useState<Record<string, Ctx>>({})
  const load = useCallback(async () => {
    if (!auth.user) { setProv(null); return }
    const { data: p } = await supabase.from('service_providers').select('id, status, legal_name, trade_name').eq('auth_id', auth.user.id).maybeSingle()
    setProv((p as typeof prov) ?? null)
    if (!p) return
    const { data } = await supabase.from('work_orders').select('*').eq('provider_id', (p as { id: string }).id).order('updated_at', { ascending: false }).limit(100)
    const list = (data ?? []) as Row[]
    setRows(list)
    // Address / title come from a definer RPC scoped to this provider's live
    // work orders (no table access to households or tickets; review 2026-09-23).
    const { data: c } = await supabase.rpc('provider_job_context')
    const m: Record<string, Ctx> = {}
    for (const x of (c ?? []) as { work_order_id: string; ticket_title: string; address: string | null; unit: string | null; city: string | null }[]) m[x.work_order_id] = { title: x.ticket_title, city: x.city, address: x.address, unit: x.unit }
    setCtx(m)
  }, [auth.user])
  useEffect(() => { if (!auth.loading) void load() }, [auth.loading, load])

  if (auth.loading || prov === 'loading') return <Shell><div className="text-body-3">…</div></Shell>
  if (!auth.user) return <Shell><div className="rounded-2xl border border-line-divider bg-white p-6 text-[14px]">{zh ? '请先登录。' : 'Sign in first.'} <Link href="/login?next=/provider/jobs" className="underline">{zh ? '登录' : 'Sign in'}</Link></div></Shell>
  if (!prov) return <Shell><div className="rounded-2xl border border-line-divider bg-white p-6 text-[14px]">{zh ? '你还没有服务商档案。' : 'No provider profile yet.'} <Link href="/provider/onboard" className="font-bold text-brand underline">{zh ? '入驻 →' : 'Onboard →'}</Link></div></Shell>

  const groups: { key: string; zh: string; en: string; filter: (r: Row) => boolean }[] = [
    { key: 'invites', zh: '邀请 · 等你回应', en: 'Invitations', filter: (r) => r.status === 'offered' },
    { key: 'active', zh: '进行中', en: 'In progress', filter: (r) => ['quoted', 'scheduled', 'in_progress', 'rework', 'completed', 'disputed'].includes(r.status) },
    { key: 'done', zh: '已完成 / 关闭', en: 'Done / closed', filter: (r) => ['accepted', 'paid', 'closed', 'declined', 'cancelled', 'expired'].includes(r.status) },
  ]
  const hidden = (r: Row) => ['offered', 'declined', 'cancelled', 'expired'].includes(r.status)
  return (
    <Shell>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="font-mono text-[11px] font-bold uppercase tracking-eyebrowLg text-body-3">{zh ? '服务商 · 工单' : 'PROVIDER · JOBS'}</div>
          <h1 className="mt-1 text-[24px] font-extrabold tracking-tight">{prov.trade_name || prov.legal_name}</h1>
          <p className="mt-1 text-[12.5px] text-body-3">{prov.status === 'verified' ? (zh ? '资质已核 · 可接收派单' : 'Verified · eligible for dispatch') : (zh ? `状态：${PROVIDER_STATUS[prov.status]?.zh ?? prov.status} · 核验通过前不会收到派单` : `Status: ${PROVIDER_STATUS[prov.status]?.en ?? prov.status} · no dispatch until verified`)} · <Link href="/provider/onboard" className="underline">{zh ? '资料与资质' : 'Profile & credentials'}</Link></p>
        </div>
      </div>
      {groups.map((g) => {
        const list = rows.filter(g.filter)
        return (
          <section key={g.key} className="mt-6">
            <h2 className="text-[14px] font-extrabold">{zh ? g.zh : g.en} <span className="font-mono text-[12px] text-body-3">{list.length}</span></h2>
            {list.length === 0 ? <p className="mt-2 text-[12.5px] text-body-3">—</p> : (
              <div className="mt-2 space-y-3">
                {list.map((r) => (
                  <div key={r.id}>
                    <div className="mb-1 text-[12.5px] text-body-2"><b>{ctx[r.id]?.title || r.scope}</b> · {hidden(r) ? (ctx[r.id]?.city || '') : [ctx[r.id]?.address, ctx[r.id]?.unit ? `#${ctx[r.id]?.unit}` : null, ctx[r.id]?.city].filter(Boolean).join(', ')}</div>
                    <WorkOrderCard wo={r} viewer="provider" zh={zh} providerName={prov.trade_name || prov.legal_name} onChange={load} />
                  </div>
                ))}
              </div>
            )}
          </section>
        )
      })}
      <p className="mt-8 text-[11px] text-body-3">{zh ? '完整地址在接单后显示、归档后隐藏；进入方式以房东发出的通知为准。' : 'The full address shows after you accept and is hidden once the job is closed; entry follows the landlord’s notice.'}</p>
    </Shell>
  )
}
