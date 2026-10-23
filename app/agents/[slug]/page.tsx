'use client'

// /agents/<slug> — an agent's public profile (2026-10-21), modelled on HouseSigma's agent
// pages but built from Stayloop's own data only: registration (checked by hand against
// RECO's register), languages, focus, areas, introduction, the listings they publish on
// Stayloop, real activity counts if the agent opted in, and a message form that goes
// through Stayloop's relay into the agent's client list. No MLS data, no contact details.
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { AgentBadge } from '@/components/AgentBadge'
import AgentAvatar from '@/components/agent/AgentAvatar'
import { useT } from '@/lib/i18n'
import { useAuth } from '@/lib/useAuth'
import { supabase } from '@/lib/supabase'
import { categoryLabel } from '@/lib/agentProfile'
import { CONTACT_MAX, CONTACT_MIN, focusLabel, languageLabel, type AgentActivity, type PublicAgent } from '@/lib/agentPublic'
import { listingTitle } from '@/lib/listingDisplay'

type Card = { id: string; slug: string; address: string; unit: string | null; city: string | null; monthly_rent: number; bedrooms: number | null; bathrooms: number | null; images: string[] | null; is_test?: boolean | null }

export default function AgentProfilePage() {
  const params = useParams()
  const slug = String(params?.slug || '')
  const { lang } = useT()
  const zh = lang === 'zh'
  const L = zh ? 'zh' : 'en'
  const auth = useAuth()

  const [agent, setAgent] = useState<PublicAgent | null | 'missing'>(null)
  const [activity, setActivity] = useState<AgentActivity | null>(null)
  const [cards, setCards] = useState<Card[]>([])
  const [isMine, setIsMine] = useState(false)

  useEffect(() => {
    if (!slug) return
    let on = true
    ;(async () => {
      const res = await fetch(`/api/agents/${encodeURIComponent(slug)}`, { cache: 'no-store' })
      const data = await res.json().catch(() => ({}))
      if (!on) return
      if (!res.ok || !data?.agent) { setAgent('missing'); return }
      setAgent(data.agent as PublicAgent)
      setActivity((data.activity ?? null) as AgentActivity | null)
      const ids = (data.listing_ids ?? []) as string[]
      if (ids.length) {
        const r = await fetch(`/api/listings/search?ids=${ids.join(',')}`, { cache: 'no-store' })
        const j = await r.json().catch(() => ({}))
        if (on && Array.isArray(j.items)) setCards(j.items as Card[])
      }
    })()
    return () => { on = false }
  }, [slug])

  // The agent looking at their own page gets an edit link instead of the form.
  useEffect(() => {
    if (!auth.user || !slug) { setIsMine(false); return }
    let on = true
    supabase.from('agent_profiles').select('profile_slug').eq('auth_id', auth.user.id).maybeSingle()
      .then(({ data }) => { if (on) setIsMine((data as { profile_slug?: string | null } | null)?.profile_slug === slug) })
    return () => { on = false }
  }, [auth.user, slug])

  if (agent === 'missing') {
    return (
      <div className="text-body">
        <Header />
        <main className="mx-auto max-w-[1320px] px-6 py-20 sm:px-8 lg:px-12" data-testid="agent-profile-missing">
          <h1 className="text-[22px] font-bold">{zh ? '没有找到这位经纪的主页' : 'This agent profile was not found'}</h1>
          <p className="mt-2 text-[14px] text-body-2">{zh ? '可能还没公开，或者已经关闭。' : 'It may not be public yet, or it was turned off.'}</p>
          <Link href="/agents" className="sl-btn-primary mt-6 inline-block">{zh ? '去找经纪' : 'Find an agent'}</Link>
        </main>
        <Footer />
      </div>
    )
  }

  return (
    <div style={{ background: '#FFFFFF' }} className="text-body">
      <Header />
      <main className="mx-auto max-w-[1320px] px-6 pb-16 pt-8 sm:px-8 lg:px-12">
        <nav className="text-[13px] text-body-3"><Link href="/agents" className="hover:underline">{zh ? '找经纪' : 'Find an agent'}</Link>{agent ? <> / <span className="text-body-2">{agent.name}</span></> : null}</nav>
        {!agent ? (
          <div className="py-16 text-[14px] text-body-3">…</div>
        ) : (
          <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
            <div className="min-w-0 space-y-6">
              <section className="rounded-2xl border border-line-divider bg-white p-6" data-testid="agent-profile-head">
                <div className="flex flex-wrap items-start gap-4">
                  <AgentAvatar name={agent.name} size={72} photoUrl={agent.photo_url} />
                  <div className="min-w-0 flex-1">
                    <h1 className="text-[26px] font-extrabold tracking-tight">{agent.name}</h1>
                    {/* O. Reg. 567/05 s.12.1: descriptor + brokerage name, clearly and prominently. */}
                    <div className="mt-1 text-[15px] font-semibold" data-testid="agent-profile-brokerage">
                      {categoryLabel(agent.category, L)}{agent.crea_member ? ' · REALTOR®' : ''} · {agent.brokerage_name}
                    </div>
                    {agent.languages.length > 0 && (
                      <div className="mt-2 text-[13.5px] text-body-2">{zh ? '服务语言：' : 'Languages: '}{agent.languages.map((c) => languageLabel(c, L)).join(' · ')}</div>
                    )}
                    <div className="mt-1 text-[12.5px] text-body-3">{zh ? `${agent.joined} 加入 Stayloop` : `On Stayloop since ${agent.joined}`}</div>
                  </div>
                </div>
                <div className="mt-4"><AgentBadge agent={agent} lang={L} /></div>
              </section>

              {activity && (
                <section className="rounded-2xl border border-line-divider bg-white p-6" data-testid="agent-profile-activity">
                  <h2 className="text-[16px] font-bold">{zh ? '在 Stayloop 上' : 'On Stayloop'}</h2>
                  <div className="mt-3 grid grid-cols-3 gap-3">
                    {[
                      { n: activity.clients, zh: '客户', en: 'Clients' },
                      { n: activity.confirmed_delegations, zh: '客户确认过的委托', en: 'Delegations confirmed by clients' },
                      { n: activity.listings, zh: '在租房源', en: 'Listings for rent' },
                    ].map((s) => (
                      <div key={s.en} className="rounded-xl bg-[#F5F8FF] px-3 py-3">
                        <div className="text-[24px] font-extrabold text-[#1D4ED8]">{s.n}</div>
                        <div className="text-[12px] leading-snug text-body-2">{zh ? s.zh : s.en}</div>
                      </div>
                    ))}
                  </div>
                  <p className="mt-2 text-[11.5px] text-body-3">{zh ? 'Stayloop 上的实时计数，由经纪本人选择公开。不含平台以外的成交。' : 'Live counts from Stayloop, published by the agent. Deals outside Stayloop are not included.'}</p>
                </section>
              )}

              {agent.bio && (
                <section className="rounded-2xl border border-line-divider bg-white p-6">
                  <h2 className="text-[16px] font-bold">{zh ? '关于我' : 'About'}</h2>
                  <p className="mt-2 whitespace-pre-line text-[14.5px] leading-[1.7] text-body-2">{agent.bio}</p>
                </section>
              )}

              {(agent.focus.length > 0 || agent.service_areas.length > 0) && (
                <section className="rounded-2xl border border-line-divider bg-white p-6">
                  {agent.focus.length > 0 && (
                    <>
                      <h2 className="text-[16px] font-bold">{zh ? '专长' : 'Focus'}</h2>
                      <div className="mt-2 flex flex-wrap gap-2">{agent.focus.map((c) => <span key={c} className="rounded-full bg-[#EFF4FF] px-3 py-1 text-[12.5px] font-semibold text-[#1D4ED8]">{focusLabel(c, L)}</span>)}</div>
                    </>
                  )}
                  {agent.service_areas.length > 0 && (
                    <>
                      <h2 className={`${agent.focus.length ? 'mt-5' : ''} text-[16px] font-bold`}>{zh ? '服务区域' : 'Areas'}</h2>
                      <div className="mt-2 flex flex-wrap gap-2">{agent.service_areas.map((a) => <span key={a} className="rounded-full border border-line-divider px-3 py-1 text-[12.5px] text-body-2">{a}</span>)}</div>
                    </>
                  )}
                </section>
              )}

              {cards.length > 0 && (
                <section className="rounded-2xl border border-line-divider bg-white p-6" data-testid="agent-profile-listings">
                  <h2 className="text-[16px] font-bold">{zh ? 'TA 在 Stayloop 发布的在租房源' : 'Listings they publish on Stayloop'}</h2>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    {cards.map((c) => (
                      <Link key={c.id} href={`/listings/${c.slug}`} className="flex gap-3 rounded-xl border border-line-divider p-2 transition hover:border-[#2563EB]">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {c.images?.[0] ? <img src={c.images[0]} alt="" className="h-20 w-28 shrink-0 rounded-lg object-cover" /> : <div className="h-20 w-28 shrink-0 rounded-lg bg-[#EEF1F5]" />}
                        <div className="min-w-0 py-1">
                          <div className="truncate text-[13.5px] font-semibold">{c.address ? listingTitle(c.address, c.unit) : (c.city || (zh ? '地址暂不公开' : 'Address not shown'))}</div>
                          <div className="text-[13px] font-bold text-body">${Math.round(c.monthly_rent).toLocaleString('en-CA')}{zh ? '/月' : '/mo'}</div>
                          <div className="text-[12px] text-body-3">{c.bedrooms ?? '–'} {zh ? '卧' : 'bd'} · {c.bathrooms ?? '–'} {zh ? '卫' : 'ba'}{c.is_test ? (zh ? ' · 测试房源' : ' · Test listing') : ''}</div>
                        </div>
                      </Link>
                    ))}
                  </div>
                </section>
              )}
            </div>

            <aside className="min-w-0">
              <div className="rounded-2xl border border-line-divider bg-white p-6 lg:sticky lg:top-24">
                <h2 className="text-[16px] font-bold">{zh ? `联系 ${agent.name}` : `Contact ${agent.name}`}</h2>
                {isMine ? (
                  <div className="mt-2 text-[13.5px] text-body-2" data-testid="agent-profile-own">
                    {zh ? '这是你的主页。' : 'This is your profile.'} <Link href="/agent/verify" className="font-semibold text-brand underline">{zh ? '编辑主页' : 'Edit profile'}</Link>
                  </div>
                ) : !auth.loading && !auth.user ? (
                  <div className="mt-2 text-[13.5px] text-body-2" data-testid="agent-profile-signin">
                    {zh ? '登录后可以在站内给这位经纪发消息，回复会出现在你的消息中心。' : 'Sign in to message this agent on Stayloop; replies arrive in your message centre.'}
                    <Link href={`/login?redirect=${encodeURIComponent(`/agents/${slug}`)}`} className="sl-btn-primary mt-4 block text-center">{zh ? '登录后联系' : 'Sign in to contact'}</Link>
                  </div>
                ) : (
                  <ContactForm slug={slug} agentName={agent.name} zh={zh} />
                )}
              </div>
            </aside>
          </div>
        )}
        {agent && (
          <p className="mt-8 max-w-[860px] text-[12px] leading-relaxed text-body-3">
            {zh
              ? `Stayloop 不是经纪公司，不参与交易，不收取佣金或转介费。${agent.name} 的经纪服务由 ${agent.brokerage_name} 提供。核验只表示核验当天在 RECO 公开注册库上处于注册状态，不是 Stayloop 的推荐或背书。`
              : `Stayloop is not a brokerage, takes no part in trades and receives no commission or referral fee. ${agent.name}’s brokerage services are provided by ${agent.brokerage_name}. Verification only means registered on RECO’s public register on the day checked; it is not a recommendation or endorsement by Stayloop.`}
          </p>
        )}
      </main>
      <Footer />
    </div>
  )
}

function ContactForm({ slug, agentName, zh }: { slug: string; agentName: string; zh: boolean }) {
  const [role, setRole] = useState<'tenant' | 'landlord'>('tenant')
  const [area, setArea] = useState('')
  const [budget, setBudget] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [sentThread, setSentThread] = useState<string | null>(null)

  async function send() {
    setErr(null)
    if (message.trim().length < CONTACT_MIN) return setErr(zh ? `多写几句，至少 ${CONTACT_MIN} 个字。` : `Please write at least ${CONTACT_MIN} characters.`)
    setBusy(true)
    const { data: s } = await supabase.auth.getSession()
    const token = s.session?.access_token
    if (!token) { setBusy(false); return setErr(zh ? '请先登录。' : 'Please sign in first.') }
    const res = await fetch(`/api/agents/${encodeURIComponent(slug)}/contact`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ role, area, budget, message }),
    })
    const data = await res.json().catch(() => ({}))
    setBusy(false)
    if (res.ok && data?.thread_id) { setSentThread(String(data.thread_id)); return }
    const e = String(data?.error || res.status)
    setErr(e === 'rate_limited' ? (zh ? '发得太频繁了，请过一会儿再试。' : 'Too many messages. Please try again a little later.')
      : e === 'own_profile' ? (zh ? '不能给自己发消息。' : 'You cannot message yourself.')
      : e === 'message_length' ? (zh ? `消息长度要在 ${CONTACT_MIN}–${CONTACT_MAX} 字之间。` : `Messages must be ${CONTACT_MIN}–${CONTACT_MAX} characters.`)
      : (zh ? '没发出去，请稍后再试。' : 'Could not send — please try again shortly.'))
  }

  if (sentThread) {
    return (
      <div className="mt-3 rounded-xl bg-emerald-50 px-3 py-3 text-[13.5px] text-emerald-800" data-testid="agent-contact-sent">
        {zh ? `已发给 ${agentName}。TA 的回复会出现在你的消息中心。` : `Sent to ${agentName}. Their reply will arrive in your message centre.`}
        <Link href={`/messages?t=${sentThread}`} className="mt-2 block font-semibold underline">{zh ? '打开这段对话' : 'Open the conversation'}</Link>
      </div>
    )
  }
  const input = 'w-full rounded-xl border border-line-divider px-3 py-2 text-[14px] outline-none focus:border-brand'
  return (
    <div className="mt-3 space-y-3" data-testid="agent-contact-form">
      <div className="flex gap-2">
        {(['tenant', 'landlord'] as const).map((r) => (
          <button key={r} type="button" onClick={() => setRole(r)}
            className={'flex-1 rounded-xl border px-3 py-2 text-[13px] ' + (role === r ? 'border-[#2563EB] bg-[#EFF4FF] font-semibold text-[#1D4ED8]' : 'border-line-divider text-body-2')}>
            {r === 'tenant' ? (zh ? '我想租房' : 'I want to rent') : (zh ? '我有房要出租' : 'I have a place to rent out')}
          </button>
        ))}
      </div>
      <input className={input} value={area} maxLength={160} onChange={(e) => setArea(e.target.value)} placeholder={zh ? '区域（可选）' : 'Area (optional)'} />
      <input className={input} value={budget} maxLength={80} onChange={(e) => setBudget(e.target.value)} placeholder={role === 'tenant' ? (zh ? '预算（可选），例如 $2,500/月' : 'Budget (optional), e.g. $2,500/mo') : (zh ? '期望租金（可选）' : 'Expected rent (optional)')} />
      <textarea className={`${input} min-h-[120px]`} value={message} maxLength={CONTACT_MAX} onChange={(e) => setMessage(e.target.value)}
        placeholder={zh ? '说说你的情况：什么时候、几个人、有什么要求。' : 'Tell them about your situation: when, how many people, what you need.'} />
      <p className="text-[11.5px] leading-relaxed text-body-3">
        {zh
          ? '发送后，这位经纪会收到你的显示名和登录邮箱，并把你记进 TA 的客户表，在 Stayloop 站内回复你。'
          : 'When you send, this agent receives your display name and sign-in email, adds you to their client list and replies on Stayloop.'}
      </p>
      {err && <div className="text-[12.5px] font-semibold text-red-700" data-testid="agent-contact-error">⚠ {err}</div>}
      <button onClick={send} disabled={busy} className="sl-btn-primary w-full !py-[10px] disabled:opacity-50" data-testid="agent-contact-send">{busy ? '…' : (zh ? '发送消息' : 'Send message')}</button>
    </div>
  )
}
