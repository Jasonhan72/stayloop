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
  ai_extracted_name: string | null
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

interface AiFlag { type: 'danger' | 'warning' | 'info' | 'success'; text_en: string; text_zh: string }

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
  details_en?: Record<string, string> | null
  details_zh?: Record<string, string> | null
  flags?: AiFlag[]
  detected_document_kinds?: string[]
  detected_monthly_income?: number | null
  effective_monthly_income?: number | null
  income_evidence?: string | null
  monthly_rent?: number | null
  income_rent_ratio?: number | null
  extracted_name: string
  name_was_extracted: boolean
  summary: string
  summary_en?: string
  summary_zh?: string
  court_records_detail: { queries: CourtQuery[]; total_hits: number; queried_name: string }
  tier: 'free' | 'pro'
  // v3 additions — all optional so old API responses still type-check
  model_version?: string
  scores_v3?: {
    ability_to_pay: number
    credit_health: number
    rental_history: number
    verification: number
    communication: number
  }
  v3_tier?: 'approve' | 'conditional' | 'decline'
  tier_reason?: string
  hard_gates_triggered?: string[]
  red_flags?: string[]
  red_flag_penalty?: number
  gate_cap?: number
  evidence_coverage?: number
  sub_coverage?: Record<string, string>
  identity_match_score?: number | null
  action_items?: {
    id: string
    dimension: string
    title_en: string
    title_zh: string
    details_en: string
    details_zh: string
    impact_on_score: string
    status: string
  }[]
  compliance_audit?: {
    protected_grounds_observed?: string[]
    protected_grounds_used_in_scoring?: string[]
    hrc_compliant?: boolean
    reviewer_note?: string
  } | null
}

// ───────────────────────────────────────────────────── Constants ──

// v3 dimension key — matches scores_v3 in the API response
type V3DimKey = 'ability_to_pay' | 'credit_health' | 'rental_history' | 'verification' | 'communication'

// Keep the old key type for backward compat with CategoryBar signature;
// we'll cast V3DimKey to any for the `id` field since CategoryBar only
// uses id for the React key, not for index access.
const CATEGORIES: {
  id: V3DimKey
  labelKey: DictKey
  descKey: DictKey
  icon: string
  weight: number
  zhLabel: string
  enLabel: string
}[] = [
  { id: 'ability_to_pay', labelKey: 'cat.ability_to_pay.label', descKey: 'cat.ability_to_pay.desc', icon: '💰', weight: 0.40, zhLabel: '付款能力',         enLabel: 'Ability to Pay' },
  { id: 'credit_health',  labelKey: 'cat.credit_health.label',  descKey: 'cat.credit_health.desc',  icon: '📊', weight: 0.25, zhLabel: '信用健康度',       enLabel: 'Credit & Debt Health' },
  { id: 'rental_history', labelKey: 'cat.rental_history.label', descKey: 'cat.rental_history.desc', icon: '⚖️', weight: 0.20, zhLabel: '租务与司法历史',   enLabel: 'Rental & Legal History' },
  { id: 'verification',   labelKey: 'cat.verification.label',   descKey: 'cat.verification.desc',   icon: '🔍', weight: 0.10, zhLabel: '身份与雇主核实',   enLabel: 'Identity & Employer' },
  { id: 'communication',  labelKey: 'cat.communication.label',  descKey: 'cat.communication.desc',  icon: '🏠', weight: 0.05, zhLabel: '申请完整度与沟通', enLabel: 'Application Quality' },
]

interface RiskLevel { min: number; labelKey: DictKey; tagKey: DictKey; color: string; bg: string }
const RISK_LEVELS: RiskLevel[] = [
  { min: 85, labelKey: 'risk.safe', tagKey: 'risk.tag.safe', color: '#16A34A', bg: '#F0FDF4' },
  { min: 70, labelKey: 'risk.mostlySafe', tagKey: 'risk.tag.mostlySafe', color: '#65A30D', bg: '#F7FEE7' },
  { min: 50, labelKey: 'risk.review', tagKey: 'risk.tag.review', color: '#A16207', bg: '#FEFCE8' },
  { min: 30, labelKey: 'risk.risky', tagKey: 'risk.tag.risky', color: '#C2410C', bg: '#FFF7ED' },
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
  if (n.includes('paystub') || n.includes('pay_stub') || n.includes('payslip') || n.includes('pay-stub') || n.includes('wage') || n.match(/\bpay\b/)) return 'pay_stub'
  if (n.includes('passport') || n.includes('license') || n.includes('licence') || n.includes('permit') || n.includes('driver') || n.match(/\bid[-_. ]/) || n.match(/^id[-_. ]/) || n.endsWith('_id.jpg') || n.endsWith('_id.png')) return 'id_document'
  if (n.includes('credit')) return 'credit_report'
  if (n.includes('bank') || n.includes('statement')) return 'bank_statement'
  if (n.includes('contract') || n.includes('employ') || n.includes('letter')) return 'employment_letter'
  if (n.includes('offer') || n.includes('study permit') || n.includes('admission')) return 'offer_letter'
  if (n.includes('reference') || n.includes('landlord')) return 'reference'
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
        <span style={{ fontSize: 11, color: '#64748B', marginTop: 2, letterSpacing: 1 }}>/ 100</span>
      </div>
    </div>
  )
}

function CategoryBar({ category, score, animDelay = 0, tier, shortNote, detail }: {
  category: typeof CATEGORIES[number]
  score: number
  animDelay?: number
  tier: 'free' | 'pro'
  shortNote?: string
  detail?: string
}) {
  const { t, lang } = useT()
  const [open, setOpen] = useState(false)
  const risk = getRiskLevel(score)
  const isCourtRecord = category.id === 'rental_history'
  const primary = lang === 'zh' ? category.zhLabel : category.enLabel
  const secondary = lang === 'zh' ? category.enLabel : category.zhLabel
  const hasDetail = !!(detail || shortNote)
  return (
    <div style={{ marginBottom: 12, borderRadius: 10, border: open ? '1px solid #E4E8F0' : '1px solid transparent', background: open ? 'rgba(11, 23, 54, 0.03)' : 'transparent', transition: 'all 0.2s', padding: open ? 12 : 0 }}>
      <button
        type="button"
        onClick={() => hasDetail && setOpen(o => !o)}
        aria-expanded={open}
        style={{ width: '100%', background: 'none', border: 'none', padding: 0, textAlign: 'left', cursor: hasDetail ? 'pointer' : 'default' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 16 }}>{category.icon}</span>
            <span className="sl-cat-primary" style={{ fontWeight: 700, color: '#0B1736' }}>{primary}</span>
            <span className="sl-cat-secondary" style={{ fontWeight: 500, color: '#64748B' }}>{secondary}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {isCourtRecord && (
              <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, background: tier === 'pro' ? '#8B5CF620' : '#E4E8F0', color: tier === 'pro' ? '#6D28D9' : '#64748B', fontWeight: 600 }}>
                {tier === 'pro' ? 'PRO' : 'FREE · CanLII'}
              </span>
            )}
            <span style={{ fontSize: 15, fontWeight: 700, color: risk.color, fontFamily: "'JetBrains Mono', monospace" }}>{score}</span>
            {hasDetail && (
              <span className="mono" style={{ fontSize: 10, color: '#64748B', width: 14, textAlign: 'center', transition: 'transform 0.2s', display: 'inline-block', transform: open ? 'rotate(90deg)' : 'rotate(0)' }}>▸</span>
            )}
          </div>
        </div>
        <div style={{ height: 6, borderRadius: 3, background: 'rgba(11, 23, 54, 0.06)', overflow: 'hidden' }}>
          <div style={{ height: '100%', borderRadius: 3, background: `linear-gradient(90deg, ${risk.color}88, ${risk.color})`, width: `${score}%`, transition: 'width 1.2s cubic-bezier(0.4, 0, 0.2, 1)', transitionDelay: `${animDelay}ms` }} />
        </div>
        <p style={{ fontSize: 11, color: '#64748B', marginTop: 4, marginBottom: 0 }}>{t(category.descKey)}</p>
      </button>
      {open && hasDetail && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px dashed rgba(11, 23, 54, 0.10)' }}>
          {shortNote && (
            <div className="mono" style={{ fontSize: 10.5, color: '#64748B', marginBottom: 8, letterSpacing: '0.02em', textTransform: 'uppercase', fontWeight: 600 }}>
              {lang === 'zh' ? '摘要' : 'Summary'}
            </div>
          )}
          {shortNote && (
            <p style={{ fontSize: 12.5, color: '#0B1736', lineHeight: 1.6, margin: 0, marginBottom: detail ? 12 : 0 }}>{shortNote}</p>
          )}
          {detail && (
            <>
              <div className="mono" style={{ fontSize: 10.5, color: '#64748B', marginBottom: 8, letterSpacing: '0.02em', textTransform: 'uppercase', fontWeight: 600 }}>
                {lang === 'zh' ? '证据与详细分析' : 'Evidence & detailed analysis'}
              </div>
              <p style={{ fontSize: 12.5, color: '#0B1736', lineHeight: 1.7, margin: 0, whiteSpace: 'pre-wrap' }}>{detail}</p>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function FileChip({ file, onRemove }: { file: File; onRemove: () => void }) {
  const ext = file.name.split('.').pop()?.toLowerCase() || ''
  const isPdf = ext === 'pdf'
  const isImage = ['jpg', 'jpeg', 'png', 'webp'].includes(ext)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'rgba(11, 23, 54, 0.05)', borderRadius: 10, border: '1px solid var(--border-subtle)', fontSize: 12.5, color: 'var(--text-primary)' }}>
      <span style={{ fontSize: 14 }}>{isPdf ? '📄' : isImage ? '🖼️' : '📎'}</span>
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>{file.name}</span>
      <span style={{ fontSize: 11, color: '#64748B' }}>{(file.size / 1024).toFixed(0)}KB</span>
      <button onClick={onRemove} style={{ background: 'none', border: 'none', color: '#64748B', cursor: 'pointer', fontSize: 16, padding: 0, lineHeight: 1 }}>×</button>
    </div>
  )
}

function Flag({ type, text }: { type: 'danger' | 'warning' | 'info' | 'success'; text: string }) {
  const colors = {
    danger: { bg: '#FEF2F2', border: '#FECACA', text: '#B91C1C', icon: '⚠️' },
    warning: { bg: '#FFFBEB', border: '#92400E', text: '#92400E', icon: '⚡' },
    info: { bg: '#EEF2F8', border: '#DBEAFE', text: '#1D4ED8', icon: 'ℹ️' },
    success: { bg: '#F0FDF4', border: '#15803D', text: '#15803D', icon: '✓' },
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
    <div className="sl-card" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', backdropFilter: 'blur(14px)', marginBottom: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, gap: 8, flexWrap: 'wrap' }}>
        <div>
          <div className="sl-section-title" style={{ fontSize: 13, fontWeight: 700, color: '#64748B' }}>{t('screen.result.court.title')}</div>
          <div style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>{t('screen.result.court.queriedName')} <span style={{ fontFamily: "'JetBrains Mono', monospace", color: '#0B1736' }}>{queriedName || '—'}</span></div>
        </div>
        <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 4, background: tier === 'pro' ? '#8B5CF620' : '#E4E8F0', color: tier === 'pro' ? '#6D28D9' : '#64748B', border: `1px solid ${tier === 'pro' ? '#8B5CF640' : '#E4E8F0'}`, fontWeight: 600 }}>
          {tier === 'pro' ? t('screen.result.court.pro') : t('screen.result.court.free')}
        </span>
      </div>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: '#64748B', marginBottom: 8, fontWeight: 600 }}>{t('screen.result.court.sources')}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {queries.map((q, i) => {
            const available = q.status === 'ok'
            const hit = available && (q.hits ?? 0) > 0
            return (
              <div key={i} className="sl-court-source" style={{ display: 'flex', alignItems: 'center', gap: 8, color: available ? '#0B1736' : '#475569' }}>
                <span style={{ width: 18, height: 18, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, background: available ? (hit ? '#DC262620' : '#16A34A20') : '#E4E8F0', color: available ? (hit ? '#B91C1C' : '#15803D') : '#475569', border: `1px solid ${available ? (hit ? '#FECACA' : '#15803D') : '#E4E8F0'}` }}>
                  {available ? (hit ? '!' : '✓') : '🔒'}
                </span>
                <span style={{ flex: 1 }}>{q.source}</span>
                <span style={{ fontSize: 10, fontWeight: 600, color: available ? (hit ? '#B91C1C' : '#15803D') : '#475569' }}>
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
          <div style={{ fontSize: 13, color: '#15803D', fontWeight: 600 }}>{t('screen.result.court.clean.title')}</div>
          <div style={{ fontSize: 11, color: '#64748B', marginTop: 4 }}>{t('screen.result.court.clean.sub', { n: availableCount })}</div>
        </div>
      )}
      {totalHits > 0 && (
        <div style={{ padding: '12px 14px', background: '#DC262610', border: '1px solid #7F1D1D60', borderRadius: 8, fontSize: 12, color: '#B91C1C' }}>
          {t('screen.result.court.hits', { n: totalHits })}
        </div>
      )}
      {tier === 'free' && (
        <div style={{ marginTop: 14, padding: '12px 14px', background: '#8B5CF610', border: '1px solid #8B5CF630', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 16 }}>💎</span>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#6D28D9' }}>{t('screen.result.court.upgrade.title')}</div>
            <div style={{ fontSize: 11, color: '#5B21B6', marginTop: 2 }}>{t('screen.result.court.upgrade.sub')}</div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────── Document Authenticity Card ──
// Expandable card summarising whether uploaded documents look legit.
// Headline uses the v3 verification dimension (which bundles doc_auth +
// identity_match + employer_verify), and the expanded body breaks that
// down into the three sub-components plus any triggered gates/flags.
function AuthenticityCard({ result }: { result: ScoreResult }) {
  const { t, lang } = useT()
  const [open, setOpen] = useState(false)

  // Headline score: verification dim is our best proxy for "did these docs check out"
  const verificationScore = result.scores_v3?.verification
  const identityScore = typeof result.identity_match_score === 'number' ? result.identity_match_score : null

  // Authenticity score = verification dim with identity pulled in when present
  const authScore: number | null = typeof verificationScore === 'number'
    ? (identityScore !== null ? Math.round((verificationScore + identityScore) / 2) : verificationScore)
    : null

  const hardGates = result.hard_gates_triggered || []
  const redFlags = result.red_flags || []
  const subCov = result.sub_coverage || {}

  // Relevant gates and flags only
  const authGates = hardGates.filter(g => ['doc_tampering', 'identity_mismatch', 'employer_fraud'].includes(g))
  const authFlags = redFlags.filter(f => ['cross_doc_contradictions', 'hr_phone_is_applicant', 'no_linkedin_for_professional_role', 'volunteered_sin'].includes(f))

  // Status classification
  let statusKey: 'verified' | 'concerning' | 'suspicious' = 'verified'
  let statusColor = '#10B981'
  let statusBg = 'rgba(16, 185, 129, 0.12)'
  let statusBorder = 'rgba(16, 185, 129, 0.4)'
  let statusIcon = '✓'
  if (authGates.length > 0 || (authScore !== null && authScore < 50)) {
    statusKey = 'suspicious'
    statusColor = '#B91C1C'
    statusBg = 'rgba(220, 38, 38, 0.12)'
    statusBorder = 'rgba(220, 38, 38, 0.4)'
    statusIcon = '⚠'
  } else if (authFlags.length > 0 || (authScore !== null && authScore < 75) || subCov.doc_authenticity === 'action_pending' || subCov.identity_match === 'action_pending') {
    statusKey = 'concerning'
    statusColor = '#A16207'
    statusBg = 'rgba(245, 158, 11, 0.12)'
    statusBorder = 'rgba(245, 158, 11, 0.4)'
    statusIcon = '!'
  }

  // Short status label
  const statusLabel = t(`screen.result.authenticity.status.${statusKey}` as DictKey)

  // Verification dim detail text
  const details = lang === 'zh' ? (result.details_zh || result.details_en) : (result.details_en || result.details_zh)
  const verificationDetail = (details as any)?.verification as string | undefined

  // Coverage helper — defaults to "measured" (backend sparse emission)
  const cov = (key: string): string => subCov[key] || 'measured'
  const covColor = (c: string) => {
    if (c === 'measured') return '#15803D'
    if (c === 'inferred') return '#1D4ED8'
    if (c === 'action_pending') return '#92400E'
    return '#64748B'
  }
  const covLabel = (c: string) => t(`screen.result.authenticity.cov.${c}` as DictKey)

  const SubRow = ({ label, covKey, scoreVal }: { label: string; covKey: string; scoreVal?: number | null }) => {
    const c = cov(covKey)
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'rgba(11, 23, 54, 0.04)', borderRadius: 8, border: '1px solid var(--border-subtle)' }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: covColor(c), flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: '#0B1736' }}>{label}</div>
          <div style={{ fontSize: 10.5, color: '#64748B', marginTop: 1 }}>{covLabel(c)}</div>
        </div>
        {typeof scoreVal === 'number' && (
          <span className="mono" style={{ fontSize: 11, fontWeight: 700, color: covColor(c) }}>{scoreVal}/100</span>
        )}
      </div>
    )
  }

  return (
    <div className="sl-card" style={{ background: 'var(--bg-card)', border: `1px solid ${statusBorder}`, marginBottom: 18, padding: 0, overflow: 'hidden' }}>
      <button
        onClick={() => setOpen(!open)}
        style={{ width: '100%', background: 'none', border: 'none', padding: '18px 20px', textAlign: 'left', cursor: 'pointer', color: 'inherit', display: 'flex', alignItems: 'center', gap: 14 }}
      >
        <div style={{ width: 44, height: 44, borderRadius: 12, background: statusBg, border: `1px solid ${statusBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, color: statusColor, flexShrink: 0 }}>
          {statusIcon}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#0B1736' }}>{t('screen.result.authenticity.title')}</div>
          <div style={{ fontSize: 11.5, color: statusColor, marginTop: 2, fontWeight: 600 }}>{statusLabel}</div>
          {!open && (
            <div style={{ fontSize: 10.5, color: '#64748B', marginTop: 3 }}>{t('screen.result.authenticity.sub')}</div>
          )}
        </div>
        {authScore !== null && (
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div className="mono" style={{ fontSize: 22, fontWeight: 800, color: statusColor, lineHeight: 1 }}>{authScore}</div>
            <div style={{ fontSize: 9, color: '#64748B', marginTop: 2, letterSpacing: '0.05em', textTransform: 'uppercase' }}>/ 100</div>
          </div>
        )}
        <span style={{ fontSize: 16, color: '#64748B', transition: 'transform 0.2s', transform: open ? 'rotate(90deg)' : 'none', flexShrink: 0 }}>›</span>
      </button>

      {open && (
        <div style={{ padding: '0 20px 20px', borderTop: '1px dashed var(--border-subtle)', marginTop: -1 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
            <SubRow
              label={t('screen.result.authenticity.docCheck')}
              covKey="doc_authenticity"
            />
            <SubRow
              label={t('screen.result.authenticity.idMatch')}
              covKey="identity_match"
              scoreVal={identityScore}
            />
            <SubRow
              label={t('screen.result.authenticity.employerCheck')}
              covKey="employer_verify"
            />
          </div>

          {verificationDetail && (
            <div style={{ marginTop: 14, padding: '12px 14px', background: 'rgba(59, 130, 246, 0.06)', border: '1px solid rgba(59, 130, 246, 0.2)', borderRadius: 8 }}>
              <div style={{ fontSize: 10.5, fontWeight: 600, color: '#1D4ED8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>{t('screen.result.authenticity.aiNote')}</div>
              <div style={{ fontSize: 12.5, color: '#0B1736', lineHeight: 1.6 }}>{verificationDetail}</div>
            </div>
          )}

          {authGates.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 10.5, fontWeight: 600, color: '#B91C1C', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>{t('screen.result.authenticity.gatesTriggered')}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {authGates.map(g => (
                  <div key={g} style={{ padding: '9px 12px', background: 'rgba(220, 38, 38, 0.1)', border: '1px solid rgba(220, 38, 38, 0.3)', borderRadius: 8, fontSize: 11.5, color: '#B91C1C', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span>⛔</span>
                    <span>{t(`screen.result.authenticity.gate.${g}` as DictKey)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {authFlags.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 10.5, fontWeight: 600, color: '#A16207', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>{t('screen.result.authenticity.flagsTriggered')}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {authFlags.map(f => (
                  <div key={f} style={{ padding: '9px 12px', background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.28)', borderRadius: 8, fontSize: 11.5, color: '#92400E', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span>⚠</span>
                    <span>{t(`screen.result.authenticity.flag.${f}` as DictKey)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ──────────────────────────────────────────────────── Main Page ──

export default function ScreenPage() {
  const { t, lang } = useT()
  const { landlord, loading: authLoading, signOut } = useLandlord({
    redirectIfMissing: true,
    allowAnonymous: true,
    redirectBackTo: '/screen',
  })

  const [plan, setPlan] = useState<'free' | 'pro' | 'enterprise'>('free')
  const [tier, setTier] = useState<'free' | 'pro'>('free')

  const [files, setFiles] = useState<File[]>([])
  // AI-detected kinds per file (keyed by a stable file signature: name+size)
  const [fileKinds, setFileKinds] = useState<Record<string, string[]>>({})
  const [classifying, setClassifying] = useState(false)
  const [classifyError, setClassifyError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [applicantName, setApplicantName] = useState('')
  const [targetRent, setTargetRent] = useState('')

  const [analyzing, setAnalyzing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [progressLabel, setProgressLabel] = useState('')
  const [result, setResult] = useState<ScoreResult | null>(null)
  const [lastDetectedKinds, setLastDetectedKinds] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [history, setHistory] = useState<Screening[]>([])
  const [viewingHistoryId, setViewingHistoryId] = useState<string | null>(null)
  const [loadingHistoryId, setLoadingHistoryId] = useState<string | null>(null)
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
      .select('id, tenant_name, ai_extracted_name, ai_score, ai_summary, status, created_at')
      .order('created_at', { ascending: false })
      .limit(20)
    if (data) setHistory(data)
  }

  // Reconstruct a full ScoreResult from a saved screening row. The server
  // packs everything needed into ai_dimension_notes._v3 at scoring time
  // (plus individual scoring columns), so this is a pure read with no AI call.
  async function loadPastScreening(id: string) {
    setLoadingHistoryId(id)
    setError(null)
    try {
      const { data, error } = await supabase
        .from('screenings')
        .select('*')
        .eq('id', id)
        .maybeSingle()
      if (error || !data) {
        setError(t('history.loadError'))
        return
      }
      const v3 = (data.ai_dimension_notes && (data.ai_dimension_notes as any)._v3) || {}

      // Legacy scores: prefer the snapshot stashed into _v3, fall back to
      // individual columns for rows scored before we started packing it.
      const legacyScores = v3.legacy_scores || {
        doc_authenticity: data.doc_authenticity_score ?? 0,
        payment_ability: data.payment_ability_score ?? 0,
        court_records: data.court_records_score ?? 0,
        stability: data.stability_score ?? 0,
        behavior_signals: data.behavior_signals_score ?? 0,
        info_consistency: data.info_consistency_score ?? 0,
      }

      const scoresV3 = v3.scores || (data.ability_to_pay_score != null ? {
        ability_to_pay: data.ability_to_pay_score ?? 0,
        credit_health: data.credit_health_score ?? 0,
        rental_history: data.rental_history_score ?? 0,
        verification: data.verification_score ?? 0,
        communication: data.communication_score ?? 0,
      } : undefined)

      const reconstructed: ScoreResult = {
        overall: data.ai_score ?? 0,
        scores: legacyScores,
        notes: {},
        details_en: v3.details_en ?? data.ai_dimension_notes?._details_en ?? null,
        details_zh: v3.details_zh ?? data.ai_dimension_notes?._details_zh ?? null,
        flags: Array.isArray(v3.flags) ? v3.flags : [],
        detected_document_kinds: Array.isArray(v3.detected_document_kinds) ? v3.detected_document_kinds : [],
        detected_monthly_income: v3.detected_monthly_income ?? null,
        effective_monthly_income: v3.effective_monthly_income ?? null,
        income_evidence: v3.income_evidence ?? data.ai_dimension_notes?._income_evidence ?? null,
        monthly_rent: v3.monthly_rent ?? null,
        income_rent_ratio: v3.income_rent_ratio ?? null,
        extracted_name: v3.extracted_name || data.ai_extracted_name || data.tenant_name || '',
        name_was_extracted: !!data.ai_extracted_name,
        summary: v3.summary_en || data.ai_summary || '',
        summary_en: v3.summary_en || data.ai_summary || '',
        summary_zh: v3.summary_zh || '',
        court_records_detail: v3.court_records_detail ?? data.court_records_detail ?? { queries: [], total_hits: 0, queried_name: '' },
        tier: (plan === 'pro' || plan === 'enterprise') ? 'pro' : 'free',
        model_version: v3.model_version || data.model_version || undefined,
        scores_v3: scoresV3,
        v3_tier: v3.tier || data.v3_tier || undefined,
        tier_reason: v3.tier_reason || data.tier_reason || undefined,
        hard_gates_triggered: v3.hard_gates_triggered || data.hard_gates_triggered || [],
        red_flags: v3.red_flags || data.red_flags || [],
        red_flag_penalty: v3.red_flag_penalty ?? data.red_flag_penalty ?? 0,
        gate_cap: v3.gate_cap ?? undefined,
        evidence_coverage: v3.evidence_coverage ?? data.evidence_coverage ?? undefined,
        sub_coverage: v3.sub_coverage || data.sub_coverage || {},
        identity_match_score: v3.identity_match_score ?? data.identity_match_score ?? null,
        action_items: v3.action_items || data.action_items || [],
        compliance_audit: v3.compliance_audit ?? data.compliance_audit ?? null,
      }

      setResult(reconstructed)
      setViewingHistoryId(id)
      // Scroll to top so the user lands on the report
      if (typeof window !== 'undefined') {
        window.scrollTo({ top: 0, behavior: 'smooth' })
      }
    } catch (e: any) {
      setError(t('history.loadError'))
    } finally {
      setLoadingHistoryId(null)
    }
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
    // Kick off classification for newly added files only
    if (incoming.length > 0) {
      classifyNewFiles(incoming)
    }
  }, [t])

  const fileKey = (f: { name: string; size: number }) => `${f.name}__${f.size}`

  const classifyNewFiles = useCallback(async (toClassify: File[]) => {
    try {
      setClassifying(true)
      setClassifyError(null)
      const form = new FormData()
      for (const f of toClassify) form.append('files', f, f.name)
      const res = await fetch('/api/classify-files', { method: 'POST', body: form })
      if (!res.ok) {
        const errBody = await res.text().catch(() => '')
        console.error('[classify-files] HTTP', res.status, errBody)
        setClassifyError(`Classification failed (${res.status}). ${errBody.slice(0, 120)}`)
        return
      }
      const data = await res.json() as {
        classifications?: { index: number; kinds: string[] }[]
        applicant_name?: string | null
        monthly_rent?: number | null
        error?: string
      }
      if (data.error) {
        console.error('[classify-files] API error:', data.error)
        setClassifyError(data.error)
        return
      }
      const map: Record<string, string[]> = {}
      for (const c of data.classifications || []) {
        const f = toClassify[c.index]
        if (f) map[fileKey(f)] = Array.isArray(c.kinds) ? c.kinds : []
      }
      setFileKinds(prev => ({ ...prev, ...map }))

      // Backfill applicant name + target rent if Claude found them
      // in the uploaded documents (typically in the application form)
      // AND the user hasn't already typed something. We never overwrite
      // user input.
      if (data.applicant_name) {
        setApplicantName(prev => (prev && prev.trim() ? prev : data.applicant_name!))
      }
      if (typeof data.monthly_rent === 'number' && data.monthly_rent > 0) {
        setTargetRent(prev => (prev && prev.trim() ? prev : String(data.monthly_rent)))
      }
    } catch (err) {
      console.error('[classify-files] exception:', err)
      setClassifyError(lang === 'zh' ? '文件分类请求失败，请重试' : 'File classification request failed — please retry')
    } finally {
      setClassifying(false)
    }
  }, [lang])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    handleFiles(e.dataTransfer.files)
  }, [handleFiles])

  const removeFile = (idx: number) => setFiles(prev => {
    const removed = prev[idx]
    if (removed) {
      setFileKinds(fk => {
        const next = { ...fk }
        delete next[fileKey(removed)]
        return next
      })
    }
    return prev.filter((_, i) => i !== idx)
  })

  const reset = () => {
    setFiles([])
    setFileKinds({})
    setResult(null)
    setProgress(0)
    setProgressLabel('')
    setApplicantName('')
    setTargetRent('')
    setError(null)
    setViewingHistoryId(null)
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
    // v3 lean schema cuts Claude latency to ~15-25s on typical screenings,
    // so the canned step animation runs faster (350ms base vs the old
    // 650ms) and the slow-crawl phase advances faster (0.4% per 500ms)
    // to keep the bar visibly in sync with the real backend work.
    const animate = async () => {
      for (const s of steps) {
        if (cancelled) return
        await new Promise(r => setTimeout(r, 350 + Math.random() * 250))
        if (cancelled) return
        setProgress(s.pct)
        setProgressLabel(s.label)
      }
      // Slow crawl phase: advance 0.4% per 500ms, capped at 98
      let p = 94
      while (!cancelled && p < 98) {
        await new Promise(r => setTimeout(r, 500))
        if (cancelled) return
        p = Math.min(98, p + 0.4)
        setProgress(p)
        setProgressLabel(t('screen.step.risk'))
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

      // 2. Upload files to storage — run all uploads in PARALLEL.
      // Sequential uploads made multi-file submissions add several
      // extra seconds on top of the already-slow Claude call.
      const stamp = Date.now()
      const uploadResults = await Promise.all(files.map(async (f, i) => {
        const safeName = f.name.replace(/[^a-zA-Z0-9._-]/g, '_')
        const path = `screenings/${landlord.landlordId}/${screeningId}/${stamp}_${i}_${safeName}`
        const { error: upErr } = await supabase
          .storage.from('tenant-files')
          .upload(path, f, { contentType: f.type, upsert: false })
        if (upErr) throw new Error(`${f.name}: ${upErr.message}`)
        return {
          path,
          name: f.name,
          size: f.size,
          mime: f.type || 'application/octet-stream',
          kind: guessKind(f.name),
        } as UploadedFile
      }))
      const uploaded: UploadedFile[] = uploadResults
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
      setLastDetectedKinds(Array.isArray((data as ScoreResult).detected_document_kinds) ? (data as ScoreResult).detected_document_kinds! : [])
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
      <div className="screen-app" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569', fontFamily: "'Inter', sans-serif" }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 40, height: 40, margin: '0 auto 12px', borderRadius: '50%', border: '3px solid #E4E8F0', borderTopColor: '#0D9488', animation: 'spin 1s linear infinite' }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
          <div style={{ fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}>Authenticating...</div>
        </div>
      </div>
    )
  }

  const isPro = plan === 'pro' || plan === 'enterprise'

  // Flags come from the AI's actual analysis of this specific applicant
  // (backend returns flags[] with text_en / text_zh per flag). We only
  // tack on an informational Pro-upsell at the end so we never fabricate.
  const aiFlags: { type: 'danger' | 'warning' | 'info' | 'success'; text: string }[] = []
  if (result) {
    const rawFlags = Array.isArray(result.flags) ? result.flags : []
    for (const f of rawFlags) {
      const txt = (lang === 'zh' ? f.text_zh : f.text_en) || f.text_en || f.text_zh
      if (!txt) continue
      const type: 'danger' | 'warning' | 'info' | 'success' =
        f.type === 'danger' || f.type === 'warning' || f.type === 'info' || f.type === 'success'
          ? f.type : 'info'
      aiFlags.push({ type, text: txt })
    }
    if (tier === 'free') {
      aiFlags.push({ type: 'info', text: t('flag.upgradeCta') })
    }
  }

  const riskOverall = result ? getRiskLevel(result.overall) : null

  return (
    <div className="screen-app" style={{ minHeight: '100vh' }}>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;700;800&display=swap" rel="stylesheet" />
      <style>{`
        .sl-header { padding: 20px 24px; }
        .sl-brand-sub { display: block; }
        .sl-container { max-width: 800px; margin: 0 auto; padding: 24px 16px; }
        .sl-tier-toggle { display: flex; gap: 8px; margin-bottom: 20px; padding: 4px; }
        .sl-tier-btn-sources { font-size: 10px; }
        .sl-card { padding: 20px; border-radius: 16px; }
        .sl-card-overall { padding: 32px 24px; border-radius: 20px; }
        .sl-file-grid { grid-template-columns: repeat(4, 1fr); }
        .sl-weights-grid { grid-template-columns: repeat(3, 1fr); }
        .sl-stats-row { gap: 24px; font-size: 12px; }
        .sl-stats-val { font-size: 14px; }
        .sl-score-ring-wrap { display: flex; justify-content: center; margin-bottom: 20px; }
        .sl-cat-primary { font-size: 13px; }
        .sl-cat-secondary { font-size: 11px; }
        .sl-court-source { font-size: 12px; }
        .sl-nav-btn { padding: 8px 16px; font-size: 13px; }
        .sl-extracted-name { font-size: 18px; }
        .sl-risk-pill { font-size: 14px; padding: 6px 20px; }
        @media (max-width: 640px) {
          .sl-header { padding: 14px 14px; flex-wrap: wrap; gap: 10px; }
          .sl-brand-sub { display: none; }
          .sl-container { padding: 16px 12px; }
          .sl-card { padding: 14px; border-radius: 14px; }
          .sl-card-overall { padding: 22px 14px; border-radius: 16px; }
          .sl-file-grid { grid-template-columns: repeat(2, 1fr) !important; }
          .sl-weights-grid { grid-template-columns: repeat(2, 1fr) !important; }
          .sl-stats-row { gap: 14px !important; font-size: 11px !important; }
          .sl-stats-val { font-size: 13px !important; }
          .sl-cat-primary { font-size: 12px !important; }
          .sl-cat-secondary { font-size: 10px !important; }
          .sl-court-source { font-size: 11px !important; }
          .sl-nav-btn { padding: 6px 10px !important; font-size: 12px !important; }
          .sl-extracted-name { font-size: 16px !important; }
          .sl-risk-pill { font-size: 12px !important; padding: 5px 14px !important; }
          .sl-tier-btn-sources { display: none; }
          .sl-summary-text { font-size: 13px !important; line-height: 1.7 !important; }
          .sl-section-title { font-size: 12px !important; }
        }
      `}</style>

      {/* Header */}
      <nav className="nav-bar">
        <Link href="/" className="nav-brand">
          <div className="nav-logo">S</div>
          <div>
            <div className="nav-title">{t('screen.title')}</div>
            <div className="nav-sub mono">{t('screen.subtitle')}</div>
          </div>
        </Link>
        <div className="nav-actions">
          {result && (
            <button onClick={reset} className="btn btn-ghost btn-sm">{t('screen.new')}</button>
          )}
          <LanguageToggle />
          <Link href="/dashboard" className="btn btn-ghost btn-sm">{t('nav.dashboard')}</Link>
        </div>
      </nav>

      <div className="container-narrow">
        {!result && !analyzing && (
          <>
            {/* Tier Toggle */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 20, padding: 5, background: '#FFFFFF', borderRadius: 14, border: '1px solid #C8D0DE', boxShadow: '0 4px 16px -6px rgba(11, 23, 54, 0.14)' }}>
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
                      padding: '11px 16px',
                      borderRadius: 10,
                      border: 'none',
                      cursor: 'pointer',
                      background: active
                        ? (key === 'pro' ? 'var(--gradient-pro)' : 'linear-gradient(135deg, #0D9488 0%, #0F766E 100%)')
                        : 'transparent',
                      color: active ? '#FFFFFF' : 'var(--text-muted)',
                      fontSize: 13,
                      fontWeight: 600,
                      transition: 'all 0.2s',
                      opacity: disabled ? 0.75 : 1,
                      boxShadow: active
                        ? (key === 'pro' ? '0 6px 24px -6px rgba(139, 92, 246, 0.5)' : '0 6px 24px -6px rgba(13, 148, 136, 0.45)')
                        : 'none',
                    }}
                  >
                    <div>{label} {key === 'pro' && '💎'}</div>
                    <div className="sl-tier-btn-sources" style={{ fontSize: 10, fontWeight: 400, marginTop: 2, opacity: 0.8 }}>{sources}</div>
                  </button>
                )
              })}
            </div>

            {/* Input Fields */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 240 }}>
                <label className="label">{t('screen.form.name.label')}</label>
                <input
                  type="text"
                  className="input"
                  placeholder={t('screen.form.name.placeholder')}
                  value={applicantName}
                  onChange={e => setApplicantName(e.target.value)}
                />
                <div style={{ fontSize: 10.5, color: 'var(--text-faint)', marginTop: 6 }}>{t('screen.form.name.hint')}</div>
              </div>
              <div style={{ flex: 1, minWidth: 240 }}>
                <label className="label">{t('screen.form.rent.label')}</label>
                <input
                  type="number"
                  className="input"
                  placeholder="e.g. 2500"
                  value={targetRent}
                  onChange={e => setTargetRent(e.target.value)}
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
                border: `2px dashed ${dragOver ? '#14B8A6' : '#B0BAC9'}`,
                borderRadius: 18,
                padding: '52px 24px',
                textAlign: 'center',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                background: dragOver
                  ? 'radial-gradient(ellipse at center, rgba(20, 184, 166, 0.1), transparent 70%)'
                  : '#F5F7FB',
                backdropFilter: 'blur(10px)',
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
              <div style={{ width: 56, height: 56, margin: '0 auto 16px', borderRadius: 14, background: 'rgba(20, 184, 166, 0.1)', border: '1px solid rgba(20, 184, 166, 0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26 }}>📁</div>
              <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6, letterSpacing: '-0.01em' }}>{t('screen.drop.title')}</div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{t('screen.drop.sub')}</div>
              <div className="btn btn-ghost btn-sm" style={{ marginTop: 18, display: 'inline-flex' }}>{t('screen.drop.pick')}</div>
            </div>

            {/* File Types */}
            <div className="sl-file-grid" style={{ display: 'grid', gap: 8, marginTop: 16 }}>
              {(() => {
                // Per-file preference order:
                //   1. AI classifier result (fileKinds) — populated
                //      within seconds of upload. A single file may
                //      return multiple kinds (bundled PDFs).
                //   2. Filename heuristic fallback while classification
                //      is still in flight, or on classifier failure.
                //
                // This is why "25729.jpg" (an ID photo) correctly
                // lights up the ID / Passport slot — Claude opens the
                // image and sees it's a passport/ID, even though the
                // filename carries no hint.
                const counts: Record<string, number> = {}
                for (const f of files) {
                  const aiKinds = fileKinds[fileKey(f)]
                  if (Array.isArray(aiKinds) && aiKinds.length > 0) {
                    for (const k of aiKinds) counts[k] = (counts[k] || 0) + 1
                  } else {
                    const k = guessKind(f.name)
                    counts[k] = (counts[k] || 0) + 1
                  }
                }
                // Union with post-scoring kinds (survives re-renders
                // after analyze completes).
                for (const k of lastDetectedKinds) {
                  if (!counts[k]) counts[k] = 1
                }
                return FILE_TYPES.map(ft => {
                  const count = counts[ft.key] || 0
                  const uploaded = count > 0
                  return (
                    <div
                      key={ft.key}
                      style={{
                        position: 'relative',
                        padding: '12px 10px',
                        borderRadius: 10,
                        background: uploaded ? 'rgba(16, 185, 129, 0.14)' : 'var(--bg-card-raised)',
                        border: uploaded ? '1px solid rgba(16, 185, 129, 0.5)' : '1px solid var(--border-strong)',
                        boxShadow: uploaded ? '0 0 0 3px rgba(16, 185, 129, 0.08)' : 'none',
                        textAlign: 'center',
                        fontSize: 11,
                        color: uploaded ? '#15803D' : 'var(--text-secondary)',
                        fontWeight: uploaded ? 600 : 500,
                        transition: 'all 0.2s ease',
                      }}
                    >
                      {uploaded && (
                        <div
                          style={{
                            position: 'absolute',
                            top: 6,
                            right: 6,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 3,
                            padding: '2px 6px 2px 4px',
                            borderRadius: 10,
                            background: 'linear-gradient(135deg, #10B981, #059669)',
                            color: '#fff',
                            fontSize: 10,
                            fontWeight: 800,
                            boxShadow: '0 2px 8px rgba(16, 185, 129, 0.45)',
                            lineHeight: 1,
                            minHeight: 18,
                          }}
                          aria-label={`${count} file${count === 1 ? '' : 's'} uploaded`}
                        >
                          <span style={{ fontSize: 9 }}>✓</span>
                          <span>{count}</span>
                        </div>
                      )}
                      <div style={{ fontSize: 18, marginBottom: 5, filter: uploaded ? 'none' : 'grayscale(0.15)' }}>{ft.icon}</div>
                      {t(ft.labelKey)}
                    </div>
                  )
                })
              })()}
            </div>

            {error && (
              <div style={{ marginTop: 16, padding: '10px 14px', background: '#FEF2F2', border: '1px solid #7f1d1d', borderRadius: 8, fontSize: 13, color: '#B91C1C' }}>⚠ {error}</div>
            )}

            {/* File List & Submit */}
            {files.length > 0 && (
              <div style={{ marginTop: 20 }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: '#64748B', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span>{t('screen.files.uploadedN', { n: files.length })}</span>
                  {classifying && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#0F766E', fontWeight: 500 }}>
                      <span style={{ width: 10, height: 10, borderRadius: '50%', border: '2px solid rgba(20, 184, 166, 0.25)', borderTopColor: '#14B8A6', animation: 'spin 0.8s linear infinite', display: 'inline-block' }} />
                      {lang === 'zh' ? '识别文件类型中…' : 'Classifying file types…'}
                    </span>
                  )}
                  {classifyError && !classifying && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#DC2626', fontWeight: 500, cursor: 'pointer' }} title={classifyError} onClick={() => { setClassifyError(null); classifyNewFiles(files) }}>
                      ⚠ {lang === 'zh' ? '分类失败' : 'Classification failed'} — <span style={{ textDecoration: 'underline' }}>{lang === 'zh' ? '点击重试' : 'click to retry'}</span>
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {files.map((f, i) => <FileChip key={i} file={f} onRemove={() => removeFile(i)} />)}
                </div>
                <div style={{ marginTop: 14, padding: '12px 16px', background: 'rgba(11, 23, 54, 0.04)', borderRadius: 10, border: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5, color: 'var(--text-secondary)' }}>
                  <span>⚖️</span>
                  <span>
                    {applicantName.trim() ? t('screen.files.auto.name', { name: applicantName.trim() }) : t('screen.files.auto.extract')}
                    {' '}
                    {tier === 'pro' ? t('screen.files.auto.sources.pro') : t('screen.files.auto.sources.free')}
                  </span>
                </div>
                <button onClick={runAnalysis} className="btn btn-primary btn-lg" style={{ marginTop: 18, width: '100%' }}>
                  {t('screen.submit')}{tier === 'pro' && t('screen.submit.pro')} →
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
            <div className="fade-up" style={{ textAlign: 'center', padding: '80px 0' }}>
              <div className="spin" style={{ width: 64, height: 64, margin: '0 auto 24px', borderRadius: '50%', border: '3px solid rgba(11, 23, 54, 0.08)', borderTopColor: isCourtStep ? '#8B5CF6' : '#14B8A6' }} />
              <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 10, color: isCourtStep ? '#6D28D9' : 'var(--text-primary)', letterSpacing: '-0.01em' }}>
                {progressLabel || t('screen.step.start')}
                <span className="mono" style={{ marginLeft: 10, fontSize: 13, fontWeight: 700, color: isCourtStep ? '#6D28D9' : '#14B8A6' }}>
                  {Math.round(progress)}%
                </span>
              </div>
              <div style={{ width: 320, maxWidth: '80%', height: 5, borderRadius: 3, background: 'rgba(11, 23, 54, 0.06)', margin: '16px auto', overflow: 'hidden' }}>
                <div style={{ height: '100%', borderRadius: 3, background: isCourtStep ? 'var(--gradient-pro)' : 'var(--gradient-brand)', width: `${progress}%`, transition: 'width 0.5s ease' }} />
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
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
          <div className="fade-up">
            {/* Overall */}
            <div className="card-hero sl-card-overall" style={{ textAlign: 'center', marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginBottom: 8, alignItems: 'center' }}>
                <span className="mono" style={{ fontSize: 10.5, color: 'var(--text-muted)', letterSpacing: '0.15em', textTransform: 'uppercase', fontWeight: 600 }}>{t('screen.result.headline')}</span>
                <span className={result.tier === 'pro' ? 'chip chip-pro' : 'chip'} style={{ padding: '2px 8px', fontSize: 9.5 }}>{result.tier === 'pro' ? 'PRO' : 'FREE'}</span>
              </div>
              <div className="sl-extracted-name" style={{ fontWeight: 700, marginBottom: 4, letterSpacing: '-0.015em' }}>{result.extracted_name || applicantName || '—'}</div>
              {result.name_was_extracted
                ? <div className="mono" style={{ fontSize: 10, color: 'var(--text-faint)', marginBottom: 16, letterSpacing: '0.05em' }}>{t('screen.result.nameExtracted')}</div>
                : <div style={{ marginBottom: 16 }} />}
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
                <ScoreRing score={result.overall} size={160} strokeWidth={12} />
              </div>
              <div className="sl-risk-pill" style={{ display: 'inline-block', borderRadius: 20, background: riskOverall.bg, color: riskOverall.color, fontWeight: 700, letterSpacing: 1 }}>
                {t(riskOverall.tagKey)} — {t(riskOverall.labelKey)}
              </div>
              {/* v3 tier badge + evidence coverage bar */}
              {result.v3_tier && (() => {
                const tierColors: Record<string, { bg: string; fg: string; label: string }> = {
                  approve: { bg: '#DCFCE7', fg: '#166534', label: lang === 'zh' ? '优质 · 建议通过' : 'Approve' },
                  conditional: { bg: '#FEF9C3', fg: '#854D0E', label: lang === 'zh' ? '待定 · 附加条件' : 'Conditional' },
                  decline: { bg: '#FEE2E2', fg: '#FECACA', label: lang === 'zh' ? '建议拒绝' : 'Decline' },
                }
                const tc = tierColors[result.v3_tier] || tierColors.conditional
                const cov = typeof result.evidence_coverage === 'number' ? result.evidence_coverage : null
                const covColor = cov == null ? '#64748B' : cov >= 0.75 ? '#16A34A' : cov >= 0.6 ? '#A16207' : '#C2410C'
                return (
                  <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                    <span style={{ display: 'inline-block', padding: '4px 14px', borderRadius: 14, background: tc.bg, color: tc.fg, fontWeight: 700, fontSize: 11.5, letterSpacing: 0.5 }}>
                      {tc.label}
                      {result.hard_gates_triggered && result.hard_gates_triggered.length > 0 && (
                        <span style={{ marginLeft: 6, fontSize: 10 }}>· {lang === 'zh' ? '触发硬门槛' : 'hard gate'}</span>
                      )}
                    </span>
                    {cov != null && (
                      <div style={{ width: 260, maxWidth: '80%' }}>
                        <div className="mono" style={{ fontSize: 9.5, color: '#64748B', marginBottom: 4, display: 'flex', justifyContent: 'space-between' }}>
                          <span>{lang === 'zh' ? '证据充足度' : 'Evidence coverage'}</span>
                          <span style={{ color: covColor, fontWeight: 700 }}>{(cov * 100).toFixed(0)}%</span>
                        </div>
                        <div style={{ height: 4, borderRadius: 2, background: 'rgba(148,163,184,0.15)', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${cov * 100}%`, background: covColor, transition: 'width 0.6s ease' }} />
                        </div>
                      </div>
                    )}
                  </div>
                )
              })()}
              {(() => {
                // Use the real income/rent ratio computed server-side
                // from AI-detected or landlord-provided income.
                const rentNum = result.monthly_rent ?? Number(targetRent) ?? 0
                const realRatio = result.income_rent_ratio ?? null
                return (
                  <div className="sl-stats-row" style={{ display: 'flex', justifyContent: 'center', marginTop: 20, color: '#64748B', flexWrap: 'wrap' }}>
                    <div><div className="sl-stats-val" style={{ color: '#64748B', fontWeight: 600 }}>${rentNum ? rentNum.toLocaleString() : '—'}</div>{t('screen.result.stat.rent')}</div>
                    <div title={result.income_evidence || undefined}>
                      <div className="sl-stats-val" style={{ color: '#64748B', fontWeight: 600 }}>
                        {realRatio != null ? `${realRatio.toFixed(1)}x` : 'N/A'}
                      </div>
                      {t('screen.result.stat.ratio')}
                    </div>
                    <div><div className="sl-stats-val" style={{ color: '#64748B', fontWeight: 600 }}>{files.length}</div>{t('screen.result.stat.files')}</div>
                    <div><div className="sl-stats-val" style={{ color: '#64748B', fontWeight: 600 }}>{result.court_records_detail?.queries.filter(q => q.status === 'ok').length || 0}</div>{t('screen.result.stat.courts')}</div>
                  </div>
                )
              })()}
              {result.effective_monthly_income != null && (
                <div className="mono" style={{ marginTop: 10, fontSize: 10.5, color: '#64748B' }}>
                  {lang === 'zh' ? '检测到月收入' : 'Detected monthly income'}: <span style={{ color: '#64748B', fontWeight: 600 }}>${result.effective_monthly_income.toLocaleString()}</span>
                  {result.income_evidence && <span style={{ color: '#475569' }}> · {result.income_evidence}</span>}
                </div>
              )}
            </div>

            {/* Summary */}
            <div className="sl-card" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', backdropFilter: 'blur(14px)', marginBottom: 18 }}>
              <div className="sl-section-title" style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, color: '#64748B' }}>{t('screen.result.summary')}</div>
              <p className="sl-summary-text" style={{ fontSize: 14, lineHeight: 1.8, color: '#0B1736', margin: 0 }}>{(lang === 'zh' ? (result.summary_zh || result.summary) : (result.summary_en || result.summary))}</p>
            </div>

            {/* Document Authenticity — between AI summary and category breakdown */}
            <AuthenticityCard result={result} />

            {/* Category Scores */}
            <div className="sl-card" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', backdropFilter: 'blur(14px)', marginBottom: 18 }}>
              <div className="sl-section-title" style={{ fontSize: 13, fontWeight: 700, marginBottom: 16, color: '#64748B' }}>{t('screen.result.dims')}</div>
              {CATEGORIES.map((cat, i) => {
                const details = lang === 'zh' ? (result.details_zh || result.details_en) : (result.details_en || result.details_zh)
                // Pull from v3 scores when present; fall back to 0 for
                // historical screenings that never ran under v3.
                const v3Score = result.scores_v3?.[cat.id]
                return (
                  <CategoryBar
                    key={cat.id}
                    category={cat as any}
                    score={typeof v3Score === 'number' ? v3Score : 0}
                    animDelay={i * 150}
                    tier={result.tier}
                    shortNote={(result.notes as any)?.[cat.id]}
                    detail={(details as any)?.[cat.id]}
                  />
                )
              })}
            </div>

            {/* Court Records */}
            {(() => {
              const backendQueries = result.court_records_detail?.queries || []
              // Supplement backend queries with explicit Pro-locked sources
              // so the UI always shows a rich set of data sources like the
              // prototype. These stubs only render — they never affect
              // total_hits or scoring.
              const hasOntarioCourts = backendQueries.some(q => q.source.toLowerCase().includes('ontario courts'))
              const hasEquifax = backendQueries.some(q => q.source.toLowerCase().includes('equifax'))
              const hasVerified = backendQueries.some(q => q.source.toLowerCase().includes('verified'))
              const extras: CourtQuery[] = []
              if (!hasOntarioCourts) extras.push({ source: t('screen.result.court.source.ontarioCourts'), tier: 'pro', status: 'coming_soon', hits: null })
              if (!hasEquifax) extras.push({ source: t('screen.result.court.source.equifax'), tier: 'pro', status: 'coming_soon', hits: null })
              if (!hasVerified) extras.push({ source: t('screen.result.court.source.verifiedNetwork'), tier: 'pro', status: 'coming_soon', hits: null })
              return (
                <CourtRecordDetail
                  queries={[...backendQueries, ...extras]}
                  totalHits={result.court_records_detail?.total_hits || 0}
                  queriedName={result.court_records_detail?.queried_name || ''}
                  tier={result.tier}
                />
              )
            })()}

            {/* Action Items — L3 indicators that can only be resolved via landlord action */}
            {result.action_items && result.action_items.length > 0 && (
              <div className="sl-card" style={{ background: 'var(--bg-card)', border: '1px solid rgba(139, 92, 246, 0.35)', backdropFilter: 'blur(14px)', marginBottom: 18 }}>
                <div className="sl-section-title" style={{ fontSize: 13, fontWeight: 700, marginBottom: 4, color: '#6D28D9' }}>
                  {lang === 'zh' ? '待人工核实清单' : 'Action Items'}
                </div>
                <div style={{ fontSize: 11, color: '#64748B', marginBottom: 12 }}>
                  {lang === 'zh'
                    ? '以下内容无法仅凭上传文档确认，需要您亲自核实。每完成一项，评分会相应调整。'
                    : 'These items cannot be verified from documents alone. Completing each will adjust the score accordingly.'}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {result.action_items.map((item, i) => (
                    <div key={item.id || i} style={{ padding: 12, borderRadius: 10, background: 'rgba(139, 92, 246, 0.06)', border: '1px solid rgba(139, 92, 246, 0.18)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 6 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 700, color: '#E9D5FF' }}>
                          {lang === 'zh' ? item.title_zh : item.title_en}
                        </div>
                        <span className="mono" style={{ fontSize: 9, padding: '2px 7px', borderRadius: 4, background: 'rgba(139, 92, 246, 0.18)', color: '#6D28D9', whiteSpace: 'nowrap' }}>
                          {item.dimension}
                        </span>
                      </div>
                      <div style={{ fontSize: 11.5, color: '#0B1736', lineHeight: 1.6, marginBottom: 6 }}>
                        {lang === 'zh' ? item.details_zh : item.details_en}
                      </div>
                      {item.impact_on_score && (
                        <div className="mono" style={{ fontSize: 10, color: '#64748B' }}>
                          {lang === 'zh' ? '对评分影响' : 'Score impact'}: {item.impact_on_score}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Compliance Audit — collapsed paper trail for HRC defense */}
            {result.compliance_audit && (result.compliance_audit.protected_grounds_observed?.length || result.compliance_audit.reviewer_note) && (
              <details className="sl-card" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', backdropFilter: 'blur(14px)', marginBottom: 18 }}>
                <summary style={{ fontSize: 12, fontWeight: 700, color: '#64748B', cursor: 'pointer', listStyle: 'none' }}>
                  {lang === 'zh' ? '合规审计（HRC 证据链）' : 'Compliance Audit (HRC paper trail)'}
                </summary>
                <div style={{ marginTop: 10, fontSize: 11.5, color: '#0B1736', lineHeight: 1.7 }}>
                  {result.compliance_audit.protected_grounds_observed && result.compliance_audit.protected_grounds_observed.length > 0 && (
                    <div style={{ marginBottom: 6 }}>
                      <span style={{ color: '#64748B' }}>{lang === 'zh' ? '观察到但未用于评分的受保护特征' : 'Protected grounds observed but excluded from scoring'}: </span>
                      <span className="mono" style={{ color: '#64748B' }}>{result.compliance_audit.protected_grounds_observed.join(', ')}</span>
                    </div>
                  )}
                  {result.compliance_audit.reviewer_note && (
                    <div style={{ fontStyle: 'italic', color: '#64748B' }}>{result.compliance_audit.reviewer_note}</div>
                  )}
                </div>
              </details>
            )}

            {/* Flags */}
            {aiFlags.length > 0 && (
              <div className="sl-card" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', backdropFilter: 'blur(14px)', marginBottom: 18 }}>
                <div className="sl-section-title" style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, color: '#64748B' }}>{t('screen.result.flags')}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {aiFlags.map((flag, i) => <Flag key={i} type={flag.type} text={flag.text} />)}
                </div>
              </div>
            )}

            {/* Weights */}
            <div className="sl-card" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', backdropFilter: 'blur(14px)', marginBottom: 18 }}>
              <div className="sl-section-title" style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, color: '#64748B' }}>{t('screen.result.weights')}</div>
              <div className="sl-weights-grid" style={{ display: 'grid', gap: 8 }}>
                {CATEGORIES.map(cat => (
                  <div key={cat.id} style={{ textAlign: 'center', padding: '16px 8px', borderRadius: 12, background: 'rgba(11, 23, 54, 0.04)', border: cat.id === 'rental_history' ? '1px solid rgba(139, 92, 246, 0.35)' : '1px solid var(--border-subtle)' }}>
                    <div style={{ fontSize: 20, marginBottom: 4 }}>{cat.icon}</div>
                    <div style={{ fontSize: 11, color: '#0B1736', fontWeight: 700 }}>{lang === 'zh' ? cat.zhLabel : cat.enLabel}</div>
                    <div style={{ fontSize: 9, color: '#64748B', fontWeight: 500, marginTop: 1 }}>{lang === 'zh' ? cat.enLabel : cat.zhLabel}</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: cat.id === 'rental_history' ? '#6D28D9' : '#0D9488', fontFamily: "'JetBrains Mono', monospace", marginTop: 4 }}>{(cat.weight * 100).toFixed(0)}%</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Legal Disclaimer — advisory-only, HRC / RTA compliance reminder, liability carve-out */}
            <div className="sl-card" style={{ background: 'rgba(245, 158, 11, 0.05)', border: '1px solid rgba(245, 158, 11, 0.3)', marginBottom: 18, padding: '18px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(245, 158, 11, 0.15)', border: '1px solid rgba(245, 158, 11, 0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, color: '#A16207' }}>⚠</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#92400E' }}>{t('screen.result.disclaimer.title')}</div>
              </div>
              <div style={{ fontSize: 11.5, color: '#0B1736', lineHeight: 1.75, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <p style={{ margin: 0 }}>{t('screen.result.disclaimer.body1')}</p>
                <p style={{ margin: 0 }}>{t('screen.result.disclaimer.body2')}</p>
                <p style={{ margin: 0 }}>{t('screen.result.disclaimer.body3')}</p>
                <p style={{ margin: 0 }}>{t('screen.result.disclaimer.body4')}</p>
                <p style={{ margin: 0, color: '#64748B', fontSize: 11, fontStyle: 'italic', paddingTop: 8, borderTop: '1px dashed rgba(245, 158, 11, 0.2)' }}>{t('screen.result.disclaimer.body5')}</p>
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
          <div className="card" style={{ marginTop: 32, padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#8B5CF6', boxShadow: '0 0 8px rgba(139, 92, 246, 0.5)' }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '-0.005em' }}>{t('history.title')}</span>
              <span className="mono" style={{ marginLeft: 'auto', fontSize: 10.5, color: 'var(--text-faint)' }}>{t('history.countN', { n: history.length })}</span>
            </div>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, maxHeight: 400, overflowY: 'auto' }}>
              {history.map(s => {
                const lvl = s.ai_score != null ? getRiskLevel(s.ai_score) : null
                const isActive = viewingHistoryId === s.id
                const isLoading = loadingHistoryId === s.id
                const clickable = s.status === 'scored' || s.ai_score != null
                return (
                  <li
                    key={s.id}
                    onClick={() => { if (clickable && !isLoading) loadPastScreening(s.id) }}
                    style={{
                      padding: '14px 20px',
                      borderBottom: '1px solid var(--border-subtle)',
                      transition: 'background 0.15s',
                      cursor: clickable ? 'pointer' : 'default',
                      background: isActive ? 'rgba(56, 189, 248, 0.08)' : undefined,
                      opacity: isLoading ? 0.6 : 1,
                    }}
                    onMouseEnter={e => { if (clickable) (e.currentTarget as HTMLLIElement).style.background = 'rgba(11, 23, 54, 0.04)' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLLIElement).style.background = isActive ? 'rgba(56, 189, 248, 0.08)' : '' }}
                    title={clickable ? t('history.viewHint') : ''}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                        {s.ai_extracted_name || s.tenant_name || t('history.autoExtracted')}
                      </div>
                      {s.ai_score != null && lvl ? (
                        <span className="mono" style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 6, background: `${lvl.color}18`, color: lvl.color, border: `1px solid ${lvl.color}30` }}>{s.ai_score}</span>
                      ) : (
                        <span className="mono chip">{s.status}</span>
                      )}
                    </div>
                    <div className="mono" style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 4 }}>
                      {new Date(s.created_at).toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-CA')}
                      {isLoading && <span style={{ marginLeft: 8, color: '#0E7490' }}>· {t('history.loading')}</span>}
                      {clickable && !isLoading && <span style={{ marginLeft: 8, color: 'var(--text-muted)' }}>· {t('history.viewHint')}</span>}
                    </div>
                    {s.ai_summary && <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.6, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{s.ai_summary}</div>}
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
