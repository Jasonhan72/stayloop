'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import AIProactive from '@/components/AIProactive'
import { VerificationBadge } from '@/components/ListingBadges'
import WorkspaceShell from '@/components/WorkspaceShell'
import { supabase } from '@/lib/supabase'
import { useLandlord } from '@/lib/useLandlord'
import { useT } from '@/lib/i18n'
import { Application, Listing, Plan } from '@/types'

export default function Dashboard() {
  const { lang } = useT()
  const { landlord, loading: authLoading } = useLandlord()
  const [applications, setApplications] = useState<Application[]>([])
  const [listings, setListings] = useState<Listing[]>([])
  const [plan, setPlan] = useState<Plan>('free')
  const [loading, setLoading] = useState(true)
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null)
  const [deletingListing, setDeletingListing] = useState<Listing | null>(null)
  const [deleteReason, setDeleteReason] = useState('')
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [origin, setOrigin] = useState('')
  const [showUpgrade, setShowUpgrade] = useState(false)
  // Listing display mode — persisted so the choice sticks across visits.
  const [listingView, setListingView] = useState<'grid' | 'list'>('grid')
  useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('sl-listing-view') : null
    if (saved === 'list' || saved === 'grid') setListingView(saved)
  }, [])
  const switchView = (v: 'grid' | 'list') => {
    setListingView(v)
    try { localStorage.setItem('sl-listing-view', v) } catch {}
  }
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [portalLoading, setPortalLoading] = useState(false)
  const [checkoutBanner, setCheckoutBanner] = useState<null | 'pending' | 'success' | 'cancel'>(null)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setOrigin(window.location.origin)
      const qp = new URL(window.location.href).searchParams
      if (qp.get('upgrade') === '1') setShowUpgrade(true)
      const checkout = qp.get('checkout')
      if (checkout === 'success') setCheckoutBanner('pending')
      if (checkout === 'cancel') setCheckoutBanner('cancel')
    }
    if (landlord) fetchAll()
  }, [landlord])

  // Poll landlords.plan after returning from Stripe Checkout
  useEffect(() => {
    if (checkoutBanner !== 'pending' || !landlord) return
    if (plan === 'pro' || plan === 'team') {
      setCheckoutBanner('success')
      setShowUpgrade(false)
      if (typeof window !== 'undefined') {
        const u = new URL(window.location.href)
        u.searchParams.delete('checkout')
        u.searchParams.delete('session_id')
        window.history.replaceState({}, '', u.toString())
      }
      return
    }
    let cancelled = false
    let tries = 0
    const tick = async () => {
      if (cancelled) return
      tries += 1
      const { data } = await supabase
        .from('landlords')
        .select('plan')
        .or(`id.eq.${landlord.landlordId},auth_id.eq.${landlord.landlordId}`)
        .maybeSingle()
      if (cancelled) return
      if (data?.plan && data.plan !== plan) {
        setPlan(data.plan as Plan)
        return
      }
      if (tries >= 20) return
      setTimeout(tick, 1000)
    }
    tick()
    return () => {
      cancelled = true
    }
  }, [checkoutBanner, landlord, plan])

  async function startCheckout() {
    if (plan === 'pro' || plan === 'team') return
    setCheckoutLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) throw new Error('not signed in')
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      const data = await res.json()
      if (!res.ok || !data.url) throw new Error(data.error || 'checkout failed')
      window.location.href = data.url
    } catch (err: any) {
      alert(`Checkout error: ${err?.message || 'unknown'}`)
      setCheckoutLoading(false)
    }
  }

  async function openBillingPortal() {
    setPortalLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) throw new Error('not signed in')
      const res = await fetch('/api/stripe/portal', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      const data = await res.json()
      if (!res.ok || !data.url) throw new Error(data.error || 'portal failed')
      window.location.href = data.url
    } catch (err: any) {
      const msg = String(err?.message || '')
      if (msg.includes('no stripe customer')) {
        // Comped / directly-granted Pro — there is no Stripe subscription to
        // manage, and that is not an error worth alarming anyone about.
        alert(lang === 'zh'
          ? '你的 Pro 由 Stayloop 直接开通，没有需要管理的 Stripe 订阅。'
          : 'Your Pro plan was granted directly by Stayloop — there is no Stripe subscription to manage.')
      } else {
        alert(`Billing portal error: ${msg || 'unknown'}`)
      }
      setPortalLoading(false)
    }
  }

  async function fetchAll() {
    setLoading(true)
    const [appsRes, listingsRes, planRes] = await Promise.all([
      supabase.from('applications').select('*, listing:listings(*)').order('created_at', { ascending: false }),
      supabase.from('listings').select('*').eq('landlord_id', landlord!.landlordId).order('created_at', { ascending: false }),
      supabase.from('landlords').select('plan').or(`id.eq.${landlord!.landlordId},auth_id.eq.${landlord!.landlordId}`).maybeSingle(),
    ])
    if (appsRes.data) setApplications(appsRes.data as Application[])
    if (listingsRes.data) setListings(listingsRes.data as Listing[])
    if (planRes.data?.plan) setPlan(planRes.data.plan as Plan)
    setLoading(false)
  }

  async function copyLink(slug: string) {
    const url = `${origin}/apply/${slug}`
    await navigator.clipboard.writeText(url)
    setCopiedSlug(slug)
    setTimeout(() => setCopiedSlug(null), 1500)
  }

  const DELETE_REASONS = lang === 'zh'
    ? ['已找到租客', '房源已出售', '信息有误 / 重复发布', '暂时下架', '其他原因']
    : ['Tenant found', 'Property sold', 'Incorrect / duplicate listing', 'Temporarily delisting', 'Other']

  async function handleDeleteListing() {
    if (!deletingListing || !deleteReason) return
    setDeleteLoading(true)
    try {
      const { error } = await supabase
        .from('listings')
        .update({ is_active: false, status: 'deleted' })
        .eq('id', deletingListing.id)
      if (error) throw error
      setListings((prev) => prev.filter((l) => l.id !== deletingListing.id))
      setDeletingListing(null)
      setDeleteReason('')
    } catch (e: any) {
      alert(e?.message || 'Delete failed')
    } finally {
      setDeleteLoading(false)
    }
  }

  async function toggleListingActive(id: string, currentlyActive: boolean) {
    const next = !currentlyActive
    const { error } = await supabase.from('listings').update({ is_active: next }).eq('id', id)
    if (error) { alert(error.message); return }
    setListings((prev) => prev.map((l) => l.id === id ? { ...l, is_active: next } : l))
  }

  const stats = {
    total: applications.length,
    approved: applications.filter((a) => a.status === 'approved').length,
    pending: applications.filter((a) => a.status === 'new' || a.status === 'reviewing').length,
    flags: applications.filter((a) => (a.ltb_records_found || a.court_search_count || 0) > 0).length,
  }

  const scoreColor = (s?: number | null) => {
    if (!s) return { bg: 'bg-line-divider', fg: 'text-body-3' }
    if (s >= 85) return { bg: 'bg-success/15', fg: 'text-success' }
    if (s >= 70) return { bg: 'bg-brand/15', fg: 'text-brand' }
    if (s >= 50) return { bg: 'bg-warning/15', fg: 'text-warning' }
    return { bg: 'bg-danger/15', fg: 'text-danger' }
  }

  if (authLoading || !landlord) {
    return (
      <WorkspaceShell role="landlord" hideAside>
        <div className="flex min-h-[60vh] items-center justify-center">
          <span className="orb landlord pulse h-12 w-12" style={{ color: '#047857' }} />
        </div>
      </WorkspaceShell>
    )
  }

  return (
    <WorkspaceShell role="landlord" hideAside>
      <div className="mx-auto max-w-[1320px]">
          {/* Heading */}
          <div className="mb-8 flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="font-mono text-[11px] font-bold uppercase tracking-eyebrowLg text-brand">
                LANDLORD · OVERVIEW
              </div>
              <h1 className="mt-2 text-[32px] font-bold tracking-tight sm:text-[40px]">
                {lang === 'zh' ? '工作台' : 'Workspace'} · {landlord.fullName || landlord.email.split('@')[0]}
              </h1>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={
                  'rounded-md px-2 py-[4px] font-mono text-[10.5px] font-bold uppercase ' +
                  (plan === 'free'
                    ? 'bg-line-divider text-body-2'
                    : 'bg-brand/15 text-brand')
                }
              >
                {plan}
              </span>
              {plan === 'free' && (
                <button onClick={() => setShowUpgrade(true)} className="sl-btn-primary !py-[10px] !px-4 !text-[13.5px]">
                  {lang === 'zh' ? '升级到 Pro' : 'Upgrade to Pro'}
                </button>
              )}
              {(plan === 'pro' || plan === 'team') && (
                <button
                  onClick={openBillingPortal}
                  disabled={portalLoading}
                  className="sl-btn-secondary"
                >
                  {portalLoading ? (lang === 'zh' ? '打开中…' : 'Opening…') : (lang === 'zh' ? '管理订阅' : 'Manage subscription')}
                </button>
              )}
              <Link href="/dashboard/listings/new" className="sl-btn-primary !py-[10px] !px-4 !text-[13.5px]">
                {lang === 'zh' ? '+ 新建房源' : '+ New listing'}
              </Link>
            </div>
          </div>

          <AIProactive
            role="landlord"
            insights={[
              {
                text: {
                  zh: '89 Estelle 挂牌 12 天还没有意向。定价高于同类约 8%，或文案曝光不足 — {ai} 可以诊断并给出调整建议。',
                  en: '89 Estelle has been listed 12 days with no intents. It prices ~8% above comparables, or the copy is underexposed — {ai} can diagnose it.',
                },
                action: {
                  label: { zh: '诊断这套房源', en: 'Diagnose this listing' },
                  prompt: {
                    zh: '帮我诊断 89 Estelle Avenue 为什么没有申请：定价、文案、照片，给出具体调整建议。',
                    en: 'Diagnose why 89 Estelle Avenue gets no applications — pricing, copy, photos — with concrete fixes.',
                  },
                },
              },
            ]}
          />

          {/* Stats */}
          <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { k: 'total', l: { zh: '总申请数', en: 'Total applications' }, v: stats.total },
              { k: 'approved', l: { zh: '已批准', en: 'Approved' }, v: stats.approved },
              { k: 'pending', l: { zh: '待处理', en: 'Pending' }, v: stats.pending },
              { k: 'flags', l: { zh: 'LTB / 法庭标记', en: 'LTB / court flags' }, v: stats.flags, warn: stats.flags > 0 },
            ].map((s) => (
              <div key={s.k} className="sl-card p-5">
                <div className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrow text-body-3">
                  {s.l[lang]}
                </div>
                <div
                  className={
                    'mt-1 text-[32px] font-bold tracking-tight ' + (s.warn ? 'text-warning' : 'text-body')
                  }
                >
                  {s.v}
                </div>
              </div>
            ))}
          </div>

          {/* Listings */}
          <div className="mb-8">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-brand" />
                <h2 className="text-[16px] font-bold tracking-tight">{lang === 'zh' ? '你的房源' : 'Your listings'}</h2>
                <span className="font-mono text-[11px] text-body-3">{listings.length} {lang === 'zh' ? '套' : 'total'}</span>
              </div>
              {/* Grid / list view switch */}
              <div className="flex overflow-hidden rounded-lg border border-line-strong bg-white">
                {(['grid', 'list'] as const).map((v) => (
                  <button
                    key={v}
                    onClick={() => switchView(v)}
                    title={v === 'grid' ? (lang === 'zh' ? '卡片视图' : 'Card view') : (lang === 'zh' ? '列表视图' : 'List view')}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold transition"
                    style={listingView === v ? { background: '#171717', color: '#fff' } : { color: '#71717A' }}
                  >
                    {v === 'grid' ? (
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>
                    ) : (
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></svg>
                    )}
                    {v === 'grid' ? (lang === 'zh' ? '卡片' : 'Cards') : (lang === 'zh' ? '列表' : 'List')}
                  </button>
                ))}
              </div>
            </div>
            {loading ? (
              <div className="p-10 text-center font-mono text-[12px] text-body-3">{lang === 'zh' ? '加载中…' : 'Loading…'}</div>
            ) : listings.length === 0 ? (
              <div className="sl-card p-12 text-center">
                <div className="text-[36px] opacity-30">▱</div>
                <div className="mt-3 text-[14px] text-body-2">{lang === 'zh' ? '还没有房源。' : 'No listings yet.'}</div>
                <Link
                  href="/dashboard/listings/new"
                  className="mt-2 inline-flex font-semibold text-brand hover:underline"
                >
                  {lang === 'zh' ? '创建你的第一个房源 →' : 'Create your first listing →'}
                </Link>
              </div>
            ) : listingView === 'list' ? (
              <div className="space-y-2.5">
                {listings.map((l) => {
                  const images: string[] = Array.isArray(l.images) ? l.images : []
                  const specs = [
                    l.bedrooms != null ? `${l.bedrooms}${lang === 'zh' ? ' 卧' : ' bd'}` : null,
                    l.bathrooms != null ? `${l.bathrooms}${lang === 'zh' ? ' 浴' : ' ba'}` : null,
                    l.sqft ? `${l.sqft} sqft` : null,
                  ].filter(Boolean).join(' · ')
                  return (
                    <div key={l.id} className="sl-card flex flex-wrap items-center gap-4 p-3.5">
                      <Link href={`/listings/${l.slug}`} className="h-14 w-20 flex-shrink-0 overflow-hidden rounded-lg bg-surface-chip">
                        {images[0] && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={images[0]} alt="" className="h-full w-full object-cover" />
                        )}
                      </Link>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-x-2.5">
                          <span className="text-[16px] font-bold tracking-tight">${l.monthly_rent?.toLocaleString()}<span className="text-[11px] font-medium text-body-3">{lang === 'zh' ? '/月' : '/mo'}</span></span>
                          {specs && <span className="text-[12.5px] font-semibold text-body-2">{specs}</span>}
                        </div>
                        <div className="truncate text-[13px] font-semibold">{l.address}{l.unit ? ` · ${l.unit}` : ''}</div>
                        <div className="truncate text-[11.5px] text-body-3">{[l.neighborhood, l.city].filter(Boolean).join(' · ') || 'Toronto'}</div>
                      </div>
                      <div className="flex flex-shrink-0 flex-wrap items-center gap-1.5">
                        <span className="rounded px-1.5 py-0.5 font-mono text-[9.5px] font-bold uppercase text-white" style={{ background: l.is_active !== false ? '#047857' : '#6B7280' }}>
                          {l.is_active !== false ? (lang === 'zh' ? '上架中' : 'ACTIVE') : (lang === 'zh' ? '已下架' : 'OFF')}
                        </span>
                        <VerificationBadge listing={l as any} variant="dashboard-list" zh={lang === 'zh'} />
                      </div>
                      <div className="flex flex-shrink-0 items-center gap-1 text-[12px] font-semibold">
                        <Link href={`/dashboard/listings/${l.id}/edit`} className="rounded-md px-2.5 py-1.5 text-body transition hover:bg-surface-chip">{lang === 'zh' ? '编辑' : 'Edit'}</Link>
                        <button onClick={() => copyLink(l.slug)} className="rounded-md px-2.5 py-1.5 text-body transition hover:bg-surface-chip">{copiedSlug === l.slug ? '✓' : (lang === 'zh' ? '链接' : 'Link')}</button>
                        <a href={`/listings/${l.slug}`} target="_blank" rel="noreferrer" className="rounded-md px-2.5 py-1.5 text-body transition hover:bg-surface-chip">{lang === 'zh' ? '查看' : 'View'} ↗</a>
                        <button onClick={() => toggleListingActive(l.id, l.is_active !== false)} className="rounded-md px-2.5 py-1.5 transition hover:bg-surface-chip" style={{ color: l.is_active !== false ? '#D97706' : '#047857' }}>
                          {l.is_active !== false ? (lang === 'zh' ? '下架' : 'Off') : (lang === 'zh' ? '上架' : 'On')}
                        </button>
                        <button onClick={() => { setDeletingListing(l); setDeleteReason('') }} className="rounded-md px-2.5 py-1.5 text-body-3 transition hover:bg-danger/5 hover:text-danger">{lang === 'zh' ? '删除' : 'Del'}</button>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {listings.map((l) => {
                  const images: string[] = Array.isArray(l.images) ? l.images : []
                  const hasPhoto = images.length > 0
                  const specs = [
                    l.bedrooms != null ? `${l.bedrooms} ${lang === 'zh' ? '卧' : 'bd'}` : null,
                    l.bathrooms != null ? `${l.bathrooms} ${lang === 'zh' ? '浴' : 'ba'}` : null,
                    l.sqft ? `${l.sqft} sqft` : null,
                  ].filter(Boolean)
                  const amenities: string[] = Array.isArray(l.amenities) ? l.amenities.slice(0, 3) : []
                  return (
                    <div key={l.id} className="sl-card flex flex-col overflow-hidden transition hover:shadow-md">
                      {/* Photo */}
                      <Link href={`/listings/${l.slug}`} className="relative aspect-[1.5/1] w-full bg-surface-chip">
                        {hasPhoto ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={images[0]} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full items-center justify-center">
                            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#D1D5DB" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="3" y="3" width="18" height="18" rx="2" />
                              <circle cx="8.5" cy="8.5" r="1.5" />
                              <path d="m21 15-5-5L5 21" />
                            </svg>
                          </div>
                        )}
                        {/* Status badge */}
                        <span
                          className="absolute left-3 top-3 rounded-md px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-white"
                          style={{ background: l.is_active !== false ? '#047857' : '#6B7280' }}
                        >
                          {l.is_active !== false ? (lang === 'zh' ? '上架中' : 'ACTIVE') : (lang === 'zh' ? '已下架' : 'INACTIVE')}
                        </span>
                        {/* Verification / source badge */}
                        <VerificationBadge listing={l as any} variant="dashboard-grid" zh={lang === 'zh'} />
                        {/* Photo count */}
                        {images.length > 1 && (
                          <span className="absolute bottom-3 right-3 rounded-md bg-black/50 px-2 py-0.5 font-mono text-[11px] font-semibold text-white backdrop-blur">
                            1 / {images.length}
                          </span>
                        )}
                      </Link>

                      {/* Body */}
                      <div className="flex flex-1 flex-col p-4">
                        <div className="text-[20px] font-bold tracking-tight">
                          ${l.monthly_rent?.toLocaleString()}
                          <span className="ml-1 text-[12px] font-medium text-body-3">{lang === 'zh' ? '/月' : '/mo'}</span>
                        </div>
                        {specs.length > 0 && (
                          <div className="mt-1 flex items-center gap-2 text-[13px] font-bold text-body">
                            {specs.map((s, i) => (
                              <span key={s} className="flex items-center gap-2">
                                {i > 0 && <span className="h-[3px] w-[3px] rounded-full bg-line-strong" />}
                                {s}
                              </span>
                            ))}
                          </div>
                        )}
                        <div className="mt-2 text-[14px] font-bold leading-snug">{l.address}{l.unit ? ` · ${l.unit}` : ''}</div>
                        <div className="text-[12.5px] text-body-3">{[l.neighborhood, l.city].filter(Boolean).join(' · ') || 'Toronto'}</div>
                        {amenities.length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-1.5">
                            {amenities.map((a) => (
                              <span key={a} className="rounded-md px-2 py-1 font-mono text-[10.5px] text-success" style={{ background: 'rgba(4,120,87,0.08)' }}>
                                {a}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Action bar */}
                      <div className="flex border-t border-line-divider">
                        <Link
                          href={`/dashboard/listings/${l.id}/edit`}
                          className="flex flex-1 items-center justify-center gap-1.5 border-r border-line-divider py-2.5 text-[12px] font-semibold text-body transition hover:bg-surface-chip"
                        >
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /></svg>
                          {lang === 'zh' ? '编辑' : 'Edit'}
                        </Link>
                        <button
                          onClick={() => copyLink(l.slug)}
                          className="flex flex-1 items-center justify-center gap-1.5 border-r border-line-divider py-2.5 text-[12px] font-semibold text-body transition hover:bg-surface-chip"
                        >
                          {copiedSlug === l.slug ? '✓' : (lang === 'zh' ? '链接' : 'Link')}
                        </button>
                        <a
                          href={`/listings/${l.slug}`}
                          target="_blank"
                          rel="noreferrer"
                          className="flex flex-1 items-center justify-center gap-1.5 border-r border-line-divider py-2.5 text-[12px] font-semibold text-body transition hover:bg-surface-chip"
                        >
                          {lang === 'zh' ? '查看' : 'View'} ↗
                        </a>
                        <button
                          onClick={() => toggleListingActive(l.id, l.is_active !== false)}
                          className="flex flex-1 items-center justify-center gap-1 border-r border-line-divider py-2.5 text-[12px] font-semibold transition hover:bg-surface-chip"
                          style={{ color: l.is_active !== false ? '#D97706' : '#047857' }}
                        >
                          {l.is_active !== false ? (lang === 'zh' ? '下架' : 'Off') : (lang === 'zh' ? '上架' : 'On')}
                        </button>
                        <button
                          onClick={() => { setDeletingListing(l); setDeleteReason('') }}
                          className="flex flex-1 items-center justify-center py-2.5 text-[12px] font-semibold text-body-3 transition hover:bg-danger/5 hover:text-danger"
                        >
                          {lang === 'zh' ? '删除' : 'Del'}
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Applications */}
          <div className="sl-card overflow-hidden">
            <div className="flex items-center justify-between border-b border-line-divider px-6 py-4">
              <div className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-tenant" />
                <h2 className="text-[16px] font-bold tracking-tight">{lang === 'zh' ? '最新申请' : 'Latest applications'}</h2>
              </div>
              <Link
                href="/landlord/applicants"
                className="text-[12.5px] font-semibold text-brand hover:underline"
              >
                {lang === 'zh' ? '查看全部 →' : 'View all →'}
              </Link>
            </div>
            {loading ? (
              <div className="p-10 text-center font-mono text-[12px] text-body-3">{lang === 'zh' ? '加载中…' : 'Loading…'}</div>
            ) : applications.length === 0 ? (
              <div className="p-12 text-center">
                <div className="text-[36px] opacity-30">⌖</div>
                <div className="mt-3 text-[14px] text-body-2">
                  {lang === 'zh'
                    ? '还没收到申请。复制房源链接给租客即可开始。'
                    : 'No applications yet. Copy a listing link and share it with tenants to get started.'}
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-[13.5px]">
                <thead className="bg-surface-chip">
                  <tr>
                    <th className="px-6 py-3 text-left font-mono text-[10.5px] font-bold uppercase tracking-eyebrow text-body-3">{lang === 'zh' ? '申请人' : 'Applicant'}</th>
                    <th className="px-6 py-3 text-left font-mono text-[10.5px] font-bold uppercase tracking-eyebrow text-body-3">{lang === 'zh' ? '房源' : 'Listing'}</th>
                    <th className="px-6 py-3 text-left font-mono text-[10.5px] font-bold uppercase tracking-eyebrow text-body-3">{lang === 'zh' ? '月收入' : 'Monthly income'}</th>
                    <th className="px-6 py-3 text-left font-mono text-[10.5px] font-bold uppercase tracking-eyebrow text-body-3">{lang === 'zh' ? 'AI 分' : 'AI score'}</th>
                    <th className="px-6 py-3 text-left font-mono text-[10.5px] font-bold uppercase tracking-eyebrow text-body-3">LTB</th>
                    <th className="px-6 py-3 text-left font-mono text-[10.5px] font-bold uppercase tracking-eyebrow text-body-3">{lang === 'zh' ? '状态' : 'Status'}</th>
                  </tr>
                </thead>
                <tbody>
                  {applications.map((app) => {
                    const s = app.ai_overall_score ?? app.ai_score ?? null
                    const sc = scoreColor(s)
                    const fullName =
                      app.full_name ||
                      [app.first_name, app.last_name].filter(Boolean).join(' ') ||
                      app.email
                    const flags = app.ltb_records_found ?? app.court_search_count ?? 0
                    return (
                      <tr
                        key={app.id}
                        className="cursor-pointer border-t border-line-divider transition hover:bg-surface-chip"
                        onClick={() => {
                          window.location.href = `/dashboard/applications/${app.id}`
                        }}
                      >
                        <td className="px-6 py-4">
                          <div className="font-bold">{fullName}</div>
                          <div className="font-mono text-[11px] text-body-3">
                            {new Date(app.created_at).toLocaleDateString()}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-body-2">{app.listing?.address}</td>
                        <td className="px-6 py-4 font-mono">
                          {app.monthly_income ? `$${app.monthly_income.toLocaleString()}` : '—'}
                        </td>
                        <td className="px-6 py-4">
                          {s ? (
                            <span
                              className={`rounded-md px-2.5 py-1 font-mono text-[12px] font-bold ${sc.bg} ${sc.fg}`}
                            >
                              {s}
                            </span>
                          ) : (
                            <span className="font-mono text-[11px] text-body-4">pending</span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          {flags > 0 ? (
                            <span className="font-mono text-[12px] text-danger">⚠ {flags}</span>
                          ) : (
                            <span className="font-mono text-[12px] text-success">{lang === 'zh' ? '✓ 无' : '✓ None'}</span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={
                              'rounded-md px-2.5 py-1 font-mono text-[10.5px] font-bold uppercase ' +
                              (app.status === 'approved'
                                ? 'bg-success/10 text-success'
                                : app.status === 'declined'
                                  ? 'bg-danger/10 text-danger'
                                  : 'bg-info/10 text-info')
                            }
                          >
                            {app.status || 'new'}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              </div>
            )}
          </div>
        </div>

      {/* Upgrade modal */}
      {showUpgrade && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-ink/40 p-4 backdrop-blur"
          onClick={() => setShowUpgrade(false)}
        >
          <div
            className="sl-card relative w-full max-w-2xl p-6 sm:p-8"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setShowUpgrade(false)}
              className="absolute right-4 top-4 font-mono text-[12px] text-body-3 hover:text-body"
            >
              ✕
            </button>
            <div className="font-mono text-[11px] font-bold uppercase tracking-eyebrowLg text-brand">
              UPGRADE
            </div>
            <h2 className="mt-2 text-[24px] font-bold tracking-tight">{lang === 'zh' ? '选择你的方案' : 'Choose your plan'}</h2>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <div
                className={
                  'rounded-2xl p-5 ' +
                  (plan === 'free' ? 'border border-brand/40 bg-brand/5' : 'border border-line-divider bg-white')
                }
              >
                <div className="font-mono text-[11px] font-bold uppercase tracking-eyebrow text-body-3">
                  Free
                </div>
                <div className="mt-1 text-[32px] font-bold tracking-tight">
                  $0<span className="text-[14px] font-medium text-body-3">/mo</span>
                </div>
                <ul className="mt-4 space-y-1.5 text-[12.5px] text-body-2">
                  <li>{lang === 'zh' ? '✓ 不限房源数' : '✓ Unlimited listings'}</li>
                  <li>{lang === 'zh' ? '✓ AI 六维评分' : '✓ AI 6-dimension scoring'}</li>
                  <li>✓ Vision OCR</li>
                  <li>{lang === 'zh' ? '✓ CanLII LTB 查询' : '✓ CanLII LTB search'}</li>
                  <li className="text-body-4">{lang === 'zh' ? '— Openroom 跨平台' : '— Openroom cross-platform'}</li>
                  <li className="text-body-4">{lang === 'zh' ? '— 批量导出' : '— Bulk export'}</li>
                </ul>
              </div>
              <div className="relative rounded-2xl border-2 border-brand bg-brand/5 p-5">
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-md bg-brand px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-white">
                  {(plan === 'pro' || plan === 'team')
                    ? (lang === 'zh' ? '✓ 当前方案' : '✓ CURRENT PLAN')
                    : (lang === 'zh' ? '推荐' : 'RECOMMENDED')}
                </div>
                <div className="font-mono text-[11px] font-bold uppercase tracking-eyebrow text-brand">
                  Pro
                </div>
                <div className="mt-1 text-[32px] font-bold tracking-tight">
                  $29<span className="text-[14px] font-medium text-body-3">/mo</span>
                </div>
                <ul className="mt-4 space-y-1.5 text-[12.5px] text-body">
                  <li>{lang === 'zh' ? '✓ Free 全部功能' : '✓ Everything in Free'}</li>
                  <li>{lang === 'zh' ? '✓ Openroom 房东数据库' : '✓ Openroom landlord database'}</li>
                  <li>{lang === 'zh' ? '✓ 优先 AI 评分队列' : '✓ Priority AI scoring queue'}</li>
                  <li>{lang === 'zh' ? '✓ 批量 CSV 导出' : '✓ Bulk CSV export'}</li>
                  <li>{lang === 'zh' ? '✓ 自定义品牌 apply 页' : '✓ Custom-branded apply page'}</li>
                  <li>{lang === 'zh' ? '✓ 邮件 + Slack 通知' : '✓ Email + Slack notifications'}</li>
                </ul>
                {(plan === 'pro' || plan === 'team') ? (
                  <div className="mt-5 space-y-2">
                    <div className="w-full rounded-xl border border-brand/40 bg-white py-[12px] text-center text-[14px] font-bold text-brand">
                      {lang === 'zh' ? '✓ 你已在使用 Pro' : '✓ You are on Pro'}
                    </div>
                    <button
                      onClick={openBillingPortal}
                      disabled={portalLoading}
                      className="w-full rounded-xl border border-line-divider bg-white py-[10px] text-[13px] font-semibold text-body-2 hover:border-brand"
                    >
                      {portalLoading
                        ? (lang === 'zh' ? '打开中…' : 'Opening…')
                        : (lang === 'zh' ? '管理订阅 / 发票 / 取消' : 'Manage subscription / invoices / cancel')}
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={startCheckout}
                    disabled={checkoutLoading}
                    className="sl-btn-primary mt-5 w-full !py-[12px]"
                  >
                    {checkoutLoading ? (lang === 'zh' ? '跳转 Stripe…' : 'Redirecting to Stripe…') : (lang === 'zh' ? '升级到 Pro →' : 'Upgrade to Pro →')}
                  </button>
                )}
              </div>
            </div>
            <p className="mt-4 text-center font-mono text-[10px] text-body-3">
              {lang === 'zh' ? 'Stripe 安全支付 · 随时在 “管理订阅” 取消' : 'Secure Stripe payment · cancel anytime under "Manage subscription"'}
            </p>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {deletingListing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur"
          onClick={() => { if (!deleteLoading) { setDeletingListing(null); setDeleteReason('') } }}
        >
          <div className="sl-card w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-[18px] font-bold tracking-tight text-danger">
              {lang === 'zh' ? '确认删除房源' : 'Delete listing'}
            </h3>
            <div className="mt-2 rounded-lg bg-surface-chip px-4 py-3">
              <div className="text-[14px] font-bold">{deletingListing.address}{deletingListing.unit ? `, ${deletingListing.unit}` : ''}</div>
              <div className="mt-0.5 font-mono text-[11.5px] text-body-3">${deletingListing.monthly_rent?.toLocaleString()}/mo · {deletingListing.city}</div>
            </div>
            <p className="mt-4 text-[13px] font-medium text-body-2">
              {lang === 'zh' ? '请选择删除原因：' : 'Please select a reason:'}
            </p>
            <div className="mt-2 space-y-1.5">
              {DELETE_REASONS.map((r) => (
                <label key={r} className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-line-divider px-3.5 py-2.5 text-[13px] transition hover:border-brand has-[:checked]:border-brand has-[:checked]:bg-brand/5">
                  <input type="radio" name="delete-reason" value={r} checked={deleteReason === r} onChange={() => setDeleteReason(r)} className="h-3.5 w-3.5 accent-brand" />
                  {r}
                </label>
              ))}
            </div>
            <div className="mt-5 flex gap-3">
              <button
                onClick={() => { setDeletingListing(null); setDeleteReason('') }}
                disabled={deleteLoading}
                className="sl-btn-secondary flex-1 !py-2.5"
              >
                {lang === 'zh' ? '取消' : 'Cancel'}
              </button>
              <button
                onClick={handleDeleteListing}
                disabled={!deleteReason || deleteLoading}
                className="flex-1 rounded-xl bg-danger py-2.5 text-[13.5px] font-semibold text-white transition hover:opacity-90 disabled:opacity-40"
              >
                {deleteLoading ? '…' : lang === 'zh' ? '确认删除' : 'Confirm delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Checkout banner */}
      {checkoutBanner && (
        <div className="fixed top-20 left-1/2 z-40 max-w-[calc(100vw-2rem)] -translate-x-1/2">
          <div
            className={
              'sl-card flex items-center gap-3 px-5 py-3 ' +
              (checkoutBanner === 'success'
                ? 'border-success/40'
                : checkoutBanner === 'cancel'
                  ? 'border-line-strong'
                  : 'border-warning/40')
            }
          >
            {checkoutBanner === 'pending' && (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-warning/40 border-t-warning" />
                <span className="text-[12.5px] text-body">{lang === 'zh' ? '收到付款 · 正在解锁 Pro…' : 'Payment received · unlocking Pro…'}</span>
              </>
            )}
            {checkoutBanner === 'success' && (
              <>
                <span className="text-success">✓</span>
                <span className="text-[12.5px] text-body">{lang === 'zh' ? '欢迎加入 Pro!' : 'Welcome to Pro!'}</span>
                <button onClick={() => setCheckoutBanner(null)} className="ml-2 font-mono text-[10px] text-body-3">
                  {lang === 'zh' ? '关闭' : 'Close'}
                </button>
              </>
            )}
            {checkoutBanner === 'cancel' && (
              <>
                <span className="text-body-3">✕</span>
                <span className="text-[12.5px] text-body">{lang === 'zh' ? '已取消支付 · 没有产生扣款' : 'Payment cancelled · no charge made'}</span>
                <button onClick={() => setCheckoutBanner(null)} className="ml-2 font-mono text-[10px] text-body-3">
                  {lang === 'zh' ? '关闭' : 'Close'}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </WorkspaceShell>
  )
}
