'use client'

// /agents — find an agent (2026-10-21), the 经纪 tab of 「找经纪和服务商」 (2026-11-16). Full cards for
// agents who published a public profile and whose RECO registration is verified and live; below
// them, every other verified live registration with its register fields only (name, descriptor,
// brokerage). Data comes from /api/agents (public fields only).
import { useEffect, useState } from 'react'
import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { AgentBadge } from '@/components/AgentBadge'
import FindHeader, { TestDataTag } from '@/components/directory/FindHeader'
import { isTestName } from '@/components/listing/testAccounts'
import AgentAvatar from '@/components/agent/AgentAvatar'
import { useT } from '@/lib/i18n'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/useAuth'
import { useHats } from '@/lib/useHats'
import { isRegistrationLive } from '@/lib/agentProfile'
import { categoryLabel } from '@/lib/agentProfile'
import { AGENT_FOCUS, AGENT_LANGUAGES, focusLabel, languageLabel, type BasicAgent, type PublicAgent, SIGNAL_MIN_SAMPLES, type AgentSignals } from '@/lib/agentPublic'

// Station-only signals (2026-10-27): counts from Stayloop's own records; a thin sample says so instead of a number.
function signalLine(s: AgentSignals, L: 'zh' | 'en'): string {
  const zh = L === 'zh'
  const reply = s.response_samples >= SIGNAL_MIN_SAMPLES && s.response_median_minutes != null
    ? (zh ? `回复中位 ${s.response_median_minutes < 60 ? `${s.response_median_minutes} 分钟` : `${Math.round(s.response_median_minutes / 60)} 小时`}` : `median reply ${s.response_median_minutes < 60 ? `${s.response_median_minutes} min` : `${Math.round(s.response_median_minutes / 60)} h`}`)
    : (zh ? '回复速度：尚无足够数据' : 'reply time: not enough data yet')
  return [zh ? `站内筛查 ${s.screenings}` : `${s.screenings} screenings here`, zh ? `签约 ${s.leases}` : `${s.leases} leased`, reply].join(' · ')
}

export default function AgentsDirectoryPage() {
  const { lang } = useT()
  const zh = lang === 'zh'
  const L = zh ? 'zh' : 'en'
  const [language, setLanguage] = useState('')
  const [focus, setFocus] = useState('')
  const [area, setArea] = useState('')
  const [items, setItems] = useState<PublicAgent[] | null>(null)
  const [basic, setBasic] = useState<BasicAgent[]>([])
  const [failed, setFailed] = useState(false)
  // A verified agent whose own profile is not public gets a line saying so and where to turn it on
  // (2026-11-17: the agent saw their own name under 「还没有公开主页」 with no way from here to fix it).
  const auth = useAuth()
  const hats = useHats()
  const [ownHidden, setOwnHidden] = useState(false)
  const agentLive = isRegistrationLive(hats.agent)
  useEffect(() => {
    if (!auth.user || !agentLive) { setOwnHidden(false); return }
    let on = true
    supabase.from('agent_profiles').select('public_profile').eq('auth_id', auth.user.id).maybeSingle().then(({ data }) => {
      if (on) setOwnHidden(!!data && !(data as { public_profile: boolean }).public_profile)
    })
    return () => { on = false }
  }, [auth.user, agentLive])

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
        setBasic((data.basic ?? []) as BasicAgent[])
      } catch { if (on) setFailed(true) }
    }, area ? 300 : 0)
    return () => { on = false; clearTimeout(t) }
  }, [language, focus, area])

  const sel = 'rounded-xl border border-line-divider bg-white px-3 py-2 text-[14px] outline-none focus:border-brand'

  return (
    <div style={{ background: '#FFFFFF' }} className="text-body">
      <Header variant="transparent" />
      <FindHeader active="agents">
        <h2 className="sl-type-head text-[20px] font-semibold tracking-tight">
          {zh ? '找一位在 RECO 注册过的租赁经纪' : 'Find a RECO-registered leasing agent'}
        </h2>
        <p className="mt-2 max-w-[720px] text-[14.5px] leading-[1.6] text-body-2">
          {zh
            ? '这里列出的经纪都由 Stayloop 工作人员对照 RECO 公开注册库人工核过。开了公开主页的可以按语言、专长和区域找，在站内直接发消息，不用留电话；没开主页的只列注册信息。'
            : 'Every agent here was checked by a Stayloop staff member against RECO’s public register. Those who published a profile can be filtered by language, focus and area and messaged on Stayloop without giving out your phone number; the rest are listed with their registration details only.'}
        </p>
        <div className="mt-5 flex flex-wrap gap-2" data-testid="agents-filters">
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
      </FindHeader>

      <main className="mx-auto max-w-[1320px] px-6 pb-16 sm:px-8 lg:px-12">
        {ownHidden && (
          <div className="mb-6 flex flex-wrap items-center gap-3 rounded-2xl border border-[#BFD4FF] bg-[#EFF4FF] px-4 py-3 text-[14px] leading-relaxed" data-testid="agents-own-hidden">
            <span className="min-w-0 flex-1">{zh ? '你已通过 RECO 核验，但主页还没有公开，所以这里只列了你的注册信息。' : 'Your RECO registration is verified, but your profile is not public yet, so only your registration details are listed here.'}</span>
            <Link href="/agent/verify" className="sl-btn-primary !px-4 !py-2 !text-[13px]">{zh ? '去公开我的主页' : 'Publish my profile'}</Link>
          </div>
        )}
        {failed && <div className="rounded-xl bg-amber-50 px-4 py-3 text-[13.5px] text-amber-800">{zh ? '暂时读不到经纪列表，请稍后刷新。' : 'Could not load agents right now. Please refresh shortly.'}</div>}
        {!failed && items === null && <div className="py-10 text-[14px] text-body-3">…</div>}
        {!failed && items !== null && items.length === 0 && basic.length === 0 && (
          <div className="rounded-2xl border border-line-divider bg-white p-6 text-[14px] leading-relaxed text-body-2" data-testid="agents-empty">
            {language || focus || area
              ? (zh ? '没有符合条件的经纪，换个条件试试。' : 'No agents match. Try other filters.')
              : (zh ? '暂时还没有完成认证的经纪。' : 'No agent has been verified yet.')}
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
                    {isTestName(a.name) && <TestDataTag zh={zh} />}
                    <div className="text-[12.5px] text-body-2">{categoryLabel(a.category, L)}{a.crea_member ? ' · REALTOR®' : ''}</div>
                    <div className="text-[12.5px] font-semibold text-body">{a.brokerage_name}</div>
                  </div>
                </div>
                <div className="mt-3"><AgentBadge agent={a} lang={L} compact linkless /></div>
                {a.languages.length > 0 && <div className="mt-3 text-[12.5px] text-body-2">{a.languages.map((c) => languageLabel(c, L)).join(' · ')}</div>}
                {a.focus.length > 0 && <div className="mt-1 text-[12.5px] text-body-3">{a.focus.map((c) => focusLabel(c, L)).join(' · ')}</div>}
                {a.service_areas.length > 0 && <div className="mt-1 truncate text-[12.5px] text-body-3">{a.service_areas.join(' · ')}</div>}
                {a.signals && <div className="mt-2 text-[12px] text-body-2" data-testid="agent-signals">{signalLine(a.signals, L)}</div>}
              </Link>
            ))}
          </div>
        )}
        {!failed && items !== null && basic.length > 0 && (
          <section className={items.length > 0 ? 'mt-10' : ''} data-testid="agents-basic">
            <h3 className="text-[16px] font-semibold tracking-tight">{zh ? '已核验 · 还没有公开主页' : 'Verified · no public profile yet'}</h3>
            <p className="mt-1 max-w-[720px] text-[12.5px] leading-relaxed text-body-3">
              {zh ? '只列注册名、类别和所属经纪公司，这些在 RECO 公开注册库上都查得到。这几位暂时不能在站内联系。' : 'Registered name, category and brokerage only, all of which are on RECO’s public register. They cannot be messaged on Stayloop yet.'}
            </p>
            <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {basic.map((a) => (
                <div key={a.reco_number} className="flex flex-col rounded-2xl border border-line-divider bg-white p-5" data-testid="agent-basic-card">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="min-w-0 break-words text-[16px] font-bold">{a.name}</span>
                    {isTestName(a.name) && <TestDataTag zh={zh} />}
                  </div>
                  <div className="mt-0.5 text-[12.5px] text-body-2">{categoryLabel(a.category, L)}{a.crea_member ? ' · REALTOR®' : ''}</div>
                  <div className="text-[12.5px] font-semibold text-body">{a.brokerage_name}</div>
                  <div className="mt-3"><AgentBadge agent={a} lang={L} compact /></div>
                </div>
              ))}
            </div>
          </section>
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
