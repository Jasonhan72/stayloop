'use client'

export const runtime = 'edge'

// Court / LTB records detail page — route: /screening/[id]/ltb
//
// WHAT THIS PAGE USED TO DO, AND WHY IT WAS REPLACED
// It rendered a fixed grid of eight databases — LTB, CanLII, OSB, Small Claims,
// Construction Lien, PPSA, CRA tax liens, OHRT — each with a green check and a
// hard-coded 0, under the heading "All queried · Federal + Ontario coverage".
// Five of those eight have never been queried by this product at all, CanLII
// cannot be searched by name (its API filters by date only), and the LTB line
// claimed "all Ontario LTB filings 2006-present" against a catalogue that
// currently holds five months of 2026.
//
// It also computed `hasRecords` as `Array.isArray(court_records_detail)`, which
// is an OBJECT — so the check was false on every screening ever run and the page
// printed "0 HITS · CLEAN / SEARCH COMPLETE" no matter what the search actually
// found. A landlord reading it was told eight sources came back clean when one
// had been searched and the result was not being read.
//
// Everything below is now rendered from what the screening actually recorded:
// court_records_detail.queries (one entry per source, carrying its own status),
// and ltb_check from the Ontario Open Data catalogue. Sources we do not query
// are not listed; sources that failed say so.

import { useParams } from 'next/navigation'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { useAuth } from '@/lib/useAuth'
import { useT } from '@/lib/i18n'
import { supabase } from '@/lib/supabase'
import { describeCodes } from '@/lib/ltb/search'
import type { CourtQuery, LtbCheck, LtbOrderMatch, OntarioPortalMatch } from '@/lib/screening-types'

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: '#FAF7EE', minHeight: '100vh' }} className="flex flex-col">
      <Header variant="transparent" />
      <div className="flex flex-1 items-center justify-center px-5">{children}</div>
      <Footer />
    </div>
  )
}

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span className="inline-block rounded-md px-2 py-0.5 font-mono text-[10px] font-bold" style={{ color, background: color + '12' }}>
      {label}
    </span>
  )
}

const STATUS_STYLE: Record<CourtQuery['status'], { color: string; en: string; zh: string }> = {
  ok: { color: '#047857', en: 'SEARCHED', zh: '已检索' },
  unavailable: { color: '#B45309', en: 'UNAVAILABLE', zh: '不可用' },
  skipped: { color: '#71717A', en: 'NOT SEARCHED', zh: '未检索' },
  coming_soon: { color: '#71717A', en: 'NOT SEARCHED', zh: '未检索' },
  timeout: { color: '#B45309', en: 'TIMED OUT', zh: '超时' },
}

// Ontario Human Rights Code s.2(1) — grounds that may never enter a decision.
// This is a policy statement about what the engine excludes, not a claim about a
// search that ran, so it stays.
const REDLINES: Array<{ en: string; zh: string }> = [
  { en: 'Race / ethnic origin — OHRC s.2(1)', zh: '种族 / 族裔 — 安省人权法 s.2(1)' },
  { en: 'Religion / creed', zh: '宗教 / 信仰' },
  { en: 'Disability', zh: '残障状况' },
  { en: 'Family status (children)', zh: '家庭状况（有无子女）' },
  { en: 'Receipt of public assistance', zh: '是否领取公共补助' },
  { en: 'Immigration status beyond legal right to rent', zh: '超出合法租住权范围的移民身份' },
]

function OrderCard({ m, zh, context }: { m: LtbOrderMatch; zh: boolean; context?: boolean }) {
  const red = m.address_match && !context
  return (
    <div
      className="rounded-lg border px-4 py-3 text-[13px]"
      style={{ borderColor: red ? '#FCA5A5' : '#E7E2D6', background: red ? '#FEF2F2' : '#FAFAF8' }}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {!context && (
          <Badge
            label={m.address_match ? (zh ? '地址已佐证' : 'ADDRESS CORROBORATED') : (zh ? '仅姓名匹配' : 'NAME ONLY')}
            color={m.address_match ? '#DC2626' : '#A16207'}
          />
        )}
        <strong>{m.file_number}</strong>
        <span className="text-body-3">{m.order_date}</span>
        <span className="text-body-2">{describeCodes(m.application_codes, zh ? 'zh' : 'en')}</span>
      </div>
      <div className="mt-1 break-words text-[12px] text-body-2">
        {m.person_name}
        {m.unit_address ? ` · ${m.unit_address}` : ''}
      </div>
      {m.order_pdf_url && (
        <a
          href={m.order_pdf_url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 inline-block font-mono text-[11px] underline"
          style={{ color: '#6D28D9' }}
        >
          {zh ? '查看判令原件 (PDF)' : 'Open the order (PDF)'}
        </a>
      )}
    </div>
  )
}

export default function LTBPage() {
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
      // Ownership enforced by RLS (accepts both legacy profileId and authId
      // landlord_id forms); an explicit user.id filter broke legacy rows.
      .single()
      .then(({ data, error }) => {
        if (error || !data) setLoadError(true)
        else setScreening(data)
      })
  }, [user, id])

  if (authLoading || (!screening && !loadError)) {
    return (
      <Shell>
        <div className="text-center">
          <div className="inline-block h-10 w-10 animate-spin rounded-full border-2 border-[#047857] border-t-transparent" />
          <p className="mt-4 font-mono text-[13px] text-[#999]">{zh ? '正在载入法庭记录…' : 'Loading court records…'}</p>
        </div>
      </Shell>
    )
  }
  if (loadError) {
    return (
      <Shell>
        <div className="text-center">
          <h2 className="text-[22px] font-extrabold">{zh ? '未找到该背调' : 'Screening not found'}</h2>
          <p className="mt-2 text-[14px] text-[#999]">{zh ? '记录不存在，或你没有访问权限。' : 'This screening does not exist or you do not have access.'}</p>
          <Link href="/screening" className="mt-6 inline-block rounded-lg px-5 py-2.5 text-[13px] font-bold text-white" style={{ background: '#047857' }}>
            {zh ? '返回背调列表' : 'Back to screenings'}
          </Link>
        </div>
      </Shell>
    )
  }

  // The v3 snapshot is authoritative; the top-level columns are the legacy copy.
  const v3 = screening.ai_dimension_notes?._v3 ?? {}
  const applicantName = v3.extracted_name || screening.ai_extracted_name || screening.tenant_name || (zh ? '申请人' : 'Applicant')
  const courtDetail = (v3.court_records_detail ?? screening.court_records_detail ?? {}) as {
    queries?: CourtQuery[]
    total_hits?: number
    queried_name?: string
  }
  const queries: CourtQuery[] = Array.isArray(courtDetail.queries) ? courtDetail.queries : []
  const ltb = (v3.ltb_check ?? null) as LtbCheck | null
  const courtSummary = (zh ? v3.court_summary_zh : v3.court_summary_en) || v3.court_summary_en || screening.court_summary_en || ''

  const searched = queries.filter((q) => q.status === 'ok')
  const unavailable = queries.filter((q) => q.status !== 'ok')
  const hits = searched.reduce((n, q) => n + (q.hits ?? 0), 0)
  const corroborated = ltb?.corroborated.length ?? 0
  const portalRecords: OntarioPortalMatch[] = queries.flatMap((q) => q.portalRecords ?? [])

  const coverage = ltb?.coverage
  const coverageLine = coverage?.from && coverage?.to
    ? (zh
      ? `LTB 判令目录当前收录 ${coverage.from} 至 ${coverage.to}${coverage.orders ? `，共 ${coverage.orders.toLocaleString()} 份判令` : ''}`
      : `LTB catalogue currently covers ${coverage.from} to ${coverage.to}${coverage.orders ? `, ${coverage.orders.toLocaleString()} orders` : ''}`)
    : null

  const stat = (label: string, value: string | number, color = '#171717') => (
    <div className="rounded-xl border border-line-divider bg-white px-4 py-3.5">
      <div className="font-mono text-[11px] font-bold uppercase tracking-wide text-body-3">{label}</div>
      <div className="mt-1 font-mono text-[28px] font-extrabold leading-none" style={{ color }}>{value}</div>
    </div>
  )

  return (
    <div style={{ background: '#FAF7EE', color: '#171717', minHeight: '100vh' }}>
      <Header variant="transparent" />

      <section style={{ background: 'linear-gradient(180deg,#F2EEE5 0%,#E8E4DC 100%)' }}>
        <div className="mx-auto max-w-[1240px] px-5 py-16 sm:px-7 lg:px-12">
          <Link href={`/screening/${id}/report`} className="font-mono text-[12px] text-body-3 hover:text-body">
            &larr; {zh ? '返回报告' : 'Back to report'}
          </Link>

          <div className="mt-5 flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: '#047857' }}>
            <span className="inline-block h-[6px] w-[6px] rounded-full" style={{ background: '#047857', boxShadow: '0 0 6px #047857' }} />
            {zh ? 'LTB / 法庭记录' : 'LTB / COURT RECORDS'}
          </div>

          <h1 className="mt-4 text-[28px] font-extrabold leading-tight tracking-tight sm:text-[36px]">
            {applicantName} &middot; {zh ? '法庭与 LTB 记录' : 'Court & LTB records'}
          </h1>
          <p className="mt-3 max-w-[820px] text-[14px] leading-relaxed text-body-2">
            {zh
              ? '下面列出的是这次背调实际检索过的数据源与结果。未检索或不可用的数据源单独标注，绝不计为「无记录」。'
              : 'What follows is the set of sources this screening actually queried, and what each returned. Sources that were not searched, or that failed, are labelled as such and are never counted as clear.'}
          </p>

          <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {stat(zh ? '已检索数据源' : 'Sources searched', searched.length, '#047857')}
            {stat(zh ? '命中' : 'Hits', hits, hits > 0 ? '#D97706' : '#047857')}
            {stat(zh ? '地址已佐证' : 'Corroborated', corroborated, corroborated > 0 ? '#DC2626' : '#047857')}
            {stat(zh ? '未检索 / 不可用' : 'Not searched', unavailable.length, unavailable.length > 0 ? '#B45309' : '#047857')}
          </div>
          {coverageLine && <p className="mt-3 font-mono text-[11px] text-body-3">{coverageLine}</p>}
        </div>
      </section>

      <section>
        <div className="mx-auto max-w-[1240px] space-y-8 px-5 py-10 sm:px-7 lg:px-12">

          {courtSummary && (
            <div className="rounded-2xl border border-line-divider bg-white p-6 sm:p-8">
              <h2 className="text-[18px] font-extrabold tracking-tight">{zh ? '法庭记录小结' : 'Court summary'}</h2>
              <p className="mt-3 text-[14px] leading-relaxed text-body-2">{courtSummary}</p>
            </div>
          )}

          {/* Sources — one row per source the screening actually recorded. */}
          <div className="rounded-2xl border border-line-divider bg-white p-6 sm:p-8">
            <h2 className="text-[18px] font-extrabold tracking-tight">
              {zh ? `数据源 · ${queries.length} 个` : `Sources · ${queries.length}`}
            </h2>
            <div className="mt-1 font-mono text-[11px] text-body-3">
              {zh ? '每个数据源附带它自己的检索状态' : 'each carries its own search status'}
            </div>

            {queries.length === 0 ? (
              <p className="mt-5 text-[13px] text-body-2">
                {zh
                  ? '这次背调没有记录任何法庭检索——它可能早于法庭检索上线，请重新运行以获取记录。'
                  : 'This screening recorded no court search. It likely predates the court lookups; re-run it to get one.'}
              </p>
            ) : (
              <div className="mt-5 space-y-2.5">
                {queries.map((q, i) => {
                  const st = STATUS_STYLE[q.status] ?? STATUS_STYLE.skipped
                  return (
                    <div key={i} className="flex flex-wrap items-start gap-x-3 gap-y-1.5 rounded-lg border border-line-divider bg-[#FAFAF8] px-4 py-3">
                      <Badge label={zh ? st.zh : st.en} color={st.color} />
                      <div className="min-w-0 flex-1 basis-[14rem]">
                        <div className="text-[13.5px] font-semibold text-body">{q.source}</div>
                        {q.note && <div className="mt-0.5 break-words text-[12px] leading-relaxed text-body-3">{q.note}</div>}
                        {q.url && (
                          <a href={q.url} target="_blank" rel="noopener noreferrer" className="mt-0.5 inline-block font-mono text-[11px] underline" style={{ color: '#6D28D9' }}>
                            {zh ? '数据源' : 'source'}
                          </a>
                        )}
                      </div>
                      <span className="font-mono text-[13px] font-extrabold tabular-nums" style={{ color: q.hits ? '#D97706' : st.color }}>
                        {q.status === 'ok' ? `${q.hits ?? 0}` : '—'}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* LTB Order Catalogue */}
          {ltb && (
            <div className="rounded-2xl border border-line-divider bg-white p-6 sm:p-8">
              <h2 className="text-[18px] font-extrabold tracking-tight">
                {zh ? 'LTB 判令目录 · 安省开放数据' : 'LTB Order Catalogue · Ontario Open Data'}
              </h2>
              <p className="mt-3 text-[13.5px] leading-relaxed text-body-2">{zh ? ltb.summary_zh : ltb.summary_en}</p>

              {ltb.as_respondent.length > 0 && (
                <div className="mt-5">
                  <div className="mb-2 font-mono text-[10px] font-bold uppercase tracking-wider text-body-3">
                    {zh ? '房东发起的申请（该姓名列为被申请租客）' : 'Landlord-filed applications naming this person as a responding tenant'}
                  </div>
                  <div className="space-y-2">
                    {ltb.as_respondent.map((m, i) => <OrderCard key={`r${i}`} m={m} zh={zh} />)}
                  </div>
                </div>
              )}

              {ltb.as_applicant.length > 0 && (
                <div className="mt-5">
                  <div className="mb-2 font-mono text-[10px] font-bold uppercase tracking-wider text-body-3">
                    {zh ? '该租客本人提起的申请 · 仅作中性上下文' : 'Applications this tenant brought themselves · context only'}
                  </div>
                  <div className="space-y-2">
                    {ltb.as_applicant.map((m, i) => <OrderCard key={`a${i}`} m={m} zh={zh} context />)}
                  </div>
                  <p className="mt-2 text-[12px] leading-relaxed" style={{ color: '#B45309' }}>
                    {zh
                      ? 'T1/T2/T5/T6 是租客依《住宅租赁法》主张自身权利。以此拒租涉嫌报复，属违法——这些记录不参与评分。'
                      : 'T1/T2/T5/T6 are the tenant asserting their own rights under the RTA. Refusing an applicant on this basis is retaliatory and unlawful — these records carry no weight in the score.'}
                  </p>
                </div>
              )}

              <p className="mt-5 text-[11.5px] leading-relaxed text-body-3">
                {zh
                  ? '目录不含判决结果字段（文档类型只有 判令 / 单方判令 / 复核 / 修订），因此这里只能说明「已出判令」，不能说明是否被驱逐或欠款——需查看判令原件。姓名命中在地址佐证之前一律视为同名。数据依《安大略省开放政府许可》提供。'
                  : 'The catalogue carries no disposition field (Document Type is only Order / ExParte / Review / Amended), so this can say an order issued and nothing about eviction or arrears — read the order itself. A name match is treated as a namesake until an address corroborates it. Contains information licensed under the Open Government Licence – Ontario.'}
              </p>
            </div>
          )}

          {/* Ontario court portal party matches */}
          {portalRecords.length > 0 && (
            <div className="rounded-2xl border border-line-divider bg-white p-6 sm:p-8">
              <h2 className="text-[18px] font-extrabold tracking-tight">
                {zh ? '安省法院门户 · 当事人检索' : 'Ontario court portal · party search'}
              </h2>
              <div className="mt-4 space-y-2.5">
                {portalRecords.map((p, i) => (
                  <div key={i} className="rounded-lg border border-line-divider bg-[#FAFAF8] px-4 py-3 text-[13px]">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <strong>{p.caseNumber}</strong>
                      <span className="text-body-3">{p.filedDate}</span>
                      <Badge label={p.partyRole} color={/defendant|debtor/i.test(p.partyRole) ? '#DC2626' : '#71717A'} />
                      {p.closedFlag && <Badge label={zh ? '已结案' : 'CLOSED'} color="#71717A" />}
                    </div>
                    <div className="mt-1 break-words text-[12px] text-body-2">
                      {p.caseTitle} · {p.caseCategory} · {p.courtAbbreviation} · {p.partyDisplayName}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-2xl border border-red-200 bg-white p-6 sm:p-8">
            <h2 className="text-[18px] font-extrabold tracking-tight">{zh ? 'RTA · OHRC 红线' : 'RTA · OHRC red lines'}</h2>
            <p className="mt-2 text-[13px] text-body-2">
              {zh
                ? '依《安大略省人权法》s.2(1) 与《住宅租赁法》，以下类别不进入检索，也不进入评分：'
                : 'Under Ontario Human Rights Code s.2(1) and the Residential Tenancies Act, the following are excluded from this search and from scoring:'}
            </p>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {REDLINES.map((r, i) => (
                <div key={i} className="flex items-start gap-2 text-[13px]">
                  <span className="font-bold text-red-500">&#10005;</span>
                  <span className="text-body-2">{zh ? r.zh : r.en}</span>
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
