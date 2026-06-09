'use client'

export const runtime = 'edge'

// V5.3 · Screening Hub — fully working single-tenant deep screening.
// Upload files → classify → Supabase Storage → screen-score → results.

import { useState, useRef, useCallback, useEffect } from 'react'
import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { useAuth } from '@/lib/useAuth'
import { supabase } from '@/lib/supabase'

/* ═══════════════ i18n ═══════════════ */

type Lang = 'zh' | 'en'

const T: Record<string, { zh: string; en: string }> = {
  'hero.badge':        { zh: 'SCREENING ENGINE · LIVE · 8 ENGINES', en: 'SCREENING ENGINE · LIVE · 8 ENGINES' },
  'hero.title':        { zh: '把申请表丢进来，剩下的我替你查清楚。', en: 'Drop files in. We handle the rest.' },
  'hero.sub':          { zh: '上传任何材料，单人版深度尽调跑 8 个 Engine，3-5 分钟出报告。', en: 'Upload any documents, deep screening with 8 engines, report in 3-5 minutes.' },
  'upload.start':      { zh: 'START · 上传', en: 'START · UPLOAD' },
  'upload.dragTitle':  { zh: '把任何材料拖进来', en: 'Drag any documents here' },
  'upload.dropHint':   { zh: '把 PDF / 图片 / Word / 截图 拖到这', en: 'Drag PDF / images / Word / screenshots here' },
  'upload.clickHint':  { zh: '或点这里选文件 · 单次最多 20 个', en: 'or click to select files · up to 20' },
  'upload.nameLabel':  { zh: '申请人姓名', en: 'Applicant Name' },
  'upload.rentLabel':  { zh: '目标月租金 (CAD)', en: 'Target Monthly Rent (CAD)' },
  'upload.namePH':     { zh: '自动从文件提取', en: 'Auto-extracted from files' },
  'upload.rentPH':     { zh: '自动从租约提取', en: 'Auto-extracted from lease' },
  'upload.cta':        { zh: '▶ 启动深度尽调', en: '▶ Start Deep Screening' },
  'upload.ctaSub':     { zh: '~3-5 分钟', en: '~3-5 minutes' },
  'engines.title':     { zh: '扫描包含', en: 'Scan includes' },
  'usecases.title':    { zh: 'USE CASES · 谁在用', en: 'USE CASES' },
  'history.title':     { zh: '最近扫描 · 你的', en: 'Recent Scans' },
  'history.viewAll':   { zh: '查看全部', en: 'View all' },
  'privacy.title':     { zh: 'PRIVACY · 你的红线', en: 'PRIVACY · YOUR LINES' },
  'result.score':      { zh: '综合评分', en: 'Overall Score' },
  'result.tier':       { zh: '建议', en: 'Recommendation' },
  'result.rent':       { zh: '月租', en: 'Rent' },
  'result.ratio':      { zh: '收入/租金比', en: 'Income/Rent' },
  'result.files':      { zh: '文件', en: 'Files' },
  'result.summary':    { zh: 'AI 摘要', en: 'AI Summary' },
  'result.dimensions': { zh: '维度评分', en: 'Dimension Scores' },
  'result.forensics':  { zh: '文档鉴真', en: 'Document Forensics' },
  'result.court':      { zh: '法庭记录', en: 'Court Records' },
  'result.flags':      { zh: '风险标记', en: 'Risk Flags' },
  'result.newScan':    { zh: '+ 新建筛查', en: '+ New Screening' },
  'analyzing.title':   { zh: '正在分析…', en: 'Analyzing...' },
  'analyzing.files':   { zh: '份文件', en: 'files' },
  'login.msg':         { zh: '请先登录以使用审核功能', en: 'Please sign in to use screening' },
  'login.cta':         { zh: '前往登录', en: 'Sign in' },
  'error.prefix':      { zh: '出错：', en: 'Error: ' },
}

function t(key: string, lang: Lang): string {
  return T[key]?.[lang] ?? key
}

/* ═══════════════ Constants ═══════════════ */

const ENGINES = [
  { n: '①', name: { zh: 'Identity 身份核验', en: 'Identity Verification' }, live: true },
  { n: '②', name: { zh: 'Income 收入流水', en: 'Income Analysis' }, live: true },
  { n: '③', name: { zh: 'History 租住历史', en: 'Rental History' }, live: true },
  { n: '④', name: { zh: 'Fraud 文档伪造检测', en: 'Document Fraud Detection' }, live: true },
  { n: '⑤', name: { zh: 'Behavior 行为信号', en: 'Behavioral Signals' }, live: true },
  { n: '⑥', name: { zh: 'X-Ref Equifax 交叉', en: 'Cross-Reference' }, live: true },
  { n: '⑦', name: { zh: 'LTB / Court 记录', en: 'LTB / Court Records' }, live: true, isNew: true },
  { n: '⑧', name: { zh: '关联人图谱', en: 'Relations Graph' }, live: true, isNew: true },
]

const FILE_CHIPS_ZH = ['PDF 申请表', '工资单', '银行流水', '护照 / 驾照', '推荐信', '截图']
const FILE_CHIPS_EN = ['PDF Application', 'Pay Stub', 'Bank Statement', 'Passport / License', 'Reference', 'Screenshot']

const USE_CASES: { title: { zh: string; en: string }; desc: { zh: string; en: string } }[] = [
  { title: { zh: '独立房东', en: 'Independent Landlord' }, desc: { zh: '收到 Kijiji 申请 PDF · 不知真假 → 一键扫', en: 'Got a Kijiji application PDF — one-click scan' } },
  { title: { zh: '租赁经纪', en: 'Rental Agent' }, desc: { zh: '代房东审申请 · 要给客户书面理由', en: 'Screen for clients with documented reasoning' } },
  { title: { zh: '合租屋主', en: 'Roommate Search' }, desc: { zh: '找室友前 · 看一份微信发来的资料', en: 'Check a potential roommate before committing' } },
]

const PROGRESS_STEPS = [
  { label: { zh: '提取元数据 Meta', en: 'Extracting Metadata' }, pct: 6 },
  { label: { zh: 'OCR 文字识别', en: 'OCR Text Recognition' }, pct: 14 },
  { label: { zh: '身份验证 Authentication', en: 'Authentication Check' }, pct: 28 },
  { label: { zh: '财务分析 Finance', en: 'Financial Analysis' }, pct: 40 },
  { label: { zh: 'CanLII 法庭记录', en: 'CanLII Court Records' }, pct: 50 },
  { label: { zh: '交叉文档分析', en: 'Cross-Document Analysis' }, pct: 80 },
  { label: { zh: '行为信号分析', en: 'Behavioral Analysis' }, pct: 88 },
  { label: { zh: '风险计算', en: 'Risk Calculation' }, pct: 94 },
]

const DIMENSION_LABELS: Record<string, { zh: string; en: string; weight: number }> = {
  ability_to_pay:  { zh: '支付能力', en: 'Ability to Pay', weight: 0.40 },
  credit_health:   { zh: '信用健康', en: 'Credit Health', weight: 0.25 },
  rental_history:  { zh: '租住历史', en: 'Rental History', weight: 0.20 },
  verification:    { zh: '身份验证', en: 'Verification', weight: 0.10 },
  communication:   { zh: '沟通信号', en: 'Communication', weight: 0.05 },
}

const PRIVACY_ITEMS = [
  { ok: true, zh: '上传文件 24h 内自动删除原档', en: 'Uploaded files auto-deleted within 24h' },
  { ok: true, zh: '仅扫描 / 不训练任何模型', en: 'Scan only — no model training' },
  { ok: true, zh: '报告归档 7 年（PIPEDA）· 可一键删', en: '7-year archive (PIPEDA) — one-click delete' },
  { ok: true, zh: '申请人有权要求查看 · 申诉', en: 'Applicant right to view and appeal' },
  { ok: false, zh: '不查 OHRC 17 项受保护类别', en: 'No OHRC protected-class checks' },
  { ok: false, zh: '不输出绝对 risk score · 仅摆证据', en: 'No absolute risk score — evidence only' },
]

const KIND_BADGE_COLORS: Record<string, string> = {
  lease: '#7C3AED',
  pay_stub: '#047857',
  bank_statement: '#2563EB',
  credit_report: '#D97706',
  employment_letter: '#059669',
  id_document: '#DC2626',
  offer_letter: '#9333EA',
  reference: '#0891B2',
  other: '#71717A',
}

/* ═══════════════ Helpers ═══════════════ */

function guessKind(name: string): string {
  const n = name.toLowerCase()
  if (/pay\s*stub|paie|bulletin/i.test(n)) return 'pay_stub'
  if (/bank|statement|relevé/i.test(n)) return 'bank_statement'
  if (/credit|equifax|transunion|borrowell/i.test(n)) return 'credit_report'
  if (/employ|letter|lettre/i.test(n)) return 'employment_letter'
  if (/lease|bail|tenancy|form\s*400/i.test(n)) return 'lease'
  if (/id|passport|driver|licence|license|permis/i.test(n)) return 'id_document'
  if (/offer/i.test(n)) return 'offer_letter'
  if (/ref|recommend/i.test(n)) return 'reference'
  return 'other'
}

function riskLabel(score: number): { text: { zh: string; en: string }; color: string } {
  if (score >= 80) return { text: { zh: '安全', en: 'Safe' }, color: '#047857' }
  if (score >= 65) return { text: { zh: '基本安全', en: 'Mostly Safe' }, color: '#16A34A' }
  if (score >= 50) return { text: { zh: '需审查', en: 'Review' }, color: '#D97706' }
  if (score >= 35) return { text: { zh: '有风险', en: 'Risky' }, color: '#EA580C' }
  return { text: { zh: '高风险', en: 'High Risk' }, color: '#DC2626' }
}

function tierLabel(tier: string, lang: Lang): { text: string; color: string; bg: string } {
  if (tier === 'approve') return { text: lang === 'zh' ? '通过' : 'Approve', color: '#047857', bg: '#F0FDF4' }
  if (tier === 'conditional') return { text: lang === 'zh' ? '有条件通过' : 'Conditional', color: '#D97706', bg: '#FFFBEB' }
  return { text: lang === 'zh' ? '拒绝' : 'Decline', color: '#DC2626', bg: '#FEF2F2' }
}

function fmtDate(iso: string): string {
  try {
    const d = new Date(iso)
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  } catch { return iso }
}

function statusColor(status: string): string {
  if (status === 'done') return '#047857'
  if (status === 'error') return '#DC2626'
  return '#D97706'
}

function statusLabel(status: string, lang: Lang): string {
  const map: Record<string, { zh: string; en: string }> = {
    done: { zh: '完成', en: 'DONE' },
    error: { zh: '出错', en: 'ERROR' },
    scoring: { zh: '分析中', en: 'SCORING' },
    uploading: { zh: '上传中', en: 'UPLOADING' },
    classifying: { zh: '分类中', en: 'CLASSIFYING' },
  }
  return map[status]?.[lang] ?? status.toUpperCase()
}

/* ═══════════════ Sub-components ═══════════════ */

function ScoreRing({ score, size = 160 }: { score: number; size?: number }) {
  const r = (size - 16) / 2
  const c = 2 * Math.PI * r
  const offset = c - (score / 100) * c
  const risk = riskLabel(score)
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#E5E5E5" strokeWidth={8} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={risk.color} strokeWidth={8}
        strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dashoffset 1s ease' }}
      />
      <text x={size / 2} y={size / 2 - 8} textAnchor="middle" fontSize={40} fontWeight={800} fill="#171717">{score}</text>
      <text x={size / 2} y={size / 2 + 16} textAnchor="middle" fontSize={13} fontWeight={600} fill={risk.color}>
        {risk.text.en}
      </text>
    </svg>
  )
}

function DimBar({ label, score, weight }: { label: string; score: number; weight: number }) {
  const color = score >= 70 ? '#047857' : score >= 50 ? '#D97706' : '#DC2626'
  return (
    <div className="flex items-center gap-3">
      <div className="w-[140px] text-[13px] font-medium" style={{ color: '#444' }}>
        {label} <span style={{ color: '#999' }}>({Math.round(weight * 100)}%)</span>
      </div>
      <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: '#F0F0F0' }}>
        <div className="h-full rounded-full" style={{ width: `${score}%`, background: color, transition: 'width 0.7s ease' }} />
      </div>
      <div className="w-8 text-right font-mono text-[13px] font-bold" style={{ color }}>{score}</div>
    </div>
  )
}

/* ═══════════════ Types ═══════════════ */

type ViewState = 'upload' | 'analyzing' | 'results'

interface HistoryRow {
  id: string
  tenant_name: string | null
  ai_extracted_name: string | null
  ai_score: number | null
  v3_tier: string | null
  status: string
  created_at: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ScreeningResult = Record<string, any>

/* ═══════════════ Page ═══════════════ */

export default function ScreeningPage() {
  // ── Auth
  const { loading: authLoading, user, session } = useAuth()

  // ── i18n
  const [lang, setLang] = useState<Lang>('zh')
  useEffect(() => {
    const stored = typeof window !== 'undefined' ? localStorage.getItem('sl-lang') : null
    if (stored === 'en' || stored === 'zh') setLang(stored)
    // Listen for language changes from Header toggle
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'sl-lang' && (e.newValue === 'en' || e.newValue === 'zh')) setLang(e.newValue)
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  // ── State
  const [view, setView] = useState<ViewState>('upload')
  const [files, setFiles] = useState<File[]>([])
  const [fileKinds, setFileKinds] = useState<Record<string, string[]>>({})
  const [classifyingCount, setClassifyingCount] = useState(0)
  const [applicantName, setApplicantName] = useState('')
  const [targetRent, setTargetRent] = useState('')
  const [classifyEmployers, setClassifyEmployers] = useState<string[]>([])
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Analyzing state
  const [progressPct, setProgressPct] = useState(0)
  const [progressStep, setProgressStep] = useState(0)
  const [errorMsg, setErrorMsg] = useState('')

  // Results
  const [result, setResult] = useState<ScreeningResult | null>(null)

  // History
  const [history, setHistory] = useState<HistoryRow[]>([])

  // ── Load history on mount
  useEffect(() => {
    if (!user) return
    supabase.from('screenings')
      .select('id, tenant_name, ai_extracted_name, ai_score, v3_tier, status, created_at')
      .eq('landlord_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20)
      .then(({ data }) => { if (data) setHistory(data) })
  }, [user])

  // ── File classification
  const classifyFiles = useCallback(async (newFiles: File[]) => {
    const { data: { session: s } } = await supabase.auth.getSession()
    if (!s) return

    setClassifyingCount(c => c + newFiles.length)

    for (let i = 0; i < newFiles.length; i += 5) {
      const batch = newFiles.slice(i, i + 5)
      const form = new FormData()
      batch.forEach(f => form.append('files', f))

      try {
        const res = await fetch('/api/classify-files', {
          method: 'POST',
          headers: { Authorization: `Bearer ${s.access_token}` },
          body: form,
        })
        if (res.ok) {
          const data = await res.json()
          for (const c of data.classifications) {
            const key = `${c.name}__${c.size}`
            setFileKinds(prev => ({ ...prev, [key]: c.kinds }))
          }
          if (data.applicant_name && !applicantName) setApplicantName(data.applicant_name)
          if (data.monthly_rent && !targetRent) setTargetRent(String(data.monthly_rent))
          if (data.employers_visible?.length) {
            setClassifyEmployers(prev => {
              const all = [...prev, ...data.employers_visible]
              return [...new Set(all)].slice(0, 3)
            })
          }
        }
      } catch (e) {
        console.error('classify error', e)
      } finally {
        setClassifyingCount(c => Math.max(0, c - batch.length))
      }
    }
  }, [applicantName, targetRent])

  // ── File validation
  const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB per file
  const ALLOWED_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp']
  const validateFiles = useCallback((incoming: File[]): File[] => {
    return incoming.filter(f => {
      if (f.size > MAX_FILE_SIZE) { alert(`${f.name} exceeds 10MB limit`); return false }
      if (!ALLOWED_TYPES.includes(f.type) && !f.name.toLowerCase().endsWith('.pdf')) { alert(`${f.name}: unsupported file type`); return false }
      return true
    })
  }, [])

  // ── Drag & drop
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const dropped = validateFiles(Array.from(e.dataTransfer.files))
    const next = [...files, ...dropped].slice(0, 20)
    const newOnes = next.slice(files.length)
    setFiles(next)
    if (newOnes.length > 0) classifyFiles(newOnes)
  }, [files, classifyFiles, validateFiles])

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return
    const selected = validateFiles(Array.from(e.target.files))
    const next = [...files, ...selected].slice(0, 20)
    const newOnes = next.slice(files.length)
    setFiles(next)
    if (newOnes.length > 0) classifyFiles(newOnes)
    // Reset so re-selecting same file works
    e.target.value = ''
  }, [files, classifyFiles])

  const removeFile = useCallback((idx: number) => {
    setFiles(prev => prev.filter((_, i) => i !== idx))
  }, [])

  // ── Progress animation
  useEffect(() => {
    if (view !== 'analyzing') return
    let step = 0
    const interval = setInterval(() => {
      if (step < PROGRESS_STEPS.length) {
        setProgressStep(step)
        setProgressPct(PROGRESS_STEPS[step].pct)
        step++
      }
    }, 2500)
    return () => clearInterval(interval)
  }, [view])

  // ── Run analysis
  const runAnalysis = useCallback(async () => {
    setErrorMsg('')
    setView('analyzing')
    setProgressPct(0)
    setProgressStep(0)

    try {
      // 1. Refresh session
      const { data: { session: s } } = await supabase.auth.refreshSession()
      if (!s) {
        setErrorMsg(lang === 'zh' ? '登录已过期，请重新登录' : 'Session expired. Please sign in again.')
        setView('upload')
        return
      }

      // 2. Create screening row
      const { data: row, error: insertErr } = await supabase.from('screenings').insert({
        landlord_id: s.user.id,
        tenant_name: applicantName || null,
        monthly_rent: targetRent ? Number(targetRent) : null,
        status: 'uploading',
      }).select('id').single()

      if (insertErr || !row) {
        setErrorMsg(insertErr?.message || 'Failed to create screening')
        setView('upload')
        return
      }

      const screeningId = row.id

      // 3. Upload files to Supabase Storage
      const uploaded: { path: string; name: string; size: number; mime: string; kind: string }[] = []
      for (let i = 0; i < files.length; i++) {
        const f = files[i]
        const safeName = f.name.replace(/[^a-zA-Z0-9._-]/g, '_')
        const path = `screenings/${s.user.id}/${screeningId}/${Date.now()}_${i}_${safeName}`
        const { error } = await supabase.storage.from('tenant-files').upload(path, f, {
          contentType: f.type || 'application/octet-stream',
        })
        if (!error) {
          const fileKey = `${f.name}__${f.size}`
          const kind = fileKinds[fileKey]?.join(',') || guessKind(f.name)
          uploaded.push({ path, name: f.name, size: f.size, mime: f.type, kind })
        }
      }

      // 4. Update screening with files
      await supabase.from('screenings').update({
        files: uploaded,
        status: 'scoring',
      }).eq('id', screeningId)

      // 5. Call scoring API
      const res = await fetch('/api/screen-score', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${s.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ screening_id: screeningId }),
      })

      if (!res.ok) {
        const errBody = await res.text()
        setErrorMsg(`Scoring failed: ${res.status} — ${errBody.slice(0, 200)}`)
        setView('upload')
        return
      }

      // 6. Reload from DB for full result
      const { data: final } = await supabase.from('screenings').select('*').eq('id', screeningId).single()
      if (final) {
        setResult(final)
        setProgressPct(100)
        // Brief delay so user sees 100%
        setTimeout(() => setView('results'), 600)
        // Refresh history
        supabase.from('screenings')
          .select('id, tenant_name, ai_extracted_name, ai_score, v3_tier, status, created_at')
          .eq('landlord_id', s.user.id)
          .order('created_at', { ascending: false })
          .limit(20)
          .then(({ data }) => { if (data) setHistory(data) })
      } else {
        setErrorMsg('Failed to load results')
        setView('upload')
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      setErrorMsg(msg)
      setView('upload')
    }
  }, [files, fileKinds, applicantName, targetRent, lang])

  // ── Reset
  const resetAll = useCallback(() => {
    setView('upload')
    setFiles([])
    setFileKinds({})
    setApplicantName('')
    setTargetRent('')
    setClassifyEmployers([])
    setResult(null)
    setErrorMsg('')
    setProgressPct(0)
    setProgressStep(0)
    setClassifyingCount(0)
  }, [])

  // ── Click a history row
  const loadScreening = useCallback(async (id: string) => {
    if (!user) return
    const { data } = await supabase.from('screenings').select('*').eq('id', id).eq('landlord_id', user.id).single()
    if (data) {
      setResult(data)
      setView('results')
    }
  }, [user])

  // ── Auth loading or not logged in
  if (authLoading) {
    return (
      <div style={{ background: '#FAF7EE', minHeight: '100vh' }}>
        <Header variant="transparent" />
        <div className="flex items-center justify-center py-40">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200" style={{ borderTopColor: '#047857' }} />
        </div>
        <Footer />
      </div>
    )
  }

  if (!user) {
    return (
      <div style={{ background: '#FAF7EE', minHeight: '100vh', color: '#171717' }}>
        <Header variant="transparent" />
        <div className="flex flex-col items-center justify-center py-40 text-center">
          <p className="text-[18px] font-semibold">{t('login.msg', lang)}</p>
          <Link href="/login?next=/screening" className="mt-4 rounded-xl px-8 py-3 text-[15px] font-bold text-white" style={{ background: '#047857' }}>
            {t('login.cta', lang)}
          </Link>
        </div>
        <Footer />
      </div>
    )
  }

  /* ═══════════════ ANALYZING VIEW ═══════════════ */
  if (view === 'analyzing') {
    const step = PROGRESS_STEPS[progressStep] || PROGRESS_STEPS[PROGRESS_STEPS.length - 1]
    return (
      <div style={{ background: '#FAF7EE', minHeight: '100vh', color: '#171717' }}>
        <Header variant="transparent" />
        <div className="flex items-center justify-center" style={{ minHeight: 'calc(100vh - 200px)' }}>
          <div className="mx-auto max-w-[520px] w-full px-5">
            <div className="rounded-2xl border bg-white p-8 shadow-sm text-center" style={{ borderColor: '#E0DACE' }}>
              {/* Animated pulse */}
              <div className="mx-auto flex h-20 w-20 items-center justify-center">
                <div className="absolute h-20 w-20 animate-ping rounded-full opacity-20" style={{ background: '#047857' }} />
                <div className="relative h-16 w-16 rounded-full flex items-center justify-center" style={{ background: '#047857' }}>
                  <span className="text-white text-[24px] font-bold">⚙</span>
                </div>
              </div>

              <h2 className="mt-6 text-[22px] font-extrabold">{t('analyzing.title', lang)}</h2>
              <p className="mt-2 text-[14px]" style={{ color: '#666' }}>
                {files.length} {t('analyzing.files', lang)}
              </p>

              {/* Progress bar */}
              <div className="mt-6 h-2 w-full rounded-full overflow-hidden" style={{ background: '#F0F0F0' }}>
                <div className="h-full rounded-full" style={{
                  width: `${progressPct}%`,
                  background: 'linear-gradient(90deg, #047857, #10B981)',
                  transition: 'width 1.5s ease',
                }} />
              </div>

              {/* Step label */}
              <p className="mt-3 font-mono text-[12px] font-medium" style={{ color: '#047857' }}>
                {step.label[lang]} — {progressPct}%
              </p>

              {/* Step list */}
              <div className="mt-5 space-y-1.5 text-left">
                {PROGRESS_STEPS.map((s, i) => {
                  const done = progressStep > i
                  const active = progressStep === i
                  return (
                    <div key={i} className="flex items-center gap-2 text-[12px] font-mono">
                      <span style={{ color: done ? '#047857' : active ? '#D97706' : '#CCC', fontWeight: 700 }}>
                        {done ? '✓' : active ? '●' : '○'}
                      </span>
                      <span style={{ color: done ? '#047857' : active ? '#171717' : '#AAA' }}>
                        {s.label[lang]}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
        <Footer />
      </div>
    )
  }

  /* ═══════════════ RESULTS VIEW ═══════════════ */
  if (view === 'results' && result) {
    const score = result.ai_score ?? 0
    const tier = result.v3_tier ?? 'decline'
    const tl = tierLabel(tier, lang)
    const risk = riskLabel(score)
    const summary = lang === 'zh'
      ? (result.ai_summary_zh || result.ai_summary || '')
      : (result.ai_summary_en || result.ai_summary || '')
    const dims = result.scores_v3 || {}
    const forensics = result.forensics_detail
    const court = result.court_records_detail
    const redFlags = result.red_flags || []
    const hardGates = result.hard_gates_triggered || []
    const fileCount = Array.isArray(result.files) ? result.files.length : 0
    const rent = result.monthly_rent
    const ratio = result.income_rent_ratio

    return (
      <div style={{ background: '#FAF7EE', minHeight: '100vh', color: '#171717' }}>
        <Header variant="transparent" />

        <section className="mx-auto max-w-[900px] px-5 py-10 sm:px-7">
          {/* Top: Score + Tier */}
          <div className="rounded-2xl border bg-white p-6 sm:p-8 shadow-sm" style={{ borderColor: '#E0DACE' }}>
            <div className="flex flex-col sm:flex-row items-center gap-6">
              {/* Score ring */}
              <div className="flex-shrink-0">
                <ScoreRing score={score} size={160} />
              </div>

              <div className="flex-1 text-center sm:text-left">
                <div className="font-mono text-[11px] font-bold uppercase tracking-wide" style={{ color: '#999' }}>
                  {t('result.score', lang)}
                </div>

                {/* Tier badge */}
                <div className="mt-2 inline-flex items-center gap-2 rounded-lg px-4 py-2" style={{ background: tl.bg }}>
                  <span className="text-[18px] font-extrabold" style={{ color: tl.color }}>{tl.text}</span>
                </div>

                {/* Stats row */}
                <div className="mt-4 flex flex-wrap items-center justify-center sm:justify-start gap-4 font-mono text-[12px]" style={{ color: '#666' }}>
                  {rent && <span>{t('result.rent', lang)}: ${rent}/mo</span>}
                  {ratio && <span>{t('result.ratio', lang)}: {ratio.toFixed(1)}x</span>}
                  <span>{t('result.files', lang)}: {fileCount}</span>
                  {result.evidence_coverage != null && (
                    <span>Coverage: {Math.round(result.evidence_coverage * 100)}%</span>
                  )}
                </div>

                {/* Applicant name */}
                {(result.ai_extracted_name || result.tenant_name) && (
                  <div className="mt-3 text-[15px] font-semibold">
                    {result.ai_extracted_name || result.tenant_name}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* AI Summary */}
          {summary && (
            <div className="mt-5 rounded-2xl border bg-white p-6 shadow-sm" style={{ borderColor: '#E0DACE' }}>
              <div className="font-mono text-[11px] font-bold uppercase tracking-wide" style={{ color: '#999' }}>
                {t('result.summary', lang)}
              </div>
              <p className="mt-3 text-[14px] leading-relaxed" style={{ color: '#333' }}>{summary}</p>
            </div>
          )}

          {/* Dimensions */}
          <div className="mt-5 rounded-2xl border bg-white p-6 shadow-sm" style={{ borderColor: '#E0DACE' }}>
            <div className="font-mono text-[11px] font-bold uppercase tracking-wide mb-4" style={{ color: '#999' }}>
              {t('result.dimensions', lang)}
            </div>
            <div className="space-y-3">
              {Object.entries(DIMENSION_LABELS).map(([key, meta]) => {
                const dimScore = dims[key] ?? 0
                return (
                  <DimBar key={key} label={meta[lang]} score={dimScore} weight={meta.weight} />
                )
              })}
            </div>
          </div>

          {/* Forensics */}
          {forensics && (
            <div className="mt-5 rounded-2xl border bg-white p-6 shadow-sm" style={{ borderColor: '#E0DACE' }}>
              <div className="font-mono text-[11px] font-bold uppercase tracking-wide mb-3" style={{ color: '#999' }}>
                {t('result.forensics', lang)}
              </div>
              {typeof forensics === 'object' && !Array.isArray(forensics) ? (
                <div className="space-y-2 text-[13px]" style={{ color: '#333' }}>
                  {Object.entries(forensics).map(([k, v]) => (
                    <div key={k} className="flex gap-2">
                      <span className="font-mono text-[11px] font-bold uppercase" style={{ color: '#999', minWidth: 120 }}>{k}</span>
                      <span>{typeof v === 'string' ? v : JSON.stringify(v)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <pre className="text-[12px] whitespace-pre-wrap" style={{ color: '#333' }}>
                  {JSON.stringify(forensics, null, 2)}
                </pre>
              )}
            </div>
          )}

          {/* Court Records */}
          {court && (
            <div className="mt-5 rounded-2xl border bg-white p-6 shadow-sm" style={{ borderColor: '#E0DACE' }}>
              <div className="font-mono text-[11px] font-bold uppercase tracking-wide mb-3" style={{ color: '#999' }}>
                {t('result.court', lang)}
              </div>
              {(result.court_summary_zh || result.court_summary_en) && (
                <p className="text-[13px] mb-3" style={{ color: '#333' }}>
                  {lang === 'zh' ? (result.court_summary_zh || result.court_summary_en) : (result.court_summary_en || result.court_summary_zh)}
                </p>
              )}
              {Array.isArray(court) ? (
                <div className="space-y-2">
                  {court.map((rec: Record<string, unknown>, i: number) => (
                    <div key={i} className="rounded-lg border p-3 text-[12px]" style={{ borderColor: '#E0DACE', background: '#FAFAF8' }}>
                      {Object.entries(rec).map(([k, v]) => (
                        <div key={k} className="flex gap-2">
                          <span className="font-mono font-bold uppercase" style={{ color: '#999', minWidth: 100 }}>{k}</span>
                          <span style={{ color: '#333' }}>{typeof v === 'string' ? v : JSON.stringify(v)}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              ) : typeof court === 'object' ? (
                <pre className="text-[12px] whitespace-pre-wrap" style={{ color: '#333' }}>
                  {JSON.stringify(court, null, 2)}
                </pre>
              ) : null}
            </div>
          )}

          {/* Red Flags + Hard Gates */}
          {(redFlags.length > 0 || hardGates.length > 0) && (
            <div className="mt-5 rounded-2xl border bg-white p-6 shadow-sm" style={{ borderColor: '#E0DACE' }}>
              <div className="font-mono text-[11px] font-bold uppercase tracking-wide mb-3" style={{ color: '#999' }}>
                {t('result.flags', lang)}
              </div>
              {hardGates.length > 0 && (
                <div className="mb-3">
                  <div className="font-mono text-[10px] font-bold mb-1" style={{ color: '#DC2626' }}>HARD GATES</div>
                  <div className="flex flex-wrap gap-2">
                    {hardGates.map((g: string, i: number) => (
                      <span key={i} className="rounded-md px-2.5 py-1 text-[11px] font-mono font-bold" style={{ color: '#DC2626', background: '#FEF2F2' }}>
                        {g}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {redFlags.length > 0 && (
                <div>
                  <div className="font-mono text-[10px] font-bold mb-1" style={{ color: '#EA580C' }}>RED FLAGS</div>
                  <div className="flex flex-wrap gap-2">
                    {redFlags.map((f: string, i: number) => (
                      <span key={i} className="rounded-md px-2.5 py-1 text-[11px] font-mono font-bold" style={{ color: '#EA580C', background: '#FFF7ED' }}>
                        {f}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {result.red_flag_penalty != null && (
                <div className="mt-2 font-mono text-[11px]" style={{ color: '#999' }}>
                  Penalty: -{result.red_flag_penalty} | Gate cap: {result.gate_cap ?? 'N/A'}
                </div>
              )}
            </div>
          )}

          {/* Action items */}
          {result.action_items && Array.isArray(result.action_items) && result.action_items.length > 0 && (
            <div className="mt-5 rounded-2xl border bg-white p-6 shadow-sm" style={{ borderColor: '#E0DACE' }}>
              <div className="font-mono text-[11px] font-bold uppercase tracking-wide mb-3" style={{ color: '#999' }}>
                {lang === 'zh' ? '建议操作' : 'Action Items'}
              </div>
              <ul className="space-y-2">
                {result.action_items.map((item: string, i: number) => (
                  <li key={i} className="flex items-start gap-2 text-[13px]" style={{ color: '#333' }}>
                    <span style={{ color: '#D97706', fontWeight: 700 }}>→</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* New screening button */}
          <div className="mt-8 text-center">
            <button
              onClick={resetAll}
              className="rounded-xl px-8 py-3 text-[15px] font-bold text-white transition hover:opacity-90"
              style={{ background: '#047857' }}
            >
              {t('result.newScan', lang)}
            </button>
          </div>
        </section>

        {/* History below results */}
        {history.length > 0 && (
          <HistorySection lang={lang} history={history} onSelect={loadScreening} />
        )}

        <Footer />
      </div>
    )
  }

  /* ═══════════════ UPLOAD VIEW (default) ═══════════════ */
  const fileChips = lang === 'zh' ? FILE_CHIPS_ZH : FILE_CHIPS_EN

  return (
    <div style={{ background: '#FAF7EE', color: '#171717' }}>
      <Header variant="transparent" />

      {/* Hero */}
      <section className="text-center" style={{ background: 'linear-gradient(180deg,#F2EEE5 0%,#E4EEE3 100%)' }}>
        <div className="mx-auto max-w-[1240px] px-5 py-20 sm:px-7 lg:px-12">
          <div className="flex items-center justify-center gap-2 font-mono text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: '#047857' }}>
            <span className="inline-block h-[6px] w-[6px] rounded-full" style={{ background: '#047857', boxShadow: '0 0 6px #047857' }} />
            {t('hero.badge', lang)}
          </div>
          <h1 className="mx-auto mt-6 max-w-[700px] text-[36px] font-extrabold leading-[1.12] tracking-tight sm:text-[48px]">
            {t('hero.title', lang)}
          </h1>
          <p className="mx-auto mt-5 max-w-[680px] text-[16px] leading-relaxed" style={{ color: '#666' }}>
            {t('hero.sub', lang)}
          </p>
        </div>
      </section>

      {/* Upload + Engines panel */}
      <section>
        <div className="mx-auto max-w-[1240px] px-5 sm:px-7 lg:px-12" style={{ marginTop: -24 }}>
          <div className="rounded-2xl border bg-white p-7 shadow-sm sm:p-10" style={{ borderColor: '#E0DACE' }}>

            {/* Error banner */}
            {errorMsg && (
              <div className="mb-5 rounded-lg border px-4 py-3 text-[13px]" style={{ borderColor: '#FECACA', background: '#FEF2F2', color: '#DC2626' }}>
                {t('error.prefix', lang)}{errorMsg}
                <button onClick={() => setErrorMsg('')} className="ml-3 font-bold hover:underline">
                  {lang === 'zh' ? '关闭' : 'Dismiss'}
                </button>
              </div>
            )}

            <div className="grid gap-10 lg:grid-cols-[1fr_280px]">
              {/* Left — upload zone */}
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: '#047857' }}>
                    {t('upload.start', lang)}
                  </span>
                </div>
                <h2 className="mt-2 text-[22px] font-extrabold">{t('upload.dragTitle', lang)}</h2>

                {/* Drop zone */}
                <div
                  className="mt-4 flex min-h-[180px] flex-col items-center justify-center rounded-xl border-2 border-dashed transition"
                  style={{
                    borderColor: dragOver ? '#047857' : '#D4D0C8',
                    background: dragOver ? '#F0FDF4' : '#FAFAF8',
                    cursor: 'pointer',
                  }}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                  onClick={() => inputRef.current?.click()}
                >
                  <input
                    ref={inputRef}
                    type="file"
                    multiple
                    className="hidden"
                    accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp,.heic,.tiff"
                    onChange={handleFileSelect}
                  />
                  <span className="text-[28px]" style={{ color: '#047857' }}>
                    {dragOver ? '📥' : '⬆'}
                  </span>
                  <p className="mt-2 text-[14px] font-semibold">{t('upload.dropHint', lang)}</p>
                  <p className="mt-1 text-[12px]" style={{ color: '#999' }}>
                    {t('upload.clickHint', lang)}
                  </p>
                </div>

                {/* Selected files with classification badges */}
                {files.length > 0 && (
                  <div className="mt-3 space-y-1.5">
                    {files.map((f, i) => {
                      const key = `${f.name}__${f.size}`
                      const kinds = fileKinds[key]
                      return (
                        <div key={i} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-[12px]" style={{ borderColor: '#E0DACE', background: '#FAFAF8' }}>
                          <span className="flex-shrink-0 font-mono text-[10px] font-bold px-1.5 py-0.5 rounded text-white"
                            style={{ background: f.name.toLowerCase().endsWith('.pdf') ? '#DC2626' : '#2563EB' }}>
                            {f.name.split('.').pop()?.toUpperCase() || 'FILE'}
                          </span>
                          <span className="flex-1 truncate font-medium" style={{ maxWidth: 200 }}>{f.name}</span>
                          <span className="text-[10px]" style={{ color: '#999' }}>
                            {(f.size / 1024).toFixed(0)} KB
                          </span>

                          {/* Classification badges */}
                          {kinds ? (
                            <div className="flex gap-1">
                              {kinds.map((k, j) => (
                                <span key={j} className="rounded px-1.5 py-0.5 font-mono text-[9px] font-bold text-white"
                                  style={{ background: KIND_BADGE_COLORS[k] || '#71717A' }}>
                                  {k}
                                </span>
                              ))}
                            </div>
                          ) : classifyingCount > 0 ? (
                            <span className="font-mono text-[9px] animate-pulse" style={{ color: '#D97706' }}>
                              classifying...
                            </span>
                          ) : null}

                          <button onClick={(e) => { e.stopPropagation(); removeFile(i) }}
                            className="ml-1 text-[14px] hover:opacity-70" style={{ color: '#999' }}>
                            x
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* File type chips */}
                <div className="mt-4 flex flex-wrap gap-2">
                  {fileChips.map((c) => (
                    <span key={c} className="rounded-md border px-3 py-1 text-[12px] font-medium" style={{ borderColor: '#E0DACE', color: '#666' }}>{c}</span>
                  ))}
                </div>

                {/* Name & rent inputs */}
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block font-mono text-[11px] font-bold uppercase tracking-wide mb-1" style={{ color: '#999' }}>
                      {t('upload.nameLabel', lang)}
                    </label>
                    <input
                      type="text"
                      value={applicantName}
                      onChange={e => setApplicantName(e.target.value)}
                      placeholder={t('upload.namePH', lang)}
                      className="w-full rounded-lg border px-3 py-2.5 text-[14px] outline-none transition focus:border-[#047857]"
                      style={{ borderColor: '#E0DACE', background: '#FAFAF8' }}
                    />
                  </div>
                  <div>
                    <label className="block font-mono text-[11px] font-bold uppercase tracking-wide mb-1" style={{ color: '#999' }}>
                      {t('upload.rentLabel', lang)}
                    </label>
                    <input
                      type="number"
                      value={targetRent}
                      onChange={e => setTargetRent(e.target.value)}
                      placeholder={t('upload.rentPH', lang)}
                      className="w-full rounded-lg border px-3 py-2.5 text-[14px] outline-none transition focus:border-[#047857]"
                      style={{ borderColor: '#E0DACE', background: '#FAFAF8' }}
                    />
                  </div>
                </div>

                {/* Detected employers */}
                {classifyEmployers.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="font-mono text-[10px] font-bold uppercase" style={{ color: '#999' }}>
                      {lang === 'zh' ? '检测到雇主' : 'Detected employers'}:
                    </span>
                    {classifyEmployers.map((emp, i) => (
                      <span key={i} className="rounded px-2 py-0.5 font-mono text-[10px] font-bold" style={{ color: '#047857', background: '#F0FDF4' }}>
                        {emp}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Right — engine list + CTA */}
              <div>
                <div className="font-mono text-[11px] font-bold" style={{ color: '#999' }}>{t('engines.title', lang)}</div>
                <ul className="mt-3 space-y-2.5">
                  {ENGINES.map((eng) => (
                    <li key={eng.n} className="flex items-center gap-2 text-[13.5px]">
                      <span className="font-mono" style={{ color: '#999' }}>{eng.n}</span>
                      <span className="font-medium">{eng.name[lang]}</span>
                      {eng.isNew && (
                        <span className="rounded px-1.5 py-0.5 font-mono text-[9px] font-bold" style={{ color: '#047857', background: '#F0FDF4' }}>
                          {lang === 'zh' ? '新' : 'NEW'}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>

                <button
                  className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-[15px] font-bold text-white transition hover:opacity-90 disabled:opacity-40"
                  style={{ background: '#047857' }}
                  disabled={files.length === 0}
                  onClick={runAnalysis}
                >
                  {t('upload.cta', lang)}
                </button>
                <p className="mt-2 text-center font-mono text-[11px]" style={{ color: '#999' }}>
                  {t('upload.ctaSub', lang)}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Use Cases */}
      <section>
        <div className="mx-auto max-w-[1240px] px-5 py-16 sm:px-7 lg:px-12">
          <div className="font-mono text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: '#999' }}>
            {t('usecases.title', lang)}
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            {USE_CASES.map((uc) => (
              <div key={uc.title.en} className="rounded-xl border bg-white p-5" style={{ borderColor: '#E0DACE' }}>
                <h4 className="text-[15px] font-bold">{uc.title[lang]}</h4>
                <p className="mt-1.5 text-[13px] leading-relaxed" style={{ color: '#666' }}>{uc.desc[lang]}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* History */}
      {history.length > 0 && (
        <HistorySection lang={lang} history={history} onSelect={loadScreening} />
      )}

      {/* Privacy */}
      <section>
        <div className="mx-auto max-w-[1240px] px-5 py-16 sm:px-7 lg:px-12">
          <div className="font-mono text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: '#999' }}>
            {t('privacy.title', lang)}
          </div>
          <div className="mt-5 grid gap-x-10 gap-y-3 sm:grid-cols-2">
            {PRIVACY_ITEMS.map((item, i) => (
              <div key={i} className="flex items-start gap-2 text-[13.5px]">
                <span style={{ fontWeight: 700, color: item.ok ? '#047857' : '#DC2626' }}>
                  {item.ok ? '✓' : '✕'}
                </span>
                <span style={{ color: '#666' }}>{item[lang]}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Footer />
    </div>
  )
}

/* ═══════════════ History Section ═══════════════ */

function HistorySection({
  lang,
  history,
  onSelect,
}: {
  lang: Lang
  history: HistoryRow[]
  onSelect: (id: string) => void
}) {
  return (
    <section style={{ background: '#F2EEE5' }}>
      <div className="mx-auto max-w-[1240px] px-5 py-14 sm:px-7 lg:px-12">
        <div className="font-mono text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: '#999' }}>
          {T['history.title']?.[lang]}
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {history.map((s) => {
            const name = s.ai_extracted_name || s.tenant_name || (lang === 'zh' ? '未命名' : 'Unnamed')
            const sc = statusColor(s.status)
            const scoreDisplay = s.ai_score != null ? s.ai_score : '—'
            return (
              <button
                key={s.id}
                onClick={() => onSelect(s.id)}
                className="flex items-center gap-4 rounded-xl border bg-white px-5 py-4 text-left transition hover:border-[#047857]"
                style={{ borderColor: '#E0DACE' }}
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-full text-[14px] font-bold" style={{ background: '#F0F0F0', color: '#666' }}>
                  {name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[14px] font-bold truncate">{name}</div>
                  <div className="font-mono text-[11px]" style={{ color: '#999' }}>
                    {fmtDate(s.created_at)}
                    {s.ai_score != null && ` · Score: ${s.ai_score}`}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="rounded-md px-2 py-0.5 font-mono text-[10px] font-bold" style={{ color: sc, background: sc + '12' }}>
                    {statusLabel(s.status, lang)}
                  </span>
                  {s.v3_tier && s.status === 'done' && (
                    <span className="rounded-md px-2 py-0.5 font-mono text-[9px] font-bold"
                      style={{
                        color: tierLabel(s.v3_tier, lang).color,
                        background: tierLabel(s.v3_tier, lang).bg,
                      }}>
                      {tierLabel(s.v3_tier, lang).text}
                    </span>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </section>
  )
}
