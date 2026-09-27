'use client'

// The tenant's own rent records across their managed tenancies. Since 节点 1
// (2026-09-26) the rows come from lib/facts/useFacts (`rent_all`: every
// instalment on the tenancies this account is the TENANT on) — the same
// payload the progress tiles and the rail count, so "1 期待付" on the progress
// page and this list can no longer disagree. Records only; nothing is debited.
import Link from 'next/link'
import { useT } from '@/lib/i18n'
import { useReportLiveRows } from '@/lib/liveRows'
import { useFacts } from '@/lib/facts/useFacts'
import { RENT_STATE_LABEL } from '@/lib/matters/states'

export default function MyRent() {
  const { lang } = useT()
  const zh = lang === 'zh'
  const { facts } = useFacts('tenant')
  const houses = facts ? facts.households.filter((h) => h.current_lease_id && facts.member_roles.some((m) => m.household_id === h.id && m.role === 'tenant')) : []
  const rows = facts
    ? facts.rent_all
        .map((p) => {
          const h = houses.find((x) => x.current_lease_id === p.lease_id)
          return h ? { id: p.id ?? `${p.lease_id}:${p.due_date}`, household_id: h.id, address: h.address ?? '', unit: h.unit ?? null, due_date: p.due_date, amount: p.amount ?? null, status: p.status ?? 'due', paid_at: p.paid_at ?? null, method: p.method ?? null } : null
        })
        .filter((r): r is NonNullable<typeof r> => !!r)
    : null
  useReportLiveRows('rent', rows?.length)
  if (!rows || rows.length === 0) return null
  const label = (s: string) => (RENT_STATE_LABEL[s] ? (zh ? RENT_STATE_LABEL[s].zh : RENT_STATE_LABEL[s].en) : s)
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
