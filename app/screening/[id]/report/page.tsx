'use client'

export const runtime = 'edge'

// V5.3 · Full Comprehensive Report — loads real data from Supabase.
// Route: /screening/[id]/report
//
// 2026-07-22 — Disclosure-depth pass (benchmarked against SingleKey's paid
// dual-bureau report). The scoring/forensics pipeline computes far more than
// the old page showed; this page now discloses the full pipeline output:
//   • Report provenance: report ID, timestamps, engine version, data sources
//   • Forensic checks EXECUTED (passed checks listed too — our differentiator:
//     SingleKey's fraud check is one line; we itemize 12 check categories)
//   • Court search disclosure: every database queried, incl. 0-hit and
//     timed-out sources ("searched & clear" ≠ "not searched")
//   • Income verification math: paystub recomputation, ratio calculation
//   • Credit report transcription (score, tradelines, collections, inquiries)
//   • Evidence coverage + sub-coverage grades, action items, compliance audit
// Data comes from ai_dimension_notes._v3 (the full snapshot the scoring route
// packs at scoring time) with per-column fallbacks — same reconstruction the
// screening history view uses. Presentation layer only; no scoring logic here.

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { useAuth } from '@/lib/useAuth'
import { supabase } from '@/lib/supabase'
import { useT } from '@/lib/i18n'
import type { ScoreResult, CourtQuery, OntarioPortalMatch, LtbCheck } from '@/lib/screening-types'
import { sevColor } from '@/lib/screening-types'
import { describeCodes } from '@/lib/ltb/search'
import { buildForensicCheckMatrix, generateScreeningReport, isPositiveForensicFlag } from '@/lib/generateReport'
import { registryLinks, inferProvince } from '@/lib/forensics/registry-links'

/* ─────────────────────────── HELPERS ─────────────────────────── */

const statusColor = (s: string) =>
  s === 'PASS' || s === 'CLEAN' || s === 'CLEAR' || s === 'MATCH' || s === 'PROCEED' || s === 'approve'
    ? '#16A34A'
    : s === 'INFO' || s === 'REVIEW' || s === 'conditional'
      ? '#D97706'
      : '#DC2626'

const statusBg = (s: string) => statusColor(s) + '12'

function tierInfo(tier: string): { label: string; color: string } {
  if (tier === 'approve') return { label: 'PROCEED', color: '#16A34A' }
  if (tier === 'conditional') return { label: 'CONDITIONAL', color: '#D97706' }
  return { label: 'DECLINE', color: '#DC2626' }
}

const DIMENSION_LABELS: Record<string, { en: string; zh: string; weight: number }> = {
  ability_to_pay: { en: 'Income / Ability to Pay', zh: '付款能力', weight: 0.40 },
  credit_health:  { en: 'Credit Health', zh: '信用健康度', weight: 0.25 },
  rental_history: { en: 'Rental & Legal History', zh: '租务与司法历史', weight: 0.20 },
  verification:   { en: 'Identity & Employer', zh: '身份与雇主核实', weight: 0.10 },
  communication:  { en: 'Application Quality', zh: '申请完整度与沟通', weight: 0.05 },
}

const money = (n: number | null | undefined) =>
  typeof n === 'number' ? '$' + Math.round(n).toLocaleString() : '—'

const sevLabel = (sev: string, zh: boolean) =>
  zh
    ? ({ critical: '严重', high: '高', medium: '中', low: '低', info: '佐证' } as Record<string, string>)[sev] || sev
    : sev.toUpperCase()

// Reconstruct the full ScoreResult from a saved screening row — mirrors the
// screening history loader: the scoring route packs the complete snapshot
// into ai_dimension_notes._v3; individual columns are the fallback.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function reconstructResult(row: any): ScoreResult {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const v3: Record<string, any> = (row?.ai_dimension_notes && row.ai_dimension_notes._v3) || {}
  const scoresV3 = v3.scores || row.scores_v3 || (row.ability_to_pay_score != null ? {
    ability_to_pay: row.ability_to_pay_score ?? 0,
    credit_health: row.credit_health_score ?? 0,
    rental_history: row.rental_history_score ?? 0,
    verification: row.verification_score ?? 0,
    communication: row.communication_score ?? 0,
  } : undefined)
  return {
    screening_id: row.id,
    overall: row.ai_score ?? 0,
    file_count: Array.isArray(row.files) ? row.files.length : 0,
    scores: v3.legacy_scores || {
      doc_authenticity: row.doc_authenticity_score ?? 0,
      payment_ability: row.payment_ability_score ?? 0,
      court_records: row.court_records_score ?? 0,
      stability: row.stability_score ?? 0,
      behavior_signals: row.behavior_signals_score ?? 0,
      info_consistency: row.info_consistency_score ?? 0,
    },
    notes: {},
    details_en: v3.details_en ?? row.ai_dimension_notes?._details_en ?? null,
    details_zh: v3.details_zh ?? row.ai_dimension_notes?._details_zh ?? null,
    flags: Array.isArray(v3.flags) ? v3.flags : [],
    detected_document_kinds: Array.isArray(v3.detected_document_kinds) ? v3.detected_document_kinds : [],
    detected_monthly_income: v3.detected_monthly_income ?? null,
    effective_monthly_income: v3.effective_monthly_income ?? null,
    income_evidence: v3.income_evidence ?? row.ai_dimension_notes?._income_evidence ?? null,
    monthly_rent: v3.monthly_rent ?? (row.monthly_rent != null ? Number(row.monthly_rent) : null),
    income_rent_ratio: v3.income_rent_ratio ?? (row.income_rent_ratio != null ? Number(row.income_rent_ratio) : null),
    extracted_name: v3.extracted_name || row.ai_extracted_name || row.tenant_name || '',
    name_was_extracted: !!row.ai_extracted_name,
    summary: v3.summary_en || row.ai_summary_en || row.ai_summary || '',
    summary_en: v3.summary_en || row.ai_summary_en || row.ai_summary || '',
    summary_zh: v3.summary_zh || row.ai_summary_zh || '',
    court_summary_en: v3.court_summary_en || row.court_summary_en || '',
    court_summary_zh: v3.court_summary_zh || row.court_summary_zh || '',
    court_records_detail: v3.court_records_detail ?? row.court_records_detail ?? { queries: [], total_hits: 0, queried_name: '' },
    ltb_check: v3.ltb_check ?? null,
    tier: row.tier === 'pro' ? 'pro' : 'free',
    model_version: v3.model_version || row.model_version || undefined,
    scores_v3: scoresV3,
    v3_tier: v3.tier || row.v3_tier || undefined,
    tier_reason: v3.tier_reason || row.tier_reason || undefined,
    hard_gates_triggered: v3.hard_gates_triggered || row.hard_gates_triggered || [],
    red_flags: v3.red_flags || row.red_flags || [],
    red_flag_penalty: v3.red_flag_penalty ?? row.red_flag_penalty ?? 0,
    gate_cap: v3.gate_cap ?? (row.gate_cap != null ? Number(row.gate_cap) : undefined),
    evidence_coverage: v3.evidence_coverage ?? (row.evidence_coverage != null ? Number(row.evidence_coverage) : undefined),
    sub_coverage: v3.sub_coverage || row.sub_coverage || {},
    identity_match_score: v3.identity_match_score ?? row.identity_match_score ?? null,
    bank_min_balance: v3.bank_min_balance ?? (row.bank_min_balance != null ? Number(row.bank_min_balance) : null),
    credit_report: v3.credit_report ?? null,
    // 2026-07 cross-document verification block — only exists on reports
    // scored after the prompt addition; old reports reconstruct as null and
    // the section stays hidden.
    cross_doc_verification: v3.cross_doc_verification ?? null,
    action_items: v3.action_items || row.action_items || [],
    compliance_audit: v3.compliance_audit ?? row.compliance_audit ?? null,
    forensics_detail: v3.forensics_detail ?? row.forensics_detail ?? null,
    forensics_penalty: v3.forensics_penalty ?? row.forensics_penalty ?? 0,
    forensics_zeroed_dims: v3.forensics_zeroed_dims ?? [],
    deep_check_result: row.deep_check_result ?? null,
  }
}

/* ────────────────────── SECTION COMPONENTS ──────────────────── */

function SectionShell({
  id,
  title,
  subtitle,
  defaultOpen = true,
  children,
}: {
  id: string
  title: string
  subtitle?: string
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div id={id} className="rounded-2xl border border-line-divider bg-white shadow-sm">
      <button
        className="flex w-full items-center justify-between px-6 py-5 text-left sm:px-8"
        onClick={() => setOpen(!open)}
      >
        <div>
          <h3 className="text-[16px] font-extrabold tracking-tight">{title}</h3>
          {subtitle && <p className="mt-0.5 font-mono text-[11px] text-body-3">{subtitle}</p>}
        </div>
        <span className="text-[18px] text-body-3 transition-transform" style={{ transform: open ? 'rotate(0deg)' : 'rotate(-90deg)' }}>
          &#9662;
        </span>
      </button>
      {open && <div className="border-t border-line-divider px-6 pb-6 pt-5 sm:px-8">{children}</div>}
    </div>
  )
}

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span
      className="inline-block rounded-md px-2 py-0.5 font-mono text-[10px] font-bold"
      style={{ color, background: color + '12' }}
    >
      {label}
    </span>
  )
}

function KV({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-0.5 py-0.5">
      <span className="font-mono text-[11px] font-bold uppercase text-body-3" style={{ minWidth: 130 }}>{k}</span>
      <span className="text-[13px] text-body-2">{children}</span>
    </div>
  )
}

/* ─────────────────── LOADING / ERROR ─────────────────── */

function LoadingShell() {
  return (
    <div style={{ background: '#FAF7EE', minHeight: '100vh' }} className="flex flex-col">
      <Header variant="solid" />
      <div className="flex flex-1 items-center justify-center">
        <div className="text-center">
          <div className="inline-block h-10 w-10 animate-spin rounded-full border-2 border-[#047857] border-t-transparent" />
          <p className="mt-4 font-mono text-[13px] text-[#999]">Loading report...</p>
        </div>
      </div>
      <Footer />
    </div>
  )
}

function NotFoundShell() {
  return (
    <div style={{ background: '#FAF7EE', minHeight: '100vh' }} className="flex flex-col">
      <Header variant="solid" />
      <div className="flex flex-1 items-center justify-center">
        <div className="text-center">
          <div className="text-[48px]">&#128269;</div>
          <h2 className="mt-4 text-[22px] font-extrabold">Screening not found</h2>
          <p className="mt-2 text-[14px] text-[#999]">This screening does not exist or you do not have access.</p>
          <Link href="/screening" className="mt-6 inline-block rounded-lg px-5 py-2.5 text-[13px] font-bold text-white" style={{ background: '#047857' }}>
            Back to Screenings
          </Link>
        </div>
      </div>
      <Footer />
    </div>
  )
}

/* ══════════════════════════ MAIN PAGE ══════════════════════════ */

export default function ReportPage() {
  const params = useParams()
  const id = params?.id as string
  const { loading: authLoading, user } = useAuth()
  const { lang } = useT()
  const zh = lang === 'zh'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [screening, setScreening] = useState<any>(null)
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    if (!user || !id) return
    supabase
      .from('screenings')
      .select('*')
      .eq('id', id)
      // Ownership is enforced by RLS, which accepts BOTH landlord_id forms
      // (legacy rows store profileId, newer rows store authId). Filtering
      // by user.id here broke loading of legacy screenings.
      .single()
      .then(({ data, error }) => {
        if (error || !data) setLoadError(true)
        else setScreening(data)
      })
  }, [user, id])

  if (authLoading || (!screening && !loadError)) return <LoadingShell />
  if (loadError) return <NotFoundShell />

  // Full pipeline snapshot (ai_dimension_notes._v3 + column fallbacks)
  const r = reconstructResult(screening)
  const score = r.overall
  const tier = r.v3_tier ?? 'decline'
  const ti = tierInfo(tier)
  const applicantName = r.extracted_name || (zh ? '申请人' : 'Applicant')
  const dims = r.scores_v3 || {}
  const summary = zh ? (r.summary_zh || r.summary_en || r.summary) : (r.summary_en || r.summary || r.summary_zh)
  const altSummary = zh ? (r.summary_en || '') : (r.summary_zh || '')
  const forensics = r.forensics_detail
  const courtDetail = r.court_records_detail as { queries: CourtQuery[]; total_hits: number; queried_name: string; databases_searched?: number; partial?: boolean }
  const ltb = (r as { ltb_check?: LtbCheck | null }).ltb_check ?? null
  const courtQueries: CourtQuery[] = courtDetail?.queries || []
  const redFlags = r.red_flags || []
  const hardGates = r.hard_gates_triggered || []
  const actionItems = r.action_items || []
  const fileCount = r.file_count ?? 0
  const coverage = r.evidence_coverage != null ? Math.round(r.evidence_coverage * 100) : null
  const rent = r.monthly_rent
  const ratio = r.income_rent_ratio
  const createdAt = screening.created_at ? new Date(screening.created_at).toLocaleString() : ''
  const scoredAt = screening.scored_at ? new Date(screening.scored_at).toLocaleString() : ''

  const passCount = Object.values(dims).filter((v: unknown) => typeof v === 'number' && (v as number) >= 70).length
  const infoCount = Object.values(dims).filter((v: unknown) => typeof v === 'number' && (v as number) >= 50 && (v as number) < 70).length
  const redCount = hardGates.length + redFlags.length

  // Forensic check matrix (shared logic with the print report)
  const checkMatrix = buildForensicCheckMatrix(forensics, r.deep_check_result)
  const checksRan = checkMatrix.filter(c => c.status !== 'na').length

  // Court rows: disclose every free-tier query, incl. 0-hit / timeout rows
  const courtRows = courtQueries.filter(q => !q.source.startsWith('──') && q.source !== 'rollup' && q.tier === 'free')
  const canliiRecords = courtQueries.flatMap(q => (q.records || []).map(rec => ({ ...rec, dbSource: q.source })))
  const portalRecords: OntarioPortalMatch[] = courtQueries.flatMap(q => q.portalRecords || [])
  const totalHits = courtDetail?.total_hits || 0
  const queriedName = courtDetail?.queried_name || '—'
  const sourcesSearched = courtDetail?.databases_searched
  const okDbCount = courtRows.filter(q => q.status === 'ok').length

  // Income: per-paystub verification rows from forensics
  const paystubFiles = (forensics?.per_file || []).filter(pf =>
    pf.paystub_math && (pf.paystub_math.extraction?.annual_salary || pf.paystub_math.extraction?.ytd_gross || typeof pf.paystub_math.ytd_ratio === 'number'))

  const cr = r.credit_report
  const hasCreditReport = !!(cr && (cr.credit_score != null || (cr.tradelines && cr.tradelines.length > 0) || (cr.collections && cr.collections.length) || (cr.bankruptcies && cr.bankruptcies.length)))

  // Cross-document verification block (2026-07). Old reports have no data —
  // the whole section hides; every sub-block is individually guarded too.
  const cdv = r.cross_doc_verification
  const cdvApp = cdv?.application_summary
  const hasCdv = !!(cdv && (
    (cdv.bank_accounts?.length || 0) > 0 ||
    cdv.income_corroboration ||
    (cdv.related_party && (cdv.related_party.suspected || (cdv.related_party.signals?.length || 0) > 0)) ||
    cdvApp ||
    (cdv.suspicious_transfers?.length || 0) > 0 ||
    (cdv.verification_checklist?.length || 0) > 0
  ))
  const CDV_VERDICT: Record<string, { zh: string; en: string; color: string }> = {
    corroborated: { zh: '已佐证', en: 'CORROBORATED', color: '#16A34A' },
    partial: { zh: '部分佐证', en: 'PARTIAL', color: '#D97706' },
    uncorroborated: { zh: '未获佐证', en: 'UNCORROBORATED', color: '#DC2626' },
  }

  const dc = r.deep_check_result
  const ca = r.compliance_audit

  const subCov = r.sub_coverage || {}
  const SUB_LABELS: Record<string, { zh: string; en: string }> = {
    income_rent_ratio: { zh: '收入/租金比', en: 'Income-to-rent ratio' },
    income_stability: { zh: '收入稳定性', en: 'Income stability' },
    emergency_reserves: { zh: '应急储备金', en: 'Emergency reserves' },
    credit_score: { zh: '信用分数', en: 'Credit score' },
    dti: { zh: '非租负债比 (DTI)', en: 'Non-rent DTI' },
    prior_landlord_refs: { zh: '前房东推荐', en: 'Prior landlord references' },
    ltb_check: { zh: 'LTB 记录核查', en: 'LTB record check' },
    employer_verify: { zh: '雇主核实', en: 'Employer verification' },
    doc_authenticity: { zh: '文件真实性', en: 'Document authenticity' },
    identity_match: { zh: '身份一致性', en: 'Identity match' },
  }
  const COV_STATUS: Record<string, { zh: string; en: string; color: string }> = {
    measured: { zh: '已从文件实测', en: 'Measured from documents', color: '#16A34A' },
    inferred: { zh: '间接推断', en: 'Inferred', color: '#A16207' },
    action_pending: { zh: '待房东核实', en: 'Pending landlord action', color: '#D97706' },
    missing: { zh: '证据缺失', en: 'Missing', color: '#DC2626' },
  }

  const detectedKinds = new Set(r.detected_document_kinds || [])
  const RECOMMENDED_DOCS: Array<{ key: string; zh: string; en: string }> = [
    { key: 'id_document', zh: '身份证件', en: 'Government ID' },
    { key: 'pay_stub', zh: '工资单', en: 'Pay Stubs' },
    { key: 'employment_letter', zh: '雇佣信', en: 'Employment Letter' },
    { key: 'bank_statement', zh: '银行流水', en: 'Bank Statements' },
    { key: 'credit_report', zh: '信用报告', en: 'Credit Report' },
    { key: 'reference', zh: '推荐信 / 前房东', en: 'Reference / Prior Landlord' },
  ]

  const cmIcon = (s: string) => (s === 'pass' ? '✓' : s === 'warn' ? '⚠' : s === 'fail' ? '✗' : '—')
  const cmColor = (s: string) => (s === 'pass' ? '#16A34A' : s === 'warn' ? '#D97706' : s === 'fail' ? '#DC2626' : '#94A3B8')

  return (
    <div style={{ background: '#FAF7EE', color: '#171717', minHeight: '100vh' }}>
      <Header variant="solid" />

      <div className="mx-auto max-w-[1100px] px-5 pb-24 pt-10 sm:px-7 lg:px-8">

        {/* TOP HEADER */}
        <div className="flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-body-3">
          <span className="inline-block h-[6px] w-[6px] rounded-full" style={{ background: '#16A34A', boxShadow: '0 0 6px #16A34A' }} />
          {zh ? '筛查报告' : 'SCREENING REPORT'} &middot; {screening.status === 'done' || screening.status === 'scored' ? (zh ? '已完成' : 'COMPLETE') : screening.status?.toUpperCase()}
        </div>

        <h1 className="mt-4 text-[28px] font-extrabold leading-tight tracking-tight sm:text-[34px]">
          {applicantName} &middot; {zh ? '完整报告' : 'Full Report'}
        </h1>

        <div className="mt-2 break-all font-mono text-[11px] text-body-3">
          {zh ? '报告编号' : 'REPORT ID'} {id}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[11px] text-body-3">
          {createdAt && <span>{zh ? '提交' : 'SUBMITTED'} {createdAt}</span>}
          {scoredAt && (<><span>&middot;</span><span>{zh ? '完成' : 'SCORED'} {scoredAt}</span></>)}
          <span>&middot;</span>
          <span>{Object.keys(dims).length} {zh ? '维度' : 'DIMENSIONS'}</span>
          {coverage != null && (
            <>
              <span>&middot;</span>
              <span>{coverage}% {zh ? '证据覆盖' : 'COVERAGE'}</span>
            </>
          )}
          {r.model_version && (<><span>&middot;</span><span>{r.model_version.toUpperCase()}</span></>)}
        </div>

        {/* Actions bar */}
        <div className="mt-5 flex flex-wrap gap-2">
          <Link
            href={`/screening/${id}/done`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line-divider bg-white px-4 py-2 font-mono text-[12px] text-body-2 transition hover:border-line-strong"
          >
            &larr; {zh ? '摘要' : 'Summary'}
          </Link>
          <Link
            href={`/screening/${id}/ltb`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line-divider bg-white px-4 py-2 font-mono text-[12px] text-body-2 transition hover:border-line-strong"
          >
            {zh ? 'LTB 深查' : 'LTB Deep Dive'} &rarr;
          </Link>
          <Link
            href={`/screening/${id}/graph`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line-divider bg-white px-4 py-2 font-mono text-[12px] text-body-2 transition hover:border-line-strong"
          >
            {zh ? '关系图谱' : 'Network Graph'} &rarr;
          </Link>
          <Link
            href={`/screening/${id}/share`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line-divider bg-white px-4 py-2 font-mono text-[12px] text-body-2 transition hover:border-line-strong"
          >
            {zh ? '分享' : 'Share'}
          </Link>
          <button
            onClick={() => { void generateScreeningReport(r, zh ? 'zh' : 'en', fileCount) }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line-divider bg-white px-4 py-2 font-mono text-[12px] text-body-2 transition hover:border-line-strong"
          >
            {zh ? '打印 / PDF' : 'Print / PDF'}
          </button>
        </div>

        {/* VERDICT CARD */}
        <div
          className="mt-8 rounded-2xl border-2 p-6 sm:p-8"
          style={{ borderColor: ti.color, background: statusBg(tier) }}
        >
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-mono text-[22px] font-extrabold" style={{ color: ti.color }}>
              {ti.label}
            </span>
            <Badge label={`${passCount} PASS`} color="#16A34A" />
            <Badge label={`${infoCount} INFO`} color="#D97706" />
            <Badge label={`${redCount} FLAGS`} color="#DC2626" />
          </div>
          {r.tier_reason && (
            <div className="mt-2 font-mono text-[11px] text-body-3">
              {zh ? '判定依据' : 'REASON'}: {r.tier_reason}
            </div>
          )}
          {summary && (
            <p className="mt-3 text-[13.5px] leading-relaxed text-body-2">{summary}</p>
          )}
        </div>

        {/* HARD GATES & RED FLAGS — pinned right after the verdict */}
        {(redFlags.length > 0 || hardGates.length > 0) && (
          <div className="mt-4 rounded-2xl border-2 bg-white p-6 sm:p-8" style={{ borderColor: '#DC2626' }}>
            <h3 className="text-[16px] font-extrabold tracking-tight" style={{ color: '#DC2626' }}>
              {zh ? '硬门槛与风险标记' : 'HARD GATES & RED FLAGS'}
            </h3>
            <p className="mt-0.5 font-mono text-[11px] text-body-3">
              {zh ? `${hardGates.length} 个硬门槛 · ${redFlags.length} 个风险标记` : `${hardGates.length} gate(s), ${redFlags.length} flag(s)`}
            </p>
            {hardGates.length > 0 && (
              <div className="mt-4">
                <div className="mb-2 font-mono text-[10px] font-bold" style={{ color: '#DC2626' }}>
                  {zh ? '硬门槛（一票否决信号）' : 'HARD GATES TRIGGERED (OVERRIDING SIGNALS)'}
                </div>
                <div className="space-y-2">
                  {hardGates.map((g: string, i: number) => (
                    <div key={i} className="flex items-center gap-2 rounded-lg px-4 py-2.5" style={{ background: '#DC262608' }}>
                      <Badge label="GATE" color="#DC2626" />
                      <span className="font-mono text-[12px] text-body-2">{g}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {redFlags.length > 0 && (
              <div className="mt-4">
                <div className="mb-2 font-mono text-[10px] font-bold" style={{ color: '#EA580C' }}>
                  {zh ? '风险标记' : 'RED FLAGS'}
                </div>
                <div className="space-y-2">
                  {redFlags.map((f: string, i: number) => (
                    <div key={i} className="flex items-center gap-2 rounded-lg px-4 py-2.5" style={{ background: '#EA580C08' }}>
                      <Badge label="FLAG" color="#EA580C" />
                      <span className="text-[13px] text-body-2">{f}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {(r.red_flag_penalty != null || r.gate_cap != null || (r.forensics_penalty ?? 0) > 0) && (
              <div className="mt-4 font-mono text-[11px] text-body-3">
                {zh ? '评分影响' : 'Score impact'}:
                {r.red_flag_penalty != null && ` ${zh ? '标记扣分' : 'flag penalty'} -${r.red_flag_penalty}`}
                {(r.forensics_penalty ?? 0) > 0 && ` · ${zh ? '其中取证扣分' : 'incl. forensics'} -${r.forensics_penalty}`}
                {r.gate_cap != null && r.gate_cap < 100 && ` · ${zh ? '硬门槛封顶' : 'gate cap'} ${r.gate_cap}`}
              </div>
            )}
          </div>
        )}

        {/* SCORE SUMMARY */}
        <div className="mt-8 rounded-2xl border border-line-divider bg-white p-6 shadow-sm sm:p-8">
          <div className="flex items-baseline gap-3">
            <span className="font-mono text-[36px] font-extrabold tracking-tight">{score}</span>
            <span className="font-mono text-[14px] text-body-3">/ 100</span>
            <span className="font-mono text-[12px] font-bold" style={{ color: '#16A34A' }}>{zh ? '综合评分' : 'COMPOSITE SCORE'}</span>
          </div>

          {/* Stats row */}
          <div className="mt-3 flex flex-wrap items-center gap-4 font-mono text-[12px] text-body-3">
            {rent != null && rent > 0 && <span>{zh ? '租金' : 'Rent'}: ${rent.toLocaleString()}/mo</span>}
            {ratio != null && <span>{zh ? '收入/租金' : 'Income/Rent'}: {ratio.toFixed(1)}x</span>}
            <span>{zh ? '文件' : 'Files'}: {fileCount}</span>
            {checksRan > 0 && <span>{zh ? '取证检查' : 'Forensic checks'}: {checksRan}/{checkMatrix.length}</span>}
            {sourcesSearched != null && <span>{zh ? '法庭数据源' : 'Court sources'}: {sourcesSearched}</span>}
          </div>

          {Object.keys(dims).length > 0 && (
            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {Object.entries(dims).map(([key, val]) => {
                const dimScore = typeof val === 'number' ? val : 0
                const meta = DIMENSION_LABELS[key] || { en: key, zh: key, weight: 0 }
                const zeroed = (r.forensics_zeroed_dims || []).includes(key)
                const dimStatus = zeroed ? 'FAIL' : dimScore >= 70 ? 'PASS' : dimScore >= 50 ? 'INFO' : 'FAIL'
                return (
                  <div key={key} className="rounded-xl border border-line-divider p-3">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[20px] font-extrabold">{dimScore}</span>
                      <Badge label={zeroed ? (zh ? '取证归零' : 'ZEROED') : dimStatus} color={statusColor(dimStatus)} />
                    </div>
                    <div className="mt-1 text-[12px] font-semibold text-body">{zh ? meta.zh : meta.en}</div>
                    {meta.weight > 0 && (
                      <div className="font-mono text-[10px] text-body-4">{Math.round(meta.weight * 100)}% {zh ? '权重' : 'weight'}</div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* COLLAPSIBLE SECTIONS */}
        <div className="mt-8 space-y-4">

          {/* Report provenance / methodology */}
          <SectionShell
            id="provenance"
            title={zh ? '报告来源与方法论' : 'REPORT PROVENANCE & METHODOLOGY'}
            subtitle={zh ? '报告编号 · 检查时间 · 数据来源清单' : 'Report ID · timestamps · data source inventory'}
          >
            <div className="space-y-0.5">
              <KV k={zh ? '报告编号' : 'Report ID'}><span className="break-all font-mono text-[12px]">{id}</span></KV>
              {createdAt && <KV k={zh ? '材料提交时间' : 'Submitted'}>{createdAt}</KV>}
              {scoredAt && <KV k={zh ? '分析完成时间' : 'Completed'}>{scoredAt}</KV>}
              <KV k={zh ? '分析引擎' : 'Engine'}>Stayloop AI {r.model_version || 'v3'} — {zh ? '5 维加权评分 + 硬门槛 + 确定性取证' : '5-dim weighted scoring + hard gates + deterministic forensics'}</KV>
              {forensics?.elapsed_ms != null && (
                <KV k={zh ? '取证耗时' : 'Forensics runtime'}>{(forensics.elapsed_ms / 1000).toFixed(1)}s · {forensics.per_file?.length || 0} {zh ? '份文件' : 'file(s)'}</KV>
              )}
            </div>
            <div className="mt-4 rounded-xl border border-line-divider bg-[#FAFAF8] p-4">
              <div className="mb-2 font-mono text-[10px] font-bold uppercase text-body-3">{zh ? '数据来源清单' : 'Data sources used'}</div>
              <ul className="space-y-1.5 text-[13px] text-body-2">
                <li>• {zh ? '确定性文件取证引擎 — PDF 元数据、内部结构指纹、数学复算（CRA 扣缴 / YTD / Benford）、跨文档核对，全部在服务端确定性计算，非 AI 推断' : 'Deterministic document forensics engine — PDF metadata, internal structure fingerprints, math recomputation (CRA deductions / YTD / Benford), cross-document checks. Computed server-side, not AI-inferred.'}</li>
                <li>• {zh ? 'AI 视觉分析 — 文件内容读取、OCR、信用报告真伪视觉复核' : 'AI vision analysis — document content reading, OCR, credit-report authenticity second opinion'}</li>
                <li>• {zh ? `CanLII 公开判例库 — 安省全部法院/仲裁庭数据库${sourcesSearched ? `（本次共检索 ${sourcesSearched} 个数据源）` : ''}` : `CanLII public case-law — all Ontario court/tribunal databases${sourcesSearched ? ` (${sourcesSearched} sources searched this run)` : ''}`}</li>
                <li>• {zh ? '安省法院公开门户 — 民事与小额法庭立案系统（含 CanLII 未收录的新近立案）' : 'Ontario Courts public portal — Civil & Small Claims filings (incl. recent cases not yet on CanLII)'}</li>
                {dc && dc.checks?.length > 0 && (
                  <li>• {zh ? '加拿大公司注册库（OpenCorporates）— 雇主独立性深度核查' : "Canadian corporate registries (OpenCorporates) — employer arm's-length deep check"}</li>
                )}
              </ul>
              <p className="mt-3 text-[11px] leading-relaxed text-body-3">
                {zh
                  ? '本报告不含信用局（Equifax / TransUnion）直连征信数据；信用信息仅来自申请人自行上传的信用报告的 AI 转录（另有真伪取证）。'
                  : 'This report does NOT include direct credit-bureau (Equifax / TransUnion) pulls; credit information comes only from AI transcription of the applicant-uploaded credit report (with separate authenticity forensics).'}
              </p>
            </div>
          </SectionShell>

          {/* AI Summary */}
          {summary && (
            <SectionShell id="ai-summary" title={zh ? 'AI 评估摘要' : 'AI SUMMARY'} subtitle={zh ? 'AI 生成的综合分析' : 'Generated analysis'}>
              <p className="text-[14px] leading-relaxed text-body-2">{summary}</p>
              {altSummary && altSummary !== summary && (
                <div className="mt-4 rounded-lg border border-line-divider bg-[#FAFAF8] p-4">
                  <div className="mb-2 font-mono text-[10px] font-bold uppercase text-body-3">{zh ? 'English Summary' : 'Chinese Summary'}</div>
                  <p className="text-[13px] leading-relaxed text-body-2">{altSummary}</p>
                </div>
              )}
            </SectionShell>
          )}

          {/* Dimension Detail */}
          {Object.keys(dims).length > 0 && (
            <SectionShell id="dimensions" title={zh ? '维度评分明细' : 'DIMENSION SCORES'} subtitle={zh ? `${Object.keys(dims).length} 个维度评估` : `${Object.keys(dims).length} dimensions evaluated`}>
              <div className="space-y-5">
                {Object.entries(dims).map(([key, val]) => {
                  const dimScore = typeof val === 'number' ? val : 0
                  const meta = DIMENSION_LABELS[key] || { en: key, zh: key, weight: 0 }
                  const zeroed = (r.forensics_zeroed_dims || []).includes(key)
                  const color = zeroed ? '#DC2626' : dimScore >= 70 ? '#047857' : dimScore >= 50 ? '#D97706' : '#DC2626'
                  const detail = zh
                    ? (r.details_zh as Record<string, string> | null)?.[key] || (r.details_en as Record<string, string> | null)?.[key] || ''
                    : (r.details_en as Record<string, string> | null)?.[key] || ''
                  return (
                    <div key={key}>
                      <div className="flex items-center justify-between">
                        <span className="text-[13px] font-semibold text-body">
                          {zh ? meta.zh : meta.en}
                          {meta.weight > 0 && <span className="ml-2 font-mono text-[10px] text-body-3">({Math.round(meta.weight * 100)}%)</span>}
                          {zeroed && <span className="ml-2 font-mono text-[10px] font-bold" style={{ color: '#DC2626' }}>{zh ? '取证归零' : 'FORENSICS ZEROED'}</span>}
                        </span>
                        <span className="font-mono text-[16px] font-extrabold" style={{ color }}>{dimScore}</span>
                      </div>
                      <div className="mt-1.5 h-2 overflow-hidden rounded-full" style={{ background: '#F0EDE4' }}>
                        <div className="h-full rounded-full" style={{ width: `${dimScore}%`, background: color, transition: 'width 0.7s ease' }} />
                      </div>
                      {detail && <p className="mt-1.5 text-[12.5px] leading-relaxed text-body-3">{detail}</p>}
                    </div>
                  )
                })}
              </div>
            </SectionShell>
          )}

          {/* Income verification math */}
          {(r.effective_monthly_income != null || r.detected_monthly_income != null || ratio != null || r.bank_min_balance != null || paystubFiles.length > 0) && (
            <SectionShell
              id="income"
              title={zh ? '收入验证与计算过程' : 'INCOME VERIFICATION & MATH'}
              subtitle={zh ? '收入提取 · 工资单复算 · 收入/租金倍数' : 'Income extraction · paystub recomputation · rent multiple'}
            >
              <div className="space-y-0.5">
                {r.effective_monthly_income != null && (
                  <KV k={zh ? '有效月收入' : 'Effective income'}>
                    <strong>{money(r.effective_monthly_income)}/{zh ? '月' : 'mo'}</strong>
                    {r.income_evidence && <span className="ml-2 text-[12px] text-body-3">{r.income_evidence}</span>}
                  </KV>
                )}
                {r.detected_monthly_income != null && r.detected_monthly_income !== r.effective_monthly_income && (
                  <KV k={zh ? 'AI 检测月收入' : 'Detected income'}>{money(r.detected_monthly_income)}/{zh ? '月（文件中声明的原始数值）' : 'mo (raw figure stated in documents)'}</KV>
                )}
                {rent != null && rent > 0 && <KV k={zh ? '目标月租金' : 'Target rent'}>{money(rent)}/{zh ? '月' : 'mo'}</KV>}
                {ratio != null && (
                  <KV k={zh ? '收入/租金比' : 'Income-to-rent'}>
                    <strong style={{ color: ratio >= 3 ? '#16A34A' : ratio >= 2 ? '#D97706' : '#DC2626' }}>{ratio.toFixed(1)}x</strong>
                    {r.effective_monthly_income != null && rent != null && rent > 0 && (
                      <span className="ml-2 font-mono text-[11px] text-body-3">= {money(r.effective_monthly_income)} ÷ {money(rent)}</span>
                    )}
                    <span className="ml-2 text-[12px] text-body-3">{zh ? '（行业惯例：≥3x 充足，2–3x 偏紧，<2x 风险高）' : '(guideline: ≥3x comfortable, 2–3x tight, <2x high risk)'}</span>
                  </KV>
                )}
                {r.bank_min_balance != null && (
                  <KV k={zh ? '流水最低余额' : 'Min bank balance'}>{money(r.bank_min_balance)} <span className="text-[12px] text-body-3">{zh ? '（来自银行对账单分析）' : '(from bank statement analysis)'}</span></KV>
                )}
                {r.identity_match_score != null && (
                  <KV k={zh ? '身份一致性' : 'Identity match'}>
                    <strong style={{ color: r.identity_match_score >= 70 ? '#16A34A' : r.identity_match_score >= 50 ? '#D97706' : '#DC2626' }}>{r.identity_match_score}/100</strong>
                  </KV>
                )}
              </div>

              {paystubFiles.length > 0 && (
                <div className="mt-5">
                  <div className="mb-2 font-mono text-[10px] font-bold uppercase text-body-3">{zh ? '收入来源逐件核验' : 'Per-source income verification'}</div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[560px] border-collapse text-[12.5px]">
                      <thead>
                        <tr className="border-b border-line-divider text-left font-mono text-[10px] uppercase text-body-3">
                          <th className="py-2 pr-3">{zh ? '来源文件' : 'Source document'}</th>
                          <th className="py-2 pr-3">{zh ? '雇主' : 'Employer'}</th>
                          <th className="py-2 pr-3 text-right">{zh ? '声明年薪' : 'Stated salary'}</th>
                          <th className="py-2 pr-3 text-right">{zh ? '声明 YTD' : 'Stated YTD'}</th>
                          <th className="py-2 pr-3 text-right">{zh ? '预期 YTD' : 'Expected YTD'}</th>
                          <th className="py-2 text-center">{zh ? 'YTD 一致性' : 'YTD ratio'}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paystubFiles.map((pf, i) => {
                          const ps = pf.paystub_math!
                          const rr = ps.ytd_ratio
                          const rOk = typeof rr === 'number' && rr >= 0.5 && rr <= 1.5
                          return (
                            <tr key={i} className="border-b border-line-divider/60">
                              <td className="break-all py-2 pr-3 font-mono text-[11px]">{pf.file_name}</td>
                              <td className="py-2 pr-3">{ps.extraction?.employer_name || (zh ? '未注明' : 'Not stated')}</td>
                              <td className="py-2 pr-3 text-right font-semibold">{money(ps.extraction?.annual_salary)}</td>
                              <td className="py-2 pr-3 text-right">{money(ps.extraction?.ytd_gross)}</td>
                              <td className="py-2 pr-3 text-right">{money(ps.expected_ytd_gross)}</td>
                              <td className="py-2 text-center font-mono text-[12px] font-bold" style={{ color: typeof rr !== 'number' ? '#999' : rOk ? '#16A34A' : '#DC2626' }}>
                                {typeof rr === 'number' ? `${rr.toFixed(2)}× ${rOk ? '✓' : '⚠'}` : '—'}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                  <p className="mt-2 text-[11px] leading-relaxed text-body-3">
                    {zh
                      ? 'YTD 一致性 = 工资单年初至今总额 ÷ 按声明年薪推算的预期值。接近 1.0 表示文件内部自洽；偏离过大是伪造信号。CRA 法定扣缴（CPP/EI）另行复算，见取证一节。'
                      : 'YTD ratio = stated year-to-date gross ÷ expected from annual salary. Near 1.0 = internally consistent; large deviation is a forgery signal. CRA statutory deductions (CPP/EI) are recomputed separately — see the forensics section.'}
                  </p>
                </div>
              )}
            </SectionShell>
          )}

          {/* Application summary & cross-document verification checklist */}
          {hasCdv && cdv && (
            <SectionShell
              id="cross-doc-verification"
              title={zh ? '申请表摘要与核验清单' : 'APPLICATION SUMMARY & VERIFICATION CHECKLIST'}
              subtitle={zh
                ? '跨文档证据核验 · 银行户名 · 收入佐证 · 利益相关方'
                : 'Cross-document verification · account holders · income corroboration · related parties'}
            >
              {/* Application form summary */}
              {cdvApp && (
                <div>
                  <div className="mb-2 font-mono text-[10px] font-bold uppercase text-body-3">{zh ? '租房申请表摘要' : 'Rental application summary'}</div>
                  <div className="space-y-0.5">
                    {cdvApp.applying_rent != null && (
                      <KV k={zh ? '拟租租金' : 'Applying rent'}>{money(cdvApp.applying_rent)}/{zh ? '月' : 'mo'}</KV>
                    )}
                    {cdvApp.vacating_reason && (
                      <KV k={zh ? '搬家原因' : 'Vacating reason'}>{cdvApp.vacating_reason}</KV>
                    )}
                    {(cdvApp.vehicles || []).length > 0 && (
                      <KV k={zh ? '车辆' : 'Vehicle(s)'}>{(cdvApp.vehicles || []).join(' · ')}</KV>
                    )}
                  </div>
                  {(cdvApp.prev_residences || []).length > 0 && (
                    <div className="mt-3 overflow-x-auto">
                      <table className="w-full min-w-[560px] border-collapse text-[12.5px]">
                        <thead>
                          <tr className="border-b border-line-divider text-left font-mono text-[10px] uppercase text-body-3">
                            <th className="py-2 pr-3">{zh ? '居住地址' : 'Address'}</th>
                            <th className="py-2 pr-3">{zh ? '期间' : 'Period'}</th>
                            <th className="py-2 pr-3">{zh ? '房东' : 'Landlord'}</th>
                            <th className="py-2">{zh ? '电话' : 'Phone'}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(cdvApp.prev_residences || []).map((p, i) => (
                            <tr key={i} className="border-b border-line-divider/60">
                              <td className="py-2 pr-3">{p.address || '—'}</td>
                              <td className="py-2 pr-3 font-mono text-[11px]">{p.period || '—'}</td>
                              <td className="py-2 pr-3 font-semibold">{p.landlord_name || '—'}</td>
                              <td className="py-2 font-mono text-[11px]">{p.landlord_phone || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {(cdvApp.blank_sections || []).length > 0 && (
                    <div className="mt-3">
                      <div className="mb-1.5 font-mono text-[10px] font-bold" style={{ color: '#D97706' }}>
                        {zh ? `申请表留空栏目 · ${(cdvApp.blank_sections || []).length}` : `Form sections left blank · ${(cdvApp.blank_sections || []).length}`}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {(cdvApp.blank_sections || []).map((b, i) => (
                          <span key={i} className="rounded-lg border px-3 py-1.5 text-[12px]" style={{ borderColor: '#D9770640', background: '#D9770608', color: '#A16207' }}>{b}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Bank account ownership */}
              {(cdv.bank_accounts || []).length > 0 && (
                <div className={cdvApp ? 'mt-6' : ''}>
                  <div className="mb-2 font-mono text-[10px] font-bold uppercase text-body-3">{zh ? '银行流水户名核验' : 'Bank statement account holders'}</div>
                  <div className="space-y-2">
                    {(cdv.bank_accounts || []).map((b, i) => {
                      const ok = b.is_applicant && b.entity_type === 'personal'
                      const col = ok ? '#16A34A' : '#DC2626'
                      return (
                        <div key={i} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-line-divider/60 px-4 py-2.5" style={{ background: col + '06' }}>
                          <Badge label={b.entity_type === 'business' ? (zh ? '企业账户' : 'BUSINESS') : (zh ? '个人账户' : 'PERSONAL')} color={b.entity_type === 'business' ? '#DC2626' : '#16A34A'} />
                          <span className="text-[13px] font-semibold text-body">{b.holder_name}</span>
                          {b.statement_period && <span className="font-mono text-[11px] text-body-3">{b.statement_period}</span>}
                          <span className="ml-auto whitespace-nowrap font-mono text-[11px] font-bold" style={{ color: col }}>
                            {b.is_applicant ? (zh ? '✓ 申请人本人' : '✓ Applicant') : (zh ? '✗ 非申请人本人 — 不能作为个人收入佐证' : '✗ Not the applicant — not personal-income evidence')}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Income corroboration */}
              {cdv.income_corroboration && (
                <div className="mt-6">
                  <div className="mb-2 font-mono text-[10px] font-bold uppercase text-body-3">{zh ? '收入佐证核验' : 'Income corroboration'}</div>
                  <div className="rounded-xl border border-line-divider p-4" style={{ borderLeft: `3px solid ${(CDV_VERDICT[cdv.income_corroboration.verdict] || CDV_VERDICT.partial).color}`, background: '#FAFAF8' }}>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        label={zh ? (CDV_VERDICT[cdv.income_corroboration.verdict]?.zh || cdv.income_corroboration.verdict) : (CDV_VERDICT[cdv.income_corroboration.verdict]?.en || cdv.income_corroboration.verdict)}
                        color={(CDV_VERDICT[cdv.income_corroboration.verdict] || CDV_VERDICT.partial).color}
                      />
                      {cdv.income_corroboration.claimed_monthly != null && (
                        <span className="font-mono text-[12px] text-body-3">{zh ? '声称月收入' : 'Claimed'} {money(cdv.income_corroboration.claimed_monthly)}/{zh ? '月' : 'mo'}</span>
                      )}
                      <span className="font-mono text-[11px]" style={{ color: cdv.income_corroboration.personal_payroll_seen ? '#16A34A' : '#DC2626' }}>
                        {cdv.income_corroboration.personal_payroll_seen
                          ? (zh ? '✓ 个人账户见工资入账' : '✓ personal payroll deposits seen')
                          : (zh ? '✗ 个人账户未见工资入账' : '✗ no personal payroll deposits seen')}
                      </span>
                    </div>
                    {cdv.income_corroboration.observed_pattern && (
                      <p className="mt-2 text-[12.5px] leading-relaxed text-body-2">{zh ? '实际观察' : 'Observed'}: {cdv.income_corroboration.observed_pattern}</p>
                    )}
                    {cdv.income_corroboration.detail && (
                      <p className="mt-1 text-[12.5px] leading-relaxed text-body-3">{cdv.income_corroboration.detail}</p>
                    )}
                    {cdv.income_corroboration.verdict === 'uncorroborated' && (
                      <p className="mt-2 font-mono text-[11px]" style={{ color: '#DC2626' }}>
                        {zh ? '后端已强制：付款能力分数封顶 60 · 收入稳定性证据降级为「待房东核实」' : 'Backend-enforced: ability-to-pay capped at 60 · income-stability evidence downgraded to "pending landlord action"'}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Related-party signals */}
              {cdv.related_party && (cdv.related_party.suspected || (cdv.related_party.signals || []).length > 0) && (
                <div className="mt-6">
                  <div className="mb-2 font-mono text-[10px] font-bold uppercase text-body-3">{zh ? '利益相关方信号' : 'Related-party signals'}</div>
                  <div className="rounded-xl border border-line-divider p-4" style={{ borderLeft: `3px solid ${cdv.related_party.suspected ? '#DC2626' : '#16A34A'}`, background: '#FAFAF8' }}>
                    <Badge
                      label={cdv.related_party.suspected ? (zh ? '疑似利益相关方' : 'SUSPECTED RELATED PARTY') : (zh ? '未达疑似阈值' : 'BELOW THRESHOLD')}
                      color={cdv.related_party.suspected ? '#DC2626' : '#16A34A'}
                    />
                    {(cdv.related_party.signals || []).length > 0 && (
                      <ul className="mt-2 space-y-1">
                        {(cdv.related_party.signals || []).map((sig, i) => (
                          <li key={i} className="flex items-start gap-2 text-[12.5px] leading-relaxed text-body-2">
                            <span className="mt-0.5 font-mono font-bold" style={{ color: '#DC2626' }}>·</span>{sig}
                          </li>
                        ))}
                      </ul>
                    )}
                    {cdv.related_party.suspected && (
                      <p className="mt-2 text-[11.5px] leading-relaxed text-body-3">
                        {zh
                          ? '收入声明来自利益相关方，需独立核实（CRA NOA / T4 或个人账户工资流水）。'
                          : 'The income claim comes from a non-arm\'s-length party — require independent proof (CRA NOA / T4 or personal-account payroll deposits).'}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Suspicious fund flows */}
              {(cdv.suspicious_transfers || []).length > 0 && (
                <div className="mt-6">
                  <div className="mb-2 font-mono text-[10px] font-bold uppercase" style={{ color: '#DC2626' }}>{zh ? '可疑资金流' : 'Suspicious fund flows'} · {(cdv.suspicious_transfers || []).length}</div>
                  <div className="space-y-2">
                    {(cdv.suspicious_transfers || []).map((t, i) => (
                      <div key={i} className="flex items-start gap-2 rounded-lg px-4 py-2.5 text-[12.5px] leading-relaxed text-body-2" style={{ background: '#DC262608' }}>
                        <Badge label={zh ? '资金流' : 'FLOW'} color="#DC2626" />
                        <span>{t}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Verification checklist */}
              {(cdv.verification_checklist || []).length > 0 && (
                <div className="mt-6">
                  <div className="mb-2 font-mono text-[10px] font-bold uppercase text-body-3">{zh ? '房东可执行核验清单' : 'Landlord verification checklist'} · {(cdv.verification_checklist || []).length}</div>
                  <div className="space-y-2">
                    {(cdv.verification_checklist || []).map((c, i) => (
                      <div key={i} className="flex items-start gap-3 rounded-lg border border-line-divider px-4 py-3">
                        <span className="mt-0.5 font-mono text-[12px] font-bold" style={{ color: '#047857' }}>{i + 1}.</span>
                        <span className="text-[13px] leading-relaxed text-body-2">{c}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </SectionShell>
          )}

          {/* Credit report transcription */}
          {hasCreditReport && cr && (
            <SectionShell
              id="credit"
              title={zh ? '信用报告（来自上传文件）' : 'CREDIT REPORT (FROM UPLOADED DOCUMENT)'}
              subtitle={zh ? 'AI 转录 · 已做真伪取证' : 'AI-transcribed · authenticity-checked'}
            >
              <div className="flex flex-wrap items-center gap-6">
                {cr.credit_score != null && (
                  <div>
                    <span className="font-mono text-[36px] font-extrabold" style={{ color: cr.credit_score >= 760 ? '#16A34A' : cr.credit_score >= 660 ? '#A16207' : '#DC2626' }}>
                      {cr.credit_score}
                    </span>
                    <span className="ml-2 font-mono text-[12px] text-body-3">/ 300–900{cr.score_band ? ` · ${cr.score_band}` : ''}</span>
                  </div>
                )}
                <div className="space-y-0.5">
                  <KV k={zh ? '信用局' : 'Bureau'}>{cr.bureau || (zh ? '未注明' : 'Not stated')}</KV>
                  {cr.report_date && <KV k={zh ? '报告日期' : 'Report date'}>{cr.report_date}</KV>}
                  {cr.total_debt != null && <KV k={zh ? '总负债' : 'Total debt'}>{money(cr.total_debt)}</KV>}
                  {cr.monthly_debt_payments != null && <KV k={zh ? '每月还款' : 'Monthly pmts'}>{money(cr.monthly_debt_payments)}</KV>}
                </div>
              </div>

              {(cr.tradelines || []).length > 0 && (
                <div className="mt-5">
                  <div className="mb-2 font-mono text-[10px] font-bold uppercase text-body-3">{zh ? '信用账户 (Tradelines)' : 'Credit accounts (tradelines)'} · {(cr.tradelines || []).length}</div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[640px] border-collapse text-[12.5px]">
                      <thead>
                        <tr className="border-b border-line-divider text-left font-mono text-[10px] uppercase text-body-3">
                          <th className="py-2 pr-3">{zh ? '债权人' : 'Creditor'}</th>
                          <th className="py-2 pr-3">{zh ? '类型' : 'Type'}</th>
                          <th className="py-2 pr-3">{zh ? '开户' : 'Opened'}</th>
                          <th className="py-2 pr-3 text-right">{zh ? '余额' : 'Balance'}</th>
                          <th className="py-2 pr-3 text-right">{zh ? '逾期' : 'Past due'}</th>
                          <th className="py-2 pr-3 text-center">30/60/90</th>
                          <th className="py-2">{zh ? '状态' : 'Status'}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(cr.tradelines || []).map((t, i) => (
                          <tr key={i} className="border-b border-line-divider/60">
                            <td className="py-2 pr-3 font-semibold">{t.creditor}</td>
                            <td className="py-2 pr-3">{t.type}</td>
                            <td className="py-2 pr-3 font-mono text-[11px]">{t.date_opened}</td>
                            <td className="py-2 pr-3 text-right">{money(t.balance)}</td>
                            <td className="py-2 pr-3 text-right font-semibold" style={{ color: (t.past_due ?? 0) > 0 ? '#DC2626' : undefined }}>{money(t.past_due)}</td>
                            <td className="py-2 pr-3 text-center font-mono text-[11px]" style={{ color: t.late_30_60_90 && t.late_30_60_90 !== '0/0/0' ? '#DC2626' : '#999' }}>{t.late_30_60_90 || '—'}</td>
                            <td className="py-2 text-[11.5px]">{t.payment_status}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {(cr.collections || []).length > 0 && (
                <div className="mt-5">
                  <div className="mb-2 font-mono text-[10px] font-bold uppercase" style={{ color: '#DC2626' }}>{zh ? '催收记录' : 'Collections'} · {(cr.collections || []).length}</div>
                  <div className="space-y-2">
                    {(cr.collections || []).map((c, i) => (
                      <div key={i} className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-line-divider px-4 py-2.5 text-[13px]" style={{ background: '#DC262606' }}>
                        <span className="font-semibold">{c.creditor}</span>
                        <span className="font-mono text-[11px] text-body-3">{c.date_assigned}</span>
                        <span className="text-body-3">{zh ? '原始' : 'Original'} {money(c.original_amount)}</span>
                        <span className="font-semibold" style={{ color: '#DC2626' }}>{zh ? '余额' : 'Balance'} {money(c.balance)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {(cr.bankruptcies || []).length > 0 && (
                <div className="mt-5">
                  <div className="mb-2 font-mono text-[10px] font-bold uppercase" style={{ color: '#DC2626' }}>{zh ? '破产 / 无力偿债' : 'Bankruptcies / insolvency'} · {(cr.bankruptcies || []).length}</div>
                  <div className="space-y-2">
                    {(cr.bankruptcies || []).map((b, i) => (
                      <div key={i} className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-line-divider px-4 py-2.5 text-[13px]" style={{ background: '#DC262606' }}>
                        <span className="font-mono text-[11px]">{b.date_filed}</span>
                        <span className="font-semibold">{b.type}</span>
                        <span>{money(b.amount)}</span>
                        <span className="text-body-3">{b.disposition}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {(cr.inquiries || []).length > 0 && (
                <div className="mt-5">
                  <div className="mb-2 font-mono text-[10px] font-bold uppercase text-body-3">{zh ? '近期信用查询' : 'Recent inquiries'} · {(cr.inquiries || []).length}</div>
                  <div className="flex flex-wrap gap-2">
                    {(cr.inquiries || []).map((q, i) => (
                      <span key={i} className="rounded-lg border border-line-divider px-3 py-1.5 text-[12px] text-body-2">
                        <span className="font-mono text-[11px] text-body-3">{q.date}</span> · {q.creditor}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <p className="mt-4 text-[11px] italic leading-relaxed text-body-3">
                {zh
                  ? '以上数据由 AI 从申请人上传的信用报告转录，请与原件核对。Stayloop 不直接对接信用局。'
                  : 'Transcribed by AI from the uploaded credit report — verify against the original. Stayloop does not pull bureau data directly.'}
              </p>
            </SectionShell>
          )}

          {/* Document Forensics — check matrix + per-file detail */}
          {forensics && (
            <SectionShell
              id="forensics"
              title={zh ? '文件取证：已执行的检查' : 'DOCUMENT FORENSICS — CHECKS EXECUTED'}
              subtitle={zh
                ? `${checksRan} / ${checkMatrix.length} 类检查已执行 · ${forensics.all_flags?.length || 0} 项发现 · 结论 ${String(forensics.severity || '').toUpperCase()}`
                : `${checksRan} of ${checkMatrix.length} check categories run · ${forensics.all_flags?.length || 0} finding(s) · verdict ${String(forensics.severity || '').toUpperCase()}`}
            >
              {/* Check category matrix — passed checks are listed too */}
              {checkMatrix.length > 0 && (
                <div className="space-y-2">
                  {checkMatrix.map(c => (
                    <div key={c.id} className="flex items-start gap-3 rounded-lg border border-line-divider/60 px-4 py-2.5" style={{ background: c.status === 'na' ? '#FAFAF8' : cmColor(c.status) + '06' }}>
                      <span className="mt-0.5 w-4 text-center font-mono text-[14px] font-extrabold" style={{ color: cmColor(c.status) }}>{cmIcon(c.status)}</span>
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] font-semibold" style={{ color: c.status === 'na' ? '#999' : undefined }}>{zh ? c.zh : c.en}</div>
                        <div className="text-[11.5px] leading-relaxed text-body-3">{zh ? c.desc_zh : c.desc_en}</div>
                      </div>
                      <span className="whitespace-nowrap font-mono text-[11px] font-bold" style={{ color: cmColor(c.status) }}>
                        {c.status === 'na'
                          ? (zh ? '未执行' : 'N/A')
                          : c.findings === 0
                            ? (zh ? `通过${c.positives ? ` +${c.positives} 佐证` : ''}` : `PASS${c.positives ? ` +${c.positives}` : ''}`)
                            : (zh ? `${c.findings} 项发现` : `${c.findings} finding(s)`)}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Per-file forensic evidence cards */}
              {(forensics.per_file || []).length > 0 && (
                <div className="mt-6">
                  <div className="mb-2 font-mono text-[10px] font-bold uppercase text-body-3">
                    {zh ? `逐文件取证明细 · ${forensics.per_file.length} 份文件` : `Per-document detail · ${forensics.per_file.length} file(s)`}
                  </div>
                  <div className="space-y-3">
                    {forensics.per_file.map((pf, i) => {
                      const negFlags = pf.flags.filter(f => !isPositiveForensicFlag(f))
                      const infoFlags = pf.flags.length - negFlags.length
                      const worst = negFlags.some(f => f.severity === 'critical' || f.severity === 'high') ? 'fail' : negFlags.length > 0 ? 'warn' : 'pass'
                      const vColor = cmColor(worst)
                      const m = pf.pdf_metadata
                      const ps = pf.paystub_math
                      const ss = pf.source_specific
                      const facts: Array<[string, string]> = []
                      if (m) facts.push([zh ? '页数 / 大小' : 'Pages / Size', `${m.page_count}p · ${Math.round(m.file_size_bytes / 1024)}KB`])
                      if (m?.producer) facts.push([zh ? 'PDF 生成工具' : 'PDF Producer', m.producer])
                      if (m?.title) facts.push([zh ? '内嵌标题' : 'Embedded title', m.title])
                      if (m?.creation_date) facts.push([zh ? '创建时间' : 'Created', m.creation_date])
                      if (m?.modification_date && m.modification_date !== m.creation_date) facts.push([zh ? '最后修改' : 'Modified', m.modification_date])
                      if (pf.text_density) facts.push([zh ? '文字密度' : 'Text density', `${pf.text_density.chars_per_page} ${zh ? '字符/页' : 'chars/pg'}${pf.text_density.is_likely_image_pdf ? (zh ? ' · 疑似图片型' : ' · likely image-only') : ''}`])
                      if (pf.ocr?.apparent_doc_type) facts.push([zh ? 'OCR 识别类型' : 'OCR doc type', pf.ocr.apparent_doc_type])
                      if (pf.ocr?.visible_issuer) facts.push([zh ? '签发机构' : 'Issuer', pf.ocr.visible_issuer])
                      if (ps?.extraction?.employer_name) facts.push([zh ? '雇主（文件内）' : 'Employer (on doc)', ps.extraction.employer_name])
                      if (ps?.extraction?.annual_salary) facts.push([zh ? '声明年薪' : 'Stated salary', money(ps.extraction.annual_salary)])
                      if (typeof ps?.ytd_ratio === 'number') facts.push([zh ? 'YTD 实际/预期' : 'YTD actual/expected', `${ps.ytd_ratio.toFixed(2)}×`])
                      if (typeof ps?.period_math_error_pct === 'number') facts.push([zh ? '周期数学误差' : 'Period math error', `${(ps.period_math_error_pct * 100).toFixed(1)}%`])
                      if (ss?.matched_bank) facts.push([zh ? '识别银行' : 'Matched bank', `${ss.matched_bank}${ss.bank_producer_whitelisted ? ' ✓' : (zh ? ' ⚠ 生成工具不符' : ' ⚠ producer mismatch')}`])
                      if (ss?.equifax_authentic_markers != null) facts.push([zh ? 'Equifax 真伪标记' : 'Equifax markers', ss.equifax_authentic_markers ? (zh ? '✓ 已找到' : '✓ found') : (zh ? '⚠ 未找到' : '⚠ missing')])
                      return (
                        <div key={i} className="rounded-xl border border-line-divider p-4" style={{ borderLeft: `3px solid ${vColor}`, background: '#FAFAF8' }}>
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="min-w-0">
                              <span className="break-all text-[13px] font-bold">{pf.file_name}</span>
                              <span className="ml-2 font-mono text-[10px] text-body-3">{pf.file_kind}</span>
                            </div>
                            <span className="whitespace-nowrap font-mono text-[11px] font-bold" style={{ color: vColor }}>
                              {negFlags.length === 0
                                ? (infoFlags > 0 ? (zh ? `✓ 无异常 · ${infoFlags} 项佐证` : `✓ Clean · ${infoFlags} corroboration(s)`) : (zh ? '✓ 无异常' : '✓ Clean'))
                                : `${worst === 'fail' ? '✗' : '⚠'} ${negFlags.length} ${zh ? '项发现' : 'finding(s)'}`}
                            </span>
                          </div>
                          {facts.length > 0 && (
                            <div className="mt-2 grid grid-cols-1 gap-x-6 gap-y-0.5 sm:grid-cols-2">
                              {facts.map(([k, v], j) => (
                                <div key={j} className="flex gap-2 text-[12px]">
                                  <span className="shrink-0 text-body-3">{k}</span>
                                  <span className="break-all font-mono text-[11.5px] text-body-2">{v}</span>
                                </div>
                              ))}
                            </div>
                          )}
                          {pf.flags.length > 0 && (
                            <div className="mt-2.5 space-y-1.5">
                              {pf.flags.map((f, j) => {
                                const dispSev = isPositiveForensicFlag(f) ? 'info' : f.severity
                                return (
                                  <div key={j} className="flex items-start gap-2 text-[12.5px] leading-relaxed">
                                    <Badge label={sevLabel(dispSev, zh)} color={sevColor(dispSev)} />
                                    <span className="text-body-2">{zh ? f.evidence_zh : f.evidence_en}</span>
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Cross-document flags */}
              {(forensics.cross_doc_flags || []).length > 0 && (
                <div className="mt-6">
                  <div className="mb-2 font-mono text-[10px] font-bold uppercase text-body-3">{zh ? '跨文档核对结果' : 'Cross-document findings'}</div>
                  <div className="space-y-1.5">
                    {forensics.cross_doc_flags.map((f, j) => (
                      <div key={j} className="flex items-start gap-2 text-[12.5px] leading-relaxed">
                        <Badge label={sevLabel(f.severity, zh)} color={sevColor(f.severity)} />
                        <span className="text-body-2">{zh ? f.evidence_zh : f.evidence_en}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </SectionShell>
          )}

          {/* Court Records — full search disclosure */}
          {(courtRows.length > 0 || totalHits > 0 || canliiRecords.length > 0 || portalRecords.length > 0) && (
            <SectionShell
              id="court"
              title={zh ? '法庭 / LTB 记录检索披露' : 'COURT / LTB SEARCH DISCLOSURE'}
              subtitle={zh
                ? `${sourcesSearched ?? okDbCount} 个数据源已检索 · ${totalHits} 条命中`
                : `${sourcesSearched ?? okDbCount} sources searched · ${totalHits} hit(s)`}
            >
              {(r.court_summary_en || r.court_summary_zh) && (
                <p className="mb-4 text-[13px] text-body-2">
                  {zh ? (r.court_summary_zh || r.court_summary_en) : (r.court_summary_en || r.court_summary_zh)}
                </p>
              )}
              <div className="space-y-0.5">
                <KV k={zh ? '检索姓名' : 'Queried name'}><strong>{queriedName}</strong></KV>
                <KV k={zh ? '总命中数' : 'Total hits'}><strong style={{ color: totalHits > 0 ? '#DC2626' : '#16A34A' }}>{totalHits}</strong></KV>
                {courtDetail?.partial && (
                  <KV k={zh ? '完整性' : 'Completeness'}><span style={{ color: '#D97706' }}>{zh ? '部分数据源在 12 秒预算内未响应，见下表标注' : 'Some sources did not respond within the 12s budget — see rows below'}</span></KV>
                )}
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-body-3">
                {zh
                  ? '「✓ 无记录」表示该数据源已按姓名实际检索且零命中——与「未检索」是两回事。不可用/未响应的数据源单独标注，绝不计入「无记录」。CanLII 现列为「不可用」：其 API 只支持按日期分页，不提供姓名或全文检索，因此无法用于查人。'
                  : '"✓ Clear" means that source was actually searched by name and returned nothing — distinct from "not searched". Unavailable sources are labelled separately and are never counted as clear. CanLII is listed unavailable: its API filters by date only and offers no name or full-text search, so it cannot be used to look a person up.'}
              </p>

              {courtRows.length > 0 && (
                <div className="mt-4 space-y-2">
                  {courtRows.map((q, i) => {
                    const hits = q.status === 'ok' ? (q.hits ?? 0) : null
                    const col = hits == null ? '#94A3B8' : hits > 0 ? '#DC2626' : '#16A34A'
                    const label = q.status === 'ok'
                      ? (hits! > 0 ? `${hits} ${zh ? '条命中' : 'HIT(S)'}` : (zh ? '✓ 无记录' : '✓ CLEAR'))
                      : q.status === 'timeout' ? (zh ? '超时' : 'TIMEOUT')
                      : q.status === 'skipped' ? (zh ? '已跳过' : 'SKIPPED')
                      : (zh ? '不可用' : 'N/A')
                    return (
                      <div key={i} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-line-divider/60 px-4 py-2.5" style={{ background: col + '06' }}>
                        <Badge label={label} color={col} />
                        <span className="min-w-0 flex-1 text-[13px] text-body-2">{q.source}</span>
                        {q.note && <span className="w-full text-[11px] text-body-3 sm:w-auto">{q.note}</span>}
                      </div>
                    )
                  })}
                </div>
              )}

              {ltb && (ltb.as_respondent.length > 0 || ltb.as_applicant.length > 0) && (
                <div className="mt-5">
                  <div className="mb-2 font-mono text-[10px] font-bold uppercase text-body-3">
                    {zh ? 'LTB 判令目录（安省开放数据）' : 'LTB Order Catalogue (Ontario Open Data)'}
                  </div>
                  <p className="mb-2.5 text-[12px] leading-relaxed text-body-2">{zh ? ltb.summary_zh : ltb.summary_en}</p>

                  {ltb.as_respondent.map((m, i) => (
                    <div
                      key={`r${i}`}
                      className="mb-2 rounded-lg border px-4 py-2.5 text-[13px]"
                      style={{
                        borderColor: m.address_match ? '#FCA5A5' : '#E7E2D6',
                        background: m.address_match ? '#FEF2F2' : '#FAFAF8',
                      }}
                    >
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <Badge
                          label={m.address_match
                            ? (zh ? '地址已佐证' : 'ADDRESS CORROBORATED')
                            : (zh ? '仅姓名匹配' : 'NAME ONLY')}
                          color={m.address_match ? '#DC2626' : '#A16207'}
                        />
                        <strong>{m.file_number}</strong>
                        <span className="text-body-3">{m.order_date}</span>
                        <span className="text-body-2">{describeCodes(m.application_codes, zh ? 'zh' : 'en')}</span>
                      </div>
                      <div className="mt-1 text-[12px] text-body-2">
                        {m.person_name}{m.unit_address ? ` · ${m.unit_address}` : ''}
                      </div>
                      {!m.address_match && (
                        <div className="mt-1 text-[11.5px] text-body-3">
                          {zh
                            ? '此单元地址与申请人自报的居住地址不符 —— 可能为同名他人，未计入评分。'
                            : 'This unit address does not match any address the applicant declared — possibly a different person, and not scored.'}
                        </div>
                      )}
                      {m.order_pdf_url && (
                        <a
                          href={m.order_pdf_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-1 inline-block text-[12px] font-semibold text-brand hover:underline"
                        >
                          {zh ? '查看判令原件 →' : 'Read the order →'}
                        </a>
                      )}
                    </div>
                  ))}

                  {ltb.as_applicant.length > 0 && (
                    <div className="mt-3 rounded-lg border border-line-divider px-4 py-3" style={{ background: '#F6F8FB' }}>
                      <div className="text-[12px] font-semibold">
                        {zh
                          ? `另有 ${ltb.as_applicant.length} 份是该申请人自己提起的申诉`
                          : `${ltb.as_applicant.length} further order(s) are applications this person BROUGHT`}
                      </div>
                      <p className="mt-1 text-[11.5px] leading-relaxed text-body-2">
                        {zh
                          ? '这类记录（T1/T2/T5/T6）是租客依《住宅租赁法》主张自身权利，不构成负面信号，也不计入评分。以此拒租涉嫌报复，属违法。'
                          : 'These (T1/T2/T5/T6) are the tenant asserting their own rights under the RTA. They are not a negative signal, are not scored, and declining an applicant on this basis is unlawful reprisal.'}
                      </p>
                    </div>
                  )}

                  <p className="mt-2.5 text-[11px] leading-relaxed text-body-3">
                    {zh
                      ? '来源：安省开放数据 LTB 判令目录（含依《安大略省开放政府许可》授权的信息）。目录只收录已签发的终局判令，不含判决结果字段，也不含受保密令保护的案件；当前收录范围见上。判令是否被复核、撤销或已结清，需查看原件。'
                      : 'Source: Ontario Open Data LTB Order Catalogue (contains information licensed under the Open Government Licence – Ontario). The catalogue lists issued final orders only. It carries no outcome field and excludes orders under a confidentiality order. Whether an order was reviewed, set aside or satisfied can only be seen in the order itself.'}
                  </p>
                </div>
              )}

              {canliiRecords.length > 0 && (
                <div className="mt-5">
                  <div className="mb-2 font-mono text-[10px] font-bold uppercase text-body-3">CanLII {zh ? '案件详情' : 'case details'} · {canliiRecords.length}</div>
                  <div className="space-y-2">
                    {canliiRecords.map((rec, i) => (
                      <div key={i} className="rounded-lg border border-line-divider px-4 py-2.5 text-[13px]" style={{ background: '#FAFAF8' }}>
                        <a href={rec.url} target="_blank" rel="noopener noreferrer" className="font-semibold underline decoration-line-divider underline-offset-2">{rec.title}</a>
                        <div className="mt-0.5 font-mono text-[11px] text-body-3">{rec.citation} · {rec.databaseName || rec.dbSource}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {portalRecords.length > 0 && (
                <div className="mt-5">
                  <div className="mb-2 font-mono text-[10px] font-bold uppercase text-body-3">{zh ? '安省法院门户案件' : 'Ontario Courts Portal cases'} · {portalRecords.length}</div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[560px] border-collapse text-[12.5px]">
                      <thead>
                        <tr className="border-b border-line-divider text-left font-mono text-[10px] uppercase text-body-3">
                          <th className="py-2 pr-3">{zh ? '案件编号' : 'Case #'}</th>
                          <th className="py-2 pr-3">{zh ? '标题' : 'Title'}</th>
                          <th className="py-2 pr-3">{zh ? '角色' : 'Role'}</th>
                          <th className="py-2 pr-3">{zh ? '类别' : 'Category'}</th>
                          <th className="py-2 pr-3">{zh ? '立案' : 'Filed'}</th>
                          <th className="py-2">{zh ? '状态' : 'Status'}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {portalRecords.map((p, i) => (
                          <tr key={i} className="border-b border-line-divider/60">
                            <td className="py-2 pr-3 font-mono text-[11px]">{p.caseNumber}</td>
                            <td className="py-2 pr-3">{p.caseTitle}</td>
                            <td className="py-2 pr-3 font-semibold">{p.partyRole}</td>
                            <td className="py-2 pr-3">{p.caseCategory}</td>
                            <td className="py-2 pr-3 font-mono text-[11px]">{p.filedDate ? new Date(p.filedDate).toLocaleDateString('en-CA') : ''}</td>
                            <td className="py-2 font-semibold" style={{ color: p.closedFlag ? '#999' : '#D97706' }}>{p.closedFlag ? (zh ? '已结案' : 'Closed') : (zh ? '进行中' : 'Active')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="mt-4">
                <Link
                  href={`/screening/${id}/ltb`}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-line-divider bg-white px-4 py-2 text-[12px] font-medium text-body-2 transition hover:border-line-strong"
                >
                  {zh ? '查看 LTB 深查' : 'View LTB Deep Dive'} &rarr;
                </Link>
              </div>
            </SectionShell>
          )}

          {/* Deep check — employer arm's length */}
          {dc && dc.checks?.length > 0 && (
            <SectionShell
              id="deep-check"
              title={zh ? '雇主独立性深度核查' : "EMPLOYER DEEP CHECK (ARM'S LENGTH)"}
              subtitle={zh
                ? `公司注册库比对 · ${new Date(dc.checked_at).toLocaleString()}`
                : `Corporate-registry cross-check · ${new Date(dc.checked_at).toLocaleString()}`}
            >
              <KV k={zh ? '总体结论' : 'Overall'}>
                <strong style={{ color: dc.overall_risk === 'high' ? '#DC2626' : dc.overall_risk === 'medium' ? '#D97706' : '#16A34A' }}>
                  {zh
                    ? ({ high: '高风险 — 非独立雇佣关系', medium: '中等风险', low: '低风险', clean: '正常 — 独立雇佣关系' } as Record<string, string>)[dc.overall_risk]
                    : ({ high: "High risk — not arm's length", medium: 'Medium risk', low: 'Low risk', clean: "Clean — arm's length" } as Record<string, string>)[dc.overall_risk]}
                </strong>
              </KV>
              <div className="mt-3 space-y-3">
                {dc.checks.map((check, i) => {
                  const col = check.arm_length_risk === 'high' ? '#DC2626' : check.arm_length_risk === 'medium' ? '#D97706' : '#16A34A'
                  const ci = check.company_info
                  return (
                    <div key={i} className="rounded-xl border border-line-divider p-4" style={{ borderLeft: `3px solid ${col}`, background: '#FAFAF8' }}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-[13px] font-bold">{check.employer_name}</span>
                        <Badge label={check.arm_length_risk.toUpperCase()} color={col} />
                      </div>
                      {ci ? (
                        <div className="mt-2 space-y-0.5">
                          <KV k={zh ? '注册名称' : 'Registered'}>{ci.name}</KV>
                          {ci.incorporation_date && (
                            <KV k={zh ? '成立日期' : 'Incorporated'}>
                              <span style={check.is_recently_incorporated ? { color: '#DC2626', fontWeight: 700 } : undefined}>
                                {ci.incorporation_date}{check.is_recently_incorporated && (zh ? ' ⚠ 不到 2 年' : ' ⚠ under 2 years')}
                              </span>
                            </KV>
                          )}
                          {ci.status && <KV k={zh ? '注册状态' : 'Status'}>{ci.status}</KV>}
                          {ci.officers?.length > 0 && (
                            <KV k={zh ? '董事/高管' : 'Officers'}>
                              <span style={check.applicant_is_officer ? { color: '#DC2626', fontWeight: 700 } : undefined}>
                                {ci.officers.map(o => o.name + (o.position ? ` (${o.position})` : '')).join(', ')}
                                {check.applicant_is_officer && (zh ? ' ⚠ 申请人是公司高管' : ' ⚠ applicant is an officer')}
                              </span>
                            </KV>
                          )}
                        </div>
                      ) : (
                        <div className="mt-2">
                          <p className="text-[12px] italic text-body-3">{zh ? '联邦库与各省注册库（CBR 联查）均未收录——可能是个人经营/商号，或注册在未接入的辖区' : 'Not found in the federal or participating provincial registries (via CBR) — may be a sole proprietorship/trade name, or a non-participating jurisdiction'}</p>
                          {(() => {
                            const links = registryLinks(check.employer_name, inferProvince(check.company_info?.registered_address) ?? 'ON')
                            return (
                              <div className="mt-1.5 flex flex-wrap gap-2">
                                <a href={links.openCorporatesUrl} target="_blank" rel="noopener noreferrer" className="rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-600 no-underline">{zh ? '🔎 OpenCorporates 省级搜索' : '🔎 Search OpenCorporates'}</a>
                                <a href={links.officialUrl} target="_blank" rel="noopener noreferrer" className="rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-600 no-underline">{zh ? `🏛 ${links.officialLabelZh}` : `🏛 ${links.officialLabelEn}`}</a>
                              </div>
                            )
                          })()}
                        </div>
                      )}
                      {check.flags?.length > 0 && (
                        <div className="mt-2.5 space-y-1.5">
                          {check.flags.map((f, j) => (
                            <div key={j} className="flex items-start gap-2 text-[12.5px] leading-relaxed">
                              <Badge label={sevLabel(f.severity, zh)} color={sevColor(f.severity)} />
                              <span className="text-body-2">{zh ? f.evidence_zh : f.evidence_en}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </SectionShell>
          )}

          {/* Evidence coverage + document completeness */}
          {(Object.keys(subCov).length > 0 || (r.detected_document_kinds || []).length > 0 || coverage != null) && (
            <SectionShell
              id="evidence"
              title={zh ? '证据覆盖与材料完整度' : 'EVIDENCE COVERAGE & COMPLETENESS'}
              subtitle={coverage != null ? (zh ? `总体覆盖率 ${coverage}%` : `Overall coverage ${coverage}%`) : undefined}
            >
              {coverage != null && (
                <div className="mb-5">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[11px] font-bold uppercase text-body-3">{zh ? '证据充足度' : 'Evidence coverage'}</span>
                    <span className="font-mono text-[16px] font-extrabold" style={{ color: coverage >= 75 ? '#16A34A' : coverage >= 60 ? '#A16207' : '#C2410C' }}>{coverage}%</span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full" style={{ background: '#F0EDE4' }}>
                    <div className="h-full rounded-full" style={{ width: `${coverage}%`, background: coverage >= 75 ? '#16A34A' : coverage >= 60 ? '#A16207' : '#C2410C' }} />
                  </div>
                </div>
              )}

              {Object.keys(subCov).length > 0 && (
                <div>
                  <div className="mb-2 font-mono text-[10px] font-bold uppercase text-body-3">{zh ? '各评分子项的证据来源等级' : 'Evidence grade per scoring sub-component'}</div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {Object.entries(subCov).map(([k, v]) => {
                      const lbl = SUB_LABELS[k] || { zh: k, en: k }
                      const st = COV_STATUS[v] || { zh: v, en: v, color: '#999' }
                      return (
                        <div key={k} className="flex items-center justify-between gap-2 rounded-lg border border-line-divider/60 px-3.5 py-2">
                          <span className="text-[12.5px] text-body-2">{zh ? lbl.zh : lbl.en}</span>
                          <span className="whitespace-nowrap font-mono text-[10.5px] font-bold" style={{ color: st.color }}>{zh ? st.zh : st.en}</span>
                        </div>
                      )
                    })}
                  </div>
                  <p className="mt-2 text-[11px] text-body-3">
                    {zh ? '权重：已实测 1.0 · 推断 0.6 · 待核实 0.3 · 缺失 0——加权平均即上方覆盖率。' : 'Weights: measured 1.0 · inferred 0.6 · pending 0.3 · missing 0 — the weighted average is the coverage % above.'}
                  </p>
                </div>
              )}

              {(r.detected_document_kinds || []).length > 0 && (
                <div className="mt-5">
                  <div className="mb-2 font-mono text-[10px] font-bold uppercase text-body-3">
                    {zh
                      ? `材料完整度 · 已提供 ${RECOMMENDED_DOCS.filter(d => detectedKinds.has(d.key)).length} / ${RECOMMENDED_DOCS.length} 类推荐文件`
                      : `Document completeness · ${RECOMMENDED_DOCS.filter(d => detectedKinds.has(d.key)).length} of ${RECOMMENDED_DOCS.length} recommended types provided`}
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {RECOMMENDED_DOCS.map(d => {
                      const ok = detectedKinds.has(d.key)
                      return (
                        <div key={d.key} className="flex items-center gap-2 rounded-lg border border-line-divider/60 px-3.5 py-2" style={{ background: ok ? '#16A34A06' : '#FAFAF8' }}>
                          <span className="font-mono text-[13px] font-extrabold" style={{ color: ok ? '#16A34A' : '#CBD5E1' }}>{ok ? '✓' : '—'}</span>
                          <span className="text-[12.5px]" style={{ color: ok ? undefined : '#999' }}>{zh ? d.zh : d.en}</span>
                          <span className="ml-auto font-mono text-[10px] font-bold" style={{ color: ok ? '#16A34A' : '#999' }}>{ok ? (zh ? '已提供' : 'PROVIDED') : (zh ? '未提供' : 'MISSING')}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </SectionShell>
          )}

          {/* Action Items */}
          {actionItems.length > 0 && (
            <SectionShell id="actions" title={zh ? '待人工核实清单' : 'ACTION ITEMS'} subtitle={zh ? `${actionItems.length} 项建议核实` : `${actionItems.length} recommended action(s)`}>
              <p className="mb-3 text-[12px] text-body-3">
                {zh ? '以下内容无法仅凭上传文档确认，需要您亲自核实以关闭证据缺口。' : 'These items cannot be verified from documents alone — completing them closes the evidence gaps above.'}
              </p>
              <div className="space-y-2">
                {actionItems.map((item, i) => {
                  if (typeof item === 'string') {
                    return (
                      <div key={i} className="flex items-start gap-3 rounded-lg border border-line-divider px-4 py-3">
                        <span className="mt-0.5 font-mono text-[14px] font-bold" style={{ color: '#D97706' }}>&rarr;</span>
                        <span className="text-[13px] text-body-2">{item}</span>
                      </div>
                    )
                  }
                  return (
                    <div key={i} className="rounded-lg border border-line-divider px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-[14px] font-bold" style={{ color: '#D97706' }}>&rarr;</span>
                        <span className="text-[13px] font-bold text-body">{zh ? item.title_zh || item.title_en : item.title_en || item.title_zh}</span>
                        {item.dimension && <Badge label={item.dimension} color="#6D28D9" />}
                      </div>
                      {(item.details_en || item.details_zh) && (
                        <p className="mt-1 pl-6 text-[12.5px] leading-relaxed text-body-2">{zh ? item.details_zh || item.details_en : item.details_en || item.details_zh}</p>
                      )}
                      {item.impact_on_score && (
                        <p className="mt-0.5 pl-6 font-mono text-[11px] text-body-3">{zh ? '对评分影响' : 'Score impact'}: {item.impact_on_score}</p>
                      )}
                    </div>
                  )
                })}
              </div>
            </SectionShell>
          )}

          {/* Compliance audit + legal */}
          <SectionShell
            id="legal"
            title={zh ? '合规审计与法律声明' : 'COMPLIANCE AUDIT & LEGAL'}
            subtitle="RTA &middot; PIPEDA &middot; OHRC"
            defaultOpen={false}
          >
            {ca && (
              <div className="mb-5 rounded-xl border border-line-divider bg-[#FAFAF8] p-4">
                <div className="mb-2 font-mono text-[10px] font-bold uppercase text-body-3">{zh ? '本次筛查的 HRC 合规审计' : 'HRC compliance audit for this screening'}</div>
                <div className="space-y-0.5">
                  {(ca.protected_grounds_observed || []).length > 0 && (
                    <KV k={zh ? '观察到的受保护特征' : 'Grounds observed'}>{(ca.protected_grounds_observed || []).join(', ')}</KV>
                  )}
                  <KV k={zh ? '用于评分' : 'Used in scoring'}>
                    {(ca.protected_grounds_used_in_scoring || []).length
                      ? (ca.protected_grounds_used_in_scoring || []).join(', ')
                      : <strong style={{ color: '#16A34A' }}>{zh ? '无' : 'None'}</strong>}
                  </KV>
                  <KV k={zh ? 'HRC 合规' : 'HRC compliant'}>
                    <strong style={{ color: ca.hrc_compliant ? '#16A34A' : '#DC2626' }}>{ca.hrc_compliant ? (zh ? '是 ✓' : 'Yes ✓') : (zh ? '否 ✗' : 'No ✗')}</strong>
                  </KV>
                  {ca.reviewer_note && <KV k={zh ? '审计备注' : 'Note'}><em>{ca.reviewer_note}</em></KV>}
                </div>
              </div>
            )}
            <div className="flex flex-wrap gap-3">
              {[
                { code: 'RTA', name: zh ? '《住宅租赁法》' : 'Residential Tenancies Act', detail: zh ? '安省合规' : 'Ontario compliant' },
                { code: 'PIPEDA', name: zh ? '《个人信息保护法》' : 'Personal Information Protection', detail: zh ? '联邦合规' : 'Federal compliant' },
                { code: 'OHRC', name: zh ? '《安省人权法典》' : 'Ontario Human Rights Code', detail: zh ? '17 项受保护特征不参与评分' : '17 protected grounds excluded' },
              ].map((law) => (
                <div key={law.code} className="flex-1 rounded-xl border border-line-divider p-4" style={{ minWidth: 200 }}>
                  <div className="flex items-center gap-2">
                    <Badge label={law.code} color="#047857" />
                    <span className="text-[12px] font-bold text-body">{law.name}</span>
                  </div>
                  <div className="mt-1 font-mono text-[10px] text-body-3">{law.detail}</div>
                </div>
              ))}
            </div>
            <div className="mt-5 rounded-xl border border-line-divider bg-surface-chip p-4">
              <p className="text-[11px] leading-relaxed text-body-3">
                {zh
                  ? '本报告由 Stayloop AI 基于申请人自愿提交的文件及其书面同意下获取的第三方数据自动生成。筛查未依据《安省人权法典》17 项受保护特征对申请人评分。本报告仅可在申请人知情同意下、为订立或续订租赁协议之目的查看与使用，不得向无正当目的的第三方分发。Stayloop 不是《消费者报告法》意义上的信用报告机构，本报告亦非该法意义上的「消费者报告」，不含信用局直连数据。本报告呈现的是事实发现，不构成批准或拒绝租赁申请的建议；最终决策责任由房东承担。个人信息按 PIPEDA 要求加密存储、保留 7 年，申请人有权查阅并要求更正。'
                  : 'This report is generated by Stayloop AI from documents voluntarily submitted by the applicant and third-party data obtained with the applicant’s written consent. The screening does not score applicants on any of the 17 protected grounds under the Ontario Human Rights Code. It may only be viewed and used, with the applicant’s knowledge and consent, for entering into or renewing a tenancy agreement, and may not be distributed to third parties without a valid purpose. Stayloop is not a consumer reporting agency within the meaning of the Consumer Reporting Act (Ontario), this report is not a "consumer report" under that Act, and it contains no direct credit-bureau data. The report presents factual findings only and is not a recommendation to approve or deny an application — the final decision rests with the landlord. Personal information is stored encrypted and retained for 7 years per PIPEDA; the applicant may access and correct it.'}
              </p>
            </div>
          </SectionShell>

        </div>
        {/* end collapsible sections */}

      </div>

      <Footer />
    </div>
  )
}
