'use client'
// -----------------------------------------------------------------------------
// /score — Stayloop Score · Transparency dashboard (V3 section 15)
// -----------------------------------------------------------------------------
// Two columns. Left: big circular score gauge + range scale + "next band"
// insight. Right: 6-axis breakdown with weights, deltas, signals link.
// -----------------------------------------------------------------------------

import Link from 'next/link'
import { v3, size } from '@/lib/brand'
import { useT } from '@/lib/i18n'

// Sample data — would come from Verify agent later.
const SCORE = {
  total: 872,
  delta30d: 14,
  band: { label_en: 'EXCELLENT', label_zh: '优秀', range: [800, 1000] as [number, number] },
  rangeMin: 300,
  rangeMax: 1000,
  modelVersion: 'v4.2 · 2026-04',
  updatedMinutesAgo: 2,
  axes: [
    {
      key: 'income',
      title_en: 'Income stability',
      title_zh: '收入稳定性',
      weight: 25,
      score: 92,
      delta: +2,
      contributesPts: 23,
      color: '#10B981',
    },
    {
      key: 'payment',
      title_en: 'Payment history',
      title_zh: '支付记录',
      weight: 22,
      score: 88,
      delta: +5,
      contributesPts: 19,
      color: '#22C55E',
    },
    {
      key: 'identity',
      title_en: 'Identity confidence',
      title_zh: '身份置信度',
      weight: 18,
      score: 96,
      delta: 0,
      contributesPts: 17,
      color: '#0EA5E9',
    },
    {
      key: 'tenancy',
      title_en: 'Tenancy length avg',
      title_zh: '租期均长',
      weight: 15,
      score: 71,
      delta: +3,
      contributesPts: 11,
      color: '#F59E0B',
    },
    {
      key: 'credit',
      title_en: 'Credit signals',
      title_zh: '信用信号',
      weight: 12,
      score: 82,
      delta: +1,
      contributesPts: 10,
      color: '#A855F7',
    },
    {
      key: 'reference',
      title_en: 'Reference quality',
      title_zh: '推荐人质量',
      weight: 8,
      score: 86,
      delta: 0,
      contributesPts: 7,
      color: '#EC4899',
    },
  ],
  improve: [
    {
      title_en: 'Add employer reference',
      title_zh: '添加雇主推荐',
      gain: '+18 to +28',
    },
  ],
}

export default function ScorePage() {
  const { lang } = useT()
  const isZh = lang === 'zh'

  return (
    <main style={{ background: v3.surfaceMuted, minHeight: '100vh' }}>
      {/* slim header */}
      <header
        style={{
          background: v3.surface,
          borderBottom: `1px solid ${v3.border}`,
          padding: '14px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link
            href="/"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              textDecoration: 'none',
              color: v3.textPrimary,
            }}
          >
            <span aria-hidden style={iconLogo}>S</span>
            <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.02em' }}>stayloop</span>
          </Link>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 11,
              fontWeight: 700,
              color: v3.brandStrong,
              background: v3.brandSoft,
              padding: '4px 10px',
              borderRadius: 999,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
            }}
          >
            Score · {isZh ? '透明仪表盘' : 'Transparency'}
          </span>
        </div>
        <div style={{ fontSize: 12, color: v3.textMuted }}>
          {isZh ? `${SCORE.updatedMinutesAgo} 分钟前更新 · Wei Chen` : `Updated ${SCORE.updatedMinutesAgo} min ago · Wei Chen`}
        </div>
      </header>

      <div
        style={{
          maxWidth: size.content.wide,
          margin: '0 auto',
          padding: '24px',
          display: 'grid',
          gridTemplateColumns: '360px 1fr',
          gap: 24,
        }}
        className="sc-grid"
      >
        {/* LEFT — gauge */}
        <aside
          style={{
            background: v3.surface,
            border: `1px solid ${v3.border}`,
            borderRadius: 16,
            padding: 24,
            position: 'sticky',
            top: 24,
            alignSelf: 'start',
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 700, color: v3.textMuted, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
            {isZh ? '租客信用评分 · STAYLOOP SCORE' : 'STAYLOOP SCORE · 租客信用评分'}
          </div>

          <div style={{ display: 'grid', placeItems: 'center', margin: '20px 0' }}>
            <ScoreGauge score={SCORE.total} min={SCORE.rangeMin} max={SCORE.rangeMax} />
          </div>

          <div style={{ textAlign: 'center', marginBottom: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: v3.brand, letterSpacing: '0.08em' }}>
              {SCORE.band.label_en} · ↑ {SCORE.delta30d} pts
            </div>
            <div style={{ fontSize: 12, color: v3.textMuted, marginTop: 2 }}>
              {SCORE.band.label_zh} · 30 {isZh ? '天提升' : 'd improvement'} {SCORE.delta30d} {isZh ? '分' : 'pts'}
            </div>
          </div>

          {/* Range scale */}
          <RangeScale value={SCORE.total} min={SCORE.rangeMin} max={SCORE.rangeMax} />

          {/* Next band insight */}
          <div
            style={{
              marginTop: 20,
              padding: 14,
              background: v3.brandSoft,
              border: `1px solid ${v3.brandSoft}`,
              borderLeft: `3px solid ${v3.brand}`,
              borderRadius: 10,
            }}
          >
            <div style={{ fontSize: 10, fontWeight: 700, color: v3.brandStrong, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>
              {isZh ? '下一档 · NEXT BAND · 900+' : 'NEXT BAND · 900+'}
            </div>
            <div style={{ fontSize: 13, color: v3.textPrimary, lineHeight: 1.5 }}>
              {isZh
                ? '加一份雇主推荐，预计可破 900 分。'
                : 'Add a verifiable employer reference and you\u2019ll likely cross 900.'}
            </div>
          </div>
        </aside>

        {/* RIGHT — breakdown */}
        <section>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              marginBottom: 18,
              flexWrap: 'wrap',
              gap: 8,
            }}
          >
            <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', margin: 0 }}>
              {isZh ? '评分构成' : 'What\u2019s in your score'}
            </h1>
            <div style={{ fontSize: 12, color: v3.textMuted }}>
              {isZh
                ? `6 项指标 · 完全透明 · Model ${SCORE.modelVersion}`
                : `6 signals · fully transparent · Model ${SCORE.modelVersion}`}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {SCORE.axes.map((a) => (
              <AxisRow key={a.key} a={a} isZh={isZh} />
            ))}
          </div>

          {/* How to improve */}
          <div
            style={{
              marginTop: 24,
              background: v3.surface,
              border: `1px solid ${v3.border}`,
              borderRadius: 14,
              padding: 20,
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 700, color: v3.textPrimary, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 10 }}>
              {isZh ? '提升建议 · HOW TO IMPROVE' : 'HOW TO IMPROVE · 提升建议'}
            </div>
            {SCORE.improve.map((i, k) => (
              <div
                key={k}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '10px 0',
                  borderBottom: k === SCORE.improve.length - 1 ? 'none' : `1px solid ${v3.divider}`,
                  gap: 12,
                }}
              >
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: v3.textPrimary }}>
                    {isZh ? i.title_zh : i.title_en}
                  </div>
                  <div style={{ fontSize: 11, color: v3.textMuted, marginTop: 2 }}>
                    {isZh ? i.title_en : i.title_zh}
                  </div>
                </div>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: v3.brandStrong,
                    background: v3.brandSoft,
                    padding: '4px 10px',
                    borderRadius: 999,
                    flexShrink: 0,
                  }}
                >
                  {i.gain}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <style jsx>{`
        @media (max-width: 880px) {
          :global(.sc-grid) {
            grid-template-columns: 1fr !important;
          }
          :global(.sc-grid > aside) {
            position: static !important;
          }
        }
      `}</style>
    </main>
  )
}

// ── Score gauge (circular) ──────────────────────────────────────────────────

function ScoreGauge({ score, min, max }: { score: number; min: number; max: number }) {
  const pct = Math.max(0, Math.min(1, (score - min) / (max - min)))
  const r = 88
  const c = 2 * Math.PI * r
  const dash = c * pct
  return (
    <svg viewBox="0 0 220 220" width={220} height={220}>
      <circle cx={110} cy={110} r={r} fill="none" stroke={v3.divider} strokeWidth={14} />
      <circle
        cx={110}
        cy={110}
        r={r}
        fill="none"
        stroke={v3.brand}
        strokeWidth={14}
        strokeLinecap="round"
        strokeDasharray={`${dash} ${c}`}
        transform="rotate(-90 110 110)"
      />
      <text
        x={110}
        y={108}
        textAnchor="middle"
        fontSize={54}
        fontWeight={800}
        fill={v3.textPrimary}
        style={{ letterSpacing: '-0.04em' }}
      >
        {score}
      </text>
      <text
        x={110}
        y={130}
        textAnchor="middle"
        fontSize={10}
        fontWeight={700}
        fill={v3.textMuted}
        style={{ letterSpacing: '0.12em' }}
      >
        SCORE
      </text>
    </svg>
  )
}

// ── Range scale ─────────────────────────────────────────────────────────────

function RangeScale({ value, min, max }: { value: number; min: number; max: number }) {
  const pct = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100))
  const ticks = [300, 500, 700, 1000]
  return (
    <div>
      <div style={{ position: 'relative', height: 6, background: v3.divider, borderRadius: 3, marginBottom: 6 }}>
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: `${pct}%`,
            background: `linear-gradient(90deg, ${v3.warning} 0%, ${v3.brand} 60%)`,
            borderRadius: 3,
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: `${pct}%`,
            top: -4,
            transform: 'translateX(-50%)',
            width: 14,
            height: 14,
            background: '#fff',
            border: `3px solid ${v3.brand}`,
            borderRadius: 999,
          }}
        />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: v3.textMuted }}>
        {ticks.map((t) => (
          <span key={t}>{t}</span>
        ))}
      </div>
    </div>
  )
}

// ── Axis row ────────────────────────────────────────────────────────────────

function AxisRow({
  a,
  isZh,
}: {
  a: (typeof SCORE.axes)[number]
  isZh: boolean
}) {
  const pct = Math.max(0, Math.min(100, a.score))
  return (
    <div
      style={{
        background: v3.surface,
        border: `1px solid ${v3.border}`,
        borderRadius: 12,
        padding: 16,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: v3.textPrimary }}>
            {isZh ? a.title_zh : a.title_en}
          </span>
          <span style={{ fontSize: 11, color: v3.textMuted }}>
            {isZh ? a.title_en : a.title_zh}
          </span>
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: v3.textMuted,
              background: v3.divider,
              padding: '2px 8px',
              borderRadius: 999,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
            }}
          >
            weight {a.weight}%
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span style={{ fontSize: 18, fontWeight: 800, color: v3.textPrimary, letterSpacing: '-0.02em' }}>
            {a.score}
          </span>
          <span style={{ fontSize: 11, color: v3.textMuted, fontWeight: 600 }}>/100</span>
          {a.delta !== 0 && (
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: a.delta > 0 ? v3.success : v3.danger,
                marginLeft: 4,
              }}
            >
              {a.delta > 0 ? '+' : ''}{a.delta}
            </span>
          )}
        </div>
      </div>
      <div style={{ height: 6, background: v3.divider, borderRadius: 3, overflow: 'hidden', marginBottom: 8 }}>
        <div style={{ width: `${pct}%`, height: '100%', background: a.color, borderRadius: 3 }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, color: v3.textMuted }}>
        <span>
          {isZh
            ? `贡献 ${a.contributesPts} 分 (${SCORE.total > 0 ? Math.round((a.contributesPts / SCORE.total) * 100 * 10) / 10 : 0}%)`
            : `Contributes ${a.contributesPts} pts to your score`}
        </span>
        <Link
          href={`/score/signals/${a.key}`}
          style={{ color: v3.brandStrong, textDecoration: 'none', fontWeight: 600 }}
        >
          {isZh ? '查看信号 →' : 'View signals →'}
        </Link>
      </div>
    </div>
  )
}

const iconLogo: React.CSSProperties = {
  display: 'inline-grid',
  placeItems: 'center',
  width: 26,
  height: 26,
  borderRadius: 7,
  background: v3.brand,
  color: '#fff',
  fontWeight: 800,
  fontSize: 14,
}
