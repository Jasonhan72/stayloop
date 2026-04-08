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

const DIMS: { key: keyof ScoreResult['scores']; label: string; weight: number; icon: string }[] = [
  { key: 'doc_authenticity', label: '文档真伪', weight: 20, icon: '🛡️' },
  { key: 'payment_ability', label: '支付能力', weight: 20, icon: '💰' },
  { key: 'court_records', label: '法庭记录', weight: 20, icon: '⚖️' },
  { key: 'stability', label: '稳定性', weight: 15, icon: '🏠' },
  { key: 'behavior_signals', label: '行为信号', weight: 13, icon: '📡' },
  { key: 'info_consistency', label: '信息一致性', weight: 12, icon: '🔗' },
]

const DOC_TYPES = [
  { id: 'employment', icon: '📄', label: 'Employment Letter' },
  { id: 'paystub', icon: '💵', label: 'Pay Stubs' },
  { id: 'bank', icon: '🏦', label: 'Bank Statements' },
  { id: 'id', icon: '🪪', label: 'ID / Passport' },
  { id: 'credit', icon: '📊', label: 'Credit Report' },
  { id: 'offer', icon: '📋', label: 'Offer / Study Permit' },
  { id: 'reference', icon: '✉️', label: 'Landlord Reference' },
  { id: 'other', icon: '📎', label: 'Other Documents' },
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
  { key: 'upload', label: '📤 上传租客申请文件', status: 'pending' },
  { key: 'extract', label: '📛 从文件中提取申请人姓名', status: 'pending' },
  { key: 'court', label: '⚖️ 查询公开法庭记录 (CanLII)', status: 'pending' },
  { key: 'score', label: '🤖 运行 6 维度 AI 风控评分', status: 'pending' },
  { key: 'finalize', label: '✅ 生成评估报告', status: 'pending' },
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
      {/* Top utility bar */}
      <nav className="sticky top-0 z-20 backdrop-blur-xl bg-[#060814]/60 border-b border-white/[0.06]">
        <div className="max-w-5xl mx-auto px-6 py-3 flex items-center justify-between">
          <Link href="/" className="text-xs mono text-slate-500 hover:text-slate-300">← stayloop.ai</Link>
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="text-xs text-slate-400 hover:text-slate-200 px-3 py-1.5 rounded-lg border border-white/10 hover:bg-white/[0.04]">Dashboard →</Link>
            <span className="mono text-xs text-slate-500 hidden sm:inline">{landlord.email}</span>
            <button onClick={signOut} className="btn-ghost text-xs px-3 py-1.5">Sign out</button>
          </div>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-6 py-10">
        {/* Big header */}
        <div className="flex items-center gap-4 mb-8">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-cyan-400 to-violet-500 flex items-center justify-center text-white text-2xl font-bold shadow-2xl shadow-cyan-500/30">S</div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Stayloop Screening</h1>
            <p className="text-sm text-slate-400 mt-0.5">AI 租客风控评估系统 <span className="mono text-cyan-400">v1.1</span></p>
          </div>
        </div>

        {/* Free / Pro tabs */}
        <div className="grid grid-cols-2 gap-3 mb-6 p-1.5 rounded-2xl bg-white/[0.02] border border-white/[0.06]">
          <button
            onClick={() => {/* free is always available */}}
            className={`rounded-xl py-4 px-5 text-center transition-all ${
              !isPro
                ? 'bg-gradient-to-br from-cyan-500/20 to-cyan-500/5 border border-cyan-500/40 shadow-lg shadow-cyan-500/10'
                : 'border border-transparent hover:bg-white/[0.03]'
            }`}
          >
            <div className="text-base font-bold mb-1">免费版</div>
            <div className="text-[11px] text-slate-400 mono">CanLII 公开记录</div>
          </button>
          <Link
            href={isPro ? '#' : '/dashboard?upgrade=1'}
            className={`rounded-xl py-4 px-5 text-center transition-all block ${
              isPro
                ? 'bg-gradient-to-br from-amber-500/20 to-orange-500/5 border border-amber-500/40 shadow-lg shadow-amber-500/10'
                : 'border border-transparent hover:bg-white/[0.03]'
            }`}
          >
            <div className="text-base font-bold mb-1">订阅版 <span className="text-amber-400">💎</span></div>
            <div className="text-[11px] text-slate-400 mono">CanLII + Ontario Courts + Verified Network</div>
          </Link>
        </div>

        <div className="space-y-5">
            {/* Name + Rent inputs (top row) */}
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-slate-300 block mb-2">申请人姓名 <span className="text-slate-500">(可选)</span></label>
                <input
                  type="text"
                  value={tenantName}
                  onChange={e => setTenantName(e.target.value)}
                  placeholder="留空则从文件中自动提取"
                  className="w-full bg-[#0f172a] border border-[#1e293b] rounded-xl px-4 py-3 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500/60"
                />
                <p className="text-[11px] text-slate-500 mt-2 leading-relaxed">未填写时，系统将从 ID / Employment Letter / Pay Stub 中自动提取姓名用于法庭记录查询</p>
              </div>
              <div>
                <label className="text-xs text-slate-300 block mb-2">目标月租金 <span className="text-slate-500">(CAD)</span></label>
                <input
                  type="number"
                  value={monthlyRent}
                  onChange={e => setMonthlyRent(e.target.value)}
                  placeholder="e.g. 2500"
                  className="w-full bg-[#0f172a] border border-[#1e293b] rounded-xl px-4 py-3 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500/60"
                />
              </div>
            </div>

            {/* Big drop zone */}
            <div
              onDragOver={e => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`rounded-2xl p-12 border-2 border-dashed transition-all cursor-pointer text-center ${
                dragging
                  ? 'border-cyan-400/70 bg-cyan-500/5 scale-[1.005]'
                  : 'border-[#1e293b] bg-[#0f172a]/50 hover:border-cyan-500/40 hover:bg-[#0f172a]'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,image/*,.doc,.docx"
                className="hidden"
                onChange={e => addFiles(e.target.files)}
              />
              <div className="text-6xl mb-4">📁</div>
              <div className="text-lg font-semibold mb-2">拖放租客申请文件到这里</div>
              <div className="text-xs text-slate-500 mb-5">支持 PDF, JPG, PNG, DOC — Employment Letter, Pay Stubs, Bank Statements, ID, Credit Report 等</div>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click() }}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#1e293b] hover:bg-[#243449] border border-white/10 text-sm font-medium text-slate-200 transition-colors"
              >
                <span>📎</span>
                <span>选择文件</span>
              </button>
            </div>

            {/* Document type quick-add grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {DOC_TYPES.map(t => (
                <button
                  key={t.id}
                  onClick={() => fileInputRef.current?.click()}
                  className="flex flex-col items-center justify-center gap-2 rounded-xl bg-[#0f172a]/60 border border-[#1e293b] hover:border-cyan-500/40 hover:bg-[#0f172a] py-5 px-3 transition-all"
                >
                  <span className="text-2xl">{t.icon}</span>
                  <span className="text-[11px] text-slate-400 text-center leading-tight">{t.label}</span>
                </button>
              ))}
            </div>

            {pendingFiles.length > 0 && (
              <div className="rounded-2xl bg-[#0f172a]/60 border border-[#1e293b] p-4">
                <div className="text-[11px] uppercase tracking-wider text-slate-500 mb-2.5">已选择文件 · {pendingFiles.length}</div>
                <ul className="space-y-1.5">
                  {pendingFiles.map((f, i) => (
                    <li key={i} className="flex items-center justify-between text-xs">
                      <span className="text-slate-300 truncate flex-1">📄 {f.name} <span className="text-slate-600 mono ml-2">{(f.size / 1024).toFixed(0)} KB</span></span>
                      <button onClick={() => removeFile(i)} className="text-slate-500 hover:text-red-400 ml-3 mono">移除</button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Optional pasted context (collapsed by default would be nice but keep simple) */}
            <details className="rounded-2xl bg-[#0f172a]/40 border border-[#1e293b] overflow-hidden">
              <summary className="cursor-pointer px-5 py-3 text-xs text-slate-400 hover:text-slate-200 flex items-center justify-between">
                <span>📝 补充说明 / 粘贴文本（可选）</span>
                <span className="mono text-slate-600">expand ▾</span>
              </summary>
              <div className="px-5 pb-5 pt-1 space-y-3">
                <input
                  type="number"
                  value={monthlyIncome}
                  onChange={e => setMonthlyIncome(e.target.value)}
                  placeholder="租客月收入 (可选)"
                  className="w-full bg-[#0a0f1c] border border-[#1e293b] rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500/50"
                />
                <input
                  type="text"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="给 AI 的额外备注 (可选)"
                  className="w-full bg-[#0a0f1c] border border-[#1e293b] rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500/50"
                />
                <textarea
                  value={pastedText}
                  onChange={e => setPastedText(e.target.value)}
                  rows={4}
                  className="w-full bg-[#0a0f1c] border border-[#1e293b] rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500/50 mono"
                  placeholder="粘贴信用报告、邮件、聊天记录等 (可选)"
                />
              </div>
            </details>

            {/* Submit */}
            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={handleScreen}
                disabled={submitting}
                className="flex-1 sm:flex-initial bg-gradient-to-r from-cyan-500 to-violet-500 hover:from-cyan-400 hover:to-violet-400 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold px-8 py-3.5 rounded-xl shadow-lg shadow-cyan-500/30 transition-all"
              >
                {submitting ? '⏳ 分析中…' : '🚀 开始 AI 风控分析'}
              </button>
              {(result || error) && (
                <button onClick={reset} className="text-xs text-slate-400 hover:text-slate-200 px-4 py-2 rounded-lg border border-white/10 hover:bg-white/[0.04]">↻ 重新评估</button>
              )}
            </div>

            {/* Pipeline progress */}
            {(submitting || (result && steps.some(s => s.status === 'done'))) && (
              <div className="rounded-2xl bg-[#0f172a]/60 border border-[#1e293b] p-5">
                <div className="text-[11px] uppercase tracking-wider text-slate-500 mb-3 mono">// 分析流程</div>
                <ul className="space-y-2.5">
                  {steps.map(s => (
                    <li key={s.key} className={`flex items-center gap-3 text-sm ${s.key === 'court' && s.status === 'active' ? 'text-violet-300' : ''}`}>
                      <StepIcon status={s.status} />
                      <span className={
                        s.status === 'done' ? 'text-slate-200' :
                        s.status === 'active' ? (s.key === 'court' ? 'text-violet-300 font-medium' : 'text-cyan-300 font-medium') :
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
              <div className="rounded-xl p-4 border border-red-500/30 bg-red-500/5">
                <div className="text-sm text-red-300">⚠ {error}</div>
              </div>
            )}

            {/* RESULT */}
            {result && (
              <div className="space-y-5">
                {/* Header card with score ring */}
                <div className={`rounded-2xl p-6 bg-[#0f172a]/80 border ${level.border} shadow-2xl ${level.glow}`}>
                  <div className="flex items-start gap-6">
                    <ScoreRing score={result.overall} level={level} />
                    <div className="flex-1 min-w-0">
                      <div className="mono text-[11px] text-slate-500 mb-1">// 申请人</div>
                      <div className="text-2xl font-bold tracking-tight truncate">{result.extracted_name || tenantName || '未识别'}</div>
                      {result.name_was_extracted && (
                        <div className="mt-1.5 inline-flex items-center gap-1.5 text-[11px] text-violet-300 bg-violet-500/10 border border-violet-500/30 rounded-md px-2 py-0.5">
                          <span>📛</span>
                          <span>姓名从申请文件中自动提取</span>
                        </div>
                      )}
                      <div className={`mt-3 inline-flex items-center gap-2 ${level.bg} ${level.border} border rounded-lg px-3 py-1.5`}>
                        <span className={`mono text-xs font-bold ${level.text}`}>{level.label}</span>
                      </div>
                      <p className={`text-xs mt-1.5 ${level.text}`}>{level.decision}</p>
                    </div>
                  </div>
                  <div className="mt-5 pt-5 border-t border-white/[0.06]">
                    <div className="text-[11px] uppercase tracking-wider text-slate-500 mb-2 mono">// AI 风险摘要</div>
                    <p className="text-sm text-slate-300 leading-relaxed">{result.summary}</p>
                  </div>
                </div>

                {/* Six-dimension cards */}
                <div className="rounded-2xl bg-[#0f172a]/60 border border-[#1e293b] p-6">
                  <div className="text-[11px] uppercase tracking-wider text-slate-500 mb-4 mono">// 6 维度评分</div>
                  <div className="space-y-3">
                    {DIMS.map(({ key, label, weight, icon }) => {
                      const score = result.scores[key]
                      const lvl = riskLevel(score)
                      const isCourt = key === 'court_records'
                      return (
                        <div key={key} className={`rounded-xl border px-4 py-3 ${isCourt ? 'bg-violet-500/[0.04] border-violet-500/20' : `${lvl.bg} ${lvl.border}`}`}>
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <span className="text-base">{icon}</span>
                              <span className="text-sm font-medium text-slate-200">{label}</span>
                              <span className="mono text-[10px] text-slate-500">权重 {weight}%</span>
                            </div>
                            <span className={`mono text-lg font-bold ${lvl.text}`}>{score}</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-white/[0.05] overflow-hidden mb-1.5">
                            <div className={`h-full ${lvl.bar} transition-all duration-700`} style={{ width: `${Math.max(2, score)}%` }} />
                          </div>
                          {result.notes?.[key] && <div className="text-[11px] text-slate-400 leading-snug mt-1.5">{result.notes[key]}</div>}
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Court records detail card */}
                <div className="rounded-2xl bg-[#0f172a]/60 border border-[#1e293b] p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <div className="text-[11px] uppercase tracking-wider text-slate-500 mono">// 法庭记录查询详情</div>
                      <div className="text-xs text-slate-400 mt-1">
                        查询姓名: <span className="mono text-slate-200">{result.court_records_detail?.queried_name || '—'}</span>
                      </div>
                    </div>
                    <div className={`mono text-[10px] uppercase px-2 py-1 rounded-md border ${result.tier === 'pro' ? 'bg-amber-500/15 text-amber-300 border-amber-500/40' : 'bg-slate-500/10 text-slate-300 border-slate-500/30'}`}>{result.tier === 'pro' ? '订阅版' : '免费版'}</div>
                  </div>
                  <ul className="space-y-2">
                    {result.court_records_detail?.queries.map((q, i) => (
                      <CourtRow key={i} q={q} />
                    ))}
                  </ul>
                  {result.court_records_detail?.total_hits > 0 && (
                    <div className="mt-4 text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-md px-3 py-2">
                      ⚠ 共在 {result.court_records_detail.total_hits} 条记录中发现潜在匹配。请通过 CanLII 链接核实身份后再做决定。
                    </div>
                  )}
                  {!isPro && (
                    <Link href="/dashboard?upgrade=1" className="mt-4 block text-center text-xs px-3 py-2.5 rounded-lg border border-amber-500/40 bg-gradient-to-r from-amber-500/10 to-orange-500/10 text-amber-300 hover:from-amber-500/20 hover:to-orange-500/20 transition-colors">
                      💎 升级到订阅版以解锁 Ontario Courts Portal + Stayloop Verified Network
                    </Link>
                  )}
                </div>
              </div>
            )}

            {/* History */}
            {history.length > 0 && (
              <div className="rounded-2xl bg-[#0f172a]/40 border border-[#1e293b] overflow-hidden mt-8">
                <div className="px-5 py-4 border-b border-[#1e293b] flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-violet-400" />
                  <span className="font-semibold text-sm">最近评估</span>
                  <span className="mono text-[11px] text-slate-500 ml-auto">{history.length} 条</span>
                </div>
                <ul className="divide-y divide-[#1e293b] max-h-[400px] overflow-y-auto">
                  {history.map(s => {
                    const lvl = riskLevel(s.ai_score)
                    return (
                      <li key={s.id} className="px-5 py-3 hover:bg-white/[0.02]">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-sm text-slate-200 truncate">{s.tenant_name || '(自动提取)'}</div>
                          {s.ai_score != null ? (
                            <span className={`mono text-xs font-bold px-2 py-0.5 rounded border ${lvl.bg} ${lvl.border} ${lvl.text}`}>{s.ai_score}</span>
                          ) : (
                            <span className="text-[10px] mono text-slate-600">{s.status}</span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-600 mono mt-0.5">{new Date(s.created_at).toLocaleString('zh-CN')}</div>
                        {s.ai_summary && <div className="text-[11px] text-slate-500 mt-1 line-clamp-2">{s.ai_summary}</div>}
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="mt-10 pt-6 border-t border-[#1e293b] text-center text-[11px] text-slate-600 mono">
            Stayloop Screening v1.1 · {isPro ? 'Pro' : 'Free'} · {new Date().toLocaleDateString('zh-CN')}<br/>
            法庭记录: CanLII (canlii.org){isPro && ' + Ontario Courts Portal'}<br/>
            本报告仅供决策参考。最终租赁决定应遵守 Ontario RTA / Human Rights Code。
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
