'use client'

// /providers/professional — the professional-services directory (2026-10-27,
// report review batch 2 §8): licensed paralegals, lawyers, insurance brokers and
// listing photographers Stayloop has verified by hand against the public
// registers (LSO, RIBO). Shown to any signed-in hat (tenants need insurance
// brokers, landlords need paralegals); the person contacts and contracts with
// the provider directly. Stayloop dispatches nothing, takes no commission,
// gives no legal advice and sells no insurance.
import { useEffect, useState } from 'react'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/useAuth'
import { useT } from '@/lib/i18n'
import { CREDENTIAL_LABEL, coverageFor, isProfessionalTrade, PROFESSIONAL_TRADES, TRADES, type CredentialKind, type Trade } from '@/lib/marketplace/trades'

type Provider = { id: string; legal_name: string; trade_name: string | null; trades: string[]; service_cities: string[]; contact_email: string | null; contact_phone: string | null; website: string | null; verified_at: string | null }
type Cred = { provider_id: string; kind: string; expires_at: string | null; verified_at: string | null }

export default function ProfessionalDirectoryPage() {
  const { lang } = useT()
  const zh = lang === 'zh'
  const auth = useAuth()
  const [providers, setProviders] = useState<Provider[] | null>(null)
  const [creds, setCreds] = useState<Cred[]>([])
  const [trade, setTrade] = useState<Trade | 'all'>('all')

  useEffect(() => {
    const t = new URL(window.location.href).searchParams.get('trade')
    if (isProfessionalTrade(t)) setTrade(t)
  }, [])
  useEffect(() => {
    if (auth.loading || !auth.user) return
    let on = true
    void (async () => {
      const { data } = await supabase.from('provider_directory').select('id, legal_name, trade_name, trades, service_cities, contact_email, contact_phone, website, verified_at').overlaps('trades', [...PROFESSIONAL_TRADES]).limit(200)
      const list = (data ?? []) as Provider[]
      const ids = list.map((p) => p.id)
      const { data: c } = ids.length ? await supabase.from('provider_credentials_public').select('provider_id, kind, expires_at, verified_at').in('provider_id', ids) : { data: [] }
      if (!on) return
      setProviders(list)
      setCreds((c ?? []) as Cred[])
    })()
    return () => { on = false }
  }, [auth.loading, auth.user])

  const shown = (providers ?? []).filter((p) => trade === 'all' || p.trades.includes(trade))
  const byTrade = PROFESSIONAL_TRADES.filter((t) => trade === 'all' || t === trade).map((t) => ({ t, def: TRADES.find((x) => x.key === t)!, list: shown.filter((p) => p.trades.includes(t)) }))

  return (
    <div style={{ background: '#FFFFFF' }} className="text-body">
      <Header variant="transparent" />
      <section style={{ background: 'linear-gradient(180deg,#E9F5FD 0%,#FFFFFF 100%)' }}>
        <div className="mx-auto max-w-[1100px] px-5 py-14 sm:px-7 lg:py-16">
          <div className="font-mono text-[13px] font-semibold uppercase tracking-[.12em] text-brand">{zh ? 'PROFESSIONAL SERVICES · 专业服务' : 'PROFESSIONAL SERVICES'}</div>
          <h1 className="sl-type-head mt-4 max-w-[820px] text-[clamp(26px,3.2vw,38px)] font-semibold leading-[1.1] tracking-[-0.03em]">{zh ? '持牌的人，牌照核过，你直接联系。' : 'Licensed people, licences checked, you contact them directly.'}</h1>
          <p className="mt-4 max-w-[720px] text-[16px] leading-[1.6] text-body-2">
            {zh ? '持牌 Paralegal（LTB 代理）、律师、保险经纪、房源摄影。Stayloop 工作人员对照 LSO、RIBO 公开名册人工核过牌照号；你和对方直接联系、直接签约。Stayloop 不派单、不收佣金、不给法律意见、不卖保险。' : 'Licensed paralegals (LTB representation), lawyers, insurance brokers, listing photographers. Stayloop staff check each licence number by hand against the LSO and RIBO public registers; you contact and contract with them directly. Stayloop dispatches nothing, takes no commission, gives no legal advice and sells no insurance.'}
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <button type="button" onClick={() => setTrade('all')} aria-pressed={trade === 'all'} className={`rounded-full border px-4 py-1.5 text-[13px] font-semibold ${trade === 'all' ? 'border-brand bg-white text-brand' : 'border-line-divider bg-white'}`}>{zh ? '全部' : 'All'}</button>
            {PROFESSIONAL_TRADES.map((t) => { const d = TRADES.find((x) => x.key === t)!; return <button key={t} type="button" onClick={() => setTrade(t)} aria-pressed={trade === t} className={`rounded-full border px-4 py-1.5 text-[13px] font-semibold ${trade === t ? 'border-brand bg-white text-brand' : 'border-line-divider bg-white'}`}>{zh ? d.zh : d.en}</button> })}
          </div>
        </div>
      </section>
      <section>
        <div className="mx-auto max-w-[1100px] px-5 py-10 sm:px-7 lg:py-14">
          {!auth.loading && !auth.user && (
            <p className="rounded-2xl border border-line-divider bg-surface-chip/40 p-5 text-[14px]" data-testid="professional-signin">{zh ? '登录后可以看到联系方式。' : 'Sign in to see contact details.'} <a href="/login" className="font-semibold text-brand underline-offset-2 hover:underline">{zh ? '去登录 →' : 'Sign in →'}</a></p>
          )}
          {auth.user && providers && byTrade.map(({ t, def, list }) => (
            <div key={t} className="mb-10" data-testid={`professional-group-${t}`}>
              <h2 className="text-[20px] font-semibold tracking-tight">{zh ? def.zh : def.en}</h2>
              <p className="mt-1 text-[12.5px] text-body-3">{zh ? '需要的牌照：' : 'Licence required: '}{def.required.map((k) => (zh ? CREDENTIAL_LABEL[k].zh : CREDENTIAL_LABEL[k].en)).join(zh ? '、' : ', ')}</p>
              {list.length === 0 ? <p className="mt-3 text-[13.5px] text-body-3">{zh ? '还没有已核验的提供者。' : 'No verified provider yet.'}</p> : (
                <div className="mt-3 divide-y divide-line-divider rounded-2xl border border-line-divider bg-white">
                  {list.map((p) => {
                    const pc = creds.filter((c) => c.provider_id === p.id)
                    const cov = coverageFor(t, pc)
                    return (
                      <div key={p.id} className="px-5 py-4" data-testid="professional-provider">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[15px] font-semibold">{p.trade_name || p.legal_name}</span>
                          <span className={`rounded-full px-2 py-[2px] text-[11px] font-bold ${cov.ok ? 'bg-[#ECFDF5] text-[#047857]' : 'bg-amber-50 text-amber-800'}`}>{cov.ok ? (zh ? '牌照已核' : 'licence verified') : (zh ? '牌照待核或已过期' : 'licence pending or expired')}</span>
                        </div>
                        <div className="mt-1 text-[12.5px] text-body-2">
                          {pc.filter((c) => def.required.includes(c.kind as CredentialKind)).map((c) => `${zh ? CREDENTIAL_LABEL[c.kind as CredentialKind]?.zh : CREDENTIAL_LABEL[c.kind as CredentialKind]?.en}${c.expires_at ? ` · ${zh ? '到期' : 'expires'} ${c.expires_at}` : ''}`).join(' · ')}
                        </div>
                        <div className="mt-1 text-[12.5px] text-body-3">{p.service_cities.join(' · ')}</div>
                        <div className="mt-1 flex flex-wrap gap-3 text-[13px]">
                          {p.contact_email && <a href={`mailto:${p.contact_email}`} className="text-brand underline-offset-2 hover:underline">{p.contact_email}</a>}
                          {p.contact_phone && <span>{p.contact_phone}</span>}
                          {p.website && <a href={p.website} target="_blank" rel="noreferrer" className="text-brand underline-offset-2 hover:underline">{p.website.replace(/^https?:\/\//, '')}</a>}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          ))}
          <p className="max-w-[760px] text-[12.5px] leading-relaxed text-body-3">
            {zh ? '牌照以 LSO / RIBO 公开名册为准，Stayloop 只做人工核对与记录。选定之后，你们之间的委托、保单与费用不经 Stayloop；在事务档案里留一笔联系记录即可。这不是法律意见，也不是保险建议。' : 'Licences are as the LSO / RIBO public registers state; Stayloop only checks and records them. Your retainer, policy and fees are between you and the provider, not through Stayloop; keep a note of the contact in the matter record. This is not legal or insurance advice.'}
          </p>
        </div>
      </section>
      <Footer />
    </div>
  )
}
