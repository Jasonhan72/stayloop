'use client'

export const runtime = 'edge'

// V5.3 · VOL 7 · Artboard 64 — Scan Complete / Stayloop Score
// Route: /screening/[id]/done
// Shows final score after all 8 engines finish.

import { useParams } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'

/* ---------- mock data ---------- */

const SCORE = 89
const SCORE_MAX = 100
const VERDICT = 'PROCEED'
const VERDICT_LABEL = '高置信度'
const PASS_COUNT = 7
const INFO_COUNT = 1
const RED_FLAG_COUNT = 0
const TOTAL_DP = 504
const ELAPSED = '4:47'
const CHAIN = '0xa481f7c0…3c92'
const SCAN_CODE = 'SC-3P9K2X'

const DIMENSIONS: {
  icon: string
  name: string
  label: string
  score: number
  dp: number
  dpTotal: number
  detail?: string
  isNew?: boolean
}[] = [
  { icon: 'ID', name: 'Identity', label: '身份核验', score: 99, dp: 32, dpTotal: 32 },
  { icon: '$', name: 'Income', label: '收入流水', score: 92, dp: 48, dpTotal: 48, detail: '$9,200 / mo · 3.3× 门槛 · Shopify 4.5y' },
  { icon: 'H', name: 'History', label: '租住历史', score: 96, dp: 52, dpTotal: 52 },
  { icon: 'F', name: 'Fraud', label: '文档伪造检测', score: 94, dp: 64, dpTotal: 64 },
  { icon: 'B', name: 'Behavior', label: '行为信号', score: 88, dp: 26, dpTotal: 26 },
  { icon: 'X', name: 'X-Ref', label: '双征信', score: 90, dp: 76, dpTotal: 76 },
  { icon: '⚖', name: 'LTB / Court', label: '法庭记录', score: 100, dp: 122, dpTotal: 122, isNew: true },
  { icon: '⛓', name: 'Relations', label: '关联图谱', score: 82, dp: 84, dpTotal: 84, isNew: true },
]

const SCORE_BREAKDOWN: { delta: string; text: string; positive: boolean }[] = [
  { delta: '+8', text: 'Identity 高置信 · 护照 + 活体 99.7%', positive: true },
  { delta: '+7', text: '收入 3.3× 硬门槛', positive: true },
  { delta: '+6', text: '0 LTB / 民事 / 破产记录', positive: true },
  { delta: '+5', text: '关联网络互验证', positive: true },
  { delta: '−5', text: '关联人 LTB INFO', positive: false },
  { delta: '−2', text: '行为信号小差', positive: false },
]

const KEY_FINDINGS: { tag: string; type: 'pass' | 'info'; title: string; desc: string }[] = [
  { tag: '✓', type: 'pass', title: 'Identity 高置信', desc: '护照 OCR + 活体比对 99.7% 置信 · 姓名 / 地址 / DOB 全匹配' },
  { tag: '✓', type: 'pass', title: 'Income 优于门槛', desc: '$9,200 / mo · 3.3× · Shopify 4.5y · 银行流水一致' },
  { tag: '▲', type: 'info', title: 'LTB 关联人 1 项', desc: '前室友 Zhang W. 有 1 条 2019 LTB 记录 · 不涉及申请人' },
  { tag: '✓', type: 'pass', title: '关联人网络一致', desc: '3 位推荐人 / 前房东互验通过 · 无循环引用' },
]

/* ---------- helpers ---------- */

/** SVG score ring */
function ScoreRing({ score, max, size = 180 }: { score: number; max: number; size?: number }) {
  const stroke = 10
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const progress = (score / max) * circumference
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="block">
      {/* track */}
      <circle
        cx={size / 2} cy={size / 2} r={radius}
        fill="none" stroke="#E0DACE" strokeWidth={stroke}
      />
      {/* progress */}
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

/* ---------- page ---------- */

export default function ScanDonePage() {
  const params = useParams()
  const id = params?.id as string | undefined

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
            STEP 2 / 3
          </span>
          <span className="font-mono text-[11px] text-body-3">&middot;</span>
          <span className="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 font-mono text-[10px] font-bold" style={{ color: '#047857', background: '#047857' + '14' }}>
            <span className="inline-block h-[6px] w-[6px] rounded-full" style={{ background: '#047857', boxShadow: '0 0 6px #047857' }} />
            COMPLETE
          </span>
        </div>
      </div>

      {/* Main content */}
      <main>
        <div className="mx-auto max-w-[1240px] px-5 py-10 sm:px-7 lg:px-12">

          {/* Title row */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-[28px] font-extrabold leading-tight sm:text-[32px]">
                Mia Chen <span className="text-body-3 font-normal">&middot;</span> 深度尽调完成 <span className="text-body-3 font-normal">&middot;</span>{' '}
                <span style={{ color: '#047857' }}>8 Engines 全部 PASS</span>
              </h1>
              {/* ID bar */}
              <div className="mt-2 flex flex-wrap items-center gap-2 font-mono text-[11px] text-body-3">
                <span className="font-bold text-body-2">{SCAN_CODE}</span>
                <span>&middot;</span>
                <span>0:04:47</span>
                <span>&middot;</span>
                <span>{TOTAL_DP} / {TOTAL_DP} DP</span>
                <span>&middot;</span>
                <span>CHAIN {CHAIN}</span>
                <span>&middot;</span>
                <span style={{ color: '#047857' }}>audit &#10003;</span>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex flex-wrap gap-2">
              <button className="inline-flex items-center gap-1.5 rounded-lg border border-line-divider bg-white px-4 py-2 text-[13px] font-medium text-body-2 transition hover:border-line-strong">
                &#8635; 重跑
              </button>
              <Link
                href={`/screening/${id ?? ''}/share`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-line-divider bg-white px-4 py-2 text-[13px] font-medium text-body-2 transition hover:border-line-strong"
              >
                &#128279; 分享只读
              </Link>
              <Link
                href={`/screening/${id ?? ''}/report`}
                className="inline-flex items-center gap-1.5 rounded-lg px-5 py-2 text-[13px] font-bold text-white transition hover:opacity-90"
                style={{ background: '#047857' }}
              >
                查看完整报告 &rarr;
              </Link>
            </div>
          </div>

          {/* ============ Score Card ============ */}
          <div className="mt-8 rounded-2xl border border-line-divider bg-white p-7 shadow-sm sm:p-10">
            <div className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-body-3">
              STAYLOOP SCORE &middot; 证据综合评分
            </div>

            <div className="mt-6 flex flex-col items-center gap-8 sm:flex-row sm:gap-12">
              {/* Score ring */}
              <div className="relative flex-shrink-0">
                <ScoreRing score={SCORE} max={SCORE_MAX} size={180} />
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="font-mono text-[42px] font-extrabold leading-none" style={{ color: '#047857' }}>
                    {SCORE}
                  </span>
                  <span className="font-mono text-[13px] text-body-3">/ {SCORE_MAX}</span>
                  <span className="mt-1 font-mono text-[10px] font-bold uppercase tracking-wider text-body-3">
                    EVIDENCE
                  </span>
                </div>
              </div>

              {/* Verdict + stats */}
              <div className="flex-1">
                <div className="flex items-center gap-3">
                  <span
                    className="rounded-lg px-4 py-1.5 font-mono text-[18px] font-extrabold tracking-wider"
                    style={{ background: '#04785714', color: '#047857' }}
                  >
                    {VERDICT}
                  </span>
                  <span className="font-mono text-[14px] font-bold" style={{ color: '#047857' }}>
                    &middot; {VERDICT_LABEL}
                  </span>
                </div>

                <div className="mt-4 flex flex-wrap gap-3">
                  <span className="rounded-md px-3 py-1 font-mono text-[12px] font-bold" style={{ background: '#04785714', color: '#047857' }}>
                    {PASS_COUNT} PASS
                  </span>
                  <span className="rounded-md px-3 py-1 font-mono text-[12px] font-bold" style={{ background: '#D9770614', color: '#D97706' }}>
                    {INFO_COUNT} INFO
                  </span>
                  <span className="rounded-md px-3 py-1 font-mono text-[12px] font-bold" style={{ background: '#DC262614', color: '#DC2626' }}>
                    {RED_FLAG_COUNT} 红旗
                  </span>
                </div>

                {/* Coverage / DP / time / chain row */}
                <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {[
                    { label: 'COVERAGE', value: '100%' },
                    { label: '数据点', value: `${TOTAL_DP}/${TOTAL_DP}` },
                    { label: '耗时', value: ELAPSED },
                    { label: 'CHAIN', value: '0xa481…3c92' },
                  ].map((s) => (
                    <div key={s.label} className="rounded-lg border border-line-divider px-3 py-2">
                      <div className="font-mono text-[9px] font-bold uppercase tracking-wider text-body-3">{s.label}</div>
                      <div className="mt-0.5 font-mono text-[14px] font-bold text-body">{s.value}</div>
                    </div>
                  ))}
                </div>

                {/* Disclaimer */}
                <p className="mt-4 font-mono text-[11px] leading-relaxed text-body-3">
                  不是 risk score。这是 8 Engine 各自独立证据的加权完整度 / 置信度
                </p>
              </div>
            </div>
          </div>

          {/* ============ 8 DIMENSIONS ============ */}
          <div className="mt-10">
            <div className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-body-3">
              8 DIMENSIONS &middot; 引擎评分
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {DIMENSIONS.map((dim) => (
                <div
                  key={dim.name}
                  className="relative rounded-xl border border-line-divider bg-white p-5 transition hover:border-line-strong hover:shadow-sm"
                >
                  {dim.isNew && (
                    <span className="absolute right-3 top-3 rounded bg-brand/10 px-1.5 py-0.5 font-mono text-[9px] font-bold text-brand">
                      NEW
                    </span>
                  )}
                  <div className="flex items-center gap-2.5">
                    <span
                      className="flex h-9 w-9 items-center justify-center rounded-lg font-mono text-[14px] font-bold"
                      style={{ background: dimScoreColor(dim.score) + '14', color: dimScoreColor(dim.score) }}
                    >
                      {dim.icon}
                    </span>
                    <div>
                      <div className="text-[13px] font-bold text-body">{dim.name}</div>
                      <div className="text-[11px] text-body-3">{dim.label}</div>
                    </div>
                  </div>

                  <div className="mt-3 flex items-end justify-between">
                    <span className="font-mono text-[28px] font-extrabold leading-none" style={{ color: dimScoreColor(dim.score) }}>
                      {dim.score}
                    </span>
                    <span className="font-mono text-[11px] text-body-3">
                      {dim.dp}/{dim.dpTotal} dp
                    </span>
                  </div>

                  {/* Progress bar */}
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-chip">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${dim.score}%`, background: dimScoreColor(dim.score) }}
                    />
                  </div>

                  {dim.detail && (
                    <p className="mt-2 font-mono text-[10px] leading-snug text-body-3">{dim.detail}</p>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* ============ Score Breakdown ============ */}
          <div className="mt-10 rounded-2xl border border-line-divider bg-white p-7 sm:p-10">
            <div className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-body-3">
              为什么 {SCORE} &middot; 加减分推导
            </div>

            <div className="mt-5 space-y-2">
              {SCORE_BREAKDOWN.map((item, i) => (
                <div key={i} className="flex items-center gap-3 rounded-lg px-4 py-2.5" style={{ background: item.positive ? '#04785708' : '#DC262608' }}>
                  <span
                    className="w-[44px] text-right font-mono text-[14px] font-extrabold"
                    style={{ color: item.positive ? '#047857' : '#DC2626' }}
                  >
                    {item.delta}
                  </span>
                  <span className="text-[13px] text-body-2">{item.text}</span>
                </div>
              ))}
            </div>

            {/* Baseline summary */}
            <div className="mt-4 rounded-lg border border-line-divider px-4 py-3" style={{ background: '#F8F5EC' }}>
              <span className="font-mono text-[12px] font-bold text-body">
                BASELINE 80
              </span>
              <span className="font-mono text-[12px] text-body-2">
                {' '}+ 26 加分 &minus; 7 减分 ={' '}
              </span>
              <span className="font-mono text-[16px] font-extrabold" style={{ color: '#047857' }}>
                {SCORE}
              </span>
            </div>
          </div>

          {/* ============ KEY FINDINGS ============ */}
          <div className="mt-10">
            <div className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-body-3">
              KEY FINDINGS &middot; 4 条关键证据 (3 &#10003; &middot; 1 &#9650;)
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {KEY_FINDINGS.map((f, i) => (
                <div key={i} className="rounded-xl border border-line-divider bg-white p-5 transition hover:border-line-strong">
                  <div className="flex items-center gap-2">
                    <span
                      className="flex h-7 w-7 items-center justify-center rounded-md font-mono text-[12px] font-bold"
                      style={{
                        background: f.type === 'pass' ? '#04785714' : '#D9770614',
                        color: f.type === 'pass' ? '#047857' : '#D97706',
                      }}
                    >
                      {f.tag}
                    </span>
                    <span className="text-[14px] font-bold text-body">{f.title}</span>
                  </div>
                  <p className="mt-2 text-[12px] leading-relaxed text-body-2">{f.desc}</p>
                </div>
              ))}
            </div>
          </div>

          {/* ============ Bottom Actions ============ */}
          <div className="mt-10 flex flex-wrap items-center gap-3 border-t border-line-divider pt-8">
            <button className="inline-flex items-center gap-1.5 rounded-lg border border-line-divider bg-white px-5 py-2.5 text-[13px] font-medium text-body-2 transition hover:border-line-strong">
              &#128229; 下载 PDF
            </button>
            <Link
              href={`/screening/${id ?? ''}/share`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line-divider bg-white px-5 py-2.5 text-[13px] font-medium text-body-2 transition hover:border-line-strong"
            >
              &#128279; 分享只读链接
            </Link>
            <button className="inline-flex items-center gap-1.5 rounded-lg border border-line-divider bg-white px-5 py-2.5 text-[13px] font-medium text-body-2 transition hover:border-line-strong">
              &#65291; 加入 Pipeline
            </button>
            <Link
              href={`/screening/${id ?? ''}/report`}
              className="inline-flex items-center gap-1.5 rounded-lg px-6 py-2.5 text-[14px] font-bold text-white transition hover:opacity-90"
              style={{ background: '#047857' }}
            >
              查看完整报告 &rarr;
            </Link>
          </div>

        </div>
      </main>

      <Footer />
    </div>
  )
}
