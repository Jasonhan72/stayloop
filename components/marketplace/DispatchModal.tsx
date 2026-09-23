'use client'

// Step ③ "指派": the landlord picks a verified provider that covers the
// trade and city (credentials in date — computed client-side from the same
// pure rule the server uses) or types their own contact's email. Posts to
// /api/work-orders/dispatch which proves the landlord relation server-side.
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { coverageFor, providerEligible, tradeForCategory, TRADES, type Trade } from '@/lib/marketplace/trades'

type Provider = { id: string; legal_name: string; trade_name: string | null; trades: string[]; service_cities: string[]; pricing_mode: string; call_out_fee: number | null; hourly_rate: number | null; status: string; verified_at: string | null }
type Cred = { provider_id: string; kind: string; expires_at: string | null; verified_at: string | null }

export default function DispatchModal({ ticketId, category, priority, city, zh, onClose, onDone }: {
  ticketId: string
  category: string | null
  priority: string
  city: string | null
  zh: boolean
  onClose: () => void
  onDone: () => void | Promise<void>
}) {
  const [trade, setTrade] = useState<Trade>(tradeForCategory(category))
  const [providers, setProviders] = useState<Provider[]>([])
  const [creds, setCreds] = useState<Cred[]>([])
  const [mode, setMode] = useState<'network' | 'own'>('network')
  const [pick, setPick] = useState<string | null>(null)
  const [own, setOwn] = useState({ name: '', email: '' })
  const [entry, setEntry] = useState<'anytime' | 'call_first' | 'tenant_present'>('call_first')
  const [emergency, setEmergency] = useState(priority === 'high')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data: p } = await supabase.from('service_providers').select('id, legal_name, trade_name, trades, service_cities, pricing_mode, call_out_fee, hourly_rate, status, verified_at').eq('status', 'verified').limit(100)
      const list = (p ?? []) as Provider[]
      const ids = list.map((x) => x.id)
      const { data: c } = ids.length ? await supabase.from('provider_credentials').select('provider_id, kind, expires_at, verified_at').in('provider_id', ids) : { data: [] }
      if (!cancelled) { setProviders(list); setCreds((c ?? []) as Cred[]); setLoaded(true) }
    })()
    return () => { cancelled = true }
  }, [])
  const candidates = useMemo(() => providers.map((p) => {
    const pc = creds.filter((c) => c.provider_id === p.id)
    const e = providerEligible(p, pc, trade, city)
    const cov = coverageFor(trade, pc)
    return { p, ok: e.ok, reason: e.reason, cov }
  }).sort((a, b) => Number(b.ok) - Number(a.ok)), [providers, creds, trade, city])
  useEffect(() => { if (!pick && candidates.some((c) => c.ok)) setPick(candidates.find((c) => c.ok)!.p.id) }, [candidates, pick])
  // Only fall back to "own contact" once the directory has actually loaded —
  // on first paint there are no candidates yet (first production run 2026-09-23
  // opened the modal on the wrong tab).
  useEffect(() => { if (loaded && !candidates.some((c) => c.ok)) setMode('own') }, [loaded, candidates])

  async function submit() {
    setBusy(true); setErr(null)
    const { data: s } = await supabase.auth.getSession()
    const token = s.session?.access_token
    const body = mode === 'network' ? { ticket_id: ticketId, provider_id: pick, entry_permission: entry, emergency, trade } : { ticket_id: ticketId, external_email: own.email.trim(), external_name: own.name.trim(), entry_permission: entry, emergency, trade }
    const res = await fetch('/api/work-orders/dispatch', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) })
    const j = (await res.json().catch(() => ({}))) as { error?: string }
    if (!res.ok) { setErr(j.error || `HTTP ${res.status}`); setBusy(false); return }
    await onDone(); setBusy(false); onClose()
  }
  const input = 'rounded-md border border-line-divider bg-white px-2.5 py-1.5 text-[13px]'
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center" role="dialog" aria-modal="true">
      <div className="max-h-[90dvh] w-full max-w-[560px] overflow-y-auto rounded-2xl bg-white p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-body-3">{zh ? '派单' : 'DISPATCH'}</div>
            <h3 className="text-[16px] font-extrabold">{zh ? '把这张工单派给谁？' : 'Who takes this job?'}</h3>
          </div>
          <button onClick={onClose} className="h-9 w-9 rounded-full border border-line-divider text-[16px]" aria-label="close">×</button>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <label className="text-[11.5px] text-body-3">{zh ? '工种' : 'Trade'}<select className={input + ' mt-1 w-full'} value={trade} onChange={(e) => { setTrade(e.target.value as Trade); setPick(null) }}>{TRADES.map((t) => <option key={t.key} value={t.key}>{zh ? t.zh : t.en}</option>)}</select></label>
          <label className="text-[11.5px] text-body-3">{zh ? '进入方式（RTA s.27）' : 'Entry (RTA s.27)'}<select className={input + ' mt-1 w-full'} value={entry} onChange={(e) => setEntry(e.target.value as typeof entry)}><option value="call_first">{zh ? '进入前先电话' : 'Call first'}</option><option value="anytime">{zh ? '按 24 小时通知进入' : 'Per 24h notice'}</option><option value="tenant_present">{zh ? '须租客在场' : 'Tenant present'}</option></select></label>
          <label className="flex items-center gap-2 text-[12.5px] sm:col-span-2"><input type="checkbox" checked={emergency} onChange={(e) => setEmergency(e.target.checked)} />{zh ? '紧急件（无暖气 / 停水 / 燃气 / 淹水 / 门锁）— 进入按 RTA s.26 可不提前通知' : 'Emergency (no heat / water / gas / flooding / locks) — entry without notice under RTA s.26'}</label>
        </div>
        <div className="mt-4 flex gap-2">
          <button className={'rounded-full px-3 py-1.5 text-[12.5px] font-bold ' + (mode === 'network' ? 'bg-brand text-white' : 'border border-line-strong')} onClick={() => setMode('network')}>{zh ? '精选网络' : 'Curated network'}</button>
          <button className={'rounded-full px-3 py-1.5 text-[12.5px] font-bold ' + (mode === 'own' ? 'bg-brand text-white' : 'border border-line-strong')} onClick={() => setMode('own')}>{zh ? '我自己的联系人' : 'My own contact'}</button>
        </div>
        {mode === 'network' ? (
          <div className="mt-3 space-y-2">
            {candidates.length === 0 && <p className="text-[12.5px] text-body-3">{zh ? '还没有已核验的服务商。先派给你自己的联系人。' : 'No verified providers yet — dispatch to your own contact.'}</p>}
            {candidates.map(({ p, ok, reason, cov }) => (
              <label key={p.id} className={'flex items-start gap-3 rounded-xl border p-3 text-[12.5px] ' + (ok ? 'border-line-divider' : 'border-line-divider opacity-60')}>
                <input type="radio" name="prov" disabled={!ok} checked={pick === p.id} onChange={() => setPick(p.id)} className="mt-1" />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">{p.trade_name || p.legal_name} <span className="font-mono text-[10px] text-success">{zh ? '资质已核' : 'verified'}</span></div>
                  <div className="text-[11.5px] text-body-3">{p.service_cities.join(' · ') || '—'} · {p.pricing_mode === 'fixed' ? (zh ? '固定报价' : 'fixed quotes') : `${p.hourly_rate != null ? `$${p.hourly_rate}/h` : (zh ? '按工时' : 'hourly')}${p.call_out_fee != null ? ` · ${zh ? '上门费' : 'call-out'} $${p.call_out_fee}` : ''}`}</div>
                  {!ok && <div className="text-[11.5px] text-danger">{reason === 'city' ? (zh ? '不服务该城市' : 'does not serve this city') : reason === 'trade_not_listed' ? (zh ? '未登记该工种' : 'trade not listed') : reason === 'credentials' ? (zh ? `资质缺 / 过期：${[...cov.missing, ...cov.expired, ...cov.unverified].join(', ')}` : `credentials missing / expired: ${[...cov.missing, ...cov.expired, ...cov.unverified].join(', ')}`) : reason}</div>}
                </div>
              </label>
            ))}
          </div>
        ) : (
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <input className={input} placeholder={zh ? '姓名 / 公司' : 'Name / company'} value={own.name} onChange={(e) => setOwn({ ...own, name: e.target.value })} />
            <input className={input} type="email" placeholder="Email" value={own.email} onChange={(e) => setOwn({ ...own, email: e.target.value })} />
            <p className="text-[11.5px] text-body-3 sm:col-span-2">{zh ? '对方会收到一封带链接的邮件，不需要注册：接单并报价 → 到场 → 完工。资质由你自己把关（电气须 ESA 持牌承包商，燃气须 TSSA）。' : 'They get an emailed link, no account needed: accept with a quote → arrive → complete. You vouch for their credentials (electrical needs an ESA licensed contractor, gas needs TSSA).'}</p>
          </div>
        )}
        {err && <p className="mt-2 text-[12px] text-danger">{err}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-full border border-line-strong px-4 py-2 text-[12.5px] font-bold">{zh ? '取消' : 'Cancel'}</button>
          <button disabled={busy || (mode === 'network' ? !pick : !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(own.email))} onClick={() => void submit()} className="rounded-full bg-brand px-4 py-2 text-[12.5px] font-bold text-white disabled:opacity-50">{busy ? '…' : (zh ? '发出派单' : 'Send the work order')}</button>
        </div>
      </div>
    </div>
  )
}
