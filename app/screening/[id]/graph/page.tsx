'use client'

export const runtime = 'edge'

// V5.3 · Relationship Graph / Dimension Visualization — loads real data from Supabase.
// Route: /screening/[id]/graph

import { useParams } from 'next/navigation'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { useAuth } from '@/lib/useAuth'
import { supabase } from '@/lib/supabase'

/* ── Helpers ──────────────────────────────────────────────────────── */

function dimColor(score: number): string {
  if (score >= 80) return '#047857'
  if (score >= 65) return '#16A34A'
  if (score >= 50) return '#D97706'
  return '#DC2626'
}

const DIMENSION_META: Record<string, { label: string; fullLabel: string }> = {
  ability_to_pay: { label: 'Pay', fullLabel: 'Ability to Pay' },
  credit_health:  { label: 'Credit', fullLabel: 'Credit Health' },
  rental_history: { label: 'History', fullLabel: 'Rental History' },
  verification:   { label: 'ID', fullLabel: 'Verification' },
  communication:  { label: 'Comm', fullLabel: 'Communication' },
}

/* ── Loading / Error ───────────────────────────────────────────── */

function LoadingShell() {
  return (
    <div style={{ background: '#FAF7EE', minHeight: '100vh' }} className="flex flex-col">
      <Header variant="transparent" />
      <div className="flex flex-1 items-center justify-center">
        <div className="text-center">
          <div className="inline-block h-10 w-10 animate-spin rounded-full border-2 border-[#7C3AED] border-t-transparent" />
          <p className="mt-4 font-mono text-[13px] text-[#999]">Loading graph...</p>
        </div>
      </div>
      <Footer />
    </div>
  )
}

function NotFoundShell() {
  return (
    <div style={{ background: '#FAF7EE', minHeight: '100vh' }} className="flex flex-col">
      <Header variant="transparent" />
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

/* ── Radar Chart SVG ──────────────────────────────────────────── */

function RadarChart({ dims }: { dims: Record<string, number> }) {
  const entries = Object.entries(dims)
  const count = entries.length
  if (count < 3) return null

  const size = 300
  const cx = size / 2
  const cy = size / 2
  const maxR = 120

  // Generate polygon points for a given radius multiplier
  const polygonPoints = (radiusFn: (i: number) => number) =>
    entries
      .map(([, ], i) => {
        const angle = (Math.PI * 2 * i) / count - Math.PI / 2
        const r = radiusFn(i)
        return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`
      })
      .join(' ')

  // Grid rings
  const gridLevels = [0.25, 0.5, 0.75, 1.0]

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="block mx-auto">
      {/* Grid rings */}
      {gridLevels.map((level) => (
        <polygon
          key={level}
          points={polygonPoints(() => maxR * level)}
          fill="none"
          stroke="#E0DACE"
          strokeWidth={1}
          opacity={0.6}
        />
      ))}

      {/* Axis lines */}
      {entries.map(([, ], i) => {
        const angle = (Math.PI * 2 * i) / count - Math.PI / 2
        return (
          <line
            key={i}
            x1={cx}
            y1={cy}
            x2={cx + maxR * Math.cos(angle)}
            y2={cy + maxR * Math.sin(angle)}
            stroke="#E0DACE"
            strokeWidth={1}
            opacity={0.4}
          />
        )
      })}

      {/* Data polygon */}
      <polygon
        points={polygonPoints((i) => (entries[i][1] / 100) * maxR)}
        fill="#04785720"
        stroke="#047857"
        strokeWidth={2}
      />

      {/* Data points + labels */}
      {entries.map(([key, val], i) => {
        const angle = (Math.PI * 2 * i) / count - Math.PI / 2
        const r = (val / 100) * maxR
        const labelR = maxR + 20
        const meta = DIMENSION_META[key] || { label: key.slice(0, 5), fullLabel: key }
        return (
          <g key={key}>
            <circle
              cx={cx + r * Math.cos(angle)}
              cy={cy + r * Math.sin(angle)}
              r={4}
              fill="#047857"
            />
            <text
              x={cx + labelR * Math.cos(angle)}
              y={cy + labelR * Math.sin(angle)}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={10}
              fontWeight={700}
              fill="#444"
              style={{ fontFamily: 'ui-monospace, SFMono-Regular, monospace' }}
            >
              {meta.label}
            </text>
            <text
              x={cx + (labelR + 12) * Math.cos(angle)}
              y={cy + (labelR + 12) * Math.sin(angle)}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={10}
              fontWeight={800}
              fill={dimColor(val)}
              style={{ fontFamily: 'ui-monospace, SFMono-Regular, monospace' }}
            >
              {val}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

/* ── Component ───────────────────────────────────────────────────── */

export default function GraphPage() {
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

  const applicantName = screening.ai_extracted_name || screening.tenant_name || 'Applicant'
  const dims = screening.scores_v3 || {}
  const score = screening.ai_score ?? 0
  const tier = screening.v3_tier ?? 'decline'
  const coverage = screening.evidence_coverage != null ? Math.round(screening.evidence_coverage * 100) : null
  const redFlags = screening.red_flags || []
  const hardGates = screening.hard_gates_triggered || []
  const hasDims = Object.keys(dims).length > 0

  return (
    <div style={{ background: '#FAF7EE', color: '#171717', minHeight: '100vh' }}>
      <Header variant="transparent" />

      {/* Hero */}
      <section style={{ background: 'linear-gradient(180deg,#F2EEE5 0%,#E4E8EE 100%)' }}>
        <div className="mx-auto max-w-[1240px] px-5 py-16 sm:px-7 lg:px-12">
          <Link
            href={`/screening/${id}/report`}
            className="font-mono text-[12px] text-body-3 hover:text-body"
          >
            &larr; Back to Report
          </Link>

          <div className="mt-5 flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: '#7C3AED' }}>
            <span className="inline-block h-[6px] w-[6px] rounded-full" style={{ background: '#7C3AED', boxShadow: '0 0 6px #7C3AED' }} />
            SCREENING VISUALIZATION
          </div>

          <h1 className="mt-4 text-[28px] font-extrabold leading-tight tracking-tight sm:text-[36px]">
            {applicantName} &middot; Dimension Analysis
          </h1>
          <p className="mt-3 max-w-[800px] text-[14px] leading-relaxed text-body-2">
            Radar chart and key metrics from the screening analysis.
          </p>

          <div className="mt-4 inline-flex items-center gap-2 rounded-lg px-3 py-1.5 font-mono text-[11px] font-bold uppercase" style={{ color: '#047857', background: '#04785714' }}>
            <span className="inline-block h-[6px] w-[6px] rounded-full" style={{ background: '#047857' }} />
            SCORE: {score} / 100
          </div>
        </div>
      </section>

      <section>
        <div className="mx-auto max-w-[1240px] px-5 py-10 sm:px-7 lg:px-12 space-y-8">

          {/* Radar Chart */}
          {hasDims && (
            <div className="rounded-2xl border border-line-divider bg-white p-6 sm:p-8">
              <h2 className="text-[18px] font-extrabold tracking-tight">Dimension Radar</h2>
              <div className="mt-1 font-mono text-[11px] text-body-3">
                {Object.keys(dims).length} dimensions evaluated
              </div>
              <div className="mt-6">
                <RadarChart dims={dims} />
              </div>
            </div>
          )}

          {/* Key Metrics */}
          <div className="rounded-2xl border border-line-divider bg-white p-6 sm:p-8">
            <h2 className="text-[18px] font-extrabold tracking-tight">Key Metrics</h2>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-line-divider bg-[#FAFAF8] p-4 text-center">
                <div className="font-mono text-[28px] font-extrabold" style={{ color: dimColor(score) }}>{score}</div>
                <div className="mt-1 text-[13px] font-bold text-body">Overall Score</div>
                <div className="mt-0.5 text-[11px] text-body-3">out of 100</div>
              </div>
              <div className="rounded-xl border border-line-divider bg-[#FAFAF8] p-4 text-center">
                <div className="font-mono text-[28px] font-extrabold" style={{ color: tier === 'approve' ? '#047857' : tier === 'conditional' ? '#D97706' : '#DC2626' }}>
                  {tier === 'approve' ? 'PASS' : tier === 'conditional' ? 'COND' : 'FAIL'}
                </div>
                <div className="mt-1 text-[13px] font-bold text-body">Recommendation</div>
                <div className="mt-0.5 text-[11px] text-body-3">{tier}</div>
              </div>
              <div className="rounded-xl border border-line-divider bg-[#FAFAF8] p-4 text-center">
                <div className="font-mono text-[28px] font-extrabold" style={{ color: '#047857' }}>
                  {coverage ?? 'N/A'}{coverage != null && '%'}
                </div>
                <div className="mt-1 text-[13px] font-bold text-body">Coverage</div>
                <div className="mt-0.5 text-[11px] text-body-3">evidence completeness</div>
              </div>
              <div className="rounded-xl border border-line-divider bg-[#FAFAF8] p-4 text-center">
                <div className="font-mono text-[28px] font-extrabold" style={{ color: (redFlags.length + hardGates.length) > 0 ? '#DC2626' : '#047857' }}>
                  {redFlags.length + hardGates.length}
                </div>
                <div className="mt-1 text-[13px] font-bold text-body">Flags</div>
                <div className="mt-0.5 text-[11px] text-body-3">red flags + hard gates</div>
              </div>
            </div>
          </div>

          {/* Dimension Bars */}
          {hasDims && (
            <div className="rounded-2xl border border-line-divider bg-white p-6 sm:p-8">
              <h2 className="text-[18px] font-extrabold tracking-tight">Dimension Breakdown</h2>

              <div className="mt-5 space-y-4">
                {Object.entries(dims).map(([key, val]) => {
                  const dimScore = typeof val === 'number' ? val : 0
                  const meta = DIMENSION_META[key] || { label: key, fullLabel: key }
                  const color = dimColor(dimScore)
                  return (
                    <div key={key}>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[13px] font-semibold text-body">{meta.fullLabel}</span>
                        <span className="font-mono text-[16px] font-extrabold" style={{ color }}>{dimScore}</span>
                      </div>
                      <div className="h-3 overflow-hidden rounded-full" style={{ background: '#F0EDE4' }}>
                        <div className="h-full rounded-full transition-all" style={{ width: `${dimScore}%`, background: color }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Income / Rent metrics if available */}
          {(screening.monthly_rent || screening.income_rent_ratio) && (
            <div className="rounded-2xl border border-line-divider bg-white p-6 sm:p-8">
              <h2 className="text-[18px] font-extrabold tracking-tight">Financial Metrics</h2>
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                {screening.monthly_rent && (
                  <div className="rounded-xl border border-line-divider bg-[#FAFAF8] p-4 text-center">
                    <div className="font-mono text-[24px] font-extrabold text-body">${screening.monthly_rent}</div>
                    <div className="mt-1 text-[12px] font-medium text-body-3">Monthly Rent</div>
                  </div>
                )}
                {screening.income_rent_ratio && (
                  <div className="rounded-xl border border-line-divider bg-[#FAFAF8] p-4 text-center">
                    <div className="font-mono text-[24px] font-extrabold" style={{ color: screening.income_rent_ratio >= 3 ? '#047857' : '#D97706' }}>
                      {screening.income_rent_ratio.toFixed(1)}x
                    </div>
                    <div className="mt-1 text-[12px] font-medium text-body-3">Income / Rent Ratio</div>
                  </div>
                )}
                {screening.gate_cap != null && (
                  <div className="rounded-xl border border-line-divider bg-[#FAFAF8] p-4 text-center">
                    <div className="font-mono text-[24px] font-extrabold text-body">{screening.gate_cap}</div>
                    <div className="mt-1 text-[12px] font-medium text-body-3">Gate Cap</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Bottom CTA */}
          <div className="flex justify-center gap-3 pb-4">
            <Link
              href={`/screening/${id}/report`}
              className="inline-flex items-center gap-2 rounded-xl border border-line-divider bg-white px-6 py-3 text-[13.5px] font-semibold text-body-2 transition hover:border-line-strong hover:shadow-sm"
            >
              &larr; Full Report
            </Link>
            <Link
              href={`/screening/${id}/ltb`}
              className="inline-flex items-center gap-2 rounded-xl border border-line-divider bg-white px-6 py-3 text-[13.5px] font-semibold text-body-2 transition hover:border-line-strong hover:shadow-sm"
            >
              LTB / Court &rarr;
            </Link>
          </div>

        </div>
      </section>

      <Footer />
    </div>
  )
}
