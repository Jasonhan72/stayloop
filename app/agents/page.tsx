'use client'

// /agents — find an agent (2026-10-21). Agents who published a public profile and whose
// RECO registration is verified and live. Data comes from /api/agents (public fields only).
import { useEffect, useState } from 'react'
import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { AgentBadge } from '@/components/AgentBadge'
import AgentAvatar from '@/components/agent/AgentAvatar'
import { useT } from '@/lib/i18n'
import { categoryLabel } from '@/lib/agentProfile'
import { AGENT_FOCUS, AGENT_LANGUAGES, focusLabel, languageLabel, type PublicAgent } from '@/lib/agentPublic'

export default function AgentsDirectoryPage() {
  const { lang } = useT()
  const zh = lang === 'zh'
  const L = zh ? 'zh' : 'en'
  const [language, setLanguage] = useState('')
  const [focus, setFocus] = useState('')
  const [area, setArea] = useState('')
  const [items, setItems] = useState<PublicAgent[] | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let on = true
    const t = setTimeout(async () => {
      const qs = new URLSearchParams()
      if (language) qs.set('language', language)
      if (focus) qs.set('focus', focus)
      if (area.trim()) qs.set('area', area.trim())
      try {
        const res = await fetch(`/api/agents?${qs.toString()}`, { cache: 'no-store' })
        const data = await res.json()
        if (!on) return
        if (!res.ok) { setFailed(true); return }
        setFailed(false)
        setItems((data.items ?? []) as PublicAgent[])
      } catch { if (on) setFailed(true) }
    }, area ? 300 : 0)
    return () => { on = false; clearTimeout(t) }
  }, [language, focus, area])

  const sel = 'rounded-xl border border-line-divider bg-white px-3 py-2 text-[14px] outline-none focus:border-brand'

  return (
    <div style={{ background: '#FFFFFF' }} className="text-body">
      <Header variant="transparent" />
      <section style={{ background: 'linear-gradient(180deg,#EFF4FF 0%,#FFFFFF 100%)' }}>
        <div className="mx-auto max-w-[1320px] px-6 pb-8 pt-14 sm:px-8 lg:px-12">
          <div className="font-mono text-[13px] font-semibold uppercase tracking-[.12em] text-[#2563EB]">{zh ? '找经纪' : 'Find an agent'}</div>
          <h1 className="sl-type-head mt-3 text-[clamp(26px,3.2vw,38px)] font-semibold leading-[1.15] tracking-[-0.02em]">
            {zh ? '找一位在 RECO 注册过的租赁经纪' : 'Find a RECO-registered leasing agent'}
          </h1>
          <p className="mt-3 max-w-[720px] text-[15.5px] leading-[1.6] text-body-2">
            {zh
              ? '这里列出的经纪都由 Stayloop 工作人员对照 RECO 公开注册库人工核过，并且自己选择了公开主页。可以按语言、专长和区域找，在站内直接发消息，不用留电话。'
              : 'Every agent here was checked by a Stayloop staff member against RECO’s public register and chose to publish a profile. Filter by language, focus and area, and message them on Stayloop without giving out your phone number.'}
          </p>
          <div className="mt-6 flex flex-wrap gap-2" data-testid="agents-filters">
            <select className={sel} value={language} onChange={(e) => setLanguage(e.target.value)} aria-label={zh ? '语言' : 'Language'}>
              <option value="">{zh ? '所有语言' : 'All languages'}</option>
              {AGENT_LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l[L]}</option>)}
            </select>
            <select className={sel} value={focus} onChange={(e) => setFocus(e.target.value)} aria-label={zh ? '专长' : 'Focus'}>
              <option value="">{zh ? '所有专长' : 'Any focus'}</option>
              {AGENT_FOCUS.map((f) => <option key={f.code} value={f.code}>{f[L]}</option>)}
            </select>
            <input className={`${sel} min-w-0 flex-1 sm:max-w-[280px]`} value={area} onChange={(e) => setArea(e.target.value)} placeholder={zh ? '区域，例如 North York' : 'Area, e.g. North York'} aria-label={zh ? '区域' : 'Area'} />
          </div>
        </div>
      </section>

      <main className="mx-auto max-w-[1320px] px-6 pb-16 sm:px-8 lg:px-12">
        {failed && <div className="rounded-xl bg-amber-50 px-4 py-3 text-[13.5px] text-amber-800">{zh ? '暂时读不到经纪列表，请稍后刷新。' : 'Could not load agents right now. Please refresh shortly.'}</div>}
        {!failed && items === null && <div className="py-10 text-[14px] text-body-3">…</div>}
        {!failed && items !== null && items.length === 0 && (
          <div className="rounded-2xl border border-line-divider bg-white p-6 text-[14px] leading-relaxed text-body-2" data-testid="agents-empty">
            {language || focus || area
              ? (zh ? '没有符合条件的经纪，换个条件试试。' : 'No agents match. Try other filters.')
              : (zh ? '还没有经纪公开主页。' : 'No agent has published a profile yet.')}
            <div className="mt-2 text-[13px] text-body-3">
              {zh ? '你是持牌经纪？' : 'Are you a registered agent?'}{' '}
              <Link href="/agent/verify" className="font-semibold text-brand underline">{zh ? '完成认证并公开主页' : 'Get verified and publish your profile'}</Link>
            </div>
          </div>
        )}
        {!failed && items !== null && items.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="agents-grid">
            {items.map((a) => (
              <Link key={a.slug} href={`/agents/${a.slug}`} className="flex flex-col rounded-2xl border border-line-divider bg-white p-5 transition hover:border-[#2563EB]" data-testid="agent-card">
                <div className="flex items-start gap-3">
                  <AgentAvatar name={a.name} size={48} photoUrl={a.photo_url} />
                  <div className="min-w-0">
                    <div className="truncate text-[16px] font-bold">{a.name}</div>
                    <div className="text-[12.5px] text-body-2">{categoryLabel(a.category, L)}{a.crea_member ? ' · REALTOR®' : ''}</div>
                    <div className="text-[12.5px] font-semibold text-body">{a.brokerage_name}</div>
                  </div>
                </div>
                <div className="mt-3"><AgentBadge agent={a} lang={L} compact /></div>
                {a.languages.length > 0 && <div className="mt-3 text-[12.5px] text-body-2">{a.languages.map((c) => languageLabel(c, L)).join(' · ')}</div>}
                {a.focus.length > 0 && <div className="mt-1 text-[12.5px] text-body-3">{a.focus.map((c) => focusLabel(c, L)).join(' · ')}</div>}
                {a.service_areas.length > 0 && <div className="mt-1 truncate text-[12.5px] text-body-3">{a.service_areas.join(' · ')}</div>}
              </Link>
            ))}
          </div>
        )}
        <p className="mt-8 max-w-[860px] text-[12px] leading-relaxed text-body-3">
          {zh
            ? '核验只表示核验当天这位经纪在 RECO 公开注册库上处于注册状态，不是 Stayloop 的推荐或背书。Stayloop 不是经纪公司，不参与交易，不收取佣金或转介费；经纪服务由每位经纪所属的经纪公司提供。'
            : 'Verification only means the agent was registered on RECO’s public register on the day checked; it is not a recommendation or endorsement by Stayloop. Stayloop is not a brokerage, takes no part in trades and receives no commission or referral fee; brokerage services are provided by each agent’s brokerage.'}
        </p>
      </main>
      <Footer />
    </div>
  )
}
