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
  summary: string
}

const DIMS: { key: keyof ScoreResult['scores']; label: string }[] = [
  { key: 'doc_authenticity', label: 'Doc authenticity' },
  { key: 'payment_ability', label: 'Payment ability' },
  { key: 'court_records', label: 'Court records' },
  { key: 'stability', label: 'Stability' },
  { key: 'behavior_signals', label: 'Behavior signals' },
  { key: 'info_consistency', label: 'Info consistency' },
]

export default function ScreenPage() {
  const { landlord, loading: authLoading, signOut } = useLandlord()
  const [tenantName, setTenantName] = useState('')
  const [monthlyRent, setMonthlyRent] = useState('')
  const [monthlyIncome, setMonthlyIncome] = useState('')
  const [notes, setNotes] = useState('')
  const [pastedText, setPastedText] = useState('')
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [dragging, setDragging] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [progress, setProgress] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ScoreResult | null>(null)
  const [history, setHistory] = useState<Screening[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (landlord) loadHistory()
  }, [landlord])

  async function loadHistory() {
    const { data } = await supabase
      .from('screenings')
      .select('id, tenant_name, ai_score, ai_summary, status, created_at, scored_at')
      .order('created_at', { ascending: false })
      .limit(20)
    if (data) setHistory(data)
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
  }

  async function handleScreen() {
    if (!landlord) return
    if (pendingFiles.length === 0 && !pastedText.trim() && !tenantName.trim()) {
      setError('Add at least one file, paste some text, or fill in the tenant name')
      return
    }
    setSubmitting(true)
    setError(null)
    setResult(null)

    try {
      // 1. Create screening row
      setProgress('Creating screening...')
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

      // 2. Upload files
      const uploaded: UploadedFile[] = []
      for (let i = 0; i < pendingFiles.length; i++) {
        const f = pendingFiles[i]
        setProgress(`Uploading ${i + 1} / ${pendingFiles.length}: ${f.name}`)
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

      // 3. Run AI scoring
      setProgress('Running AI screening...')
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/screen-score', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token || ''}`,
        },
        body: JSON.stringify({ screening_id: screeningId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Scoring failed')

      setResult(data)
      setProgress(null)
      loadHistory()
    } catch (e: any) {
      setError(e?.message || 'Unknown error')
      setProgress(null)
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

  const scoreColor = (score?: number | null) => {
    if (score == null) return 'text-slate-500'
    if (score >= 75) return 'text-emerald-300'
    if (score >= 50) return 'text-amber-300'
    return 'text-red-300'
  }

  const scoreBg = (score?: number | null) => {
    if (score == null) return 'bg-white/[0.04] border-white/[0.08]'
    if (score >= 75) return 'bg-emerald-500/15 border-emerald-500/30'
    if (score >= 50) return 'bg-amber-500/15 border-amber-500/30'
    return 'bg-red-500/15 border-red-500/30'
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
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-400 to-violet-500 flex items-center justify-center text-white font-bold shadow-lg shadow-cyan-500/30">S</div>
            <div>
              <div className="text-base font-bold tracking-tight">Stayloop</div>
              <div className="text-[10px] mono text-slate-500 -mt-0.5">screen</div>
            </div>
          </Link>
          <div className="flex items-center gap-3">
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
          <p className="text-sm text-slate-400 mt-2">Drop a tenant&apos;s documents, paste their info, or both. Get a 6-dimension AI score in seconds.</p>
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
                <div className="text-xs text-slate-500 mono">PDF, JPG, PNG · up to 10 MB each · paystubs, IDs, credit reports, bank statements…</div>
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
                <Field label="Tenant name" value={tenantName} onChange={setTenantName} placeholder="Jane Doe" />
                <Field label="Monthly rent ($)" value={monthlyRent} onChange={setMonthlyRent} placeholder="2500" type="number" />
                <Field label="Tenant monthly income ($)" value={monthlyIncome} onChange={setMonthlyIncome} placeholder="7500" type="number" />
                <Field label="Notes for the AI" value={notes} onChange={setNotes} placeholder="any context" />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-slate-500 block mb-1.5">Paste credit report / email / chat</label>
                <textarea
                  value={pastedText}
                  onChange={e => setPastedText(e.target.value)}
                  rows={6}
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
                {submitting ? (progress || 'Screening…') : 'Run AI screening →'}
              </button>
              {(result || error) && (
                <button onClick={reset} className="btn-ghost text-xs px-4 py-2">New screening</button>
              )}
            </div>

            {error && (
              <div className="glass rounded-xl p-4 border border-red-500/30 bg-red-500/5">
                <div className="text-sm text-red-300">{error}</div>
              </div>
            )}

            {result && (
              <div className="glass rounded-2xl p-6 border border-cyan-500/30">
                <div className="flex items-start justify-between mb-5">
                  <div>
                    <div className="mono text-[10px] text-cyan-400 mb-1">// RESULT</div>
                    <div className="text-lg font-semibold">{result.extracted_name || tenantName || 'Tenant candidate'}</div>
                  </div>
                  <div className={`px-4 py-2 rounded-xl border text-3xl font-bold mono ${scoreBg(result.overall)} ${scoreColor(result.overall)}`}>
                    {result.overall}
                  </div>
                </div>
                <p className="text-sm text-slate-300 leading-relaxed mb-5">{result.summary}</p>
                <div className="grid sm:grid-cols-2 gap-2.5">
                  {DIMS.map(({ key, label }) => (
                    <div key={key} className={`rounded-lg border px-3 py-2.5 ${scoreBg(result.scores[key])}`}>
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-xs text-slate-300">{label}</span>
                        <span className={`mono text-sm font-bold ${scoreColor(result.scores[key])}`}>{result.scores[key]}</span>
                      </div>
                      <div className="text-[11px] text-slate-400 leading-snug">{result.notes?.[key]}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* RIGHT: history */}
          <div>
            <div className="glass rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-white/[0.06] flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-violet-400" />
                <span className="font-semibold text-sm">Recent screenings</span>
              </div>
              {history.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500 mono">No screenings yet</div>
              ) : (
                <ul className="divide-y divide-white/[0.04]">
                  {history.map(s => (
                    <li key={s.id} className="px-5 py-3 hover:bg-white/[0.02]">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm text-slate-200 truncate">{s.tenant_name || '(unnamed)'}</div>
                        {s.ai_score != null ? (
                          <span className={`mono text-xs font-bold px-2 py-0.5 rounded border ${scoreBg(s.ai_score)} ${scoreColor(s.ai_score)}`}>{s.ai_score}</span>
                        ) : (
                          <span className="text-[10px] mono text-slate-600">{s.status}</span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-600 mono mt-0.5">{new Date(s.created_at).toLocaleString()}</div>
                      {s.ai_summary && <div className="text-[11px] text-slate-500 mt-1 line-clamp-2">{s.ai_summary}</div>}
                    </li>
                  ))}
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
