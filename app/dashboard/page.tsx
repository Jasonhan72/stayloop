'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useUser } from '@/lib/useUser'
import { useT, LanguageToggle } from '@/lib/i18n'
import AppHeader from '@/components/AppHeader'
import { useIsMobile } from '@/lib/useMediaQuery'
import { Application, Listing } from '@/types'

/* ── Marketing-matching light palette ── */
const mk = {
  bg: '#F2EEE5',
  surface: '#FFFFFF',
  border: '#E4E8F0',
  borderStrong: '#CBD5E1',
  text: '#0B1736',
  textSec: '#475569',
  textMuted: '#64748B',
  textFaint: '#94A3B8',
  brand: '#10B981',
  brandStrong: '#059669',
  brandSoft: '#ECFDF5',
  navy: '#0B1736',
  red: '#E11D48',
  redSoft: '#FFF1F2',
  greenSoft: '#ECFDF5',
  green: '#059669',
} as const

export default function Dashboard() {
  const { t } = useT()
  const isMobile = useIsMobile()
  const { user: landlord, loading: authLoading } = useUser({ redirectIfMissing: true })
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

  const scoreColor = (score?: number): React.CSSProperties => {
    if (!score) return { color: mk.textMuted, background: mk.bg, borderColor: mk.border }
    if (score >= 75) return { color: mk.green, background: mk.greenSoft, borderColor: `rgba(5,150,105,0.25)` }
    if (score >= 50) return { color: '#D97706', background: '#FEF3C7', borderColor: 'rgba(217,119,6,0.25)' }
    return { color: mk.red, background: mk.redSoft, borderColor: `rgba(225,29,72,0.25)` }
  }

  const stats = {
    total: applications.length,
    approved: applications.filter(a => a.status === 'approved').length,
    pending: applications.filter(a => a.status === 'new' || a.status === 'reviewing').length,
    flags: applications.filter(a => (a.ltb_records_found || 0) > 0).length,
  }

  if (authLoading || !landlord) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: mk.bg, fontFamily: 'Inter, -apple-system, system-ui, sans-serif' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 40, height: 40, margin: '0 auto 12px', borderRadius: 10, border: `4px solid rgba(13,148,136,0.2)`, borderTopColor: mk.brand, animation: 'spin 1s linear infinite' }} />
          <div style={{ fontSize: 12, color: mk.textMuted, fontFamily: 'JetBrains Mono, monospace' }}>{t('common.authenticating')}</div>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: mk.bg, fontFamily: 'Inter, -apple-system, system-ui, sans-serif' }}>
      {/* Nav */}
      <AppHeader title="Dashboard" titleZh="仪表盘" />

      <div style={{ maxWidth: '1280px', margin: '0 auto', padding: isMobile ? '20px 14px' : '40px 24px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: isMobile ? 20 : 32, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontSize: 11, color: mk.brand, fontFamily: 'JetBrains Mono, monospace', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6, fontWeight: 700 }}>{t('dash.overview')}</div>
            <h1 style={{ fontSize: isMobile ? 24 : 36, fontWeight: 800, color: mk.navy, letterSpacing: '-0.02em', margin: 0 }}>{t('dash.title')}</h1>
          </div>
          <Link href="/listings/new" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '12px 20px', borderRadius: 10, background: `linear-gradient(135deg, ${mk.brand}, ${mk.brandStrong})`, color: '#fff', fontSize: 14, fontWeight: 650, textDecoration: 'none', border: 'none', cursor: 'pointer', boxShadow: '0 8px 22px -10px rgba(13,148,136,0.6), inset 0 1px 0 rgba(255,255,255,0.15)' }}>+ {t('dash.newListing')}</Link>
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(auto-fit, minmax(200px, 1fr))', gap: isMobile ? 10 : 16, marginBottom: isMobile ? 24 : 40 }}>
          {[
            { l: t('dash.stat.total'), v: stats.total, c: mk.brand },
            { l: t('dash.stat.approved'), v: stats.approved, c: mk.green },
            { l: t('dash.stat.pending'), v: stats.pending, c: '#D97706' },
            { l: t('dash.stat.flags'), v: stats.flags, c: mk.red },
          ].map(s => (
            <div key={s.l} style={{ background: mk.surface, borderRadius: isMobile ? 12 : 14, border: `1px solid ${mk.border}`, padding: isMobile ? 14 : 22, boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 12px 32px -8px rgba(0,0,0,0.06)' }}>
              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: mk.textMuted, marginBottom: 10, fontWeight: 600 }}>{s.l}</div>
              <div style={{ fontSize: isMobile ? 24 : 36, fontWeight: 800, color: s.c, letterSpacing: '-0.03em', lineHeight: 1, fontFamily: 'JetBrains Mono, monospace' }}>{s.v}</div>
            </div>
          ))}
        </div>

        {/* Listings */}
        <div style={{ background: mk.surface, borderRadius: 14, border: `1px solid ${mk.border}`, overflow: 'hidden', marginBottom: 32, boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 12px 32px -8px rgba(0,0,0,0.06)' }}>
          <div style={{ padding: isMobile ? '10px 12px' : '16px 22px', borderBottom: `1px solid ${mk.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: mk.brand, boxShadow: `0 0 8px rgba(13,148,136,0.5)` }} />
              <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: '-0.005em', color: mk.text }}>{t('dash.yourListings')}</span>
            </div>
            <span style={{ fontSize: 10.5, color: mk.textFaint, fontFamily: 'JetBrains Mono, monospace' }}>{t('dash.activeN', { n: listings.length })}</span>
          </div>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', fontSize: 12, color: mk.textMuted, fontFamily: 'JetBrains Mono, monospace' }}>{t('dash.loading')}</div>
          ) : listings.length === 0 ? (
            <div style={{ padding: 48, textAlign: 'center' }}>
              <div style={{ fontSize: 36, marginBottom: 12, opacity: 0.3 }}>▱</div>
              <div style={{ fontSize: 14, color: mk.textMuted, marginBottom: 16 }}>{t('dash.noListings')}</div>
              <Link href="/listings/new" style={{ fontSize: 14, color: mk.brand, textDecoration: 'underline', fontWeight: 500 }}>{t('dash.createFirst')}</Link>
            </div>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {listings.map(l => {
                const url = `${origin}/apply/${l.slug}`
                return (
                  <li key={l.id} style={{ padding: isMobile ? '14px 14px' : '18px 22px', display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'stretch' : 'center', justifyContent: 'space-between', gap: isMobile ? 10 : 16, borderBottom: `1px solid ${mk.border}`, transition: 'background 0.15s', cursor: 'pointer' }} onMouseEnter={e => { (e.currentTarget as HTMLLIElement).style.background = mk.bg }} onMouseLeave={e => { (e.currentTarget as HTMLLIElement).style.background = 'transparent' }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: isMobile ? 13.5 : 14.5, fontWeight: 600, color: mk.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {l.address}{l.unit ? `, ${l.unit}` : ''} <span style={{ color: mk.textMuted, fontWeight: 400 }}>· {l.city}</span>
                      </div>
                      <div style={{ fontSize: 11.5, color: mk.textSec, marginTop: 4, fontFamily: 'JetBrains Mono, monospace' }}>
                        ${l.monthly_rent?.toLocaleString()}/mo
                        {l.bedrooms ? ` · ${l.bedrooms}bd` : ''}
                        {l.bathrooms ? ` · ${l.bathrooms}ba` : ''}
                      </div>
                      {!isMobile && <div style={{ fontSize: 10.5, color: mk.brand, marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'JetBrains Mono, monospace' }}>{url}</div>}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                      <button onClick={() => copyLink(l.slug)} style={{ padding: isMobile ? '10px 14px' : '8px 12px', borderRadius: 8, border: `1px solid ${mk.border}`, background: mk.surface, color: mk.text, fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'background 0.15s', flex: isMobile ? 1 : 'none' }} onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = mk.bg }} onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = mk.surface }}>
                        {copiedSlug === l.slug ? '✓ ' + t('dash.copied') : t('dash.copyLink')}
                      </button>
                      <a href={url} target="_blank" rel="noreferrer" style={{ padding: isMobile ? '10px 14px' : '8px 12px', borderRadius: 8, border: `1px solid ${mk.border}`, background: mk.surface, color: mk.text, fontSize: 12, fontWeight: 600, cursor: 'pointer', textDecoration: 'none', transition: 'background 0.15s', display: 'inline-block', textAlign: 'center', flex: isMobile ? 1 : 'none' }} onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.background = mk.bg }} onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.background = mk.surface }}>{t('dash.open')} ↗</a>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {/* Applications */}
        <div style={{ background: mk.surface, borderRadius: 14, border: `1px solid ${mk.border}`, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 12px 32px -8px rgba(0,0,0,0.06)' }}>
          <div style={{ padding: isMobile ? '10px 12px' : '16px 22px', borderBottom: `1px solid ${mk.border}`, display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: mk.brand, boxShadow: `0 0 8px rgba(13,148,136,0.5)` }} />
            <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: '-0.005em', color: mk.text }}>{t('dash.recentApps')}</span>
          </div>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', fontSize: 12, color: mk.textMuted, fontFamily: 'JetBrains Mono, monospace' }}>{t('dash.loading')}</div>
          ) : applications.length === 0 ? (
            <div style={{ padding: 48, textAlign: 'center' }}>
              <div style={{ fontSize: 36, marginBottom: 12, opacity: 0.3 }}>⌖</div>
              <div style={{ fontSize: 14, color: mk.textMuted }}>{t('dash.noApps')}</div>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${mk.border}` }}>
                  <th style={{ textAlign: 'left', padding: isMobile ? '10px 12px' : '14px 22px', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: mk.textMuted, fontWeight: 600 }}>{t('dash.col.applicant')}</th>
                  <th style={{ textAlign: 'left', padding: isMobile ? '10px 12px' : '14px 22px', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: mk.textMuted, fontWeight: 600 }}>{t('dash.col.property')}</th>
                  <th style={{ textAlign: 'left', padding: isMobile ? '10px 12px' : '14px 22px', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: mk.textMuted, fontWeight: 600 }}>{t('dash.col.income')}</th>
                  <th style={{ textAlign: 'left', padding: isMobile ? '10px 12px' : '14px 22px', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: mk.textMuted, fontWeight: 600 }}>{t('dash.col.aiScore')}</th>
                  <th style={{ textAlign: 'left', padding: isMobile ? '10px 12px' : '14px 22px', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: mk.textMuted, fontWeight: 600 }}>{t('dash.col.ltb')}</th>
                  <th style={{ textAlign: 'left', padding: isMobile ? '10px 12px' : '14px 22px', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: mk.textMuted, fontWeight: 600 }}>{t('dash.col.status')}</th>
                </tr>
              </thead>
              <tbody>
                {applications.map(app => (
                  <tr
                    key={app.id}
                    style={{ cursor: 'pointer', borderBottom: `1px solid ${mk.border}`, transition: 'background 0.15s' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLTableRowElement).style.background = mk.bg }}
                    onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.background = 'transparent' }}
                    onClick={() => { window.location.href = `/dashboard/applications/${app.id}` }}
                  >
                    <td style={{ padding: isMobile ? '10px 12px' : '16px 22px' }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: mk.text }}>{app.first_name} {app.last_name}</div>
                      <div style={{ fontSize: 10.5, color: mk.textFaint, marginTop: 3, fontFamily: 'JetBrains Mono, monospace' }}>{new Date(app.created_at).toLocaleDateString()}</div>
                    </td>
                    <td style={{ padding: isMobile ? '10px 12px' : '16px 22px', fontSize: 13, color: mk.textSec }}>{app.listing?.address}</td>
                    <td style={{ padding: isMobile ? '10px 12px' : '16px 22px', fontFamily: 'JetBrains Mono, monospace' }}><span style={{ fontSize: 13, color: mk.text }}>{app.monthly_income ? `$${app.monthly_income.toLocaleString()}` : '—'}</span></td>
                    <td style={{ padding: isMobile ? '10px 12px' : '16px 22px' }}>
                      {app.ai_score ? (
                        <span style={{ fontFamily: 'JetBrains Mono, monospace', border: '1px solid', padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 700, ...scoreColor(app.ai_score) }}>
                          {app.ai_score}
                        </span>
                      ) : <span style={{ fontSize: 10.5, color: mk.textFaint, fontFamily: 'JetBrains Mono, monospace' }}>{t('dash.scorePending')}</span>}
                    </td>
                    <td style={{ padding: isMobile ? '10px 12px' : '16px 22px' }}>
                      {app.ltb_records_found > 0
                        ? <span style={{ fontSize: 11.5, color: mk.red, fontFamily: 'JetBrains Mono, monospace' }}>⚠ {app.ltb_records_found}</span>
                        : <span style={{ fontSize: 11.5, color: mk.green, fontFamily: 'JetBrains Mono, monospace' }}>✓ {t('dash.ltbClear')}</span>}
                    </td>
                    <td style={{ padding: isMobile ? '10px 12px' : '16px 22px' }}>
                      <span style={{
                        fontFamily: 'JetBrains Mono, monospace',
                        padding: '4px 10px', borderRadius: 6, fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em',
                        border: '1px solid',
                        ...(app.status === 'approved' ? { background: mk.greenSoft, color: mk.green, borderColor: `rgba(5,150,105,0.25)` } :
                            app.status === 'declined' ? { background: mk.redSoft, color: mk.red, borderColor: `rgba(225,29,72,0.25)` } :
                            { background: '#E0F2FE', color: mk.brand, borderColor: `rgba(13,148,136,0.25)` }),
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
        <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0, 0, 0, 0.3)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setShowUpgrade(false)}>
          <div style={{ background: mk.surface, borderRadius: isMobile ? 16 : 20, border: `1px solid ${mk.border}`, padding: isMobile ? '24px 16px' : '36px 32px', maxWidth: 680, width: '100%', position: 'relative', boxShadow: '0 20px 60px -10px rgba(0,0,0,0.1)', maxHeight: isMobile ? '85vh' : 'none', overflowY: isMobile ? 'auto' : 'visible' }} onClick={e => e.stopPropagation()}>
            <button onClick={() => setShowUpgrade(false)} aria-label="close" style={{ position: 'absolute', top: 14, right: 14, width: 30, height: 30, borderRadius: 8, background: mk.bg, border: `1px solid ${mk.border}`, color: mk.textSec, cursor: 'pointer', fontSize: 14 }}>✕</button>
            <div style={{ fontSize: 11, color: mk.brand, fontFamily: 'JetBrains Mono, monospace', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6, fontWeight: 700 }}>{t('dash.pricing.tag')}</div>
            <h2 style={{ fontSize: isMobile ? 22 : 28, fontWeight: 800, color: mk.navy, letterSpacing: '-0.02em', marginBottom: isMobile ? 16 : 24 }}>{t('dash.pricing.choose')}</h2>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
              <div style={{ borderRadius: 14, padding: 22, border: `1px solid ${mk.border}`, background: mk.bg }}>
                <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: mk.textMuted, marginBottom: 6, fontWeight: 600, fontFamily: 'JetBrains Mono, monospace' }}>{t('dash.pricing.free')}</div>
                <div style={{ fontSize: 32, fontWeight: 800, marginBottom: 4, letterSpacing: '-0.02em', color: mk.text }}>$0<span style={{ fontSize: 13, color: mk.textMuted, fontWeight: 500 }}>/mo</span></div>
                <div style={{ fontSize: 10.5, color: mk.textFaint, marginBottom: 16, fontFamily: 'JetBrains Mono, monospace' }}>{t('dash.pricing.foreverFree')}</div>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: 12, color: mk.textSec }}>
                  {[t('dash.pricing.free.f1'), t('dash.pricing.free.f2'), t('dash.pricing.free.f3'), t('dash.pricing.free.f4')].map((f, i) => <li key={i} style={{ marginBottom: 8, display: 'flex', gap: 8 }}><span style={{ color: mk.green }}>✓</span>{f}</li>)}
                  {[t('dash.pricing.free.f5'), t('dash.pricing.free.f6')].map((f, i) => <li key={i} style={{ marginBottom: 8, display: 'flex', gap: 8, color: mk.textFaint }}><span>·</span>{f}</li>)}
                </ul>
              </div>
              <div style={{ borderRadius: 14, padding: 22, border: `1px solid ${mk.border}`, background: mk.brandSoft, position: 'relative' }}>
                <div style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', letterSpacing: '0.08em', textTransform: 'uppercase', color: mk.brand, marginBottom: 6, fontWeight: 700, position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', background: mk.surface, padding: '0 8px', border: `1px solid ${mk.border}`, borderRadius: 8 }}>★ {t('dash.pricing.recommended')}</div>
                <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: mk.brand, marginBottom: 6, fontWeight: 700, fontFamily: 'JetBrains Mono, monospace' }}>Pro</div>
                <div style={{ fontSize: 32, fontWeight: 800, marginBottom: 4, letterSpacing: '-0.02em', color: mk.text }}>$29<span style={{ fontSize: 13, color: mk.textMuted, fontWeight: 500 }}>/mo</span></div>
                <div style={{ fontSize: 10.5, color: mk.textFaint, marginBottom: 16, fontFamily: 'JetBrains Mono, monospace' }}>{t('dash.pricing.cancel')}</div>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: 12, color: mk.text }}>
                  {[t('dash.pricing.pro.f1'), t('dash.pricing.pro.f2'), t('dash.pricing.pro.f3'), t('dash.pricing.pro.f4'), t('dash.pricing.pro.f5'), t('dash.pricing.pro.f6')].map((f, i) => <li key={i} style={{ marginBottom: 8, display: 'flex', gap: 8 }}><span style={{ color: mk.brand }}>✓</span>{f}</li>)}
                </ul>
                <button onClick={startCheckout} disabled={checkoutLoading} style={{ width: '100%', marginTop: 18, padding: '13px 20px', borderRadius: 10, background: `linear-gradient(135deg, ${mk.brand}, ${mk.brandStrong})`, color: '#fff', fontSize: 14, fontWeight: 650, border: 'none', cursor: 'pointer', boxShadow: '0 8px 22px -10px rgba(13,148,136,0.6), inset 0 1px 0 rgba(255,255,255,0.15)', transition: 'transform .15s, box-shadow .2s', opacity: checkoutLoading ? 0.6 : 1 }}>
                  {checkoutLoading ? t('dash.pricing.redirecting') : t('dash.pricing.upgradeTo')} →
                </button>
              </div>
            </div>
            <p style={{ fontSize: 10, color: mk.textFaint, marginTop: 16, textAlign: 'center', fontFamily: 'JetBrains Mono, monospace' }}>{t('dash.pricing.stripeNotice')}</p>
          </div>
        </div>
      )}

      {checkoutBanner && (
        <div style={{ position: 'fixed', top: 80, left: '50%', transform: 'translateX(-50%)', zIndex: 70 }}>
          <div style={{ background: mk.surface, borderRadius: 14, border: `1px solid ${checkoutBanner === 'success' ? `rgba(5,150,105,0.25)` : checkoutBanner === 'cancel' ? mk.borderStrong : `rgba(217,119,6,0.25)`}`, padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 12px 32px -8px rgba(0,0,0,0.06)' }}>
            {checkoutBanner === 'pending' && (
              <>
                <div style={{ width: 16, height: 16, borderRadius: '50%', border: `2px solid rgba(217,119,6,0.3)`, borderTopColor: '#D97706', animation: 'spin 1s linear infinite' }} />
                <span style={{ fontSize: 12, color: mk.textSec }}>{t('dash.banner.pending')}</span>
              </>
            )}
            {checkoutBanner === 'success' && (
              <>
                <span style={{ color: mk.green }}>✓</span>
                <span style={{ fontSize: 12, color: mk.textSec }}>{t('dash.banner.success')}</span>
                <button onClick={() => setCheckoutBanner(null)} style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: mk.textFaint, marginLeft: 8, background: 'none', border: 'none', cursor: 'pointer' }}>{t('dash.banner.dismiss')}</button>
              </>
            )}
            {checkoutBanner === 'cancel' && (
              <>
                <span style={{ color: mk.textSec }}>✕</span>
                <span style={{ fontSize: 12, color: mk.textSec }}>{t('dash.banner.cancel')}</span>
                <button onClick={() => setCheckoutBanner(null)} style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: mk.textFaint, marginLeft: 8, background: 'none', border: 'none', cursor: 'pointer' }}>{t('dash.banner.dismiss')}</button>
            </>
            )}
          </div>
        </div>
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
