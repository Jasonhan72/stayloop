'use client'

// The tenant's own rent records across their managed tenancies. /tenant/payments
// was gated as "no rent records yet" while the progress page counted one due
// (walk-through 2026-09-25): the page never read anything. household_members
// (self) → households → rent_payments by current_lease_id, all under RLS; the
// row count feeds the DemoGate's "以上是你的真实记录" line.
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/useAuth'
import { useT } from '@/lib/i18n'
import { useReportLiveRows } from '@/lib/liveRows'

type Row = { id: string; household_id: string; address: string; unit: string | null; due_date: string; amount: number | null; status: string; paid_at: string | null; method: string | null }

export default function MyRent() {
  const auth = useAuth()
  const { lang } = useT()
  const zh = lang === 'zh'
  const [rows, setRows] = useState<Row[] | null>(null)
  useReportLiveRows('rent', rows?.length)
  useEffect(() => {
    if (auth.loading || !auth.user) return
    let cancelled = false
    const uid = auth.user.id
    ;(async () => {
      // Only tenancies this account is the TENANT on: an account that also lets out a unit
      // must not see its tenant's rent here as "my rent" (review 2026-09-25).
      const { data: mem } = await supabase.from('household_members').select('household_id').eq('user_id', uid).eq('status', 'active').eq('role', 'tenant').limit(20)
      const ids = ((mem ?? []) as { household_id: string }[]).map((m) => m.household_id)
      if (!ids.length) { if (!cancelled) setRows([]); return }
      const { data: hh } = await supabase.from('households').select('id, address, unit, current_lease_id').in('id', ids)
      const houses = ((hh ?? []) as { id: string; address: string; unit: string | null; current_lease_id: string | null }[]).filter((h) => h.current_lease_id)
      if (!houses.length) { if (!cancelled) setRows([]); return }
      const { data: pay } = await supabase.from('rent_payments').select('id, lease_id, due_date, amount, status, paid_at, method').in('lease_id', houses.map((h) => h.current_lease_id as string)).order('due_date', { ascending: false }).limit(36)
      if (cancelled) return
      setRows(((pay ?? []) as { id: string; lease_id: string; due_date: string; amount: number | null; status: string; paid_at: string | null; method: string | null }[]).map((p) => {
        const h = houses.find((x) => x.current_lease_id === p.lease_id)!
        return { id: p.id, household_id: h.id, address: h.address, unit: h.unit, due_date: p.due_date, amount: p.amount, status: p.status, paid_at: p.paid_at, method: p.method }
      }))
    })()
    return () => { cancelled = true }
  }, [auth.loading, auth.user])
  if (!rows || rows.length === 0) return null
  // rent_payments.status ∈ due | paid | late | failed (20260509_v5_schema)
  const LABEL: Record<string, { zh: string; en: string }> = { due: { zh: '待付', en: 'Due' }, paid: { zh: '已付', en: 'Paid' }, late: { zh: '逾期', en: 'Late' }, failed: { zh: '失败', en: 'Failed' } }
  const label = (s: string) => (LABEL[s] ? (zh ? LABEL[s].zh : LABEL[s].en) : s)
  return (
    <div className="mb-6 rounded-2xl border border-line-divider bg-white p-5">
      <div className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-body-3">{zh ? '我的租金记录 · 真实记录' : 'MY RENT · LIVE'}</div>
      <div className="mt-3 divide-y divide-line-divider">
        {rows.map((r) => (
          <div key={r.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 py-2.5 text-[13.5px]">
            <div className="min-w-0 flex-1 basis-[180px]">
              <div className="break-words font-semibold">{r.address}{r.unit ? ` #${r.unit}` : ''}</div>
              <div className="mt-0.5 text-[12px] text-body-3">{zh ? '账期 ' : 'Due '}{r.due_date}{r.paid_at ? (zh ? ` · 记录付于 ${r.paid_at.slice(0, 10)}` : ` · recorded paid ${r.paid_at.slice(0, 10)}`) : ''}{r.method ? ` · ${r.method}` : ''}</div>
            </div>
            <div className="flex flex-none items-center gap-2">
              {r.amount != null && <span className="font-semibold">${Number(r.amount).toLocaleString()}</span>}
              <span className={`rounded-full px-2 py-[2px] text-[11px] font-bold ${r.status === 'paid' ? 'bg-emerald-50 text-emerald-700' : r.status === 'late' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-800'}`}>{label(r.status)}</span>
              <Link href={`/h/${r.household_id}?tab=rent`} className="text-[12.5px] font-semibold text-brand-strong">{zh ? '记录 →' : 'Record →'}</Link>
            </div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[12px] text-body-3">{zh ? '这里只记录，不扣款：付租仍走你和房东约定的方式，「标记已付」在在管租约页。准时记录会进入你的租客护照。' : 'Records only, no charges: rent is still paid the way you and the landlord agreed; mark it paid on the tenancy page. On-time records feed your passport.'}</p>
    </div>
  )
}
