'use client'

// /agents — find an agent (2026-10-21), the 经纪 tab of 「找经纪和服务商」 (2026-11-16). One list
// (2026-11-17 redesign, design/agent-pages-redesign-2026-11-17.md): two-column cards with the photo on
// the left, the registered name, descriptor, brokerage and RECO number in plain sight, and two actions —
// 看主页 / 发消息 (that card is components/directory/AgentCard.tsx since 2026-11-24). Agents who published a profile come first; every other verified live registration
// follows with its register fields only and a link to RECO's register (no profile to open, no way to
// message). Data comes from /api/agents (public fields only).
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { AgentBadge } from '@/components/AgentBadge'
import FindHeader, { FIND_GROUND, TestDataTag } from '@/components/directory/FindHeader'
import { FilterBar, FilterIcon, FilterSelect, FilterText } from '@/components/directory/FilterBar'
import AgentCard from '@/components/directory/AgentCard'
import { CARD, CARD_FOOT, CARD_META, CARD_NAME, CHIP_QUIET } from '@/components/directory/cardStyle'
import { isTestName } from '@/components/listing/testAccounts'
import AgentAvatar from '@/components/agent/AgentAvatar'
import { useT } from '@/lib/i18n'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/useAuth'
import { useHats } from '@/lib/useHats'
import { isRegistrationLive } from '@/lib/agentProfile'
import { RECO_REGISTER_URL, categoryLabel } from '@/lib/agentProfile'
import { AGENT_FOCUS, AGENT_LANGUAGES, directoryEntries, type BasicAgent, type DirectorySort, type PublicAgent } from '@/lib/agentPublic'

export default function AgentsDirectoryPage() {
  const { lang } = useT()
  const zh = lang === 'zh'
  const L = zh ? 'zh' : 'en'
  const [language, setLanguage] = useState('')
  const [focus, setFocus] = useState('')
  const [area, setArea] = useState('')
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<DirectorySort>('default')
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
      if (q.trim()) qs.set('q', q.trim())
      try {
        const res = await fetch(`/api/agents?${qs.toString()}`, { cache: 'no-store' })
        const data = await res.json()
        if (!on) return
        if (!res.ok) { setFailed(true); return }
        setFailed(false)
        setItems((data.items ?? []) as PublicAgent[])
        setBasic((data.basic ?? []) as BasicAgent[])
      } catch { if (on) setFailed(true) }
    }, area || q ? 300 : 0)
    return () => { on = false; clearTimeout(t) }
  }, [language, focus, area, q])

  const entries = useMemo(() => directoryEntries(items ?? [], basic, sort), [items, basic, sort])
  const reachable = items?.length ?? 0
  const filtered = !!(language || focus || area.trim() || q.trim())
  const countLine = zh
    ? `共 ${entries.length} 位经纪，${reachable === entries.length ? '都可以在站内联系' : reachable === 0 ? '暂时都还不能在站内联系' : `其中 ${reachable} 位可以在站内联系`}`
    : `${entries.length} ${entries.length === 1 ? 'agent' : 'agents'}, ${reachable === entries.length ? 'all reachable on Stayloop' : reachable === 0 ? 'none reachable on Stayloop yet' : `${reachable} reachable on Stayloop`}`

  return (
    <div style={{ background: FIND_GROUND }} className="text-body">
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
        <div className="mt-6">
          <FilterBar cols="sm:grid-cols-2 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1.2fr)_minmax(0,0.8fr)_minmax(0,0.8fr)]" testid="agents-filters">
            <FilterText icon={FilterIcon.pin} value={area} onChange={(e) => setArea(e.target.value)} placeholder={zh ? '区域，例如 North York' : 'Area, e.g. North York'} aria-label={zh ? '区域' : 'Area'} />
            <FilterText icon={FilterIcon.search} value={q} maxLength={60} onChange={(e) => setQ(e.target.value)} placeholder={zh ? '姓名或经纪公司' : 'Name or brokerage'} aria-label={zh ? '姓名或经纪公司' : 'Name or brokerage'} data-testid="agents-q" />
            <FilterSelect icon={FilterIcon.globe} value={language} onChange={(e) => setLanguage(e.target.value)} aria-label={zh ? '语言' : 'Language'}>
              <option value="">{zh ? '所有语言' : 'All languages'}</option>
              {AGENT_LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l[L]}</option>)}
            </FilterSelect>
            <FilterSelect icon={FilterIcon.tag} value={focus} onChange={(e) => setFocus(e.target.value)} aria-label={zh ? '专长' : 'Focus'}>
              <option value="">{zh ? '所有专长' : 'Any focus'}</option>
              {AGENT_FOCUS.map((f) => <option key={f.code} value={f.code}>{f[L]}</option>)}
            </FilterSelect>
          </FilterBar>
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
        {!failed && items !== null && entries.length === 0 && (
          <div className="rounded-2xl border border-line-divider bg-white p-6 text-[14px] leading-relaxed text-body-2" data-testid="agents-empty">
            {filtered
              ? (zh ? '没有符合条件的经纪，换个条件试试。' : 'No agents match. Try other filters.')
              : (zh ? '暂时还没有完成认证的经纪。' : 'No agent has been verified yet.')}
            <div className="mt-2 text-[13px] text-body-3">
              {zh ? '你是持牌经纪？' : 'Are you a registered agent?'}{' '}
              <Link href="/agent/verify" className="font-semibold text-brand underline">{zh ? '完成认证并公开主页' : 'Get verified and publish your profile'}</Link>
            </div>
          </div>
        )}
        {!failed && items !== null && entries.length > 0 && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2" data-testid="agents-result-row">
              <div className="text-[15px] font-semibold" data-testid="agents-count">{countLine}</div>
              <label className="relative flex items-center gap-2 text-[13px] text-body-2">
                {zh ? '排序' : 'Sort'}
                <select className="h-11 cursor-pointer appearance-none rounded-full border border-line-divider bg-white pl-4 pr-9 text-[13.5px] font-semibold text-ink outline-none transition hover:border-brand focus:border-brand sm:h-10" value={sort} onChange={(e) => setSort(e.target.value as DirectorySort)} data-testid="agents-sort">
                  <option value="default">{zh ? '默认' : 'Default'}</option>
                  <option value="name">{zh ? '姓名 A–Z' : 'Name A–Z'}</option>
                </select>
                <svg aria-hidden width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-body-3"><path d="M6 9l6 6 6-6" /></svg>
              </label>
            </div>
            <p className="mt-1 text-[12px] text-body-3" data-testid="agents-order-note">
              {zh ? '默认顺序：开了主页的在前，其次按核验时间；没有推荐位，也不收排名费。' : 'Default order: agents with a profile first, then by when they were verified; no featured slots, no fee for position.'}
            </p>
            <div className="mt-5 grid gap-4 lg:grid-cols-2 lg:gap-5" data-testid="agents-grid">
              {entries.map((e) => e.kind === 'public' ? <AgentCard key={`p-${e.agent.slug}`} agent={e.agent} zh={zh} /> : (() => {
                const a = e.agent
                return (
                  <article key={`b-${a.reco_number}`} className={CARD} data-testid="agent-basic-card">
                    <div className="flex items-start gap-4">
                      <AgentAvatar name={a.name} size={72} shape="square" muted />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={CARD_NAME} data-testid="agent-card-name">{a.name}</span>
                          <span className={CHIP_QUIET} data-testid="agent-no-profile-tag">{zh ? '未开主页' : 'No profile'}</span>
                          {isTestName(a.name) && <TestDataTag zh={zh} />}
                        </div>
                        <div className={`mt-0.5 ${CARD_META}`}>{categoryLabel(a.category, L)}{a.crea_member ? ' · REALTOR®' : ''}</div>
                        {/* On its own line, in the name's colour: the brokerage is named clearly and prominently (O. Reg. 567/05 s.12.1). */}
                        <div className="break-words text-[14px] font-semibold leading-snug text-ink" data-testid="agent-card-brokerage">{a.brokerage_name}</div>
                        <div className="mt-2"><AgentBadge agent={a} lang={L} compact withNumber /></div>
                      </div>
                    </div>
                    <p className="mt-4 text-[12.5px] leading-relaxed text-body-3">{zh ? '只列注册信息，暂时不能在站内联系。' : 'Registration details only; not reachable on Stayloop yet.'}</p>
                    <div className={CARD_FOOT}>
                      <div className="border-t border-line-divider pt-4 sm:text-right">
                        <a href={RECO_REGISTER_URL} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[44px] items-center text-[13.5px] font-semibold text-brand underline-offset-2 hover:underline sm:min-h-[40px]" data-testid="agent-basic-reco">{zh ? '在 RECO 注册库核实 ↗' : 'Check on the RECO register ↗'}</a>
                      </div>
                    </div>
                  </article>
                )
              })())}
            </div>
          </>
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
