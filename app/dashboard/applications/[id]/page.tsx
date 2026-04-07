'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useLandlord } from '@/lib/useLandlord'
import { Application } from '@/types'

export default function ApplicationDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const { landlord, loading: authLoading } = useLandlord()
  const [app, setApp] = useState<Application | null>(null)
  const [loading, setLoading] = useState(true)
  const [scoring, setScoring] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [updating, setUpdating] = useState(false)

  useEffect(() => {
    if (landlord && params?.id) load()
  }, [landlord, params?.id])

  async function load() {
    setLoading(true)
    const { data, error } = await supabase
      .from('applications')
      .select('*, listing:listings(*)')
      .eq('id', params.id)
      .maybeSingle()
    if (error) setError(error.message)
    if (data) setApp(data)
    setLoading(false)
  }

  async function runAiScore() {
    if (!app) return
    setScoring(true)
    setError(null)
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/api/ai-score', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session?.access_token}`,
      },
      body: JSON.stringify({ application_id: app.id }),
    })
    const json = await res.json()
    setScoring(false)
    if (!res.ok) {
      setError(json.error || 'AI scoring failed')
      return
    }
    await load()
  }

  async function setStatus(status: 'approved' | 'declined' | 'reviewing') {
    if (!app) return
    setUpdating(true)
    await supabase.from('applications').update({ status }).eq('id', app.id)
    setUpdating(false)
    await load()
  }

  if (authLoading || loading) {
    return <div className="min-h-screen flex items-center justify-center text-sm text-gray-500">Loading...</div>
  }
  if (!app) {
    return <div className="min-h-screen flex items-center justify-center text-sm text-gray-500">Application not found.</div>
  }

  const scoreColor = (s?: number) => {
    if (!s) return 'bg-gray-100 text-gray-600'
    if (s >= 75) return 'bg-green-100 text-green-700'
    if (s >= 50) return 'bg-yellow-100 text-yellow-700'
    return 'bg-red-100 text-red-700'
  }

  const Field = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div>
      <div className="text-xs uppercase text-gray-400 tracking-wide">{label}</div>
      <div className="text-sm text-gray-900 mt-0.5">{value || '—'}</div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <Link href="/dashboard" className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white text-sm font-bold">S</div>
          <span className="text-lg font-bold text-blue-600">Stayloop</span>
        </Link>
        <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-900">← Back</Link>
      </nav>

      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{app.first_name} {app.last_name}</h1>
            <p className="text-sm text-gray-500 mt-1">
              Applied {new Date(app.created_at).toLocaleDateString()} for {app.listing?.address}
              {app.listing?.unit ? `, ${app.listing.unit}` : ''}
            </p>
          </div>
          <span className={`px-3 py-1 rounded-full text-xs font-medium ${
            app.status === 'approved' ? 'bg-green-100 text-green-700' :
            app.status === 'declined' ? 'bg-red-100 text-red-700' :
            'bg-blue-100 text-blue-700'
          }`}>{app.status}</span>
        </div>

        {/* AI Score Card */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-800">AI Screening</h2>
            <button
              onClick={runAiScore}
              disabled={scoring}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white text-sm font-medium rounded-lg"
            >
              {scoring ? 'Scoring...' : app.ai_score ? 'Re-run AI score' : 'Run AI score'}
            </button>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2 mb-4">{error}</div>
          )}

          {app.ai_score ? (
            <>
              <div className="flex items-center gap-4 mb-4">
                <div className={`text-4xl font-bold rounded-xl px-5 py-3 ${scoreColor(app.ai_score)}`}>
                  {app.ai_score}<span className="text-xl">/100</span>
                </div>
                <p className="text-sm text-gray-700 flex-1">{app.ai_summary}</p>
              </div>
              <div className="grid grid-cols-5 gap-3">
                {[
                  { l: 'Income', v: app.ai_income_score },
                  { l: 'Employment', v: app.ai_employment_score },
                  { l: 'Rental history', v: app.ai_rental_history_score },
                  { l: 'LTB', v: app.ai_ltb_score },
                  { l: 'Reference', v: app.ai_reference_score },
                ].map(s => (
                  <div key={s.l} className="text-center">
                    <div className={`mx-auto w-12 h-12 rounded-full flex items-center justify-center text-sm font-bold ${scoreColor(s.v ?? undefined)}`}>
                      {s.v ?? '—'}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">{s.l}</div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-sm text-gray-500">No AI score yet. Click &ldquo;Run AI score&rdquo; to analyze income, employment, rental history, and LTB records.</p>
          )}
        </div>

        {/* Applicant info */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 grid grid-cols-2 gap-5">
          <Field label="Email" value={app.email} />
          <Field label="Phone" value={app.phone} />
          <Field label="Date of birth" value={app.date_of_birth} />
          <Field label="Current address" value={app.current_address} />
        </div>

        {/* Employment */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="font-semibold text-gray-800 mb-4">Employment & income</h3>
          <div className="grid grid-cols-2 gap-5">
            <Field label="Status" value={app.employment_status} />
            <Field label="Employer" value={app.employer_name} />
            <Field label="Job title" value={app.job_title} />
            <Field label="Monthly income" value={app.monthly_income ? `$${app.monthly_income.toLocaleString()}` : null} />
            <Field label="Start date" value={app.employment_start_date} />
            <Field label="Employer phone" value={app.employer_phone} />
          </div>
        </div>

        {/* Rental history */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="font-semibold text-gray-800 mb-4">Previous rental</h3>
          <div className="grid grid-cols-2 gap-5">
            <Field label="Previous landlord" value={app.prev_landlord_name} />
            <Field label="Landlord phone" value={app.prev_landlord_phone} />
            <Field label="Previous address" value={app.prev_address} />
            <Field label="Previous rent" value={app.prev_rent ? `$${app.prev_rent}/mo` : null} />
            <Field label="Move in / out" value={`${app.prev_move_in || '?'} → ${app.prev_move_out || '?'}`} />
            <Field label="Reason for leaving" value={app.reason_for_leaving} />
          </div>
        </div>

        {/* Decision */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-gray-800">Decision</h3>
            <p className="text-sm text-gray-500 mt-1">Update application status</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setStatus('reviewing')} disabled={updating} className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg">Reviewing</button>
            <button onClick={() => setStatus('approved')} disabled={updating} className="px-3 py-1.5 text-sm bg-green-600 hover:bg-green-700 text-white rounded-lg">Approve</button>
            <button onClick={() => setStatus('declined')} disabled={updating} className="px-3 py-1.5 text-sm bg-red-600 hover:bg-red-700 text-white rounded-lg">Decline</button>
          </div>
        </div>
      </div>
    </div>
  )
}
