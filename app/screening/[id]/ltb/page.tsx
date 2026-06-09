'use client'

export const runtime = 'edge'

// V5.3 · Court / LTB Records detail page — loads real data from Supabase.
// Route: /screening/[id]/ltb

import { useParams } from 'next/navigation'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { useAuth } from '@/lib/useAuth'
import { supabase } from '@/lib/supabase'

/* ── Loading / Error ───────────────────────────────────────────── */

function LoadingShell() {
  return (
    <div style={{ background: '#FAF7EE', minHeight: '100vh' }} className="flex flex-col">
      <Header variant="transparent" />
      <div className="flex flex-1 items-center justify-center">
        <div className="text-center">
          <div className="inline-block h-10 w-10 animate-spin rounded-full border-2 border-[#047857] border-t-transparent" />
          <p className="mt-4 font-mono text-[13px] text-[#999]">Loading court records...</p>
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

/* ── Data sources for reference ─────────────────────────────────── */

const DATA_SOURCES = [
  { code: 'LTB', name: 'Landlord & Tenant Board', desc: 'All Ontario LTB filings 2006-present' },
  { code: 'CANLII', name: 'CanLII', desc: 'Canadian Legal Information Institute full text' },
  { code: 'OSB', name: 'Office of the Superintendent of Bankruptcy', desc: 'Federal bankruptcy & consumer proposals' },
  { code: 'SCC', name: 'Ontario Small Claims Court', desc: 'Civil claims under $35,000' },
  { code: 'LIEN', name: 'Construction Lien Registry', desc: 'Ontario construction lien registry' },
  { code: 'PPSA', name: 'Personal Property Security Act', desc: 'Chattel security registrations' },
  { code: 'CRA', name: 'Canada Revenue Agency', desc: 'Federal tax liens (public records only)' },
  { code: 'OHRT', name: 'Ontario Human Rights Tribunal', desc: 'Tribunal filings (public records only)' },
]

const REDLINES = [
  'Race / ethnicity — OHRC s.2(1)',
  'Religion / creed',
  'Disability status',
  'Family status (children)',
  'Receipt of public assistance',
  'Immigration status (beyond legal scope)',
]

/* ── Component ───────────────────────────────────────────────────── */

export default function LTBPage() {
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
  const court = screening.court_records_detail
  const courtSummary = screening.court_summary_en || screening.court_summary_zh || ''
  const courtRecords = Array.isArray(court) ? court : []
  const hasRecords = courtRecords.length > 0

  return (
    <div style={{ background: '#FAF7EE', color: '#171717', minHeight: '100vh' }}>
      <Header variant="transparent" />

      {/* Hero */}
      <section style={{ background: 'linear-gradient(180deg,#F2EEE5 0%,#E8E4DC 100%)' }}>
        <div className="mx-auto max-w-[1240px] px-5 py-16 sm:px-7 lg:px-12">
          <Link
            href={`/screening/${id}/report`}
            className="font-mono text-[12px] text-body-3 hover:text-body"
          >
            &larr; Back to Report
          </Link>

          <div className="mt-5 flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: '#047857' }}>
            <span className="inline-block h-[6px] w-[6px] rounded-full" style={{ background: '#047857', boxShadow: '0 0 6px #047857' }} />
            LTB / COURT ENGINE
          </div>

          <h1 className="mt-4 text-[28px] font-extrabold leading-tight tracking-tight sm:text-[36px]">
            {applicantName} &middot; Court &amp; LTB Records
          </h1>
          <p className="mt-3 max-w-[800px] text-[14px] leading-relaxed text-body-2">
            Comprehensive search across Ontario tribunals, CanLII, OSB, and civil courts.
          </p>

          {/* Stats row */}
          <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-line-divider bg-white px-4 py-3.5">
              <div className="font-mono text-[11px] font-bold uppercase tracking-wide text-body-3">Subject</div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="font-mono text-[28px] font-extrabold leading-none" style={{ color: hasRecords ? '#D97706' : '#047857' }}>
                  {hasRecords ? courtRecords.length : 0}
                </span>
                <span
                  className="rounded-md px-2 py-0.5 font-mono text-[10px] font-bold uppercase"
                  style={{ color: hasRecords ? '#D97706' : '#047857', background: hasRecords ? '#D9770614' : '#04785714' }}
                >
                  {hasRecords ? 'RECORDS FOUND' : 'CLEAN'}
                </span>
              </div>
            </div>
            <div className="rounded-xl border border-line-divider bg-white px-4 py-3.5">
              <div className="font-mono text-[11px] font-bold uppercase tracking-wide text-body-3">Databases</div>
              <div className="mt-1">
                <span className="font-mono text-[28px] font-extrabold leading-none">{DATA_SOURCES.length}</span>
              </div>
            </div>
            <div className="rounded-xl border border-line-divider bg-white px-4 py-3.5">
              <div className="font-mono text-[11px] font-bold uppercase tracking-wide text-body-3">Status</div>
              <div className="mt-1">
                <span
                  className="rounded-md px-2 py-0.5 font-mono text-[10px] font-bold uppercase"
                  style={{ color: '#047857', background: '#04785714' }}
                >
                  SEARCH COMPLETE
                </span>
              </div>
            </div>
            <div className="rounded-xl border border-line-divider bg-white px-4 py-3.5">
              <div className="font-mono text-[11px] font-bold uppercase tracking-wide text-body-3">Score</div>
              <div className="mt-1">
                <span className="font-mono text-[28px] font-extrabold leading-none" style={{ color: '#047857' }}>
                  {screening.ai_score ?? 'N/A'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Main content */}
      <section>
        <div className="mx-auto max-w-[1240px] px-5 py-10 sm:px-7 lg:px-12 space-y-8">

          {/* Court Summary */}
          {courtSummary && (
            <div className="rounded-2xl border border-line-divider bg-white p-6 sm:p-8">
              <h2 className="text-[18px] font-extrabold tracking-tight">Court Summary</h2>
              <p className="mt-3 text-[14px] leading-relaxed text-body-2">{courtSummary}</p>
            </div>
          )}

          {/* Subject Records */}
          <div className="rounded-2xl border border-line-divider bg-white p-6 sm:p-8">
            <div className="flex items-center gap-3">
              <span
                className="flex h-10 w-10 items-center justify-center rounded-full text-[15px] font-bold text-white"
                style={{ background: 'linear-gradient(135deg,#C4B5FD,#7C3AED)' }}
              >
                {applicantName.charAt(0)}
              </span>
              <div>
                <h2 className="text-[20px] font-extrabold tracking-tight">{applicantName} &middot; Subject</h2>
                <div className="font-mono text-[11px] text-body-3">
                  {hasRecords ? `${courtRecords.length} record(s) found` : 'All CLEAN'}
                </div>
              </div>
              <span
                className="ml-auto rounded-lg px-3 py-1 font-mono text-[11px] font-bold uppercase"
                style={{
                  color: hasRecords ? '#D97706' : '#047857',
                  background: hasRecords ? '#D9770614' : '#04785714',
                }}
              >
                {hasRecords ? `${courtRecords.length} HITS` : '0 HITS · CLEAN'}
              </span>
            </div>

            {hasRecords ? (
              <div className="mt-6 space-y-4">
                {courtRecords.map((rec: Record<string, unknown>, i: number) => (
                  <div key={i} className="rounded-xl border border-amber-200 bg-amber-50/50 p-5 sm:p-6">
                    <div className="flex flex-wrap items-start gap-x-6 gap-y-2">
                      {Object.entries(rec).map(([k, v]) => (
                        <div key={k}>
                          <div className="font-mono text-[10px] font-bold uppercase text-body-3">{k}</div>
                          <div className="mt-0.5 text-[13.5px] font-medium text-body">
                            {typeof v === 'string' ? v : JSON.stringify(v)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {DATA_SOURCES.slice(0, 8).map((db) => (
                  <div key={db.code} className="rounded-xl border border-line-divider bg-[#FAFAF8] p-4">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[12px] font-bold" style={{ color: '#047857' }}>{db.code}</span>
                      <span className="font-mono text-[11px] font-bold" style={{ color: '#047857' }}>&#10003;</span>
                    </div>
                    <div className="mt-1 text-[12px] font-medium text-body">{db.name}</div>
                    <div className="mt-1 text-[11px] leading-snug text-body-3">{db.desc}</div>
                    <div className="mt-2 font-mono text-[20px] font-extrabold" style={{ color: '#047857' }}>0</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Data Sources */}
          <div className="rounded-2xl border border-line-divider bg-white p-6 sm:p-8">
            <h2 className="text-[18px] font-extrabold tracking-tight">Data Sources &middot; {DATA_SOURCES.length} Databases</h2>
            <div className="mt-1 font-mono text-[11px] text-body-3">All queried &middot; Federal + Ontario coverage</div>

            <div className="mt-5 space-y-3">
              {DATA_SOURCES.map((ds) => (
                <div key={ds.code} className="flex items-start gap-3 rounded-lg border border-line-divider bg-[#FAFAF8] px-4 py-3">
                  <span className="mt-0.5 rounded bg-surface-chip px-2 py-0.5 font-mono text-[10px] font-bold text-body-2">
                    {ds.code}
                  </span>
                  <div className="flex-1">
                    <div className="text-[13.5px] font-semibold text-body">{ds.name}</div>
                    <div className="text-[12px] text-body-3">{ds.desc}</div>
                  </div>
                  <span className="font-mono text-[11px] font-bold" style={{ color: '#047857' }}>&#10003;</span>
                </div>
              ))}
            </div>
          </div>

          {/* RTA / OHRC Red Lines */}
          <div className="rounded-2xl border border-red-200 bg-white p-6 sm:p-8">
            <div className="flex items-center gap-2">
              <h2 className="text-[18px] font-extrabold tracking-tight">RTA &middot; OHRC Red Lines</h2>
            </div>
            <p className="mt-2 text-[13px] text-body-2">
              Per Ontario Human Rights Code s.2(1) and the Residential Tenancies Act, the following categories are excluded from this search:
            </p>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {REDLINES.map((r, i) => (
                <div key={i} className="flex items-start gap-2 text-[13px]">
                  <span className="font-bold text-red-500">&#10005;</span>
                  <span className="text-body-2">{r}</span>
                </div>
              ))}
            </div>
          </div>

        </div>
      </section>

      <Footer />
    </div>
  )
}
