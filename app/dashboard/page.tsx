'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useLandlord } from '@/lib/useLandlord'
import { Application, Listing } from '@/types'

export default function Dashboard() {
  const { landlord, loading: authLoading, signOut } = useLandlord()
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
        .eq('id', landlord.landlordId)
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
      supabase.from('landlords').select('plan').eq('id', landlord!.landlordId).maybeSingle(),
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
          <div className="mono text-xs text-slate-500">Authenticating...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen text-slate-100">
      {/* Nav */}
      <nav className="sticky top-0 z-20 backdrop-blur-xl bg-[#060814]/60 border-b border-white/[0.06]">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-400 to-violet-500 flex items-center justify-center text-white font-bold shadow-lg shadow-cyan-500/30">S</div>
            <div>
              <div className="text-base font-bold tracking-tight">Stayloop</div>
              <div className="text-[10px] mono text-slate-500 -mt-0.5">dashboard</div>
            </div>
          </Link>
          <div className="flex items-center gap-3">
            <span className={`mono text-[10px] uppercase px-2 py-1 rounded-md border ${
              plan === 'free'
                ? 'bg-slate-500/10 text-slate-300 border-slate-500/30'
                : 'bg-amber-500/15 text-amber-300 border-amber-500/40'
            }`}>{plan}</span>
            {plan === 'free' && (
              <button onClick={() => setShowUpgrade(true)} className="text-xs px-3 py-1.5 rounded-lg font-semibold bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-lg shadow-amber-500/30">
                Upgrade
              </button>
            )}
            {(plan === 'pro' || plan === 'enterprise') && (
              <button
                onClick={openBillingPortal}
                disabled={portalLoading}
                className="text-xs px-3 py-1.5 rounded-lg font-medium border border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/[0.06] disabled:opacity-50"
              >
                {portalLoading ? 'Opening…' : 'Manage billing'}
              </button>
            )}
            <span className="mono text-xs text-slate-400 hidden sm:inline">{landlord.email}</span>
            <button onClick={signOut} className="btn-ghost text-xs px-3 py-1.5">Sign out</button>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <div className="mono text-xs text-cyan-400 mb-1">// OVERVIEW</div>
            <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          </div>
          <Link href="/dashboard/listings/new" className="btn-primary">+ New listing</Link>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-10">
          {[
            { l: 'Total applications', v: stats.total, c: 'text-cyan-400' },
            { l: 'Approved', v: stats.approved, c: 'text-emerald-400' },
            { l: 'Pending review', v: stats.pending, c: 'text-amber-400' },
            { l: 'LTB flags', v: stats.flags, c: 'text-red-400' },
          ].map(s => (
            <div key={s.l} className="glass rounded-2xl p-5">
              <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">{s.l}</div>
              <div className={`text-4xl font-bold mono ${s.c}`}>{s.v}</div>
            </div>
          ))}
        </div>

        {/* Listings */}
        <div className="glass rounded-2xl overflow-hidden mb-10">
          <div className="px-6 py-4 border-b border-white/[0.06] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
              <span className="font-semibold">Your listings</span>
            </div>
            <span className="mono text-[11px] text-slate-500">{listings.length} active</span>
          </div>
          {loading ? (
            <div className="p-10 text-center mono text-xs text-slate-500">Loading...</div>
          ) : listings.length === 0 ? (
            <div className="p-12 text-center">
              <div className="text-4xl mb-3 opacity-30">▱</div>
              <div className="text-sm text-slate-400 mb-2">No listings yet.</div>
              <Link href="/dashboard/listings/new" className="text-cyan-400 hover:text-cyan-300 text-sm">Create your first listing →</Link>
            </div>
          ) : (
            <ul className="divide-y divide-white/[0.04]">
              {listings.map(l => {
                const url = `${origin}/apply/${l.slug}`
                return (
                  <li key={l.id} className="px-6 py-4 flex items-center justify-between gap-4 hover:bg-white/[0.02] transition-colors">
                    <div className="min-w-0">
                      <div className="font-medium text-slate-100 truncate">
                        {l.address}{l.unit ? `, ${l.unit}` : ''} <span className="text-slate-500">· {l.city}</span>
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5 mono">
                        ${l.monthly_rent?.toLocaleString()}/mo
                        {l.bedrooms ? ` · ${l.bedrooms}bd` : ''}
                        {l.bathrooms ? ` · ${l.bathrooms}ba` : ''}
                      </div>
                      <div className="text-[11px] text-cyan-400/80 mt-1 mono truncate">{url}</div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button onClick={() => copyLink(l.slug)} className="btn-ghost text-xs px-3 py-1.5">
                        {copiedSlug === l.slug ? '✓ Copied' : 'Copy link'}
                      </button>
                      <a href={url} target="_blank" rel="noreferrer" className="btn-ghost text-xs px-3 py-1.5">Open ↗</a>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {/* Applications */}
        <div className="glass rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-white/[0.06] flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-violet-400" />
            <span className="font-semibold">Recent applications</span>
          </div>
          {loading ? (
            <div className="p-10 text-center mono text-xs text-slate-500">Loading...</div>
          ) : applications.length === 0 ? (
            <div className="p-12 text-center">
              <div className="text-4xl mb-3 opacity-30">⌖</div>
              <div className="text-sm text-slate-400">No applications yet. Share a listing link to get started.</div>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-slate-500 border-b border-white/[0.04]">
                  <th className="text-left px-6 py-3 font-medium">Applicant</th>
                  <th className="text-left px-6 py-3 font-medium">Property</th>
                  <th className="text-left px-6 py-3 font-medium">Income</th>
                  <th className="text-left px-6 py-3 font-medium">AI Score</th>
                  <th className="text-left px-6 py-3 font-medium">LTB</th>
                  <th className="text-left px-6 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {applications.map(app => (
                  <tr
                    key={app.id}
                    className="hover:bg-white/[0.03] cursor-pointer transition-colors"
                    onClick={() => { window.location.href = `/dashboard/applications/${app.id}` }}
                  >
                    <td className="px-6 py-4">
                      <div className="font-medium">{app.first_name} {app.last_name}</div>
                      <div className="text-[11px] text-slate-500 mono mt-0.5">{new Date(app.created_at).toLocaleDateString()}</div>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-400">{app.listing?.address}</td>
                    <td className="px-6 py-4 text-sm mono text-slate-300">
                      {app.monthly_income ? `$${app.monthly_income.toLocaleString()}` : '—'}
                    </td>
                    <td className="px-6 py-4">
                      {app.ai_score ? (
                        <span className={`px-2.5 py-1 rounded-md text-xs font-bold mono border ${scoreColor(app.ai_score)}`}>
                          {app.ai_score}
                        </span>
                      ) : <span className="text-[11px] mono text-slate-600">pending</span>}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      {app.ltb_records_found > 0
                        ? <span className="text-red-400 mono text-xs">⚠ {app.ltb_records_found}</span>
                        : <span className="text-emerald-400 mono text-xs">✓ clear</span>}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-1 rounded-md text-[11px] font-medium mono border ${
                        app.status === 'approved' ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' :
                        app.status === 'declined' ? 'bg-red-500/15 text-red-300 border-red-500/30' :
                        'bg-cyan-500/15 text-cyan-300 border-cyan-500/30'
                      }`}>{app.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {showUpgrade && (
        <div className="fixed inset-0 z-30 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowUpgrade(false)}>
          <div className="glass rounded-2xl p-8 max-w-2xl w-full relative" onClick={e => e.stopPropagation()}>
            <button onClick={() => setShowUpgrade(false)} className="absolute top-4 right-4 text-slate-500 hover:text-slate-300 mono text-xs">✕ close</button>
            <div className="mono text-xs text-amber-400 mb-1">// PRICING</div>
            <h2 className="text-2xl font-bold mb-6">Choose your plan</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className={`rounded-xl border p-5 ${plan === 'free' ? 'border-cyan-500/40 bg-cyan-500/5' : 'border-white/10 bg-white/[0.02]'}`}>
                <div className="text-xs uppercase tracking-wider text-slate-500 mb-1">Free</div>
                <div className="text-3xl font-bold mb-1">$0<span className="text-sm text-slate-500">/mo</span></div>
                <div className="text-[11px] text-slate-500 mb-4 mono">forever free</div>
                <ul className="text-xs text-slate-300 space-y-1.5 mono">
                  <li>✓ Unlimited listings</li>
                  <li>✓ AI 6-dim screening</li>
                  <li>✓ Vision OCR document analysis</li>
                  <li>✓ CanLII LTB record search</li>
                  <li className="text-slate-600">— Openroom cross-search</li>
                  <li className="text-slate-600">— Bulk export</li>
                </ul>
              </div>
              <div className="rounded-xl border-2 border-amber-500/50 bg-gradient-to-br from-amber-500/10 to-orange-500/5 p-5 relative">
                <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 mono text-[10px] px-2 py-0.5 rounded bg-amber-500 text-black font-bold uppercase">recommended</div>
                <div className="text-xs uppercase tracking-wider text-amber-400 mb-1">Pro</div>
                <div className="text-3xl font-bold mb-1">$29<span className="text-sm text-slate-500">/mo</span></div>
                <div className="text-[11px] text-slate-500 mb-4 mono">cancel anytime</div>
                <ul className="text-xs text-slate-200 space-y-1.5 mono">
                  <li>✓ Everything in Free</li>
                  <li>✓ Openroom landlord database</li>
                  <li>✓ Priority AI scoring</li>
                  <li>✓ Bulk CSV export</li>
                  <li>✓ Custom branded apply pages</li>
                  <li>✓ Email + Slack notifications</li>
                </ul>
                <button
                  onClick={startCheckout}
                  disabled={checkoutLoading}
                  className="mt-5 block w-full text-center text-sm px-4 py-2.5 rounded-lg font-semibold bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-lg shadow-amber-500/30 disabled:opacity-60"
                >
                  {checkoutLoading ? 'Redirecting to Stripe…' : 'Upgrade to Pro →'}
                </button>
              </div>
            </div>
            <p className="text-[10px] mono text-slate-500 mt-4 text-center">Secure checkout by Stripe · cancel anytime from Manage billing.</p>
          </div>
        </div>
      )}

      {checkoutBanner && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-40">
          <div className={`glass rounded-xl px-5 py-3 flex items-center gap-3 border ${
            checkoutBanner === 'success' ? 'border-emerald-500/40' :
            checkoutBanner === 'cancel'  ? 'border-slate-500/40'  :
                                           'border-amber-500/40'
          }`}>
            {checkoutBanner === 'pending' && (
              <>
                <div className="w-4 h-4 border-2 border-amber-400/40 border-t-amber-400 rounded-full animate-spin" />
                <span className="text-xs text-slate-200">Payment received — unlocking Pro…</span>
              </>
            )}
            {checkoutBanner === 'success' && (
              <>
                <span className="text-emerald-400">✓</span>
                <span className="text-xs text-slate-200">Welcome to Pro!</span>
                <button onClick={() => setCheckoutBanner(null)} className="mono text-[10px] text-slate-500 ml-2">dismiss</button>
              </>
            )}
            {checkoutBanner === 'cancel' && (
              <>
                <span className="text-slate-400">✕</span>
                <span className="text-xs text-slate-300">Checkout canceled — no charge was made.</span>
                <button onClick={() => setCheckoutBanner(null)} className="mono text-[10px] text-slate-500 ml-2">dismiss</button>
            </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
