'use client'

// The agent's public profile settings (/agent/verify, below the RECO form). Off by default;
// only a verified, live registration can publish. Saves through the agent's own
// row-level update; the database checks the slug format, uniqueness and sizes.
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { isRegistrationLive, type AgentStatus } from '@/lib/agentProfile'
import {
  AGENT_FOCUS, AGENT_LANGUAGES, BIO_MAX, bioProblem, cleanAreas, cleanFocus, cleanLanguages, isValidSlug, normalizeSlug, suggestSlug,
} from '@/lib/agentPublic'

type Fields = {
  public_profile: boolean
  profile_slug: string | null
  bio: string | null
  languages: string[] | null
  service_areas: string[] | null
  focus: string[] | null
  show_activity: boolean
}

const COLS = 'public_profile, profile_slug, bio, languages, service_areas, focus, show_activity'

export default function PublicProfileEditor({ authId, legalName, status, lang }: { authId: string; legalName: string; status: AgentStatus; lang: 'zh' | 'en' }) {
  const zh = lang === 'zh'
  const live = isRegistrationLive(status)
  const [loaded, setLoaded] = useState(false)
  const [pub, setPub] = useState(false)
  const [slug, setSlug] = useState('')
  const [bio, setBio] = useState('')
  const [langs, setLangs] = useState<string[]>([])
  const [focus, setFocus] = useState<string[]>([])
  const [areas, setAreas] = useState('')
  const [showActivity, setShowActivity] = useState(false)
  const [savedSlug, setSavedSlug] = useState<string | null>(null)
  const [savedPublic, setSavedPublic] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  useEffect(() => {
    let on = true
    supabase.from('agent_profiles').select(COLS).eq('auth_id', authId).maybeSingle().then(({ data }) => {
      if (!on) return
      const r = (data as Fields | null) ?? null
      setPub(!!r?.public_profile)
      setSlug(r?.profile_slug || suggestSlug(legalName, authId))
      setBio(r?.bio || '')
      setLangs(cleanLanguages(r?.languages ?? []))
      setFocus(cleanFocus(r?.focus ?? []))
      setAreas((r?.service_areas ?? []).join('、'))
      setShowActivity(!!r?.show_activity)
      setSavedSlug(r?.profile_slug ?? null)
      setSavedPublic(!!r?.public_profile)
      setLoaded(true)
    })
    return () => { on = false }
  }, [authId, legalName])

  const toggle = (list: string[], v: string, set: (x: string[]) => void) => set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v])

  async function save() {
    setErr(null); setOk(null)
    const s = normalizeSlug(slug)
    if (!isValidSlug(s)) return setErr(zh ? '主页地址只能用小写字母、数字和短横线，3–60 个字符。' : 'The address may use lowercase letters, digits and hyphens, 3–60 characters.')
    const b = bio.trim()
    const p = bioProblem(b)
    if (p === 'too_long') return setErr(zh ? `自我介绍最多 ${BIO_MAX} 字。` : `The introduction can be at most ${BIO_MAX} characters.`)
    if (p === 'contact_details') return setErr(zh ? '自我介绍里不要写网址、邮箱或电话——联系都走 Stayloop 站内消息。' : 'Leave links, email addresses and phone numbers out of the introduction — contact goes through Stayloop messages.')
    if (pub && !live) return setErr(zh ? 'RECO 核验通过后才能公开主页。' : 'You can publish once your RECO registration is verified.')
    setBusy(true)
    const patch = {
      public_profile: pub && live, profile_slug: s, bio: b || null,
      languages: cleanLanguages(langs), focus: cleanFocus(focus),
      service_areas: cleanAreas(areas.split(/[,，、;；\n]+/)), show_activity: showActivity,
    }
    const { error } = await supabase.from('agent_profiles').update(patch).eq('auth_id', authId)
    setBusy(false)
    if (error) {
      if (error.code === '23505') return setErr(zh ? '这个主页地址已经被别人用了，换一个试试。' : 'That address is taken — try another.')
      if (error.code === '23514') return setErr(zh ? '有一项超出了限制（地址格式、介绍长度或选项数量），请检查后再保存。' : 'Something is over a limit (address format, introduction length or number of choices). Please check and save again.')
      return setErr(zh ? '没保存上，请稍后再试。' : 'Could not save — try again shortly.')
    }
    setSlug(s); setSavedSlug(s); setSavedPublic(patch.public_profile)
    setOk(patch.public_profile ? (zh ? '已保存，主页已公开。' : 'Saved — your profile is public.') : (zh ? '已保存。主页目前不公开。' : 'Saved. Your profile is not public.'))
  }

  const label = 'flex flex-col gap-1.5 text-[12.5px] font-semibold text-body-2'
  const input = 'rounded-xl border border-line-divider px-3 py-2 text-[14px] font-normal text-body outline-none focus:border-brand'
  const chip = (on: boolean) => 'rounded-full border px-3 py-1 text-[12.5px] ' + (on ? 'border-[#2563EB] bg-[#EFF4FF] font-semibold text-[#1D4ED8]' : 'border-line-divider bg-white text-body-2')

  return (
    <section data-testid="agent-public-profile" className="mt-6 rounded-2xl border border-line-divider bg-white p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[17px] font-bold">{zh ? '公开主页' : 'Public profile'}</h2>
        {savedPublic && savedSlug && (
          <Link href={`/agents/${savedSlug}`} className="text-[13px] font-semibold text-brand underline" data-testid="agent-public-profile-view">{zh ? '查看我的主页 ↗' : 'View my profile ↗'}</Link>
        )}
      </div>
      <p className="mt-1 text-[12.5px] leading-relaxed text-body-3">
        {zh
          ? '公开后，租客和房东可以在「找经纪」里看到你，并在站内给你发消息（会进你的客户表）。主页上会醒目显示你的注册名、注册类别和所属经纪公司；不显示你的邮箱和电话。'
          : 'Once public, tenants and landlords can find you under "Find an agent" and message you on Stayloop (it goes into your client list). The page shows your registered name, category and brokerage prominently; never your email or phone.'}
      </p>
      {!live && (
        <div className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-[12.5px] text-amber-800" data-testid="agent-public-profile-locked">
          {zh ? 'RECO 核验通过后才能公开主页。资料可以先填好保存。' : 'You can publish once your RECO registration is verified. You can fill this in and save it now.'}
        </div>
      )}
      {!loaded ? (
        <div className="mt-4 text-[13px] text-body-3">…</div>
      ) : (
        <div className="mt-4 grid gap-4">
          <label className="flex items-start gap-2 text-[13.5px]">
            <input type="checkbox" className="mt-[3px]" checked={pub} disabled={!live} onChange={(e) => setPub(e.target.checked)} data-testid="agent-public-profile-toggle" />
            <span className="font-semibold">{zh ? '公开我的主页' : 'Make my profile public'}</span>
          </label>
          <label className={label}>
            {zh ? '主页地址' : 'Profile address'}
            <div className="flex items-center gap-1 text-[13px] text-body-3">
              <span className="shrink-0">stayloop.ai/agents/</span>
              <input className={`${input} min-w-0 flex-1`} value={slug} maxLength={60} onChange={(e) => setSlug(e.target.value)} data-testid="agent-public-profile-slug" />
            </div>
          </label>
          <label className={label}>
            <span className="flex justify-between"><span>{zh ? '自我介绍' : 'Introduction'}</span><span className="font-normal text-body-3">{bio.length}/{BIO_MAX}</span></span>
            <textarea className={`${input} min-h-[120px]`} value={bio} maxLength={BIO_MAX} onChange={(e) => setBio(e.target.value)}
              placeholder={zh ? '做了几年租赁、熟悉哪些区域、怎么帮客户。不要写网址、邮箱或电话。' : 'How long you have worked in rentals, the areas you know, how you help clients. No links, email addresses or phone numbers.'} />
          </label>
          <div className={label}>
            {zh ? '服务语言' : 'Languages'}
            <div className="flex flex-wrap gap-2">
              {AGENT_LANGUAGES.map((l) => (
                <button type="button" key={l.code} className={chip(langs.includes(l.code))} onClick={() => toggle(langs, l.code, setLangs)}>{l[lang]}</button>
              ))}
            </div>
          </div>
          <div className={label}>
            {zh ? '专长' : 'Focus'}
            <div className="flex flex-wrap gap-2">
              {AGENT_FOCUS.map((f) => (
                <button type="button" key={f.code} className={chip(focus.includes(f.code))} onClick={() => toggle(focus, f.code, setFocus)}>{f[lang]}</button>
              ))}
            </div>
          </div>
          <label className={label}>
            {zh ? '服务区域（用顿号或逗号分开，最多 12 个）' : 'Areas you serve (separate with commas, up to 12)'}
            <input className={input} value={areas} onChange={(e) => setAreas(e.target.value)} placeholder={zh ? '例如：North York、Markham、Downtown Toronto' : 'e.g. North York, Markham, Downtown Toronto'} />
          </label>
          <label className="flex items-start gap-2 text-[13px]">
            <input type="checkbox" className="mt-[3px]" checked={showActivity} onChange={(e) => setShowActivity(e.target.checked)} data-testid="agent-public-profile-activity" />
            <span>{zh ? '在主页上显示我在 Stayloop 上的真实数字：客户数、客户确认过的委托数、在租房源数。' : 'Show my real numbers on Stayloop on the profile: clients, delegations confirmed by clients, listings for rent.'}</span>
          </label>
          {err && <div className="text-[12.5px] font-semibold text-red-700" data-testid="agent-public-profile-error">⚠ {err}</div>}
          {ok && !err && <div className="text-[12.5px] font-semibold text-emerald-700" data-testid="agent-public-profile-saved">{ok}</div>}
          <div>
            <button onClick={save} disabled={busy} className="sl-btn-primary !py-[10px] disabled:opacity-50" data-testid="agent-public-profile-save">{busy ? '…' : (zh ? '保存主页设置' : 'Save profile settings')}</button>
          </div>
        </div>
      )}
    </section>
  )
}
