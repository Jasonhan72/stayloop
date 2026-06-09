'use client'

export const runtime = 'edge'

// V5.3 · Full Comprehensive Report — loads real data from Supabase.
// Route: /screening/[id]/report

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { useAuth } from '@/lib/useAuth'
import { supabase } from '@/lib/supabase'

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

const DIMENSION_LABELS: Record<string, { label: string; weight: number }> = {
  ability_to_pay: { label: 'Income / Ability to Pay', weight: 0.40 },
  credit_health:  { label: 'Credit Health', weight: 0.25 },
  rental_history: { label: 'Rental History', weight: 0.20 },
  verification:   { label: 'Identity Verification', weight: 0.10 },
  communication:  { label: 'Communication / Behavior', weight: 0.05 },
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [screening, setScreening] = useState<any>(null)
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    if (!user || !id) return
    supabase
      .from('screenings')
      .select('*')
      .eq('id', id)
      .single()
      .then(({ data, error }) => {
        if (error || !data) setLoadError(true)
        else setScreening(data)
      })
  }, [user, id])

  if (authLoading || (!screening && !loadError)) return <LoadingShell />
  if (loadError) return <NotFoundShell />

  // Extract real data
  const score = screening.ai_score ?? 0
  const tier = screening.v3_tier ?? 'decline'
  const ti = tierInfo(tier)
  const applicantName = screening.ai_extracted_name || screening.tenant_name || 'Applicant'
  const dims = screening.scores_v3 || {}
  const summary = screening.ai_summary_en || screening.ai_summary || screening.ai_summary_zh || ''
  const forensics = screening.forensics_detail
  const court = screening.court_records_detail
  const redFlags = screening.red_flags || []
  const hardGates = screening.hard_gates_triggered || []
  const actionItems = screening.action_items || []
  const fileCount = Array.isArray(screening.files) ? screening.files.length : 0
  const coverage = screening.evidence_coverage != null ? Math.round(screening.evidence_coverage * 100) : null
  const rent = screening.monthly_rent
  const ratio = screening.income_rent_ratio
  const createdAt = screening.created_at ? new Date(screening.created_at).toLocaleString() : ''

  const passCount = Object.values(dims).filter((v: unknown) => typeof v === 'number' && (v as number) >= 70).length
  const infoCount = Object.values(dims).filter((v: unknown) => typeof v === 'number' && (v as number) >= 50 && (v as number) < 70).length
  const redCount = hardGates.length + redFlags.length

  return (
    <div style={{ background: '#FAF7EE', color: '#171717', minHeight: '100vh' }}>
      <Header variant="solid" />

      <div className="mx-auto max-w-[1100px] px-5 pb-24 pt-10 sm:px-7 lg:px-8">

        {/* TOP HEADER */}
        <div className="flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-body-3">
          <span className="inline-block h-[6px] w-[6px] rounded-full" style={{ background: '#16A34A', boxShadow: '0 0 6px #16A34A' }} />
          SCREENING REPORT &middot; {screening.status === 'done' ? 'COMPLETE' : screening.status?.toUpperCase()}
        </div>

        <h1 className="mt-4 text-[28px] font-extrabold leading-tight tracking-tight sm:text-[34px]">
          {applicantName} &middot; Full Report
        </h1>

        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[11px] text-body-3">
          <span>{id.slice(0, 8)}</span>
          <span>&middot;</span>
          <span>{createdAt}</span>
          <span>&middot;</span>
          <span>{Object.keys(dims).length} DIMENSIONS</span>
          {coverage != null && (
            <>
              <span>&middot;</span>
              <span>{coverage}% COVERAGE</span>
            </>
          )}
        </div>

        {/* Actions bar */}
        <div className="mt-5 flex flex-wrap gap-2">
          <Link
            href={`/screening/${id}/done`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line-divider bg-white px-4 py-2 font-mono text-[12px] text-body-2 transition hover:border-line-strong"
          >
            &larr; Summary
          </Link>
          <Link
            href={`/screening/${id}/ltb`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line-divider bg-white px-4 py-2 font-mono text-[12px] text-body-2 transition hover:border-line-strong"
          >
            LTB Deep Dive &rarr;
          </Link>
          <Link
            href={`/screening/${id}/graph`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line-divider bg-white px-4 py-2 font-mono text-[12px] text-body-2 transition hover:border-line-strong"
          >
            Network Graph &rarr;
          </Link>
          <Link
            href={`/screening/${id}/share`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line-divider bg-white px-4 py-2 font-mono text-[12px] text-body-2 transition hover:border-line-strong"
          >
            Share
          </Link>
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
          {summary && (
            <p className="mt-3 text-[13.5px] leading-relaxed text-body-2">{summary}</p>
          )}
        </div>

        {/* SCORE SUMMARY */}
        <div className="mt-8 rounded-2xl border border-line-divider bg-white p-6 shadow-sm sm:p-8">
          <div className="flex items-baseline gap-3">
            <span className="font-mono text-[36px] font-extrabold tracking-tight">{score}</span>
            <span className="font-mono text-[14px] text-body-3">/ 100</span>
            <span className="font-mono text-[12px] font-bold" style={{ color: '#16A34A' }}>COMPOSITE SCORE</span>
          </div>

          {/* Stats row */}
          <div className="mt-3 flex flex-wrap items-center gap-4 font-mono text-[12px] text-body-3">
            {rent && <span>Rent: ${rent}/mo</span>}
            {ratio && <span>Income/Rent: {ratio.toFixed(1)}x</span>}
            <span>Files: {fileCount}</span>
          </div>

          {Object.keys(dims).length > 0 && (
            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {Object.entries(dims).map(([key, val]) => {
                const dimScore = typeof val === 'number' ? val : 0
                const meta = DIMENSION_LABELS[key] || { label: key, weight: 0 }
                const dimStatus = dimScore >= 70 ? 'PASS' : dimScore >= 50 ? 'INFO' : 'FAIL'
                return (
                  <div key={key} className="rounded-xl border border-line-divider p-3">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[20px] font-extrabold">{dimScore}</span>
                      <Badge label={dimStatus} color={statusColor(dimStatus)} />
                    </div>
                    <div className="mt-1 text-[12px] font-semibold text-body">{meta.label}</div>
                    {meta.weight > 0 && (
                      <div className="font-mono text-[10px] text-body-4">{Math.round(meta.weight * 100)}% weight</div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* COLLAPSIBLE SECTIONS */}
        <div className="mt-8 space-y-4">

          {/* AI Summary */}
          {summary && (
            <SectionShell id="ai-summary" title="AI SUMMARY" subtitle="Generated analysis">
              <p className="text-[14px] leading-relaxed text-body-2">{summary}</p>
              {screening.ai_summary_zh && screening.ai_summary_zh !== summary && (
                <div className="mt-4 rounded-lg border border-line-divider bg-[#FAFAF8] p-4">
                  <div className="font-mono text-[10px] font-bold uppercase text-body-3 mb-2">Chinese Summary</div>
                  <p className="text-[13px] leading-relaxed text-body-2">{screening.ai_summary_zh}</p>
                </div>
              )}
            </SectionShell>
          )}

          {/* Dimension Detail */}
          {Object.keys(dims).length > 0 && (
            <SectionShell id="dimensions" title="DIMENSION SCORES" subtitle={`${Object.keys(dims).length} dimensions evaluated`}>
              <div className="space-y-4">
                {Object.entries(dims).map(([key, val]) => {
                  const dimScore = typeof val === 'number' ? val : 0
                  const meta = DIMENSION_LABELS[key] || { label: key, weight: 0 }
                  const color = dimScore >= 70 ? '#047857' : dimScore >= 50 ? '#D97706' : '#DC2626'
                  return (
                    <div key={key}>
                      <div className="flex items-center justify-between">
                        <span className="text-[13px] font-semibold text-body">
                          {meta.label}
                          {meta.weight > 0 && <span className="ml-2 font-mono text-[10px] text-body-3">({Math.round(meta.weight * 100)}%)</span>}
                        </span>
                        <span className="font-mono text-[16px] font-extrabold" style={{ color }}>{dimScore}</span>
                      </div>
                      <div className="mt-1.5 h-2 overflow-hidden rounded-full" style={{ background: '#F0EDE4' }}>
                        <div className="h-full rounded-full" style={{ width: `${dimScore}%`, background: color, transition: 'width 0.7s ease' }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </SectionShell>
          )}

          {/* Document Forensics */}
          {forensics && (
            <SectionShell id="forensics" title="DOCUMENT FORENSICS" subtitle="Authenticity analysis">
              {typeof forensics === 'object' && !Array.isArray(forensics) ? (
                <div className="space-y-2 text-[13px]" style={{ color: '#333' }}>
                  {Object.entries(forensics).map(([k, v]) => (
                    <div key={k} className="flex items-center gap-3 rounded-lg border border-line-divider/60 px-4 py-2.5">
                      <span className="font-mono text-[11px] font-bold uppercase text-body-3" style={{ minWidth: 120 }}>{k}</span>
                      <span className="flex-1 text-body-2">{typeof v === 'string' ? v : JSON.stringify(v)}</span>
                      {typeof v === 'string' && (v === 'CLEAN' || v === 'PASS') && (
                        <Badge label={v} color="#16A34A" />
                      )}
                    </div>
                  ))}
                </div>
              ) : Array.isArray(forensics) ? (
                <div className="space-y-2">
                  {forensics.map((item: Record<string, unknown>, i: number) => (
                    <div key={i} className="rounded-lg border border-line-divider p-3 text-[12px]" style={{ background: '#FAFAF8' }}>
                      {Object.entries(item).map(([k, v]) => (
                        <div key={k} className="flex gap-2">
                          <span className="font-mono font-bold uppercase" style={{ color: '#999', minWidth: 100 }}>{k}</span>
                          <span style={{ color: '#333' }}>{typeof v === 'string' ? v : JSON.stringify(v)}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              ) : (
                <pre className="text-[12px] whitespace-pre-wrap" style={{ color: '#333' }}>
                  {JSON.stringify(forensics, null, 2)}
                </pre>
              )}
            </SectionShell>
          )}

          {/* Court Records */}
          {court && (
            <SectionShell id="court" title="COURT / LTB RECORDS" subtitle="Legal record search results">
              {(screening.court_summary_en || screening.court_summary_zh) && (
                <p className="text-[13px] mb-4 text-body-2">
                  {screening.court_summary_en || screening.court_summary_zh}
                </p>
              )}
              {Array.isArray(court) ? (
                court.length === 0 ? (
                  <div className="flex items-center gap-2 rounded-lg border border-line-divider px-4 py-3" style={{ background: '#F0FDF4' }}>
                    <Badge label="CLEAR" color="#16A34A" />
                    <span className="text-[13px] text-body-2">No court records found</span>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {court.map((rec: Record<string, unknown>, i: number) => (
                      <div key={i} className="rounded-xl border border-line-divider p-4" style={{ background: '#FAFAF8' }}>
                        {Object.entries(rec).map(([k, v]) => (
                          <div key={k} className="flex gap-3 py-1">
                            <span className="font-mono text-[10px] font-bold uppercase text-body-3" style={{ minWidth: 100 }}>{k}</span>
                            <span className="text-[13px] text-body">{typeof v === 'string' ? v : JSON.stringify(v)}</span>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                )
              ) : typeof court === 'object' ? (
                <pre className="text-[12px] whitespace-pre-wrap" style={{ color: '#333' }}>
                  {JSON.stringify(court, null, 2)}
                </pre>
              ) : (
                <p className="text-[13px] text-body-2">{String(court)}</p>
              )}
              <div className="mt-4">
                <Link
                  href={`/screening/${id}/ltb`}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-line-divider bg-white px-4 py-2 text-[12px] font-medium text-body-2 transition hover:border-line-strong"
                >
                  View LTB Deep Dive &rarr;
                </Link>
              </div>
            </SectionShell>
          )}

          {/* Red Flags & Hard Gates */}
          {(redFlags.length > 0 || hardGates.length > 0) && (
            <SectionShell id="flags" title="RED FLAGS &amp; HARD GATES" subtitle={`${redFlags.length} flags, ${hardGates.length} gates`}>
              {hardGates.length > 0 && (
                <div className="mb-4">
                  <div className="font-mono text-[10px] font-bold mb-2" style={{ color: '#DC2626' }}>HARD GATES TRIGGERED</div>
                  <div className="space-y-2">
                    {hardGates.map((g: string, i: number) => (
                      <div key={i} className="flex items-center gap-2 rounded-lg px-4 py-2.5" style={{ background: '#DC262608' }}>
                        <Badge label="GATE" color="#DC2626" />
                        <span className="text-[13px] text-body-2">{g}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {redFlags.length > 0 && (
                <div>
                  <div className="font-mono text-[10px] font-bold mb-2" style={{ color: '#EA580C' }}>RED FLAGS</div>
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
              {screening.red_flag_penalty != null && (
                <div className="mt-4 font-mono text-[11px] text-body-3">
                  Score penalty: -{screening.red_flag_penalty} | Gate cap: {screening.gate_cap ?? 'N/A'}
                </div>
              )}
            </SectionShell>
          )}

          {/* Action Items */}
          {actionItems.length > 0 && (
            <SectionShell id="actions" title="ACTION ITEMS" subtitle={`${actionItems.length} recommended actions`}>
              <div className="space-y-2">
                {actionItems.map((item: string, i: number) => (
                  <div key={i} className="flex items-start gap-3 rounded-lg border border-line-divider px-4 py-3">
                    <span className="mt-0.5 font-mono text-[14px] font-bold" style={{ color: '#D97706' }}>&rarr;</span>
                    <span className="text-[13px] text-body-2">{item}</span>
                  </div>
                ))}
              </div>
            </SectionShell>
          )}

          {/* Legal / Compliance */}
          <SectionShell id="legal" title="LEGAL &middot; COMPLIANCE" subtitle="RTA &middot; PIPEDA &middot; OHRC" defaultOpen={false}>
            <div className="flex flex-wrap gap-3">
              {[
                { code: 'RTA', name: 'Residential Tenancies Act', detail: 'Ontario compliant' },
                { code: 'PIPEDA', name: 'Personal Information Protection', detail: 'Federal compliant' },
                { code: 'OHRC', name: 'Ontario Human Rights Code', detail: '17 protected grounds excluded' },
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
                This report is generated based on information provided by the applicant and data obtained from
                third-party sources with the applicant&apos;s written consent. The screening does not evaluate or
                score applicants based on any of the 17 protected grounds under the Ontario Human Rights Code.
                This report presents factual findings only and does not constitute a recommendation to approve
                or deny a tenancy application. The landlord retains sole discretion and responsibility for all
                tenancy decisions. Data retention: 7 years per PIPEDA requirements.
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
