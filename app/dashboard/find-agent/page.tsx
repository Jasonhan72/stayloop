'use client'
// /dashboard/find-agent — Find a Field Agent (V3 section 13)
import Link from 'next/link'
import { v3, size } from '@/lib/brand'
import { useT } from '@/lib/i18n'

const AGENTS = [
  { initials: 'JH', name: 'Jason Han', score: 96, langs: 'EN · 中文', area: 'King West condos · 47 signed last 12mo · 9d avg DoM', topMatch: true },
  { initials: 'PS', name: 'Priya Sharma', score: 91, langs: 'EN · हिंदी', area: 'Liberty Village · 32 signed last 12mo · 12d avg DoM' },
  { initials: 'ML', name: 'Marcus Liu', score: 87, langs: 'EN · 中文 · 粤语', area: 'Yorkville luxury · 28 signed last 12mo · 11d avg DoM' },
]

const WEIGHTS = [
  { label: 'Area', pct: 25 },
  { label: 'Lang', pct: 20 },
  { label: 'Perf', pct: 20 },
  { label: 'Load', pct: 15 },
  { label: 'Type', pct: 10 },
  { label: 'Speed', pct: 10 },
]

export default function FindAgentPage() {
  const { lang } = useT()
  const isZh = lang === 'zh'
  return (
    <main style={{ background: v3.surfaceMuted, minHeight: '100vh' }}>
      <header style={{ background: v3.surface, borderBottom: `1px solid ${v3.border}`, padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link href="/dashboard" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, textDecoration: 'none', color: v3.textPrimary }}>
            <span style={{ display: 'inline-grid', placeItems: 'center', width: 26, height: 26, borderRadius: 7, background: v3.brand, color: '#fff', fontWeight: 800, fontSize: 14 }}>S</span>
            <span style={{ fontSize: 16, fontWeight: 700 }}>stayloop</span>
          </Link>
          <span style={{ fontSize: 18, fontWeight: 700 }}>{isZh ? '找经纪 · Find a Field Agent' : 'Find a Field Agent · 找经纪'}</span>
        </div>
        <span style={{ fontSize: 11, color: v3.textMuted }}>{isZh ? '6 因子匹配' : '6-factor matching'}</span>
      </header>

      <div style={{ maxWidth: size.content.wide, margin: '0 auto', padding: 24, display: 'grid', gridTemplateColumns: '1fr 320px', gap: 24 }} className="fa-grid">
        <section>
          <div style={{ marginBottom: 14 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 4px' }}>
              {isZh ? '为 The Hudson #1208 推荐 3 位经纪' : '3 Agents matched for The Hudson #1208'}
            </h2>
            <div style={{ fontSize: 12, color: v3.textMuted, fontFamily: 'var(--font-cn), system-ui' }}>
              {isZh ? '算法基于区域、语言、绩效、负载、物业类型、响应速度' : '区域 · 语言 · 绩效 · 负载 · 物业类型 · 响应速度'}
            </div>
          </div>

          <div style={{ background: v3.surface, border: `1px solid ${v3.border}`, borderRadius: 12, padding: 14, marginBottom: 12 }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: v3.textPrimary, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>
              {isZh ? '匹配权重 · MATCHING WEIGHTS' : 'MATCHING WEIGHTS'}
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {WEIGHTS.map((w) => (
                <div key={w.label} style={{ flex: 1, minWidth: 80, padding: '8px 10px', background: v3.surfaceMuted, borderRadius: 8 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: v3.textPrimary }}>{w.label}</div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: v3.brand, letterSpacing: '-0.02em' }}>{w.pct}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {AGENTS.map((a) => (
              <div key={a.initials} style={{ background: v3.surface, border: `1px solid ${a.topMatch ? v3.brand : v3.border}`, borderRadius: 14, padding: 16, display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ width: 48, height: 48, borderRadius: 999, background: v3.brand, color: '#fff', display: 'grid', placeItems: 'center', fontSize: 14, fontWeight: 700, flexShrink: 0 }}>{a.initials}</span>
                <div style={{ flex: 1, minWidth: 240 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 16, fontWeight: 700 }}>{a.name}</span>
                    {a.topMatch && (
                      <span style={{ fontSize: 9, fontWeight: 700, color: v3.brandStrong, background: v3.brandSoft, padding: '2px 8px', borderRadius: 999, letterSpacing: '0.08em' }}>TOP MATCH</span>
                    )}
                    <span style={{ fontSize: 11, color: v3.textMuted, fontFamily: 'var(--font-mono)' }}>RECO #4827193</span>
                  </div>
                  <div style={{ fontSize: 12, color: v3.textSecondary, marginBottom: 4 }}>{a.area}</div>
                  <div style={{ fontSize: 11, color: v3.textMuted }}>{a.langs}</div>
                </div>
                <div style={{ textAlign: 'center', flexShrink: 0 }}>
                  <div style={{ fontSize: 28, fontWeight: 800, color: v3.textPrimary, letterSpacing: '-0.02em', lineHeight: 1 }}>{a.score}</div>
                  <div style={{ fontSize: 10, color: v3.textMuted, marginTop: 2 }}>FIT</div>
                </div>
                <button style={{ padding: '8px 16px', background: v3.brand, color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600 }}>
                  {isZh ? '邀请' : 'Invite'}
                </button>
              </div>
            ))}
          </div>
        </section>

        <aside style={{ background: v3.surface, border: `1px solid ${v3.border}`, borderRadius: 14, padding: 18, alignSelf: 'start', position: 'sticky', top: 24 }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: v3.textMuted, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>
            {isZh ? '佣金预览 · COMMISSION PREVIEW' : 'COMMISSION PREVIEW'}
          </div>
          <div style={{ fontSize: 11, color: v3.textMuted, marginBottom: 4 }}>{isZh ? '总额 · 1 个月租金' : 'Total · 1 month rent'}</div>
          <div style={{ fontSize: 32, fontWeight: 800, color: v3.textPrimary, letterSpacing: '-0.025em', marginBottom: 14 }}>$2,350</div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
            {[
              { en: 'Listing Agent', zh: '挂牌经纪', val: 2000, pct: 80 },
              { en: 'Stayloop', zh: 'Stayloop', val: 350, pct: 15 },
              { en: 'Platform fee', zh: '平台费', val: 0, dash: true },
            ].map((row) => (
              <div key={row.en} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
                <span style={{ color: v3.textSecondary }}>{isZh ? row.zh : row.en}</span>
                <span style={{ fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
                  {row.dash ? '$0' : `$${row.val.toLocaleString()}`} {row.pct ? <span style={{ fontSize: 10, color: v3.textMuted, marginLeft: 4 }}>{row.pct}%</span> : null}
                </span>
              </div>
            ))}
          </div>

          <div style={{ padding: 12, background: v3.brandSoft, borderRadius: 10, fontSize: 12, color: v3.textPrimary, lineHeight: 1.5 }}>
            {isZh
              ? '用经纪不增加成本 — 总价相同。佣金对房东永远透明。'
              : 'You pay nothing extra — same total as without an agent.'}
          </div>
        </aside>
      </div>
      <style jsx>{`
        @media (max-width: 880px) { :global(.fa-grid) { grid-template-columns: 1fr !important; } }
      `}</style>
    </main>
  )
}
