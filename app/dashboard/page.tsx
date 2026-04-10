'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useUser } from '@/lib/useUser'
import { useT, LanguageToggle } from '@/lib/i18n'
import { Application, Listing } from '@/types'

export default function Dashboard() {
  const { t } = useT()
  const { user: landlord, loading: authLoading, signOut } = useUser({ redirectIfMissing: true })
  const [applications, setApplications] = useState<Application[]>([])
  const [listings, setListings] = useState<Listing[]>([])
  const [plan, setPlan] = useState<'free' | 'pro' | 'enterprise'>('free')
  const [loading, setLoading] = useState(true)
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null)
  const [origin, setOrigin] = useState('')
  const [showUpgrade, setShowUpgrade] = useState(false)
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [portalLoading, setPortalLoading] = useState(false)
  // Post-checkout banner: 'pending' while we poll for the webhook to flip
  // landlords.plan to 'pro', then 'success' once it lands.
  const [checkoutBanner, setCheckoutBanner] = useState<null | 'pending' | 'success' | 'cancel'>(null)

  useEffect(() => {
    setOrigin(window.location.origin)
    if (typeof window !== 'undefined') {
      const qp = new URL(window.location.href).searchParams
      if (qp.get('upgrade') === '1') setShowUpgrade(true)
      const checkout = qp.get('checkout')
      if (checkout === 'success') setCheckoutBanner('pending')
      if (checkout === 'cancel') setCheckoutBanner('cancel')
    }
    if (landlord) fetchAll()
  }, [landlord])

  // Poll landlords.plan after returning from Stripe Checkout until the
  // webhook flips us to 'pro'. Give up after ~20 tries (~20s).
  useEffect(() => {
    if (checkoutBanner !== 'pending' || !landlord) return
    if (plan === 'pro' || plan === 'enterprise') {
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
        .eq('id', landlord.profileId)
        .maybeSingle()
      if (cancelled) return
      if (data?.plan && data.plan !== plan) {
        setPlan(data.plan as 'free' | 'pro' | 'enterprise')
        return
      }
      if (tries >= 20) return
      setTimeout(tick, 1000)
    }
    tick()
    return () => { cancelled = true }
  }, [checkoutBanner, landlord, plan])

  async function startCheckout() {
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
      alert(`Billing portal error: ${err?.message || 'unknown'}`)
      setPortalLoading(false)
    }
  }

  async function fetchAll() {
    const [appsRes, listingsRes, planRes] = await Promise.all([
      supabase.from('applications').select('*, listing:listings(*)').order('created_at', { ascending: false }),
      supabase.from('listings').select('*').order('created_at', { ascending: false }),
      supabase.from('landlords').select('plan').eq('id', landlord!.profileId).maybeSingle(),
    ])
    if (appsRes.data) setApplications(appsRes.data)
    if (listingsRes.data) setListings(listingsRes.data)
    if (planRes.data?.plan) setPlan(planRes.data.plan)
    setLoading(false)
  }

  async function copyLink(slug: string) {
    const url = `${origin}/apply/${slug}`
    await navigator.clipboard.writeText(url)
    setCopiedSlug(slug)
    setTimeout(() => setCopiedSlug(null), 1500)
  }

  const scoreColor = (score?: number) => {
    if (!score) return 'text-slate-500 bg-white/[0.04] border-white/[0.08]'
    if (score >= 75) return 'text-emerald-300 bg-emerald-500/15 border-emerald-500/30'
    if (score >= 50) return 'text-amber-300 bg-amber-500/15 border-amber-500/30'
    return 'text-red-300 bg-red-500/15 border-red-500/30'
  }

  const stats = {
    total: applications.length,
    approved: applications.filter(a => a.status === 'approved').length,
    pending: applications.filter(a => a.status === 'new' || a.status === 'reviewing').length,
    flags: applications.filter(a => (a.ltb_records_found || 0) > 0).length,
  }

  if (authLoading || !landlord) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 mx-auto mb-3 border-4 border-cyan-500/30 border-t-cyan-400 rounded-full animate-spin" />
          <div className="mono text-xs text-slate-500">{t('common.authenticating')}</div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      {/* Nav */}
      <nav className="nav-bar">
        <Link href="/" className="nav-brand">
          <div className="nav-logo">S</div>
          <div>
            <div className="nav-title">Stayloop</div>
            <div className="nav-sub mono">{t('dash.tagline')}</div>
          </div>
        </Link>
        <div className="nav-actions" style={{ flexWrap: 'wrap' }}>
          <LanguageToggle />
          <Link href="/screen" className="btn btn-primary btn-sm">{t('dash.screenTenant')}</Link>
          <span className={plan === 'free' ? 'chip mono' : 'chip chip-pro mono'} style={{ textTransform: 'uppercase' }}>{plan}</span>
          {plan === 'free' && (
            <button onClick={() => setShowUpgrade(true)} className="btn btn-pro btn-sm">{t('dash.upgrade')}</button>
          )}
          {(plan === 'pro' || plan === 'enterprise') && (
            <button onClick={openBillingPortal} disabled={portalLoading} className="btn btn-ghost btn-sm">
              {portalLoading ? t('dash.opening') : t('dash.manageBilling')}
            </button>
          )}
          <span className="mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>{landlord.email}</span>
          <button onClick={signOut} className="btn btn-ghost btn-sm">{t('dash.signOut')}</button>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-6 py-10 fade-up">
        {/* Header */}
        <div className="flex items-center justify-between mb-8 flex-wrap gap-3">
          <div>
            <div className="mono" style={{ fontSize: 11, color: '#5EEAD4', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6, fontWeight: 700 }}>{t('dash.overview')}</div>
            <h1 className="h-hero">{t('dash.title')}</h1>
          </div>
          <Link href="/dashboard/listings/new" className="btn btn-primary">+ {t('dash.newListing')}</Link>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-10">
          {[
            { l: t('dash.stat.total'), v: stats.total, c: '#22D3EE' },
            { l: t('dash.stat.approved'), v: stats.approved, c: '#34D399' },
            { l: t('dash.stat.pending'), v: stats.pending, c: '#FBBF24' },
            { l: t('dash.stat.flags'), v: stats.flags, c: '#F87171' },
          ].map(s => (
            <div key={s.l} className="card" style={{ padding: 22 }}>
              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 10, fontWeight: 600 }}>{s.l}</div>
              <div className="mono" style={{ fontSize: 36, fontWeight: 800, color: s.c, letterSpacing: '-0.03em', lineHeight: 1 }}>{s.v}</div>
            </div>
          ))}
        </div>

        {/* Listings */}
        <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 32 }}>
          <div style={{ padding: '16px 22px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#22D3EE', boxShadow: '0 0 8px rgba(34, 211, 238, 0.5)' }} />
              <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: '-0.005em' }}>{t('dash.yourListings')}</span>
            </div>
            <span className="mono" style={{ fontSize: 10.5, color: 'var(--text-faint)' }}>{t('dash.activeN', { n: listings.length })}</span>
          </div>
          {loading ? (
            <div className="p-10 text-center mono text-xs text-slate-500">{t('dash.loading')}</div>
          ) : listings.length === 0 ? (
            <div className="p-12 text-center">
              <div className="text-4xl mb-3 opacity-30">▱</div>
              <div className="text-sm text-slate-400 mb-2">{t('dash.noListings')}</div>
              <Link href="/dashboard/listings/new" className="text-cyan-400 hover:text-cyan-300 text-sm">{t('dash.createFirst')}</Link>
            </div>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {listings.map(l => {
                const url = `${origin}/apply/${l.slug}`
                return (
                  <li key={l.id} style={{ padding: '18px 22px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, borderBottom: '1px solid var(--border-subtle)', transition: 'background 0.15s' }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {l.address}{l.unit ? `, ${l.unit}` : ''} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>· {l.city}</span>
                      </div>
                      <div className="mono" style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 4 }}>
                        ${l.monthly_rent?.toLocaleString()}/mo
                        {l.bedrooms ? ` · ${l.bedrooms}bd` : ''}
                        {l.bathrooms ? ` · ${l.bathrooms}ba` : ''}
                      </div>
                      <div className="mono" style={{ fontSize: 10.5, color: '#67E8F9', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{url}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                      <button onClick={() => copyLink(l.slug)} className="btn btn-ghost btn-sm">
                        {copiedSlug === l.slug ? '✓ ' + t('dash.copied') : t('dash.copyLink')}
                      </button>
                      <a href={url} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm">{t('dash.open')} ↗</a>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {/* Applications */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '16px 22px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#A78BFA', boxShadow: '0 0 8px rgba(167, 139, 250, 0.5)' }} />
            <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: '-0.005em' }}>{t('dash.recentApps')}</span>
          </div>
          {loading ? (
            <div className="p-10 text-center mono text-xs text-slate-500">{t('dash.loading')}</div>
          ) : applications.length === 0 ? (
            <div className="p-12 text-center">
              <div className="text-4xl mb-3 opacity-30">⌖</div>
              <div className="text-sm text-slate-400">{t('dash.noApps')}</div>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  <th style={{ textAlign: 'left', padding: '14px 22px', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', fontWeight: 600 }}>{t('dash.col.applicant')}</th>
                  <th style={{ textAlign: 'left', padding: '14px 22px', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', fontWeight: 600 }}>{t('dash.col.property')}</th>
                  <th style={{ textAlign: 'left', padding: '14px 22px', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', fontWeight: 600 }}>{t('dash.col.income')}</th>
                  <th style={{ textAlign: 'left', padding: '14px 22px', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', fontWeight: 600 }}>{t('dash.col.aiScore')}</th>
                  <th style={{ textAlign: 'left', padding: '14px 22px', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', fontWeight: 600 }}>{t('dash.col.ltb')}</th>
                  <th style={{ textAlign: 'left', padding: '14px 22px', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', fontWeight: 600 }}>{t('dash.col.status')}</th>
                </tr>
              </thead>
              <tbody>
                {applications.map(app => (
                  <tr
                    key={app.id}
                    style={{ cursor: 'pointer', borderBottom: '1px solid var(--border-subtle)', transition: 'background 0.15s' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLTableRowElement).style.background = 'rgba(148, 163, 184, 0.04)' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.background = 'transparent' }}
                    onClick={() => { window.location.href = `/dashboard/applications/${app.id}` }}
                  >
                    <td style={{ padding: '16px 22px' }}>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>{app.first_name} {app.last_name}</div>
                      <div className="mono" style={{ fontSize: 10.5, color: 'var(--text-faint)', marginTop: 3 }}>{new Date(app.created_at).toLocaleDateString()}</div>
                    </td>
                    <td style={{ padding: '16px 22px', fontSize: 13, color: 'var(--text-secondary)' }}>{app.listing?.address}</td>
                    <td style={{ padding: '16px 22px' }} className="mono"><span style={{ fontSize: 13, color: 'var(--text-primary)' }}>{app.monthly_income ? `$${app.monthly_income.toLocaleString()}` : '—'}</span></td>
                    <td style={{ padding: '16px 22px' }}>
                      {app.ai_score ? (
                        <span className={`mono border ${scoreColor(app.ai_score)}`} style={{ padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 700 }}>
                          {app.ai_score}
                        </span>
                      ) : <span className="mono" style={{ fontSize: 10.5, color: 'var(--text-faint)' }}>{t('dash.scorePending')}</span>}
                    </td>
                    <td style={{ padding: '16px 22px' }}>
                      {app.ltb_records_found > 0
                        ? <span className="mono" style={{ fontSize: 11.5, color: '#F87171' }}>⚠ {app.ltb_records_found}</span>
                        : <span className="mono" style={{ fontSize: 11.5, color: '#34D399' }}>✓ {t('dash.ltbClear')}</span>}
                    </td>
                    <td style={{ padding: '16px 22px' }}>
                      <span className="mono" style={{
                        padding: '4px 10px', borderRadius: 6, fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em',
                        border: '1px solid',
                        ...(app.status === 'approved' ? { background: 'rgba(16, 185, 129, 0.14)', color: '#34D399', borderColor: 'rgba(16, 185, 129, 0.35)' } :
                            app.status === 'declined' ? { background: 'rgba(244, 63, 94, 0.14)', color: '#FB7185', borderColor: 'rgba(244, 63, 94, 0.35)' } :
                            { background: 'rgba(34, 211, 238, 0.14)', color: '#67E8F9', borderColor: 'rgba(34, 211, 238, 0.35)' }),
                      }}>{app.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </div>
      </div>

      {showUpgrade && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0, 0, 0, 0.75)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setShowUpgrade(false)}>
          <div className="card-hero fade-up" style={{ maxWidth: 680, width: '100%', position: 'relative' }} onClick={e => e.stopPropagation()}>
            <button onClick={() => setShowUpgrade(false)} aria-label="close" style={{ position: 'absolute', top: 14, right: 14, width: 30, height: 30, borderRadius: 8, background: 'rgba(148, 163, 184, 0.08)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 14 }}>✕</button>
            <div className="chip chip-pro mono mb-3">{t('dash.pricing.tag')}</div>
            <h2 className="h-section mb-6">{t('dash.pricing.choose')}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div style={{ borderRadius: 14, padding: 22, border: '1px solid var(--border-subtle)', background: 'rgba(148, 163, 184, 0.04)' }}>
                <div className="mono" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 6, fontWeight: 600 }}>{t('dash.pricing.free')}</div>
                <div style={{ fontSize: 32, fontWeight: 800, marginBottom: 4, letterSpacing: '-0.02em' }}>$0<span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 500 }}>/mo</span></div>
                <div className="mono" style={{ fontSize: 10.5, color: 'var(--text-faint)', marginBottom: 16 }}>{t('dash.pricing.foreverFree')}</div>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: 12, color: 'var(--text-secondary)' }}>
                  {[t('dash.pricing.free.f1'), t('dash.pricing.free.f2'), t('dash.pricing.free.f3'), t('dash.pricing.free.f4')].map((f, i) => <li key={i} style={{ marginBottom: 8, display: 'flex', gap: 8 }}><span style={{ color: '#5EEAD4' }}>✓</span>{f}</li>)}
                  {[t('dash.pricing.free.f5'), t('dash.pricing.free.f6')].map((f, i) => <li key={i} style={{ marginBottom: 8, display: 'flex', gap: 8, color: 'var(--text-faint)' }}><span>·</span>{f}</li>)}
                </ul>
              </div>
              <div style={{ borderRadius: 14, padding: 22, border: '1px solid rgba(139, 92, 246, 0.4)', background: 'radial-gradient(ellipse at top, rgba(139, 92, 246, 0.12), rgba(139, 92, 246, 0.04))', position: 'relative' }}>
                <div className="chip chip-pro mono" style={{ position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)' }}>★ {t('dash.pricing.recommended')}</div>
                <div className="mono" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#C4B5FD', marginBottom: 6, fontWeight: 700 }}>Pro</div>
                <div style={{ fontSize: 32, fontWeight: 800, marginBottom: 4, letterSpacing: '-0.02em' }}>$29<span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 500 }}>/mo</span></div>
                <div className="mono" style={{ fontSize: 10.5, color: 'var(--text-faint)', marginBottom: 16 }}>{t('dash.pricing.cancel')}</div>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: 12, color: 'var(--text-primary)' }}>
                  {[t('dash.pricing.pro.f1'), t('dash.pricing.pro.f2'), t('dash.pricing.pro.f3'), t('dash.pricing.pro.f4'), t('dash.pricing.pro.f5'), t('dash.pricing.pro.f6')].map((f, i) => <li key={i} style={{ marginBottom: 8, display: 'flex', gap: 8 }}><span style={{ color: '#C4B5FD' }}>✓</span>{f}</li>)}
                </ul>
                <button onClick={startCheckout} disabled={checkoutLoading} className="btn btn-pro" style={{ width: '100%', marginTop: 18 }}>
                  {checkoutLoading ? t('dash.pricing.redirecting') : t('dash.pricing.upgradeTo')} →
                </button>
              </div>
            </div>
            <p className="mono" style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 16, textAlign: 'center' }}>{t('dash.pricing.stripeNotice')}</p>
          </div>
        </div>
      )}

      {checkoutBanner && (
        <div style={{ position: 'fixed', top: 80, left: '50%', transform: 'translateX(-50%)', zIndex: 70 }}>
          <div className="card fade-up" style={{ padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 12, borderColor: checkoutBanner === 'success' ? 'rgba(16, 185, 129, 0.4)' : checkoutBanner === 'cancel' ? 'var(--border-strong)' : 'rgba(251, 191, 36, 0.4)' }}>
            {checkoutBanner === 'pending' && (
              <>
                <div className="w-4 h-4 border-2 border-amber-400/40 border-t-amber-400 rounded-full animate-spin" />
                <span className="text-xs text-slate-200">{t('dash.banner.pending')}</span>
              </>
            )}
            {checkoutBanner === 'success' && (
              <>
                <span className="text-emerald-400">✓</span>
                <span className="text-xs text-slate-200">{t('dash.banner.success')}</span>
                <button onClick={() => setCheckoutBanner(null)} className="mono text-[10px] text-slate-500 ml-2">{t('dash.banner.dismiss')}</button>
              </>
            )}
            {checkoutBanner === 'cancel' && (
              <>
                <span className="text-slate-400">✕</span>
                <span className="text-xs text-slate-300">{t('dash.banner.cancel')}</span>
                <button onClick={() => setCheckoutBanner(null)} className="mono text-[10px] text-slate-500 ml-2">{t('dash.banner.dismiss')}</button>
            </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
