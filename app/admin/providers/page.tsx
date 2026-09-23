'use client'

// Stayloop back-office · service-provider verification queue (services
// marketplace §5). Mirrors /admin/agents: the admin opens the public
// register for each credential, compares number / holder / expiry, then
// stamps the credential and the provider. Disputed work orders live here too.
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import Header from '@/components/Header'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/useAuth'
import { useT } from '@/lib/i18n'
import { CREDENTIAL_LABEL, TRADES, coverageFor, earliestExpiry, type CredentialKind, type Trade } from '@/lib/marketplace/trades'
import { actOn } from '@/components/marketplace/WorkOrderCard'

type Provider = { id: string; auth_id: string; legal_name: string; trade_name: string | null; business_number: string | null; service_cities: string[]; trades: string[]; contact_email: string | null; contact_phone: string | null; website: string | null; status: string; review_note: string | null; verified_at: string | null; updated_at: string; created_at: string }
type Cred = { id: string; provider_id: string; kind: CredentialKind; number: string | null; holder_name: string | null; expires_at: string | null; verified_at: string | null; note: string | null }
type Dispute = { id: string; ticket_id: string; dispute_reason: string | null; disputed_at: string | null; landlord_auth_id: string; provider_id: string | null; external_email: string | null; invoice_amount: number | null; approved_amount: number | null }

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-surface"><Header /><main className="mx-auto max-w-[1100px] px-5 py-8">{children}</main></div>
}

export default function AdminProvidersPage() {
  const { lang } = useT()
  const zh = lang === 'zh'
  const auth = useAuth()
  const [adminRole, setAdminRole] = useState<string | null | 'loading'>('loading')
  const [rows, setRows] = useState<Provider[]>([])
  const [creds, setCreds] = useState<Cred[]>([])
  const [disputes, setDisputes] = useState<Dispute[]>([])
  const [tab, setTab] = useState<'pending' | 'all' | 'disputes'>('pending')
  const [busy, setBusy] = useState<string | null>(null)
  const [notes, setNotes] = useState<Record<string, string>>({})

  useEffect(() => {
    if (auth.loading) return
    if (!auth.user) { setAdminRole(null); return }
    let cancelled = false
    supabase.from('admin_users').select('role').eq('user_id', auth.user.id).maybeSingle().then(({ data }) => { if (!cancelled) setAdminRole(data?.role ?? null) })
    return () => { cancelled = true }
  }, [auth.loading, auth.user])
  const load = useCallback(async () => {
    let q = supabase.from('service_providers').select('*').order('created_at', { ascending: false }).limit(200)
    if (tab === 'pending') q = q.eq('status', 'pending')
    const { data } = await q
    const list = (data ?? []) as Provider[]
    setRows(list)
    const ids = list.map((p) => p.id)
    const { data: c } = ids.length ? await supabase.from('provider_credentials').select('*').in('provider_id', ids) : { data: [] }
    setCreds((c ?? []) as Cred[])
    const { data: d } = await supabase.from('work_orders').select('id, ticket_id, dispute_reason, disputed_at, landlord_auth_id, provider_id, external_email, invoice_amount, approved_amount').eq('status', 'disputed').order('disputed_at', { ascending: false }).limit(50)
    setDisputes((d ?? []) as Dispute[])
  }, [tab])
  useEffect(() => { if (adminRole && adminRole !== 'loading') void load() }, [adminRole, load])

  async function decide(p: Provider, status: 'verified' | 'rejected' | 'suspended' | 'expired') {
    if (!auth.user) return
    setBusy(p.id)
    const note = (notes[p.id] || '').trim() || null
    const { data: hit, error } = await supabase.from('service_providers').update({ status, review_note: note, verified_at: status === 'verified' ? new Date().toISOString() : null, verified_by: status === 'verified' ? auth.user.id : null }).eq('id', p.id).eq('updated_at', p.updated_at).select('id')
    if (!error && !(hit ?? []).length) { alert(zh ? '该资料在你打开页面后被修改过，已重新加载。' : 'Changed since you loaded it — reloaded.'); await load(); setBusy(null); return }
    if (!error) await supabase.from('agent_audit_events').insert({ actor_id: auth.user.id, actor_type: 'user', action: `provider_${status}`, target_type: 'service_provider', target_id: p.id, metadata: { note, role: 'admin' } })
    await load(); setBusy(null)
  }
  async function stampCred(c: Cred, ok: boolean) {
    if (!auth.user) return
    setBusy(c.id)
    await supabase.from('provider_credentials').update({ verified_at: ok ? new Date().toISOString() : null, verified_by: ok ? auth.user.id : null }).eq('id', c.id)
    await load(); setBusy(null)
  }
  async function resolve(d: Dispute) {
    const note = (notes[d.id] || '').trim()
    if (!note) return
    setBusy(d.id)
    const r = await actOn(d.id, 'resolve_dispute', { note })
    if (!r.ok) alert(r.error)
    await load(); setBusy(null)
  }

  if (auth.loading || adminRole === 'loading') return <Shell><div className="text-body-3">…</div></Shell>
  if (!auth.user || !adminRole) return <Shell><div className="rounded-xl border border-line-divider bg-white p-6 text-[14px]">{zh ? '仅限后台管理员。' : 'Admins only.'} <Link href="/admin" className="underline">{zh ? '返回后台' : 'Back'}</Link></div></Shell>

  return (
    <Shell>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="font-mono text-[11px] font-bold uppercase tracking-eyebrowLg text-body-3">Stayloop admin</div>
          <h1 className="mt-1 text-[24px] font-extrabold tracking-tight">{zh ? '服务商核验队列' : 'Provider verification queue'}</h1>
          <p className="mt-1 text-[13px] text-body-2">{zh ? '逐条打开公开注册库核对编号 / 持证人 / 到期日，先盖资质章，再核验服务商。到期资质会自动停派单。' : 'Open each public register, compare number / holder / expiry, stamp the credential, then verify the provider. Expired credentials stop dispatch automatically.'}</p>
        </div>
        <div className="flex gap-2">
          {(['pending', 'all', 'disputes'] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className="rounded-full border px-3 py-1.5 text-[12.5px] font-bold" style={tab === t ? { background: '#1B1B3C', color: '#fff', borderColor: '#1B1B3C' } : { background: '#fff', borderColor: '#D3E3EF' }}>
              {t === 'pending' ? (zh ? '待核验' : 'Pending') : t === 'all' ? (zh ? '全部' : 'All') : (zh ? `争议 ${disputes.length}` : `Disputes ${disputes.length}`)}
            </button>
          ))}
        </div>
      </div>

      {tab === 'disputes' ? (
        <div className="mt-5 space-y-3">
          {disputes.length === 0 && <div className="rounded-xl border border-line-divider bg-white p-6 text-[13px] text-body-3">{zh ? '没有争议单。' : 'No disputes.'}</div>}
          {disputes.map((d) => (
            <div key={d.id} className="rounded-2xl border border-line-divider bg-white p-4 text-[13px]">
              <div className="font-mono text-[11px] text-body-3">{d.id} · {d.disputed_at?.slice(0, 16)}</div>
              <div className="mt-1"><b>{zh ? '原因' : 'Reason'}:</b> {d.dispute_reason || '—'}</div>
              <div className="text-body-2">{zh ? '批准报价' : 'Approved'} {d.approved_amount ?? '—'} · {zh ? '账单' : 'invoice'} {d.invoice_amount ?? '—'} · {d.provider_id ? `provider ${d.provider_id.slice(0, 8)}` : d.external_email}</div>
              <div className="mt-2 flex flex-wrap gap-2">
                <input value={notes[d.id] ?? ''} onChange={(e) => setNotes({ ...notes, [d.id]: e.target.value })} placeholder={zh ? '裁定说明（双方可见）' : 'Resolution note (visible to both)'} className="min-w-[260px] flex-1 rounded-lg border border-line-divider px-3 py-2 text-[13px]" />
                <button disabled={busy === d.id || !(notes[d.id] || '').trim()} onClick={() => void resolve(d)} className="rounded-lg px-3 py-2 text-[12.5px] font-bold text-white disabled:opacity-50" style={{ background: '#047857' }}>{zh ? '裁定为已验收' : 'Resolve as accepted'}</button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-5 space-y-3">
          {rows.length === 0 && <div className="rounded-xl border border-line-divider bg-white p-6 text-[13px] text-body-3">{zh ? '没有记录。' : 'Nothing here.'}</div>}
          {rows.map((p) => {
            const pc = creds.filter((c) => c.provider_id === p.id)
            const exp = earliestExpiry(pc)
            return (
              <div key={p.id} className="rounded-2xl border border-line-divider bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[15px] font-bold">{p.trade_name || p.legal_name} {p.trade_name && <span className="text-[12px] font-normal text-body-3">({p.legal_name})</span>}{p.business_number && <span className="ml-2 font-mono text-[12px] text-body-3">#{p.business_number}</span>}</div>
                    <div className="text-[12.5px] text-body-2">{p.trades.map((t) => { const d = TRADES.find((x) => x.key === t); const cov = coverageFor(t as Trade, pc); return `${d ? (zh ? d.zh : d.en) : t}${cov.ok ? ' ✓' : ' ✗'}` }).join(' · ')} · {p.service_cities.join(', ')}</div>
                    <div className="text-[11.5px] text-body-3">{p.contact_email || '—'} · {p.contact_phone || '—'}{p.website ? ` · ${p.website}` : ''} · {zh ? '提交于' : 'submitted'} {p.created_at.slice(0, 10)}{exp ? ` · ${zh ? '最早到期' : 'earliest expiry'} ${(zh ? CREDENTIAL_LABEL[exp.kind as CredentialKind]?.zh : CREDENTIAL_LABEL[exp.kind as CredentialKind]?.en) ?? exp.kind} ${exp.days}d` : ''}</div>
                  </div>
                  <span className="rounded-full px-2 py-[2px] text-[11px] font-bold" style={p.status === 'verified' ? { background: '#E4EEE3', color: '#065F46' } : p.status === 'pending' ? { background: '#FEF3E2', color: '#B45309' } : { background: '#FEF2F2', color: '#B91C1C' }}>{p.status}</span>
                </div>
                <div className="mt-3 divide-y divide-line-divider rounded-xl border border-line-divider">
                  {pc.length === 0 && <div className="px-3 py-2 text-[12px] text-body-3">{zh ? '还没有资质记录。' : 'No credentials yet.'}</div>}
                  {pc.map((c) => (
                    <div key={c.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-[12.5px]">
                      <span className="font-semibold">{zh ? CREDENTIAL_LABEL[c.kind].zh : CREDENTIAL_LABEL[c.kind].en}</span>
                      <span className="font-mono">{c.number || '—'}</span>
                      {c.holder_name && <span className="text-body-3">{c.holder_name}</span>}
                      <span className="text-body-3">{c.expires_at ? `exp ${c.expires_at}` : 'no expiry'}</span>
                      {CREDENTIAL_LABEL[c.kind].url && <a className="text-[11.5px] underline" href={CREDENTIAL_LABEL[c.kind].url} target="_blank" rel="noopener noreferrer">{CREDENTIAL_LABEL[c.kind].register} ↗</a>}
                      <span className="ml-auto flex gap-1.5">
                        {c.verified_at ? <button disabled={busy === c.id} onClick={() => void stampCred(c, false)} className="rounded-md border border-line-divider px-2 py-1 text-[11px]">{zh ? '撤销 ✓' : 'Unstamp'}</button> : <button disabled={busy === c.id} onClick={() => void stampCred(c, true)} className="rounded-md px-2 py-1 text-[11px] font-bold text-white" style={{ background: '#047857' }}>{zh ? '对照无误 ✓' : 'Matches ✓'}</button>}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <input value={notes[p.id] ?? p.review_note ?? ''} onChange={(e) => setNotes({ ...notes, [p.id]: e.target.value })} placeholder={zh ? '核验备注' : 'Review note'} className="min-w-[220px] flex-1 rounded-lg border border-line-divider px-3 py-2 text-[13px]" />
                  <button disabled={busy === p.id} onClick={() => void decide(p, 'verified')} className="rounded-lg px-3 py-2 text-[12.5px] font-bold text-white" style={{ background: '#047857' }}>{zh ? '核验通过' : 'Verify'}</button>
                  <button disabled={busy === p.id} onClick={() => void decide(p, 'rejected')} className="rounded-lg border border-red-200 bg-white px-3 py-2 text-[12.5px] font-bold text-red-700">{zh ? '不通过' : 'Reject'}</button>
                  <button disabled={busy === p.id} onClick={() => void decide(p, 'suspended')} className="rounded-lg border border-line-divider bg-white px-3 py-2 text-[12.5px] text-body-3">{zh ? '暂停' : 'Suspend'}</button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </Shell>
  )
}
