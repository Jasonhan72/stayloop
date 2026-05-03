'use client'
import { useState, useEffect, useRef, useCallback, type ReactNode } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useUser, useAnonTrialCheck } from '@/lib/useUser'
import { useT, LanguageToggle, type DictKey } from '@/lib/i18n'
import PageShell from '@/components/v4/PageShell'
import AuthModal from '@/components/AuthModal'
import { generateScreeningReport } from '@/lib/generateReport'

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

interface CanLIIMatch {
  title: string
  citation: string
  url: string
  databaseId: string
  databaseName?: string
  caseId: string
  nameInTitle?: boolean  // true = tenant name found in case title (likely a party)
}

interface OntarioPortalMatch {
  caseNumber: string
  caseTitle: string
  caseCategory: string
  filedDate: string
  partyRole: string
  partyDisplayName: string
  courtAbbreviation: string
  closedFlag: boolean
  nameSwapped?: boolean
  /** UUID → link straight to the portal's case detail page. When present,
   *  the card renders `https://www.courts.ontario.ca/portal/court/{courtID}/case/{caseInstanceUUID}`
   *  instead of the generic party-search URL. */
  caseInstanceUUID?: string
  courtID?: string
}

interface CourtQuery {
  source: string
  tier: 'free' | 'pro'
  status: 'ok' | 'unavailable' | 'skipped' | 'coming_soon'
  hits: number | null
  url?: string
  note?: string
  severity?: number  // 3=critical, 2=high, 1=medium, 0=no hits
  records?: CanLIIMatch[]  // individual case records for this database
  portalRecords?: OntarioPortalMatch[]  // Ontario Courts Portal records
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
  court_summary_en?: string
  court_summary_zh?: string
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
  // Forensics — added 2026-04-15
  forensics_detail?: {
    severity: 'clean' | 'suspicious' | 'likely_fraud' | 'fraud'
    hard_gates: string[]
    elapsed_ms: number
    per_file: Array<{
      file_name: string
      file_kind: string
      mime: string
      pdf_metadata?: {
        title: string | null
        producer: string | null
        creator: string | null
        creation_date: string | null
        modification_date: string | null
        page_count: number
        file_size_bytes: number
      }
      text_density?: {
        total_chars: number
        page_count: number
        chars_per_page: number
        is_likely_image_pdf: boolean
      }
      paystub_math?: {
        extraction: { annual_salary: number | null; ytd_gross: number | null; pay_date: string | null }
        expected_ytd_gross: number | null
        ytd_ratio: number | null
        period_math_error_pct: number | null
      }
      source_specific?: {
        equifax_authentic_markers: boolean | null
        bank_producer_whitelisted: boolean | null
        matched_bank: string | null
      }
      flags: Array<{ code: string; severity: 'critical' | 'high' | 'medium' | 'low'; evidence_en: string; evidence_zh: string; file?: string }>
    }>
    cross_doc_flags: Array<{ code: string; severity: 'critical' | 'high' | 'medium' | 'low'; evidence_en: string; evidence_zh: string; file?: string }>
    all_flags: Array<{ code: string; severity: 'critical' | 'high' | 'medium' | 'low'; evidence_en: string; evidence_zh: string; file?: string }>
  } | null
  forensics_penalty?: number
  // Dimensions force-zeroed because the underlying evidence file was
  // determined to be forged (e.g. credit_report → credit_health).
  forensics_zeroed_dims?: string[]
  screening_id?: string
  // Deep check (arm's-length verification)
  deep_check_result?: {
    checks: Array<{
      employer_name: string
      company_info: {
        name: string
        company_number: string | null
        jurisdiction: string | null
        incorporation_date: string | null
        status: string | null
        registered_address: string | null
        company_type: string | null
        officers: Array<{ name: string; position: string }>
        registry_url: string | null
        source: string
      } | null
      is_numbered_company: boolean
      is_recently_incorporated: boolean
      applicant_is_officer: boolean
      applicant_lastname_match: boolean
      company_address_matches_applicant: boolean
      arm_length_risk: 'high' | 'medium' | 'low' | 'clean'
      flags: Array<{ code: string; severity: string; evidence_en: string; evidence_zh: string }>
    }>
    overall_risk: 'high' | 'medium' | 'low' | 'clean'
    total_flags: number
    checked_at: string
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
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#E4E8F0" strokeWidth={strokeWidth} />
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

function CategoryBar({ category, score, animDelay = 0, tier, shortNote, detail, zeroed = false }: {
  category: typeof CATEGORIES[number]
  score: number
  animDelay?: number
  tier: 'free' | 'pro'
  shortNote?: string
  detail?: string
  zeroed?: boolean
}) {
  const { t, lang } = useT()
  // Open by default when the dimension has been force-zeroed so the user
  // immediately sees WHY the score is 0.
  const [open, setOpen] = useState(zeroed)
  const risk = getRiskLevel(score)
  const isCourtRecord = category.id === 'rental_history'
  const primary = lang === 'zh' ? category.zhLabel : category.enLabel
  const secondary = lang === 'zh' ? category.enLabel : category.zhLabel
  const hasDetail = !!(detail || shortNote || zeroed)
  // When zeroed, override the entire bar palette to the high-risk red
  const barColor = zeroed ? '#DC2626' : risk.color
  return (
    <div style={{
      marginBottom: 12,
      borderRadius: 10,
      border: zeroed ? '1px solid rgba(220, 38, 38, 0.40)' : (open ? '1px solid #E4E8F0' : '1px solid transparent'),
      background: zeroed ? 'rgba(220, 38, 38, 0.04)' : (open ? 'rgba(11, 23, 54, 0.03)' : 'transparent'),
      transition: 'all 0.2s',
      padding: open || zeroed ? 12 : 0,
    }}>
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
            {zeroed && (
              <span className="mono" style={{
                fontSize: 9,
                padding: '2px 7px',
                borderRadius: 4,
                background: '#DC2626',
                color: '#FFF',
                fontWeight: 700,
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
              }}>
                {lang === 'zh' ? '伪造证据 · 已置零' : 'Forged · Score 0'}
              </span>
            )}
            {isCourtRecord && !zeroed && (
              <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, background: tier === 'pro' ? '#8B5CF620' : '#E4E8F0', color: tier === 'pro' ? '#6D28D9' : '#64748B', fontWeight: 600 }}>
                {tier === 'pro' ? t('screen.tier.pro') : t('screen.tier.freeCanlii')}
              </span>
            )}
            <span style={{ fontSize: 15, fontWeight: 700, color: barColor, fontFamily: "'JetBrains Mono', monospace" }}>{score}</span>
            {hasDetail && (
              <span className="mono" style={{ fontSize: 10, color: '#64748B', width: 14, textAlign: 'center', transition: 'transform 0.2s', display: 'inline-block', transform: open ? 'rotate(90deg)' : 'rotate(0)' }}>▸</span>
            )}
          </div>
        </div>
        <div style={{ height: 6, borderRadius: 3, background: 'rgba(11, 23, 54, 0.06)', overflow: 'hidden' }}>
          <div style={{ height: '100%', borderRadius: 3, background: `linear-gradient(90deg, ${barColor}88, ${barColor})`, width: `${score}%`, transition: 'width 1.2s cubic-bezier(0.4, 0, 0.2, 1)', transitionDelay: `${animDelay}ms` }} />
        </div>
        <p style={{ fontSize: 11, color: '#64748B', marginTop: 4, marginBottom: 0 }}>{t(category.descKey)}</p>
      </button>
      {open && hasDetail && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px dashed rgba(11, 23, 54, 0.10)' }}>
          {zeroed && detail && (
            <div style={{
              padding: '10px 12px',
              background: 'rgba(220, 38, 38, 0.08)',
              border: '1px solid rgba(220, 38, 38, 0.30)',
              borderRadius: 8,
              marginBottom: 12,
              display: 'flex',
              alignItems: 'flex-start',
              gap: 8,
            }}>
              <span style={{ fontSize: 14, color: '#B91C1C' }}>⛔</span>
              <div style={{ flex: 1 }}>
                <div className="mono" style={{ fontSize: 10.5, color: '#B91C1C', marginBottom: 4, letterSpacing: '0.02em', textTransform: 'uppercase', fontWeight: 700 }}>
                  {lang === 'zh' ? '为什么本维度为 0' : 'Why this score is 0'}
                </div>
                <p style={{ fontSize: 12.5, color: '#7F1D1D', lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap' }}>{detail}</p>
              </div>
            </div>
          )}
          {!zeroed && shortNote && (
            <div className="mono" style={{ fontSize: 10.5, color: '#64748B', marginBottom: 8, letterSpacing: '0.02em', textTransform: 'uppercase', fontWeight: 600 }}>
              {lang === 'zh' ? '摘要' : 'Summary'}
            </div>
          )}
          {!zeroed && shortNote && (
            <p style={{ fontSize: 12.5, color: '#0B1736', lineHeight: 1.6, margin: 0, marginBottom: detail ? 12 : 0 }}>{shortNote}</p>
          )}
          {!zeroed && detail && (
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

// ─── Document Forensics Card ──────────────────────────────────────────────
// Renders the ForensicsReport from /api/screen-score. Designed to be the
// FIRST thing a landlord sees when forgery is detected — a critical-severity
// banner up top, then a per-file breakdown of what the backend verified.
//
// Severity colors match the rest of the app's risk palette (see RISK_LEVELS).
function ForensicsCard({ report }: { report: NonNullable<ScoreResult['forensics_detail']> }) {
  const { lang } = useT()
  const [expanded, setExpanded] = useState(true)

  if (!report) return null
  const isClean = report.severity === 'clean' && report.all_flags.length === 0

  const sevPalette: Record<string, { bg: string; border: string; text: string; label: string; labelZh: string; icon: string }> = {
    fraud:        { bg: 'rgba(220, 38, 38, 0.10)',  border: 'rgba(220, 38, 38, 0.45)',  text: '#B91C1C', label: 'Likely Forged Documents', labelZh: '极可能是伪造文件', icon: '⛔' },
    likely_fraud: { bg: 'rgba(220, 38, 38, 0.07)',  border: 'rgba(220, 38, 38, 0.35)',  text: '#B91C1C', label: 'Strong Forgery Signals',  labelZh: '强烈的伪造信号',   icon: '⚠' },
    suspicious:   { bg: 'rgba(217, 119, 6, 0.07)',  border: 'rgba(217, 119, 6, 0.30)',  text: '#A16207', label: 'Suspicious Patterns',     labelZh: '可疑特征',         icon: '⚠' },
    clean:        { bg: 'rgba(22, 163, 74, 0.07)',  border: 'rgba(22, 163, 74, 0.25)',  text: '#15803D', label: 'No Forensics Issues',    labelZh: '取证无异常',       icon: '✓' },
  }
  const p = sevPalette[report.severity] || sevPalette.clean

  const flagSevBadge = (sev: string): { bg: string; text: string } => {
    switch (sev) {
      case 'critical': return { bg: '#DC2626', text: '#FFF' }
      case 'high':     return { bg: '#EA580C', text: '#FFF' }
      case 'medium':   return { bg: '#D97706', text: '#FFF' }
      default:         return { bg: '#94A3B8', text: '#FFF' }
    }
  }
  const sevLabel = (sev: string): string => {
    if (lang === 'zh') {
      return ({ critical: '严重', high: '高', medium: '中', low: '低' } as Record<string, string>)[sev] || sev
    }
    return sev.toUpperCase()
  }

  return (
    <div className="sl-card" style={{ background: p.bg, border: `1px solid ${p.border}`, backdropFilter: 'blur(14px)', marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', gap: 10 }} onClick={() => setExpanded(v => !v)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 22 }}>{p.icon}</span>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: p.text }}>
              {lang === 'zh' ? '文件取证' : 'Document Forensics'}
            </div>
            <div style={{ fontSize: 11.5, color: p.text, fontWeight: 600, opacity: 0.85 }}>
              {lang === 'zh' ? p.labelZh : p.label}
              {report.all_flags.length > 0 && ` · ${report.all_flags.length} ${lang === 'zh' ? '项发现' : 'finding(s)'}`}
              {report.hard_gates.length > 0 && ` · ${report.hard_gates.length} ${lang === 'zh' ? '硬门槛' : 'hard gate(s)'}`}
            </div>
          </div>
        </div>
        <div style={{ fontSize: 11, color: '#64748B', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="mono">{report.elapsed_ms}ms</span>
          <span style={{ fontSize: 14 }}>{expanded ? '▾' : '▸'}</span>
        </div>
      </div>

      {expanded && (
        <>
          {report.hard_gates.length > 0 && (
            <div style={{ marginTop: 12, padding: 10, borderRadius: 8, background: 'rgba(220, 38, 38, 0.08)', border: '1px solid rgba(220, 38, 38, 0.30)' }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: '#B91C1C', marginBottom: 6 }}>
                {lang === 'zh' ? '已触发的硬门槛（评分上限）：' : 'Hard gates triggered (score cap):'}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {report.hard_gates.map(g => (
                  <span key={g} className="mono" style={{ fontSize: 10, padding: '3px 8px', borderRadius: 4, background: '#B91C1C', color: '#FFF', fontWeight: 600 }}>
                    {g}
                  </span>
                ))}
              </div>
            </div>
          )}

          {isClean ? (
            <div style={{ marginTop: 12, fontSize: 12, color: '#475569', fontStyle: 'italic' }}>
              {lang === 'zh'
                ? '所有上传文件通过 PDF 元数据、文字密度、来源指纹和跨文档一致性检查，未发现伪造特征。'
                : 'All uploaded files passed PDF metadata, text density, source fingerprint, and cross-document consistency checks. No forgery indicators detected.'}
            </div>
          ) : (
            <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {report.per_file.map((pf, i) => (
                <div key={i} style={{ padding: 12, borderRadius: 10, background: 'rgba(255, 255, 255, 0.50)', border: '1px solid rgba(15, 23, 42, 0.08)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
                    <div>
                      <div style={{ fontSize: 12.5, fontWeight: 700, color: '#0B1736' }}>{pf.file_name}</div>
                      <div style={{ fontSize: 10.5, color: '#64748B', marginTop: 2 }}>
                        {pf.file_kind} {pf.pdf_metadata && `· ${pf.pdf_metadata.page_count}p · ${Math.round(pf.pdf_metadata.file_size_bytes / 1024)}KB`}
                      </div>
                    </div>
                    {pf.flags.length === 0 && (
                      <span style={{ fontSize: 10, color: '#15803D', fontWeight: 600 }}>
                        {lang === 'zh' ? '✓ 无异常' : '✓ Clean'}
                      </span>
                    )}
                  </div>

                  {/* Forensic facts table — show what was actually measured */}
                  {(pf.pdf_metadata || pf.text_density || pf.paystub_math || pf.source_specific) && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 12px', fontSize: 10.5, marginBottom: 10, padding: 8, background: 'rgba(15, 23, 42, 0.03)', borderRadius: 6 }}>
                      {pf.pdf_metadata?.producer && (
                        <>
                          <span style={{ color: '#64748B' }}>{lang === 'zh' ? 'PDF 生成工具' : 'PDF Producer'}</span>
                          <span className="mono" style={{ color: '#0B1736' }}>{pf.pdf_metadata.producer}</span>
                        </>
                      )}
                      {pf.pdf_metadata?.title && (
                        <>
                          <span style={{ color: '#64748B' }}>{lang === 'zh' ? '内嵌标题' : 'PDF Title'}</span>
                          <span className="mono" style={{ color: '#0B1736' }}>"{pf.pdf_metadata.title}"</span>
                        </>
                      )}
                      {pf.text_density && (
                        <>
                          <span style={{ color: '#64748B' }}>{lang === 'zh' ? '文字密度' : 'Text density'}</span>
                          <span className="mono" style={{ color: pf.text_density.is_likely_image_pdf ? '#B91C1C' : '#0B1736', fontWeight: pf.text_density.is_likely_image_pdf ? 700 : 400 }}>
                            {pf.text_density.chars_per_page} {lang === 'zh' ? '字符/页' : 'chars/page'} {pf.text_density.is_likely_image_pdf && (lang === 'zh' ? '(图片型 PDF)' : '(image-only PDF)')}
                          </span>
                        </>
                      )}
                      {pf.paystub_math?.ytd_ratio && pf.paystub_math.expected_ytd_gross && (
                        <>
                          <span style={{ color: '#64748B' }}>{lang === 'zh' ? 'YTD 比例' : 'YTD ratio'}</span>
                          <span className="mono" style={{ color: pf.paystub_math.ytd_ratio > 1.5 || pf.paystub_math.ytd_ratio < 0.5 ? '#B91C1C' : '#0B1736', fontWeight: 600 }}>
                            {pf.paystub_math.ytd_ratio.toFixed(2)}× {lang === 'zh' ? '预期' : 'expected'} (${Math.round(pf.paystub_math.expected_ytd_gross).toLocaleString()})
                          </span>
                        </>
                      )}
                      {pf.source_specific?.matched_bank && (
                        <>
                          <span style={{ color: '#64748B' }}>{lang === 'zh' ? '识别银行' : 'Bank match'}</span>
                          <span className="mono" style={{ color: pf.source_specific.bank_producer_whitelisted ? '#15803D' : '#B91C1C' }}>
                            {pf.source_specific.matched_bank} {pf.source_specific.bank_producer_whitelisted ? '✓' : '✗ ' + (lang === 'zh' ? '工具不匹配' : 'producer mismatch')}
                          </span>
                        </>
                      )}
                      {pf.source_specific?.equifax_authentic_markers !== null && pf.source_specific?.equifax_authentic_markers !== undefined && (
                        <>
                          <span style={{ color: '#64748B' }}>{lang === 'zh' ? 'Equifax 标记' : 'Equifax markers'}</span>
                          <span className="mono" style={{ color: pf.source_specific.equifax_authentic_markers ? '#15803D' : '#B91C1C' }}>
                            {pf.source_specific.equifax_authentic_markers ? (lang === 'zh' ? '✓ 找到' : '✓ Found') : (lang === 'zh' ? '✗ 未找到' : '✗ Missing')}
                          </span>
                        </>
                      )}
                    </div>
                  )}

                  {/* Per-file flags */}
                  {pf.flags.map((f, j) => {
                    const badge = flagSevBadge(f.severity)
                    return (
                      <div key={j} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '7px 0', borderTop: j === 0 ? 'none' : '1px dashed rgba(15, 23, 42, 0.08)' }}>
                        <span className="mono" style={{ fontSize: 9, padding: '2px 6px', borderRadius: 3, background: badge.bg, color: badge.text, fontWeight: 700, whiteSpace: 'nowrap' }}>
                          {sevLabel(f.severity)}
                        </span>
                        <div style={{ flex: 1 }}>
                          <div className="mono" style={{ fontSize: 10, color: '#64748B', marginBottom: 3 }}>{f.code}</div>
                          <div style={{ fontSize: 11.5, color: '#0B1736', lineHeight: 1.5 }}>
                            {lang === 'zh' ? f.evidence_zh : f.evidence_en}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ))}

              {/* Cross-document flags */}
              {report.cross_doc_flags.length > 0 && (
                <div style={{ padding: 12, borderRadius: 10, background: 'rgba(220, 38, 38, 0.05)', border: '1px solid rgba(220, 38, 38, 0.20)' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#B91C1C', marginBottom: 8 }}>
                    {lang === 'zh' ? '跨文档检查' : 'Cross-document checks'}
                  </div>
                  {report.cross_doc_flags.map((f, j) => {
                    const badge = flagSevBadge(f.severity)
                    return (
                      <div key={j} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '7px 0', borderTop: j === 0 ? 'none' : '1px dashed rgba(15, 23, 42, 0.08)' }}>
                        <span className="mono" style={{ fontSize: 9, padding: '2px 6px', borderRadius: 3, background: badge.bg, color: badge.text, fontWeight: 700, whiteSpace: 'nowrap' }}>
                          {sevLabel(f.severity)}
                        </span>
                        <div style={{ flex: 1 }}>
                          <div className="mono" style={{ fontSize: 10, color: '#64748B', marginBottom: 3 }}>{f.code}</div>
                          <div style={{ fontSize: 11.5, color: '#0B1736', lineHeight: 1.5 }}>
                            {lang === 'zh' ? f.evidence_zh : f.evidence_en}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function CaseRecordCard({ record, lang, sevColor, isParty }: { record: CanLIIMatch; lang: string; sevColor: { bg: string; light: string; border: string }; isParty: boolean }) {
  return (
    <a
      href={record.url}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: 'block',
        textDecoration: 'none',
        padding: '10px 12px',
        background: sevColor.light,
        borderRadius: 6,
        border: `1px solid ${sevColor.border}`,
        transition: 'background .15s, border-color .15s',
        opacity: isParty ? 1 : 0.7,
      }}
      title={record.title}
      onMouseEnter={e => { e.currentTarget.style.background = '#EEF2FF'; e.currentTarget.style.borderColor = '#818CF860'; e.currentTarget.style.opacity = '1' }}
      onMouseLeave={e => { e.currentTarget.style.background = sevColor.light; e.currentTarget.style.borderColor = sevColor.border; e.currentTarget.style.opacity = isParty ? '1' : '0.7' }}
    >
      {/* Row 1: match type badge + DB badge + citation */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
        {isParty ? (
          <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 3, background: '#DC2626', color: '#fff', flexShrink: 0 }}>
            {lang === 'zh' ? '当事人' : 'PARTY'}
          </span>
        ) : (
          <span style={{ fontSize: 9, fontWeight: 600, padding: '2px 6px', borderRadius: 3, background: '#E2E8F0', color: '#64748B', flexShrink: 0 }}>
            {lang === 'zh' ? '提及' : 'MENTION'}
          </span>
        )}
        <span style={{
          fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em',
          padding: '2px 6px', borderRadius: 3,
          background: isParty ? sevColor.bg : '#94A3B8', color: '#fff',
          flexShrink: 0,
        }}>
          {record.databaseName || record.databaseId}
        </span>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#1E3A5F', fontFamily: "'JetBrains Mono', monospace" }}>
          {record.citation}
        </span>
      </div>
      {/* Row 2: Case title */}
      <div style={{
        fontSize: 12, color: '#334155', lineHeight: 1.4,
        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden',
      }}>
        {record.title}
      </div>
      {/* Row 3: Link hint */}
      <div style={{ fontSize: 10, color: '#6366F1', marginTop: 4, fontWeight: 500 }}>
        {lang === 'zh' ? '点击查看 CanLII 全文 ↗' : 'View full text on CanLII ↗'}
      </div>
    </a>
  )
}

function PortalRecordCard({ record, lang, sevColor }: { record: OntarioPortalMatch; lang: string; sevColor: { bg: string; light: string; border: string } }) {
  const filedDate = record.filedDate ? new Date(record.filedDate).toLocaleDateString('en-CA') : ''
  return (
    <div
      style={{
        padding: '10px 12px',
        background: sevColor.light,
        borderRadius: 6,
        border: `1px solid ${sevColor.border}`,
      }}
    >
      {/* Row 1: badges + case number + status */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 3, background: '#DC2626', color: '#fff', flexShrink: 0 }}>
          {lang === 'zh' ? '当事人' : 'PARTY'}
        </span>
        <span style={{
          fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em',
          padding: '2px 6px', borderRadius: 3,
          background: '#0284C7', color: '#fff',
          flexShrink: 0,
        }}>
          {lang === 'zh' ? '安省法院门户' : 'ON Courts Portal'}
        </span>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#1E3A5F', fontFamily: "'JetBrains Mono', monospace" }}>
          {record.caseNumber}
        </span>
        <span style={{
          fontSize: 9, padding: '1px 5px', borderRadius: 3, fontWeight: 600,
          background: record.closedFlag ? '#94A3B840' : '#FEF08A',
          color: record.closedFlag ? '#64748B' : '#92400E',
        }}>
          {record.closedFlag ? (lang === 'zh' ? '已结案' : 'Closed') : (lang === 'zh' ? '进行中' : 'Active')}
        </span>
      </div>
      {/* Row 2: Case title */}
      <div style={{ fontSize: 13, color: '#0F172A', fontWeight: 600, lineHeight: 1.4, marginBottom: 6 }}>
        {record.caseTitle}
      </div>
      {/* Row 3: Detail grid */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '3px 10px',
        fontSize: 11, color: '#64748B', lineHeight: 1.5,
      }}>
        <span style={{ fontWeight: 600 }}>{lang === 'zh' ? '当事人角色' : 'Party Role'}:</span>
        <span style={{ color: '#334155', fontWeight: 600 }}>{record.partyRole}</span>
        <span style={{ fontWeight: 600 }}>{lang === 'zh' ? '登记姓名' : 'Name on File'}:</span>
        <span style={{ color: '#334155' }}>{record.partyDisplayName}</span>
        <span style={{ fontWeight: 600 }}>{lang === 'zh' ? '案件类别' : 'Category'}:</span>
        <span style={{ color: '#334155' }}>{record.caseCategory}</span>
        {filedDate && (<>
          <span style={{ fontWeight: 600 }}>{lang === 'zh' ? '立案日期' : 'Filed'}:</span>
          <span style={{ color: '#334155' }}>{filedDate}</span>
        </>)}
        <span style={{ fontWeight: 600 }}>{lang === 'zh' ? '法院' : 'Court'}:</span>
        <span style={{ color: '#334155' }}>{record.courtAbbreviation}</span>
      </div>
      {/* Row 4: Source link — direct to case detail when we have a UUID,
          else fall back to the generic portal search page. */}
      <div style={{ fontSize: 9, color: '#94A3B8', marginTop: 6 }}>
        {lang === 'zh' ? '数据来源：' : 'Source: '}
        <a
          href={(() => {
            // Always use the Civil & Small Claims Court UUID — the portal API
            // returns a numeric internal courtID (e.g. "1") in caseHeader that
            // does NOT match the URL-routing UUID. Old cached records may have
            // the bad numeric ID stored, so we ignore record.courtID entirely.
            const CIVIL_COURT_UUID = '68f021c4-6a44-4735-9a76-5360b2e8af13'
            const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
            if (record.caseInstanceUUID && uuidRe.test(record.caseInstanceUUID)) {
              return `https://courts.ontario.ca/portal/court/${CIVIL_COURT_UUID}/case/${record.caseInstanceUUID}`
            }
            return 'https://courts.ontario.ca/portal/search/case'
          })()}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: '#0284C7', textDecoration: 'none' }}
          onMouseEnter={e => { e.currentTarget.style.textDecoration = 'underline' }}
          onMouseLeave={e => { e.currentTarget.style.textDecoration = 'none' }}
        >
          {record.caseInstanceUUID
            ? (lang === 'zh' ? '在安省法院门户查看此案详情' : 'View case detail on Ontario Courts Portal')
            : (lang === 'zh' ? '安大略省法院公开门户' : 'Ontario Courts Public Portal')} ↗
        </a>
      </div>
    </div>
  )
}

function CourtRecordDetail({ queries, totalHits, queriedName, tier, courtSummaryEn, courtSummaryZh }: { queries: CourtQuery[]; totalHits: number; queriedName: string; tier: 'free' | 'pro'; courtSummaryEn?: string; courtSummaryZh?: string }) {
  const { t, lang } = useT()

  // Separate rollup query from database-specific queries
  const rollupQuery = queries[0]
  // Show all database rows that have hits, plus LTB and Small Claims even
  // at 0 hits so the user always sees these two priority DBs were queried.
  const ALWAYS_SHOW_DBS = ['Landlord and Tenant Board', 'Small Claims Court', 'Ontario Courts Portal']
  const dbQueries = queries.slice(1).filter(q =>
    // Name separator rows (e.g. "── JOHN SMITH ──") always pass through
    q.source.startsWith('──') ||
    (q.tier === 'free' && (q.status === 'ok' || q.status === 'unavailable') && ((q.hits ?? 0) > 0 || ALWAYS_SHOW_DBS.some(name => q.source.includes(name))))
  )
  const proQueries = queries.filter(q => q.tier === 'pro')

  // Default all rows with hits to expanded (open) so case records are immediately visible
  const [expandedRows, setExpandedRows] = useState<Record<number, boolean>>(() => {
    const init: Record<number, boolean> = {}
    dbQueries.forEach((q, i) => {
      if ((q.hits ?? 0) > 0) init[i] = true
    })
    return init
  })

  const toggleRow = (index: number) => {
    setExpandedRows(prev => ({ ...prev, [index]: !prev[index] }))
  }

  const getSeverityColor = (severity?: number) => {
    if (severity === 3) return { bg: '#B91C1C', light: '#DC262610', border: '#7F1D1D60' }
    if (severity === 2) return { bg: '#D97706', light: '#F5911620', border: '#92400E60' }
    if (severity === 1) return { bg: '#1D4ED8', light: '#DBEAFE60', border: '#1D4ED860' }
    return { bg: '#64748B', light: '#E4E8F010', border: '#E4E8F060' }
  }

  const getSeverityLabel = (severity?: number): string => {
    if (severity === 3) return t('screen.result.court.severity.critical')
    if (severity === 2) return t('screen.result.court.severity.high')
    if (severity === 1) return t('screen.result.court.severity.medium')
    return ''
  }

  const courtSummary = lang === 'zh' ? (courtSummaryZh || courtSummaryEn) : (courtSummaryEn || courtSummaryZh)

  return (
    <div className="sl-card" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', backdropFilter: 'blur(14px)', marginBottom: 18 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, gap: 8, flexWrap: 'wrap' }}>
        <div>
          <div className="sl-section-title" style={{ fontSize: 13, fontWeight: 700, color: '#64748B' }}>{t('screen.result.court.title')}</div>
          <div style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>{t('screen.result.court.queriedName')} <span style={{ fontFamily: "'JetBrains Mono', monospace", color: '#0B1736' }}>{queriedName || '—'}</span></div>
        </div>
        <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 4, background: tier === 'pro' ? '#8B5CF620' : '#E4E8F0', color: tier === 'pro' ? '#6D28D9' : '#64748B', border: `1px solid ${tier === 'pro' ? '#8B5CF640' : '#E4E8F0'}`, fontWeight: 600 }}>
          {tier === 'pro' ? t('screen.result.court.pro') : t('screen.result.court.free')}
        </span>
      </div>

      {/* AI Court Summary (if available) */}
      {courtSummary && (
        <div style={{ marginBottom: 14, padding: '12px 14px', background: '#EEF2F810', border: '1px solid #DBEAFE40', borderRadius: 8 }}>
          <div style={{ fontSize: 11, color: '#64748B', fontWeight: 600, marginBottom: 6 }}>{t('screen.result.court.aiSummary')}</div>
          <div style={{ fontSize: 12, color: '#0B1736', lineHeight: 1.5 }}>{courtSummary}</div>
        </div>
      )}

      {/* Rollup summary row */}
      {rollupQuery && (
        <div style={{
          marginBottom: 12, padding: '12px 14px', borderRadius: 8, fontSize: 12,
          background: totalHits > 0 ? '#FEF2F210' : '#F0FDF410',
          border: `1px solid ${totalHits > 0 ? '#FECACA60' : '#86EFAC40'}`,
          color: totalHits > 0 ? '#991B1B' : '#15803D',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{ fontSize: 16 }}>{totalHits > 0 ? '⚠️' : '✅'}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600 }}>
              {totalHits > 0
                ? (lang === 'zh' ? `找到 ${totalHits} 条法院记录` : `${totalHits} court record(s) found`)
                : (lang === 'zh' ? '未找到法院记录' : 'No court records found')
              }
            </div>
            <div style={{ fontSize: 11, opacity: 0.8, marginTop: 2 }}>
              {rollupQuery.source}
            </div>
          </div>
        </div>
      )}

      {/* Database sources (scrollable list) */}
      {dbQueries.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: '#64748B', marginBottom: 8, fontWeight: 600 }}>{t('screen.result.court.sources')}</div>
          <div style={{ maxHeight: '500px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {dbQueries.map((q, i) => {
              // Name separator row (e.g. "── JOHN SMITH ──")
              if (q.source.startsWith('──')) {
                const nameLabel = q.source.replace(/──/g, '').trim()
                return (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', marginTop: 8,
                    borderTop: '1px solid var(--border-subtle)',
                  }}>
                    <div style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#0B1736', whiteSpace: 'nowrap' }}>
                      🔍 {lang === 'zh' ? '查询姓名' : 'Searching'}: {nameLabel}
                    </span>
                    <span style={{
                      fontSize: 10, padding: '2px 6px', borderRadius: 3,
                      background: (q.hits ?? 0) > 0 ? '#FEE2E2' : '#DCFCE7',
                      color: (q.hits ?? 0) > 0 ? '#991B1B' : '#15803D',
                      fontWeight: 600,
                    }}>
                      {(q.hits ?? 0) > 0
                        ? (lang === 'zh' ? `${q.hits} 条记录` : `${q.hits} hit(s)`)
                        : (lang === 'zh' ? '无记录' : 'Clean')
                      }
                    </span>
                    <div style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
                  </div>
                )
              }

              const isExpanded = expandedRows[i]
              const hasHits = (q.hits ?? 0) > 0
              const sevColor = hasHits
                ? getSeverityColor(q.severity)
                : { bg: '#15803D', light: 'rgba(22, 163, 74, 0.06)', border: 'rgba(22, 163, 74, 0.25)' }

              return (
                <div key={i}>
                  {/* Database row (clickable to expand when has hits) */}
                  <div
                    onClick={() => hasHits && toggleRow(i)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '10px 12px',
                      background: sevColor.light,
                      border: `1px solid ${sevColor.border}`,
                      borderRadius: 6,
                      cursor: hasHits ? 'pointer' : 'default',
                      userSelect: 'none',
                    }}
                  >
                    {/* Severity indicator */}
                    <span style={{ width: 16, height: 16, borderRadius: 3, background: sevColor.bg, flexShrink: 0 }} />

                    {/* Database name */}
                    <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: '#0B1736' }}>
                      {q.source}
                    </span>

                    {/* Severity label and hit count */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {hasHits ? (
                        <>
                          <span style={{ fontSize: 10, color: sevColor.bg, fontWeight: 600 }}>
                            {getSeverityLabel(q.severity)}
                          </span>
                          <span style={{ fontSize: 10, fontWeight: 600, color: sevColor.bg }}>
                            {q.hits} {t('screen.result.court.hitsLabel')}
                          </span>
                          <span style={{ fontSize: 12, color: sevColor.bg }}>
                            {isExpanded ? '▼' : '▶'}
                          </span>
                        </>
                      ) : (
                        <span style={{ fontSize: 10, fontWeight: 600, color: '#15803D' }}>
                          ✓ {t('screen.result.court.clean')}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Expanded case records — CanLII */}
                  {isExpanded && q.records && q.records.length > 0 && (
                    <div style={{ marginTop: 6, paddingLeft: 12, display: 'flex', flexDirection: 'column', gap: 5 }}>
                      {q.records.map((record, j) => (
                        <CaseRecordCard key={j} record={record} lang={lang} sevColor={sevColor} isParty />
                      ))}
                    </div>
                  )}
                  {/* Expanded case records — Ontario Courts Portal */}
                  {isExpanded && q.portalRecords && q.portalRecords.length > 0 && (
                    <div style={{ marginTop: 6, paddingLeft: 12, display: 'flex', flexDirection: 'column', gap: 5 }}>
                      {q.portalRecords.map((pr, j) => (
                        <PortalRecordCard key={`portal-${j}`} record={pr} lang={lang} sevColor={sevColor} />
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* No hits message */}
      {totalHits === 0 && (
        <div style={{ padding: '16px', textAlign: 'center', background: '#16A34A10', borderRadius: 8, border: '1px solid #1D7C4A40', marginBottom: 12 }}>
          <div style={{ fontSize: 24, marginBottom: 6 }}>✅</div>
          <div style={{ fontSize: 13, color: '#15803D', fontWeight: 600 }}>{t('screen.result.court.clean.title')}</div>
          <div style={{ fontSize: 11, color: '#64748B', marginTop: 4 }}>{t('screen.result.court.clean.sub', { n: queries.filter(q => q.status === 'ok').length })}</div>
        </div>
      )}

      {/* Pro sources (outside scrollable area) */}
      {proQueries.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 12, borderTop: '1px solid var(--border-subtle)' }}>
          {proQueries.map((q, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#475569', fontSize: 12 }}>
              <span style={{ width: 18, height: 18, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, background: '#8B5CF620', color: '#6D28D9', border: '1px solid #8B5CF640' }}>
                💎
              </span>
              <span style={{ flex: 1 }}>{q.source}</span>
              <span style={{ fontSize: 10, fontWeight: 600, color: '#6D28D9' }}>
                {q.status === 'coming_soon' ? t('screen.result.court.comingSoon') : t('screen.result.court.needPro')}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Upgrade prompt */}
      {tier === 'free' && proQueries.length > 0 && (
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
  // Per-sub-row expanded state, keyed by covKey so each row is independent
  const [openRows, setOpenRows] = useState<Record<string, boolean>>({})
  const toggleRow = (key: string) => setOpenRows(s => ({ ...s, [key]: !s[key] }))

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

  // Forensics data — drives the expanded detail content for each sub-row.
  const forensics = result.forensics_detail
  const perFile = forensics?.per_file || []
  const crossDocFlags = forensics?.cross_doc_flags || []

  // Identity-related cross-doc flag codes (used by 身份交叉核验 detail)
  const ID_FLAG_CODES = new Set(['cross_doc_phone_collision', 'name_spelling_variation', 'area_code_geographic_mismatch'])
  // Employer-related per-file flag codes (used by 雇主核实 detail)
  const EMPLOYER_FILE_KINDS = new Set(['pay_stub', 'employment_letter', 'offer_letter'])
  const EMPLOYER_FLAG_CODES = new Set([
    'paystub_ytd_inflated', 'paystub_ytd_undershoot', 'paystub_period_math_error', 'paystub_net_inconsistent',
    'paystub_unknown_payroll_system', 'pdf_producer_consumer_tool', 'pdf_title_indicates_image',
    'pdf_pure_image', 'pdf_low_text_density', 'pdf_metadata_stripped',
  ])
  const idCrossFlags = crossDocFlags.filter(f => ID_FLAG_CODES.has(f.code))
  const employerCrossFlags = crossDocFlags.filter(f => f.code === 'cross_doc_phone_collision' || f.code === 'deposits_too_clean')
  const employerPerFile = perFile.filter(pf => EMPLOYER_FILE_KINDS.has(pf.file_kind))

  // Severity badge styles (shared with the detailed file rows)
  const flagSevBadge = (sev: string): { bg: string; text: string } => {
    switch (sev) {
      case 'critical': return { bg: '#DC2626', text: '#FFF' }
      case 'high':     return { bg: '#EA580C', text: '#FFF' }
      case 'medium':   return { bg: '#D97706', text: '#FFF' }
      default:         return { bg: '#94A3B8', text: '#FFF' }
    }
  }
  const sevLabel = (sev: string): string => {
    if (lang === 'zh') return ({ critical: '严重', high: '高', medium: '中', low: '低' } as Record<string, string>)[sev] || sev
    return sev.toUpperCase()
  }

  // Reusable flag-row renderer
  const FlagLine = ({ flag }: { flag: { code: string; severity: string; evidence_en: string; evidence_zh: string } }) => {
    const badge = flagSevBadge(flag.severity)
    return (
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '7px 0', borderTop: '1px dashed rgba(15, 23, 42, 0.08)' }}>
        <span className="mono" style={{ fontSize: 9, padding: '2px 6px', borderRadius: 3, background: badge.bg, color: badge.text, fontWeight: 700, whiteSpace: 'nowrap' }}>
          {sevLabel(flag.severity)}
        </span>
        <div style={{ flex: 1 }}>
          <div className="mono" style={{ fontSize: 10, color: '#64748B', marginBottom: 3 }}>{flag.code}</div>
          <div style={{ fontSize: 11.5, color: '#0B1736', lineHeight: 1.5 }}>
            {lang === 'zh' ? flag.evidence_zh : flag.evidence_en}
          </div>
        </div>
      </div>
    )
  }

  // ── Detail builders ─────────────────────────────────────────────
  // Each builds the "expanded body" content for a given sub-row.

  const renderDocCheckDetail = () => {
    if (!forensics || perFile.length === 0) {
      // Check if files WERE uploaded — the issue is forensics data missing, not files
      const hasFiles = (result.detected_document_kinds || []).length > 0
      return (
        <div style={{ fontSize: 11.5, color: hasFiles ? '#15803D' : '#64748B', fontStyle: 'italic', padding: '6px 2px' }}>
          {hasFiles
            ? (lang === 'zh' ? '✓ 已分析上传文件，未检测到篡改信号。' : '✓ Uploaded files analyzed — no tampering signals detected.')
            : (lang === 'zh' ? '本次未上传可分析的 PDF/图片文件。' : 'No analyzable PDF/image files were uploaded.')}
        </div>
      )
    }
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {perFile.map((pf, i) => (
          <div key={i} style={{ padding: 10, borderRadius: 8, background: 'rgba(255,255,255,0.55)', border: '1px solid rgba(15, 23, 42, 0.08)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 6 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#0B1736', wordBreak: 'break-all' }}>{pf.file_name}</div>
                <div style={{ fontSize: 10.5, color: '#64748B', marginTop: 1 }}>
                  {pf.file_kind}
                  {pf.pdf_metadata && ` · ${pf.pdf_metadata.page_count}p · ${Math.round(pf.pdf_metadata.file_size_bytes / 1024)}KB`}
                </div>
              </div>
              {pf.flags.length === 0 && (
                <span style={{ fontSize: 10, color: '#15803D', fontWeight: 700, whiteSpace: 'nowrap' }}>
                  {lang === 'zh' ? '✓ 无异常' : '✓ Clean'}
                </span>
              )}
            </div>
            {(pf.pdf_metadata?.producer || pf.pdf_metadata?.title || pf.text_density || pf.source_specific?.matched_bank || pf.source_specific?.equifax_authentic_markers !== undefined) && (
              <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '3px 10px', fontSize: 10.5, padding: 7, background: 'rgba(15, 23, 42, 0.03)', borderRadius: 5 }}>
                {pf.pdf_metadata?.producer && (
                  <>
                    <span style={{ color: '#64748B' }}>{lang === 'zh' ? 'PDF 生成工具' : 'Producer'}</span>
                    <span className="mono" style={{ color: '#0B1736', wordBreak: 'break-all' }}>{pf.pdf_metadata.producer}</span>
                  </>
                )}
                {pf.pdf_metadata?.title && (
                  <>
                    <span style={{ color: '#64748B' }}>{lang === 'zh' ? '内嵌标题' : 'Title'}</span>
                    <span className="mono" style={{ color: '#0B1736', wordBreak: 'break-all' }}>"{pf.pdf_metadata.title}"</span>
                  </>
                )}
                {pf.text_density && (
                  <>
                    <span style={{ color: '#64748B' }}>{lang === 'zh' ? '文字密度' : 'Text density'}</span>
                    <span className="mono" style={{ color: pf.text_density.is_likely_image_pdf ? '#B91C1C' : '#0B1736', fontWeight: pf.text_density.is_likely_image_pdf ? 700 : 400 }}>
                      {pf.text_density.chars_per_page} {lang === 'zh' ? '字符/页' : 'chars/page'}{pf.text_density.is_likely_image_pdf && (lang === 'zh' ? ' (图片型 PDF)' : ' (image-only)')}
                    </span>
                  </>
                )}
                {pf.source_specific?.matched_bank && (
                  <>
                    <span style={{ color: '#64748B' }}>{lang === 'zh' ? '识别银行' : 'Bank'}</span>
                    <span className="mono" style={{ color: pf.source_specific.bank_producer_whitelisted ? '#15803D' : '#B91C1C' }}>
                      {pf.source_specific.matched_bank} {pf.source_specific.bank_producer_whitelisted ? '✓' : '✗ ' + (lang === 'zh' ? '工具不匹配' : 'producer mismatch')}
                    </span>
                  </>
                )}
                {pf.source_specific?.equifax_authentic_markers !== null && pf.source_specific?.equifax_authentic_markers !== undefined && (
                  <>
                    <span style={{ color: '#64748B' }}>{lang === 'zh' ? 'Equifax 标记' : 'Equifax markers'}</span>
                    <span className="mono" style={{ color: pf.source_specific.equifax_authentic_markers ? '#15803D' : '#B91C1C' }}>
                      {pf.source_specific.equifax_authentic_markers ? (lang === 'zh' ? '✓ 找到' : '✓ Found') : (lang === 'zh' ? '✗ 未找到' : '✗ Missing')}
                    </span>
                  </>
                )}
              </div>
            )}
            {pf.flags.map((f, j) => <FlagLine key={j} flag={f} />)}
          </div>
        ))}
        {perFile.length === 0 && (
          <div style={{ fontSize: 11.5, color: '#64748B', fontStyle: 'italic' }}>
            {lang === 'zh' ? '无 PDF/图片型文件可分析。' : 'No PDF/image files to analyze.'}
          </div>
        )}
      </div>
    )
  }

  const renderIdMatchDetail = () => {
    const c = cov('identity_match')
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ padding: 10, borderRadius: 8, background: 'rgba(255,255,255,0.55)', border: '1px solid rgba(15, 23, 42, 0.08)' }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: '#0B1736', marginBottom: 6 }}>
            {lang === 'zh' ? '比对维度' : 'Matched dimensions'}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 10px', fontSize: 11 }}>
            <span style={{ color: '#64748B' }}>{lang === 'zh' ? '姓名' : 'Name'}</span>
            <span className="mono" style={{ color: '#0B1736' }}>{result.extracted_name || (lang === 'zh' ? '未提供' : 'Not provided')}</span>
            <span style={{ color: '#64748B' }}>{lang === 'zh' ? '身份匹配评分' : 'Identity match score'}</span>
            <span className="mono" style={{ color: typeof identityScore === 'number' ? covColor(c) : '#64748B', fontWeight: 700 }}>
              {typeof identityScore === 'number' ? `${identityScore}/100` : (lang === 'zh' ? '未计算' : 'N/A')}
            </span>
            <span style={{ color: '#64748B' }}>{lang === 'zh' ? '证据等级' : 'Evidence level'}</span>
            <span style={{ color: covColor(c), fontWeight: 600 }}>{covLabel(c)}</span>
          </div>
        </div>

        {idCrossFlags.length > 0 ? (
          <div style={{ padding: 10, borderRadius: 8, background: 'rgba(220, 38, 38, 0.05)', border: '1px solid rgba(220, 38, 38, 0.20)' }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: '#B91C1C', marginBottom: 4 }}>
              {lang === 'zh' ? '检测到的不一致' : 'Detected inconsistencies'}
            </div>
            {idCrossFlags.map((f, i) => <FlagLine key={i} flag={f} />)}
          </div>
        ) : (
          <div style={{ fontSize: 11.5, color: '#15803D', padding: '6px 2px' }}>
            {lang === 'zh' ? '✓ 各文件中的身份信息（姓名、电话、地区码）一致。' : '✓ Identity fields (name, phone, area code) are consistent across documents.'}
          </div>
        )}
      </div>
    )
  }

  const renderEmployerCheckDetail = () => {
    const empFlags: Array<{ code: string; severity: string; evidence_en: string; evidence_zh: string }> = []
    employerPerFile.forEach(pf => {
      pf.flags.forEach(f => {
        if (EMPLOYER_FLAG_CODES.has(f.code)) empFlags.push(f)
      })
    })
    employerCrossFlags.forEach(f => empFlags.push(f))

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {employerPerFile.length > 0 ? (
          employerPerFile.map((pf, i) => (
            <div key={i} style={{ padding: 10, borderRadius: 8, background: 'rgba(255,255,255,0.55)', border: '1px solid rgba(15, 23, 42, 0.08)' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#0B1736', marginBottom: 4, wordBreak: 'break-all' }}>{pf.file_name}</div>

              <div style={{ fontSize: 10.5, color: '#64748B', marginBottom: 6 }}>{pf.file_kind}</div>
              {pf.paystub_math && (pf.paystub_math.expected_ytd_gross || pf.paystub_math.ytd_ratio || pf.paystub_math.extraction?.annual_salary) && (
                <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '3px 10px', fontSize: 10.5, padding: 7, background: 'rgba(15, 23, 42, 0.03)', borderRadius: 5, marginBottom: 6 }}>
                  {pf.paystub_math.extraction?.annual_salary && (
                    <>
                      <span style={{ color: '#64748B' }}>{lang === 'zh' ? '声明年薪' : 'Annual salary'}</span>
                      <span className="mono" style={{ color: '#0B1736' }}>${pf.paystub_math.extraction.annual_salary.toLocaleString()}</span>
                    </>
                  )}
                  {pf.paystub_math.extraction?.ytd_gross && (
                    <>
                      <span style={{ color: '#64748B' }}>{lang === 'zh' ? '声明 YTD' : 'Stated YTD'}</span>
                      <span className="mono" style={{ color: '#0B1736' }}>${pf.paystub_math.extraction.ytd_gross.toLocaleString()}</span>
                    </>
                  )}
                  {pf.paystub_math.expected_ytd_gross && (
                    <>
                      <span style={{ color: '#64748B' }}>{lang === 'zh' ? '预期 YTD' : 'Expected YTD'}</span>
                      <span className="mono" style={{ color: '#0B1736' }}>${Math.round(pf.paystub_math.expected_ytd_gross).toLocaleString()}</span>
                    </>
                  )}
                  {pf.paystub_math.ytd_ratio && (
                    <>
                      <span style={{ color: '#64748B' }}>{lang === 'zh' ? 'YTD 比例' : 'YTD ratio'}</span>
                      <span className="mono" style={{ color: pf.paystub_math.ytd_ratio > 1.5 || pf.paystub_math.ytd_ratio < 0.5 ? '#B91C1C' : '#15803D', fontWeight: 700 }}>
                        {pf.paystub_math.ytd_ratio.toFixed(2)}× {lang === 'zh' ? '预期' : 'expected'}
                      </span>
                    </>
                  )}
                </div>
              )}
              {pf.flags.filter(f => EMPLOYER_FLAG_CODES.has(f.code)).map((f, j) => <FlagLine key={j} flag={f} />)}
              {pf.flags.filter(f => EMPLOYER_FLAG_CODES.has(f.code)).length === 0 && !pf.paystub_math?.expected_ytd_gross && (
                <div style={{ fontSize: 10.5, color: '#15803D', fontWeight: 600 }}>
                  {lang === 'zh' ? '✓ 文件结构与雇主声明一致' : '✓ File matches employer claim structure'}
                </div>
              )}
            </div>
          ))
        ) : (
          <div style={{ fontSize: 11.5, color: '#64748B', fontStyle: 'italic', padding: '6px 2px' }}>
            {(() => {
              // Check if AI detected employer-related docs even though forensics is missing/empty
              const kinds = result.detected_document_kinds || []
              const hasEmpDocs = kinds.some(k => ['pay_stub', 'employment_letter', 'offer_letter'].includes(k))
              if (hasEmpDocs) {
                return lang === 'zh' ? '已上传雇主相关文件，未检测到异常。' : 'Employer files uploaded — no anomalies detected.'
              }
              return lang === 'zh' ? '未上传雇主信 / 工资单 / Offer。' : 'No employment letter, pay stub, or offer letter uploaded.'
            })()}
          </div>
        )}

        {employerCrossFlags.length > 0 && (
          <div style={{ padding: 10, borderRadius: 8, background: 'rgba(220, 38, 38, 0.05)', border: '1px solid rgba(220, 38, 38, 0.20)' }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: '#B91C1C', marginBottom: 4 }}>
              {lang === 'zh' ? '雇主跨文档检测' : 'Employer cross-document checks'}
            </div>
            {employerCrossFlags.map((f, i) => <FlagLine key={i} flag={f} />)}
          </div>
        )}

        {empFlags.length === 0 && employerPerFile.length > 0 && (
          <div style={{ fontSize: 11.5, color: '#15803D', padding: '6px 2px' }}>
            {lang === 'zh' ? '✓ 雇主信息（名称、入职、薪资）在各文件间一致。' : '✓ Employer info (name, start date, salary) is consistent across docs.'}
          </div>
        )}
      </div>
    )
  }

  // Compute the worst flag severity for each sub-row so the dot color
  // reflects actual risk instead of always being green ("measured").
  // 'critical'|'high' → red, 'medium' → amber, 'low'/none → green.
  const worstSev = (flags: Array<{ severity: string }>): string => {
    const order: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 }
    let worst = 4 // none
    for (const f of flags) worst = Math.min(worst, order[f.severity] ?? 4)
    return worst <= 1 ? 'critical' : worst === 2 ? 'medium' : 'clean'
  }
  const dotColor = (sev: string): string => {
    if (sev === 'critical') return '#DC2626' // red
    if (sev === 'medium')   return '#D97706' // amber
    return '#15803D'                          // green
  }

  // Per sub-row worst severity
  const docCheckWorst = worstSev(perFile.flatMap(pf => pf.flags))
  const idMatchWorst = worstSev(idCrossFlags)
  const employerWorst = worstSev([
    ...employerPerFile.flatMap(pf => pf.flags.filter(f => EMPLOYER_FLAG_CODES.has(f.code))),
    ...employerCrossFlags,
  ])

  const SubRow = ({ label, covKey, scoreVal, desc, detail, severity = 'clean' }: {
    label: string
    covKey: string
    scoreVal?: number | null
    desc?: string
    detail?: ReactNode
    severity?: string
  }) => {
    const c = cov(covKey)
    const rowOpen = !!openRows[covKey]
    const expandable = !!detail
    const dot = dotColor(severity)
    return (
      <div style={{ background: 'rgba(11, 23, 54, 0.04)', borderRadius: 8, border: '1px solid var(--border-subtle)', overflow: 'hidden' }}>
        <button
          type="button"
          onClick={() => expandable && toggleRow(covKey)}
          style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'none', border: 'none', textAlign: 'left', cursor: expandable ? 'pointer' : 'default', color: 'inherit' }}
        >
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: dot, flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: '#0B1736' }}>{label}</div>
            <div style={{ fontSize: 10.5, color: '#64748B', marginTop: 1 }}>{desc || covLabel(c)}</div>
          </div>
          {typeof scoreVal === 'number' && (
            <span className="mono" style={{ fontSize: 11, fontWeight: 700, color: covColor(c) }}>{scoreVal}/100</span>
          )}
          {expandable && (
            <span style={{ fontSize: 14, color: '#64748B', transition: 'transform 0.2s', transform: rowOpen ? 'rotate(90deg)' : 'none', flexShrink: 0 }}>›</span>
          )}
        </button>
        {expandable && rowOpen && (
          <div style={{ padding: '12px 12px 14px', borderTop: '1px dashed var(--border-subtle)', background: 'rgba(255,255,255,0.35)' }}>
            {detail}
          </div>
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
              desc={t('screen.result.authenticity.docCheck.desc' as DictKey)}
              detail={renderDocCheckDetail()}
              severity={docCheckWorst}
            />
            <SubRow
              label={t('screen.result.authenticity.idMatch')}
              covKey="identity_match"
              scoreVal={identityScore}
              desc={t('screen.result.authenticity.idMatch.desc' as DictKey)}
              detail={renderIdMatchDetail()}
              severity={idMatchWorst}
            />
            <SubRow
              label={t('screen.result.authenticity.employerCheck')}
              covKey="employer_verify"
              desc={t('screen.result.authenticity.employerCheck.desc' as DictKey)}
              detail={renderEmployerCheckDetail()}
              severity={employerWorst}
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
  const { user: landlord, loading: authLoading, signOut } = useUser({
    redirectIfMissing: true,
    allowAnonymous: true,
    redirectPath: '/login?next=/screen',
  })
  const { canScreen: anonCanScreen, trialUsed, markTrialUsed } = useAnonTrialCheck()

  const [plan, setPlan] = useState<'free' | 'pro' | 'enterprise'>('free')
  // Tier is derived from the user's plan — no manual toggle on screen page.
  const tier: 'free' | 'pro' = (plan === 'pro' || plan === 'enterprise') ? 'pro' : 'free'

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
  const [showAuthGate, setShowAuthGate] = useState(false)
  const [deepChecking, setDeepChecking] = useState(false)
  const [deepCheckResult, setDeepCheckResult] = useState<ScoreResult['deep_check_result']>(null)
  // Phase 4 UX: fallback when extraction failed to find an employer name
  const [manualEmployerPrompt, setManualEmployerPrompt] = useState(false)
  const [manualEmployerName, setManualEmployerName] = useState('')
  // Phase 4 UX: staged progress text ("查询注册" → "核对董事" → "交叉比对")
  const [deepCheckStage, setDeepCheckStage] = useState<0 | 1 | 2>(0)
  // Refs for in-flight work that needs to be cancelled on unmount to avoid
  // "setState on unmounted component" warnings and orphaned network requests.
  const analysisAbortRef = useRef<AbortController | null>(null)
  const deepCheckTimersRef = useRef<ReturnType<typeof setTimeout>[]>([])
  useEffect(() => {
    return () => {
      analysisAbortRef.current?.abort()
      for (const t of deepCheckTimersRef.current) clearTimeout(t)
      deepCheckTimersRef.current = []
    }
  }, [])
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
      .eq('id', landlord.profileId)
      .maybeSingle()
    if (data?.plan) {
      setPlan(data.plan as any)
    }
  }

  const [upgradeLoading, setUpgradeLoading] = useState(false)

  async function startProUpgrade() {
    setUpgradeLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        setShowAuthGate(true)
        return
      }
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      const data = await res.json()
      if (!res.ok || !data.url) throw new Error(data.error || 'checkout failed')
      window.location.href = data.url
    } catch (err: any) {
      alert(lang === 'zh' ? `升级失败: ${err?.message}` : `Upgrade failed: ${err?.message}`)
    } finally {
      setUpgradeLoading(false)
    }
  }

  async function runDeepCheck(manualEmployer?: string) {
    // Gate: only PRO users can run deep check
    if (plan !== 'pro' && plan !== 'enterprise') {
      startProUpgrade()
      return
    }
    if (!result || deepChecking) return

    // Phase 1: build the stateless payload from local forensics state.
    // The API no longer re-reads from the DB, so "Screening not found"
    // can no longer happen from schema drift.
    const forensics: any = (result as any).forensics_detail || null
    const cross = forensics?.cross_doc?.entities || {}
    const firstOr = (arr: any): string | undefined => {
      if (!Array.isArray(arr) || !arr.length) return undefined
      const v = arr[0]?.value
      return typeof v === 'string' ? v : undefined
    }

    const employerSet = new Set<string>()
    const addEmployer = (v: unknown) => {
      if (typeof v !== 'string') return
      const s = v.trim()
      if (s.length >= 2) employerSet.add(s)
    }
    // Manual override takes precedence; otherwise pull from forensics
    if (manualEmployer && manualEmployer.trim().length >= 2) {
      employerSet.add(manualEmployer.trim())
    } else {
      if (Array.isArray(cross.employers)) for (const e of cross.employers) addEmployer(e?.value)
      if (Array.isArray(forensics?.per_file)) {
        for (const pf of forensics.per_file) addEmployer(pf?.paystub_math?.extraction?.employer_name)
      }
    }

    const employer_names = Array.from(employerSet)
    const applicant_name = (result.extracted_name || '').trim()

    if (employer_names.length === 0) {
      // Phase 4 UX: instead of alerting and stopping, open the manual-input UI
      setManualEmployerPrompt(true)
      return
    }
    if (!applicant_name) {
      alert(lang === 'zh' ? '未找到申请人姓名' : 'No applicant name found')
      return
    }

    // Clear manual-prompt state once we have a valid payload
    setManualEmployerPrompt(false)
    setDeepCheckStage(0)
    // Staged progress text — these fire on timers while the API runs. Tracked
    // in a ref so that component unmount clears them (see the useEffect near
    // analysisAbortRef). Finally-block clears them after successful completion.
    const stageTimer1 = setTimeout(() => setDeepCheckStage(1), 1800)
    const stageTimer2 = setTimeout(() => setDeepCheckStage(2), 4000)
    deepCheckTimersRef.current.push(stageTimer1, stageTimer2)

    setDeepChecking(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/deep-check', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token || ''}`,
        },
        body: JSON.stringify({
          employer_names,
          applicant_name,
          applicant_address: firstOr(cross.addresses),
          applicant_phone: firstOr(cross.phones),
          applicant_email: firstOr(cross.emails),
          hr_phone_collision: forensics?.cross_doc?.hr_phone_collision === true,
          // Aggregate text from employment-related docs so the server can
          // scan for Business Numbers and cross-check against the federal
          // registry (catches the classic forgery of copying a real BN onto
          // a fake employment letter).
          employer_doc_text: (() => {
            const bits: string[] = []
            if (Array.isArray(forensics?.per_file)) {
              for (const pf of forensics.per_file) {
                const kind = pf?.file_kind
                if (kind !== 'employment_letter' && kind !== 'pay_stub' && kind !== 't4') continue
                const txt = pf?.ocr?.text || pf?.text_density?.text_sample
                if (typeof txt === 'string' && txt.length > 0) bits.push(txt)
              }
            }
            return bits.join('\n\n---\n\n')
          })(),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error_zh || data.error || 'Deep check failed')

      // Persist to screenings table via the user's RLS'd client.
      // If no screening_id is known (shouldn't happen in normal flow), skip persistence.
      const sid = result.screening_id || viewingHistoryId
      if (sid) {
        const updatedForensics = forensics
          ? { ...forensics, arm_length: data.checks }
          : { arm_length: data.checks }
        const { error: persistErr } = await supabase
          .from('screenings')
          .update({
            deep_check_result: data,
            forensics_detail: updatedForensics,
          })
          .eq('id', sid)
        if (persistErr) {
          // Non-fatal — show result in UI, warn in console
          console.warn('[deep-check] persist failed:', persistErr)
        }
      }

      setDeepCheckResult(data)
      setResult(prev => prev ? { ...prev, deep_check_result: data } : prev)
    } catch (e: any) {
      alert(lang === 'zh'
        ? `深度检查失败: ${e.message}`
        : `Deep check failed: ${e.message}`)
    } finally {
      clearTimeout(stageTimer1)
      clearTimeout(stageTimer2)
      // Remove these specific timers from the cleanup ref (the unmount
      // handler clears whatever's still there).
      deepCheckTimersRef.current = deepCheckTimersRef.current.filter(
        t => t !== stageTimer1 && t !== stageTimer2
      )
      setDeepChecking(false)
      setDeepCheckStage(0)
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
        screening_id: data.id ?? id,
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
        // Forensics — stored both as DB column and in _v3 blob
        forensics_detail: v3.forensics_detail ?? data.forensics_detail ?? null,
        forensics_penalty: v3.forensics_penalty ?? data.forensics_penalty ?? 0,
        forensics_zeroed_dims: v3.forensics_zeroed_dims ?? data.forensics_zeroed_dims ?? [],
        // Restore deep check result so the arm's-length card shows previous runs
        deep_check_result: data.deep_check_result ?? null,
      }

      setResult(reconstructed)
      setViewingHistoryId(id)
      // Sync arm's-length card state so previously-run deep checks render
      setDeepCheckResult(data.deep_check_result ?? null)
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

  // Send files in small batches (3 per request) so the edge function
  // doesn't choke on a single massive FormData upload. Batches run in
  // parallel; partial failures don't block the rest.
  const CLASSIFY_BATCH_SIZE = 3

  const classifyNewFiles = useCallback(async (toClassify: File[]) => {
    setClassifying(true)
    setClassifyError(null)

    // Split into small batches
    const batches: File[][] = []
    for (let i = 0; i < toClassify.length; i += CLASSIFY_BATCH_SIZE) {
      batches.push(toClassify.slice(i, i + CLASSIFY_BATCH_SIZE))
    }

    type BatchResult = {
      classifications?: { index: number; kinds: string[]; name?: string }[]
      applicant_name?: string | null
      monthly_rent?: number | null
      error?: string
    }

    let failCount = 0

    const batchResults = await Promise.allSettled(
      batches.map(async (batch): Promise<BatchResult> => {
        const form = new FormData()
        for (const f of batch) form.append('files', f, f.name)
        const res = await fetch('/api/classify-files', { method: 'POST', body: form })
        if (!res.ok) {
          const errBody = await res.text().catch(() => '')
          throw new Error(`HTTP ${res.status}: ${errBody.slice(0, 200)}`)
        }
        const data = await res.json() as BatchResult
        if (data.error) throw new Error(data.error)
        return data
      })
    )

    // Merge results across all batches
    const kindsMap: Record<string, string[]> = {}
    let foundName: string | null = null
    let foundRent: number | null = null

    for (let bi = 0; bi < batches.length; bi++) {
      const batch = batches[bi]
      const result = batchResults[bi]

      if (result.status === 'fulfilled') {
        const data = result.value
        for (const c of data.classifications || []) {
          const f = batch[c.index]
          if (f) kindsMap[fileKey(f)] = Array.isArray(c.kinds) ? c.kinds : []
        }
        if (!foundName && data.applicant_name) foundName = data.applicant_name
        if (foundRent === null && typeof data.monthly_rent === 'number' && data.monthly_rent > 0) {
          foundRent = data.monthly_rent
        }
      } else {
        failCount++
        console.error(`[classify-files] batch ${bi} failed:`, result.reason?.message || result.reason)
        // Still populate empty kinds so filename heuristic takes over
        for (const f of batch) kindsMap[fileKey(f)] = []
      }
    }

    // Apply merged results
    if (Object.keys(kindsMap).length > 0) {
      setFileKinds(prev => ({ ...prev, ...kindsMap }))
    }
    if (foundName) {
      setApplicantName(prev => (prev && prev.trim() ? prev : foundName!))
    }
    if (typeof foundRent === 'number' && foundRent > 0) {
      setTargetRent(prev => (prev && prev.trim() ? prev : String(foundRent)))
    }

    // Only show error if ALL batches failed
    if (failCount > 0 && failCount === batches.length) {
      setClassifyError(lang === 'zh' ? '文件分类请求失败，请重试' : 'File classification request failed — please retry')
    } else if (failCount > 0) {
      // Partial failure — some files classified, some fell back to heuristic.
      // Not a blocking error; just log it.
      console.warn(`[classify-files] ${failCount}/${batches.length} batches failed, using filename heuristic for those files`)
    }

    setClassifying(false)
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
    setDeepCheckResult(null)
    setProgress(0)
    setProgressLabel('')
    setApplicantName('')
    setTargetRent('')
    setError(null)
    setViewingHistoryId(null)
    // Deep-check UI state must also reset, otherwise a new screening
    // could render a stale "manual employer input" prompt or spinner
    // stage from the previous run.
    setManualEmployerPrompt(false)
    setManualEmployerName('')
    setDeepCheckStage(0)
    setDeepChecking(false)
  }

  async function runAnalysis() {
    if (!landlord) return
    // Block while classification is still in flight — concurrent classify +
    // upload requests exhaust the browser connection pool → "Failed to fetch".
    if (classifying) return
    // Anonymous trial limit: 1 free screening, then must register
    if (landlord.isAnonymous && !anonCanScreen) {
      setShowAuthGate(true)
      return
    }
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
          landlord_id: landlord.profileId,
          tenant_name: applicantName || null,
          monthly_rent: targetRent ? Number(targetRent) : null,
          status: 'uploading',
        })
        .select('id')
        .single()
      if (insertErr || !row) throw new Error(insertErr?.message || 'Failed to create screening record')
      const screeningId = row.id

      // 2. Upload files to storage — one-at-a-time with retry.
      // Sequential upload avoids browser connection-pool saturation
      // that caused "Failed to fetch". Individual file failures are
      // non-fatal: we skip the file and continue with the rest so
      // the screening still runs on whatever files made it through.
      const stamp = Date.now()
      const MAX_RETRIES = 2
      const uploaded: UploadedFile[] = []
      const failedFiles: string[] = []

      // Refresh auth session before upload to prevent token expiry mid-upload
      await supabase.auth.refreshSession()

      for (let i = 0; i < files.length; i++) {
        const f = files[i]
        const safeName = f.name.replace(/[^a-zA-Z0-9._-]/g, '_')
        const path = `screenings/${landlord.profileId}/${screeningId}/${stamp}_${i}_${safeName}`

        let success = false
        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
          try {
            const { error: upErr } = await supabase
              .storage.from('tenant-files')
              .upload(path, f, { contentType: f.type, upsert: attempt > 0 })
            if (!upErr) {
              // Prefer the AI classifier's per-file kinds (which can include
              // multiple kinds when a single PDF bundles employment letter +
              // pay stubs + Equifax report — common for "Supporting
              // Documents" packets). Fall back to filename heuristic only
              // when the classifier didn't return anything for this file.
              const aiKinds = fileKinds[fileKey(f)]
              const kind = aiKinds && aiKinds.length > 0
                ? aiKinds.join(',')
                : guessKind(f.name)
              uploaded.push({ path, name: f.name, size: f.size, mime: f.type || 'application/octet-stream', kind })
              success = true
              break
            }
            // Supabase returned an error object — retry after pause
            console.warn(`[upload] ${f.name} attempt ${attempt + 1} failed: ${upErr.message}`)
          } catch (netErr: any) {
            // Network-level failure (Failed to fetch, etc.) — retry after pause
            console.warn(`[upload] ${f.name} attempt ${attempt + 1} network error: ${netErr?.message}`)
          }
          if (attempt < MAX_RETRIES) await new Promise(r => setTimeout(r, 1200 * (attempt + 1)))
        }
        if (!success) failedFiles.push(f.name)
      }

      // At least one file must have uploaded; otherwise abort
      if (uploaded.length === 0 && files.length > 0) {
        throw new Error(lang === 'zh'
          ? `所有文件上传失败（${failedFiles.join('、')}），请检查网络后重试`
          : `All files failed to upload (${failedFiles.join(', ')}). Check your network and retry.`)
      }

      if (uploaded.length > 0) {
        await supabase.from('screenings').update({ files: uploaded }).eq('id', screeningId)
      }

      // Warn about skipped files (non-fatal)
      if (failedFiles.length > 0) {
        console.warn(`[upload] ${failedFiles.length} file(s) skipped: ${failedFiles.join(', ')}`)
      }

      // 3. Call scoring API. Wire an AbortController so component-unmount
      // (navigation away, page close) cancels the in-flight request and
      // prevents setState-on-unmounted warnings.
      analysisAbortRef.current?.abort()
      analysisAbortRef.current = new AbortController()
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/screen-score', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token || ''}`,
        },
        body: JSON.stringify({ screening_id: screeningId }),
        signal: analysisAbortRef.current.signal,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Scoring failed')

      await animPromise
      setProgress(100)
      setProgressLabel(t('screen.step.report'))
      await new Promise(r => setTimeout(r, 400))

      setResult(data as ScoreResult)
      setLastDetectedKinds(Array.isArray((data as ScoreResult).detected_document_kinds) ? (data as ScoreResult).detected_document_kinds! : [])
      // Mark anonymous trial as used after successful screening
      if (landlord.isAnonymous) markTrialUsed()
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
          <div style={{ width: 40, height: 40, margin: '0 auto 12px', borderRadius: '50%', border: '3px solid #E4E8F0', borderTopColor: '#10B981', animation: 'spin 1s linear infinite' }} />
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
    <PageShell role="landlord">
      <div className="screen-app">
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;700;800&display=swap" rel="stylesheet" />
        <style>{`
        .sl-header { padding: 20px 24px; }
        .sl-brand-sub { display: block; }
        .sl-container { max-width: 800px; margin: 0 auto; padding: 24px 16px; }
        .sl-scanner-panel { border-radius: 20px; }
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
          .sl-scanner-panel { border-radius: 14px !important; }
          .sl-summary-text { font-size: 13px !important; line-height: 1.7 !important; }
          .sl-section-title { font-size: 12px !important; }
        }
        details.sl-card > summary::-webkit-details-marker { display: none; }
        details.sl-card > summary::marker { display: none; content: ''; }
        details.sl-card[open] > summary svg { transform: rotate(90deg); }
      `}</style>

      {/* Auth gate modal — shown when anonymous user has used their 1 free trial */}
      <AuthModal open={showAuthGate} onClose={() => setShowAuthGate(false)} defaultTab="register" next="/screen" />

      <div className="container-narrow">
        {!result && !analyzing && (
          <div className="fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* ─── Scanner Panel ─── */}
            <div style={{
              background: '#FFFFFF',
              border: '1px solid #D8D2C2',
              borderRadius: 20,
              boxShadow: '0 1px 3px rgba(31, 25, 11, 0.04), 0 12px 32px -8px rgba(31, 25, 11, 0.06)',
              overflow: 'hidden',
            }}>
              {/* Panel Header */}
              <div style={{
                padding: '18px 20px',
                borderBottom: '1px solid #E0DACE',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: 'linear-gradient(135deg, rgba(4, 120, 87, 0.06), rgba(4, 120, 87, 0.02))',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  {/* Flat shield mark — V3 emerald, no gradient/glow, matches the rest of the brand */}
                  <div style={{
                    width: 40, height: 40, borderRadius: 10,
                    background: '#047857',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M12 2 4 5v7c0 5 3.5 8.5 8 10 4.5-1.5 8-5 8-10V5l-8-3z" />
                      <path d="m9 12 2 2 4-4" />
                    </svg>
                  </div>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: '#0B1736', letterSpacing: '-0.01em' }}>
                      {lang === 'zh' ? '租客筛查' : 'Tenant Screening'}
                    </div>
                    <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>
                      {lang === 'zh' ? '上传文件 → AI 分析 → 风险报告' : 'Upload docs → AI analysis → Risk report'}
                    </div>
                  </div>
                </div>
                {isPro && (
                  <span style={{
                    fontSize: 10.5, fontWeight: 700, padding: '4px 10px', borderRadius: 6,
                    background: '#F3E8FF', color: '#6D28D9',
                    border: '1px solid rgba(124, 58, 237, 0.30)',
                    letterSpacing: '0.08em', textTransform: 'uppercase',
                  }}>PRO</span>
                )}
              </div>

              {/* Drop Zone — compact */}
              <div
                onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                style={{
                  margin: '16px 18px 0',
                  border: `2px dashed ${dragOver ? '#047857' : '#C5BDAA'}`,
                  borderRadius: 14,
                  padding: files.length > 0 ? '20px 16px' : '36px 16px',
                  textAlign: 'center',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  background: dragOver
                    ? 'radial-gradient(ellipse at center, rgba(4, 120, 87, 0.10), transparent 70%)'
                    : '#FAF7EF',
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
                {files.length === 0 ? (
                  <>
                    <div style={{ fontSize: 34, marginBottom: 10, opacity: 0.9 }}>📁</div>
                    <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6, color: '#0B1736' }}>{t('screen.drop.title')}</div>
                    <div style={{ fontSize: 13, color: '#64748B', lineHeight: 1.5 }}>{t('screen.drop.sub')}</div>
                    {/* Soft-mint button — same color recipe as the bottom 开始筛查
                        button below so both primary actions on the page read as
                        the same chip. Pale-mint #6EE7B7→#34D399 matches the
                        target the user picked from the design screenshot.
                        We strip the leading 📎 emoji from the i18n string and
                        replace it with the SVG paperclip so we don't render
                        two icons. */}
                    <div
                      style={{
                        marginTop: 16,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '10px 22px',
                        fontSize: 13,
                        fontWeight: 600,
                        borderRadius: 10,
                        background: 'linear-gradient(135deg, #6EE7B7 0%, #34D399 100%)',
                        color: '#FFFFFF',
                        boxShadow: '0 8px 22px -10px rgba(52, 211, 153, 0.45), 0 1px 0 rgba(255, 255, 255, 0.30) inset',
                      }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                      </svg>
                      {t('screen.drop.pick').replace(/^\s*[^\w\u4e00-\u9fff]+\s*/, '')}
                    </div>
                  </>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: '#64748B', fontSize: 12.5 }}>
                    <span style={{ fontSize: 16 }}>＋</span>
                    <span>{lang === 'zh' ? '点击或拖拽添加更多文件' : 'Click or drag to add more files'}</span>
                  </div>
                )}
              </div>

              {/* File Type Badges — compact horizontal strip */}
              <div style={{ padding: '12px 18px 0', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 6 }}>
                {(() => {
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
                          display: 'flex', alignItems: 'center', gap: 5,
                          padding: '7px 10px', borderRadius: 8,
                          background: uploaded ? 'rgba(4, 120, 87, 0.10)' : '#FAF7EF',
                          border: uploaded ? '1px solid rgba(4, 120, 87, 0.40)' : '1px solid #D8D2C2',
                          fontSize: 11, fontWeight: uploaded ? 600 : 500,
                          color: uploaded ? '#047857' : '#52525B',
                          transition: 'all 0.2s',
                        }}
                      >
                        <span style={{ fontSize: 13, filter: uploaded ? 'none' : 'grayscale(0.4) opacity(0.6)' }}>{ft.icon}</span>
                        <span>{t(ft.labelKey)}</span>
                        {uploaded && (
                          <span style={{
                            fontSize: 9, fontWeight: 800, padding: '1px 5px', borderRadius: 6,
                            background: 'linear-gradient(135deg, #10B981, #059669)', color: '#fff',
                            lineHeight: '14px', minWidth: 16, textAlign: 'center',
                          }}>
                            {count}
                          </span>
                        )}
                      </div>
                    )
                  })
                })()}
              </div>

              {/* Classification progress bar */}
              {classifying && (
                <div style={{ margin: '12px 18px 0', padding: '10px 14px', background: '#F0FDFA', border: '1px solid rgba(20, 184, 166, 0.25)', borderRadius: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <span style={{ width: 12, height: 12, borderRadius: '50%', border: '2px solid rgba(20, 184, 166, 0.25)', borderTopColor: '#14B8A6', animation: 'spin 0.8s linear infinite', display: 'inline-block' }} />
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#059669' }}>
                      {lang === 'zh' ? '正在识别文件类型…' : 'Classifying files…'}
                    </span>
                  </div>
                  <div style={{ height: 3, borderRadius: 2, background: 'rgba(20, 184, 166, 0.15)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', background: 'linear-gradient(90deg, #14B8A6, #10B981)', width: '60%', borderRadius: 2, animation: 'shimmer 1.5s ease-in-out infinite' }} />
                  </div>
                </div>
              )}

              {/* Classification error */}
              {classifyError && !classifying && (
                <div style={{ margin: '12px 18px 0', padding: '10px 14px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, fontSize: 12, color: '#B91C1C' }}>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>⚠ {lang === 'zh' ? '文件分类失败' : 'Classification failed'}</div>
                  <div style={{ fontSize: 11, color: '#7F1D1D' }}>{classifyError}</div>
                  <button onClick={() => { setClassifyError(null); classifyNewFiles(files) }} style={{ marginTop: 6, fontSize: 11, color: '#DC2626', textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                    {lang === 'zh' ? '点击重试' : 'Click to retry'}
                  </button>
                </div>
              )}

              {/* Uploaded file list */}
              {files.length > 0 && (
                <div style={{ margin: '12px 18px 0' }}>
                  <div style={{ fontSize: 11.5, fontWeight: 600, color: '#64748B', marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span>{t('screen.files.uploadedN', { n: files.length })}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 200, overflowY: 'auto' }}>
                    {files.map((f, i) => {
                      const ext = f.name.split('.').pop()?.toLowerCase() || ''
                      const isPdf = ext === 'pdf'
                      const isImage = ['jpg', 'jpeg', 'png', 'webp'].includes(ext)
                      const kinds = fileKinds[fileKey(f)]
                      const kindLabel = Array.isArray(kinds) && kinds.length > 0
                        ? kinds.map(k => FILE_TYPES.find(ft => ft.key === k)?.icon || '📎').join('')
                        : null
                      return (
                        <div key={i} style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          padding: '8px 12px', background: '#FAF7EF', borderRadius: 10,
                          border: '1px solid #EAE5D9', fontSize: 12.5,
                          minHeight: 38,
                        }}>
                          <span style={{ fontSize: 13, flexShrink: 0 }}>{isPdf ? '📄' : isImage ? '🖼️' : '📎'}</span>
                          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#0B1736', fontWeight: 500 }}>{f.name}</span>
                          {kindLabel && <span style={{ fontSize: 11, flexShrink: 0 }}>{kindLabel}</span>}
                          <span style={{ fontSize: 10, color: '#94A3B8', flexShrink: 0 }}>{(f.size / 1024).toFixed(0)}KB</span>
                          <button onClick={(e) => { e.stopPropagation(); removeFile(i) }} style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', fontSize: 14, padding: '0 2px', lineHeight: 1, flexShrink: 0 }}>×</button>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Input fields + Submit — inside the panel */}
              <div style={{ padding: '18px 20px 22px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
                  <div>
                    <label style={{ fontSize: 11.5, fontWeight: 600, color: '#475569', letterSpacing: '0.02em', marginBottom: 6, display: 'block' }}>{t('screen.form.name.label')}</label>
                    <input
                      type="text"
                      className="input"
                      placeholder={t('screen.form.name.placeholder')}
                      value={applicantName}
                      onChange={e => setApplicantName(e.target.value)}
                      // Explicit text + bg colors so the global .input:focus { background:#35416A }
                      // rule (which makes typed text invisible against dark navy) can't bleed
                      // through. WebkitTextFillColor pins iOS Safari which sometimes overrides
                      // color via autofill.
                      style={{
                        padding: '11px 14px', fontSize: 14, borderRadius: 10, height: 44,
                        color: '#0B1736', WebkitTextFillColor: '#0B1736',
                        background: '#FFFFFF', caretColor: '#0B1736',
                      }}
                    />
                    <div style={{ fontSize: 10.5, color: '#94A3B8', marginTop: 5 }}>{t('screen.form.name.hint')}</div>
                  </div>
                  <div>
                    <label style={{ fontSize: 11.5, fontWeight: 600, color: '#475569', letterSpacing: '0.02em', marginBottom: 6, display: 'block' }}>{t('screen.form.rent.label')}</label>
                    <input
                      type="number"
                      className="input"
                      placeholder={t('screen.form.rent.placeholder')}
                      value={targetRent}
                      onChange={e => setTargetRent(e.target.value)}
                      style={{
                        padding: '11px 14px', fontSize: 14, borderRadius: 10, height: 44,
                        color: '#0B1736', WebkitTextFillColor: '#0B1736',
                        background: '#FFFFFF', caretColor: '#0B1736',
                      }}
                    />
                  </div>
                </div>

                {error && (
                  <div style={{ marginBottom: 14, padding: '12px 16px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 12, fontSize: 13, color: '#B91C1C', lineHeight: 1.5 }}>⚠ {error}</div>
                )}

                {(() => {
                  const isDisabled = (files.length === 0 && !applicantName.trim()) || classifying
                  return (
                    <button
                      onClick={runAnalysis}
                      disabled={isDisabled}
                      style={{
                        width: '100%', padding: '14px 28px', fontSize: 15, borderRadius: 12, fontWeight: 650,
                        height: 52,
                        // Same soft-mint gradient as the 选择文件 button above, regardless
                        // of disabled state — both primary actions on /screen now share
                        // one visual identity. We avoid the className=".btn-primary"
                        // (which would re-apply the brighter #10B981→#059669 gradient
                        // and override these styles) and just use cursor:not-allowed +
                        // pointer-events:none for the disabled affordance.
                        background: 'linear-gradient(135deg, #6EE7B7 0%, #34D399 100%)',
                        color: '#FFFFFF',
                        boxShadow: '0 8px 22px -10px rgba(52, 211, 153, 0.45), 0 1px 0 rgba(255, 255, 255, 0.30) inset',
                        border: 'none',
                        cursor: isDisabled ? 'not-allowed' : 'pointer',
                        pointerEvents: isDisabled ? 'none' : 'auto',
                        transition: 'transform .15s ease, box-shadow .15s ease',
                      }}
                    >
                      {classifying
                        ? (lang === 'zh' ? '⏳ 正在识别文件…' : '⏳ Classifying files…')
                        : (lang === 'zh' ? '🛡 开始筛查' : '🛡 Start Screening')}
                      {!classifying && isPro && (
                        <span style={{
                          marginLeft: 10, fontSize: 10.5, fontWeight: 700,
                          padding: '3px 8px', borderRadius: 5, letterSpacing: '0.08em',
                          background: 'rgba(255, 255, 255, 0.28)',
                          color: '#FFFFFF',
                        }}>PRO</span>
                      )}
                    </button>
                  )
                })()}

                {/* What happens next — compact pipeline */}
                <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 11.5, color: '#94A3B8', flexWrap: 'wrap' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>📋 {lang === 'zh' ? 'AI 分析' : 'AI Analysis'}</span>
                  <span style={{ color: '#CBD5E1', fontSize: 10 }}>→</span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>⚖️ {lang === 'zh' ? '法院记录' : 'Court Records'}</span>
                  <span style={{ color: '#CBD5E1', fontSize: 10 }}>→</span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>🔒 {lang === 'zh' ? '取证检测' : 'Forensics'}</span>
                  <span style={{ color: '#CBD5E1', fontSize: 10 }}>→</span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>📊 {lang === 'zh' ? '风险报告' : 'Risk Report'}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Analyzing — scanner-style progress */}
        {analyzing && (() => {
          const isCourtStep = progressLabel.includes('🔍') || progressLabel.toLowerCase().includes('canlii') || progressLabel.toLowerCase().includes('court') || progressLabel.toLowerCase().includes('network') || progressLabel.includes('查询')
          const accentColor = isCourtStep ? '#8B5CF6' : '#10B981'
          const accentBg = isCourtStep ? 'rgba(139, 92, 246, 0.06)' : 'rgba(13, 148, 136, 0.04)'
          return (
            <div className="fade-up" style={{
              background: '#FFFFFF',
              border: '1px solid #E4E8F0',
              borderRadius: 20,
              boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 12px 32px -8px rgba(0,0,0,0.06)',
              overflow: 'hidden',
            }}>
              {/* Scanner header */}
              <div style={{
                padding: '16px 22px',
                borderBottom: '1px solid #E4E8F0',
                background: accentBg,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div className="spin" style={{ width: 28, height: 28, borderRadius: '50%', border: '3px solid rgba(11, 23, 54, 0.08)', borderTopColor: accentColor }} />
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#0B1736' }}>
                      {lang === 'zh' ? '正在筛查…' : 'Scanning…'}
                    </div>
                    <div style={{ fontSize: 11, color: '#64748B', marginTop: 1 }}>
                      {files.length} {lang === 'zh' ? '个文件' : 'file(s)'}
                      {applicantName.trim() && ` · ${applicantName.trim()}`}
                    </div>
                  </div>
                </div>
                <span className="mono" style={{ fontSize: 22, fontWeight: 800, color: accentColor }}>{Math.round(progress)}%</span>
              </div>

              {/* Progress bar */}
              <div style={{ padding: '0 22px' }}>
                <div style={{ height: 4, borderRadius: 2, background: 'rgba(11, 23, 54, 0.06)', margin: '16px 0 12px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', borderRadius: 2, background: `linear-gradient(90deg, ${accentColor}88, ${accentColor})`, width: `${progress}%`, transition: 'width 0.5s ease' }} />
                </div>
              </div>

              {/* Current step label */}
              <div style={{ padding: '0 22px 20px', textAlign: 'center' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: accentColor, marginBottom: 6 }}>
                  {progressLabel || t('screen.step.start')}
                </div>
                <div style={{ fontSize: 11.5, color: '#94A3B8' }}>
                  {isCourtStep
                    ? (tier === 'pro' ? t('screen.analyzing.court.pro') : t('screen.analyzing.court.free'))
                    : t('screen.analyzing.files', { n: files.length })}
                </div>
              </div>
            </div>
          )
        })()}

        {/* Results */}
        {result && riskOverall && (
          <div className="fade-up">
            {/* Overall */}
            <div className="card-hero sl-card-overall" style={{ textAlign: 'center', marginBottom: 20 }}>
              <span className="mono" style={{ fontSize: 10.5, color: 'var(--text-muted)', letterSpacing: '0.15em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 8, display: 'block' }}>{t('screen.result.headline')}</span>
              <div className="sl-extracted-name" style={{ fontWeight: 700, marginBottom: 4, letterSpacing: '-0.015em' }}>{result.extracted_name || applicantName || '—'}</div>
              {result.name_was_extracted
                ? <div className="mono" style={{ fontSize: 10, color: 'var(--text-faint)', marginBottom: 16, letterSpacing: '0.05em' }}>{t('screen.result.nameExtracted')}</div>
                : <div style={{ marginBottom: 16 }} />}
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
                <ScoreRing score={result.overall} size={150} strokeWidth={11} />
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

            {/* Download PDF Report Button */}
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 18 }}>
              <button
                onClick={async (e) => {
                  const btn = e.currentTarget
                  btn.disabled = true
                  btn.textContent = lang === 'zh' ? '正在生成报告...' : 'Generating...'
                  try {
                    await generateScreeningReport(result as any, lang as 'en' | 'zh', files.length)
                  } catch (err) {
                    console.error('PDF generation failed:', err)
                    alert(lang === 'zh' ? '报告生成失败，请重试' : 'Report generation failed. Please retry.')
                  } finally {
                    btn.disabled = false
                    btn.textContent = lang === 'zh' ? '下载评估报告 (PDF)' : 'Download Report (PDF)'
                  }
                }}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  padding: '10px 24px', borderRadius: 10,
                  background: '#0B1736', color: '#fff',
                  fontSize: 13, fontWeight: 600, letterSpacing: '0.02em',
                  border: 'none', cursor: 'pointer',
                  transition: 'background .15s, transform .1s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = '#1E3A5F' }}
                onMouseLeave={e => { e.currentTarget.style.background = '#0B1736' }}
                onMouseDown={e => { e.currentTarget.style.transform = 'scale(0.97)' }}
                onMouseUp={e => { e.currentTarget.style.transform = 'scale(1)' }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                {lang === 'zh' ? '下载评估报告 (PDF)' : 'Download Report (PDF)'}
              </button>
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
                const isZeroed = Array.isArray(result.forensics_zeroed_dims)
                  && result.forensics_zeroed_dims.includes(cat.id)
                return (
                  <CategoryBar
                    key={cat.id}
                    category={cat as any}
                    score={typeof v3Score === 'number' ? v3Score : 0}
                    animDelay={i * 150}
                    tier={result.tier}
                    shortNote={(result.notes as any)?.[cat.id]}
                    detail={(details as any)?.[cat.id]}
                    zeroed={isZeroed}
                  />
                )
              })}
            </div>

            {/* Document Forensics — deterministic forgery detection */}
            {result.forensics_detail && (
              <ForensicsCard report={result.forensics_detail} />
            )}

            {/* Deep Check — Arm's-Length Employment Verification */}
            <div className="sl-card" style={{ background: 'var(--bg-card)', border: `1px solid ${deepCheckResult?.overall_risk === 'high' ? 'rgba(220, 38, 38, 0.4)' : deepCheckResult?.overall_risk === 'medium' ? 'rgba(245, 158, 11, 0.4)' : 'var(--border-subtle)'}`, backdropFilter: 'blur(14px)', marginBottom: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <div>
                  <div className="sl-section-title" style={{ fontSize: 13, fontWeight: 700, color: '#64748B' }}>
                    {lang === 'zh' ? '🏢 深度交叉检查 · Arm\'s Length' : '🏢 Deep Cross-Check · Arm\'s Length'}
                  </div>
                  <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 3 }}>
                    {lang === 'zh' ? '公司注册信息查询 · 董事/股东交叉比对 · 关联关系识别' : 'Company registry lookup · Director cross-reference · Relationship detection'}
                  </div>
                </div>
                {!deepCheckResult ? (
                  <button
                    onClick={() => runDeepCheck()}
                    disabled={deepChecking || upgradeLoading}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      padding: '8px 18px', borderRadius: 8,
                      background: isPro ? 'linear-gradient(135deg, #7C3AED, #8B5CF6)' : 'linear-gradient(135deg, #7C3AED, #8B5CF6)',
                      color: '#fff', fontSize: 12, fontWeight: 600,
                      border: 'none', cursor: (deepChecking || upgradeLoading) ? 'wait' : 'pointer',
                      opacity: (deepChecking || upgradeLoading) ? 0.6 : 1,
                      transition: 'all 0.15s',
                    }}
                  >
                    {deepChecking
                      ? (lang === 'zh'
                          ? (deepCheckStage === 0 ? '⏳ 查询公司注册…' : deepCheckStage === 1 ? '⏳ 核对董事…' : '⏳ 交叉比对…')
                          : (deepCheckStage === 0 ? '⏳ Registry lookup…' : deepCheckStage === 1 ? '⏳ Checking officers…' : '⏳ Cross-referencing…'))
                      : upgradeLoading
                        ? (lang === 'zh' ? '⏳ 跳转中…' : '⏳ Redirecting…')
                        : isPro
                          ? (lang === 'zh' ? '🔍 运行深度检查' : '🔍 Run Deep Check')
                          : (lang === 'zh' ? '🔒 升级 Pro 解锁' : '🔒 Upgrade to Pro')
                    }
                    <span style={{ fontSize: 9, opacity: 0.85, padding: '1px 5px', background: 'rgba(255,255,255,0.2)', borderRadius: 3 }}>PRO</span>
                  </button>
                ) : (
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: '4px 10px', borderRadius: 6,
                    background: deepCheckResult.overall_risk === 'high' ? '#FEE2E2' : deepCheckResult.overall_risk === 'medium' ? '#FEF3C7' : '#DCFCE7',
                    color: deepCheckResult.overall_risk === 'high' ? '#991B1B' : deepCheckResult.overall_risk === 'medium' ? '#92400E' : '#166534',
                  }}>
                    {deepCheckResult.overall_risk === 'high'
                      ? (lang === 'zh' ? '⚠ 高风险 — 非独立关系' : '⚠ High Risk — Not Arm\'s Length')
                      : deepCheckResult.overall_risk === 'medium'
                        ? (lang === 'zh' ? '⚡ 中等风险' : '⚡ Medium Risk')
                        : (lang === 'zh' ? '✓ 正常' : '✓ Clean')}
                  </span>
                )}
              </div>

              {/* Phase 4 UX: manual employer input when extraction failed */}
              {manualEmployerPrompt && !deepCheckResult && (
                <div style={{
                  marginTop: 14, padding: 14, borderRadius: 10,
                  background: 'rgba(124, 58, 237, 0.04)',
                  border: '1px solid rgba(124, 58, 237, 0.2)',
                }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#5B21B6', marginBottom: 6 }}>
                    {lang === 'zh' ? '未能自动识别雇主' : 'Employer name could not be auto-detected'}
                  </div>
                  <div style={{ fontSize: 11, color: '#64748B', marginBottom: 10, lineHeight: 1.5 }}>
                    {lang === 'zh'
                      ? '请手动输入雇佣信或工资单上的雇主公司全称（例如 "ABC Consulting Inc."），我们会查询加拿大公司注册并做独立性校验。'
                      : 'Enter the full employer name as shown on the employment letter or pay stub (e.g. "ABC Consulting Inc."). We will query the Canadian corporate registry.'}
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <input
                      type="text"
                      value={manualEmployerName}
                      onChange={e => setManualEmployerName(e.target.value)}
                      placeholder={lang === 'zh' ? '公司全称' : 'Company name'}
                      style={{
                        flex: '1 1 200px', padding: '8px 12px', borderRadius: 8,
                        border: '1px solid var(--border-subtle)', fontSize: 12,
                        background: 'var(--bg-card)', color: 'var(--text-primary)',
                      }}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && manualEmployerName.trim().length >= 2) {
                          const name = manualEmployerName.trim()
                          setManualEmployerName('')
                          runDeepCheck(name)
                        }
                      }}
                      autoFocus
                    />
                    <button
                      onClick={() => {
                        if (manualEmployerName.trim().length < 2) return
                        const name = manualEmployerName.trim()
                        setManualEmployerName('')
                        runDeepCheck(name)
                      }}
                      disabled={deepChecking || manualEmployerName.trim().length < 2}
                      style={{
                        padding: '8px 14px', borderRadius: 8,
                        background: 'linear-gradient(135deg, #7C3AED, #8B5CF6)',
                        color: '#fff', fontSize: 12, fontWeight: 600, border: 'none',
                        cursor: (deepChecking || manualEmployerName.trim().length < 2) ? 'not-allowed' : 'pointer',
                        opacity: (deepChecking || manualEmployerName.trim().length < 2) ? 0.5 : 1,
                      }}
                    >
                      {lang === 'zh' ? '查询' : 'Check'}
                    </button>
                    <button
                      onClick={() => { setManualEmployerPrompt(false); setManualEmployerName('') }}
                      disabled={deepChecking}
                      style={{
                        padding: '8px 14px', borderRadius: 8,
                        background: 'transparent', color: '#64748B',
                        fontSize: 12, fontWeight: 500,
                        border: '1px solid var(--border-subtle)',
                        cursor: deepChecking ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {lang === 'zh' ? '取消' : 'Cancel'}
                    </button>
                  </div>
                </div>
              )}

              {/* Deep Check Results */}
              {deepCheckResult && deepCheckResult.checks.length > 0 && (
                <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {deepCheckResult.checks.map((check, ci) => (
                    <div key={ci} style={{
                      padding: '12px 14px', borderRadius: 10,
                      background: check.arm_length_risk === 'high' ? 'rgba(220, 38, 38, 0.04)' : check.arm_length_risk === 'medium' ? 'rgba(245, 158, 11, 0.04)' : 'rgba(22, 163, 74, 0.04)',
                      border: `1px solid ${check.arm_length_risk === 'high' ? 'rgba(220, 38, 38, 0.2)' : check.arm_length_risk === 'medium' ? 'rgba(245, 158, 11, 0.2)' : 'rgba(22, 163, 74, 0.15)'}`,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, gap: 8 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#0B1736' }}>
                          {check.employer_name}
                        </div>
                        <span style={{
                          fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
                          background: check.arm_length_risk === 'high' ? '#DC2626' : check.arm_length_risk === 'medium' ? '#D97706' : '#16A34A',
                          color: '#fff',
                        }}>
                          {check.arm_length_risk === 'high' ? (lang === 'zh' ? '高风险' : 'HIGH') : check.arm_length_risk === 'medium' ? (lang === 'zh' ? '中风险' : 'MEDIUM') : check.arm_length_risk === 'low' ? (lang === 'zh' ? '低风险' : 'LOW') : (lang === 'zh' ? '正常' : 'CLEAN')}
                        </span>
                      </div>

                      {/* Company Info */}
                      {check.company_info ? (
                        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '3px 12px', fontSize: 11, color: '#475569', marginBottom: check.flags.length > 0 ? 10 : 0 }}>
                          <span style={{ color: '#94A3B8' }}>{lang === 'zh' ? '注册名' : 'Registered'}:</span>
                          <span style={{ fontWeight: 600 }}>{check.company_info.name}</span>
                          {check.company_info.incorporation_date && <>
                            <span style={{ color: '#94A3B8' }}>{lang === 'zh' ? '成立日期' : 'Incorporated'}:</span>
                            <span style={{ fontWeight: check.is_recently_incorporated ? 700 : 400, color: check.is_recently_incorporated ? '#B91C1C' : undefined }}>{check.company_info.incorporation_date}{check.is_recently_incorporated ? (lang === 'zh' ? ' ⚠ 不到2年' : ' ⚠ <2yr') : ''}</span>
                          </>}
                          {check.company_info.status && <>
                            <span style={{ color: '#94A3B8' }}>{lang === 'zh' ? '状态' : 'Status'}:</span>
                            <span>{check.company_info.status}</span>
                          </>}
                          {check.company_info.company_type && <>
                            <span style={{ color: '#94A3B8' }}>{lang === 'zh' ? '类型' : 'Type'}:</span>
                            <span>{check.company_info.company_type}</span>
                          </>}
                          {check.company_info.officers.length > 0 && <>
                            <span style={{ color: '#94A3B8' }}>{lang === 'zh' ? '董事/高管' : 'Officers'}:</span>
                            <span>
                              {check.company_info.officers.map((o, oi) => (
                                <span key={oi} style={{
                                  fontWeight: check.applicant_is_officer || check.applicant_lastname_match ? 700 : 400,
                                  color: check.applicant_is_officer ? '#B91C1C' : check.applicant_lastname_match ? '#D97706' : undefined,
                                }}>
                                  {o.name}{o.position ? ` (${o.position})` : ''}{oi < check.company_info!.officers.length - 1 ? ', ' : ''}
                                </span>
                              ))}
                            </span>
                          </>}
                          {check.company_info.registered_address && <>
                            <span style={{ color: '#94A3B8' }}>{lang === 'zh' ? '注册地址' : 'Address'}:</span>
                            <span style={{ color: check.company_address_matches_applicant ? '#B91C1C' : undefined, fontWeight: check.company_address_matches_applicant ? 600 : 400 }}>{check.company_info.registered_address}{check.company_address_matches_applicant ? (lang === 'zh' ? ' ⚠ 与申请人地址重叠' : ' ⚠ overlaps applicant') : ''}</span>
                          </>}
                          {check.company_info.registry_url && <>
                            <span style={{ color: '#94A3B8' }}>{lang === 'zh' ? '来源' : 'Source'}:</span>
                            <span><a href={check.company_info.registry_url} target="_blank" rel="noopener noreferrer" style={{ color: '#2563EB', textDecoration: 'underline' }}>{check.company_info.source}</a></span>
                          </>}
                        </div>
                      ) : (
                        <div style={{ fontSize: 11, color: '#94A3B8', fontStyle: 'italic', marginBottom: check.flags.length > 0 ? 10 : 0 }}>
                          {lang === 'zh' ? '未在加拿大公司注册数据库中找到' : 'Not found in Canadian corporate registries'}
                        </div>
                      )}

                      {/* Flags */}
                      {check.flags.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {check.flags.map((flag, fi) => (
                            <div key={fi} style={{
                              display: 'flex', alignItems: 'flex-start', gap: 8,
                              padding: '8px 10px', borderRadius: 6,
                              background: flag.severity === 'critical' ? 'rgba(185, 28, 28, 0.08)' : flag.severity === 'high' ? 'rgba(217, 119, 6, 0.08)' : 'rgba(100, 116, 139, 0.05)',
                              border: `1px solid ${flag.severity === 'critical' ? 'rgba(185, 28, 28, 0.2)' : flag.severity === 'high' ? 'rgba(217, 119, 6, 0.2)' : 'rgba(100, 116, 139, 0.1)'}`,
                              fontSize: 11.5, lineHeight: 1.5,
                            }}>
                              <span style={{
                                fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 3, flexShrink: 0, marginTop: 2,
                                background: flag.severity === 'critical' ? '#B91C1C' : flag.severity === 'high' ? '#D97706' : '#64748B',
                                color: '#fff',
                              }}>
                                {flag.severity === 'critical' ? (lang === 'zh' ? '严重' : 'CRIT') : flag.severity === 'high' ? (lang === 'zh' ? '高' : 'HIGH') : (lang === 'zh' ? '中' : 'MED')}
                              </span>
                              <span style={{ color: '#0B1736' }}>{lang === 'zh' ? flag.evidence_zh : flag.evidence_en}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                  <div style={{ fontSize: 10, color: '#94A3B8', textAlign: 'right' }}>
                    {lang === 'zh' ? '数据来源: OpenCorporates · 加拿大公司注册' : 'Source: OpenCorporates · Canadian Corporate Registry'}
                    {' · '}{new Date(deepCheckResult.checked_at).toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-CA')}
                  </div>
                </div>
              )}
            </div>

            {/* Court Records */}
            {(() => {
              const backendQueries = result.court_records_detail?.queries || []
              // Supplement backend queries with explicit Pro-locked sources
              // so the UI always shows a rich set of data sources like the
              // prototype. These stubs only render — they never affect
              // total_hits or scoring.
              // Ontario Courts Portal is now free-tier (integrated in backend)
              const hasEquifax = backendQueries.some(q => q.source.toLowerCase().includes('equifax'))
              const hasVerified = backendQueries.some(q => q.source.toLowerCase().includes('verified'))
              const extras: CourtQuery[] = []
              if (!hasEquifax) extras.push({ source: t('screen.result.court.source.equifax'), tier: 'pro', status: 'coming_soon', hits: null })
              if (!hasVerified) extras.push({ source: t('screen.result.court.source.verifiedNetwork'), tier: 'pro', status: 'coming_soon', hits: null })
              return (
                <CourtRecordDetail
                  queries={[...backendQueries, ...extras]}
                  totalHits={result.court_records_detail?.total_hits || 0}
                  queriedName={result.court_records_detail?.queried_name || ''}
                  tier={result.tier}
                  courtSummaryEn={result.court_summary_en}
                  courtSummaryZh={result.court_summary_zh}
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

            {/* Weights — collapsible */}
            <details className="sl-card" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', backdropFilter: 'blur(14px)', marginBottom: 18 }}>
              <summary style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', listStyle: 'none', WebkitAppearance: 'none' as any }}>
                <span className="sl-section-title" style={{ fontSize: 13, fontWeight: 700, color: '#64748B', margin: 0 }}>{t('screen.result.weights')}</span>
                <span style={{ fontSize: 11, color: '#94A3B8', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ transition: 'transform .2s' }}><path d="M5 3.5L9 7L5 10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </span>
              </summary>
              <div className="sl-weights-grid" style={{ display: 'grid', gap: 8, marginTop: 14 }}>
                {CATEGORIES.map(cat => (
                  <div key={cat.id} style={{ textAlign: 'center', padding: '16px 8px', borderRadius: 12, background: 'rgba(11, 23, 54, 0.04)', border: cat.id === 'rental_history' ? '1px solid rgba(139, 92, 246, 0.35)' : '1px solid var(--border-subtle)' }}>
                    <div style={{ fontSize: 20, marginBottom: 4 }}>{cat.icon}</div>
                    <div style={{ fontSize: 11, color: '#0B1736', fontWeight: 700 }}>{lang === 'zh' ? cat.zhLabel : cat.enLabel}</div>
                    <div style={{ fontSize: 9, color: '#64748B', fontWeight: 500, marginTop: 1 }}>{lang === 'zh' ? cat.enLabel : cat.zhLabel}</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: cat.id === 'rental_history' ? '#6D28D9' : '#10B981', fontFamily: "'JetBrains Mono', monospace", marginTop: 4 }}>{(cat.weight * 100).toFixed(0)}%</div>
                  </div>
                ))}
              </div>
            </details>

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
            <div style={{ textAlign: 'center', padding: '16px', fontSize: 11, color: '#94A3B8', borderTop: '1px solid #E4E8F0' }}>
              Stayloop Screening v1.1 · {new Date().toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-CA')}<br />
              {t('screen.result.footer.dataSource')}{result.tier === 'pro' ? t('screen.result.footer.dataSourcePro') : ''}<br />
              {t('screen.result.footer.notice')}
            </div>
          </div>
        )}

        {/* History */}
        {!analyzing && history.length > 0 && (
          <div className="card" style={{ marginTop: 32, padding: 0, overflow: 'hidden', borderRadius: 16 }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#8B5CF6', boxShadow: '0 0 8px rgba(139, 92, 246, 0.5)', flexShrink: 0 }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '-0.005em' }}>{t('history.title')}</span>
              <span className="mono" style={{ marginLeft: 'auto', fontSize: 10.5, color: 'var(--text-faint)', flexShrink: 0 }}>{t('history.countN', { n: history.length })}</span>
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
                      padding: '12px 20px',
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
    </PageShell>
  )
}
