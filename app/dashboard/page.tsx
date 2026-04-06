'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Application } from '@/types'

export default function Dashboard() {
  const [applications, setApplications] = useState<Application[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchApplications()
  }, [])

  async function fetchApplications() {
    const { data, error } = await supabase
      .from('applications')
      .select('*, listing:listings(*)')
      .order('created_at', { ascending: false })

    if (!error && data) setApplications(data)
    setLoading(false)
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

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white text-sm font-bold">S</div>
          <span className="text-lg font-bold text-blue-600">Stayloop</span>
        </div>
        <span className="text-sm text-gray-500">Ontario Pro</span>
      </nav>

      <div className="max-w-6xl mx-auto px-6 py-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Dashboard</h1>

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
