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
    const tIds = Array.from(new Set(list.map((r) => r.ticket_id)))
    if (tIds.length) {
      const { data: t } = await supabase.from('maintenance_tickets').select('id, title, household_id').in('id', tIds)
      const hhIds = Array.from(new Set(list.map((r) => r.household_id)))
      const { data: h } = await supabase.from('households').select('id, address, unit, city').in('id', hhIds)
      const hh = new Map(((h ?? []) as { id: string; address: string; unit: string | null; city: string | null }[]).map((x) => [x.id, x]))
      const m: Record<string, Ctx> = {}
      for (const x of (t ?? []) as { id: string; title: string; household_id: string }[]) { const hv = hh.get(x.household_id); m[x.id] = { title: x.title, city: hv?.city ?? null, address: hv?.address ?? null, unit: hv?.unit ?? null } }
      setCtx(m)
    }
  }, [auth.user])
  useEffect(() => { if (!auth.loading) void load() }, [auth.loading, load])

  const Shell = ({ children }: { children: React.ReactNode }) => (<div className="flex min-h-screen flex-col bg-surface"><Header /><main className="mx-auto w-full max-w-[860px] flex-1 px-5 py-8">{children}</main><Footer /></div>)
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
          <p className="mt-1 text-[12.5px] text-body-3">{prov.status === 'verified' ? (zh ? '资质已核 · 可接收派单' : 'Verified · eligible for dispatch') : (zh ? `状态：${prov.status} · 核验通过前不会收到派单` : `Status: ${prov.status} · no dispatch until verified`)} · <Link href="/provider/onboard" className="underline">{zh ? '资料与资质' : 'Profile & credentials'}</Link></p>
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
                    <div className="mb-1 text-[12.5px] text-body-2"><b>{ctx[r.ticket_id]?.title || r.scope}</b> · {hidden(r) ? (ctx[r.ticket_id]?.city || '') : [ctx[r.ticket_id]?.address, ctx[r.ticket_id]?.unit ? `#${ctx[r.ticket_id]?.unit}` : null, ctx[r.ticket_id]?.city].filter(Boolean).join(', ')}</div>
                    <WorkOrderCard wo={r} viewer="provider" zh={zh} providerName={prov.trade_name || prov.legal_name} onChange={load} />
                  </div>
                ))}
              </div>
            )}
          </section>
        )
      })}
      <p className="mt-8 text-[11px] text-body-3">{zh ? '完整地址在接单后显示；租客联系方式只在工单进行期间可见。' : 'The full address shows after you accept; tenant contact details only while the job is open.'}</p>
    </Shell>
  )
}
