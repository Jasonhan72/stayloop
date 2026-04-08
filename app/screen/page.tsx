'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useLandlord } from '@/lib/useLandlord'
import { useT, LanguageToggle, type DictKey } from '@/lib/i18n'

// ───────────────────────────────────────────────────────── Types ──

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

// ───────────────────────────────────────────────────── Constants ──

type ScoreKey = keyof ScoreResult['scores']

const CATEGORIES: {
  id: ScoreKey
  labelKey: DictKey
  descKey: DictKey
  icon: string
  weight: number
}[] = [
  { id: 'doc_authenticity', labelKey: 'cat.doc_authenticity.label', descKey: 'cat.doc_authenticity.desc', icon: '🔍', weight: 0.20 },
  { id: 'payment_ability', labelKey: 'cat.payment_ability.label', descKey: 'cat.payment_ability.desc', icon: '💰', weight: 0.20 },
  { id: 'court_records', labelKey: 'cat.court_records.label', descKey: 'cat.court_records.desc', icon: '⚖️', weight: 0.20 },
  { id: 'stability', labelKey: 'cat.stability.label', descKey: 'cat.stability.desc', icon: '🏠', weight: 0.15 },
  { id: 'info_consistency', labelKey: 'cat.info_consistency.label', descKey: 'cat.info_consistency.desc', icon: '🔗', weight: 0.12 },
  { id: 'behavior_signals', labelKey: 'cat.behavior_signals.label', descKey: 'cat.behavior_signals.desc', icon: '📊', weight: 0.13 },
]

interface RiskLevel { min: number; labelKey: DictKey; tagKey: DictKey; color: string; bg: string }
const RISK_LEVELS: RiskLevel[] = [
  { min: 85, labelKey: 'risk.safe', tagKey: 'risk.tag.safe', color: '#16A34A', bg: '#F0FDF4' },
  { min: 70, labelKey: 'risk.mostlySafe', tagKey: 'risk.tag.mostlySafe', color: '#65A30D', bg: '#F7FEE7' },
  { min: 50, labelKey: 'risk.review', tagKey: 'risk.tag.review', color: '#EAB308', bg: '#FEFCE8' },
  { min: 30, labelKey: 'risk.risky', tagKey: 'risk.tag.risky', color: '#F97316', bg: '#FFF7ED' },
  { min: 0, labelKey: 'risk.highRisk', tagKey: 'risk.tag.reject', color: '#DC2626', bg: '#FEF2F2' },
]

const FILE_TYPES: { key: string; labelKey: DictKey; icon: string }[] = [
  { key: 'employment_letter', labelKey: 'screen.filetype.employment', icon: '📄' },
  { key: 'pay_stub', labelKey: 'screen.filetype.paystub', icon: '💵' },
  { key: 'bank_statement', labelKey: 'screen.filetype.bank', icon: '🏦' },
  { key: 'id_document', labelKey: 'screen.filetype.id', icon: '🪪' },
  { key: 'credit_report', labelKey: 'screen.filetype.credit', icon: '📊' },
  { key: 'offer_letter', labelKey: 'screen.filetype.offer', icon: '📋' },
  { key: 'reference', labelKey: 'screen.filetype.reference', icon: '✉️' },
  { key: 'other', labelKey: 'screen.filetype.other', icon: '📎' },
]

function getRiskLevel(score: number): RiskLevel {
  return RISK_LEVELS.find(r => score >= r.min) || RISK_LEVELS[RISK_LEVELS.length - 1]
}

function guessKind(name: string): string {
  const n = name.toLowerCase()
  if (n.includes('paystub') || n.includes('pay_stub') || n.includes('payslip') || n.includes('pay')) return 'pay_stub'
  if (n.includes('id') || n.includes('license') || n.includes('passport') || n.includes('permit')) return 'id_document'
  if (n.includes('credit')) return 'credit_report'
  if (n.includes('bank') || n.includes('statement')) return 'bank_statement'
  if (n.includes('employ') || n.includes('letter') || n.includes('offer')) return 'employment_letter'
  if (n.includes('reference')) return 'reference'
  return 'other'
}

// ───────────────────────────────────────────────── Sub-components ──

function ScoreRing({ score, size = 140, strokeWidth = 10 }: { score: number; size?: number; strokeWidth?: number }) {
  const risk = getRiskLevel(score)
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (score / 100) * circumference
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#1a1a2e" strokeWidth={strokeWidth} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={risk.color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 1.5s cubic-bezier(0.4, 0, 0.2, 1)' }}
        />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: size * 0.32, fontWeight: 800, color: risk.color, fontFamily: "'JetBrains Mono', monospace", lineHeight: 1 }}>{score}</span>
        <span style={{ fontSize: 11, color: '#94a3b8', marginTop: 2, letterSpacing: 1 }}>/ 100</span>
      </div>
    </div>
  )
}

function CategoryBar({ category, score, animDelay = 0, tier }: { category: typeof CATEGORIES[number]; score: number; animDelay?: number; tier: 'free' | 'pro' }) {
  const { t } = useT()
  const risk = getRiskLevel(score)
  const isCourtRecord = category.id === 'court_records'
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 16 }}>{category.icon}</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0' }}>{t(category.labelKey)}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {isCourtRecord && (
            <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, background: tier === 'pro' ? '#8B5CF620' : '#334155', color: tier === 'pro' ? '#A78BFA' : '#64748b', fontWeight: 600 }}>
              {tier === 'pro' ? 'PRO' : 'FREE · CanLII'}
            </span>
          )}
          <span style={{ fontSize: 15, fontWeight: 700, color: risk.color, fontFamily: "'JetBrains Mono', monospace" }}>{score}</span>
        </div>
      </div>
      <div style={{ height: 6, borderRadius: 3, background: '#1e293b', overflow: 'hidden' }}>
        <div style={{ height: '100%', borderRadius: 3, background: `linear-gradient(90deg, ${risk.color}88, ${risk.color})`, width: `${score}%`, transition: 'width 1.2s cubic-bezier(0.4, 0, 0.2, 1)', transitionDelay: `${animDelay}ms` }} />
      </div>
      <p style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>{t(category.descKey)}</p>
    </div>
  )
}

function FileChip({ file, onRemove }: { file: File; onRemove: () => void }) {
  const ext = file.name.split('.').pop()?.toLowerCase() || ''
  const isPdf = ext === 'pdf'
  const isImage = ['jpg', 'jpeg', 'png', 'webp'].includes(ext)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: '#1e293b', borderRadius: 8, border: '1px solid #334155', fontSize: 13, color: '#cbd5e1' }}>
      <span style={{ fontSize: 14 }}>{isPdf ? '📄' : isImage ? '🖼️' : '📎'}</span>
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>{file.name}</span>
      <span style={{ fontSize: 11, color: '#64748b' }}>{(file.size / 1024).toFixed(0)}KB</span>
      <button onClick={onRemove} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 16, padding: 0, lineHeight: 1 }}>×</button>
    </div>
  )
}

function Flag({ type, text }: { type: 'danger' | 'warning' | 'info' | 'success'; text: string }) {
  const colors = {
    danger: { bg: '#451a1a', border: '#7f1d1d', text: '#fca5a5', icon: '⚠️' },
    warning: { bg: '#452a1a', border: '#7c4a1d', text: '#fcd34d', icon: '⚡' },
    info: { bg: '#1a2745', border: '#1d4a7c', text: '#93c5fd', icon: 'ℹ️' },
    success: { bg: '#1a3a2a', border: '#1d7c4a', text: '#86efac', icon: '✓' },
  }
  const c = colors[type] || colors.info
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 14px', background: c.bg, border: `1px solid ${c.border}`, borderRadius: 8, fontSize: 13, color: c.text, lineHeight: 1.5 }}>
      <span>{c.icon}</span><span>{text}</span>
    </div>
  )
}

function CourtRecordDetail({ queries, totalHits, queriedName, tier }: { queries: CourtQuery[]; totalHits: number; queriedName: string; tier: 'free' | 'pro' }) {
  const { t } = useT()
  const availableCount = queries.filter(q => q.status === 'ok').length
  return (
    <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 16, padding: '20px', marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#94a3b8' }}>{t('screen.result.court.title')}</div>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{t('screen.result.court.queriedName')} <span style={{ fontFamily: "'JetBrains Mono', monospace", color: '#cbd5e1' }}>{queriedName || '—'}</span></div>
        </div>
        <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 4, background: tier === 'pro' ? '#8B5CF620' : '#1e293b', color: tier === 'pro' ? '#A78BFA' : '#64748b', border: `1px solid ${tier === 'pro' ? '#8B5CF640' : '#334155'}`, fontWeight: 600 }}>
          {tier === 'pro' ? t('screen.result.court.pro') : t('screen.result.court.free')}
        </span>
      </div>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: '#64748b', marginBottom: 8, fontWeight: 600 }}>{t('screen.result.court.sources')}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {queries.map((q, i) => {
            const available = q.status === 'ok'
            const hit = available && (q.hits ?? 0) > 0
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: available ? '#cbd5e1' : '#475569' }}>
                <span style={{ width: 18, height: 18, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, background: available ? (hit ? '#DC262620' : '#16A34A20') : '#1e293b', color: available ? (hit ? '#FCA5A5' : '#86EFAC') : '#475569', border: `1px solid ${available ? (hit ? '#7F1D1D' : '#1D7C4A') : '#334155'}` }}>
                  {available ? (hit ? '!' : '✓') : '🔒'}
                </span>
                <span style={{ flex: 1 }}>{q.source}</span>
                <span style={{ fontSize: 10, fontWeight: 600, color: available ? (hit ? '#FCA5A5' : '#86EFAC') : '#475569' }}>
                  {available ? (hit ? t('screen.result.court.hitsN', { n: q.hits ?? 0 }) : t('screen.result.court.clean')) : (q.status === 'coming_soon' ? t('screen.result.court.comingSoon') : t('screen.result.court.needPro'))}
                </span>
              </div>
            )
          })}
        </div>
      </div>
      {totalHits === 0 && (
        <div style={{ padding: '16px', textAlign: 'center', background: '#16A34A10', borderRadius: 8, border: '1px solid #1D7C4A40' }}>
          <div style={{ fontSize: 24, marginBottom: 6 }}>✅</div>
          <div style={{ fontSize: 13, color: '#86EFAC', fontWeight: 600 }}>{t('screen.result.court.clean.title')}</div>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>{t('screen.result.court.clean.sub', { n: availableCount })}</div>
        </div>
      )}
      {totalHits > 0 && (
        <div style={{ padding: '12px 14px', background: '#DC262610', border: '1px solid #7F1D1D60', borderRadius: 8, fontSize: 12, color: '#FCA5A5' }}>
          {t('screen.result.court.hits', { n: totalHits })}
        </div>
      )}
      {tier === 'free' && (
        <div style={{ marginTop: 14, padding: '12px 14px', background: '#8B5CF610', border: '1px solid #8B5CF630', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 16 }}>💎</span>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#A78BFA' }}>{t('screen.result.court.upgrade.title')}</div>
            <div style={{ fontSize: 11, color: '#7C6DB5', marginTop: 2 }}>{t('screen.result.court.upgrade.sub')}</div>
          </div>
        </div>
      )}
    </div>
  )
}

// ──────────────────────────────────────────────────── Main Page ──

export default function ScreenPage() {
  const { t, lang } = useT()
  const { landlord, loading: authLoading, signOut } = useLandlord()

  const [plan, setPlan] = useState<'free' | 'pro' | 'enterprise'>('free')
  const [tier, setTier] = useState<'free' | 'pro'>('free')

  const [files, setFiles] = useState<File[]>([])
  const [dragOver, setDragOver] = useState(false)
  const [applicantName, setApplicantName] = useState('')
  const [targetRent, setTargetRent] = useState('')

  const [analyzing, setAnalyzing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [progressLabel, setProgressLabel] = useState('')
  const [result, setResult] = useState<ScoreResult | null>(null)
  const [error, setError] = useState<string | null>(null)
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
    if (data?.plan) {
      setPlan(data.plan as any)
      if (data.plan === 'pro' || data.plan === 'enterprise') setTier('pro')
    }
  }

  async function loadHistory() {
    const { data } = await supabase
      .from('screenings')
      .select('id, tenant_name, ai_score, ai_summary, status, created_at')
      .order('created_at', { ascending: false })
      .limit(20)
    if (data) setHistory(data)
  }

  const handleFiles = useCallback((list: FileList | File[] | null) => {
    if (!list) return
    const incoming = Array.from(list).filter(f => {
      if (f.size > 10 * 1024 * 1024) {
        setError(t('screen.err.tooBig', { name: f.name }))
        return false
      }
      return true
    })
    setFiles(prev => [...prev, ...incoming])
    setError(null)
  }, [t])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    handleFiles(e.dataTransfer.files)
  }, [handleFiles])

  const removeFile = (idx: number) => setFiles(prev => prev.filter((_, i) => i !== idx))

  const reset = () => {
    setFiles([])
    setResult(null)
    setProgress(0)
    setProgressLabel('')
    setApplicantName('')
    setTargetRent('')
    setError(null)
  }

  async function runAnalysis() {
    if (!landlord) return
    if (files.length === 0 && !applicantName.trim()) {
      setError(t('screen.err.min'))
      return
    }
    setAnalyzing(true)
    setResult(null)
    setError(null)
    setProgress(0)

    // Drive the progress UI while the real backend works
    const steps = [
      { label: t('screen.step.meta'), pct: 6 },
      { label: t('screen.step.ocr'), pct: 14 },
      ...(!applicantName.trim() ? [{ label: t('screen.step.extractName'), pct: 20 }] : []),
      { label: t('screen.step.auth'), pct: 28 },
      { label: t('screen.step.finance'), pct: 40 },
      { label: t('screen.step.canlii'), pct: 50 },
      ...(tier === 'pro'
        ? [
            { label: t('screen.step.ontarioCourts'), pct: 62 },
            { label: t('screen.step.network'), pct: 70 },
          ]
        : []),
      { label: t('screen.step.cross'), pct: 80 },
      { label: t('screen.step.behavior'), pct: 88 },
      { label: t('screen.step.risk'), pct: 94 },
    ]

    let cancelled = false
    const animate = async () => {
      for (const s of steps) {
        if (cancelled) return
        await new Promise(r => setTimeout(r, 450 + Math.random() * 350))
        if (cancelled) return
        setProgress(s.pct)
        setProgressLabel(s.label)
      }
    }
    const animPromise = animate()

    try {
      // 1. Create screening row
      const { data: row, error: insertErr } = await supabase
        .from('screenings')
        .insert({
          landlord_id: landlord.landlordId,
          tenant_name: applicantName || null,
          monthly_rent: targetRent ? Number(targetRent) : null,
          status: 'uploading',
        })
        .select('id')
        .single()
      if (insertErr || !row) throw new Error(insertErr?.message || 'Failed to create screening record')
      const screeningId = row.id

      // 2. Upload files to storage
      const uploaded: UploadedFile[] = []
      for (let i = 0; i < files.length; i++) {
        const f = files[i]
        const safeName = f.name.replace(/[^a-zA-Z0-9._-]/g, '_')
        const path = `screenings/${landlord.landlordId}/${screeningId}/${Date.now()}_${safeName}`
        const { error: upErr } = await supabase
          .storage.from('tenant-files')
          .upload(path, f, { contentType: f.type, upsert: false })
        if (upErr) throw new Error(`${f.name}: ${upErr.message}`)
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

      // 3. Call scoring API
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

      await animPromise
      setProgress(100)
      setProgressLabel(t('screen.step.report'))
      await new Promise(r => setTimeout(r, 400))

      setResult(data as ScoreResult)
      loadHistory()
    } catch (e: any) {
      cancelled = true
      setError(e?.message || t('screen.err.unknown'))
    } finally {
      setAnalyzing(false)
    }
  }

  if (authLoading || !landlord) {
    return (
      <div style={{ minHeight: '100vh', background: '#0b0f1a', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontFamily: "'Inter', sans-serif" }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 40, height: 40, margin: '0 auto 12px', borderRadius: '50%', border: '3px solid #1e293b', borderTopColor: '#0D9488', animation: 'spin 1s linear infinite' }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
          <div style={{ fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}>Authenticating...</div>
        </div>
      </div>
    )
  }

  const isPro = plan === 'pro' || plan === 'enterprise'

  // Derive flags from the real backend result
  const derivedFlags: { type: 'danger' | 'warning' | 'info' | 'success'; text: string }[] = []
  if (result) {
    const courtHits = result.court_records_detail?.total_hits || 0
    if (courtHits > 0) {
      derivedFlags.push({ type: 'danger', text: t('flag.courtHit', { n: courtHits }) })
    } else {
      derivedFlags.push({ type: 'success', text: t('flag.courtClean') })
    }
    if (result.scores.doc_authenticity < 50) {
      derivedFlags.push({ type: 'danger', text: t('flag.docFailed') })
    }
    if (result.scores.info_consistency < 50) {
      derivedFlags.push({ type: 'danger', text: t('flag.inconsistent') })
    }
    if (result.scores.payment_ability >= 75 && result.scores.doc_authenticity >= 70 && courtHits === 0) {
      derivedFlags.push({ type: 'success', text: t('flag.strongCandidate') })
    }
    if (tier === 'free') {
      derivedFlags.push({ type: 'info', text: t('flag.upgradeCta') })
    }
  }

  const riskOverall = result ? getRiskLevel(result.overall) : null

  return (
    <div style={{ minHeight: '100vh', background: '#0b0f1a', fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif", color: '#e2e8f0' }}>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;700;800&display=swap" rel="stylesheet" />

      {/* Header */}
      <div style={{ borderBottom: '1px solid #1e293b', padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none', color: 'inherit' }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg, #0D9488, #2563EB)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 800, color: '#fff' }}>S</div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: -0.5 }}>{t('screen.title')}</div>
            <div style={{ fontSize: 11, color: '#64748b', letterSpacing: 0.5 }}>{t('screen.subtitle')}</div>
          </div>
        </Link>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {result && (
            <button onClick={reset} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #334155', background: '#1e293b', color: '#94a3b8', fontSize: 13, cursor: 'pointer', fontWeight: 500 }}>{t('screen.new')}</button>
          )}
          <LanguageToggle />
          <Link href="/dashboard" style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #334155', background: 'transparent', color: '#94a3b8', fontSize: 13, textDecoration: 'none', fontWeight: 500 }}>{t('nav.dashboard')}</Link>
        </div>
      </div>

      <div style={{ maxWidth: 800, margin: '0 auto', padding: '24px 16px' }}>
        {!result && !analyzing && (
          <>
            {/* Tier Toggle */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 20, padding: 4, background: '#1e293b', borderRadius: 12, border: '1px solid #334155' }}>
              {(['free', 'pro'] as const).map(key => {
                const active = tier === key
                const disabled = key === 'pro' && !isPro
                const label = key === 'pro' ? t('common.pro') : t('common.free')
                const sources = key === 'pro' ? t('screen.tier.pro.sources') : t('screen.tier.free.sources')
                return (
                  <button
                    key={key}
                    onClick={() => {
                      if (disabled) {
                        window.location.href = '/dashboard?upgrade=1'
                        return
                      }
                      setTier(key)
                    }}
                    style={{
                      flex: 1,
                      padding: '10px 16px',
                      borderRadius: 8,
                      border: 'none',
                      cursor: 'pointer',
                      background: active ? (key === 'pro' ? 'linear-gradient(135deg, #7C3AED, #8B5CF6)' : '#334155') : 'transparent',
                      color: active ? '#fff' : '#64748b',
                      fontSize: 13,
                      fontWeight: 600,
                      transition: 'all 0.2s',
                      opacity: disabled ? 0.75 : 1,
                    }}
                  >
                    <div>{label} {key === 'pro' && '💎'}</div>
                    <div style={{ fontSize: 10, fontWeight: 400, marginTop: 2, opacity: 0.8 }}>{sources}</div>
                  </button>
                )
              })}
            </div>

            {/* Input Fields */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 240 }}>
                <label style={{ fontSize: 12, color: '#64748b', marginBottom: 6, display: 'block' }}>{t('screen.form.name.label')}</label>
                <input
                  type="text"
                  placeholder={t('screen.form.name.placeholder')}
                  value={applicantName}
                  onChange={e => setApplicantName(e.target.value)}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #334155', background: '#1e293b', color: '#e2e8f0', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
                />
                <div style={{ fontSize: 10, color: '#475569', marginTop: 4 }}>{t('screen.form.name.hint')}</div>
              </div>
              <div style={{ flex: 1, minWidth: 240 }}>
                <label style={{ fontSize: 12, color: '#64748b', marginBottom: 6, display: 'block' }}>{t('screen.form.rent.label')}</label>
                <input
                  type="number"
                  placeholder="e.g. 2500"
                  value={targetRent}
                  onChange={e => setTargetRent(e.target.value)}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #334155', background: '#1e293b', color: '#e2e8f0', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
            </div>

            {/* Drop Zone */}
            <div
              onDragOver={e => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: `2px dashed ${dragOver ? '#0D9488' : '#334155'}`,
                borderRadius: 16,
                padding: '48px 24px',
                textAlign: 'center',
                cursor: 'pointer',
                transition: 'all 0.2s',
                background: dragOver ? '#0D948810' : '#0f172a',
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"
                onChange={e => handleFiles(e.target.files)}
                style={{ display: 'none' }}
              />
              <div style={{ fontSize: 48, marginBottom: 12 }}>📁</div>
              <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>{t('screen.drop.title')}</div>
              <div style={{ fontSize: 13, color: '#64748b', lineHeight: 1.6 }}>{t('screen.drop.sub')}</div>
              <div style={{ marginTop: 16, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 20px', borderRadius: 8, background: '#1e293b', border: '1px solid #334155', fontSize: 13, color: '#94a3b8' }}>{t('screen.drop.pick')}</div>
            </div>

            {/* File Types */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginTop: 16 }}>
              {FILE_TYPES.map(ft => (
                <div key={ft.key} style={{ padding: '10px', borderRadius: 8, background: '#0f172a', border: '1px solid #1e293b', textAlign: 'center', fontSize: 11, color: '#64748b' }}>
                  <div style={{ fontSize: 18, marginBottom: 4 }}>{ft.icon}</div>
                  {t(ft.labelKey)}
                </div>
              ))}
            </div>

            {error && (
              <div style={{ marginTop: 16, padding: '10px 14px', background: '#451a1a', border: '1px solid #7f1d1d', borderRadius: 8, fontSize: 13, color: '#fca5a5' }}>⚠ {error}</div>
            )}

            {/* File List & Submit */}
            {files.length > 0 && (
              <div style={{ marginTop: 20 }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: '#94a3b8' }}>{t('screen.files.uploadedN', { n: files.length })}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {files.map((f, i) => <FileChip key={i} file={f} onRemove={() => removeFile(i)} />)}
                </div>
                <div style={{ marginTop: 14, padding: '10px 14px', background: '#1e293b', borderRadius: 8, border: '1px solid #334155', display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: '#94a3b8' }}>
                  <span>⚖️</span>
                  <span>
                    {applicantName.trim() ? t('screen.files.auto.name', { name: applicantName.trim() }) : t('screen.files.auto.extract')}
                    {' '}
                    {tier === 'pro' ? t('screen.files.auto.sources.pro') : t('screen.files.auto.sources.free')}
                  </span>
                </div>
                <button
                  onClick={runAnalysis}
                  style={{ marginTop: 16, width: '100%', padding: '14px', borderRadius: 12, border: 'none', cursor: 'pointer', background: 'linear-gradient(135deg, #0D9488, #2563EB)', color: '#fff', fontSize: 15, fontWeight: 700, letterSpacing: 0.5 }}
                >
                  {t('screen.submit')}{tier === 'pro' && t('screen.submit.pro')}
                </button>
              </div>
            )}
          </>
        )}

        {/* Analyzing */}
        {analyzing && (() => {
          const isCourtStep = progressLabel.includes('🔍') || progressLabel.toLowerCase().includes('canlii') || progressLabel.toLowerCase().includes('court') || progressLabel.toLowerCase().includes('network') || progressLabel.includes('查询')
          const isNameStep = progressLabel.includes('📛') || progressLabel.toLowerCase().includes('extracting')
          return (
            <div style={{ textAlign: 'center', padding: '80px 0' }}>
              <div style={{ width: 64, height: 64, margin: '0 auto 24px', borderRadius: '50%', border: '3px solid #1e293b', borderTopColor: isCourtStep ? '#8B5CF6' : '#0D9488', animation: 'spin 1s linear infinite' }} />
              <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
              <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8, color: isCourtStep ? '#A78BFA' : '#e2e8f0' }}>{progressLabel || t('screen.step.start')}</div>
              <div style={{ width: 300, height: 4, borderRadius: 2, background: '#1e293b', margin: '16px auto', overflow: 'hidden' }}>
                <div style={{ height: '100%', borderRadius: 2, background: isCourtStep ? 'linear-gradient(90deg, #7C3AED, #8B5CF6)' : 'linear-gradient(90deg, #0D9488, #2563EB)', width: `${progress}%`, transition: 'width 0.5s ease' }} />
              </div>
              <div style={{ fontSize: 12, color: '#64748b' }}>
                {isCourtStep
                  ? (tier === 'pro' ? t('screen.analyzing.court.pro') : t('screen.analyzing.court.free'))
                  : isNameStep
                    ? t('screen.analyzing.name')
                    : t('screen.analyzing.files', { n: files.length })}
              </div>
            </div>
          )
        })()}

        {/* Results */}
        {result && riskOverall && (
          <div>
            {/* Overall */}
            <div style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1a1a2e 100%)', border: '1px solid #1e293b', borderRadius: 20, padding: '32px 24px', textAlign: 'center', marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 12, color: '#64748b', letterSpacing: 2, textTransform: 'uppercase' }}>{t('screen.result.headline')}</span>
                <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: result.tier === 'pro' ? '#8B5CF620' : '#1e293b', color: result.tier === 'pro' ? '#A78BFA' : '#64748b', fontWeight: 600 }}>{result.tier === 'pro' ? 'PRO' : 'FREE'}</span>
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>{result.extracted_name || applicantName || '—'}</div>
              {result.name_was_extracted
                ? <div style={{ fontSize: 10, color: '#64748b', marginBottom: 16 }}>{t('screen.result.nameExtracted')}</div>
                : <div style={{ marginBottom: 16 }} />}
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
                <ScoreRing score={result.overall} size={160} strokeWidth={12} />
              </div>
              <div style={{ display: 'inline-block', padding: '6px 20px', borderRadius: 20, background: riskOverall.bg, color: riskOverall.color, fontSize: 14, fontWeight: 700, letterSpacing: 1 }}>
                {t(riskOverall.tagKey)} — {t(riskOverall.labelKey)}
              </div>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 24, marginTop: 20, fontSize: 12, color: '#64748b', flexWrap: 'wrap' }}>
                <div><div style={{ color: '#94a3b8', fontWeight: 600, fontSize: 14 }}>${targetRent || '—'}</div>{t('screen.result.stat.rent')}</div>
                <div><div style={{ color: '#94a3b8', fontWeight: 600, fontSize: 14 }}>{files.length}</div>{t('screen.result.stat.files')}</div>
                <div><div style={{ color: '#94a3b8', fontWeight: 600, fontSize: 14 }}>{result.court_records_detail?.queries.filter(q => q.status === 'ok').length || 0}</div>{t('screen.result.stat.courts')}</div>
              </div>
            </div>

            {/* Summary */}
            <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 16, padding: '20px', marginBottom: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, color: '#94a3b8' }}>{t('screen.result.summary')}</div>
              <p style={{ fontSize: 14, lineHeight: 1.8, color: '#cbd5e1', margin: 0 }}>{result.summary}</p>
            </div>

            {/* Category Scores */}
            <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 16, padding: '20px', marginBottom: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 16, color: '#94a3b8' }}>{t('screen.result.dims')}</div>
              {CATEGORIES.map((cat, i) => (
                <CategoryBar key={cat.id} category={cat} score={result.scores[cat.id]} animDelay={i * 150} tier={result.tier} />
              ))}
            </div>

            {/* Court Records */}
            <CourtRecordDetail
              queries={result.court_records_detail?.queries || []}
              totalHits={result.court_records_detail?.total_hits || 0}
              queriedName={result.court_records_detail?.queried_name || ''}
              tier={result.tier}
            />

            {/* Flags */}
            {derivedFlags.length > 0 && (
              <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 16, padding: '20px', marginBottom: 20 }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, color: '#94a3b8' }}>{t('screen.result.flags')}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {derivedFlags.map((flag, i) => <Flag key={i} type={flag.type} text={flag.text} />)}
                </div>
              </div>
            )}

            {/* Weights */}
            <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 16, padding: '20px', marginBottom: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, color: '#94a3b8' }}>{t('screen.result.weights')}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                {CATEGORIES.map(cat => (
                  <div key={cat.id} style={{ textAlign: 'center', padding: '12px 8px', borderRadius: 8, background: '#1e293b', border: cat.id === 'court_records' ? '1px solid #8B5CF640' : '1px solid transparent' }}>
                    <div style={{ fontSize: 20, marginBottom: 4 }}>{cat.icon}</div>
                    <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>{t(cat.labelKey)}</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: cat.id === 'court_records' ? '#A78BFA' : '#0D9488', fontFamily: "'JetBrains Mono', monospace", marginTop: 4 }}>{(cat.weight * 100).toFixed(0)}%</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Footer */}
            <div style={{ textAlign: 'center', padding: '16px', fontSize: 11, color: '#475569', borderTop: '1px solid #1e293b' }}>
              Stayloop Screening v1.1 · {result.tier === 'pro' ? 'Pro' : 'Free'} · {new Date().toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-CA')}<br />
              CanLII (canlii.org){result.tier === 'pro' ? ' + Ontario Courts Portal' : ''}<br />
              {t('screen.result.footer.notice')}
            </div>
          </div>
        )}

        {/* History */}
        {!analyzing && history.length > 0 && (
          <div style={{ marginTop: 32, background: '#0f172a', border: '1px solid #1e293b', borderRadius: 16, overflow: 'hidden' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid #1e293b', display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#8B5CF6' }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: '#94a3b8' }}>{t('history.title')}</span>
              <span style={{ marginLeft: 'auto', fontSize: 11, color: '#64748b', fontFamily: "'JetBrains Mono', monospace" }}>{t('history.countN', { n: history.length })}</span>
            </div>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, maxHeight: 400, overflowY: 'auto' }}>
              {history.map(s => {
                const lvl = s.ai_score != null ? getRiskLevel(s.ai_score) : null
                return (
                  <li key={s.id} style={{ padding: '12px 20px', borderBottom: '1px solid #1e293b' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <div style={{ fontSize: 13, color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                        {s.tenant_name || t('history.autoExtracted')}
                      </div>
                      {s.ai_score != null && lvl ? (
                        <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: `${lvl.color}20`, color: lvl.color, fontFamily: "'JetBrains Mono', monospace" }}>{s.ai_score}</span>
                      ) : (
                        <span style={{ fontSize: 10, color: '#64748b', fontFamily: "'JetBrains Mono', monospace" }}>{s.status}</span>
                      )}
                    </div>
                    <div style={{ fontSize: 10, color: '#475569', marginTop: 2, fontFamily: "'JetBrains Mono', monospace" }}>{new Date(s.created_at).toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-CA')}</div>
                    {s.ai_summary && <div style={{ fontSize: 11, color: '#64748b', marginTop: 4, lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{s.ai_summary}</div>}
                  </li>
                )
              })}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
