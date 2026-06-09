'use client'

export const runtime = 'edge'

// V5.3 · VOL 7 · Artboard 67 — Relationship Graph visualization.
// Route: /screening/[id]/graph
// Network consistency check + mutual-neighbor analysis.

import { useParams } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'

/* ── Graph layout data ───────────────────────────────────────────── */

// Center of SVG viewBox (700 x 520)
const CX = 350
const CY = 260

// 1st-degree nodes — inner ring
const FIRST_DEGREE = [
  { id: 'goldberg', label: 'M.Goldberg', sub: '▲1 LTB', x: 200, y: 120, warn: true },
  { id: 'nguyen',   label: 'A.Nguyen',   sub: '推荐人',   x: 500, y: 120, warn: false },
  { id: 'lisa',     label: 'Lisa',        sub: '母',       x: 150, y: 340, warn: false },
  { id: 'aaron',    label: 'Aaron',       sub: '兄',       x: 550, y: 340, warn: false },
  { id: 'shopify',  label: 'Shopify',     sub: '雇主',     x: 350, y: 440, warn: false },
]

// 2nd-degree nodes — outer ring
const SECOND_DEGREE = [
  { id: 'liberty',  label: 'Liberty 2B',  x: 80,  y: 80 },
  { id: 'ptay',     label: 'P.Tay',       x: 100, y: 190 },
  { id: 'tdbank',   label: 'TD Bank',     x: 60,  y: 320 },
  { id: 'king8a',   label: 'King 8A',     x: 100, y: 430 },
  { id: 'nlee',     label: 'N.Lee',       x: 250, y: 490 },
  { id: 'rbc',      label: 'RBC',         x: 450, y: 490 },
  { id: 'lyft',     label: 'Lyft',        x: 600, y: 430 },
  { id: 'cto',      label: 'CTO',         x: 640, y: 190 },
  { id: 'pmlead',   label: 'PM Lead',     x: 620, y: 80 },
]

// Edges: from → to
const EDGES: Array<{ from: string; to: string; dashed?: boolean; mutual?: boolean }> = [
  // Mia → 1st degree
  { from: 'mia', to: 'goldberg' },
  { from: 'mia', to: 'nguyen' },
  { from: 'mia', to: 'lisa' },
  { from: 'mia', to: 'aaron' },
  { from: 'mia', to: 'shopify' },
  // 1st → 2nd degree
  { from: 'goldberg', to: 'liberty' },
  { from: 'goldberg', to: 'ptay' },
  { from: 'lisa', to: 'tdbank' },
  { from: 'lisa', to: 'king8a' },
  { from: 'aaron', to: 'nlee' },
  { from: 'shopify', to: 'rbc' },
  { from: 'shopify', to: 'lyft' },
  { from: 'shopify', to: 'cto' },
  { from: 'nguyen', to: 'pmlead' },
  { from: 'nguyen', to: 'cto', mutual: true },
  // Cross-links between 1st degree (dashed)
  { from: 'nguyen', to: 'goldberg', dashed: true },
  { from: 'nguyen', to: 'shopify', dashed: true },
]

const FINDINGS = [
  { icon: '⛓', title: '互推荐链可信', desc: 'Mia → A.Nguyen → M.Goldberg 链条在 LinkedIn 公开 + 申请表中一致，非伪造推荐闭环', color: '#047857' },
  { icon: '✓', title: '雇主层级自洽', desc: 'Shopify org chart: Mia (PM Lead) ← A.Nguyen (CTO) · LinkedIn 在职时间段吻合 · HR 确认函已核验', color: '#047857' },
  { icon: '✓', title: '担保人具备能力', desc: 'Lisa Chen · TD Bank 主账户 · Equifax 762 · 房产税登记 King St 8A · 担保额度充足', color: '#047857' },
  { icon: '▲', title: '二度网络 1 LTB', desc: 'M.Goldberg (推荐人 / 前房东) TSL-12849-19 · 2019/08 · Liberty Village · L1 和解结案 · 与 Mia 无关', color: '#D97706' },
]

/* ── Helpers ──────────────────────────────────────────────────────── */

function getNodePos(id: string): { x: number; y: number } {
  if (id === 'mia') return { x: CX, y: CY }
  const f = FIRST_DEGREE.find((n) => n.id === id)
  if (f) return { x: f.x, y: f.y }
  const s = SECOND_DEGREE.find((n) => n.id === id)
  if (s) return { x: s.x, y: s.y }
  return { x: CX, y: CY }
}

/* ── Component ───────────────────────────────────────────────────── */

export default function GraphPage() {
  const { id } = useParams<{ id: string }>()

  return (
    <div style={{ background: '#FAF7EE', color: '#171717', minHeight: '100vh' }}>
      <Header variant="transparent" />

      {/* Hero */}
      <section style={{ background: 'linear-gradient(180deg,#F2EEE5 0%,#E4E8EE 100%)' }}>
        <div className="mx-auto max-w-[1240px] px-5 py-16 sm:px-7 lg:px-12">
          <Link
            href={`/screening/${id}`}
            className="font-mono text-[12px] text-body-3 hover:text-body"
          >
            ← 返回 Screening Report
          </Link>

          <div className="mt-5 flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: '#7C3AED' }}>
            <span className="inline-block h-[6px] w-[6px] rounded-full" style={{ background: '#7C3AED', boxShadow: '0 0 6px #7C3AED' }} />
            RELATIONSHIP GRAPH ENGINE
          </div>

          <h1 className="mt-4 text-[28px] font-extrabold leading-tight tracking-tight sm:text-[36px]">
            Mia · 5 一度 + 14 二度 · 自洽性检查 + 共同邻居
          </h1>
          <p className="mt-3 max-w-[800px] text-[14px] leading-relaxed text-body-2">
            SOURCES · LinkedIn 公开 · LTB 共案 · 申请表交叉 · 84 数据点
          </p>

          <div className="mt-4 inline-flex items-center gap-2 rounded-lg px-3 py-1.5 font-mono text-[11px] font-bold uppercase" style={{ color: '#047857', background: '#04785714' }}>
            <span className="inline-block h-[6px] w-[6px] rounded-full" style={{ background: '#047857' }} />
            NETWORK CONSISTENT
          </div>
        </div>
      </section>

      <section>
        <div className="mx-auto max-w-[1240px] px-5 py-10 sm:px-7 lg:px-12 space-y-8">

          {/* ── Graph Visualization ──────────────────────────────── */}
          <div className="rounded-2xl border border-line-divider bg-white p-6 sm:p-8">
            <h2 className="text-[18px] font-extrabold tracking-tight">关系图谱</h2>
            <div className="mt-1 font-mono text-[11px] text-body-3">1° 绿 · 2° 蓝 · 共同邻居 琥珀 · 关联人间链 虚线</div>

            <div className="mt-6 flex justify-center">
              <svg
                viewBox="0 0 700 520"
                xmlns="http://www.w3.org/2000/svg"
                className="w-full max-w-[700px]"
                style={{ fontFamily: 'ui-monospace, SFMono-Regular, monospace' }}
              >
                {/* Edges */}
                {EDGES.map((e, i) => {
                  const from = getNodePos(e.from)
                  const to = getNodePos(e.to)
                  return (
                    <line
                      key={i}
                      x1={from.x}
                      y1={from.y}
                      x2={to.x}
                      y2={to.y}
                      stroke={e.mutual ? '#D97706' : e.dashed ? '#9CA3AF' : '#D4D0C8'}
                      strokeWidth={e.mutual ? 2 : 1.5}
                      strokeDasharray={e.dashed ? '6 4' : 'none'}
                      opacity={0.7}
                    />
                  )
                })}

                {/* 2nd-degree nodes */}
                {SECOND_DEGREE.map((n) => (
                  <g key={n.id}>
                    <circle cx={n.x} cy={n.y} r={18} fill="#EFF6FF" stroke="#3B82F6" strokeWidth={1.5} />
                    <text x={n.x} y={n.y + 1} textAnchor="middle" dominantBaseline="middle" fontSize={8} fontWeight={600} fill="#1E40AF">
                      {n.label.length > 8 ? n.label.slice(0, 7) + '..' : n.label}
                    </text>
                    <text x={n.x} y={n.y + 32} textAnchor="middle" fontSize={7} fill="#6B7280">
                      {n.label}
                    </text>
                  </g>
                ))}

                {/* 1st-degree nodes */}
                {FIRST_DEGREE.map((n) => (
                  <g key={n.id}>
                    <circle
                      cx={n.x}
                      cy={n.y}
                      r={24}
                      fill={n.warn ? '#FEF3C7' : '#ECFDF5'}
                      stroke={n.warn ? '#D97706' : '#047857'}
                      strokeWidth={2}
                    />
                    <text x={n.x} y={n.y - 2} textAnchor="middle" dominantBaseline="middle" fontSize={9.5} fontWeight={700} fill={n.warn ? '#92400E' : '#065F46'}>
                      {n.label.length > 10 ? n.label.slice(0, 9) + '..' : n.label}
                    </text>
                    <text x={n.x} y={n.y + 10} textAnchor="middle" fontSize={7} fill={n.warn ? '#B45309' : '#047857'}>
                      {n.sub}
                    </text>
                  </g>
                ))}

                {/* Center node — Mia */}
                <circle cx={CX} cy={CY} r={32} fill="#EDE9FE" stroke="#7C3AED" strokeWidth={2.5} />
                <text x={CX} y={CY - 4} textAnchor="middle" dominantBaseline="middle" fontSize={14} fontWeight={800} fill="#5B21B6">
                  Mia
                </text>
                <text x={CX} y={CY + 12} textAnchor="middle" fontSize={8} fill="#7C3AED">
                  主体
                </text>

                {/* Legend */}
                <g transform="translate(10, 500)">
                  <circle cx={8} cy={0} r={5} fill="#EDE9FE" stroke="#7C3AED" strokeWidth={1.5} />
                  <text x={18} y={3} fontSize={7} fill="#6B7280">主体</text>
                  <circle cx={58} cy={0} r={5} fill="#ECFDF5" stroke="#047857" strokeWidth={1.5} />
                  <text x={68} y={3} fontSize={7} fill="#6B7280">1° 关联</text>
                  <circle cx={118} cy={0} r={5} fill="#EFF6FF" stroke="#3B82F6" strokeWidth={1.5} />
                  <text x={128} y={3} fontSize={7} fill="#6B7280">2° 网络</text>
                  <circle cx={178} cy={0} r={5} fill="#FEF3C7" stroke="#D97706" strokeWidth={1.5} />
                  <text x={188} y={3} fontSize={7} fill="#6B7280">共同邻居</text>
                  <line x1={238} y1={0} x2={256} y2={0} stroke="#9CA3AF" strokeWidth={1.5} strokeDasharray="4 3" />
                  <text x={262} y={3} fontSize={7} fill="#6B7280">关联人间链</text>
                </g>
              </svg>
            </div>
          </div>

          {/* ── Network Consistency Score ─────────────────────────── */}
          <div className="rounded-2xl border border-line-divider bg-white p-6 sm:p-8">
            <div className="flex flex-wrap items-center gap-4">
              <h2 className="text-[18px] font-extrabold tracking-tight">Network Consistency</h2>
              <span className="font-mono text-[36px] font-extrabold leading-none" style={{ color: '#047857' }}>94%</span>
            </div>
            <p className="mt-3 text-[14px] leading-relaxed text-body-2">
              申请人陈述与公开网络高度自洽 · 无虚构关联 · 无资料拼凑特征
            </p>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#E5E7EB]">
              <div className="h-full rounded-full" style={{ width: '94%', background: 'linear-gradient(90deg,#047857,#10B981)' }} />
            </div>
          </div>

          {/* ── 关键发现 ─────────────────────────────────────────── */}
          <div className="rounded-2xl border border-line-divider bg-white p-6 sm:p-8">
            <h2 className="text-[18px] font-extrabold tracking-tight">关键发现 · 4 项</h2>

            <div className="mt-5 space-y-4">
              {FINDINGS.map((f, i) => (
                <div key={i} className="flex items-start gap-3 rounded-xl border border-line-divider bg-[#FAFAF8] p-4 sm:p-5">
                  <span className="mt-0.5 text-[18px]">{f.icon}</span>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[14px] font-bold" style={{ color: f.color }}>{f.title}</span>
                      <span
                        className="rounded-md px-1.5 py-0.5 font-mono text-[9px] font-bold"
                        style={{ color: f.color, background: f.color + '14' }}
                      >
                        {i + 1}/{FINDINGS.length}
                      </span>
                    </div>
                    <p className="mt-1.5 text-[13px] leading-relaxed text-body-2">{f.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── 未识别 ───────────────────────────────────────────── */}
          <div className="rounded-2xl border border-line-divider bg-white p-6 sm:p-8">
            <h2 className="text-[18px] font-extrabold tracking-tight">未识别 · Unresolved</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {[
                { label: '匿名节点', value: '0', desc: '无无法识别的关联人' },
                { label: '跨账号关联', value: '0', desc: '无多重身份 / 马甲迹象' },
                { label: '红旗共同邻居', value: '0', desc: '无共同邻居涉 LTB / 欺诈' },
              ].map((item) => (
                <div key={item.label} className="rounded-xl border border-line-divider bg-[#FAFAF8] p-4 text-center">
                  <div className="font-mono text-[28px] font-extrabold" style={{ color: '#047857' }}>{item.value}</div>
                  <div className="mt-1 text-[13px] font-bold text-body">{item.label}</div>
                  <div className="mt-0.5 text-[11px] text-body-3">{item.desc}</div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Bottom CTA ───────────────────────────────────────── */}
          <div className="flex justify-center pb-4">
            <button className="inline-flex items-center gap-2 rounded-xl border border-line-divider bg-white px-6 py-3 text-[13.5px] font-semibold text-body-2 transition hover:border-line-strong hover:shadow-sm">
              + 上传更多材料 · 重跑图
            </button>
          </div>

        </div>
      </section>

      <Footer />
    </div>
  )
}
