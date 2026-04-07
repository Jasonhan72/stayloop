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
    if (!score) return 'bg-gray-100 text-gray-600'
    if (score >= 75) return 'bg-green-100 text-green-700'
    if (score >= 50) return 'bg-yellow-100 text-yellow-700'
    return 'bg-red-100 text-red-700'
  }

  const stats = {
    total: applications.length,
    approved: applications.filter(a => a.status === 'approved').length,
    pending: applications.filter(a => a.status === 'new' || a.status === 'reviewing').length,
    flags: applications.filter(a => (a.ltb_records_found || 0) > 0).length,
  }

  if (authLoading || !landlord) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-gray-500">
        Loading...
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white text-sm font-bold">S</div>
          <span className="text-lg font-bold text-blue-600">Stayloop</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-500">{landlord.email}</span>
          <button onClick={signOut} className="text-sm text-gray-500 hover:text-gray-900">
            Sign out
          </button>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <Link
            href="/dashboard/listings/new"
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg"
          >
            + New listing
          </Link>
        </div>

        <div className="grid grid-cols-4 gap-4 mb-8">
          {[
            { label: 'Total Applications', value: stats.total, color: 'text-blue-600' },
            { label: 'Approved', value: stats.approved, color: 'text-green-600' },
            { label: 'Pending Review', value: stats.pending, color: 'text-yellow-600' },
            { label: 'LTB Flags', value: stats.flags, color: 'text-red-600' },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-5">
              <p className="text-sm text-gray-500 mb-1">{s.label}</p>
              <p className={`text-3xl font-bold ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-8">
          <div className="px-6 py-4 border-b border-gray-100 font-semibold text-gray-800 flex items-center justify-between">
            <span>Your listings</span>
            <span className="text-xs text-gray-400 font-normal">{listings.length} active</span>
          </div>
          {loading ? (
            <div className="p-8 text-center text-gray-400">Loading...</div>
          ) : listings.length === 0 ? (
            <div className="p-8 text-center text-gray-400">
              No listings yet.{' '}
              <Link href="/dashboard/listings/new" className="text-blue-600 hover:underline">Create your first listing</Link>
              {' '}to get a shareable application link.
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {listings.map(l => {
                const url = `${origin}/apply/${l.slug}`
                return (
                  <li key={l.id} className="px-6 py-4 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <div className="font-medium text-gray-900 truncate">
                        {l.address}{l.unit ? `, ${l.unit}` : ''} · {l.city}
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        ${l.monthly_rent?.toLocaleString()}/mo
                        {l.bedrooms ? ` · ${l.bedrooms} bd` : ''}
                        {l.bathrooms ? ` · ${l.bathrooms} ba` : ''}
                      </div>
                      <div className="text-xs text-blue-600 mt-1 font-mono truncate">{url}</div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => copyLink(l.slug)}
                        className="px-3 py-1.5 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md font-medium"
                      >
                        {copiedSlug === l.slug ? '✓ Copied' : 'Copy link'}
                      </button>
                      <a
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="px-3 py-1.5 text-xs bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-md font-medium"
                      >
                        Open
                      </a>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 font-semibold text-gray-800">Recent Applications</div>
          {loading ? (
            <div className="p-8 text-center text-gray-400">Loading...</div>
          ) : applications.length === 0 ? (
            <div className="p-8 text-center text-gray-400">No applications yet. Share your listing link to get started!</div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                <tr>
                  <th className="text-left px-6 py-3">Applicant</th>
                  <th className="text-left px-6 py-3">Property</th>
                  <th className="text-left px-6 py-3">Income</th>
                  <th className="text-left px-6 py-3">AI Score</th>
                  <th className="text-left px-6 py-3">LTB</th>
                  <th className="text-left px-6 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {applications.map(app => (
                  <tr key={app.id} className="hover:bg-gray-50 cursor-pointer">
                    <td className="px-6 py-4">
                      <div className="font-medium text-gray-900">{app.first_name} {app.last_name}</div>
                      <div className="text-xs text-gray-400">{new Date(app.created_at).toLocaleDateString()}</div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">{app.listing?.address}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {app.monthly_income ? `$${app.monthly_income.toLocaleString()}/mo` : '—'}
                    </td>
                    <td className="px-6 py-4">
                      {app.ai_score ? (
                        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${scoreColor(app.ai_score)}`}>
                          {app.ai_score}/100
                        </span>
                      ) : <span className="text-xs text-gray-400">Pending</span>}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      {app.ltb_records_found > 0
                        ? <span className="text-red-600 font-medium">⚠️ {app.ltb_records_found} record(s)</span>
                        : <span className="text-green-600">✓ Clear</span>}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        app.status === 'approved' ? 'bg-green-100 text-green-700' :
                        app.status === 'declined' ? 'bg-red-100 text-red-700' :
                        'bg-blue-100 text-blue-700'
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
