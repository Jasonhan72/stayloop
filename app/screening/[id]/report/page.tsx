'use client'

export const runtime = 'edge'

// V5.3 · VOL 7 · Artboards 65+68 — Full Report (dual bureau + forensics) + Final Report (downloadable).
// Route: /screening/[id]/report
// The most data-dense page in Stayloop: 8-engine screening output for Mia Chen demo.

import { useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import Header from '@/components/Header'
import Footer from '@/components/Footer'

/* ─────────────────────────── MOCK DATA ─────────────────────────── */

const REPORT_META = {
  subject: 'Mia Chen',
  titleCn: '单人深度尽调报告',
  version: 'v 1.0',
  code: 'SC-3P9K2X',
  timestamp: '2026/05/22 14:46:55',
  engines: 8,
  datapoints: 504,
  elapsed: '0:04:47',
}

const VERDICT = {
  decision: 'PROCEED',
  pass: 7,
  info: 1,
  redLine: 0,
  explanation:
    '8 引擎全部完成 · 7 项 PASS · 1 项 INFO（信用查询频率略高，已自动归因为近期搬家 + 换车贷）· 0 条红线。双局信用报告一致、文档原始性通过、无 LTB 记录、无负面公共信息。综合建议：可继续审批流程。',
}

const DIMENSIONS = [
  { name: 'Credit 信用', score: 92, dp: 128, status: 'PASS' as const },
  { name: 'Income 收入', score: 88, dp: 64, status: 'PASS' as const },
  { name: 'Identity 身份', score: 95, dp: 42, status: 'PASS' as const },
  { name: 'Rental 租史', score: 90, dp: 48, status: 'PASS' as const },
  { name: 'Fraud 伪造', score: 96, dp: 35, status: 'PASS' as const },
  { name: 'Legal 法务', score: 94, dp: 52, status: 'PASS' as const },
  { name: 'Behavior 行为', score: 82, dp: 67, status: 'PASS' as const },
  { name: 'Network 关联', score: 78, dp: 68, status: 'INFO' as const },
]

const DATA_SOURCES = [
  { name: 'Equifax®', live: true },
  { name: 'TransUnion®', live: true },
  { name: 'Openroom', live: true },
  { name: 'CanLII', live: true },
  { name: 'LCB', live: true },
  { name: 'Nova Credit', live: true },
  { name: 'Stayloop ML', live: true },
  { name: 'LTB Direct', live: true },
]

const TRADELINES = [
  { account: 'TD VISA Infinite', type: 'Revolving', limit: '$18,500', balance: '$2,140', status: 'Current', opened: '2019-03', bureau: 'Both' },
  { account: 'RBC Avion VISA', type: 'Revolving', limit: '$12,000', balance: '$890', status: 'Current', opened: '2020-07', bureau: 'Both' },
  { account: 'Amex Cobalt', type: 'Revolving', limit: '$10,000', balance: '$1,450', status: 'Current', opened: '2021-11', bureau: 'EQ' },
  { account: 'CIBC Auto Loan', type: 'Installment', limit: '$32,000', balance: '$14,200', status: 'Current', opened: '2023-01', bureau: 'Both' },
  { account: 'Rogers Mastercard', type: 'Revolving', limit: '$5,000', balance: '$320', status: 'Current', opened: '2022-04', bureau: 'TU' },
  { account: 'OSAP Student Loan', type: 'Installment', limit: '$28,000', balance: '$6,800', status: 'Current', opened: '2016-09', bureau: 'Both' },
  { account: 'BMO LOC', type: 'LOC', limit: '$15,000', balance: '$0', status: 'Current', opened: '2020-02', bureau: 'Both' },
  { account: 'Canadian Tire MC', type: 'Revolving', limit: '$3,000', balance: '$0', status: 'Closed', opened: '2018-06', bureau: 'EQ' },
]

const DIFF_METRICS = [
  { label: '逾期 30 天', eq: '0', tu: '0', match: true },
  { label: '逾期 60 天', eq: '0', tu: '0', match: true },
  { label: '逾期 90+', eq: '0', tu: '0', match: true },
  { label: '未付余额', eq: '$25,800', tu: '$24,250', match: false },
  { label: '月债务', eq: '$1,420', tu: '$1,380', match: false },
  { label: '收款/破产', eq: '0', tu: '0', match: true },
  { label: '最老账龄', eq: '10y 2m', tu: '10y 2m', match: true },
  { label: '已开账户', eq: '8', tu: '7', match: false },
]

const CROSS_CHECK = [
  { field: 'Employer 雇主', result: 'MATCH', detail: 'Shopify · confirmed via paystub + T4' },
  { field: 'Income 收入', result: 'MATCH', detail: '$92,000 · ±2% of declared' },
  { field: 'Address 地址', result: 'MATCH', detail: '142 Liberty St · matches utility + ID' },
  { field: 'Name/DOB 姓名/生日', result: 'MATCH', detail: 'Mia Chen · 1996-03-14 · all sources' },
]

const RENT_HISTORY = [
  { address: '142 Liberty St, Toronto', rent: '$2,800/mo', months: 14, onTime: '100%', status: 'CURRENT' },
  { address: '88 King St W, Toronto', rent: '$2,250/mo', months: 65, onTime: '100%', status: 'PRIOR' },
]

const DOC_FORENSICS = [
  { doc: 'T4 Statement 2025', font: 'CLEAN', editor: 'CLEAN', date: 'CLEAN', image: 'CLEAN', verdict: 'PASS' },
  { doc: 'Paystub Mar 2026', font: 'CLEAN', editor: 'CLEAN', date: 'CLEAN', image: 'CLEAN', verdict: 'PASS' },
  { doc: 'Bank Statement', font: 'CLEAN', editor: 'CLEAN', date: 'CLEAN', image: 'CLEAN', verdict: 'PASS' },
  { doc: 'Passport Copy', font: 'N/A', editor: 'CLEAN', date: 'CLEAN', image: 'CLEAN', verdict: 'PASS' },
  { doc: 'Reference Letter', font: 'CLEAN', editor: 'CLEAN', date: 'CLEAN', image: 'CLEAN', verdict: 'PASS' },
]

const PUBLIC_RECORDS = [
  { source: 'Openroom', status: 'CLEAR', detail: '0 eviction filings' },
  { source: 'SOQUIJ', status: 'CLEAR', detail: 'No Québec civil records' },
  { source: 'CanLII', status: 'CLEAR', detail: '0 cases involving subject' },
  { source: 'OSB (破产)', status: 'CLEAR', detail: 'No insolvency filings' },
  { source: 'LTB Direct', status: 'CLEAR', detail: '0 applications / orders' },
  { source: 'OHRT', status: 'CLEAR', detail: 'No tribunal filings' },
  { source: 'Criminal (CPIC)', status: 'CLEAR', detail: 'Not available / not queried' },
  { source: '负面报道', status: 'CLEAR', detail: 'No adverse media hits' },
]

const AUDIT_TRAIL = [
  { time: '14:42:08', event: 'Screening initiated by landlord@demo.stayloop.ai' },
  { time: '14:42:09', event: 'Consent token verified · SHA-256 fingerprint logged' },
  { time: '14:42:11', event: '5 documents received · virus scan PASS' },
  { time: '14:42:14', event: 'Engine 1-6 dispatched (parallel)' },
  { time: '14:43:22', event: 'Equifax soft pull completed · score 762' },
  { time: '14:43:28', event: 'TransUnion soft pull completed · score 754' },
  { time: '14:44:01', event: 'Document forensics completed · 5/5 CLEAN' },
  { time: '14:45:30', event: 'LTB / Court search completed · 0 records' },
  { time: '14:46:12', event: 'Network graph built · 12 nodes · 0 flags' },
  { time: '14:46:55', event: 'Report generated · 41 pages · PDF ready' },
]

/* ─────────────────────────── HELPERS ─────────────────────────── */

const statusColor = (s: string) =>
  s === 'PASS' || s === 'CLEAN' || s === 'CLEAR' || s === 'MATCH' || s === 'PROCEED'
    ? '#16A34A'
    : s === 'INFO' || s === 'REVIEW'
      ? '#D97706'
      : '#DC2626'

const statusBg = (s: string) => statusColor(s) + '12'

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
          ▾
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

/* ─────────────────── SCORE DISTRIBUTION BAR ─────────────────── */

function CreditDistribution({ score, label, band }: { score: number; label: string; band: string }) {
  const pct = Math.round((score / 850) * 100)
  return (
    <div>
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-[28px] font-extrabold tracking-tight">{score}</span>
        <span className="font-mono text-[12px] text-body-3">/ 850</span>
        <Badge label={band} color={statusColor('PASS')} />
      </div>
      <div className="mt-1 font-mono text-[11px] text-body-3">{label}</div>
      {/* Distribution bar */}
      <div className="relative mt-3 h-[14px] w-full overflow-hidden rounded-full" style={{ background: '#F0EDE4' }}>
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{
            width: `${pct}%`,
            background: 'linear-gradient(90deg, #DC2626 0%, #D97706 30%, #16A34A 60%, #047857 100%)',
          }}
        />
        <div
          className="absolute top-[-3px] h-[20px] w-[3px] rounded-full bg-ink"
          style={{ left: `${pct}%` }}
        />
      </div>
      <div className="mt-1 flex justify-between font-mono text-[9px] text-body-4">
        <span>300</span>
        <span>500</span>
        <span>650</span>
        <span>750</span>
        <span>850</span>
      </div>
    </div>
  )
}

/* ───────────────── RENT HEATMAP (24 MONTHS) ─────────────────── */

function RentHeatmap({ months, label }: { months: number; label: string }) {
  const cells = Array.from({ length: 24 }, (_, i) => i < months)
  return (
    <div>
      <div className="mb-2 font-mono text-[10px] font-bold uppercase tracking-eyebrow text-body-3">{label}</div>
      <div className="flex flex-wrap gap-[3px]">
        {cells.map((paid, i) => (
          <div
            key={i}
            className="h-[14px] w-[14px] rounded-[2px]"
            style={{ background: paid ? '#16A34A' : '#E0DACE' }}
            title={paid ? 'On-time' : 'No data'}
          />
        ))}
      </div>
    </div>
  )
}

/* ══════════════════════════ MAIN PAGE ══════════════════════════ */

export default function ReportPage() {
  const params = useParams()
  const id = params?.id as string || 'SC-3P9K2X'
  const [shareLink] = useState('https://app.stayloop.ai/r/3P9K2X')
  const [shareCopied, setShareCopied] = useState(false)

  const copyLink = () => {
    navigator.clipboard.writeText(shareLink)
    setShareCopied(true)
    setTimeout(() => setShareCopied(false), 2000)
  }

  return (
    <div style={{ background: '#FAF7EE', color: '#171717', minHeight: '100vh' }}>
      <Header variant="solid" />

      <div className="mx-auto max-w-[1100px] px-5 pb-24 pt-10 sm:px-7 lg:px-8">

        {/* ── TOP HEADER ── */}
        <div className="flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-eyebrowLg text-body-3">
          <span className="inline-block h-[6px] w-[6px] rounded-full" style={{ background: '#16A34A', boxShadow: '0 0 6px #16A34A' }} />
          SCREENING REPORT &middot; COMPLETE
        </div>

        <h1 className="mt-4 text-[28px] font-extrabold leading-tight tracking-tightest sm:text-[34px]">
          {REPORT_META.subject} &middot; {REPORT_META.titleCn} &middot; {REPORT_META.version}
        </h1>

        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[11px] text-body-3">
          <span>{REPORT_META.code}</span>
          <span>&middot;</span>
          <span>{REPORT_META.timestamp}</span>
          <span>&middot;</span>
          <span>{REPORT_META.engines} ENGINES</span>
          <span>&middot;</span>
          <span>{REPORT_META.datapoints} DATAPOINTS</span>
          <span>&middot;</span>
          <span>{REPORT_META.elapsed}</span>
        </div>

        {/* Actions bar */}
        <div className="mt-5 flex flex-wrap gap-2">
          <button className="inline-flex items-center gap-1.5 rounded-lg border border-line-divider bg-white px-4 py-2 font-mono text-[12px] text-body-2 transition hover:border-line-strong">
            &#8635; 重跑
          </button>
          <button className="inline-flex items-center gap-1.5 rounded-lg border border-line-divider bg-white px-4 py-2 font-mono text-[12px] text-body-2 transition hover:border-line-strong">
            &#128229; 下载 PDF
          </button>
          <button className="inline-flex items-center gap-1.5 rounded-lg border border-line-divider bg-white px-4 py-2 font-mono text-[12px] text-body-2 transition hover:border-line-strong">
            &#128279; 分享
          </button>
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
        </div>

        {/* ── VERDICT CARD ── */}
        <div
          className="mt-8 rounded-2xl border-2 p-6 sm:p-8"
          style={{ borderColor: statusColor(VERDICT.decision), background: statusBg(VERDICT.decision) }}
        >
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-mono text-[22px] font-extrabold" style={{ color: statusColor(VERDICT.decision) }}>
              {VERDICT.decision}
            </span>
            <Badge label={`${VERDICT.pass} PASS`} color="#16A34A" />
            <Badge label={`${VERDICT.info} INFO`} color="#D97706" />
            <Badge label={`${VERDICT.redLine} RED LINE`} color="#DC2626" />
          </div>
          <p className="mt-3 text-[13.5px] leading-relaxed text-body-2">{VERDICT.explanation}</p>
        </div>

        {/* ── SCORE SUMMARY (8 dimensions grid) ── */}
        <div className="mt-8 rounded-2xl border border-line-divider bg-white p-6 shadow-sm sm:p-8">
          <div className="flex items-baseline gap-3">
            <span className="font-mono text-[36px] font-extrabold tracking-tight">89</span>
            <span className="font-mono text-[14px] text-body-3">/ 100</span>
            <span className="font-mono text-[12px] font-bold" style={{ color: '#16A34A' }}>COMPOSITE SCORE</span>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {DIMENSIONS.map((d) => (
              <div key={d.name} className="rounded-xl border border-line-divider p-3">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[20px] font-extrabold">{d.score}</span>
                  <Badge label={d.status} color={statusColor(d.status)} />
                </div>
                <div className="mt-1 text-[12px] font-semibold text-body">{d.name}</div>
                <div className="font-mono text-[10px] text-body-4">{d.dp} dp</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── DATA SOURCES BAR ── */}
        <div className="mt-4 rounded-xl border border-line-divider bg-white px-6 py-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-3">
            {DATA_SOURCES.map((s) => (
              <span key={s.name} className="inline-flex items-center gap-1.5 font-mono text-[11px] font-medium text-body-2">
                <span className="inline-block h-[5px] w-[5px] rounded-full" style={{ background: '#16A34A' }} />
                {s.name}
              </span>
            ))}
            <span className="ml-auto font-mono text-[11px] font-bold" style={{ color: '#047857' }}>
              {DATA_SOURCES.length} SOURCES LIVE
            </span>
          </div>
          <div className="mt-2 font-mono text-[10px] text-body-4">
            SOFT INQUIRY &middot; 软查询 &middot; 不影响申请人信用分
          </div>
        </div>

        {/* ─── COLLAPSIBLE SECTIONS ─── */}
        <div className="mt-8 space-y-4">

          {/* ── DUAL BUREAU ── */}
          <SectionShell id="dual-bureau" title="DUAL BUREAU &middot; 双局信用" subtitle="Equifax + TransUnion soft pull · cross-verified">
            <div className="grid gap-8 lg:grid-cols-2">
              {/* Equifax */}
              <div>
                <div className="mb-1 font-mono text-[11px] font-bold uppercase tracking-eyebrow text-body-3">EQUIFAX</div>
                <CreditDistribution score={762} label="&#9650;+14 vs 6mo ago" band="VERY GOOD" />
              </div>
              {/* TransUnion */}
              <div>
                <div className="mb-1 font-mono text-[11px] font-bold uppercase tracking-eyebrow text-body-3">TRANSUNION</div>
                <CreditDistribution score={754} label="&#9650;+9 vs 6mo ago" band="GOOD" />
              </div>
            </div>

            {/* DIFF table */}
            <div className="mt-8">
              <div className="mb-3 flex items-center gap-2">
                <span className="font-mono text-[12px] font-bold">DIFF</span>
                <Badge label="&Delta;8" color="#D97706" />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="border-b border-line-divider font-mono text-[10px] font-bold uppercase text-body-3">
                      <th className="pb-2 pr-4 text-left">Metric</th>
                      <th className="pb-2 pr-4 text-right">EQ</th>
                      <th className="pb-2 pr-4 text-right">TU</th>
                      <th className="pb-2 text-center">Match</th>
                    </tr>
                  </thead>
                  <tbody>
                    {DIFF_METRICS.map((m) => (
                      <tr key={m.label} className="border-b border-line-divider/50">
                        <td className="py-2 pr-4 font-medium text-body-2">{m.label}</td>
                        <td className="py-2 pr-4 text-right font-mono text-body">{m.eq}</td>
                        <td className="py-2 pr-4 text-right font-mono text-body">{m.tu}</td>
                        <td className="py-2 text-center">
                          <span style={{ color: m.match ? '#16A34A' : '#D97706' }}>{m.match ? '=' : '≠'}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* TRADELINES */}
            <div className="mt-8">
              <div className="mb-3 font-mono text-[12px] font-bold">TRADELINES &middot; {TRADELINES.length} ACCOUNTS</div>
              <div className="overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="border-b border-line-divider font-mono text-[10px] font-bold uppercase text-body-3">
                      <th className="pb-2 pr-3 text-left">Account</th>
                      <th className="pb-2 pr-3 text-left">Type</th>
                      <th className="pb-2 pr-3 text-right">Limit</th>
                      <th className="pb-2 pr-3 text-right">Balance</th>
                      <th className="pb-2 pr-3 text-center">Status</th>
                      <th className="pb-2 pr-3 text-left">Opened</th>
                      <th className="pb-2 text-center">Bureau</th>
                    </tr>
                  </thead>
                  <tbody>
                    {TRADELINES.map((t) => (
                      <tr key={t.account} className="border-b border-line-divider/50">
                        <td className="py-2 pr-3 font-medium text-body">{t.account}</td>
                        <td className="py-2 pr-3 font-mono text-body-2">{t.type}</td>
                        <td className="py-2 pr-3 text-right font-mono text-body">{t.limit}</td>
                        <td className="py-2 pr-3 text-right font-mono text-body">{t.balance}</td>
                        <td className="py-2 pr-3 text-center">
                          <Badge label={t.status === 'Current' ? 'CURRENT' : 'CLOSED'} color={t.status === 'Current' ? '#16A34A' : '#71717A'} />
                        </td>
                        <td className="py-2 pr-3 font-mono text-body-3">{t.opened}</td>
                        <td className="py-2 text-center font-mono text-[10px] text-body-3">{t.bureau}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* CREDIT INQUIRIES */}
            <div className="mt-8">
              <div className="mb-3 font-mono text-[12px] font-bold">CREDIT INQUIRIES &middot; 12 MONTHS</div>
              <div className="flex gap-6">
                <div className="rounded-xl border border-line-divider p-4 text-center">
                  <div className="font-mono text-[24px] font-extrabold" style={{ color: '#D97706' }}>3</div>
                  <div className="font-mono text-[10px] text-body-3">HARD</div>
                </div>
                <div className="rounded-xl border border-line-divider p-4 text-center">
                  <div className="font-mono text-[24px] font-extrabold" style={{ color: '#16A34A' }}>4</div>
                  <div className="font-mono text-[10px] text-body-3">SOFT</div>
                </div>
              </div>
              <p className="mt-2 text-[12px] text-body-3">
                Hard inquiries: CIBC Auto (Jan 2023), Rogers (Apr 2022), TD Mortgage pre-approval (Nov 2025)
              </p>
            </div>

            {/* CROSS-CHECK */}
            <div className="mt-8">
              <div className="mb-3 flex items-center gap-2">
                <span className="font-mono text-[12px] font-bold">CROSS-CHECK</span>
                <Badge label="4/4 MATCH" color="#16A34A" />
              </div>
              <div className="space-y-2">
                {CROSS_CHECK.map((c) => (
                  <div key={c.field} className="flex items-center gap-3 rounded-lg border border-line-divider/60 px-4 py-2.5">
                    <Badge label={c.result} color={statusColor(c.result)} />
                    <span className="text-[12px] font-semibold text-body">{c.field}</span>
                    <span className="ml-auto font-mono text-[11px] text-body-3">{c.detail}</span>
                  </div>
                ))}
              </div>
            </div>
          </SectionShell>

          {/* ── RENT PAYMENT HISTORY ── */}
          <SectionShell id="rent-history" title="RENT PAYMENT HISTORY &middot; 租金支付记录" subtitle="24-month heatmap &middot; Openroom verified">
            <div className="space-y-6">
              {RENT_HISTORY.map((r) => (
                <div key={r.address}>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    <span className="text-[13px] font-bold text-body">{r.address}</span>
                    <span className="font-mono text-[11px] text-body-3">{r.rent}</span>
                    <span className="font-mono text-[11px] text-body-3">{r.months}mo</span>
                    <Badge label={r.onTime + ' ON-TIME'} color="#16A34A" />
                    <Badge label={r.status} color={r.status === 'CURRENT' ? '#047857' : '#71717A'} />
                  </div>
                  <div className="mt-3">
                    <RentHeatmap months={Math.min(r.months, 24)} label={r.status === 'CURRENT' ? 'CURRENT ADDRESS' : 'PRIOR ADDRESS'} />
                  </div>
                </div>
              ))}
            </div>
          </SectionShell>

          {/* ── DOCUMENT FORENSICS ── */}
          <SectionShell id="doc-forensics" title="DOCUMENT FORENSICS &middot; 文档伪造检测" subtitle="5/5 CLEAN &middot; 0 RED FLAGS">
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="border-b border-line-divider font-mono text-[10px] font-bold uppercase text-body-3">
                    <th className="pb-2 pr-3 text-left">Document</th>
                    <th className="pb-2 pr-3 text-center">Font</th>
                    <th className="pb-2 pr-3 text-center">Editor Traces</th>
                    <th className="pb-2 pr-3 text-center">Date Meta</th>
                    <th className="pb-2 pr-3 text-center">Non-Image</th>
                    <th className="pb-2 text-center">Verdict</th>
                  </tr>
                </thead>
                <tbody>
                  {DOC_FORENSICS.map((d) => (
                    <tr key={d.doc} className="border-b border-line-divider/50">
                      <td className="py-2.5 pr-3 font-medium text-body">{d.doc}</td>
                      <td className="py-2.5 pr-3 text-center"><Badge label={d.font} color={d.font === 'CLEAN' ? '#16A34A' : '#71717A'} /></td>
                      <td className="py-2.5 pr-3 text-center"><Badge label={d.editor} color="#16A34A" /></td>
                      <td className="py-2.5 pr-3 text-center"><Badge label={d.date} color="#16A34A" /></td>
                      <td className="py-2.5 pr-3 text-center"><Badge label={d.image} color="#16A34A" /></td>
                      <td className="py-2.5 text-center"><Badge label={d.verdict} color={statusColor(d.verdict)} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionShell>

          {/* ── PUBLIC RECORDS ── */}
          <SectionShell id="public-records" title="PUBLIC RECORDS &middot; 公共记录" subtitle="8 sources &middot; all CLEAR for subject">
            <div className="space-y-2">
              {PUBLIC_RECORDS.map((r) => (
                <div key={r.source} className="flex items-center gap-3 rounded-lg border border-line-divider/60 px-4 py-2.5">
                  <Badge label={r.status} color={statusColor(r.status)} />
                  <span className="min-w-[100px] text-[12px] font-semibold text-body">{r.source}</span>
                  <span className="font-mono text-[11px] text-body-3">{r.detail}</span>
                </div>
              ))}
            </div>

            {/* SIMILARITY SCORE */}
            <div className="mt-6 rounded-xl border border-line-divider bg-surface-chip p-4">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[11px] font-bold text-body-3">DISAMBIGUATION</span>
                <Badge label="92% LIKELY MATCH" color="#D97706" />
              </div>
              <p className="mt-2 text-[12px] leading-relaxed text-body-2">
                M. Goldberg at 88 King St W appears in 1 CanLII filing (2019, small claims, plaintiff).
                Similarity score 92% based on name + address overlap.
                Cross-checked: different DOB, different SIN prefix.
                Conclusion: <b>not the same person</b> &mdash; no action required.
              </p>
            </div>
          </SectionShell>

          {/* ── REPORT PREVIEW ── */}
          <SectionShell id="report-preview" title="REPORT PREVIEW &middot; 报告预览" subtitle="41-page PDF" defaultOpen={false}>
            <div className="flex items-center justify-center rounded-xl border-2 border-dashed border-line-divider py-16" style={{ background: '#FAFAF8' }}>
              <div className="text-center">
                <div className="text-[40px]">&#128196;</div>
                <div className="mt-2 font-mono text-[14px] font-bold text-body-2">Screening Report</div>
                <div className="mt-1 font-mono text-[11px] text-body-3">Mia Chen &middot; SC-3P9K2X &middot; 41 pages</div>
                <div className="mt-1 font-mono text-[10px] text-body-4">PDF preview renders here in production</div>
              </div>
            </div>
          </SectionShell>

          {/* ── CHAIN OF CUSTODY ── */}
          <SectionShell id="chain-of-custody" title="CHAIN OF CUSTODY &middot; 审计追踪" subtitle="Immutable audit log &middot; SHA-256 hashed" defaultOpen={false}>
            <div className="space-y-0">
              {AUDIT_TRAIL.map((a, i) => (
                <div key={i} className="flex gap-4 border-b border-line-divider/40 py-2.5 last:border-0">
                  <span className="shrink-0 font-mono text-[11px] font-bold text-body-3">{a.time}</span>
                  <span className="text-[12px] text-body-2">{a.event}</span>
                </div>
              ))}
            </div>
          </SectionShell>

          {/* ── DOWNLOAD ── */}
          <SectionShell id="download" title="DOWNLOAD &middot; 下载" subtitle="Export in multiple formats">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { label: '完整报告 PDF', sub: 'Full 41-page report', icon: '&#128196;' },
                { label: '摘要版 PDF', sub: '2-page executive summary', icon: '&#128203;' },
                { label: '原始数据 JSON', sub: 'Machine-readable payload', icon: '&#128190;' },
                { label: '法务 CSV', sub: 'Compliance-ready export', icon: '&#128200;' },
              ].map((d) => (
                <button
                  key={d.label}
                  className="flex flex-col items-center gap-2 rounded-xl border border-line-divider bg-surface-chip p-5 text-center transition hover:border-line-strong hover:shadow-sm"
                >
                  <span className="text-[24px]" dangerouslySetInnerHTML={{ __html: d.icon }} />
                  <span className="text-[13px] font-bold text-body">{d.label}</span>
                  <span className="font-mono text-[10px] text-body-3">{d.sub}</span>
                </button>
              ))}
            </div>
          </SectionShell>

          {/* ── SHARE ── */}
          <SectionShell id="share" title="SHARE &middot; 分享" subtitle="Read-only link with access controls">
            <div className="space-y-4">
              {/* Link */}
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={shareLink}
                  className="flex-1 rounded-lg border border-line-divider bg-surface-chip px-4 py-2.5 font-mono text-[12px] text-body-2"
                />
                <button
                  onClick={copyLink}
                  className="shrink-0 rounded-lg border border-line-divider bg-white px-4 py-2.5 font-mono text-[12px] font-bold text-body-2 transition hover:border-line-strong"
                >
                  {shareCopied ? 'Copied!' : 'Copy'}
                </button>
              </div>

              {/* Access controls */}
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-xl border border-line-divider p-4">
                  <div className="font-mono text-[10px] font-bold uppercase text-body-3">PASSWORD</div>
                  <div className="mt-1 text-[13px] font-semibold text-body">Enabled</div>
                  <div className="font-mono text-[10px] text-body-4">Set on first share</div>
                </div>
                <div className="rounded-xl border border-line-divider p-4">
                  <div className="font-mono text-[10px] font-bold uppercase text-body-3">VIEW LIMIT</div>
                  <div className="mt-1 text-[13px] font-semibold text-body">5 views</div>
                  <div className="font-mono text-[10px] text-body-4">0 / 5 used</div>
                </div>
                <div className="rounded-xl border border-line-divider p-4">
                  <div className="font-mono text-[10px] font-bold uppercase text-body-3">EXPIRY</div>
                  <div className="mt-1 text-[13px] font-semibold text-body">7 days</div>
                  <div className="font-mono text-[10px] text-body-4">Expires 2026/05/29</div>
                </div>
              </div>
            </div>
          </SectionShell>

          {/* ── LEGAL / COMPLIANCE ── */}
          <SectionShell id="legal" title="LEGAL &middot; 合规声明" subtitle="RTA &middot; PIPEDA &middot; OHRC &middot; FCRA" defaultOpen={false}>
            <div className="flex flex-wrap gap-3">
              {[
                { code: 'RTA', name: 'Residential Tenancies Act', detail: 'Ontario · compliant' },
                { code: 'PIPEDA', name: 'Personal Information Protection', detail: 'Federal · compliant' },
                { code: 'OHRC', name: 'Ontario Human Rights Code', detail: '17 protected grounds excluded' },
                { code: 'FCRA', name: 'Fair Credit Reporting Act', detail: 'US equivalent · advisory only' },
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
                score applicants based on any of the 17 protected grounds under the Ontario Human Rights Code
                (race, ancestry, place of origin, colour, ethnic origin, citizenship, creed, sex, sexual orientation,
                gender identity, gender expression, age, marital status, family status, disability, receipt of public
                assistance, or record of offences). This report presents factual findings only and does not
                constitute a recommendation to approve or deny a tenancy application. The landlord retains sole
                discretion and responsibility for all tenancy decisions. Data retention: 7 years per PIPEDA
                requirements. Applicant may request access to this report under PIPEDA Section 8.
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
