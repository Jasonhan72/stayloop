'use client'

// /provider/onboard — a contractor submits their business and credentials
// for manual verification (services marketplace §5). Same trust model as
// /agent/verify: we collect what public registers already show (STO C of Q,
// ESA contractor licence, TSSA gas cert, WSIB clearance number, business
// registration, insurance certificate) and a Stayloop admin checks them by
// hand. The guard trigger keeps status out of self-service reach.
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/useAuth'
import { useT } from '@/lib/i18n'
import { invalidateHats } from '@/lib/useHats'
import { CITIES, CREDENTIAL_LABEL, TRADES, coverageFor, type CredentialKind, type Trade } from '@/lib/marketplace/trades'

type Provider = { id: string; legal_name: string; trade_name: string | null; business_number: string | null; service_cities: string[]; trades: string[]; pricing_mode: string; call_out_fee: number | null; hourly_rate: number | null; contact_name: string | null; contact_email: string | null; contact_phone: string | null; website: string | null; status: string; review_note: string | null; verified_at: string | null; attested_at: string | null }
type Cred = { id: string; kind: CredentialKind; number: string | null; holder_name: string | null; expires_at: string | null; verified_at: string | null }

const STATUS_LABEL: Record<string, { zh: string; en: string }> = { pending: { zh: '待核验', en: 'pending verification' }, verified: { zh: '已核验', en: 'verified' }, rejected: { zh: '未通过', en: 'rejected' }, suspended: { zh: '已暂停', en: 'suspended' }, expired: { zh: '已过期', en: 'expired' } }

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-screen flex-col bg-surface"><Header /><main className="mx-auto w-full max-w-[760px] flex-1 px-5 py-8">{children}</main><Footer /></div>
}

export default function ProviderOnboardPage() {
  const auth = useAuth()
  const { lang } = useT()
  const zh = lang === 'zh'
  const [row, setRow] = useState<Provider | null | 'loading'>('loading')
  const [creds, setCreds] = useState<Cred[]>([])
  const [f, setF] = useState({ legal_name: '', trade_name: '', business_number: '', service_cities: [] as string[], trades: [] as string[], pricing_mode: 'hourly', call_out_fee: '', hourly_rate: '', contact_name: '', contact_email: '', contact_phone: '', website: '', attest: false })
  const [cf, setCf] = useState({ kind: 'business_registration' as CredentialKind, number: '', holder_name: '', expires_at: '' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const load = useCallback(async () => {
    if (!auth.user) { setRow(null); return }
    const { data } = await supabase.from('service_providers').select('*').eq('auth_id', auth.user.id).maybeSingle()
    const r = (data as Provider | null) ?? null
    setRow(r)
    if (r) {
      setF({ legal_name: r.legal_name, trade_name: r.trade_name || '', business_number: r.business_number || '', service_cities: r.service_cities || [], trades: r.trades || [], pricing_mode: r.pricing_mode, call_out_fee: r.call_out_fee != null ? String(r.call_out_fee) : '', hourly_rate: r.hourly_rate != null ? String(r.hourly_rate) : '', contact_name: r.contact_name || '', contact_email: r.contact_email || auth.user.email || '', contact_phone: r.contact_phone || '', website: r.website || '', attest: !!r.attested_at })
      const { data: c } = await supabase.from('provider_credentials').select('id, kind, number, holder_name, expires_at, verified_at').eq('provider_id', r.id).order('created_at')
      setCreds((c ?? []) as Cred[])
    } else setF((x) => ({ ...x, contact_email: auth.user?.email || '' }))
  }, [auth.user])
  useEffect(() => { if (!auth.loading) void load() }, [auth.loading, load])

  async function submit() {
    setErr(null); setSaved(false)
    if (!auth.user) return
    if (f.legal_name.trim().length < 2) return setErr(zh ? '请填写注册的法定名称。' : 'Enter the registered legal name.')
    if (!f.trades.length) return setErr(zh ? '至少选一个工种。' : 'Pick at least one trade.')
    if (!f.service_cities.length) return setErr(zh ? '至少选一个服务城市。' : 'Pick at least one city.')
    if (!f.attest) return setErr(zh ? '请勾选承诺。' : 'Please tick the attestation.')
    setBusy(true)
    const payload = { auth_id: auth.user.id, legal_name: f.legal_name.trim(), trade_name: f.trade_name.trim() || null, business_number: f.business_number.trim() || null, service_cities: f.service_cities, trades: f.trades, pricing_mode: f.pricing_mode, call_out_fee: f.call_out_fee === '' ? null : Number(f.call_out_fee), hourly_rate: f.hourly_rate === '' ? null : Number(f.hourly_rate), contact_name: f.contact_name.trim() || null, contact_email: f.contact_email.trim() || null, contact_phone: f.contact_phone.trim() || null, website: f.website.trim() || null, attested_at: new Date().toISOString() }
    const { error } = row && row !== 'loading' ? await supabase.from('service_providers').update(payload).eq('auth_id', auth.user.id) : await supabase.from('service_providers').insert(payload)
    if (error) setErr(error.message)
    else { invalidateHats(); setSaved(true); await load() }
    setBusy(false)
  }
  async function addCred() {
    if (!row || row === 'loading') return
    setBusy(true); setErr(null)
    const { error } = await supabase.from('provider_credentials').insert({ provider_id: row.id, kind: cf.kind, number: cf.number.trim() || null, holder_name: cf.holder_name.trim() || null, expires_at: cf.expires_at || null })
    if (error) setErr(error.message); else { setCf({ kind: 'business_registration', number: '', holder_name: '', expires_at: '' }); await load() }
    setBusy(false)
  }
  async function delCred(id: string) { if (!window.confirm(zh ? '删除这条资质？已核验的记录也会一起删除。' : 'Remove this credential? Its verification goes with it.')) return; await supabase.from('provider_credentials').delete().eq('id', id); await load() }

  const input = 'w-full rounded-lg border border-line-divider bg-white px-3 py-2 text-[14px]'
  const label = 'block text-[12.5px] font-semibold text-body-2'
  const toggle = (arr: string[], v: string) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v])

  if (auth.loading || row === 'loading') return <Shell><div className="text-body-3">…</div></Shell>
  if (!auth.user) return <Shell><div className="rounded-2xl border border-line-divider bg-white p-6 text-[14px]">{zh ? '请先登录再入驻。' : 'Sign in to onboard.'} <Link href="/login?next=/provider/onboard" className="underline">{zh ? '登录' : 'Sign in'}</Link></div></Shell>

  return (
    <Shell>
      <div className="font-mono text-[11px] font-bold uppercase tracking-eyebrowLg text-body-3">{zh ? '服务商入驻' : 'Provider onboarding'}</div>
      <h1 className="mt-1 text-[24px] font-extrabold tracking-tight">{zh ? '加入 Stayloop 精选维修网络' : 'Join the Stayloop curated repair network'}</h1>
      <p className="mt-2 text-[13.5px] leading-relaxed text-body-2">{zh ? '我们只收集公开注册库上能查到的资质编号与到期日，由 Stayloop 工作人员人工对照后核验；资质到期会自动停派单。不收取入驻费，工单由房东直接付款，Stayloop 不经手资金。' : 'We collect only credential numbers and expiry dates that public registers show; a Stayloop staff member checks them by hand, and expired credentials stop dispatch automatically. No onboarding fee; landlords pay you directly — no money moves through Stayloop.'}</p>

      {row && (
        <div className="mt-5 rounded-2xl border border-line-divider bg-white p-4 text-[13px]">
          <b>{zh ? '当前状态' : 'Status'}:</b> {zh ? STATUS_LABEL[row.status]?.zh ?? row.status : STATUS_LABEL[row.status]?.en ?? row.status}{row.verified_at ? ` · ${zh ? '核于' : 'verified'} ${row.verified_at.slice(0, 10)}` : ''}
          {row.review_note && row.status !== 'verified' && <div className="mt-1 text-danger">{row.review_note}</div>}
          {row.status === 'verified' && <div className="mt-1"><Link href="/provider/jobs" className="font-bold text-brand underline underline-offset-2">{zh ? '去看工单 →' : 'Go to jobs →'}</Link></div>}
        </div>
      )}

      <div className="mt-5 grid gap-4 rounded-2xl border border-line-divider bg-white p-5 sm:grid-cols-2">
        <label className={label}>{zh ? '法定名称（注册名）' : 'Legal name (as registered)'}<input className={input} value={f.legal_name} onChange={(e) => setF({ ...f, legal_name: e.target.value })} /></label>
        <label className={label}>{zh ? '商号（对房东显示）' : 'Trade name (shown to landlords)'}<input className={input} value={f.trade_name} onChange={(e) => setF({ ...f, trade_name: e.target.value })} /></label>
        <label className={label}>{zh ? '企业注册号 / BN' : 'Business number / BN'}<input className={input} value={f.business_number} onChange={(e) => setF({ ...f, business_number: e.target.value })} /></label>
        <label className={label}>{zh ? '网站（可选）' : 'Website (optional)'}<input className={input} value={f.website} onChange={(e) => setF({ ...f, website: e.target.value })} /></label>
        <div className="sm:col-span-2"><div className={label}>{zh ? '工种' : 'Trades'}</div><div className="mt-1 flex flex-wrap gap-1.5">{TRADES.map((t) => <button key={t.key} type="button" onClick={() => setF({ ...f, trades: toggle(f.trades, t.key) })} className={'rounded-full border px-3 py-1 text-[12.5px] ' + (f.trades.includes(t.key) ? 'border-brand bg-brand/10 font-bold text-brand' : 'border-line-divider')}>{zh ? t.zh : t.en}</button>)}</div></div>
        <div className="sm:col-span-2"><div className={label}>{zh ? '服务城市' : 'Service cities'}</div><div className="mt-1 flex flex-wrap gap-1.5">{CITIES.map((c) => <button key={c} type="button" onClick={() => setF({ ...f, service_cities: toggle(f.service_cities, c) })} className={'rounded-full border px-3 py-1 text-[12.5px] ' + (f.service_cities.includes(c) ? 'border-brand bg-brand/10 font-bold text-brand' : 'border-line-divider')}>{c}</button>)}</div></div>
        <label className={label}>{zh ? '定价方式' : 'Pricing'}<select className={input} value={f.pricing_mode} onChange={(e) => setF({ ...f, pricing_mode: e.target.value })}><option value="hourly">{zh ? '按工时' : 'Hourly'}</option><option value="fixed">{zh ? '固定报价' : 'Fixed quotes'}</option></select></label>
        <div className="grid grid-cols-2 gap-2">
          <label className={label}>{zh ? '时薪 $' : 'Hourly $'}<input className={input} inputMode="decimal" value={f.hourly_rate} onChange={(e) => setF({ ...f, hourly_rate: e.target.value })} /></label>
          <label className={label}>{zh ? '上门费 $' : 'Call-out $'}<input className={input} inputMode="decimal" value={f.call_out_fee} onChange={(e) => setF({ ...f, call_out_fee: e.target.value })} /></label>
        </div>
        <label className={label}>{zh ? '联系人' : 'Contact name'}<input className={input} value={f.contact_name} onChange={(e) => setF({ ...f, contact_name: e.target.value })} /></label>
        <label className={label}>{zh ? '接单邮箱' : 'Dispatch email'}<input className={input} type="email" value={f.contact_email} onChange={(e) => setF({ ...f, contact_email: e.target.value })} /></label>
        <label className={label}>{zh ? '电话' : 'Phone'}<input className={input} type="tel" value={f.contact_phone} onChange={(e) => setF({ ...f, contact_phone: e.target.value })} /></label>
        <label className="flex items-start gap-2 text-[13px] sm:col-span-2"><input type="checkbox" className="mt-[3px]" checked={f.attest} onChange={(e) => setF({ ...f, attest: e.target.checked })} /><span>{zh ? '我确认以上信息属实；持证工种的工作只由持有效资格证的人员完成；接受工单即与房东直接订立服务合同；账单不超出经批准报价的 10%（安省《消费者保护法》）；资质变更或到期后 7 天内更新。' : 'I confirm the above is true; licensed-trade work is done only by holders of a valid certificate; accepting a job forms a direct contract with the landlord; invoices stay within 10% of the approved quote (Ontario CPA); I update within 7 days of any credential change or expiry.'}</span></label>
        {err && <div className="text-[12.5px] font-semibold text-danger sm:col-span-2">⚠ {err}</div>}
        {saved && !err && <div className="text-[12.5px] font-semibold text-success sm:col-span-2">✓ {zh ? '已保存。下一步：添加资质。' : 'Saved. Next: add credentials.'}</div>}
        <div className="sm:col-span-2"><button onClick={() => void submit()} disabled={busy} className="sl-btn-primary !py-[10px] disabled:opacity-50">{row ? (zh ? '更新（改注册事实会重新核验）' : 'Update (changing facts re-verifies)') : (zh ? '提交入驻' : 'Submit')}</button></div>
      </div>

      {row && (
        <div className="mt-5 rounded-2xl border border-line-divider bg-white p-5">
          <h2 className="text-[15px] font-extrabold">{zh ? '资质' : 'Credentials'}</h2>
          <p className="mt-1 text-[12px] text-body-3">{zh ? '每个工种要求的资质：' : 'Required per trade: '}{f.trades.map((t) => { const d = TRADES.find((x) => x.key === t); const cov = coverageFor(t as Trade, creds); return d ? `${zh ? d.zh : d.en}（${cov.ok ? '✓' : [...cov.missing, ...cov.expired, ...cov.unverified].map((k) => (zh ? CREDENTIAL_LABEL[k].zh : CREDENTIAL_LABEL[k].en)).join(zh ? '、' : ', ')}）` : '' }).join(' · ')}</p>
          <div className="mt-3 divide-y divide-line-divider">
            {creds.map((c) => (
              <div key={c.id} className="flex flex-wrap items-center gap-2 py-2 text-[12.5px]">
                <span className="font-semibold">{zh ? CREDENTIAL_LABEL[c.kind].zh : CREDENTIAL_LABEL[c.kind].en}</span>
                <span className="font-mono text-body-2">{c.number || '—'}</span>
                {c.holder_name && <span className="text-body-3">{c.holder_name}</span>}
                <span className="text-body-3">{c.expires_at ? `${zh ? '到期' : 'exp'} ${c.expires_at}` : (zh ? '无到期' : 'no expiry')}</span>
                <span className={'ml-auto rounded-full px-2 py-[2px] font-mono text-[10.5px] font-bold ' + (c.verified_at ? 'bg-success/10 text-success' : 'bg-amber-50 text-amber-800')}>{c.verified_at ? (zh ? '已核' : 'verified') : (zh ? '待核' : 'pending')}</span>
                <button onClick={() => void delCred(c.id)} className="min-h-[36px] px-2 text-[11px] text-body-3 underline">{zh ? '删除' : 'remove'}</button>
              </div>
            ))}
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-4">
            <select className={input} value={cf.kind} onChange={(e) => setCf({ ...cf, kind: e.target.value as CredentialKind })}>{(Object.keys(CREDENTIAL_LABEL) as CredentialKind[]).map((k) => <option key={k} value={k}>{zh ? CREDENTIAL_LABEL[k].zh : CREDENTIAL_LABEL[k].en}</option>)}</select>
            <input className={input} placeholder={zh ? '编号' : 'Number'} value={cf.number} onChange={(e) => setCf({ ...cf, number: e.target.value })} />
            <input className={input} placeholder={zh ? '持证人（如与公司不同）' : 'Holder (if a person)'} value={cf.holder_name} onChange={(e) => setCf({ ...cf, holder_name: e.target.value })} />
            <input className={input} type="date" value={cf.expires_at} onChange={(e) => setCf({ ...cf, expires_at: e.target.value })} />
            <div className="sm:col-span-4"><button onClick={() => void addCred()} disabled={busy} className="rounded-full border border-brand px-4 py-1.5 text-[12.5px] font-bold text-brand disabled:opacity-50">{zh ? '+ 添加资质' : '+ Add credential'}</button>{CREDENTIAL_LABEL[cf.kind].url && <a className="ml-3 text-[11.5px] text-body-3 underline" href={CREDENTIAL_LABEL[cf.kind].url} target="_blank" rel="noopener noreferrer">{CREDENTIAL_LABEL[cf.kind].register} ↗</a>}</div>
          </div>
        </div>
      )}
      <p className="mt-4 text-[11.5px] leading-relaxed text-body-3">{zh ? '核验只表示核验日你的资质在相应公开注册库上有效；Stayloop 不是承包商，不参与施工，不收取佣金。' : 'Verification only means your credentials were valid on the public registers on the date checked; Stayloop is not a contractor and takes no commission.'}</p>
    </Shell>
  )
}
