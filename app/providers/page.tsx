'use client'

// /providers — the repair-provider directory (2026-11-16, design/find-directory-2026-11-16.md),
// the 维修服务 tab of 「找经纪和服务商」. The verified part of the landlord's provider page, shown
// to every signed-in hat: view and contact only — dispatch stays with the landlord, on the
// maintenance page. Anonymous visitors see the trades and a sign-in prompt, never a provider
// (provider_directory is readable by signed-in accounts only). Fixed order, no ranking, no
// commission (lib/marketplace/directory.ts).
// 2026-11-22: the cards are the agent directory's card (components/directory/ProviderCard.tsx) —
// avatar, name, badge, trades, cities, the e-mail address and phone number, 看主页 / 发消息 — and
// each one opens the provider's own page, /providers/<id>, where the credentials, the website and
// the message form live.
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import FindHeader from '@/components/directory/FindHeader'
import ProviderCard from '@/components/directory/ProviderCard'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/useAuth'
import { activeHat, useHats } from '@/lib/useHats'
import { useHomeHref } from '@/lib/useHomeHref'
import { displayIdentity } from '@/lib/displayIdentity'
import { useT } from '@/lib/i18n'
import { CITIES, isProfessionalTrade, TRADES, type Trade } from '@/lib/marketplace/trades'
import { priceLine, providerDisplayName, repairDirectory, type DirectoryCredential, type DirectoryProvider, type DirectoryReview } from '@/lib/marketplace/directory'
import { useMarketplaceConfig } from '@/lib/marketplace/config'

const REPAIR_TRADES = TRADES.filter((t) => !isProfessionalTrade(t.key))

export default function RepairDirectoryPage() {
  const { lang } = useT()
  const zh = lang === 'zh'
  const auth = useAuth()
  const hats = useHats()
  const home = useHomeHref()
  const { graceDays } = useMarketplaceConfig()
  const [providers, setProviders] = useState<DirectoryProvider[] | null>(null)
  const [creds, setCreds] = useState<DirectoryCredential[]>([])
  const [reviews, setReviews] = useState<DirectoryReview[]>([])
  const [failed, setFailed] = useState(false)
  const [trade, setTrade] = useState<Trade | 'all'>('all')
  const [city, setCity] = useState<string>('all')
  const [q, setQ] = useState('')

  useEffect(() => {
    const t = new URL(window.location.href).searchParams.get('trade')
    if (t && REPAIR_TRADES.some((x) => x.key === t)) setTrade(t as Trade)
  }, [])
  useEffect(() => {
    if (auth.loading || !auth.user) return
    let on = true
    void (async () => {
      const { data, error } = await supabase.from('provider_directory').select('id, legal_name, trade_name, trades, service_cities, pricing_mode, call_out_fee, hourly_rate, contact_email, contact_phone, verified_at').limit(200)
      if (!on) return
      if (error) { setFailed(true); return }
      const list = (data ?? []) as DirectoryProvider[]
      const ids = list.map((p) => p.id)
      const [{ data: c }, { data: r }] = await Promise.all([
        ids.length ? supabase.from('provider_credentials_public').select('provider_id, kind, expires_at, verified_at').in('provider_id', ids) : Promise.resolve({ data: [] }),
        ids.length ? supabase.from('provider_review_stats').select('provider_id, overall, reviews').in('provider_id', ids) : Promise.resolve({ data: [] }),
      ])
      if (!on) return
      setFailed(false)
      setProviders(list); setCreds((c ?? []) as DirectoryCredential[]); setReviews((r ?? []) as DirectoryReview[])
    })()
    return () => { on = false }
  }, [auth.loading, auth.user])

  const rows = useMemo(() => {
    const all = repairDirectory(providers ?? [], creds, reviews, { trade, city }, new Date(), graceDays)
    const needle = q.trim().toLowerCase()
    return needle ? all.filter((r) => `${r.p.trade_name ?? ''} ${r.p.legal_name}`.toLowerCase().includes(needle)) : all
  }, [providers, creds, reviews, trade, city, q, graceDays])
  const filtered = trade !== 'all' || city !== 'all' || q.trim() !== ''
  // The same identity the header names (lib/displayIdentity.ts); it only picks the hint line — everyone sees the same directory.
  const who = auth.user && !hats.loading ? displayIdentity('/providers', home.onProvider, activeHat(hats, auth.role), hats) : null
  // Explicit height: WebKit keeps a styled <select> at its native height and ignores the vertical padding, so the
  // dropdowns sat 26px tall beside 42px text inputs in Safari (2026-11-18). 42px at the 16px phone font, 39px at 14px.
  const sel = 'h-[42px] rounded-xl border border-line-divider bg-white px-3 py-2 text-[14px] outline-none focus:border-brand lg:h-[39px]'

  return (
    <div style={{ background: '#FFFFFF' }} className="text-body">
      <Header variant="transparent" />
      <FindHeader active="repairs">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-[20px] font-semibold tracking-tight">{zh ? '维修服务商' : 'Repair providers'}</h2>
          <span className="rounded-full border border-line-divider bg-white px-3 py-[3px] text-[12.5px]" data-testid="providers-pilot">{zh ? '试点 · 多伦多及周边' : 'Pilot · Toronto and nearby'}</span>
        </div>
        <p className="mt-2 max-w-[720px] text-[14.5px] leading-[1.6] text-body-2">
          {zh
            ? '水管、电气、供暖这类上门维修。每一家的资质都由 Stayloop 工作人员对照公开注册库人工核过，到期就不再算数。'
            : 'Plumbing, electrical, heating and other on-site repairs. Stayloop staff check each provider’s credentials by hand against the public registers; an expired credential stops counting.'}
        </p>
        {who === 'tenant' && (
          <div className="mt-4 flex max-w-[760px] flex-wrap items-center gap-3 rounded-2xl border border-line-divider bg-white px-4 py-3 text-[14px] leading-relaxed" data-testid="providers-role-hint">
            <span className="min-w-0 flex-1">{zh ? '租的房子里东西坏了，先报修。维修由房东负责安排，正常使用坏掉的也不该由你出钱。' : 'Something broke in your rental? File a repair request first. The landlord arranges repairs, and normal wear is not yours to pay for.'}</span>
            <Link href="/tenant/maintenance" className="sl-btn-primary !px-4 !py-2 !text-[13px]">{zh ? '去报修' : 'Request a repair'}</Link>
          </div>
        )}
        {who === 'landlord' && (
          <div className="mt-4 max-w-[760px] rounded-2xl border border-line-divider bg-white px-4 py-3 text-[14px] leading-relaxed" data-testid="providers-role-hint">
            {zh ? '派单在维修页；这里只是浏览。' : 'Dispatch happens on the maintenance page; this is for browsing.'}{' '}
            <Link href="/landlord/providers" className="font-semibold text-brand underline-offset-2 hover:underline">{zh ? '管理我的服务商与派单策略 →' : 'Manage my providers and dispatch policy →'}</Link>
          </div>
        )}
        {who === 'provider' && (
          <div className="mt-4 max-w-[760px] rounded-2xl border border-line-divider bg-white px-4 py-3 text-[14px] leading-relaxed" data-testid="providers-role-hint">
            {zh ? '这是你在目录里的样子。' : 'This is how you appear in the directory.'}{' '}
            <Link href="/provider/onboard" className="font-semibold text-brand underline-offset-2 hover:underline">{zh ? '更新入驻资料 →' : 'Update your profile →'}</Link>
          </div>
        )}
        {auth.user && (
          <div className="mt-5 grid gap-2 sm:grid-cols-3 lg:max-w-[860px]" data-testid="providers-filters">
            <input className={`${sel} min-w-0`} value={q} maxLength={60} onChange={(e) => setQ(e.target.value)} placeholder={zh ? '服务商名称' : 'Provider name'} aria-label={zh ? '服务商名称' : 'Provider name'} data-testid="providers-q" />
            <select className={`${sel} min-w-0`} value={trade} onChange={(e) => setTrade(e.target.value as Trade | 'all')} aria-label={zh ? '工种' : 'Trade'}>
              <option value="all">{zh ? '全部工种' : 'All trades'}</option>
              {REPAIR_TRADES.map((t) => <option key={t.key} value={t.key}>{zh ? t.zh : t.en}</option>)}
            </select>
            <select className={`${sel} min-w-0`} value={city} onChange={(e) => setCity(e.target.value)} aria-label={zh ? '城市' : 'City'}>
              <option value="all">{zh ? '全部城市' : 'All cities'}</option>
              {CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        )}
      </FindHeader>

      <main className="mx-auto max-w-[1320px] px-6 pb-16 sm:px-8 lg:px-12">
        {!auth.loading && !auth.user && (
          <div data-testid="providers-anon">
            <p className="rounded-2xl border border-line-divider bg-surface-chip/40 p-5 text-[14px]" data-testid="providers-signin">
              {zh ? '登录后可以看到服务商与联系方式。' : 'Sign in to see providers and their contact details.'}{' '}
              <Link href="/login?next=/providers" className="font-semibold text-brand underline-offset-2 hover:underline">{zh ? '去登录 →' : 'Sign in →'}</Link>
            </p>
            <div className="mt-6 text-[13px] font-semibold text-body-2">{zh ? '目录里有这些工种' : 'Trades in the directory'}</div>
            <div className="mt-2 flex flex-wrap gap-2" data-testid="providers-trades">
              {REPAIR_TRADES.map((t) => <span key={t.key} className="rounded-full border border-line-divider bg-white px-3 py-1 text-[13px]">{zh ? t.zh : t.en}</span>)}
            </div>
          </div>
        )}
        {auth.user && failed && <div className="rounded-xl bg-amber-50 px-4 py-3 text-[13.5px] text-amber-800">{zh ? '暂时读不到服务商列表，请稍后刷新。' : 'Could not load providers right now. Please refresh shortly.'}</div>}
        {auth.user && !failed && providers === null && <div className="py-10 text-[14px] text-body-3">…</div>}
        {auth.user && !failed && providers !== null && rows.length === 0 && (
          <div className="rounded-2xl border border-line-divider bg-white p-6 text-[14px] leading-relaxed text-body-2" data-testid="providers-empty">
            {filtered && (providers?.length ?? 0) > 0
              ? (zh ? '没有符合条件的服务商，换个条件试试。' : 'No providers match. Try other filters.')
              : (zh ? '这个类别暂时还没有入驻的服务商。' : 'No provider has joined in this category yet.')}
          </div>
        )}
        {auth.user && !failed && rows.length > 0 && (
          <>
            <div className="text-[15px] font-semibold" data-testid="providers-count">{zh ? `${rows.length} 家服务商` : `${rows.length} ${rows.length === 1 ? 'provider' : 'providers'}`}</div>
            <p className="mt-1 text-[12px] text-body-3" data-testid="providers-order-note">
              {zh ? '排序固定：资质齐全的排在前面，其次按入驻先后；没有推荐位，也不收排名费。' : 'The order is fixed: providers with every credential in place come first, then by when they joined; no featured slots, no fee for position.'}
            </p>
            <div className="mt-4 grid gap-4 lg:grid-cols-2" data-testid="providers-grid">
              {rows.map(({ p, trades, avg, reviews: n }) => (
                <ProviderCard
                  key={p.id}
                  id={p.id}
                  name={providerDisplayName(p)}
                  legalName={p.legal_name}
                  zh={zh}
                  badge={{ ok: true, label: `${zh ? '资质已核' : 'Verified'}${p.verified_at ? ` · ${p.verified_at.slice(0, 10)}` : ''}` }}
                  rating={avg != null ? `★ ${avg} (${n})` : (zh ? '还没有评价' : 'No reviews yet')}
                  chips={trades.map((c) => { const d = TRADES.find((x) => x.key === c.t); return { key: c.t, label: d ? (zh ? d.zh : d.en) : c.t, ok: c.ok } })}
                  cities={p.service_cities ?? []}
                  detail={priceLine(p, zh)}
                  email={p.contact_email}
                  phone={p.contact_phone}
                />
              ))}
            </div>
          </>
        )}
        <p className="mt-8 max-w-[860px] text-[12px] leading-relaxed text-body-3" data-testid="providers-verified-note">
          {zh
            ? '「资质已核」只表示核验当天该编号在公开注册库上有效，不是 Stayloop 的推荐或担保。你和服务商直接联系、直接结算，Stayloop 不经手资金。'
            : '“Verified” only means the number was valid on the public register on the day checked; it is not a recommendation or guarantee by Stayloop. You contact and pay the provider directly; Stayloop handles no money.'}
        </p>
        <p className="mt-2 text-[12.5px] text-body-3">
          <Link href="/services" className="underline">{zh ? '维修与服务网络怎么运作' : 'How the repairs network works'}</Link>
          {' · '}
          {zh ? '你是服务商？' : 'Are you a provider?'}{' '}
          <Link href="/provider/onboard" className="underline">{zh ? '申请入驻' : 'Apply to join'}</Link>
        </p>
      </main>
      <Footer />
    </div>
  )
}
