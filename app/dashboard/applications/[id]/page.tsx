'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useLandlord } from '@/lib/useLandlord'
import { Application } from '@/types'

export default function ApplicationDetailPage() {
  const params = useParams<{ id: string }>()
  const { landlord, loading: authLoading } = useLandlord()
  const [app, setApp] = useState<Application | null>(null)
  const [loading, setLoading] = useState(true)
  const [scoring, setScoring] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [updating, setUpdating] = useState(false)

  useEffect(() => {
    if (landlord && params?.id) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    if (!res.ok) { setError(json.error || 'AI scoring failed'); return }
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
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-cyan-500/30 border-t-cyan-400 rounded-full animate-spin" />
      </div>
    )
  }
  if (!app) {
    return <div className="min-h-screen flex items-center justify-center mono text-sm text-slate-500">Application not found.</div>
  }

  const scoreColor = (s?: number) => {
    if (!s) return 'text-slate-500 bg-white/[0.04] border-white/[0.08]'
    if (s >= 75) return 'text-emerald-300 bg-emerald-500/15 border-emerald-500/30'
    if (s >= 50) return 'text-amber-300 bg-amber-500/15 border-amber-500/30'
    return 'text-red-300 bg-red-500/15 border-red-500/30'
  }

  const Field = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div>
      <div className="label">{label}</div>
      <div className="text-sm text-slate-100 mono">{value || <span className="text-slate-600">—</span>}</div>
    </div>
  )

  return (
    <div className="min-h-screen text-slate-100">
      <nav className="sticky top-0 z-20 backdrop-blur-xl bg-[#060814]/60 border-b border-white/[0.06]">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/dashboard" className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-400 to-violet-500 flex items-center justify-center text-white font-bold shadow-lg shadow-cyan-500/30">S</div>
            <div className="text-base font-bold tracking-tight">Stayloop</div>
          </Link>
          <Link href="/dashboard" className="mono text-xs text-slate-400 hover:text-slate-200">← back</Link>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-6 py-10 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="mono text-xs text-cyan-400 mb-1">// APPLICATION</div>
            <h1 className="text-3xl font-bold tracking-tight">{app.first_name} {app.last_name}</h1>
            <p className="text-sm text-slate-400 mt-1 mono">
              {new Date(app.created_at).toLocaleDateString()} · {app.listing?.address}{app.listing?.unit ? `, ${app.listing.unit}` : ''}
            </p>
          </div>
          <span className={`px-3 py-1 rounded-md text-xs font-medium mono border ${
            app.status === 'approved' ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' :
            app.status === 'declined' ? 'bg-red-500/15 text-red-300 border-red-500/30' :
            'bg-cyan-500/15 text-cyan-300 border-cyan-500/30'
          }`}>{app.status}</span>
        </div>

        {/* AI Screening */}
        <div className="glass rounded-2xl p-7 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 to-violet-500/5 pointer-events-none" />
          <div className="relative">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 pulse-dot" />
                <h2 className="font-semibold">AI Screening</h2>
                <span className="mono text-[10px] text-slate-500">claude-sonnet-4-5</span>
              </div>
              <button onClick={runAiScore} disabled={scoring} className="btn-primary text-xs px-4 py-2">
                {scoring ? 'Analyzing...' : app.ai_score ? 'Re-run score' : 'Run AI score'}
              </button>
            </div>

            {error && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 text-red-300 text-sm px-3 py-2 mb-4">{error}</div>
            )}

            {app.ai_score ? (
              <>
                <div className="flex items-center gap-5 mb-6">
                  <div className={`text-5xl font-bold mono rounded-2xl px-6 py-4 border ${scoreColor(app.ai_score)}`}>
                    {app.ai_score}<span className="text-2xl text-slate-500">/100</span>
                  </div>
                  <p className="text-sm text-slate-300 leading-relaxed flex-1">{app.ai_summary}</p>
                </div>
                <div className="grid grid-cols-5 gap-3">
                  {[
                    { l: 'Income', v: app.ai_income_score },
                    { l: 'Employment', v: app.ai_employment_score },
                    { l: 'History', v: app.ai_rental_history_score },
                    { l: 'LTB', v: app.ai_ltb_score },
                    { l: 'Reference', v: app.ai_reference_score },
                  ].map(s => (
                    <div key={s.l} className="text-center">
                      <div className={`mx-auto w-14 h-14 rounded-xl flex items-center justify-center text-lg font-bold mono border ${scoreColor(s.v ?? undefined)}`}>
                        {s.v ?? '—'}
                      </div>
                      <div className="text-[10px] uppercase tracking-wider text-slate-500 mt-2">{s.l}</div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-sm text-slate-400">
                No AI score yet. Click <span className="text-cyan-400">Run AI score</span> to analyze income, employment, rental history, and LTB records.
              </p>
            )}
          </div>
        </div>

        {/* Personal */}
        <div className="glass rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-5">
            <div className="w-1.5 h-1.5 rounded-full bg-violet-400" />
            <h3 className="font-semibold">Personal</h3>
          </div>
          <div className="grid grid-cols-2 gap-5">
            <Field label="Email" value={app.email} />
            <Field label="Phone" value={app.phone} />
            <Field label="Date of birth" value={app.date_of_birth} />
            <Field label="Current address" value={app.current_address} />
          </div>
        </div>

        {/* Employment */}
        <div className="glass rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-5">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <h3 className="font-semibold">Employment & income</h3>
          </div>
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
        <div className="glass rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-5">
            <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            <h3 className="font-semibold">Previous rental</h3>
          </div>
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
        <div className="glass rounded-2xl p-6 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <div className="mono text-xs text-cyan-400 mb-1">// DECISION</div>
            <h3 className="font-semibold">Update status</h3>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setStatus('reviewing')} disabled={updating} className="btn-ghost text-xs">Reviewing</button>
            <button onClick={() => setStatus('approved')} disabled={updating} className="text-xs px-4 py-2 rounded-lg font-semibold bg-gradient-to-r from-emerald-500 to-emerald-600 text-white shadow-lg shadow-emerald-500/30 hover:shadow-emerald-500/50 transition-shadow disabled:opacity-50">Approve</button>
            <button onClick={() => setStatus('declined')} disabled={updating} className="text-xs px-4 py-2 rounded-lg font-semibold bg-gradient-to-r from-red-500 to-red-600 text-white shadow-lg shadow-red-500/30 hover:shadow-red-500/50 transition-shadow disabled:opacity-50">Decline</button>
          </div>
        </div>
      </div>
    </div>
  )
}
