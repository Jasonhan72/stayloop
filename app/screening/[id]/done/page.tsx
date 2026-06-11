'use client'

export const runtime = 'edge'

// V5.3 · Scan Complete / Stayloop Score — loads real data from Supabase.
// Route: /screening/[id]/done

import { useParams } from 'next/navigation'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { useAuth } from '@/lib/useAuth'
import { supabase } from '@/lib/supabase'

/* ---------- helpers ---------- */

function ScoreRing({ score, max = 100, size = 180 }: { score: number; max?: number; size?: number }) {
  const stroke = 10
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const progress = (score / max) * circumference
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="block">
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#E0DACE" strokeWidth={stroke} />
      <circle
        cx={size / 2} cy={size / 2} r={radius}
        fill="none" stroke="#047857" strokeWidth={stroke}
        strokeDasharray={`${progress} ${circumference - progress}`}
        strokeDashoffset={circumference * 0.25}
        strokeLinecap="round"
        style={{ transition: 'stroke-dasharray 1s ease' }}
      />
    </svg>
  )
}

function dimScoreColor(score: number): string {
  if (score >= 95) return '#047857'
  if (score >= 85) return '#16A34A'
  if (score >= 70) return '#D97706'
  return '#DC2626'
}

function tierInfo(tier: string): { label: string; color: string; bg: string } {
  if (tier === 'approve') return { label: 'PROCEED', color: '#047857', bg: '#04785714' }
  if (tier === 'conditional') return { label: 'CONDITIONAL', color: '#D97706', bg: '#D9770614' }
  return { label: 'DECLINE', color: '#DC2626', bg: '#DC262614' }
}

const DIMENSION_META: Record<string, { icon: string; name: string; label: string }> = {
  ability_to_pay: { icon: '$', name: 'Income', label: 'Ability to Pay' },
  credit_health:  { icon: 'X', name: 'Credit', label: 'Credit Health' },
  rental_history: { icon: 'H', name: 'History', label: 'Rental History' },
  verification:   { icon: 'ID', name: 'Identity', label: 'Verification' },
  communication:  { icon: 'B', name: 'Behavior', label: 'Communication' },
}

/* ---------- loading / error shells ---------- */

function LoadingShell() {
  return (
    <div style={{ background: '#FAF7EE', minHeight: '100vh' }} className="flex flex-col">
      <Header variant="solid" />
      <div className="flex flex-1 items-center justify-center">
        <div className="text-center">
          <div className="inline-block h-10 w-10 animate-spin rounded-full border-2 border-[#047857] border-t-transparent" />
          <p className="mt-4 font-mono text-[13px] text-[#999]">Loading screening...</p>
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

/* ---------- page ---------- */

export default function ScanDonePage() {
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
      // Ownership enforced by RLS (accepts both legacy profileId and authId
      // landlord_id forms); explicit user.id filter broke legacy rows.
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
  const maxScore = 100
  const tier = screening.v3_tier ?? 'decline'
  const ti = tierInfo(tier)
  const applicantName = screening.ai_extracted_name || screening.tenant_name || 'Applicant'
  const dims = screening.scores_v3 || {}
  const redFlags = screening.red_flags || []
  const hardGates = screening.hard_gates_triggered || []
  const passCount = Object.values(dims).filter((v: unknown) => typeof v === 'number' && (v as number) >= 70).length
  const infoCount = Object.values(dims).filter((v: unknown) => typeof v === 'number' && (v as number) >= 50 && (v as number) < 70).length
  const redCount = Object.values(dims).filter((v: unknown) => typeof v === 'number' && (v as number) < 50).length + hardGates.length
  const coverage = screening.evidence_coverage != null ? Math.round(screening.evidence_coverage * 100) : null
  const fileCount = Array.isArray(screening.files) ? screening.files.length : 0
  const createdAt = screening.created_at ? new Date(screening.created_at).toLocaleString() : ''

  return (
    <div style={{ background: '#FAF7EE', color: '#171717', minHeight: '100vh' }}>
      <Header variant="solid" />

      {/* Step bar */}
      <div className="border-b border-line-divider" style={{ background: '#F2EEE5' }}>
        <div className="mx-auto flex max-w-[1240px] items-center gap-3 px-5 py-3 sm:px-7 lg:px-12">
          <span className="font-mono text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: '#047857' }}>
            SCREENING
          </span>
          <span className="font-mono text-[11px] text-body-3">&middot;</span>
          <span className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-body-2">
            {screening.status === 'done' ? 'COMPLETE' : screening.status?.toUpperCase() || 'PROCESSING'}
          </span>
          {screening.status === 'done' && (
            <>
              <span className="font-mono text-[11px] text-body-3">&middot;</span>
              <span className="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 font-mono text-[10px] font-bold" style={{ color: '#047857', background: '#04785714' }}>
                <span className="inline-block h-[6px] w-[6px] rounded-full" style={{ background: '#047857', boxShadow: '0 0 6px #047857' }} />
                DONE
              </span>
            </>
          )}
        </div>
      </div>

      <main>
        <div className="mx-auto max-w-[1240px] px-5 py-10 sm:px-7 lg:px-12">

          {/* Title row */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-[28px] font-extrabold leading-tight sm:text-[32px]">
                {applicantName}
                <span className="text-body-3 font-normal"> &middot; </span>
                Screening Complete
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-2 font-mono text-[11px] text-body-3">
                <span className="font-bold text-body-2">{id.slice(0, 8)}</span>
                <span>&middot;</span>
                <span>{createdAt}</span>
                {fileCount > 0 && (
                  <>
                    <span>&middot;</span>
                    <span>{fileCount} files</span>
                  </>
                )}
                {coverage != null && (
                  <>
                    <span>&middot;</span>
                    <span>{coverage}% coverage</span>
                  </>
                )}
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex flex-wrap gap-2">
              <Link
                href={`/screening/${id}/share`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-line-divider bg-white px-4 py-2 text-[13px] font-medium text-body-2 transition hover:border-line-strong"
              >
                Share
              </Link>
              <Link
                href={`/screening/${id}/report`}
                className="inline-flex items-center gap-1.5 rounded-lg px-5 py-2 text-[13px] font-bold text-white transition hover:opacity-90"
                style={{ background: '#047857' }}
              >
                View Full Report &rarr;
              </Link>
            </div>
          </div>

          {/* Score Card */}
          <div className="mt-8 rounded-2xl border border-line-divider bg-white p-7 shadow-sm sm:p-10">
            <div className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-body-3">
              STAYLOOP SCORE
            </div>

            <div className="mt-6 flex flex-col items-center gap-8 sm:flex-row sm:gap-12">
              <div className="relative flex-shrink-0">
                <ScoreRing score={score} max={maxScore} size={180} />
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="font-mono text-[42px] font-extrabold leading-none" style={{ color: '#047857' }}>
                    {score}
                  </span>
                  <span className="font-mono text-[13px] text-body-3">/ {maxScore}</span>
                  <span className="mt-1 font-mono text-[10px] font-bold uppercase tracking-wider text-body-3">
                    EVIDENCE
                  </span>
                </div>
              </div>

              <div className="flex-1">
                <div className="flex items-center gap-3">
                  <span className="rounded-lg px-4 py-1.5 font-mono text-[18px] font-extrabold tracking-wider" style={{ background: ti.bg, color: ti.color }}>
                    {ti.label}
                  </span>
                </div>

                <div className="mt-4 flex flex-wrap gap-3">
                  <span className="rounded-md px-3 py-1 font-mono text-[12px] font-bold" style={{ background: '#04785714', color: '#047857' }}>
                    {passCount} PASS
                  </span>
                  <span className="rounded-md px-3 py-1 font-mono text-[12px] font-bold" style={{ background: '#D9770614', color: '#D97706' }}>
                    {infoCount} INFO
                  </span>
                  <span className="rounded-md px-3 py-1 font-mono text-[12px] font-bold" style={{ background: '#DC262614', color: '#DC2626' }}>
                    {redCount} FLAGS
                  </span>
                </div>

                {/* Stats row */}
                <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {[
                    { label: 'COVERAGE', value: coverage != null ? `${coverage}%` : 'N/A' },
                    { label: 'FILES', value: `${fileCount}` },
                    { label: 'SCORE', value: `${score}/${maxScore}` },
                    { label: 'TIER', value: ti.label },
                  ].map((s) => (
                    <div key={s.label} className="rounded-lg border border-line-divider px-3 py-2">
                      <div className="font-mono text-[9px] font-bold uppercase tracking-wider text-body-3">{s.label}</div>
                      <div className="mt-0.5 font-mono text-[14px] font-bold text-body">{s.value}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Dimension Scores */}
          {Object.keys(dims).length > 0 && (
            <div className="mt-10">
              <div className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-body-3">
                DIMENSIONS
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {Object.entries(dims).map(([key, val]) => {
                  const dimScore = typeof val === 'number' ? val : 0
                  const meta = DIMENSION_META[key] || { icon: '?', name: key, label: key }
                  return (
                    <div key={key} className="relative rounded-xl border border-line-divider bg-white p-5 transition hover:border-line-strong hover:shadow-sm">
                      <div className="flex items-center gap-2.5">
                        <span
                          className="flex h-9 w-9 items-center justify-center rounded-lg font-mono text-[14px] font-bold"
                          style={{ background: dimScoreColor(dimScore) + '14', color: dimScoreColor(dimScore) }}
                        >
                          {meta.icon}
                        </span>
                        <div>
                          <div className="text-[13px] font-bold text-body">{meta.name}</div>
                          <div className="text-[11px] text-body-3">{meta.label}</div>
                        </div>
                      </div>
                      <div className="mt-3 flex items-end justify-between">
                        <span className="font-mono text-[28px] font-extrabold leading-none" style={{ color: dimScoreColor(dimScore) }}>
                          {dimScore}
                        </span>
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-chip">
                        <div className="h-full rounded-full transition-all" style={{ width: `${dimScore}%`, background: dimScoreColor(dimScore) }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Red flags / hard gates */}
          {(redFlags.length > 0 || hardGates.length > 0) && (
            <div className="mt-10 rounded-2xl border border-line-divider bg-white p-7 sm:p-10">
              <div className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-body-3">
                FLAGS &amp; GATES
              </div>
              {hardGates.length > 0 && (
                <div className="mt-4">
                  <div className="font-mono text-[10px] font-bold mb-2" style={{ color: '#DC2626' }}>HARD GATES</div>
                  <div className="flex flex-wrap gap-2">
                    {hardGates.map((g: string, i: number) => (
                      <span key={i} className="rounded-md px-2.5 py-1 text-[11px] font-mono font-bold" style={{ color: '#DC2626', background: '#FEF2F2' }}>{g}</span>
                    ))}
                  </div>
                </div>
              )}
              {redFlags.length > 0 && (
                <div className="mt-4">
                  <div className="font-mono text-[10px] font-bold mb-2" style={{ color: '#EA580C' }}>RED FLAGS</div>
                  <div className="flex flex-wrap gap-2">
                    {redFlags.map((f: string, i: number) => (
                      <span key={i} className="rounded-md px-2.5 py-1 text-[11px] font-mono font-bold" style={{ color: '#EA580C', background: '#FFF7ED' }}>{f}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* AI Summary preview */}
          {(screening.ai_summary || screening.ai_summary_en || screening.ai_summary_zh) && (
            <div className="mt-10 rounded-2xl border border-line-divider bg-white p-7 sm:p-10">
              <div className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-body-3">
                AI SUMMARY
              </div>
              <p className="mt-4 text-[14px] leading-relaxed text-body-2">
                {screening.ai_summary_en || screening.ai_summary || screening.ai_summary_zh}
              </p>
            </div>
          )}

          {/* Bottom Actions */}
          <div className="mt-10 flex flex-wrap items-center gap-3 border-t border-line-divider pt-8">
            <Link
              href={`/screening/${id}/ltb`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line-divider bg-white px-5 py-2.5 text-[13px] font-medium text-body-2 transition hover:border-line-strong"
            >
              LTB / Court &rarr;
            </Link>
            <Link
              href={`/screening/${id}/graph`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line-divider bg-white px-5 py-2.5 text-[13px] font-medium text-body-2 transition hover:border-line-strong"
            >
              Network Graph &rarr;
            </Link>
            <Link
              href={`/screening/${id}/share`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line-divider bg-white px-5 py-2.5 text-[13px] font-medium text-body-2 transition hover:border-line-strong"
            >
              Share
            </Link>
            <Link
              href={`/screening/${id}/report`}
              className="inline-flex items-center gap-1.5 rounded-lg px-6 py-2.5 text-[14px] font-bold text-white transition hover:opacity-90"
              style={{ background: '#047857' }}
            >
              View Full Report &rarr;
            </Link>
          </div>

        </div>
      </main>

      <Footer />
    </div>
  )
}
