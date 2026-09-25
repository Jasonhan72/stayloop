'use client'

// /landlord/providers — the curated network as the landlord sees it plus
// the contacts they have dispatched to before (services marketplace §4.3).
// Directory rows are verified providers only (RLS); coverage is computed
// from credentials with the same pure rule the dispatch uses.
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import WorkspaceShell from '@/components/WorkspaceShell'
import { PageHeader, SectionCard, StatusPill } from '@/components/workspace'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/useAuth'
import { useT } from '@/lib/i18n'
import { CITIES, coverageFor, TRADES, type Trade } from '@/lib/marketplace/trades'
import { providerMetrics, type WoRow } from '@/lib/marketplace/workOrders'
import DispatchPolicyCard, { type PolicyProvider } from '@/components/marketplace/DispatchPolicyCard'

type Provider = { id: string; legal_name: string; trade_name: string | null; trades: string[]; service_cities: string[]; pricing_mode: string; call_out_fee: number | null; hourly_rate: number | null; contact_email: string | null; contact_phone: string | null; website: string | null; verified_at: string | null }
type Cred = { provider_id: string; kind: string; expires_at: string | null; verified_at: string | null }
type Review = { provider_id: string | null; overall: number }

export default function LandlordProvidersPage() {
  const { lang } = useT()
  const zh = lang === 'zh'
  const auth = useAuth()
  const [providers, setProviders] = useState<Provider[]>([])
  const [creds, setCreds] = useState<Cred[]>([])
  const [reviews, setReviews] = useState<Review[]>([])
  const [mine, setMine] = useState<{ external_email: string | null; external_name: string | null; provider_id: string | null; status: string; created_at: string; quoted_at: string | null; approved_amount: number | null; invoice_amount: number | null; schedule_start: string | null; arrived_at: string | null; accepted_at: string | null; emergency: boolean }[]>([])
  const [trade, setTrade] = useState<Trade | 'all'>('all')
  const [city, setCity] = useState<string>('all')
  useEffect(() => {
    if (auth.loading || !auth.user) return
    let cancelled = false
    ;(async () => {
      const [{ data: p }, { data: w }] = await Promise.all([
        supabase.from('provider_directory').select('id, legal_name, trade_name, trades, service_cities, pricing_mode, call_out_fee, hourly_rate, contact_email, contact_phone, website, verified_at').limit(200),
        supabase.from('work_orders').select('external_email, external_name, provider_id, status, created_at, quoted_at, approved_amount, invoice_amount, schedule_start, arrived_at, accepted_at, emergency').eq('landlord_auth_id', auth.user!.id).order('created_at', { ascending: false }).limit(200),
      ])
      const list = (p ?? []) as Provider[]
      const ids = list.map((x) => x.id)
      const [{ data: c }, { data: r }] = await Promise.all([
        ids.length ? supabase.from('provider_credentials_public').select('provider_id, kind, expires_at, verified_at').in('provider_id', ids) : Promise.resolve({ data: [] }),
        ids.length ? supabase.from('provider_reviews').select('provider_id, overall').in('provider_id', ids) : Promise.resolve({ data: [] }),
      ])
      if (cancelled) return
      setProviders(list); setCreds((c ?? []) as Cred[]); setReviews((r ?? []) as Review[]); setMine((w ?? []) as typeof mine)
    })()
    return () => { cancelled = true }
  }, [auth.loading, auth.user])

  const rows = useMemo(() => providers.filter((p) => (trade === 'all' || p.trades.includes(trade)) && (city === 'all' || p.service_cities.includes(city))).map((p) => {
    const pc = creds.filter((c) => c.provider_id === p.id)
    const cov = p.trades.map((t) => ({ t: t as Trade, ok: coverageFor(t as Trade, pc).ok }))
    const rv = reviews.filter((r) => r.provider_id === p.id)
    const avg = rv.length ? Math.round((rv.reduce((s, r) => s + r.overall, 0) / rv.length) * 10) / 10 : null
    const myJobs = mine.filter((m) => m.provider_id === p.id)
    return { p, cov, avg, n: rv.length, metrics: providerMetrics(myJobs as WoRow[]) }
  }), [providers, creds, reviews, mine, trade, city])
  const policyProviders = useMemo<PolicyProvider[]>(() => providers.map((p) => {
    const pc = creds.filter((c) => c.provider_id === p.id)
    return { id: p.id, name: p.trade_name || p.legal_name, coveredTrades: (p.trades as Trade[]).filter((t) => coverageFor(t, pc).ok) }
  }), [providers, creds])
  const contacts = useMemo(() => {
    const m = new Map<string, { name: string | null; jobs: number; last: string }>()
    for (const w of mine) { if (!w.external_email) continue; const cur = m.get(w.external_email); m.set(w.external_email, { name: w.external_name || cur?.name || null, jobs: (cur?.jobs ?? 0) + 1, last: cur?.last ?? w.created_at }) }
    return Array.from(m.entries())
  }, [mine])

  return (
    <WorkspaceShell role="landlord" hideAside>
      <PageHeader title={zh ? '服务商' : 'Service providers'} sub={<><span className="font-mono text-[11px] uppercase tracking-eyebrow text-body-3">LANDLORD · PROVIDERS</span><span className="mx-1.5 text-body-3">·</span>{zh ? '精选网络里的每一家都由 Stayloop 人工对照公开注册库核验资质；到期即停派单。派单从在管租约的报修工单发起。' : 'Every provider in the curated network is checked by hand against the public registers; expired credentials stop dispatch. Dispatch starts from a ticket on a managed tenancy.'}</>} />
      <DispatchPolicyCard providers={policyProviders} zh={zh} />
      <div className="mb-3 flex flex-wrap gap-2">
        <select value={trade} onChange={(e) => setTrade(e.target.value as Trade | 'all')} className="rounded-lg border border-line-divider bg-white px-2 py-1.5 text-[12.5px]"><option value="all">{zh ? '全部工种' : 'All trades'}</option>{TRADES.map((t) => <option key={t.key} value={t.key}>{zh ? t.zh : t.en}</option>)}</select>
        <select value={city} onChange={(e) => setCity(e.target.value)} className="rounded-lg border border-line-divider bg-white px-2 py-1.5 text-[12.5px]"><option value="all">{zh ? '全部城市' : 'All cities'}</option>{CITIES.map((c) => <option key={c} value={c}>{c}</option>)}</select>
      </div>
      <SectionCard className="mb-4" title={zh ? '精选网络 · 已核验' : 'Curated network · verified'} meta={`${rows.length}`}>
        {rows.length === 0 ? <p className="text-[13px] text-body-3">{zh ? '这个工种 / 城市还没有已核验的服务商。你仍可以在工单上派给自己的联系人。' : 'No verified provider for this trade / city yet. You can still dispatch to your own contact from a ticket.'}</p> : (
          <div className="divide-y divide-line-divider">
            {rows.map(({ p, cov, avg, n, metrics }) => (
              <div key={p.id} className="py-3 text-[13px]">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold">{p.trade_name || p.legal_name}</span>
                  <StatusPill tone="ok">{zh ? '资质已核' : 'verified'}{p.verified_at ? ` · ${p.verified_at.slice(0, 10)}` : ''}</StatusPill>
                  {avg != null && <span className="text-[12px] text-body-2">★ {avg} ({n})</span>}
                  {metrics.offered > 0 && <span className="text-[11.5px] text-body-3">{zh ? `你派过 ${metrics.offered} 次 · 接单率 ${metrics.acceptRate == null ? '—' : Math.round(metrics.acceptRate * 100) + '%'}` : `${metrics.offered} dispatched · accept ${metrics.acceptRate == null ? '—' : Math.round(metrics.acceptRate * 100) + '%'}`}</span>}
                </div>
                <div className="mt-1 flex flex-wrap gap-1.5">{cov.map((c) => { const d = TRADES.find((x) => x.key === c.t); return <span key={c.t} className={'rounded-full px-2 py-[2px] text-[11px] ' + (c.ok ? 'bg-success/10 text-success' : 'bg-amber-50 text-amber-800')}>{d ? (zh ? d.zh : d.en) : c.t}{c.ok ? ' ✓' : (zh ? ' · 资质待补' : ' · credentials pending')}</span> })}</div>
                <div className="mt-1 text-[12px] text-body-3">{p.service_cities.join(' · ')} · {p.pricing_mode === 'fixed' ? (zh ? '固定报价' : 'fixed quotes') : `${p.hourly_rate != null ? `$${p.hourly_rate}/h` : (zh ? '按工时' : 'hourly')}${p.call_out_fee != null ? ` · ${zh ? '上门费' : 'call-out'} $${p.call_out_fee}` : ''}`}{p.contact_phone ? ` · ${p.contact_phone}` : ''}{p.website ? ` · ${p.website}` : ''}</div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
      <SectionCard title={zh ? '我自己的联系人' : 'My own contacts'} meta={`${contacts.length}`}>
        {contacts.length === 0 ? <p className="text-[13px] text-body-3">{zh ? '你派给自己联系人的工单会记在这里。' : 'Contacts you dispatch to appear here.'}</p> : (
          <div className="divide-y divide-line-divider text-[13px]">
            {contacts.map(([email, c]) => <div key={email} className="flex flex-wrap items-center gap-2 py-2"><span className="font-semibold">{c.name || email}</span><span className="text-body-3">{email}</span><span className="ml-auto text-[11.5px] text-body-3">{zh ? `${c.jobs} 张工单 · 最近 ${c.last.slice(0, 10)}` : `${c.jobs} jobs · last ${c.last.slice(0, 10)}`}</span></div>)}
          </div>
        )}
      </SectionCard>
      <p className="mt-4 text-[11.5px] text-body-3">{zh ? '派单入口在每份在管租约的「报修」标签，或' : 'Dispatch from the Maintenance tab of a managed tenancy, or '}<Link href="/landlord/maintenance" className="underline">{zh ? '维修工单看板' : 'the maintenance board'}</Link>{zh ? '。Stayloop 不经手资金：付款由你与服务商直接完成，账单不得超出批准报价 10%。' : '. Stayloop moves no money: you pay the provider directly; invoices stay within 10% of the approved quote.'}</p>
    </WorkspaceShell>
  )
}
