'use client'

// /providers/professional — the professional-services directory, the 专业服务 tab of
// 「找经纪和服务商」 since 2026-11-16 (2026-10-27,
// report review batch 2 §8): licensed paralegals, lawyers, insurance brokers and
// listing photographers Stayloop has verified by hand against the public
// registers (LSO, RIBO). Shown to any signed-in hat (tenants need insurance
// brokers, landlords need paralegals); the person contacts and contracts with
// the provider directly. Stayloop dispatches nothing, takes no commission,
// gives no legal advice and sells no insurance.
// 2026-11-22: the rows became the agent directory's card (components/directory/ProviderCard.tsx),
// still grouped by licence category, with the e-mail address and phone number on the card; each
// card opens the provider's page, /providers/<id>, where the website and the message form are.
import { useEffect, useState } from 'react'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import FindHeader from '@/components/directory/FindHeader'
import ProviderCard from '@/components/directory/ProviderCard'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/useAuth'
import { useT } from '@/lib/i18n'
import { useMarketplaceConfig } from '@/lib/marketplace/config'
import { providerDisplayName } from '@/lib/marketplace/directory'
import { CREDENTIAL_LABEL, coverageFor, isProfessionalTrade, PROFESSIONAL_TRADES, TRADES, type CredentialKind, type Trade } from '@/lib/marketplace/trades'

type Provider = { id: string; legal_name: string; trade_name: string | null; trades: string[]; service_cities: string[]; contact_email: string | null; contact_phone: string | null; verified_at: string | null }
type Cred = { provider_id: string; kind: string; expires_at: string | null; verified_at: string | null }

export default function ProfessionalDirectoryPage() {
  const { lang } = useT()
  const zh = lang === 'zh'
  const auth = useAuth()
  const { graceDays } = useMarketplaceConfig()
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
      const { data } = await supabase.from('provider_directory').select('id, legal_name, trade_name, trades, service_cities, contact_email, contact_phone, verified_at').overlaps('trades', [...PROFESSIONAL_TRADES]).limit(200)
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
      <FindHeader active="professional">
        <h2 className="sl-type-head max-w-[820px] text-[20px] font-semibold tracking-tight">{zh ? '持牌的人，牌照核过，你直接联系。' : 'Licensed people, licences checked, you contact them directly.'}</h2>
        <p className="mt-2 max-w-[720px] text-[14.5px] leading-[1.6] text-body-2">
          {zh ? '持牌 Paralegal（LTB 代理）、律师、保险经纪、房源摄影。Stayloop 工作人员对照 LSO、RIBO 公开名册人工核过牌照号；你和对方直接联系、直接签约。Stayloop 不派单、不收佣金、不给法律意见、不卖保险。' : 'Licensed paralegals (LTB representation), lawyers, insurance brokers, listing photographers. Stayloop staff check each licence number by hand against the LSO and RIBO public registers; you contact and contract with them directly. Stayloop dispatches nothing, takes no commission, gives no legal advice and sells no insurance.'}
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <button type="button" onClick={() => setTrade('all')} aria-pressed={trade === 'all'} className={`rounded-full border px-4 py-1.5 text-[13px] font-semibold ${trade === 'all' ? 'border-brand bg-white text-brand' : 'border-line-divider bg-white'}`}>{zh ? '全部' : 'All'}</button>
          {PROFESSIONAL_TRADES.map((t) => { const d = TRADES.find((x) => x.key === t)!; return <button key={t} type="button" onClick={() => setTrade(t)} aria-pressed={trade === t} className={`rounded-full border px-4 py-1.5 text-[13px] font-semibold ${trade === t ? 'border-brand bg-white text-brand' : 'border-line-divider bg-white'}`}>{zh ? d.zh : d.en}</button> })}
        </div>
      </FindHeader>
      <section>
        <div className="mx-auto max-w-[1320px] px-6 pb-14 sm:px-8 lg:px-12">
          {!auth.loading && !auth.user && (
            <p className="rounded-2xl border border-line-divider bg-surface-chip/40 p-5 text-[14px]" data-testid="professional-signin">{zh ? '登录后可以看到服务商与联系方式。' : 'Sign in to see providers and their contact details.'} <a href="/login?next=/providers/professional" className="font-semibold text-brand underline-offset-2 hover:underline">{zh ? '去登录 →' : 'Sign in →'}</a></p>
          )}
          {auth.user && providers && byTrade.map(({ t, def, list }) => (
            <div key={t} className="mb-10" data-testid={`professional-group-${t}`}>
              <h2 className="text-[20px] font-semibold tracking-tight">{zh ? def.zh : def.en}</h2>
              <p className="mt-1 text-[12.5px] text-body-3">{zh ? '需要的牌照：' : 'Licence required: '}{def.required.map((k) => (zh ? CREDENTIAL_LABEL[k].zh : CREDENTIAL_LABEL[k].en)).join(zh ? '、' : ', ')}</p>
              {list.length === 0 ? <p className="mt-3 text-[13.5px] text-body-3" data-testid="professional-empty">{zh ? '这个类别暂时还没有入驻的服务商。' : 'No provider has joined in this category yet.'}</p> : (
                <div className="mt-3 grid gap-4 lg:grid-cols-2">
                  {list.map((p) => {
                    const pc = creds.filter((c) => c.provider_id === p.id)
                    const cov = coverageFor(t, pc, new Date(), graceDays)
                    const licences = pc.filter((c) => c.verified_at && def.required.includes(c.kind as CredentialKind))
                      .map((c) => `${zh ? CREDENTIAL_LABEL[c.kind as CredentialKind]?.zh : CREDENTIAL_LABEL[c.kind as CredentialKind]?.en}${c.expires_at ? ` · ${zh ? '到期' : 'expires'} ${c.expires_at}` : ''}`).join(' · ')
                    return (
                      <ProviderCard
                        key={p.id}
                        id={p.id}
                        name={providerDisplayName(p)}
                        legalName={p.legal_name}
                        zh={zh}
                        testid="professional-provider"
                        badge={{ ok: cov.ok, label: cov.ok ? (zh ? '牌照已核' : 'Licence verified') : (zh ? '牌照待核或已过期' : 'Licence pending or expired') }}
                        chips={p.trades.filter(isProfessionalTrade).map((k) => { const d = TRADES.find((x) => x.key === k); return { key: k, label: d ? (zh ? d.zh : d.en) : k, ok: coverageFor(k, pc, new Date(), graceDays).ok } })}
                        cities={p.service_cities ?? []}
                        detail={licences || null}
                        email={p.contact_email}
                        phone={p.contact_phone}
                      />
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
