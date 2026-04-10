'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useUser } from '@/lib/useUser'
import { useT, LanguageToggle } from '@/lib/i18n'
import { Application, ApplicationFile } from '@/types'

const DIMENSIONS: { key: string; label: string; weight: number }[] = [
  { key: 'doc_authenticity_score', label: 'Doc Authenticity', weight: 20 },
  { key: 'payment_ability_score', label: 'Payment Ability', weight: 20 },
  { key: 'court_records_score', label: 'Court Records', weight: 20 },
  { key: 'stability_score', label: 'Stability', weight: 15 },
  { key: 'behavior_signals_score', label: 'Behavior Signals', weight: 13 },
  { key: 'info_consistency_score', label: 'Info Consistency', weight: 12 },
]
const DIM_NOTE_KEYS: Record<string, string> = {
  doc_authenticity_score: 'doc_authenticity',
  payment_ability_score: 'payment_ability',
  court_records_score: 'court_records',
  stability_score: 'stability',
  behavior_signals_score: 'behavior_signals',
  info_consistency_score: 'info_consistency',
}

interface LandlordRow { id: string; plan: 'free' | 'pro' | 'enterprise' }

export default function ApplicationDetailPage() {
  const { t } = useT()
  const params = useParams<{ id: string }>()
  const { user: landlord, loading: authLoading } = useUser({ redirectIfMissing: true })
  const [app, setApp] = useState<Application | null>(null)
  const [plan, setPlan] = useState<'free' | 'pro' | 'enterprise'>('free')
  const [loading, setLoading] = useState(true)
  const [scoring, setScoring] = useState(false)
  const [searchingCourt, setSearchingCourt] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [updating, setUpdating] = useState(false)

  useEffect(() => {
    if (landlord && params?.id) {
      load()
      loadPlan()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [landlord, params?.id])

  async function loadPlan() {
    if (!landlord) return
    const { data } = await supabase
      .from('landlords')
      .select('plan')
      .eq('id', landlord.profileId)
      .maybeSingle<LandlordRow>()
    if (data?.plan) setPlan(data.plan)
  }

  async function load() {
    setLoading(true)
    const { data, error } = await supabase
      .from('applications')
      .select('*, listing:listings(*)')
      .eq('id', params.id)
      .maybeSingle()
    if (error) setError(error.message)
    if (data) setApp(data as any)
    setLoading(false)
  }

  async function authedFetch(url: string, body: any) {
    const { data: { session } } = await supabase.auth.getSession()
    return fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session?.access_token}`,
      },
      body: JSON.stringify(body),
    })
  }

  async function runAiScore() {
    if (!app) return
    setScoring(true)
    setError(null)
    const res = await authedFetch('/api/ai-score', { application_id: app.id })
    const json = await res.json()
    setScoring(false)
    if (!res.ok) { setError(json.error || 'AI scoring failed'); return }
    await load()
  }

  async function runCourtSearch() {
    if (!app) return
    setSearchingCourt(true)
    setError(null)
    const res = await authedFetch('/api/ltb-search', { application_id: app.id })
    const json = await res.json()
    setSearchingCourt(false)
    if (!res.ok) { setError(json.error || 'Court search failed'); return }
    await load()
  }

  async function setStatus(status: 'approved' | 'declined' | 'reviewing') {
    if (!app) return
    setUpdating(true)
    await supabase.from('applications').update({ status }).eq('id', app.id)
    setUpdating(false)
    await load()
  }

  async function viewFile(path: string) {
    const res = await authedFetch('/api/file-url', { path })
    const json = await res.json()
    if (json.url) window.open(json.url, '_blank', 'noopener,noreferrer')
    else setError(json.error || 'Could not open file')
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

  // Color scale per spec: green 85-100, light-green 70-84, yellow 50-69, orange 30-49, red 0-29
  const scoreColor = (s?: number | null) => {
    if (s == null) return 'text-slate-500 bg-white/[0.04] border-white/[0.08]'
    if (s >= 85) return 'text-emerald-300 bg-emerald-500/15 border-emerald-500/40'
    if (s >= 70) return 'text-lime-300 bg-lime-500/15 border-lime-500/40'
    if (s >= 50) return 'text-amber-300 bg-amber-500/15 border-amber-500/40'
    if (s >= 30) return 'text-orange-300 bg-orange-500/15 border-orange-500/40'
    return 'text-red-300 bg-red-500/15 border-red-500/40'
  }

  const Field = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div>
      <div className="label">{label}</div>
      <div className="text-sm text-slate-100 mono">{value || <span className="text-slate-600">—</span>}</div>
    </div>
  )

  const dimNotes: Record<string, string> = (app as any).ai_dimension_notes || {}
  const files: ApplicationFile[] = (app as any).files || []
  const courtRecords: any[] = Array.isArray(app.ltb_records_json) ? app.ltb_records_json : []
  const isPro = plan === 'pro' || plan === 'enterprise'

  return (
    <div className="min-h-screen">
      <nav className="nav-bar">
        <Link href="/dashboard" className="nav-brand">
          <div className="nav-logo">S</div>
          <div className="nav-title">Stayloop</div>
        </Link>
        <div className="nav-actions">
          <LanguageToggle />
          <Link href="/dashboard" className="btn btn-ghost btn-sm">← {t('dash.backToDash')}</Link>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-6 py-10 fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="chip chip-accent mono mb-3">// APPLICATION</div>
            <h1 className="h-hero">
              {(app as any).ai_extracted_name || `${app.first_name} ${app.last_name}`}
            </h1>
            {(app as any).ai_extracted_name && (
              <p className="mono" style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 4 }}>self-reported: {app.first_name} {app.last_name}</p>
            )}
            <p className="mono" style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
              {new Date(app.created_at).toLocaleDateString()} · {app.listing?.address}{app.listing?.unit ? `, ${app.listing.unit}` : ''}
            </p>
          </div>
          <span className="mono" style={{ padding: '6px 12px', borderRadius: 8, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', border: '1px solid', ...(
            app.status === 'approved' ? { background: 'rgba(16, 185, 129, 0.12)', color: '#6EE7B7', borderColor: 'rgba(16, 185, 129, 0.35)' } :
            app.status === 'declined' ? { background: 'rgba(239, 68, 68, 0.12)', color: '#FCA5A5', borderColor: 'rgba(239, 68, 68, 0.35)' } :
            { background: 'rgba(34, 211, 238, 0.12)', color: '#67E8F9', borderColor: 'rgba(34, 211, 238, 0.35)' }
          ) }}>{app.status}</span>
        </div>

        {/* AI Screening — 6 dimensions */}
        <div className="card-hero" style={{ padding: 28, position: 'relative', overflow: 'hidden' }}>
          <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 to-violet-500/5 pointer-events-none" />
          <div className="relative">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 pulse-dot" />
                <h2 className="font-semibold">AI Screening · 6 Dimensions</h2>
                <span className="mono text-[10px] text-slate-500">claude-sonnet-4-5 · vision</span>
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
                <div className="grid grid-cols-3 gap-3">
                  {DIMENSIONS.map(d => {
                    const val = (app as any)[d.key] as number | undefined
                    const note = dimNotes[DIM_NOTE_KEYS[d.key]]
                    return (
                      <div key={d.key} className={`rounded-xl border p-3 ${scoreColor(val)}`}>
                        <div className="flex items-center justify-between">
                          <div className="text-[10px] uppercase tracking-wider opacity-70">{d.label}</div>
                          <div className="text-[10px] mono opacity-60">{d.weight}%</div>
                        </div>
                        <div className="text-2xl font-bold mono mt-1">{val ?? '—'}</div>
                        {note && <div className="text-[11px] mt-2 leading-snug opacity-90">{note}</div>}
                      </div>
                    )
                  })}
                </div>
              </>
            ) : (
              <p className="text-sm text-slate-400">
                No AI score yet. Click <span className="text-cyan-400">Run AI score</span> to analyze documents (Vision OCR), income, employment history, and 6-dimension risk.
              </p>
            )}
          </div>
        </div>

        {/* Uploaded files */}
        <div className="card" style={{ padding: 24 }}>
          <div className="flex items-center gap-2 mb-5">
            <div className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
            <h3 className="font-semibold">Uploaded documents</h3>
            <span className="mono text-[10px] text-slate-500">{files.length} file{files.length === 1 ? '' : 's'}</span>
          </div>
          {files.length === 0 ? (
            <p className="text-xs text-slate-500 mono">No documents uploaded by applicant.</p>
          ) : (
            <ul className="space-y-2">
              {files.map((f, i) => (
                <li key={i} className="flex items-center justify-between text-sm bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="mono text-[10px] uppercase px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">{f.kind}</span>
                    <span className="truncate text-slate-200">{f.name}</span>
                    <span className="mono text-[10px] text-slate-500">{(f.size / 1024).toFixed(0)} KB</span>
                  </div>
                  <button onClick={() => viewFile(f.path)} className="text-xs mono text-cyan-300 hover:text-cyan-200">view ↗</button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Court records */}
        <div className="card" style={{ padding: 24 }}>
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-rose-400" />
              <h3 className="font-semibold">Ontario court records</h3>
              <span className="mono text-[10px] text-slate-500">CanLII · LTB free tier</span>
            </div>
            <button onClick={runCourtSearch} disabled={searchingCourt} className="btn-ghost text-xs">
              {searchingCourt ? 'Searching...' : 'Search CanLII'}
            </button>
          </div>
          {courtRecords.length === 0 && (
            <p className="text-xs text-slate-500 mono">
              {(app as any).court_search_status === 'no_results'
                ? 'No matching LTB rulings found.'
                : 'No court search run yet.'}
            </p>
          )}
          {courtRecords.length > 0 && (
            <ul className="space-y-2">
              {courtRecords.map((r: any, i: number) => (
                <li key={i} className="text-sm bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-2">
                  <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-cyan-300 hover:text-cyan-200 mono text-xs">
                    {r.title || r.citation || 'LTB ruling'} ↗
                  </a>
                  {r.citation && <div className="text-[10px] mono text-slate-500 mt-0.5">{r.citation}</div>}
                </li>
              ))}
            </ul>
          )}

          {/* Pro upsell — Ontario Courts Portal */}
          <div className="mt-5 pt-5 border-t border-white/[0.06] flex items-center justify-between gap-4">
            <div className="text-xs text-slate-400">
              <div className="mono text-amber-400 mb-0.5">// PRO</div>
              Cross-search Ontario Courts Portal + Stayloop Verified Network
            </div>
            {isPro ? (
              <button disabled className="btn-ghost text-xs opacity-60">Ontario Courts (coming soon)</button>
            ) : (
              <Link href="/dashboard?upgrade=1" className="text-xs px-3 py-1.5 rounded-lg font-semibold bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-lg shadow-amber-500/30">
                Upgrade to Pro
              </Link>
            )}
          </div>
        </div>

        {/* Personal */}
        <div className="card" style={{ padding: 24 }}>
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
        <div className="card" style={{ padding: 24 }}>
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
        <div className="card" style={{ padding: 24 }}>
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
        <div className="card" style={{ padding: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div className="chip chip-accent mono mb-2">// DECISION</div>
            <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>Update status</h3>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={() => setStatus('reviewing')} disabled={updating} className="btn btn-ghost btn-sm">Reviewing</button>
            <button onClick={() => setStatus('approved')} disabled={updating} className="btn btn-sm" style={{ background: 'linear-gradient(135deg, #059669, #10B981)', color: '#fff', border: '1px solid rgba(16, 185, 129, 0.5)', fontWeight: 600 }}>Approve</button>
            <button onClick={() => setStatus('declined')} disabled={updating} className="btn btn-sm" style={{ background: 'linear-gradient(135deg, #DC2626, #EF4444)', color: '#fff', border: '1px solid rgba(239, 68, 68, 0.5)', fontWeight: 600 }}>Decline</button>
          </div>
        </div>
      </div>
    </div>
  )
}
