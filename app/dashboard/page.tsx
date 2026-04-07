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
  const [loading, setLoading] = useState(true)
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null)
  const [origin, setOrigin] = useState('')

  useEffect(() => {
    setOrigin(window.location.origin)
    if (landlord) fetchAll()
  }, [landlord])

  async function fetchAll() {
    const [appsRes, listingsRes] = await Promise.all([
      supabase.from('applications').select('*, listing:listings(*)').order('created_at', { ascending: false }),
      supabase.from('listings').select('*').order('created_at', { ascending: false }),
    ])
    if (appsRes.data) setApplications(appsRes.data)
    if (listingsRes.data) setListings(listingsRes.data)
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
    </div>
  )
}
