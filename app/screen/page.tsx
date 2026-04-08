'use client'
import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useLandlord } from '@/lib/useLandlord'

interface UploadedFile {
  path: string
  name: string
  size: number
  mime: string
  kind: string
}

interface Screening {
  id: string
  tenant_name: string | null
  ai_score: number | null
  ai_summary: string | null
  status: string
  created_at: string
  scored_at: string | null
}

interface CourtQuery {
  source: string
  tier: 'free' | 'pro'
  status: 'ok' | 'unavailable' | 'skipped' | 'coming_soon'
  hits: number | null
  url?: string
  note?: string
}

interface ScoreResult {
  overall: number
  scores: {
    doc_authenticity: number
    payment_ability: number
    court_records: number
    stability: number
    behavior_signals: number
    info_consistency: number
  }
  notes: Record<string, string>
  extracted_name: string
  name_was_extracted: boolean
  summary: string
  court_records_detail: { queries: CourtQuery[]; total_hits: number; queried_name: string }
  tier: 'free' | 'pro'
}

const DIMS: { key: keyof ScoreResult['scores']; label: string; weight: number }[] = [
  { key: 'doc_authenticity', label: 'Document authenticity', weight: 20 },
  { key: 'payment_ability', label: 'Payment ability', weight: 20 },
  { key: 'court_records', label: 'Court records', weight: 20 },
  { key: 'stability', label: 'Stability', weight: 15 },
  { key: 'behavior_signals', label: 'Behavior signals', weight: 13 },
  { key: 'info_consistency', label: 'Info consistency', weight: 12 },
]

interface RiskLevel {
  label: string
  decision: string
  ring: string
  text: string
  bg: string
  border: string
  bar: string
  glow: string
}

function riskLevel(score: number | null | undefined): RiskLevel {
  const s = score ?? -1
  if (s >= 85) return {
    label: 'APPROVED',
    decision: 'Strong candidate — sign with confidence',
    ring: 'stroke-emerald-400',
    text: 'text-emerald-300',
    bg: 'bg-emerald-500/15',
    border: 'border-emerald-500/40',
    bar: 'bg-gradient-to-r from-emerald-500 to-emerald-400',
    glow: 'shadow-emerald-500/30',
  }
  if (s >= 70) return {
    label: 'LIKELY APPROVE',
    decision: 'Looks good — light verification recommended',
    ring: 'stroke-lime-400',
    text: 'text-lime-300',
    bg: 'bg-lime-500/15',
    border: 'border-lime-500/40',
    bar: 'bg-gradient-to-r from-lime-500 to-lime-400',
    glow: 'shadow-lime-500/30',
  }
  if (s >= 50) return {
    label: 'REVIEW',
    decision: 'Manual review needed — significant gaps',
    ring: 'stroke-amber-400',
    text: 'text-amber-300',
    bg: 'bg-amber-500/15',
    border: 'border-amber-500/40',
    bar: 'bg-gradient-to-r from-amber-500 to-amber-400',
    glow: 'shadow-amber-500/30',
  }
  if (s >= 30) return {
    label: 'CAUTION',
    decision: 'High risk — require guarantor or decline',
    ring: 'stroke-orange-400',
    text: 'text-orange-300',
    bg: 'bg-orange-500/15',
    border: 'border-orange-500/40',
    bar: 'bg-gradient-to-r from-orange-500 to-orange-400',
    glow: 'shadow-orange-500/30',
  }
  return {
    label: s < 0 ? 'PENDING' : 'REJECT',
    decision: s < 0 ? 'Awaiting analysis' : 'Decline — unacceptable risk',
    ring: 'stroke-red-400',
    text: 'text-red-300',
    bg: 'bg-red-500/15',
    border: 'border-red-500/40',
    bar: 'bg-gradient-to-r from-red-500 to-red-400',
    glow: 'shadow-red-500/30',
  }
}

type StepStatus = 'pending' | 'active' | 'done' | 'skipped'
interface PipelineStep { key: string; label: string; status: StepStatus }

const INITIAL_STEPS: PipelineStep[] = [
  { key: 'upload', label: 'Upload tenant documents', status: 'pending' },
  { key: 'extract', label: 'Extract candidate identity (OCR)', status: 'pending' },
  { key: 'court', label: 'Query public court records', status: 'pending' },
  { key: 'score', label: 'Run 6-dimension AI scoring', status: 'pending' },
  { key: 'finalize', label: 'Finalize report', status: 'pending' },
]

export default function ScreenPage() {
  const { landlord, loading: authLoading, signOut } = useLandlord()
  const [plan, setPlan] = useState<'free' | 'pro' | 'enterprise'>('free')
  const [tenantName, setTenantName] = useState('')
  const [monthlyRent, setMonthlyRent] = useState('')
  const [monthlyIncome, setMonthlyIncome] = useState('')
  const [notes, setNotes] = useState('')
  const [pastedText, setPastedText] = useState('')
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [dragging, setDragging] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [steps, setSteps] = useState<PipelineStep[]>(INITIAL_STEPS)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ScoreResult | null>(null)
  const [history, setHistory] = useState<Screening[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (landlord) {
      loadHistory()
      loadPlan()
    }
  }, [landlord])

  async function loadPlan() {
    if (!landlord) return
    const { data } = await supabase
      .from('landlords')
      .select('plan')
      .eq('id', landlord.landlordId)
      .maybeSingle()
    if (data?.plan) setPlan(data.plan as any)
  }

  async function loadHistory() {
    const { data } = await supabase
      .from('screenings')
      .select('id, tenant_name, ai_score, ai_summary, status, created_at, scored_at')
      .order('created_at', { ascending: false })
      .limit(20)
    if (data) setHistory(data)
  }

  function setStep(key: string, status: StepStatus) {
    setSteps(prev => prev.map(s => s.key === key ? { ...s, status } : s))
  }

  function addFiles(list: FileList | File[] | null) {
    if (!list) return
    const incoming = Array.from(list).filter(f => {
      if (f.size > 10 * 1024 * 1024) {
        setError(`${f.name} is over 10 MB`)
        return false
      }
      return true
    })
    setPendingFiles(prev => [...prev, ...incoming])
    setError(null)
  }

  function removeFile(idx: number) {
    setPendingFiles(prev => prev.filter((_, i) => i !== idx))
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    addFiles(e.dataTransfer.files)
  }

  function reset() {
    setTenantName('')
    setMonthlyRent('')
    setMonthlyIncome('')
    setNotes('')
    setPastedText('')
    setPendingFiles([])
    setResult(null)
    setError(null)
    setSteps(INITIAL_STEPS.map(s => ({ ...s, status: 'pending' as StepStatus })))
  }

  async function handleScreen() {
    if (!landlord) return
    if (pendingFiles.length === 0 && !pastedText.trim() && !tenantName.trim()) {
      setError('Drop at least one file, paste some text, or fill in the tenant name')
      return
    }
    setSubmitting(true)
    setError(null)
    setResult(null)
    setSteps(INITIAL_STEPS.map(s => ({ ...s, status: 'pending' as StepStatus })))

    try {
      // Step 1: Create screening row + upload files
      setStep('upload', 'active')
      const { data: row, error: insertErr } = await supabase
        .from('screenings')
        .insert({
          landlord_id: landlord.landlordId,
          tenant_name: tenantName || null,
          monthly_rent: monthlyRent ? Number(monthlyRent) : null,
          monthly_income: monthlyIncome ? Number(monthlyIncome) : null,
          notes: notes || null,
          pasted_text: pastedText || null,
          status: 'uploading',
        })
        .select('id')
        .single()
      if (insertErr || !row) throw new Error(insertErr?.message || 'Failed to create screening')
      const screeningId = row.id

      const uploaded: UploadedFile[] = []
      for (let i = 0; i < pendingFiles.length; i++) {
        const f = pendingFiles[i]
        const safeName = f.name.replace(/[^a-zA-Z0-9._-]/g, '_')
        const path = `screenings/${landlord.landlordId}/${screeningId}/${Date.now()}_${safeName}`
        const { error: upErr } = await supabase
          .storage.from('tenant-files')
          .upload(path, f, { contentType: f.type, upsert: false })
        if (upErr) throw new Error(`Upload failed for ${f.name}: ${upErr.message}`)
        uploaded.push({
          path,
          name: f.name,
          size: f.size,
          mime: f.type || 'application/octet-stream',
          kind: guessKind(f.name),
        })
      }
      if (uploaded.length > 0) {
        await supabase.from('screenings').update({ files: uploaded }).eq('id', screeningId)
      }
      setStep('upload', 'done')

      // Steps 2-4 happen server-side. We mark them in sequence as a UX hint.
      if (!tenantName.trim() && uploaded.length > 0) {
        setStep('extract', 'active')
      } else {
        setStep('extract', 'skipped')
      }
      // Kick off the API call
      const { data: { session } } = await supabase.auth.getSession()
      const fetchPromise = fetch('/api/screen-score', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token || ''}`,
        },
        body: JSON.stringify({ screening_id: screeningId }),
      })
      // Sequence the visual steps while the server works
      await new Promise(r => setTimeout(r, 1500))
      if (!tenantName.trim() && uploaded.length > 0) setStep('extract', 'done')
      setStep('court', 'active')
      await new Promise(r => setTimeout(r, 1500))
      setStep('court', 'done')
      setStep('score', 'active')

      const res = await fetchPromise
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Scoring failed')
      setStep('score', 'done')
      setStep('finalize', 'active')
      await new Promise(r => setTimeout(r, 400))
      setStep('finalize', 'done')

      setResult(data)
      loadHistory()
    } catch (e: any) {
      setError(e?.message || 'Unknown error')
      setSteps(prev => prev.map(s => s.status === 'active' ? { ...s, status: 'pending' } : s))
    } finally {
      setSubmitting(false)
    }
  }

  function guessKind(name: string): string {
    const n = name.toLowerCase()
    if (n.includes('paystub') || n.includes('pay_stub') || n.includes('payslip')) return 'paystub'
    if (n.includes('id') || n.includes('license') || n.includes('passport')) return 'id'
    if (n.includes('credit')) return 'credit_report'
    if (n.includes('bank') || n.includes('statement')) return 'bank_statement'
    if (n.includes('tax') || n.includes('t4') || n.includes('noa')) return 'tax_doc'
    if (n.includes('reference') || n.includes('letter')) return 'reference_letter'
    return 'other'
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

  const overall = result?.overall ?? null
  const level = riskLevel(overall)
  const isPro = plan === 'pro' || plan === 'enterprise'

  return (
    <div className="min-h-screen text-slate-100">
      {/* Nav */}
      <nav className="sticky top-0 z-20 backdrop-blur-xl bg-[#060814]/60 border-b border-white/[0.06]">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-400 to-violet-500 flex items-center justify-center text-white font-bold shadow-lg shadow-cyan-500/30">S</div>
            <div>
              <div className="text-base font-bold tracking-tight">Stayloop</div>
              <div className="text-[10px] mono text-slate-500 -mt-0.5">screen</div>
            </div>
          </Link>
          <div className="flex items-center gap-3">
            <span className={`mono text-[10px] uppercase px-2 py-1 rounded-md border ${isPro ? 'bg-amber-500/15 text-amber-300 border-amber-500/40' : 'bg-slate-500/10 text-slate-300 border-slate-500/30'}`}>{plan}</span>
            <Link href="/dashboard" className="text-xs text-slate-400 hover:text-slate-200 px-3 py-1.5 rounded-lg border border-white/10 hover:bg-white/[0.04]">Listings & applications →</Link>
            <span className="mono text-xs text-slate-400 hidden sm:inline">{landlord.email}</span>
            <button onClick={signOut} className="btn-ghost text-xs px-3 py-1.5">Sign out</button>
          </div>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-6 py-10">
        <div className="mb-8">
          <div className="mono text-xs text-cyan-400 mb-1">// AI SCREEN</div>
          <h1 className="text-3xl font-bold tracking-tight">Quick tenant screening</h1>
          <p className="text-sm text-slate-400 mt-2">Drop a tenant&apos;s documents. We extract their identity, query public court records, and run a 6-dimension AI risk score in seconds.</p>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* LEFT: input */}
          <div className="lg:col-span-2 space-y-5">
            {/* Drop zone */}
            <div
              onDragOver={e => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              className={`glass rounded-2xl p-8 border-2 border-dashed transition-colors cursor-pointer ${dragging ? 'border-cyan-400/60 bg-cyan-500/5' : 'border-white/10 hover:border-white/20'}`}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,image/*"
                className="hidden"
                onChange={e => addFiles(e.target.files)}
              />
              <div className="text-center">
                <div className="text-4xl mb-3 opacity-40">⇡</div>
                <div className="font-semibold mb-1">Drop tenant documents here</div>
                <div className="text-xs text-slate-500 mono">PDF, JPG, PNG · up to 10 MB each · IDs, paystubs, credit reports, bank statements, employment letters</div>
              </div>
            </div>

            {pendingFiles.length > 0 && (
              <div className="glass rounded-2xl p-4">
                <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">Pending uploads ({pendingFiles.length})</div>
                <ul className="space-y-1.5">
                  {pendingFiles.map((f, i) => (
                    <li key={i} className="flex items-center justify-between text-xs">
                      <span className="text-slate-300 truncate">{f.name} <span className="text-slate-600 mono">{(f.size / 1024).toFixed(0)} KB</span></span>
                      <button onClick={() => removeFile(i)} className="text-slate-500 hover:text-red-400 ml-3">remove</button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Manual fields */}
            <div className="glass rounded-2xl p-5 space-y-4">
              <div className="text-[10px] uppercase tracking-wider text-slate-500">Optional context</div>
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Candidate name (optional — auto-extracted from files)" value={tenantName} onChange={setTenantName} placeholder="leave blank to extract from ID" />
                <Field label="Monthly rent ($)" value={monthlyRent} onChange={setMonthlyRent} placeholder="2500" type="number" />
                <Field label="Tenant monthly income ($)" value={monthlyIncome} onChange={setMonthlyIncome} placeholder="7500" type="number" />
                <Field label="Notes for the AI" value={notes} onChange={setNotes} placeholder="any context" />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-slate-500 block mb-1.5">Paste credit report / email / chat</label>
                <textarea
                  value={pastedText}
                  onChange={e => setPastedText(e.target.value)}
                  rows={5}
                  className="w-full bg-white/[0.03] border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500/50 mono"
                  placeholder="Paste any text — credit report, message thread, employer email, etc."
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={handleScreen}
                disabled={submitting}
                className="btn-primary px-6 py-3 disabled:opacity-50"
              >
                {submitting ? 'Screening…' : 'Run AI screening →'}
              </button>
              {(result || error) && (
                <button onClick={reset} className="btn-ghost text-xs px-4 py-2">New screening</button>
              )}
            </div>

            {/* Pipeline progress */}
            {(submitting || (result && steps.some(s => s.status === 'done'))) && (
              <div className="glass rounded-2xl p-5">
                <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-3">Pipeline</div>
                <ul className="space-y-2.5">
                  {steps.map(s => (
                    <li key={s.key} className="flex items-center gap-3 text-sm">
                      <StepIcon status={s.status} />
                      <span className={
                        s.status === 'done' ? 'text-slate-200' :
                        s.status === 'active' ? 'text-cyan-300' :
                        s.status === 'skipped' ? 'text-slate-600 line-through' :
                        'text-slate-500'
                      }>
                        {s.label}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {error && (
              <div className="glass rounded-xl p-4 border border-red-500/30 bg-red-500/5">
                <div className="text-sm text-red-300">{error}</div>
              </div>
            )}

            {/* RESULT */}
            {result && (
              <div className="space-y-5">
                {/* Header card with score ring */}
                <div className={`glass rounded-2xl p-6 border ${level.border} shadow-2xl ${level.glow}`}>
                  <div className="flex items-start gap-6">
                    <ScoreRing score={result.overall} level={level} />
                    <div className="flex-1 min-w-0">
                      <div className="mono text-[10px] text-slate-500 mb-1">// CANDIDATE</div>
                      <div className="text-2xl font-bold tracking-tight truncate">{result.extracted_name || tenantName || 'Unknown'}</div>
                      {result.name_was_extracted && (
                        <div className="mt-1.5 inline-flex items-center gap-1.5 text-[11px] text-violet-300 bg-violet-500/10 border border-violet-500/30 rounded-md px-2 py-0.5">
                          <span>📛</span>
                          <span>Name auto-extracted from uploaded ID</span>
                        </div>
                      )}
                      <div className={`mt-3 inline-flex items-center gap-2 ${level.bg} ${level.border} border rounded-lg px-3 py-1.5`}>
                        <span className={`mono text-xs font-bold ${level.text}`}>{level.label}</span>
                      </div>
                      <p className={`text-xs mt-1.5 ${level.text}`}>{level.decision}</p>
                    </div>
                  </div>
                  <div className="mt-5 pt-5 border-t border-white/[0.06]">
                    <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">AI summary</div>
                    <p className="text-sm text-slate-300 leading-relaxed">{result.summary}</p>
                  </div>
                </div>

                {/* Six-dimension cards */}
                <div className="glass rounded-2xl p-6">
                  <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-4">6-dimension breakdown</div>
                  <div className="space-y-3">
                    {DIMS.map(({ key, label, weight }) => {
                      const score = result.scores[key]
                      const lvl = riskLevel(score)
                      return (
                        <div key={key} className={`rounded-lg border px-4 py-3 ${lvl.bg} ${lvl.border}`}>
                          <div className="flex items-center justify-between mb-1.5">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-slate-200">{label}</span>
                              <span className="mono text-[10px] text-slate-500">weight {weight}%</span>
                            </div>
                            <span className={`mono text-base font-bold ${lvl.text}`}>{score}</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-white/[0.05] overflow-hidden mb-1.5">
                            <div className={`h-full ${lvl.bar} transition-all duration-700`} style={{ width: `${Math.max(2, score)}%` }} />
                          </div>
                          {result.notes?.[key] && <div className="text-[11px] text-slate-400 leading-snug">{result.notes[key]}</div>}
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Court records detail card */}
                <div className="glass rounded-2xl p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-slate-500">Court records lookup</div>
                      <div className="text-xs text-slate-400 mt-0.5">
                        Queried name: <span className="mono text-slate-200">{result.court_records_detail?.queried_name || '—'}</span>
                      </div>
                    </div>
                    <div className={`mono text-[10px] uppercase px-2 py-1 rounded-md border ${result.tier === 'pro' ? 'bg-amber-500/15 text-amber-300 border-amber-500/40' : 'bg-slate-500/10 text-slate-300 border-slate-500/30'}`}>{result.tier} tier</div>
                  </div>
                  <ul className="space-y-2">
                    {result.court_records_detail?.queries.map((q, i) => (
                      <CourtRow key={i} q={q} />
                    ))}
                  </ul>
                  {result.court_records_detail?.total_hits > 0 && (
                    <div className="mt-4 text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-md px-3 py-2">
                      ⚠ Total {result.court_records_detail.total_hits} potential match{result.court_records_detail.total_hits === 1 ? '' : 'es'} across queried sources. Review the linked CanLII pages to confirm identity before deciding.
                    </div>
                  )}
                  {!isPro && (
                    <Link href="/dashboard?upgrade=1" className="mt-4 block text-center text-xs px-3 py-2 rounded-lg border border-amber-500/40 bg-gradient-to-r from-amber-500/10 to-orange-500/10 text-amber-300 hover:from-amber-500/20 hover:to-orange-500/20 transition-colors">
                      ⚡ Upgrade to Pro to unlock Ontario Courts Portal + Stayloop Verified Network
                    </Link>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* RIGHT: history */}
          <div>
            <div className="glass rounded-2xl overflow-hidden sticky top-24">
              <div className="px-5 py-4 border-b border-white/[0.06] flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-violet-400" />
                <span className="font-semibold text-sm">Recent screenings</span>
              </div>
              {history.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500 mono">No screenings yet</div>
              ) : (
                <ul className="divide-y divide-white/[0.04] max-h-[70vh] overflow-y-auto">
                  {history.map(s => {
                    const lvl = riskLevel(s.ai_score)
                    return (
                      <li key={s.id} className="px-5 py-3 hover:bg-white/[0.02]">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-sm text-slate-200 truncate">{s.tenant_name || '(auto-extract)'}</div>
                          {s.ai_score != null ? (
                            <span className={`mono text-xs font-bold px-2 py-0.5 rounded border ${lvl.bg} ${lvl.border} ${lvl.text}`}>{s.ai_score}</span>
                          ) : (
                            <span className="text-[10px] mono text-slate-600">{s.status}</span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-600 mono mt-0.5">{new Date(s.created_at).toLocaleString()}</div>
                        {s.ai_summary && <div className="text-[11px] text-slate-500 mt-1 line-clamp-2">{s.ai_summary}</div>}
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Field({ label, value, onChange, placeholder, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return (
    <div>
      <label className="text-[10px] uppercase tracking-wider text-slate-500 block mb-1.5">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-white/[0.03] border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500/50"
      />
    </div>
  )
}

function StepIcon({ status }: { status: StepStatus }) {
  if (status === 'done') return <span className="w-5 h-5 rounded-full bg-emerald-500/20 border border-emerald-500/50 flex items-center justify-center text-[10px] text-emerald-300">✓</span>
  if (status === 'active') return <span className="w-5 h-5 rounded-full border-2 border-cyan-400/30 border-t-cyan-400 animate-spin" />
  if (status === 'skipped') return <span className="w-5 h-5 rounded-full bg-slate-700/30 border border-slate-600/40 flex items-center justify-center text-[10px] text-slate-500">—</span>
  return <span className="w-5 h-5 rounded-full bg-white/[0.03] border border-white/10" />
}

function ScoreRing({ score, level }: { score: number; level: RiskLevel }) {
  const r = 50
  const c = 2 * Math.PI * r
  const offset = c - (Math.max(0, Math.min(100, score)) / 100) * c
  return (
    <div className="relative w-32 h-32 shrink-0">
      <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
        <circle cx="60" cy="60" r={r} className="stroke-white/[0.08] fill-none" strokeWidth="9" />
        <circle
          cx="60" cy="60" r={r}
          className={`fill-none ${level.ring} transition-all duration-1000`}
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className={`text-4xl font-bold mono ${level.text}`}>{score}</div>
        <div className="mono text-[9px] text-slate-500 uppercase tracking-wider">/ 100</div>
      </div>
    </div>
  )
}

function CourtRow({ q }: { q: CourtQuery }) {
  let icon: string, iconCls: string, badge: string, badgeCls: string
  if (q.status === 'ok') {
    if ((q.hits ?? 0) > 0) {
      icon = '⚠'
      iconCls = 'bg-amber-500/20 border-amber-500/50 text-amber-300'
      badge = `${q.hits} match${q.hits === 1 ? '' : 'es'}`
      badgeCls = 'bg-amber-500/15 text-amber-300 border-amber-500/30'
    } else {
      icon = '✓'
      iconCls = 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
      badge = 'Clear'
      badgeCls = 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
    }
  } else if (q.status === 'coming_soon') {
    icon = '⋯'
    iconCls = 'bg-slate-700/30 border-slate-600/40 text-slate-500'
    badge = 'Coming soon'
    badgeCls = 'bg-slate-500/10 text-slate-400 border-slate-500/30'
  } else if (q.status === 'unavailable') {
    icon = '!'
    iconCls = 'bg-orange-500/20 border-orange-500/40 text-orange-300'
    badge = 'Unavailable'
    badgeCls = 'bg-orange-500/10 text-orange-300 border-orange-500/30'
  } else {
    icon = '—'
    iconCls = 'bg-slate-700/30 border-slate-600/40 text-slate-500'
    badge = 'Skipped'
    badgeCls = 'bg-slate-500/10 text-slate-400 border-slate-500/30'
  }
  const inner = (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-white/[0.02] border border-white/[0.05] hover:bg-white/[0.04] transition-colors">
      <span className={`w-7 h-7 rounded-full border flex items-center justify-center text-xs ${iconCls}`}>{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="text-sm text-slate-200 truncate">{q.source}</div>
        {q.note && <div className="text-[10px] text-slate-500 mono truncate">{q.note}</div>}
      </div>
      <span className={`mono text-[10px] uppercase px-2 py-0.5 rounded border ${badgeCls}`}>{badge}</span>
    </div>
  )
  if (q.url && q.status === 'ok') {
    return <li><a href={q.url} target="_blank" rel="noreferrer">{inner}</a></li>
  }
  return <li>{inner}</li>
}
