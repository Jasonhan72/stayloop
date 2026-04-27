'use client'
// -----------------------------------------------------------------------------
// /passport — Verified Renter Passport (V3 section 02)
// -----------------------------------------------------------------------------
// Mirrors the V3 classic-print mockup: dark hero card with hexagon radar +
// score, "WHAT LANDLORDS SEE" claim row below. Bilingual.
// -----------------------------------------------------------------------------

import Link from 'next/link'
import { v3 } from '@/lib/brand'
import { useT } from '@/lib/i18n'

// Sample passport — replace with a fetched user-specific passport later.
const PASSPORT = {
  passportId: 'SL-2026-7G4XQ-K2N',
  initials: 'WC',
  nameZh: '陈 伟',
  nameEn: 'Wei Chen',
  verifiedDate: 'Apr 18 2026',
  score: 92,
  tierLine: { en: 'Top 8% of renters', zh: '全国前 8% 的租客' },
  // 6 axes for the hexagon radar (0-1)
  axes: [
    { key: 'income', label_zh: '收入', value: 0.95 },
    { key: 'history', label_zh: '历史', value: 0.88 },
    { key: 'identity', label_zh: '身份', value: 0.96 },
    { key: 'tenancy', label_zh: '租期', value: 0.71 },
    { key: 'credit', label_zh: '信用', value: 0.82 },
    { key: 'reference', label_zh: '推荐', value: 0.86 },
  ],
  claims: [
    {
      title_en: 'Identity verified',
      title_zh: '身份已核验',
      source: 'Persona · Government ID + Liveness',
      value: '✓',
    },
    {
      title_en: 'Income ≥ 3× rent',
      title_zh: '月收入 ≥ 3 倍租金',
      source: 'Flinks · 90 days bank data',
      value: '$8,420 / mo',
    },
    {
      title_en: 'Credit score 720+',
      title_zh: '信用评分 720+',
      source: 'Equifax Rental Connect',
      value: '748',
    },
    {
      title_en: 'No eviction record',
      title_zh: '无驱逐记录',
      source: 'Openroom · LTB cross-ref',
      value: 'Clean',
    },
  ],
}

export default function PassportPage() {
  const { lang } = useT()
  const isZh = lang === 'zh'

  return (
    <main style={{ background: v3.surface, minHeight: '100vh', padding: '24px 16px 64px' }}>
      <div style={{ maxWidth: 480, margin: '0 auto' }}>
        {/* top bar */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 16,
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: v3.textMuted,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
            }}
          >
            {isZh ? '租客护照 · VERIFIED RENTER PASSPORT' : 'VERIFIED RENTER PASSPORT'}
          </div>
          <div style={{ display: 'flex', gap: 12, color: v3.textMuted, fontSize: 16 }}>
            <button aria-label="share" style={iconBtn}>↑</button>
            <button aria-label="notifications" style={iconBtn}>🔔</button>
          </div>
        </div>

        {/* hero card (dark) */}
        <div
          style={{
            background: 'linear-gradient(180deg, #0F172A 0%, #1E293B 100%)',
            borderRadius: 18,
            padding: 20,
            color: '#fff',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {/* row: stayloop wordmark + verified pill */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
            <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: '-0.02em', color: '#fff' }}>
              stayloop
            </span>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: v3.brand,
                background: 'rgba(16, 185, 129, 0.15)',
                border: '1px solid rgba(16, 185, 129, 0.4)',
                padding: '4px 10px',
                borderRadius: 999,
              }}
            >
              ✓ VERIFIED · {PASSPORT.verifiedDate}
            </span>
          </div>

          {/* identity row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
            <div
              aria-hidden
              style={{
                width: 44,
                height: 44,
                borderRadius: 999,
                background: v3.brand,
                color: '#fff',
                display: 'grid',
                placeItems: 'center',
                fontSize: 14,
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              {PASSPORT.initials}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.01em' }}>
                {isZh ? PASSPORT.nameZh : PASSPORT.nameEn}
              </div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace' }}>
                {PASSPORT.passportId}
              </div>
            </div>
          </div>

          {/* score row: hexagon radar + big number */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ flexShrink: 0 }}>
              <HexRadar axes={PASSPORT.axes} />
            </div>
            <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: 'rgba(255,255,255,0.55)',
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  marginBottom: 4,
                }}
              >
                Stayloop Score
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, justifyContent: 'flex-end' }}>
                <span style={{ fontSize: 56, fontWeight: 800, lineHeight: 1, letterSpacing: '-0.03em', color: v3.brand }}>
                  {PASSPORT.score}
                </span>
                <span style={{ fontSize: 16, color: 'rgba(255,255,255,0.55)', fontWeight: 600 }}>/100</span>
              </div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 6, lineHeight: 1.4 }}>
                {isZh ? PASSPORT.tierLine.en : PASSPORT.tierLine.en}
                <br />
                <span style={{ color: 'rgba(255,255,255,0.5)' }}>{isZh ? PASSPORT.tierLine.zh : PASSPORT.tierLine.zh}</span>
              </div>
            </div>
          </div>
        </div>

        {/* eyebrow */}
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: v3.textMuted,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            margin: '24px 4px 12px',
          }}
        >
          {isZh ? '房东可见声明 · WHAT LANDLORDS SEE' : 'WHAT LANDLORDS SEE · 房东可见声明'}
        </div>

        {/* claim cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {PASSPORT.claims.map((c, i) => (
            <ClaimRow key={i} claim={c} isZh={isZh} />
          ))}
        </div>

        {/* footer / share + score link */}
        <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Link
            href="/score"
            style={{
              display: 'block',
              textAlign: 'center',
              fontSize: 13,
              fontWeight: 600,
              color: v3.brandStrong,
              padding: '12px 14px',
              background: v3.brandSoft,
              borderRadius: 10,
              textDecoration: 'none',
            }}
          >
            {isZh ? '查看评分构成 →' : 'See score breakdown →'}
          </Link>
          <Link
            href="/history"
            style={{
              display: 'block',
              textAlign: 'center',
              fontSize: 13,
              fontWeight: 500,
              color: v3.textSecondary,
              padding: '12px 14px',
              background: v3.surface,
              border: `1px solid ${v3.border}`,
              borderRadius: 10,
              textDecoration: 'none',
            }}
          >
            {isZh ? '租房记录' : 'Rental history'}
          </Link>
        </div>
      </div>
    </main>
  )
}

// ── Hexagon radar (SVG) ─────────────────────────────────────────────────────

function HexRadar({ axes }: { axes: Array<{ value: number }> }) {
  const cx = 70
  const cy = 70
  const r = 60
  // 6 vertices around the center (start at top)
  const points = (mult: number) =>
    axes.map((_, i) => {
      const angle = (Math.PI * 2 * i) / 6 - Math.PI / 2
      return [cx + Math.cos(angle) * r * mult, cy + Math.sin(angle) * r * mult]
    })

  const ringPath = (mult: number) =>
    points(mult).map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0]},${p[1]}`).join(' ') + ' Z'

  const dataPath = axes
    .map((a, i) => {
      const angle = (Math.PI * 2 * i) / 6 - Math.PI / 2
      const m = a.value
      return [cx + Math.cos(angle) * r * m, cy + Math.sin(angle) * r * m]
    })
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0]},${p[1]}`)
    .join(' ') + ' Z'

  return (
    <svg viewBox="0 0 140 140" width={140} height={140} aria-hidden>
      {/* 4 concentric hexagons */}
      {[0.25, 0.5, 0.75, 1].map((m) => (
        <path key={m} d={ringPath(m)} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={1} />
      ))}
      {/* spokes */}
      {axes.map((_, i) => {
        const angle = (Math.PI * 2 * i) / 6 - Math.PI / 2
        return (
          <line
            key={i}
            x1={cx}
            y1={cy}
            x2={cx + Math.cos(angle) * r}
            y2={cy + Math.sin(angle) * r}
            stroke="rgba(255,255,255,0.08)"
            strokeWidth={1}
          />
        )
      })}
      {/* data area */}
      <path d={dataPath} fill="rgba(16, 185, 129, 0.25)" stroke="#10B981" strokeWidth={1.5} />
      {/* node dots */}
      {axes.map((a, i) => {
        const angle = (Math.PI * 2 * i) / 6 - Math.PI / 2
        return (
          <circle
            key={i}
            cx={cx + Math.cos(angle) * r * a.value}
            cy={cy + Math.sin(angle) * r * a.value}
            r={2.5}
            fill="#10B981"
          />
        )
      })}
    </svg>
  )
}

// ── Claim row ───────────────────────────────────────────────────────────────

function ClaimRow({
  claim,
  isZh,
}: {
  claim: { title_en: string; title_zh: string; source: string; value: string }
  isZh: boolean
}) {
  return (
    <div
      style={{
        background: v3.surface,
        border: `1px solid ${v3.border}`,
        borderRadius: 12,
        padding: 14,
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
      }}
    >
      <div
        aria-hidden
        style={{
          width: 22,
          height: 22,
          borderRadius: 999,
          background: v3.brandSoft,
          color: v3.brandStrong,
          display: 'grid',
          placeItems: 'center',
          fontSize: 12,
          fontWeight: 700,
          flexShrink: 0,
          marginTop: 2,
        }}
      >
        ✓
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: v3.textPrimary, lineHeight: 1.3 }}>
          {isZh ? claim.title_zh : claim.title_en}
        </div>
        <div style={{ fontSize: 11, color: v3.textMuted, marginTop: 2 }}>
          {isZh ? claim.title_en : claim.title_zh}
        </div>
        <div style={{ fontSize: 11, color: v3.textFaint, marginTop: 4, fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace' }}>
          {claim.source}
        </div>
      </div>
      <div
        style={{
          fontSize: 14,
          fontWeight: 700,
          color: claim.value === '✓' || claim.value === 'Clean' ? v3.brandStrong : v3.textPrimary,
          flexShrink: 0,
          marginTop: 2,
        }}
      >
        {claim.value === '✓' ? '' : claim.value}
      </div>
    </div>
  )
}

const iconBtn: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  fontSize: 16,
  cursor: 'pointer',
  color: v3.textMuted,
}
